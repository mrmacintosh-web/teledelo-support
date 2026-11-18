const input = new URLSearchParams(location.hash.slice(1));
const reference = input.get('id');
const token = input.get('token');
const button = document.getElementById('verify-submit');
const result = document.getElementById('verify-result');
if (location.hash) history.replaceState(null, '', location.pathname + location.search);

if (reference && token) button.disabled = false;
else result.textContent = 'Open the verification link from your TeleDelo privacy request email.';

button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const response = await fetch('/privacy-request/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference, token }),
      redirect: 'error',
    });
    const data = await response.json();
    result.textContent = response.ok ? data.message : data.error || 'Verification is temporarily unavailable.';
    button.hidden = response.ok;
  } catch {
    result.textContent = 'We couldn’t verify your email. Please try again.';
  } finally {
    if (!button.hidden) button.disabled = false;
    result.focus();
  }
});
