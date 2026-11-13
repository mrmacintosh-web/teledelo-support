import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('Help Center search provides an opt-in AI submit action and inline results',()=>{
 const html=read('../public/help/index.html');
 assert.match(html,/id="aiAskForm"/);
 assert.match(html,/id="helpSearch"/);
 assert.match(html,/id="askAI"/);
 assert.match(html,/id="aiAnswerPanel" hidden/);
 assert.match(html,/id="aiAnswerSupport"/);
 assert.match(html,/AI processing your question/);
 assert.match(html,/help-ai\.css/);
});

test('AI question is posted only on explicit form submission',()=>{
 const js=read('../public/help/assets/help.js');
 assert.match(js,/addEventListener\('submit',askAI\)/);
 assert.match(js,/fetch\('\/help\/api\/ai\/ask'/);
 assert.match(js,/consent:true/);
 assert.match(js,/answer\.textContent=data\.answer\.trim\(\)/);
 assert.doesNotMatch(js,/answer\.innerHTML\s*=/);
 assert.match(js,/\$\('aiAnswerSupport'\)\.onclick/);
});

test('server route does not bypass standard POST origin protection',()=>{
 const js=read('../src/worker.mjs');
 const origin=js.indexOf("if(req.method==='POST'&&!originMatches(req))");
 const ai=js.indexOf("if(path==='/help/api/ai/ask'&&req.method==='POST')");
 assert.ok(origin>=0 && ai>origin);
});
