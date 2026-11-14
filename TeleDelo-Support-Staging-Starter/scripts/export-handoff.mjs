// Exports the committed, reviewed Help Center source as a portable ZIP.
// IMPORTANT: git archive reads HEAD, NOT uncommitted local Wrangler settings,
// .dev.vars, account credentials, D1 data, or installed dependencies.
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {statSync} from 'node:fs';

const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
const head=execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8'}).trim();
if(!root)throw Error('Run this from the Git checkout in Codespaces.');
const zip=resolve(root,'TeleDelo-Support-Integration-Handoff.zip');
execFileSync('git',[
  'archive','--format=zip','--prefix=TeleDelo-Support/',
  '--output='+zip,'HEAD:TeleDelo-Support-Staging-Starter'
],{cwd:root,stdio:'inherit'});
const size=(statSync(zip).size/1024).toFixed(1);
console.log('\nCreated '+zip);
console.log('Includes committed Help Center source and integration instructions, version '+head+' ('+branch+'), '+size+' KB.');
console.log('Local uncommitted Wrangler configuration, .dev.vars, keys, databases, and node_modules are NOT included.');
console.log('Give this ZIP and INTEGRATION-HANDOFF.md to Angel or his coding assistant.');
