import test from 'node:test';
import assert from 'node:assert/strict';
import {supportAIEnabled,validateAISupportQuestion,buildSupportAIMessages} from '../src/support-ai-policy.mjs';

test('AI stays off unless subscriber auth, explicit enable flag, and binding exist',()=>{
 const AI={run:async()=>({response:'test'})};
 assert.equal(supportAIEnabled({SUPPORT_AI_ENABLED:'true',SUPPORT_AUTH_MODE:'subscriber',AI}),true);
 assert.equal(supportAIEnabled({SUPPORT_AI_ENABLED:'false',SUPPORT_AUTH_MODE:'subscriber',AI}),false);
 assert.equal(supportAIEnabled({SUPPORT_AI_ENABLED:'true',SUPPORT_AUTH_MODE:'staging',AI}),false);
 assert.equal(supportAIEnabled({SUPPORT_AI_ENABLED:'true',SUPPORT_AUTH_MODE:'subscriber'}),false);
});

test('AI questions and approved knowledge have strict size limits',()=>{
 assert.equal(validateAISupportQuestion('Hello'), 'Hello');
 assert.equal(validateAISupportQuestion('  '),null);
 assert.equal(validateAISupportQuestion('A'.repeat(1001)),null);
 assert.equal(buildSupportAIMessages('Hello',''),null);
 assert.equal(buildSupportAIMessages('Hello','A'.repeat(24001)),null);
});

test('AI prompt is grounded in approved material and offers human help',()=>{
 const messages=buildSupportAIMessages('Where can I view my calls?', 'Navigate to Calls in the dashboard.');
 assert.equal(messages.length,2);
 assert.match(messages[0].content,/ONLY the APPROVED SUPPORT MATERIAL/);
 assert.match(messages[0].content,/human support/);
 assert.match(messages[0].content,/Never invent TeleDelo features/);
 assert.match(messages[0].content,/Navigate to Calls/);
 assert.equal(messages[1].content,'Where can I view my calls?');
});
