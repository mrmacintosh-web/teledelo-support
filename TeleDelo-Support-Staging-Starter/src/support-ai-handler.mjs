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

export async function answerSupportQuestion(req,env) {
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

  const access=await resolveSubscriberFromBackend(req,env);
  if (!access.ok) {
    if (access.reason==='sign_in_required') return responseError('Please sign in to your TeleDelo account.',401);
    if (access.reason==='subscription_required') return responseError('An active eligible TeleDelo subscription is required.',403);
    return responseError('Unable to verify your account right now. Please try again or contact our team.',503);
  }
  if (!await allowAIRequest(env,access.identity.userId)) return responseError('AI question limit reached. Please contact our support team for help.',429);
  const messages=buildSupportAIMessages(question,SUPPORT_GUIDANCE);
  if (!messages) return responseError('AI guidance is unavailable. Please contact our team.',503);
  try {
    const output=await env.AI.run('@cf/meta/llama-3.1-8b-instruct',{
      messages, max_tokens:420, temperature:0.2
    });
    const answer=typeof output?.response==='string' ? output.response.trim() : '';
    if (!answer || answer.length>8000) throw Error('Invalid AI response');
    return responseJson({answer,disclosure:'AI-generated guidance based on general Help Center material. It cannot see your account or make changes.'});
  } catch (err) {
    console.error('support_ai_unavailable',err?.message||'AI invocation failed');
    return responseError('AI help is unavailable right now. You can still browse guides or contact our team.',503);
  }
}
