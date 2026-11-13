import {cleanEmail, sha, responseJson} from './utils.mjs';
import {supportAIEnabled,validateAISupportQuestion,buildSupportAIMessages} from './support-ai-policy.mjs';
import {resolveSubscriberFromBackend} from './subscriber-entitlements.mjs';
import {SUPPORT_GUIDANCE} from './support-knowledge.mjs';

const responseError=(msg,status)=>responseJson({error:msg},status);
const now=()=>Math.floor(Date.now()/1000);

async function allowAIRequest(env,userId) {
  if (!env.DB || !env.RATE_LIMIT_SALT) return false;
  // Throttle by verified subscriber identity; no browser-provided user IDs accepted.
  const key=await sha('support-ai-v1|'+env.RATE_LIMIT_SALT+'|'+userId);
  const recent=await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM throttle_events WHERE scope=? AND key_hash=? AND created_at>?'
  ).bind('support-ai',key,now()-86400).first();
  if ((recent?.n||0)>=20) return false;
  await env.DB.prepare(
    'INSERT INTO throttle_events(id,scope,key_hash,created_at) VALUES(?,?,?,?)'
  ).bind(crypto.randomUUID(),'support-ai',key,now()).run();
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

  let verifiedUserId;
  if (env.SUPPORT_AUTH_MODE === 'staging' && env.ENVIRONMENT === 'staging') {
    // This email is obtained from an existing verified, HttpOnly customer session
    // by worker.mjs. Never accept an email or identity from the posted JSON.
    const email=cleanEmail(stagingEmail);
    if (!email) return responseError('For this staging test, sign in through My Support Requests first.',401);
    const allowed=String(env.STAFF_EMAILS||'').split(',').map(cleanEmail).filter(Boolean);
    if (!allowed.includes(email)) return responseError('AI staging access is limited to approved testers.',403);
    verifiedUserId='staging:'+email;
  } else {
    const access=await resolveSubscriberFromBackend(req,env);
    if (!access.ok) {
      if (access.reason==='sign_in_required') return responseError('Please sign in to your TeleDelo account.',401);
      if (access.reason==='subscription_required') return responseError('An active eligible TeleDelo subscription is required.',403);
      return responseError('Unable to verify your account right now. Please try again or contact our team.',503);
    }
    verifiedUserId=access.identity.userId;
  }
  if (!await allowAIRequest(env,verifiedUserId)) return responseError('AI question limit reached. Please contact our support team for help.',429);
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
    return responseJson({answer,disclosure:'AI-generated guidance based on general Help Center material. It cannot see your account or make changes.'});
  } catch (err) {
    console.error('support_ai_unavailable',err?.message||'AI invocation failed');
    return responseError('AI help is unavailable right now. You can still browse guides or contact our team.',503);
  }
}
