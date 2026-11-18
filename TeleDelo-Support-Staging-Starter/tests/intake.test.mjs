import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Miniflare } from 'miniflare';
import worker from '../src/worker.mjs';
import { createSupportGateway } from '../../vercel-integration/lib/support-gateway.mjs';

const direct = 'https://staging.example.test';
const publicOrigin = 'https://preview.example.test';
const configured = {
  ENVIRONMENT: 'staging',
  PUBLIC_ORIGIN: direct,
  SUPPORT_PUBLIC_ORIGIN: publicOrigin,
  SUPPORT_WORKER_ORIGIN: direct,
  INTAKE_ENABLED: 'true',
  INTAKE_PRIVACY_POLICY_URL: 'https://example.test/policy',
  RATE_LIMIT_SALT: 'test fixtures for rate limit only - 30',
  PRIVACY_VERIFY_SECRET: 'test fixtures for verification only - 31',
  SUPPORT_PROXY_SECRET: 'test fixtures for gateway only - 32',
  TURNSTILE_SITE_KEY: 'fixture',
  TURNSTILE_SECRET: 'fixture',
  FROM_EMAIL: 'notifications@example.test',
  STAFF_NOTIFY_EMAIL: 'support@teledelo.com',
  STAGING_TEST_EMAILS: 'alex@example.test',
  ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
  ACCESS_AUD: 'support-fixture',
  STAFF_EMAILS: 'support-staff@example.test',
  INTAKE_ACCESS_AUD: 'intake-fixture',
  INTAKE_STAFF_EMAILS: 'sales-staff@example.test',
  PRIVACY_ACCESS_AUD: 'privacy-fixture',
  PRIVACY_STAFF_EMAILS: 'privacy-staff@example.test',
  INTAKE_STAGING_NOTIFICATION_MODE: 'departments',
  DEMO_FOUNDER_EMAILS: 'one@example.test,two@example.test,HELLO@teledelo.com',
  PRIVACY_RETENTION_DAYS: '10',
  WAITLIST_RETENTION_DAYS: '10',
  DEMO_RETENTION_DAYS: '10',
};
const person = { name: 'Alex Fictional', email: 'alex@example.test', turnstileToken: 'valid' };
const waitlist = { ...person, business: 'Example Auto', location: 'Example Town', phone: '555 0101', plan: 'pro', consent: true };
const demo = { ...person, business: 'Example Auto', demo_topic: 'Call handling', details: 'Reference notes in protected storage' };
const privacy = { ...person, request_type: 'delete', details: 'Private details in protected storage' };
const jwtEncode = value => Buffer.from(value).toString('base64url');

test('the shared Worker stores, deduplicates and notifies all three intakes on local D1', async t => {
  const miniflare = new Miniflare({
    modules: true, script: 'export default {fetch(){return new Response("OK")}}', d1Databases: ['DB'],
  });
  t.after(() => miniflare.dispose());
  const db = await miniflare.getD1Database('DB');
  for (const file of ['0001_tickets.sql', '0002_ai_answer_feedback.sql', '0003_public_intake.sql']) {
    await db.batch(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8')
      .replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  }

  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'fixture' };
  async function jwt(aud, email) {
    const data = jwtEncode(JSON.stringify({ alg: 'RS256', kid: jwk.kid })) + '.' + jwtEncode(JSON.stringify({
      iss: 'https://' + configured.ACCESS_TEAM_DOMAIN, aud: [aud], email, exp: Date.now() / 1000 + 3600,
    }));
    return data + '.' + jwtEncode(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(data)));
  }
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('siteverify')) {
      const { response } = JSON.parse(options.body);
      if (response === 'unavailable') throw Error('fixture outage');
      return Response.json({ success: response !== 'invalid', hostname: response === 'proxy-waitlist' ?
        'preview.example.test' : 'staging.example.test', action: activeAction });
    }
    if (String(url).endsWith('/cdn-cgi/access/certs')) return Response.json({ keys: [jwk] });
    throw Error('Unexpected outbound request');
  };
  t.after(() => { globalThis.fetch = original; });
  const mail = [];
  const jobs = [];
  const context = { waitUntil(promise) { jobs.push(promise); } };
  let activeAction = '';
  let mailDown = false;
  const env = { ...configured, DB: db,
    ASSETS: { fetch: () => new Response('static') },
    EMAIL: { send: async message => {
      if (mailDown) throw Error('mock provider unavailable');
      mail.push(message);
    } },
  };
  const post = (path, payload, extra) => worker.fetch(new Request(direct + path, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: direct, 'CF-Connecting-IP': '203.0.113.10', ...extra },
    body: JSON.stringify(payload),
  }), env, context);
  const get = (path, headers) => worker.fetch(new Request(direct + path, { headers }), env, context);
  const drain = () => Promise.all(jobs.splice(0));

  await t.test('failed validation, bot, wrong origin, and unavailable CAPTCHA preserve storage', async () => {
    assert.equal((await post('/waitlist/api', { ...waitlist, consent: false })).status, 400);
    assert.equal((await post('/waitlist/api', { ...waitlist, website: 'bot' })).status, 400);
    assert.equal((await post('/waitlist/api', waitlist, { origin: 'https://another.example.test' })).status, 403);
    assert.equal((await post('/waitlist/api', { ...waitlist, email: 'unapproved@example.test' })).status, 403);
    assert.equal((await post('/waitlist/api', { ...waitlist, turnstileToken: 'invalid' })).status, 400);
    assert.equal((await post('/waitlist/api', { ...waitlist, turnstileToken: 'unavailable' })).status, 503);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM waitlist_entries').first()).n, 0);
  });

  let privacyId;
  await t.test('notifications match departmental and configured founder recipients; one submission wins concurrent retries', async () => {
    activeAction = 'waitlist';
    const first = await post('/waitlist/api', waitlist);
    assert.equal(first.status, 201);
    await drain();
    assert.match((await first.json()).reference, /^WL-/);

    activeAction = 'demo';
    const attempts = await Promise.all([post('/demo/api', demo), post('/demo/api', demo)]);
    assert.deepEqual(attempts.map(response => response.status).sort(), [200, 201]);
    await drain();

    activeAction = 'privacy-request';
    const result = await post('/privacy-request/api', privacy);
    assert.equal(result.status, 201);
    privacyId = (await result.json()).reference;
    await drain();

    const destinations = subject => mail.filter(m => m.subject === subject).map(m => m.to).sort();
    assert.deepEqual(destinations('TeleDelo — New Waitlist Registration'), ['hello@teledelo.com']);
    assert.deepEqual(destinations('TeleDelo — New Privacy Request'), ['privacy@teledelo.com']);
    assert.deepEqual(destinations('TeleDelo — New Demo Request'), ['hello@teledelo.com', 'one@example.test', 'two@example.test']);
    assert.equal(mail.filter(m => m.to === person.email).length, 3);
    for (const [table, field, text] of [
      ['waitlist_entries', 'plan', 'pro'], ['demo_requests', 'demo_topic', 'Call handling'],
      ['privacy_requests', 'request_type', 'delete'],
    ]) assert.equal((await db.prepare('SELECT count(*) AS n FROM ' + table + ' WHERE ' + field + '=?').bind(text).first()).n, 1);
    const notice = mail.find(m => m.to === 'privacy@teledelo.com');
    assert.match(notice.text, /Review status: Received/);
    assert.match(notice.text, /Delete my information/);
    assert.ok(notice.text.includes(privacyId));
    assert.doesNotMatch(notice.text, /Alex|alex@|Private details|#id=/);
    assert.match(mail.find(m => m.subject.includes('Waitlist Registration')).text, /Example Auto.*\nInterested plan: TeleDelo Pro/);
    assert.match(mail.find(m => m.subject.includes('New Demo Request')).text, /Requested demonstration details: Call handling/);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM tickets').first()).n, 0);
  });

  await t.test('privacy mailbox proof and separate signed Access role are required before staff can record fulfillment', async () => {
    const route = '/help/admin/intake/privacy/api/' + privacyId;
    const regular = { 'Cf-Access-Jwt-Assertion': await jwt('support-fixture', 'support-staff@example.test') };
    const sales = { 'Cf-Access-Jwt-Assertion': await jwt('intake-fixture', 'sales-staff@example.test') };
    const reviewer = { 'Cf-Access-Jwt-Assertion': await jwt('privacy-fixture', 'privacy-staff@example.test') };
    assert.equal((await get(route)).status, 403);
    assert.equal((await get(route, regular)).status, 403);
    assert.equal((await get(route, sales)).status, 403);
    assert.equal((await get('/help/admin/intake/demo/api', reviewer)).status, 403);
    assert.equal((await get('/help/admin/intake/demo/api', sales)).status, 200);
    assert.equal((await post(route, { version: 0, action: 'fulfilled' }, reviewer)).status, 409);
    const confirmation = mail.find(m => m.subject === 'Verify your TeleDelo privacy request');
    const link = new URL(confirmation.text.match(/https:\/\/[^\s]+/)[0]);
    const token = new URLSearchParams(link.hash.slice(1)).get('token');
    assert.equal((await get('/privacy-request/api/verify')).status, 405);
    assert.equal((await post('/privacy-request/api/verify', { reference: privacyId, token: 'bad' })).status, 400);
    assert.equal((await post('/privacy-request/api/verify', { reference: privacyId, token })).status, 200);
    assert.equal((await post(route, { version: 1, action: 'fulfilled' }, reviewer)).status, 409);
    assert.equal((await post(route, { version: 1, action: 'verify_identity' }, reviewer)).status, 200);
    assert.equal((await post(route, { version: 2, action: 'fulfilled' }, reviewer)).status, 200);
    await drain();
    const { record, history } = await (await get(route, reviewer)).json();
    assert.equal(record.status, 'fulfilled');
    assert.equal(record.details, privacy.details);
    assert.equal(history.length, 2);
  });

  await t.test('provider outage keeps the submission and shared cron retries the pending notification', async () => {
    activeAction = 'demo';
    mailDown = true;
    const result = await post('/demo/api', { ...demo, demo_topic: 'After-hours answering' });
    assert.equal(result.status, 201);
    const { reference } = await result.json();
    await drain();
    assert.equal((await db.prepare('SELECT count(*) AS n FROM demo_requests WHERE reference=?').bind(reference).first()).n, 1);
    const pending = await db.prepare("SELECT count(*) AS n FROM email_outbox WHERE status='pending'").first();
    assert.equal(pending.n, 4);
    mailDown = false;
    await db.prepare("UPDATE email_outbox SET available_at=0 WHERE status='pending'").run();
    await worker.scheduled({}, env);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM email_outbox WHERE status='pending'").first()).n, 0);
  });

  await t.test('atomic rate limiting and approved closed-case retention leave other support data alone', async () => {
    const results = await Promise.all(Array.from({ length: 9 }, () => post('/demo/api',
      { ...demo, turnstileToken: 'invalid' }, { 'CF-Connecting-IP': '203.0.113.77' })));
    assert.equal(results.filter(item => item.status === 400).length, 8);
    assert.equal(results.filter(item => item.status === 429).length, 1);

    await db.prepare('UPDATE privacy_requests SET updated_at=0 WHERE reference=?').bind(privacyId).run();
    await db.prepare('UPDATE waitlist_entries SET updated_at=0').run();
    await worker.scheduled({}, env);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM privacy_requests').first()).n, 0);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM intake_audit WHERE reference=?').bind(privacyId).first()).n, 0);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM waitlist_entries').first()).n, 1);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM email_outbox WHERE json_extract(payload_json,'$.reference')=?").bind(privacyId).first()).n, 0);
  });

  await t.test('gateway signs the effective public origin and IP, preserves query and only routes public support paths', async () => {
    activeAction = 'waitlist';
    const gateway = createSupportGateway(env, (url, options) => {
      if (url.pathname.startsWith('/help/') && !url.pathname.startsWith('/help/api/')) assert.ok(url.pathname.endsWith('/'));
      else assert.notEqual(url.pathname, '/help');
      return worker.fetch(new Request(url, options), env, context);
    });
    const createRequest = (path, init) => new Request(publicOrigin + path, init);
    assert.equal((await gateway(createRequest('/dashboard'))).status, 404);
    assert.equal((await gateway(createRequest('/api/support-edge?td_path=/help/admin/intake/privacy/api'))).status, 404);
    const gatewayResponse = await gateway(createRequest('/api/support-edge?td_path=/waitlist/api', {
      method: 'POST', headers: { origin: publicOrigin, 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.90' },
      body: JSON.stringify({ ...waitlist, turnstileToken: 'proxy-waitlist' }),
    }));
    assert.equal(gatewayResponse.status, 200);
    assert.equal((await gateway(createRequest('/waitlist/api', {
      method: 'POST', headers: { origin: direct }, body: '{}',
    }))).status, 403);
    assert.equal((await gateway(createRequest('/waitlist?plan=pro'))).headers.get('cache-control'), 'no-store');
    assert.equal((await gateway(createRequest('/help'))).status, 200);
    assert.equal((await gateway(createRequest('/api/support-edge?td_path=/help/requests&auth=fixture'))).status, 200);
    assert.equal((await get('/waitlist', { 'X-TD-Support-Signature': 'untrusted' })).status, 403);
  });
});

test('staging hostname root opens the Help Center for GET and HEAD', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await worker.fetch(new Request(direct + '/', { method }), { ENVIRONMENT: 'staging' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/help/');
  }
  const production = await worker.fetch(new Request(direct + '/'), { ENVIRONMENT: 'production' });
  assert.equal(production.status, 404);
});

test('public plan summaries and calculator data agree with the marketing catalog', () => {
  const catalog = JSON.parse(readFileSync(new URL('../src/marketing-plans.json', import.meta.url)));
  const page = name => readFileSync(new URL('../public/intake-pages/' + name + '.html', import.meta.url), 'utf8');
  for (const [key, plan] of Object.entries(catalog)) {
    assert.ok(page('waitlist').includes('value="' + key + '" data-summary="$' + plan.price + '/month · ' +
      plan.included_minutes.toLocaleString('en-US')));
    assert.ok(page('calculator').includes('data-price="' + plan.price + '"'));
  }
  assert.equal(
    readFileSync(new URL('../src/support-proxy-contract.mjs', import.meta.url), 'utf8'),
    readFileSync(new URL('../../vercel-integration/lib/support-proxy-contract.mjs', import.meta.url), 'utf8'),
  );
});
