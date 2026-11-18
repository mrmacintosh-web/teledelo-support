const form = document.querySelector('form[data-intake]');
const kind = form.dataset.intake;
const submit = form.querySelector('button[type="submit"]');
const formError = document.querySelector('#form-error');
const securityError = document.querySelector('#security-error');
const formResult = document.querySelector('#form-result');
const widget = document.querySelector('#turnstile');
let widgetId;
let token;
let sending = false;

function showError(message, focus = false) {
  formError.textContent = message;
  formError.hidden = !message;
  if (message && focus) formError.focus();
}

function showSecurityError(message) {
  securityError.textContent = message;
  securityError.hidden = !message;
}

function clearFieldError(input) {
  document.getElementById(input.name + '-error')?.remove();
  input.removeAttribute('aria-invalid');
  const saved = input.dataset.describedBy;
  if (saved) input.setAttribute('aria-describedby', saved);
  else if (saved === '') input.removeAttribute('aria-describedby');
  delete input.dataset.describedBy;
}

function showFields(fields) {
  for (const [name, message] of Object.entries(fields || {})) {
    const input = form.elements.namedItem(name);
    if (!(input instanceof HTMLElement)) continue;
    const hint = input.getAttribute('aria-describedby') || '';
    input.dataset.describedBy = hint;
    const error = document.createElement('span');
    error.id = name + '-error';
    error.className = 'field-error';
    error.textContent = message;
    input.setAttribute('aria-describedby', [hint, error.id].filter(Boolean).join(' '));
    input.setAttribute('aria-invalid', 'true');
    if (name === 'consent') input.parentElement.querySelector('label').after(error);
    else input.after(error);
  }
}

function updateButton() {
  submit.disabled = sending || !token;
}

const plan = form.elements.namedItem('plan');
if (plan) {
  const desired = new URLSearchParams(location.search).get('plan');
  if ([...plan.options].some(option => option.value === desired)) plan.value = desired;
  const summary = document.querySelector('#plan-summary');
  const updateSummary = () => {
    summary.textContent = plan.selectedOptions[0]?.dataset.summary || '';
  };
  plan.addEventListener('change', updateSummary);
  updateSummary();
}
form.addEventListener('input', event => {
  if (event.target?.name) clearFieldError(event.target);
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || !token) return;
  for (const item of form.elements) if (item.name) clearFieldError(item);
  showError('');
  const body = Object.fromEntries(new FormData(form));
  body.consent = body.consent === 'yes';
  body.turnstileToken = token;
  sending = true;
  updateButton();
  form.setAttribute('aria-busy', 'true');
  try {
    const res = await fetch(form.action, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
    });
    const payload = await res.json();
    if (!res.ok) {
      showFields(payload.fields);
      showError(payload.error || 'We couldn’t submit this form. Please try again.', true);
      return;
    }
    form.hidden = true;
    formResult.textContent = payload.message + (payload.reference ? ' Reference ' + payload.reference + '.' : '');
    formResult.hidden = false;
    formResult.focus();
  } catch {
    showError('We couldn’t confirm your submission. Please try again.', true);
  } finally {
    sending = false;
    form.removeAttribute('aria-busy');
    token = '';
    updateButton();
    if (!form.hidden && widgetId !== undefined) window.turnstile.reset(widgetId);
  }
});

async function setupForm() {
  try {
    const response = await fetch(form.getAttribute('action') + '/config', { redirect: 'error' });
    if (!response.ok) throw new Error('Configuration unavailable');
    const config = await response.json();
    if (config.privacyPolicyUrl) {
      for (const link of document.querySelectorAll('[data-policy-link]')) {
        link.href = config.privacyPolicyUrl;
        link.hidden = false;
      }
      if (kind === 'waitlist') form.querySelector('.consent').hidden = false;
    }
    if (config.testMode && config.ready) {
      const note = document.createElement('p');
      note.className = 'preview-banner';
      note.textContent = 'Testing environment. Use approved test addresses and fictional details.';
      form.before(note);
    }
    if (!config.ready || !config.turnstileSiteKey) {
      formError.classList.add('availability-note');
      showError('This form is temporarily unavailable.');
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload = () => {
      window.turnstile.ready(() => {
        widgetId = window.turnstile.render(widget, {
          sitekey: config.turnstileSiteKey,
          action: kind,
          size: widget.clientWidth < 300 ? 'compact' : 'flexible',
          'response-field': false,
          callback(value) {
            token = value;
            showSecurityError('');
            updateButton();
          },
          'expired-callback'() {
            token = '';
            showSecurityError('The security check expired. Please complete it again.');
            updateButton();
          },
          'error-callback'() {
            token = '';
            showSecurityError('The security check couldn’t load. Please try again.');
            updateButton();
          },
        });
      });
    };
    script.onerror = () => showError('The security check couldn’t load. Reload this page to try again.');
    document.head.append(script);
  } catch {
    showError('This form is temporarily unavailable. Please try again later.');
  }
}
setupForm();
