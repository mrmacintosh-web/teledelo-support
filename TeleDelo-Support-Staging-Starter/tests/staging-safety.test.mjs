import test from 'node:test';
import assert from 'node:assert/strict';
import {stagingEmailAllowed} from '../src/utils.mjs';

test('staging permits exact staff test email addresses',()=>{
  const env={ENVIRONMENT:'staging',STAFF_EMAILS:'tester@example.com, second@example.com'};
  assert.equal(stagingEmailAllowed(env,'tester@example.com'),true);
  assert.equal(stagingEmailAllowed(env,' Second@Example.com '),true);
  assert.equal(stagingEmailAllowed(env,'other@example.com'),false);
  assert.equal(stagingEmailAllowed(env,'tester@example.com.attacker.org'),false);
});

test('staging stays closed when no test addresses are configured',()=>{
  const env={ENVIRONMENT:'staging',STAFF_EMAILS:''};
  assert.equal(stagingEmailAllowed(env,'any@example.com'),false);
});

test('production does not inherit staging-only restriction',()=>{
  assert.equal(stagingEmailAllowed({ENVIRONMENT:'production',STAFF_EMAILS:''},'customer@example.com'),true);
});

test('ordinary staging testers may sign in without getting staff privileges',()=>{
  const env={ENVIRONMENT:'staging',STAFF_EMAILS:'owner@example.com',
    STAGING_TEST_EMAILS:' angel@example.com , qa@example.com '};
  assert.equal(stagingEmailAllowed(env,'owner@example.com'),true);
  assert.equal(stagingEmailAllowed(env,'Angel@Example.com'),true);
  assert.equal(stagingEmailAllowed(env,'qa@example.com'),true);
  assert.equal(stagingEmailAllowed(env,'random@example.com'),false);
  assert.equal(env.STAFF_EMAILS.includes('angel@example.com'),false);
});

test('staging-only testers cannot authenticate elsewhere by a similar address',()=>{
  const env={ENVIRONMENT:'staging',STAFF_EMAILS:'',
    STAGING_TEST_EMAILS:'tester@example.com'};
  assert.equal(stagingEmailAllowed(env,'tester@example.com'),true);
  assert.equal(stagingEmailAllowed(env,'tester@example.com.attacker.com'),false);
  assert.equal(stagingEmailAllowed(env,'not-tester@example.com'),false);
});
