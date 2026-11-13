export const statuses = ['open','in_progress','waiting_customer','resolved'];
export const issues = ['calls','messages','business','receptionist','billing','login','hours','cancel','layout','payment','other'];
export function cleanEmail(v){return String(v||'').trim().toLowerCase()}
// On the public staging hostname, only approved staff test addresses can submit or sign in.
export function stagingEmailAllowed(env,email){
  if(env.ENVIRONMENT!=='staging')return true;
  const approved=String(env.STAFF_EMAILS||'').split(',').map(cleanEmail).filter(validEmail);
  return approved.includes(cleanEmail(email));
}
export function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)&&v.length<=180}
export function trimmed(v,min,max){if(typeof v!=='string')return null; const s=v.trim();return s.length>=min&&s.length<=max?s:null}
export function normalizeTicket(obj){const name=trimmed(obj.name,2,100),business=trimmed(obj.business,2,180),description=trimmed(obj.details,10,3000),email=cleanEmail(obj.email),issue=String(obj.issue||'other'),urgency=obj.urgency==='service_down'?'service_down':'normal';if(!name||!business||!description||!validEmail(email)||!issues.includes(issue))return null;return {name,business,description,email,issue,urgency}}
export function b64u(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
export function randomToken(){return b64u(crypto.getRandomValues(new Uint8Array(32)))}
export async function sha(s){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function cookieParser(req,name){const header=req.headers.get('Cookie')||'';for(const part of header.split(';')){const x=part.trim();if(x.startsWith(name+'='))return x.slice(name.length+1)}return null}
export function responseJson(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store',...extra}})}
export function csp(){return "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}
export function securityHeaders(headers){headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('Content-Security-Policy',csp());headers.set('Permissions-Policy','camera=(),microphone=(),geolocation=()')}
export function statusName(s){return ({open:'Open',in_progress:'In progress',waiting_customer:'Waiting for customer',resolved:'Resolved'})[s]||s}
export function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
