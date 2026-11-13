import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldDispatchNotifications} from '../src/notification-trigger.mjs';

const req=(path,method='POST')=>new Request('https://support.example.test'+path,{method});
const ok=new Response(null,{status:201});
const fail=new Response(null,{status:403});

test('successful customer ticket submissions dispatch notifications immediately',()=>{
  assert.equal(shouldDispatchNotifications(req('/help/api/tickets'),ok),true);
  assert.equal(shouldDispatchNotifications(req('/help/api/tickets/'),ok),true);
});

test('successful customer and staff replies dispatch notifications immediately',()=>{
  const ref='TD-ABCDEF1234';
  assert.equal(shouldDispatchNotifications(req('/help/api/tickets/'+ref+'/reply'),new Response(null,{status:200})),true);
  assert.equal(shouldDispatchNotifications(req('/help/admin/api/tickets/'+ref+'/reply'),new Response(null,{status:200})),true);
  assert.equal(shouldDispatchNotifications(req('/help/admin/api/tickets/'+ref+'/status'),new Response(null,{status:200})),true);
});

test('failed calls, GET requests and unrelated endpoints never dispatch mail',()=>{
  assert.equal(shouldDispatchNotifications(req('/help/api/tickets'),fail),false);
  assert.equal(shouldDispatchNotifications(req('/help/api/tickets','GET'),ok),false);
  assert.equal(shouldDispatchNotifications(req('/help/api/auth/request'),ok),false);
  assert.equal(shouldDispatchNotifications(req('/help/admin/api/test-email'),ok),false);
  assert.equal(shouldDispatchNotifications(req('/help/api/tickets/INVALID/reply'),ok),false);
});
