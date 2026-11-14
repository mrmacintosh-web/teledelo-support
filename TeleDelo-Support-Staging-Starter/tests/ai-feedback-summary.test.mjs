import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {getAIFeedbackSummary} from '../src/ai-feedback-summary.mjs';

function makeEnv(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../migrations/0002_ai_answer_feedback.sql',import.meta.url),'utf8'));
 return {
   DB:{prepare(sql){return {bind(...args){const q=db.prepare(sql);return {async first(){return q.get(...args)}}}}}},
   db
 };
}
const epoch=2000000000;
function insert(db,id,key,rating,daysAgo=0){
 const at=epoch-daysAgo*86400;
 db.prepare('INSERT INTO ai_answer_feedback(id,user_key_hash,rating,created_at,rated_at) VALUES(?,?,?,?,?)')
  .run(id,key,rating,at,rating?at:null);
}

test('AI staff summary counts answer votes and distinct voters separately',async()=>{
 const {DB,db}=makeEnv();
 insert(db,'a','customer-one','helpful');
 insert(db,'b','customer-one','helpful');
 insert(db,'c','customer-one','unhelpful');
 insert(db,'d','customer-two','unhelpful');
 insert(db,'e','customer-three',null);
 const summary=await getAIFeedbackSummary({DB},epoch);
 assert.deepEqual(summary,{
   periodDays:30,total:4,helpful:2,unhelpful:2,
   helpfulRaters:1,unhelpfulRaters:2,uniqueRaters:2,helpfulPercent:50
 });
 db.close();
});

test('AI feedback summary excludes old ratings and unrated answers',async()=>{
 const {DB,db}=makeEnv();
 insert(db,'a','recent','helpful',2);
 insert(db,'b','old','unhelpful',33);
 insert(db,'c','unrated',null,1);
 const summary=await getAIFeedbackSummary({DB},epoch);
 assert.equal(summary.total,1);
 assert.equal(summary.helpful,1);
 assert.equal(summary.unhelpful,0);
 assert.equal(summary.helpfulPercent,100);
 db.close();
});

test('empty feedback summary reports zero counts and no helpful percentage',async()=>{
 const {DB,db}=makeEnv();
 assert.deepEqual(await getAIFeedbackSummary({DB},epoch),{
   periodDays:30,total:0,helpful:0,unhelpful:0,
   helpfulRaters:0,unhelpfulRaters:0,uniqueRaters:0,helpfulPercent:null
 });
 db.close();
});

test('AI feedback staff route is after verified Cloudflare Access guard',()=>{
 const s=readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');
 const guard=s.indexOf("if(path.startsWith('/help/admin')){const id=await staff(req,env)");
 const adminRoute=s.indexOf("if(path.startsWith('/help/admin/api/'))");
 const feedback=s.indexOf("if(path==='/help/admin/api/ai-feedback'");
 assert.ok(guard>=0 && adminRoute>guard && feedback>0);
 assert.match(s,/if\(!id\)return e\('Staff sign-in required/);
});

test('staff portal displays AI vote metrics with helpful rate and unique raters',()=>{
 const html=readFileSync(new URL('../public/help/admin/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/help/admin/admin.js',import.meta.url),'utf8');
 for(const id of ['aiStats','aiHelpfulVotes','aiUnhelpfulVotes','aiHelpfulRate','aiTotalVotes','aiHelpfulPeople','aiUnhelpfulPeople','aiTotalPeople']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/Last 30 days/);
 assert.match(js,/api\('ai-feedback'\)/);
 assert.match(js,/\.textContent=format\(d\.helpful\)/);
 assert.match(js,/await loadAIStats\(\)/);
});
