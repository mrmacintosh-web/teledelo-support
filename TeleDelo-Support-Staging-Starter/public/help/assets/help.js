
(()=>{
'use strict';
const icon=(id)=>`<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const guides=[
{id:'calls',primary:true,category:'Calls & connection',icon:'phone',title:"My calls aren't coming through",description:'Check your phone connection and find out where calls are going.',keywords:'calls not working ringing answering forwarding route connected phone number incoming calls',steps:[
{title:'Open your TeleDelo dashboard',text:'Sign in and look for Business in the left-hand menu.',tip:'On a smaller screen, you may need to open the menu first.',view:'Business',focus:'nav'},
{title:'Look for Business phone',text:'Select Business, then find the Business phone card. Check that your public number looks correct and read the connection status.',tip:'If the status says “Setup required,” the telephone connection needs attention.',view:'Business',focus:'phone'},
{title:'Make a test call',text:'Call your public business number from a different phone. Listen to where the call goes, and note what happens.',tip:"Do not change or cancel your existing phone service just to test TeleDelo.",view:'Business',focus:'phone'},
{title:'Still no answer? Request help',text:'Tell us your phone provider, what number you called, and whether the call rang, went to voicemail, or disconnected.',tip:'The Help Center support form is a prototype until connected to the backend.',view:'Business',focus:'phone'}]},
{id:'messages',primary:true,category:'Calls & messages',icon:'message',title:'I need to find a call or message',description:'Find out who called and what they needed.',keywords:'messages missed callers voicemail conversations transcript calls history phone recent notes names',steps:[
{title:'Start on Home',text:'Check “Needs your attention” and “Recent activity” for the latest customer requests.',view:'Home',focus:'attention'},
{title:'Open Conversations',text:'Choose Conversations in the menu. This is where call summaries and activity are shown in the current dashboard design.',view:'Conversations',focus:'nav'},
{title:'Look for the right caller',text:'Find the matching name, number, or call time. Select available details to review a summary or transcript, if your account provides them.',tip:'TeleDelo Lite has a simpler dashboard, so some sections or labels may look different.',view:'Conversations',focus:'messages'}]},
{id:'business',primary:true,category:'Dashboard guidance',icon:'building',title:'I need to update my business name',description:'Find the business settings and change the information you can edit.',keywords:'business company name details edit account layout company type settings',steps:[
{title:'Open Settings',text:'Choose Settings from the dashboard menu.',view:'Settings',focus:'nav'},
{title:'Find Business preferences',text:'Look for the card named “Business preferences.” It contains your business name and business layout.',view:'Settings',focus:'preferences'},
{title:'Make your change',text:'Update the business name, then select Save changes. Check for the confirmation message before leaving.',tip:'Other business details may not have an editable control in the current prototype.',view:'Settings',focus:'preferences'}]},
{id:'receptionist',primary:true,category:'Receptionist',icon:'wave',title:"My receptionist doesn't sound right",description:'Find its current voice and answering options.',keywords:'voice tone speaking wrong response behavior receptionist friendly focused language personality',steps:[
{title:'Open Receptionist',text:'In your dashboard, choose Receptionist from the left-hand menu.',view:'Receptionist',focus:'nav'},
{title:'Review the current settings',text:'Find “Voice and tone” and “When you’re closed.” Check that the displayed settings are what you expect.',view:'Receptionist',focus:'voice'},
{title:'Need something changed?',text:'If your dashboard does not offer a saved editing control for that setting, request help rather than assuming a switch has saved your change.',tip:'Some receptionist settings are still being developed and tested.',view:'Receptionist',focus:'voice'}]},
{id:'billing',primary:true,category:'Plans & billing',icon:'card',title:'I have a question about billing or minutes',description:'Check your plan, what is included, and the additional-minute rate.',keywords:'billing minutes allowance cost usage charges overage invoice payment pricing $149 $249 0.29',steps:[
{title:'Open Billing',text:'In your dashboard menu, select Billing.',view:'Billing',focus:'nav'},
{title:'Find your plan',text:'TeleDelo Lite is $149/month for eligible after-hours use under fair use. TeleDelo is $249/month with 1,000 included AI minutes.',view:'Billing',focus:'billing'},
{title:'Understand extra minutes',text:'For TeleDelo, additional minutes cost $0.29 each. Exceeding 1,000 included minutes does not, by itself, mean your calls are blocked.',tip:'If a charge looks unfamiliar, request a review before assuming it is an error.',view:'Billing',focus:'billing'}]},
{id:'login',primary:true,category:'Your account',icon:'lock',title:"I can't sign in",description:'Check your sign-in details or reset your password.',keywords:'signin log in login password forgot reset locked out access account email',steps:[
{title:'Open the sign-in page',text:'Use the email and password associated with your TeleDelo account.',view:'Login',focus:'login'},
{title:'Forgot your password?',text:'Choose “Forgot password?” on the sign-in page and follow the reset process for your account.',view:'Login',focus:'reset'},
{title:'Still locked out?',text:'Check that you are using the correct business email. If the reset link does not work, request account-access help.',tip:'Never send your password or a one-time reset code in a support request.',view:'Login',focus:'login'}]},
{id:'hours',primary:false,category:'Dashboard guidance',icon:'calendar',title:'My hours or services are wrong',description:'See where business information lives and how to request corrections.',keywords:'hours opening hours closed business services pricing information wrong update',steps:[
{title:'Open Business',text:'Choose Business from your dashboard. This is where the current design groups information used by the receptionist.',view:'Business',focus:'nav'},
{title:'Check the information you can see',text:'Review the displayed business details. Not every item is editable in the current prototype.',view:'Business',focus:'details'},
{title:'Ask us to correct anything missing',text:'If there is no clear, saved control for hours or services, request help and specify the correct information.',tip:'Do not assume changes are live until the dashboard confirms they have been saved.',view:'Business',focus:'details'}]},
{id:'cancel',primary:false,category:'Plans & billing',icon:'cancel',title:'How do I cancel my subscription?',description:'Find the cancellation option and confirm the effective date.',keywords:'cancel cancellation stop service subscription terminate close account end plan',steps:[
{title:'Open Settings',text:'In the dashboard, select Settings.',view:'Settings',focus:'nav'},
{title:'Find the Account section',text:'Look for “Cancel subscription” in the Account card. Follow the cancellation flow if it is enabled for your account.',view:'Settings',focus:'cancel'},
{title:'Check the confirmation',text:'Make sure you receive a confirmed cancellation status and the actual service end date. If you cannot finish, request help.',tip:'Starting a cancellation request does not necessarily mean service has ended.',view:'Settings',focus:'cancel'}]},
{id:'layout',primary:false,category:'Dashboard guidance',icon:'grid',title:'My dashboard looks different',description:'Understand why different businesses and plans see different menus.',keywords:'different missing features menu lite restaurant mechanic hvac plumbing settings apps absent tabs navigation',steps:[
{title:'Check which plan you use',text:'Your TeleDelo plan affects which tools are available. Lite is designed around after-hours call and message review.',view:'Billing',focus:'billing'},
{title:'Check your business layout',text:'Go to Settings, then Business preferences. The selected business layout changes some dashboard sections.',view:'Settings',focus:'preferences'},
{title:'Use the shared sections',text:'Home, Conversations, Business, and Settings are the main starting points in the current prototype. Some other menu names vary.',tip:'Do not change your business type just to reveal a menu item.',view:'Home',focus:'nav'}]},
{id:'payment',primary:false,category:'Plans & billing',icon:'card',title:'My payment didn’t go through',description:'Know what to check without entering sensitive details in a support request.',keywords:'payment failed card declined invoice bank credit payment method subscription',steps:[
{title:'Review Billing',text:'Open Billing to check the plan information visible on your account.',view:'Billing',focus:'billing'},
{title:'Check your payment notice',text:'If you received an account email about a failed payment, use only the verified TeleDelo account or secure billing link to review it.',tip:'Do not provide full card details, passwords, or verification codes in a support request.',view:'Billing',focus:'billing'},
{title:'Still need help?',text:'Use the support form to describe the billing issue without sharing sensitive payment information.',view:'Billing',focus:'billing'}]}
];
const $=id=>document.getElementById(id);let current=null,stepIndex=0,lastFocus=null, solved=false; const getGuide=id=>guides.find(g=>g.id===id);
function tile(g){return `<button type="button" class="tile" data-guide="${g.id}" aria-label="Open guide: ${g.title}"><span class="tile-icon">${icon(g.icon)}</span><span class="tile-title">${g.title}</span><span class="tile-desc">${g.description}</span><span class="tile-next">${icon('arrow')}</span></button>`}
function renderList(){const value=$('helpSearch').value.trim().toLowerCase(),found=guides.filter(g=>!value||(g.title+' '+g.description+' '+g.keywords+' '+g.category).toLowerCase().includes(value));const primary=found.filter(g=>g.primary),extra=found.filter(g=>!g.primary);$('topicGrid').innerHTML=(value?found:primary).map(tile).join('');$('topicGrid').hidden=found.length===0;$('emptyState').hidden=found.length!==0;$('matchCount').textContent=value?`${found.length} result${found.length===1?'':'s'}`:'';$('clearSearch').hidden=!value;$('moreSection').hidden=Boolean(value);$('quickLinks').innerHTML=extra.map(g=>`<button class="quick-link" type="button" data-guide="${g.id}">${icon(g.icon)}${g.title}${icon('arrow')}</button>`).join('')}
function openGuide(id,update=true){const guide=getGuide(id);if(!guide)return;current=guide;stepIndex=0;solved=false;$('homeView').hidden=true;$('guideView').hidden=false;$('guideTitle').textContent=guide.title;$('guideDescription').textContent=guide.description;if(update){const url=new URL(location.href);url.searchParams.set('guide',guide.id);history.pushState({guide:guide.id},'',url)}renderStep();window.scrollTo({top:0,behavior:'instant'})}
function goHome(update=true){current=null;$('guideView').hidden=true;$('homeView').hidden=false;if(update){const url=new URL(location.href);url.searchParams.delete('guide');history.pushState({},'',url)}window.scrollTo({top:0,behavior:'instant'});}
function visual(s){if(s.view==='Login')return `<div class="mini-sidebar"><div class="mini-brand">TeleDelo</div><div class="mini-menu on"><span class="mini-dot"></span>Sign in</div></div><div class="mini-content"><div class="mini-top"></div><div class="mini-h">Sign in</div><div class="mini-login"><div class="mini-row">Email address</div><div class="mini-input"></div><div class="mini-row">Password</div><div class="mini-input"></div><div class="mini-action">Sign in</div><div class="mini-row" style="color:#2f5f9c;${s.focus==='reset'?'outline:2px solid #6194c7;padding:5px;border-radius:4px;':''}">Forgot password?</div></div></div>`;
let items=['Home','Conversations','Receptionist','Business','Settings','Billing'];let menu=items.map(x=>`<div class="mini-menu ${x===s.view&&(s.focus==='nav'||s.focus==='messages'||s.focus==='phone'||s.focus==='billing'||s.focus==='preferences'||s.focus==='cancel'||s.focus==='voice'||s.focus==='details'||s.focus==='attention')?'on':''}"><span class="mini-dot"></span>${x}</div>`).join('');let card='';switch(s.view){case 'Home':card=`<div class="mini-card ${s.focus==='attention'?'mini-highlight':''}"><strong>Needs your attention</strong><div class="mini-row">Customer request · Follow-up needed</div></div><div class="mini-card"><strong>Recent activity</strong>Latest calls and messages</div>`;break;case 'Conversations':card=`<div class="mini-card ${s.focus==='messages'?'mini-highlight':''}"><strong>Recent conversations</strong><div class="mini-row">Caller · Today</div><div class="mini-row">Caller · Yesterday</div><div class="mini-row">Call summaries and details</div></div>`;break;case 'Business':card=`<div class="mini-card ${s.focus==='phone'?'mini-highlight':''}"><strong>Business phone</strong><div class="mini-row">Business number <span class="mini-tag">On file</span></div><div class="mini-row">Connection <em>Check status</em></div></div><div class="mini-card ${s.focus==='details'?'mini-highlight':''}"><strong>Business information</strong><div class="mini-row">Company details</div></div>`;break;case 'Settings':card=`<div class="mini-card ${s.focus==='preferences'?'mini-highlight':''}"><strong>Business preferences</strong><div class="mini-row">Business name</div><div class="mini-input" style="margin:6px 0"></div><div class="mini-row">Save changes</div></div><div class="mini-card ${s.focus==='cancel'?'mini-highlight':''}"><strong>Account</strong><div class="mini-row">Owner &amp; email</div><div class="mini-row">Cancel subscription</div></div>`;break;case 'Receptionist':card=`<div class="mini-card"><strong>Receptionist status</strong><div class="mini-row">Answer calls</div></div><div class="mini-card ${s.focus==='voice'?'mini-highlight':''}"><strong>Voice and tone</strong><div class="mini-row">Voice</div><div class="mini-row">Conversation style</div></div>`;break;case 'Billing':card=`<div class="mini-card ${s.focus==='billing'?'mini-highlight':''}"><strong>Billing</strong><div class="mini-row mini-inline"><span>TeleDelo Lite</span><span>$149/mo</span></div><div class="mini-row mini-inline"><span>TeleDelo</span><span>$249/mo</span></div><div class="mini-row mini-inline"><span>Extra minutes</span><span>$0.29/min</span></div></div>`;break;default:card=`<div class="mini-card"><strong>${s.view}</strong></div>`}
return `<div class="mini-sidebar"><div class="mini-brand">TeleDelo</div>${menu}</div><div class="mini-content"><div class="mini-top"></div><div class="mini-h">${s.view}</div>${card}</div>`}
function renderStep(){const s=current.steps[stepIndex];$('solvedPanel').hidden=!solved;$('stepContent').hidden=solved;$('stepCount').textContent=solved?'Finished':`Step ${stepIndex+1} of ${current.steps.length}`;$('stepProgress').innerHTML=current.steps.map((_,i)=>`<span class="progress-unit ${i<=stepIndex?'active':''}"></span>`).join('');$('stepNumber').textContent=String(stepIndex+1).padStart(2,'0');$('stepTitle').textContent=s.title;$('stepText').textContent=s.text;$('stepTip').hidden=!s.tip;$('stepTip').innerHTML=s.tip?`<strong>Helpful to know</strong><div>${s.tip}</div>`:'';$('mockWindow').innerHTML=visual(s);$('prevStep').hidden=solved;$('nextStep').textContent=solved?'Back to help':stepIndex===current.steps.length-1?'This helped me':'Next step →';$('prevStep').disabled=stepIndex===0;$('prevStep').style.visibility=stepIndex===0?'hidden':'visible'}
function nextStep(){if(solved){goHome();return}if(stepIndex<current.steps.length-1){stepIndex++;renderStep()}else{solved=true;renderStep()}}
function escapeText(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function openSupport(){lastFocus=document.activeElement;$('supportOverlay').hidden=false;$('formStage').hidden=false;$('previewStage').hidden=true;$('supportForm').reset();$('custIssue').value=current?.id||'other';$('custName').focus();document.body.style.overflow='hidden';loadCaptcha()}
function closeSupport(){$('supportOverlay').hidden=true;document.body.style.overflow='';lastFocus?.focus()}
function currentRequest(){const form=$('supportForm');const f=new FormData(form);const g=getGuide(f.get('issue'));return `Name: ${f.get('name')}\nEmail: ${f.get('email')}\nBusiness: ${f.get('business')}\nIssue: ${g?.title||'Something else'}\n\nWhat happened:\n${f.get('details')}`}
async function askAI(e){
  e.preventDefault();
  const question=$('helpSearch').value.trim();
  const panel=$('aiAnswerPanel'),answer=$('aiAnswerText'),submit=$('askAI');
  panel.hidden=false;
  answer.classList.remove('ai-error');
  $('aiAnswerHeading').textContent='Suggested next steps';
  $('aiAnswerDisclosure').textContent='AI-generated guidance based on general Help Center material. The assistant cannot view your account or make changes.';
  if(question.length<3){
    answer.textContent='Please describe what you need help with in at least a few words.';
    answer.classList.add('ai-error');
    $('helpSearch').focus();
    return;
  }
  answer.textContent='Finding guidance for your question…';
  submit.disabled=true;
  submit.setAttribute('aria-busy','true');
  try{
    const res=await fetch('/help/api/ai/ask',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question,consent:true})
    });
    const data=await res.json();
    if(!res.ok)throw Error(data.error||'AI guidance is unavailable right now.');
    if(typeof data.answer!=='string'||!data.answer.trim())throw Error('No guidance was returned. Please contact support.');
    answer.textContent=data.answer.trim();
    if(typeof data.disclosure==='string')$('aiAnswerDisclosure').textContent=data.disclosure;
  }catch(err){
    answer.classList.add('ai-error');
    answer.textContent=err.message||'Unable to get an AI response right now. You can still browse guides or contact our team.';
  }finally{
    submit.disabled=false;
    submit.removeAttribute('aria-busy');
  }
}
$('helpSearch').addEventListener('input',renderList);
$('aiAskForm').addEventListener('submit',askAI);
$('clearSearch').onclick=()=>{$('helpSearch').value='';renderList();$('helpSearch').focus()};
$('aiAnswerClose').onclick=()=>{$('aiAnswerPanel').hidden=true};
$('aiAnswerAgain').onclick=()=>{$('aiAnswerPanel').hidden=true;$('helpSearch').focus()};
$('aiAnswerSupport').onclick=()=>{
  const question=$('helpSearch').value.trim();
  openSupport();
  if(question)$('custDetails').value=question.slice(0,1800);
};document.addEventListener('click',e=>{const btn=e.target.closest('[data-guide]');if(btn)openGuide(btn.dataset.guide)});$('allHelp').onclick=()=>goHome();$('prevStep').onclick=()=>{stepIndex=Math.max(0,stepIndex-1);renderStep()};$('nextStep').onclick=nextStep;
$('guideSupport').onclick=openSupport;$('homeSupport').onclick=openSupport;$('emptySupport').onclick=openSupport;$('closeSupport').onclick=closeSupport;$('cancelSupport').onclick=closeSupport;$('supportOverlay').addEventListener('click',e=>{if(e.target===$('supportOverlay'))closeSupport()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('supportOverlay').hidden)closeSupport()});
$('custIssue').innerHTML=guides.map(g=>`<option value="${g.id}">${g.title}</option>`).join('')+'<option value="other">Something else</option>';

let captchaWidget=null,captchaReady=false;
async function loadCaptcha(){
  const slot=$('turnstileSlot');if(captchaReady)return;
  try{
    const res=await fetch('/help/api/config');const cfg=await res.json();
    if(!cfg.ready||!cfg.turnstileSiteKey){$('formError').hidden=false;$('formError').textContent='Support requests have not been connected yet.';return}
    if(!window.turnstile){await new Promise((resolve,reject)=>{const scr=document.createElement('script');scr.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';scr.onload=resolve;scr.onerror=reject;document.head.appendChild(scr)})}
    if(captchaWidget===null)captchaWidget=window.turnstile.render(slot,{sitekey:cfg.turnstileSiteKey});
    captchaReady=true;
  }catch(e){$('formError').hidden=false;$('formError').textContent='We could not load the support form. Please try again later.'}
}
$('supportForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=$('supportForm');if(!form.reportValidity())return;
  const f=new FormData(form);const button=form.querySelector('[type=submit]');button.disabled=true;
  $('formError').hidden=true;
  try{
    const token=captchaWidget!==null&&window.turnstile?window.turnstile.getResponse(captchaWidget):'';
    const payload={name:f.get('name'),email:f.get('email'),business:f.get('business'),issue:f.get('issue'),details:f.get('details'),urgency:f.get('urgency'),turnstileToken:token};
    const res=await fetch('/help/api/tickets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await res.json();if(!res.ok)throw Error(data.error||'Could not send request');
    $('formStage').hidden=true;$('previewStage').hidden=false;
    $('requestPreview').textContent='Ticket '+data.reference+'\n\n'+data.message+'\n\nUse My requests to check replies.';
    $('copyNotice').hidden=true;
    form.reset();if(captchaWidget!==null)window.turnstile.reset(captchaWidget);
  }catch(err){$('formError').textContent=err.message||'An error occurred';$('formError').hidden=false;if(captchaWidget!==null&&window.turnstile)window.turnstile.reset(captchaWidget)}finally{button.disabled=false}
});
$('copyRequest').onclick=closeSupport;
window.addEventListener('popstate',()=>{const id=new URL(location.href).searchParams.get('guide');if(id&&getGuide(id))openGuide(id,false);else goHome(false)});renderList();const start=new URL(location.href).searchParams.get('guide');if(start&&getGuide(start))openGuide(start,false);
})();
