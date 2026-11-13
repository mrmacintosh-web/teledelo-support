import test from 'node:test';
import assert from 'node:assert/strict';
import {answerSupportQuestion} from '../src/support-ai-handler.mjs';

const identity={
  user:{id:'staff-test-customer',email:'verified@example.com',email_verified:true},
  businesses:[{id:'business-1',name:'Example HVAC',subscription_status:'active',support_eligible:true}]
};
function makeEnv() {
  const usage=[];
  const calls=[];
  const env={
    AI:{async run(model,input){
      calls.push({model,input});
      return {response:'First check Business phone. Then make a test call. If the issue continues, contact human support.'};
    }},
    DB:{prepare(sql){return{bind(...args){return{
      async first(){return {n:usage.length}},
      async run(){usage.push(args);return{meta:{changes:1}}}
    }}}}},
    RATE_LIMIT_SALT:'test-not-secret',
    SUPPORT_AUTH_MODE:'subscriber',
    SUPPORT_AI_ENABLED:'true',
    SUPPORT_ENTITLEMENTS_URL:'https://teledelo.com/auth/support/entitlements'
  };
  return {env,usage,calls};
}
const request=(question='Calls are not coming through',consent=true,withCookie=true)=>
  new Request('https://teledelo.com/help/api/ai/ask',{
    method:'POST',
    headers:{'content-type':'application/json',...(withCookie?{cookie:'td_session=opaque'}:{})},
    body:JSON.stringify({question,consent})
  });

test('feature is disabled by default and cannot call AI',async()=>{
 const {env,calls}=makeEnv();
 env.SUPPORT_AI_ENABLED='false';
 const res=await answerSupportQuestion(request(),env);
 assert.equal(res.status,503);
 assert.equal(calls.length,0);
});

test('questions require explicit opt-in and reasonable length',async()=>{
 const {env,calls}=makeEnv();
 assert.equal((await answerSupportQuestion(request('A normal question',false),env)).status,400);
 assert.equal((await answerSupportQuestion(request(' x ',true),env)).status,400);
 assert.equal(calls.length,0);
});

test('paid verified customers get grounded guidance only after checking existing session',async()=>{
 const {env,calls,usage}=makeEnv();
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json(identity);
 try{
  const res=await answerSupportQuestion(request(),env);
  assert.equal(res.status,200);
  const body=await res.json();
  assert.match(body.answer,/Business phone/);
  assert.match(body.disclosure,/cannot see your account/);
  assert.equal(calls.length,1);
  assert.match(calls[0].model,/^@cf\//);
  assert.match(calls[0].input.messages[0].content,/Calls not coming through/);
  assert.equal(usage.length,1);
 }finally{globalThis.fetch=old}
});

test('signed-out, ineligible, and backend errors fail closed',async()=>{
 const {env,calls}=makeEnv();
 assert.equal((await answerSupportQuestion(request('A question',true,false),env)).status,401);
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(null,{status:403});
  assert.equal((await answerSupportQuestion(request(),env)).status,403);
  globalThis.fetch=async()=>new Response(null,{status:500});
  assert.equal((await answerSupportQuestion(request(),env)).status,503);
  assert.equal(calls.length,0);
 }finally{globalThis.fetch=old}
});

test('per-subscriber daily AI cap prevents unlimited inference',async()=>{
 const {env,calls,usage}=makeEnv();
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json(identity);
 try{
  for(let n=0;n<20;n++){
    const res=await answerSupportQuestion(request(),env);
    assert.equal(res.status,200);
  }
  const res=await answerSupportQuestion(request(),env);
  assert.equal(res.status,429);
  assert.equal(calls.length,20);
  assert.equal(usage.length,20);
 }finally{globalThis.fetch=old}
});
