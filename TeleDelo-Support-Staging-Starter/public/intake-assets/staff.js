const group = location.pathname.replace(/\/$/, '').split('/').at(-1);
const base = '/help/admin/intake/' + group + '/api';
const list = document.querySelector('#requests');
const recordPanel = document.querySelector('#case');
const heading = document.querySelector('#case-heading');
const next = document.querySelector('#next');
const filter = document.querySelector('#filter');
const message = document.querySelector('#message');
const details = document.querySelector('#details');
const history = document.querySelector('#audit');
const actions = document.querySelector('#review-actions');
const actionLabels = {
  in_review: 'Mark in review',
  closed: 'Close request',
  fulfilled: 'Record fulfillment',
  closed_unverified: 'Close without fulfillment',
  verify_identity: 'Record completed identity check',
  resend_mailbox: 'Send new verification email',
};
const labels = {
  name: 'Full name', email: 'Email', business: 'Business', location: 'Location', phone: 'Phone',
  plan: 'Interested plan', contact_consent_at: 'Waitlist contact consent', privacy_policy_url: 'Privacy policy',
  request_type: 'Request type', demo_topic: 'Demonstration topic', details: 'Additional details',
  email_verified_at: 'Email verified', identity_verified_at: 'Staff identity check',
  verification_started_at: 'Verification email issued', status: 'Status', created_at: 'Received',
};
const timeLabel = value => new Date(value * 1000).toLocaleString();
let closed = false;
let cursor = null;
document.querySelector('#title').textContent = { demo: 'Demo requests', waitlist: 'Waitlist registrations', privacy: 'Privacy requests' }[group];

async function request(endpoint, body) {
  const res = await fetch(base + endpoint, body ? {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  } : {});
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
}
function displayMessage(text) {
  message.textContent = text;
  if (text) message.focus();
}
function node(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}
async function showList(before = 0, append = false) {
  if (!append) list.replaceChildren();
  next.hidden = true;
  try {
    const data = await request('?closed=' + Number(closed) + '&before=' + before);
    cursor = data.next;
    next.hidden = !cursor;
    if (!data.records.length && !append) list.append(node('li', 'No requests found.'));
    for (const item of data.records) {
      const button = node('button', [item.reference, item.business || item.request_type, timeLabel(item.created_at)].join(' · '));
      button.type = 'button';
      button.className = 'btn reference';
      button.addEventListener('click', () => showRecord(item.reference));
      const li = node('li', '');
      li.append(button);
      list.append(li);
    }
  } catch (error) { displayMessage(error.message); }
}
async function showRecord(reference, focus = true) {
  try {
    const { record, history: events } = await request('/' + reference);
    heading.textContent = record.reference;
    details.replaceChildren();
    for (const [key, label] of Object.entries(labels)) {
      if (!Object.hasOwn(record, key)) continue;
      const value = key.endsWith('_at') && record[key] ? timeLabel(record[key]) : record[key];
      details.append(node('dt', label), node('dd', value || '—'));
    }
    history.replaceChildren(...events.map(event => node('li',
      (actionLabels[event.action] || event.action) + ' · ' + event.staff_email + ' · ' + timeLabel(event.created_at))));
    actions.replaceChildren();
    if (['received', 'in_review'].includes(record.status)) {
      const choices = record.status === 'received' ? ['in_review'] : [];
      if (group !== 'privacy') choices.push('closed');
      else {
        if (record.email_verified_at && !record.identity_verified_at) choices.push('verify_identity');
        if (!record.email_verified_at && Date.now() / 1000 - record.verification_started_at >= 3600) choices.push('resend_mailbox');
        if (record.identity_verified_at && record.email_verified_at) choices.push('fulfilled');
        choices.push('closed_unverified');
      }
      for (const action of choices) {
        const button = node('button', actionLabels[action]);
        button.type = 'button';
        button.className = 'btn';
        button.addEventListener('click', async () => {
          if (action === 'verify_identity' &&
            !window.confirm('Confirm that you completed the organization’s approved identity check.')) return;
          if (action === 'fulfilled' &&
            !window.confirm('Confirm that fulfillment already took place through the approved secure process.')) return;
          button.disabled = true;
          try {
            await request('/' + reference, { version: record.version, action });
            await showRecord(reference, false);
            await showList();
            displayMessage('Review updated.');
          } catch (error) {
            displayMessage(error.message);
            button.disabled = false;
          }
        });
        actions.append(button);
      }
    }
    recordPanel.hidden = false;
    if (focus) heading.focus();
  } catch (error) { displayMessage(error.message); }
}
next.addEventListener('click', () => showList(cursor, true));
filter.addEventListener('click', () => {
  closed = !closed;
  filter.setAttribute('aria-pressed', String(closed));
  filter.textContent = closed ? 'Show open requests' : 'Show closed requests';
  recordPanel.hidden = true;
  showList();
});
showList();
