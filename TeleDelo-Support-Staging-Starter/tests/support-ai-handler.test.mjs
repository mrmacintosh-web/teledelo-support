import test from 'node:test';
import assert from 'node:assert/strict';
import {answerSupportQuestion,submitSupportAIFeedback} from '../src/support-ai-handler.mjs';

const identity={
  user:{id:'staff-test-customer',email:'verified@example.com',email_verified:true},
  businesses:[{id:'business-1',name:'Example HVAC',subscription_status:'active',support_eligible:true}]
};
function makeEnv() {
  const usage=[];
  const calls=[];
  const feedback=new Map();
  const env={
    AI:{async run(model,input){
      calls.push({model,input});
      return {choices:[{message:{content:'First check Business phone. Then make a test call. If the issue continues, contact human support.'}}]};
    }},
    DB:{prepare(sql){return{bind(...args){return{
      async first(){
        if(sql.includes('COUNT(*)'))return {n:usage.length};
        if(sql.includes('SELECT rating FROM ai_answer_feedback')){
          const item=feedback.get(args[0]);
          return item?.userHash===args[1]?{rating:item.rating}:null;
        }
        return null;
      },
      async run(){
        if(sql.includes('INSERT INTO throttle_events')){usage.push(args);return{meta:{changes:1}}}
        if(sql.includes('INSERT INTO ai_answer_feedback')){
          feedback.set(args[0],{userHash:args[1],createdAt:args[2],rating:null});
          return{meta:{changes:1}};
        }
        if(sql.includes('UPDATE ai_answer_feedback')){
          const item=feedback.get(args[2]);
          if(!item||item.userHash!==args[3]||item.rating!==null)return{meta:{changes:0}};
          item.rating=args[0];return{meta:{changes:1}};
        }
        return{meta:{changes:0}};
      }
    }}}}},
    RATE_LIMIT_SALT:'test-not-secret',
    SUPPORT_AUTH_MODE:'subscriber',
    SUPPORT_AI_ENABLED:'true',
    SUPPORT_ENTITLEMENTS_URL:'https://teledelo.com/auth/support/entitlements'
  };
  return {env,usage,calls,feedback};
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
  assert.match(body.answerId,/^[0-9a-f-]{36}$/);
  assert.equal(calls.length,1);
  assert.equal(calls[0].model,'@cf/google/gemma-4-26b-a4b-it');
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

test('staging AI requires a verified tester session, not an arbitrary browser email',async()=>{
 const {env,calls}=makeEnv();
 env.SUPPORT_AUTH_MODE='staging';
 env.ENVIRONMENT='staging';
 env.STAFF_EMAILS='tester@example.com';
 const input=request();
 assert.equal((await answerSupportQuestion(input,env)).status,401);
 assert.equal((await answerSupportQuestion(request(),env,{stagingEmail:'outsider@example.com'})).status,403);
 const allowed=await answerSupportQuestion(request(),env,{stagingEmail:'TeStEr@example.com'});
 assert.equal(allowed.status,200);
 assert.equal(calls.length,1);
});

test('staging AI can never run on a production environment even with its feature flag',async()=>{
 const {env,calls}=makeEnv();
 env.SUPPORT_AUTH_MODE='staging';
 env.ENVIRONMENT='production';
 env.STAFF_EMAILS='tester@example.com';
 const res=await answerSupportQuestion(request(),env,{stagingEmail:'tester@example.com'});
 assert.equal(res.status,503);
 assert.equal(calls.length,0);
});

const feedbackRequest=(answerId,rating='helpful',withCookie=true)=>
  new Request('https://teledelo.com/help/api/ai/feedback',{
    method:'POST',
    headers:{'content-type':'application/json',...(withCookie?{cookie:'td_session=opaque'}:{})},
    body:JSON.stringify({answerId,rating})
  });

test('only a verified subscriber can rate one of their own answers exactly once',async()=>{
 const {env,feedback}=makeEnv();
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json(identity);
 try{
  const asked=await answerSupportQuestion(request(),env);
  assert.equal(asked.status,200);
  const {answerId}=await asked.json();
  assert.match(answerId,/^[0-9a-f-]{36}$/);
  assert.equal(feedback.get(answerId).rating,null);
  assert.equal((await submitSupportAIFeedback(feedbackRequest(answerId),env)).status,200);
  assert.equal(feedback.get(answerId).rating,'helpful');
  assert.equal((await submitSupportAIFeedback(feedbackRequest(answerId,'unhelpful'),env)).status,409);
  assert.equal(feedback.get(answerId).rating,'helpful');
  assert.equal((await submitSupportAIFeedback(feedbackRequest(answerId,'unknown'),env)).status,400);
  assert.equal((await submitSupportAIFeedback(feedbackRequest(crypto.randomUUID()),env)).status,404);
  assert.equal((await submitSupportAIFeedback(feedbackRequest(answerId,'helpful',false),env)).status,401);
 }finally{globalThis.fetch=old}
});

test('staging AI feedback is isolated by verified email session',async()=>{
 const {env,feedback}=makeEnv();
 env.SUPPORT_AUTH_MODE='staging';env.ENVIRONMENT='staging';
 env.STAFF_EMAILS='one@example.com,two@example.com';
 const asked=await answerSupportQuestion(request(),env,{stagingEmail:'one@example.com'});
 const {answerId}=await asked.json();
 assert.ok(answerId);
 assert.equal((await submitSupportAIFeedback(feedbackRequest(answerId),env)).status,401);
 assert.equal((await submitSupportAIFeedback(feedbackRequest(answerId),env,{stagingEmail:'outsider@example.com'})).status,403);
 assert.equal((await submitSupportAIFeedback(feedbackRequest(answerId),env,{stagingEmail:'two@example.com'})).status,404);
 assert.equal((await submitSupportAIFeedback(feedbackRequest(answerId,'unhelpful'),env,{stagingEmail:'one@example.com'})).status,200);
 assert.equal(feedback.get(answerId).rating,'unhelpful');
});

test('feedback disabled by default and cannot record a rating',async()=>{
 const {env,calls}=makeEnv();
 env.SUPPORT_AI_ENABLED='false';
 const res=await submitSupportAIFeedback(feedbackRequest(crypto.randomUUID()),env);
 assert.equal(res.status,503);
 assert.equal(calls.length,0);
});
