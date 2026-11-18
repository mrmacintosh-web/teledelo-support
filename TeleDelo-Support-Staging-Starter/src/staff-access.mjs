import {cleanEmail, validEmail} from './utils.mjs';
import {now} from './form-shared.mjs';
function base64UrlDecode(str){const s=str.replace(/-/g,'+').replace(/_/g,'/');const bytes=atob(s+'='.repeat((4-s.length%4)%4));return Uint8Array.from(bytes,x=>x.charCodeAt(0))}
export async function staff(req,env,audience=env.ACCESS_AUD,emails=env.STAFF_EMAILS){if(!env.ACCESS_TEAM_DOMAIN?.endsWith('.cloudflareaccess.com')||!audience||!emails)return null;const token=req.headers.get('Cf-Access-Jwt-Assertion');if(!token)return null;try{const parts=token.split('.');if(parts.length!==3)return null;const h=JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))),p=JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));if(h.alg!=='RS256'||!h.kid)return null;const t=now();if(p.iss!==`https://${env.ACCESS_TEAM_DOMAIN}`||!Array.isArray(p.aud)||!p.aud.includes(audience)||!Number.isFinite(p.exp)||p.exp<=t||p.nbf>t)return null;const cert=await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);if(!cert.ok)return null;const jwks=await cert.json();const jwk=jwks.keys?.find(k=>k.kid===h.kid&&k.kty==='RSA');if(!jwk)return null;const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,base64UrlDecode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));if(!valid)return null;const email=cleanEmail(p.email);const allowed=emails.split(',').map(cleanEmail);return validEmail(email)&&allowed.includes(email)?email:null}catch(err){console.error('access_validation_failed',err);return null}}
async function staffAIFeedback(env){
  try{return ok(await getAIFeedbackSummary(env))}
  catch(err){
    console.error('staff_ai_feedback_unavailable',err?.message||'D1 not configured');
    return e('AI feedback is unavailable. Check the staging D1 migration.',503);
  }
}
