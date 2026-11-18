// The standalone support preview serves a subset of the full TeleDelo website.
const host = window.location.hostname;
if (host.endsWith('.workers.dev') || host === 'localhost' || host === '127.0.0.1') {
  for (const link of document.querySelectorAll('[data-main-site]')) link.hidden = true;
}

const menu = document.querySelector('.intake-menu');
menu.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
});
