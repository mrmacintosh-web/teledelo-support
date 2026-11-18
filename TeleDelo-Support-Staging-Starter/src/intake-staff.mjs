import { originMatches, now, queue, readForm } from './form-shared.mjs';
import { staff } from './staff-access.mjs';
import { intake } from './public-intake.mjs';
import { responseJson } from './utils.mjs';

const error = (message, status = 400) => responseJson({ error: message }, status);

function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex');
  return new Response(response.body, { status: response.status, headers });
}

export async function intakeStaffRoute(req, path, env) {
  const match = path.match(/^\/help\/admin\/intake\/(waitlist|demo|privacy)(?:\/(staff\.js|api)(?:\/([A-Za-z0-9_-]{19}))?)?$/);
  if (!match) return error('Not found', 404);
  const [, group, endpoint, reference] = match;
  const privacy = group === 'privacy';
  const audience = privacy ? env.PRIVACY_ACCESS_AUD : env.INTAKE_ACCESS_AUD;
  const allowlist = privacy ? env.PRIVACY_STAFF_EMAILS : env.INTAKE_STAFF_EMAILS;
  if (audience === env.ACCESS_AUD || (privacy && audience === env.INTAKE_ACCESS_AUD)) {
    return error('Staff authorization is not configured.', 403);
  }
  const actor = audience && allowlist && await staff(req, env, audience, allowlist);
  if (!actor) return error('An authorized staff sign-in is required.', 403);
  if (req.method === 'POST' && !originMatches(req)) return error('Invalid request origin.', 403);
  if (endpoint !== 'api' && ['GET', 'HEAD'].includes(req.method) && !reference) {
    const url = new URL(req.url);
    url.pathname = endpoint === 'staff.js' ? '/intake-pages/staff.js' : '/intake-pages/staff';
    return privateResponse(await env.ASSETS.fetch(new Request(url, req)));
  }
  if (endpoint !== 'api') return error('Not found', 404);
  const { table } = intake[privacy ? 'privacy-request' : group];
  if (req.method === 'GET' && !reference) {
    const summary = privacy ? 'request_type, email_verified_at, identity_verified_at' : 'business';
    const before = Number(new URL(req.url).searchParams.get('before') || 0);
    const filter = new URL(req.url).searchParams.get('closed') === '1'
      ? "status IN ('closed','fulfilled','closed_unverified')" : "status IN ('received','in_review')";
    if (!Number.isSafeInteger(before) || before < 0) return error('Invalid page marker.');
    const records = await env.DB.prepare(`
      SELECT rowid AS cursor, reference, ${summary}, status, created_at, updated_at FROM ${table}
      WHERE ${filter} AND rowid < COALESCE(NULLIF(?,0),9223372036854775807) ORDER BY rowid DESC LIMIT 101
    `).bind(before).all();
    return responseJson({ records: records.results.slice(0, 100), next: records.results.length > 100 ? records.results[99].cursor : null });
  }
  if (reference && req.method === 'GET') {
    const columns = privacy ? 'request_type,details,email_verified_at,identity_verified_at,verification_started_at' :
      group === 'waitlist' ? 'business,location,phone,plan,contact_consent_at,privacy_policy_url' : 'business,demo_topic,details';
    const record = await env.DB.prepare(`SELECT reference,name,email,status,created_at,updated_at,version,${columns}
      FROM ${table} WHERE reference=?`).bind(reference).first();
    if (!record) return error('Request not found.', 404);
    const history = await env.DB.prepare('SELECT staff_email,action,created_at FROM intake_audit WHERE reference=? ORDER BY version DESC LIMIT 100')
      .bind(reference).all();
    return responseJson({ record, history: history.results });
  }
  if (reference && req.method === 'POST') return updateRequest(req, env, table, reference, privacy, actor);
  return error('Method not allowed.', 405);
}

async function updateRequest(req, env, table, reference, privacy, actor) {
  let body;
  try { body = await readForm(req); } catch { return error('Check the update and try again.'); }
  if (!Number.isSafeInteger(body.version)) return error('A valid request version is required.');
  const record = await env.DB.prepare(`SELECT * FROM ${table} WHERE reference=?`).bind(reference).first();
  if (!record) return error('Request not found.', 404);
  if (body.version !== record.version) return error('This request changed. Reload it before continuing.', 409);
  if (!['received', 'in_review'].includes(record.status)) return error('This request is closed.', 409);
  const time = now();
  const version = record.version + 1;
  const action = body.action;
  const transitions = privacy ? ['in_review', 'fulfilled', 'closed_unverified'] : ['in_review', 'closed'];
  let column = 'status';
  let value = action;
  if (privacy && action === 'verify_identity') {
    if (!record.email_verified_at) return error('Confirm mailbox ownership before recording identity verification.', 409);
    if (record.identity_verified_at) return error('Identity is verified for this request.', 409);
    column = 'identity_verified_at';
    value = time;
  } else if (privacy && action === 'resend_mailbox') {
    if (record.email_verified_at || time - record.verification_started_at < 3600) {
      return error('A verification email can be reissued after an hour if mailbox verification is still pending.', 409);
    }
    if (!env.EMAIL || !env.PRIVACY_VERIFY_SECRET) return error('Verification email is temporarily unavailable.', 503);
    column = 'verification_started_at';
    value = time;
  } else {
    if (!transitions.includes(action) || action === record.status) return error('Choose a valid review action.');
    if (action === 'fulfilled' && (!record.email_verified_at || !record.identity_verified_at)) {
      return error('Complete mailbox and staff identity checks before recording fulfillment.', 409);
    }
  }
  const statements = [
    env.DB.prepare(`INSERT INTO intake_audit(reference,staff_email,action,version,created_at)
      SELECT reference,?,?,?,? FROM ${table} WHERE reference=? AND version=?`)
      .bind(actor, action, version, time, reference, record.version),
    env.DB.prepare(`UPDATE ${table} SET ${column}=?,updated_at=?,version=? WHERE reference=? AND version=?`)
      .bind(value, time, version, reference, record.version),
  ];
  if (action === 'resend_mailbox') {
    // Confirm that this batch started the new verification window before queueing mail.
    statements.push(queue(env, 'intake_receipt_privacy-request', record.email, reference,
      { timestamp: time }, `intake:${reference}:mailbox:${version}`, table, time));
  }
  const [, result] = await env.DB.batch(statements);
  if (!result.meta.changes) return error('This request changed. Reload it before continuing.', 409);
  return responseJson({ message: 'Review updated.' });
}
