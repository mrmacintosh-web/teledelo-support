import {cleanEmail, sha, responseJson, stagingEmailAllowed} from './utils.mjs';
import {supportAIEnabled,validateAISupportQuestion,buildSupportAIMessages} from './support-ai-policy.mjs';
import {resolveSubscriberFromBackend} from './subscriber-entitlements.mjs';
import {SUPPORT_GUIDANCE} from './support-knowledge.mjs';

const responseError=(msg,status)=>responseJson({error:msg},status);
const now=()=>Math.floor(Date.now()/1000);

// Resolve a trusted identity for questions and votes. Never accept identity from posted JSON.
async function verifiedAIUser(req,env,stagingEmail) {
  let verifiedUserId;
  if (env.SUPPORT_AUTH_MODE === 'staging' && env.ENVIRONMENT === 'staging') {
    const email=cleanEmail(stagingEmail);
    if (!email) return {ok:false,status:401,error:'For this staging test, sign in through My Support Requests first.'};
    if (!stagingEmailAllowed(env,email)) return {ok:false,status:403,error:'AI staging access is limited to approved testers.'};
    verifiedUserId='staging:'+email;
  } else {
    const access=await resolveSubscriberFromBackend(req,env);
    if (!access.ok) {
      if (access.reason==='sign_in_required') return {ok:false,status:401,error:'Please sign in to your TeleDelo account.'};
      if (access.reason==='subscription_required') return {ok:false,status:403,error:'An active eligible TeleDelo subscription is required.'};
      return {ok:false,status:503,error:'Unable to verify your account right now. Please try again or contact our team.'};
    }
    verifiedUserId=access.identity.userId;
  }
  return {ok:true,keyHash:await sha('support-ai-v1|'+env.RATE_LIMIT_SALT+'|'+verifiedUserId)};
}

async function allowAIRequest(env,userKeyHash) {
  if (!env.DB || !env.RATE_LIMIT_SALT) return false;
  // Throttle by verified subscriber identity; no browser-provided user IDs accepted.
  const recent=await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM throttle_events WHERE scope=? AND key_hash=? AND created_at>?'
  ).bind('support-ai',userKeyHash,now()-86400).first();
  if ((recent?.n||0)>=20) return false;
  await env.DB.prepare(
    'INSERT INTO throttle_events(id,scope,key_hash,created_at) VALUES(?,?,?,?)'
  ).bind(crypto.randomUUID(),'support-ai',userKeyHash,now()).run();
  return true;
}

export async function answerSupportQuestion(req,env,{stagingEmail=null}={}) {
  // This handler is intentionally NOT enabled in the shipped staging configuration.
  if (!supportAIEnabled(env)) return responseError('AI help is not enabled yet. Please use a help guide or contact our team.',503);
  if (req.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return responseError('JSON required',415);
  let body;
  try {
    const raw=await req.text();
    if (raw.length>2400) return responseError('Question is too long',413);
    body=JSON.parse(raw);
  } catch { return responseError('Please enter a valid question',400); }
  const question=validateAISupportQuestion(body?.question);
  if (!question) return responseError('Enter a question between 3 and 1,000 characters',400);
  if (body?.consent!==true) return responseError('Please choose Ask AI to agree to AI processing of your question.',400);

  // Worker obtains stagingEmail from the existing verified HttpOnly session.
  const access=await verifiedAIUser(req,env,stagingEmail);
  if (!access.ok) return responseError(access.error,access.status);
  if (!await allowAIRequest(env,access.keyHash)) return responseError('AI question limit reached. Please contact our support team for help.',429);
  const messages=buildSupportAIMessages(question,SUPPORT_GUIDANCE);
  if (!messages) return responseError('AI guidance is unavailable. Please contact our team.',503);
  try {
    // The older Llama 3.1 8B model was deprecated in May 2026.
    // Gemma 4 is a currently supported Cloudflare-hosted chat model.
    const output=await env.AI.run('@cf/google/gemma-4-26b-a4b-it',{
      messages,
      max_completion_tokens:420,
      temperature:0.2,
      chat_template_kwargs:{enable_thinking:false}
    });
    const content=output?.choices?.[0]?.message?.content;
    const answer=typeof output?.response==='string' ? output.response.trim() :
      typeof content==='string' ? content.trim() :
      Array.isArray(content) ? content.filter(x=>x?.type==='text'&&typeof x.text==='string').map(x=>x.text).join('\n').trim() : '';
    if (!answer || answer.length>8000) throw Error('Invalid AI response');
    // Only store an answer ID and salted verified-user hash, not the raw
    // question, AI answer, email, account data, or caller details.
    let answerId=null;
    try {
      const id=crypto.randomUUID();
      await env.DB.prepare('INSERT INTO ai_answer_feedback(id,user_key_hash,created_at) VALUES(?,?,?)')
        .bind(id,access.keyHash,now()).run();
      answerId=id;
    } catch(err) {
      // Missing migration must not stop the already-working AI answers.
      console.error('support_ai_feedback_record_unavailable',err?.message||'D1 unavailable');
    }
    return responseJson({answer,answerId,disclosure:'AI-generated guidance based on general Help Center material. It cannot see your account or make changes.'});
  } catch (err) {
    console.error('support_ai_unavailable',err?.message||'AI invocation failed');
    return responseError('AI help is unavailable right now. You can still browse guides or contact our team.',503);
  }
}

/** One helpful/unhelpful vote per answer, attached only to a verified user hash. */
export async function submitSupportAIFeedback(req,env,{stagingEmail=null}={}) {
  if (!supportAIEnabled(env)) return responseError('AI feedback is not enabled yet.',503);
  if (req.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return responseError('JSON required',415);
  let body;
  try {
    const raw=await req.text();
    if (raw.length>300) return responseError('Feedback request is too large',413);
    body=JSON.parse(raw);
  } catch { return responseError('Invalid feedback request',400); }
  const id=body?.answerId,rating=body?.rating;
  if (typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||
      !['helpful','unhelpful'].includes(rating)) return responseError('Invalid feedback',400);
  const access=await verifiedAIUser(req,env,stagingEmail);
  if (!access.ok) return responseError(access.error,access.status);
  try {
    const recorded=await env.DB.prepare(
      'UPDATE ai_answer_feedback SET rating=?,rated_at=? WHERE id=? AND user_key_hash=? AND rating IS NULL AND created_at>?'
    ).bind(rating,now(),id,access.keyHash,now()-7*86400).run();
    if (recorded.meta?.changes) return responseJson({message:'Thanks for the feedback.'});
    const exists=await env.DB.prepare(
      'SELECT rating FROM ai_answer_feedback WHERE id=? AND user_key_hash=? AND created_at>?'
    ).bind(id,access.keyHash,now()-7*86400).first();
    return exists?.rating ? responseError('Feedback already recorded for this answer.',409) :
      responseError('This answer is no longer available for feedback.',404);
  } catch(err) {
    console.error('support_ai_feedback_save_failed',err?.message||'D1 unavailable');
    return responseError('Could not save feedback right now. Please try again.',503);
  }
}
