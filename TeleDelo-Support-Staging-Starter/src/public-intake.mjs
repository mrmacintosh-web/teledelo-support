import { cleanEmail, validEmail, trimmed, randomToken, responseJson, stagingEmailAllowed } from './utils.mjs';
import { now, checkCaptcha, readForm, originMatches, takeRateLimit, queue } from './form-shared.mjs';
import { hmacKey, sign, verify } from './support-proxy-contract.mjs';
import plans from './marketing-plans.json' with { type: 'json' };

export const privacyTypes = {
  access: 'Access my information',
  correct: 'Correct my information',
  delete: 'Delete my information',
  withdraw: 'Withdraw optional marketing consent',
  other: 'Other privacy question',
};
const demoTopics = ['General overview', 'Call handling', 'After-hours answering', 'Multiple businesses'];
export const intake = {
  waitlist: { table: 'waitlist_entries', prefix: 'WL', recipient: 'hello@teledelo.com', retention: 'WAITLIST_RETENTION_DAYS' },
  demo: { table: 'demo_requests', prefix: 'DM', recipient: 'hello@teledelo.com', retention: 'DEMO_RETENTION_DAYS' },
  'privacy-request': { table: 'privacy_requests', prefix: 'PR', recipient: 'privacy@teledelo.com', retention: 'PRIVACY_RETENTION_DAYS' },
};
const error = (message, status = 400) => responseJson({ error: message }, status);
const verificationWindow = 48 * 3600;
const mailEnabled = env => Boolean(env.EMAIL && validEmail(cleanEmail(env.FROM_EMAIL)));
const isTest = env => ['local', 'staging'].includes(env.ENVIRONMENT);

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch { return null; }
}

export function addresses(value) {
  return [...new Set(String(value || '').split(',').map(cleanEmail).filter(validEmail))];
}

function retentionDays(env, key) {
  const days = Number(env[key]);
  return Number.isSafeInteger(days) && days > 0 && days <= 36500 ? days : null;
}

function enabled(env, kind, req) {
  const origin = new URL(req.url).origin;
  const publicOrigin = httpsUrl(env.PUBLIC_ORIGIN);
  const policy = httpsUrl(env.INTAKE_PRIVACY_POLICY_URL);
  const approvedOrigin = origin === publicOrigin?.origin || origin === env.SUPPORT_PUBLIC_ORIGIN ||
    (env.ENVIRONMENT === 'local' && ['localhost', '127.0.0.1'].includes(new URL(req.url).hostname));
  return env.INTAKE_ENABLED === 'true' && approvedOrigin && env.DB && env.TURNSTILE_SITE_KEY &&
    env.TURNSTILE_SECRET && env.RATE_LIMIT_SALT?.length >= 32 && retentionDays(env, intake[kind].retention) &&
    (env.ENVIRONMENT === 'production' || (isTest(env) && (
      env.INTAKE_STAGING_NOTIFICATION_MODE === 'departments' || validEmail(cleanEmail(env.INTAKE_STAGING_MAILBOX))
    ))) &&
    (kind !== 'waitlist' || policy) &&
    (kind !== 'privacy-request' || (mailEnabled(env) && publicOrigin && env.PRIVACY_VERIFY_SECRET?.length >= 32 &&
      env.PRIVACY_ACCESS_AUD && env.PRIVACY_ACCESS_AUD !== env.ACCESS_AUD && env.PRIVACY_ACCESS_AUD !== env.INTAKE_ACCESS_AUD &&
      addresses(env.PRIVACY_STAFF_EMAILS).length)) &&
    (kind === 'privacy-request' || (env.INTAKE_ACCESS_AUD && env.INTAKE_ACCESS_AUD !== env.ACCESS_AUD && addresses(env.INTAKE_STAFF_EMAILS).length)) &&
    // A provider outage is retried by the outbox. A missing provider is a configuration error.
    mailEnabled(env);
}

export function intakeConfig(env, kind, req) {
  return {
    ready: Boolean(enabled(env, kind, req)),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
    privacyPolicyUrl: httpsUrl(env.INTAKE_PRIVACY_POLICY_URL)?.href || '',
    testMode: isTest(env),
  };
}

function processInput(kind, body) {
  const fields = {};
  const name = trimmed(body.name, 2, kind === 'privacy-request' ? 120 : 100);
  const email = typeof body.email === 'string' ? cleanEmail(body.email) : '';
  if (!name) fields.name = 'Enter your full name.';
  if (!validEmail(email)) fields.email = 'Enter a valid email address.';
  const values = { name, email };
  if (kind === 'privacy-request') {
    values.request_type = body.request_type;
    values.details = body.details ? trimmed(body.details, 0, 1600) : null;
    if (typeof body.request_type !== 'string' || !Object.hasOwn(privacyTypes, body.request_type)) fields.request_type = 'Choose a request type.';
    if (body.details && values.details === null) fields.details = 'Use 1,600 characters or fewer.';
  } else {
    values.business = trimmed(body.business, 2, 120);
    if (!values.business) fields.business = 'Enter your business name.';
    if (kind === 'waitlist') {
      values.location = trimmed(body.location, 2, 120);
      values.phone = body.phone ? trimmed(body.phone, 0, 40) : null;
      values.plan = body.plan;
      if (!values.location) fields.location = 'Enter your business location.';
      if (body.phone && (!values.phone || !/^[+(). 0-9x-]+$/i.test(values.phone) ||
        values.phone.replace(/\D/g, '').length < 5)) fields.phone = 'Enter a valid phone number.';
      if (typeof body.plan !== 'string' || !Object.hasOwn(plans, body.plan)) fields.plan = 'Choose a TeleDelo plan.';
      if (body.consent !== true) fields.consent = 'Confirm you agree to be contacted about this request.';
    } else {
      values.demo_topic = body.demo_topic;
      values.details = body.details ? trimmed(body.details, 0, 1200) : null;
      if (!demoTopics.includes(body.demo_topic)) fields.demo_topic = 'Choose a demonstration topic.';
      if (body.details && values.details === null) fields.details = 'Use 1,200 characters or fewer.';
    }
  }
  return { fields, values };
}

function staffRecipients(env, entry) {
  if (isTest(env) && env.INTAKE_STAGING_NOTIFICATION_MODE !== 'departments') {
    return [cleanEmail(env.INTAKE_STAGING_MAILBOX)];
  }
  return [...new Set([entry.recipient, ...(entry.prefix === 'DM' ? addresses(env.DEMO_FOUNDER_EMAILS) : [])])];
}

async function submissionFingerprint(env, kind, values) {
  const business = values.business?.toLowerCase().replace(/\s+/g, ' ');
  // Keep waitlist registrations unique per applicant. Keep demo retries unique per business and topic.
  const key = kind === 'waitlist' ? [kind, values.email] : kind === 'demo' ?
    [kind, values.email, business, values.demo_topic, values.details || ''] :
    [kind, values.email, values.request_type, values.details || ''];
  return sign(await hmacKey(env.RATE_LIMIT_SALT), JSON.stringify(key));
}

export async function collectIntake(req, env, kind) {
  if (!originMatches(req)) return error('Invalid request origin.', 403);
  if (!enabled(env, kind, req)) return error('This form is temporarily unavailable.', 503);
  let body;
  try { body = await readForm(req); } catch { return error('Please check the form and try again.'); }
  if (body.website) return error('We could not accept this submission.');
  const { fields, values } = processInput(kind, body);
  if (Object.keys(fields).length) return responseJson({ error: 'Please check the highlighted fields.', fields }, 400);
  if (isTest(env) && !stagingEmailAllowed({ ...env, ENVIRONMENT: 'staging' }, values.email)) {
    return error('This staging site is limited to approved test email addresses.', 403);
  }
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await takeRateLimit(env, 'intake:' + kind, ip, 8)) return error('Too many attempts. Please try again later.', 429);
  try {
    if (!await checkCaptcha(env, body.turnstileToken, req, kind)) return error('Please complete the security check.');
  } catch { return error('The security check is temporarily unavailable. Please try again.', 503); }
  if (!await takeRateLimit(env, 'intake-email:' + kind, values.email, 4)) {
    return error('Too many attempts. Please try again later.', 429);
  }

  const entry = intake[kind];
  const reference = entry.prefix + '-' + randomToken().slice(0, 16);
  const time = now();
  const submissionKey = await submissionFingerprint(env, kind, values);
  if (kind === 'waitlist') {
    values.privacy_policy_url = httpsUrl(env.INTAKE_PRIVACY_POLICY_URL).href;
    values.contact_consent_at = time;
  }
  if (kind === 'privacy-request') values.verification_started_at = time;
  const record = { reference, submission_key: submissionKey, ...values, created_at: time, updated_at: time };
  const columns = Object.keys(record);
  const queries = [
    env.DB.prepare(`INSERT INTO ${entry.table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})
      ON CONFLICT(submission_key) DO NOTHING`).bind(...Object.values(record)),
  ];
  // Persist notifications in the same D1 transaction. Queue only for the record actually inserted.
  const addMail = (template, to, payload) => queries.push(queue(
    env, template, to, reference, payload, `intake:${reference}:${template}:${to}`, entry.table,
  ));
  const summary = kind === 'privacy-request'
    ? { requestType: privacyTypes[values.request_type], timestamp: time }
    : kind === 'waitlist' ? { business: values.business, plan: plans[values.plan].name, timestamp: time }
      : { business: values.business, topic: values.demo_topic, timestamp: time };
  for (const to of staffRecipients(env, entry)) addMail('intake_staff_' + kind, to, summary);
  addMail('intake_receipt_' + kind, values.email, { timestamp: time });
  const [result] = await env.DB.batch(queries);
  if (!result.meta.changes) {
    // An identical repeat gets a neutral response without another email or public record lookup.
    return responseJson({ message: 'Thank you. If this request is already on file, it remains with our team.' }, 200);
  }
  return responseJson({
    reference,
    message: kind === 'privacy-request' ? 'Your privacy request was received. Check your email for a verification link.' :
      kind === 'waitlist' ? 'You’re on the TeleDelo waitlist.' : 'Your demo request was received.',
  }, 201);
}

export async function privacyVerificationToken(env, reference, createdAt) {
  return sign(await hmacKey(env.PRIVACY_VERIFY_SECRET), JSON.stringify(['privacy-mailbox-v1', reference, createdAt]));
}

export async function verifyPrivacyMailbox(req, env) {
  if (!originMatches(req)) return error('Invalid request origin.', 403);
  if (!enabled(env, 'privacy-request', req)) return error('Verification is temporarily unavailable.', 503);
  if (!await takeRateLimit(env, 'privacy-verify', req.headers.get('CF-Connecting-IP') || 'unknown', 15)) {
    return error('Too many attempts. Please try again later.', 429);
  }
  const badLink = () => error('This verification link is invalid or expired.', 400);
  let body;
  try { body = await readForm(req); } catch { return badLink(); }
  if (typeof body.reference !== 'string' || !/^PR-[\w-]{16}$/.test(body.reference)) return badLink();
  const time = now();
  const record = await env.DB.prepare('SELECT verification_started_at,email_verified_at,status FROM privacy_requests WHERE reference=?')
    .bind(body.reference).first();
  if (!record || !['received', 'in_review'].includes(record.status) || time - record.verification_started_at > verificationWindow) return badLink();
  const key = await hmacKey(env.PRIVACY_VERIFY_SECRET);
  if (typeof body.token !== 'string' || !await verify(key, JSON.stringify(['privacy-mailbox-v1', body.reference, record.verification_started_at]), body.token)) {
    return badLink();
  }
  if (!record.email_verified_at) {
    const updated = await env.DB.prepare(`UPDATE privacy_requests SET email_verified_at=?, updated_at=?, version=version+1
      WHERE reference=? AND verification_started_at=? AND email_verified_at IS NULL AND status IN ('received','in_review')`)
      .bind(time, time, body.reference, record.verification_started_at).run();
    if (!updated.meta.changes) {
      const current = await env.DB.prepare('SELECT email_verified_at FROM privacy_requests WHERE reference=? AND verification_started_at=?')
        .bind(body.reference, record.verification_started_at).first();
      if (!current?.email_verified_at) return badLink();
    }
  }
  return responseJson({ message: 'Your email address is verified. Our privacy team will review the request and may contact you to verify your identity.' });
}

export async function purgeIntake(env) {
  for (const entry of Object.values(intake)) {
    const duration = retentionDays(env, entry.retention);
    if (!duration) continue;
    const before = now() - duration * 86400;
    const closed = entry.prefix === 'PR' ? "'fulfilled','closed_unverified'" : "'closed'";
    const expired = `SELECT reference FROM ${entry.table} WHERE status IN (${closed}) AND updated_at < ?`;
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM email_outbox WHERE json_extract(payload_json,'$.reference') IN (${expired})
        AND template LIKE 'intake!_%' ESCAPE '!'`).bind(before),
      env.DB.prepare(`DELETE FROM intake_audit WHERE reference IN (${expired})`).bind(before),
      env.DB.prepare(`DELETE FROM ${entry.table} WHERE status IN (${closed}) AND updated_at < ?`).bind(before),
    ]);
  }
}
