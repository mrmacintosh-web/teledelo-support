import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('Help Center search includes consent, inline AI answer, related guides and feedback controls',()=>{
 const html=read('../public/help/index.html');
 for(const id of ['aiAskForm','helpSearch','askAI','aiAnswerPanel','aiAnswerSupport','aiRelatedGuides','aiRelatedLinks','aiFeedbackYes','aiFeedbackNo']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/AI processing your question/);
 assert.match(html,/help-ai\.css/);
});

test('AI calls only on submit, feedback only on button click, and suggestions use safe text',()=>{
 const js=read('../public/help/assets/help.js');
 assert.match(js,/addEventListener\('submit',askAI\)/);
 assert.match(js,/fetch\('\/help\/api\/ai\/ask'/);
 assert.match(js,/consent:true/);
 assert.match(js,/answer\.textContent=data\.answer\.trim\(\)/);
 assert.doesNotMatch(js,/answer\.innerHTML\s*=/);
 assert.match(js,/fetch\('\/help\/api\/ai\/feedback'/);
 assert.match(js,/sendAIFeedback\('helpful'\)/);
 assert.match(js,/sendAIFeedback\('unhelpful'\)/);
 assert.match(js,/recommendAIGuides\(question\)/);
 assert.match(js,/button\.dataset\.guide=g\.id/);
 assert.match(js,/button\.append\(title,desc\)/);
 assert.match(js,/I tried the TeleDelo AI Help Center/);
 assert.doesNotMatch(js,/button\.innerHTML\s*=/);
});

test('AI endpoints remain behind the standard POST origin protection',()=>{
 const js=read('../src/worker.mjs');
 const origin=js.indexOf("if(req.method==='POST'&&!originMatches(req))");
 const ai=js.indexOf("if((path==='/help/api/ai/ask'||path==='/help/api/ai/feedback')&&req.method==='POST')");
 assert.ok(origin>=0 && ai>origin);
 assert.match(js,/submitSupportAIFeedback\(req,env,\{stagingEmail\}\)/);
});
