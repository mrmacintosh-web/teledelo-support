import test from 'node:test';
import assert from 'node:assert/strict';
import {
 normalizeSubscriberEntitlements, authorizeSubscriberBusiness,
 trustedEntitlementEndpoint, resolveSubscriberFromBackend
} from '../src/subscriber-entitlements.mjs';

const eligible = {
 user:{id:'user-123',email:'Owner@Example.com',email_verified:true},
 businesses:[
  {id:'biz-1',name:'Example HVAC',subscription_status:'active',support_eligible:true},
  {id:'biz-2',name:'Expired Shop',subscription_status:'canceled',support_eligible:true},
  {id:'biz-3',name:'Free Account',subscription_status:'active',support_eligible:false}
 ]
};
const request = new Request('https://teledelo.com/help/',{headers:{cookie:'td_session=opaque'}});

test('only server-confirmed active paid businesses are eligible',()=>{
 const identity=normalizeSubscriberEntitlements(eligible);
 assert.equal(identity.userId,'user-123');
 assert.equal(identity.email,'owner@example.com');
 assert.deepEqual(identity.businesses,[{id:'biz-1',name:'Example HVAC'}]);
 assert.equal(authorizeSubscriberBusiness(identity,'biz-1')?.name,'Example HVAC');
 assert.equal(authorizeSubscriberBusiness(identity,'biz-2'),null);
 assert.equal(authorizeSubscriberBusiness(identity,'another-business'),null);
});

test('invalid identity and unverified email fail closed',()=>{
 assert.equal(normalizeSubscriberEntitlements({...eligible,user:{...eligible.user,email_verified:false}}),null);
 assert.equal(normalizeSubscriberEntitlements({...eligible,user:{email:'owner@example.com'}}),null);
 assert.equal(normalizeSubscriberEntitlements({user:eligible.user,businesses:{}}),null);
 assert.equal(normalizeSubscriberEntitlements({user:eligible.user,businesses:[{id:'a',name:'Test',subscription_status:'active',support_eligible:'true'}]}).businesses.length,0);
});

test('only TeleDelo HTTPS entitlement URL can be configured',()=>{
 assert.equal(trustedEntitlementEndpoint('https://teledelo.com/auth/support/entitlements'),'https://teledelo.com/auth/support/entitlements');
 for(const url of [
  'http://teledelo.com/auth/support/entitlements',
  'https://attacker.test/auth/support/entitlements',
  'https://teledelo.com.attacker.test/auth/support/entitlements',
  'https://teledelo.com/anything',
  'https://teledelo.com/auth/support/entitlements?other=1'
 ]) assert.equal(trustedEntitlementEndpoint(url),null,url);
});

test('backend identity is verified on the server without trusting form claims',async()=>{
 let called=0;
 const fetchStub=async(url,opts)=>{
  called+=1;
  assert.equal(url,'https://teledelo.com/auth/support/entitlements');
  assert.equal(opts.headers.cookie,'td_session=opaque');
  assert.equal(opts.redirect,'manual');
  return Response.json(eligible);
 };
 const result=await resolveSubscriberFromBackend(request,{
  SUPPORT_ENTITLEMENTS_URL:'https://teledelo.com/auth/support/entitlements'
 },fetchStub);
 assert.equal(result.ok,true);
 assert.equal(result.identity.businesses.length,1);
 assert.equal(called,1);
});

test('missing session, rejection, outage, and redirect never authorize',async()=>{
 const config={SUPPORT_ENTITLEMENTS_URL:'https://teledelo.com/auth/support/entitlements'};
 const noCookie=await resolveSubscriberFromBackend(new Request('https://teledelo.com/help/'),config,async()=>{throw Error('should not fetch')});
 assert.equal(noCookie.reason,'sign_in_required');
 for(const status of [302,403,500]){
  const result=await resolveSubscriberFromBackend(request,config,async()=>new Response(null,{status}));
  assert.equal(result.ok,false);
 }
 const outage=await resolveSubscriberFromBackend(request,config,async()=>{throw Error('network error')});
 assert.equal(outage.ok,false);
});
