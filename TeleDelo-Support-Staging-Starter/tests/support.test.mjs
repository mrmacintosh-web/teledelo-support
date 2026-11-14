import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.mjs';
import {normalizeTicket,escapeHtml,randomToken} from '../src/utils.mjs';

function makeDB(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_tickets.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../migrations/0002_ai_answer_feedback.sql',import.meta.url),'utf8'));return {
 prepare(sql){return {bind(...args){const stmt=db.prepare(sql);return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:stmt.run(...args).changes}})}}}},
 async batch(queries){db.exec('BEGIN');try{const r=[];for(const q of queries)r.push(await q.run());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}},
 connection:db};}
function env(){const DB=makeDB();const sent=[];return {DB,EMAIL:{async send(m){sent.push(m);return {messageId:'m1'}}},sent,ASSETS:{async fetch(){return new Response('asset')}} ,TURNSTILE_SITE_KEY:'test_site',TURNSTILE_SECRET:'test_secret',PUBLIC_ORIGIN:'https://support.example.test',RATE_LIMIT_SALT:'test_salt',FROM_EMAIL:'notifications@example.test',REPLY_TO_EMAIL:'support@example.test',STAFF_NOTIFY_EMAIL:'staff@example.test',STAFF_EMAILS:'staff@example.test'} }
const req=(path,method='GET',body,extra={})=>new Request('https://support.example.test'+path,{method,headers:{'content-type':'application/json','origin':'https://support.example.test','CF-Connecting-IP':'203.0.113.10',...extra},...(body?{body:JSON.stringify(body)}:{})});

test('validation rejects invalid emails and oversized descriptions',()=>{
 assert.equal(normalizeTicket({name:'Alice',business:'Garage',email:'bad',issue:'calls',details:'My calls are failing.'}),null);
 assert.equal(normalizeTicket({name:'Alice',business:'Garage',email:'a@b.com',issue:'calls',details:'Hi'}),null);
 assert.equal(escapeHtml('<script>'),'&lt;script&gt;');assert.ok(randomToken().length>40);
});

test('public flow authenticates by email, isolates tickets, and blocks staff access',async()=>{
 const oldFetch=globalThis.fetch;globalThis.fetch=async(url)=>{
  if(String(url).includes('siteverify'))return Response.json({success:true});
  throw Error('unmocked fetch '+url);
 };
 try{
  const x=env();
  const backgroundJobs=[];
  const context={waitUntil(promise){backgroundJobs.push(promise)}};
  const payload={name:'Alice Smith',business:'Test Auto Repair',email:'ALICE@example.com',issue:'calls',details:'Our forwarded calls do not reach the receptionist.',urgency:'service_down',turnstileToken:'valid'};
  const created=await worker.fetch(req('/help/api/tickets','POST',payload),x,context);assert.equal(created.status,201);const {reference}=await created.json();assert.match(reference,/^TD-[A-F0-9]{10}$/);
  assert.equal(backgroundJobs.length,1,'a background notification job should be scheduled');
  await Promise.all(backgroundJobs.splice(0));
  assert.match(x.sent.map(m=>m.subject).join('|'),/We received your request/);
  assert.match(x.sent.map(m=>m.subject).join('|'),/New support request/);
  const notAuthed=await worker.fetch(req('/help/api/tickets'),x);assert.equal(notAuthed.status,401);
  const badOrigin=await worker.fetch(req('/help/api/tickets','POST',payload,{origin:'https://evil.example'}),x);assert.equal(badOrigin.status,403);
  const noAdmin=await worker.fetch(req('/help/admin/api/tickets'),x);assert.equal(noAdmin.status,403);
  assert.equal((await x.DB.connection.prepare('SELECT COUNT(*) AS n FROM tickets').get()).n,1);
  const signIn=await worker.fetch(req('/help/api/auth/request','POST',{email:'ALICE@example.com',turnstileToken:'valid'}),x);assert.equal(signIn.status,200);
  const authMail=x.sent.find(m=>m.subject.includes('sign-in'));assert.ok(authMail);
  const link=authMail.text.match(/https:\/\/[^\s]+/)[0];const u=new URL(link);
  const openedLink=await worker.fetch(req(u.pathname+u.search),x);assert.equal(openedLink.status,200);
  const exchange=await worker.fetch(req('/help/api/auth/exchange','POST',{token:u.searchParams.get('auth')}),x);assert.equal(exchange.status,200);
  const ck=exchange.headers.get('set-cookie').split(';')[0];assert.ok(ck.startsWith('td_support_session='));
  const secondExchange=await worker.fetch(req('/help/api/auth/exchange','POST',{token:u.searchParams.get('auth')}),x);assert.equal(secondExchange.status,401);
  const sessionHeaders={'cookie':ck};
  // A real staging AI beta requires the same verified customer session,
  // plus exact inclusion in the configured staff tester allowlist.
  x.ENVIRONMENT='staging';x.SUPPORT_AUTH_MODE='staging';x.SUPPORT_AI_ENABLED='true';
  x.STAFF_EMAILS='staff@example.test,alice@example.com';
  x.AI={async run(){return {choices:[{message:{content:'Check Business phone in your dashboard. Then make a test call.'}}]}}};
  const aiReq={question:'Why are my calls not coming through?',consent:true};
  const noAIAuth=await worker.fetch(req('/help/api/ai/ask','POST',aiReq),x);
  assert.equal(noAIAuth.status,401);
  const aiReply=await worker.fetch(req('/help/api/ai/ask','POST',aiReq,sessionHeaders),x);
  assert.equal(aiReply.status,200);
  const aiAnswer=await aiReply.json();
  assert.match(aiAnswer.answer,/Business phone/);
  assert.match(aiAnswer.answerId,/^[a-f0-9-]{36}$/);
  const wrongOrigin=await worker.fetch(req('/help/api/ai/feedback','POST',{answerId:aiAnswer.answerId,rating:'helpful'},{...sessionHeaders,origin:'https://evil.example'}),x);
  assert.equal(wrongOrigin.status,403);
  const vote=await worker.fetch(req('/help/api/ai/feedback','POST',{answerId:aiAnswer.answerId,rating:'helpful'},sessionHeaders),x);
  assert.equal(vote.status,200);
  const duplicate=await worker.fetch(req('/help/api/ai/feedback','POST',{answerId:aiAnswer.answerId,rating:'unhelpful'},sessionHeaders),x);
  assert.equal(duplicate.status,409);
  assert.equal(x.DB.connection.prepare('SELECT rating FROM ai_answer_feedback WHERE id=?').get(aiAnswer.answerId).rating,'helpful');
  const tickets=await (await worker.fetch(req('/help/api/tickets','GET',null,sessionHeaders),x)).json();assert.equal(tickets.tickets.length,1);
  const reply=await worker.fetch(req(`/help/api/tickets/${reference}/reply`,'POST',{message:'I tested another phone.'},sessionHeaders),x,context);assert.equal(reply.status,200);
  assert.equal(backgroundJobs.length,1,'a customer reply should schedule its staff notification');
  await Promise.all(backgroundJobs.splice(0));
  assert.match(x.sent.map(m=>m.subject).join('|'),/Customer replied/);
  const detail=await (await worker.fetch(req(`/help/api/tickets/${reference}`,'GET',null,sessionHeaders),x)).json();assert.equal(detail.messages.length,2);
  const logout=await worker.fetch(req('/help/api/logout','POST',{},sessionHeaders),x);assert.equal(logout.status,200);
  const postLogout=await worker.fetch(req('/help/api/me','GET',null,sessionHeaders),x);assert.equal(postLogout.status,401);
  await worker.scheduled({},x);
  const sent=x.sent.map(m=>m.subject).join('|');assert.match(sent,/We received your request/);assert.match(sent,/New support request/);assert.match(sent,/Customer replied/);
 }finally{globalThis.fetch=oldFetch}
});

test('unauthorized customer cannot access another customer ticket',async()=>{
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({success:true});
 try{
  const x=env(),b={name:'Bob Brown',business:'Bob Plumbing',email:'bob@example.com',issue:'business',details:'Our contact details are wrong.',turnstileToken:'x'};
  const created=await (await worker.fetch(req('/help/api/tickets','POST',b),x)).json();
  await worker.fetch(req('/help/api/auth/request','POST',{email:'someoneelse@example.com',turnstileToken:'x'}),x);
  const link=x.sent.at(-1).text.match(/https:\/\/[^\s]+/)[0];const u=new URL(link),login=await worker.fetch(req('/help/api/auth/exchange','POST',{token:u.searchParams.get('auth')}),x),cookie=login.headers.get('set-cookie').split(';')[0];
  const detail=await worker.fetch(req('/help/api/tickets/'+created.reference,'GET',null,{cookie}),x);assert.equal(detail.status,404);
 }finally{globalThis.fetch=oldFetch}
});
