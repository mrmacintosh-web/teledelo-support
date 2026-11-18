'use strict';

const byId = id => document.getElementById(id);
const plans = [...document.querySelectorAll('input[name="plan"]')];
const defaultPlan = plans.find(plan => plan.defaultChecked);
const queryPlan = new URLSearchParams(location.search).get('plan');
(plans.find(plan => plan.value === queryPlan) || defaultPlan).checked = true;

const callsInput = byId('calls');
const profitInput = byId('profit');
const extraInput = byId('extra');
const conversion = byId('conversion');
const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const count = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function money(cents) {
  return dollars.format(cents / 100);
}

function readInput(input, name, precisionMessage) {
  const validity = input.validity;
  const max = count.format(Number(input.max));
  let error = '';

  if (!input.disabled) {
    if (validity.badInput) error = `Enter a valid number for ${name}.`;
    else if (validity.valueMissing) error = `Enter ${name}.`;
    else if (validity.rangeUnderflow) error = 'Enter 0 or more.';
    else if (validity.rangeOverflow) error = `Enter ${max} or less.`;
    else if (validity.stepMismatch) error = precisionMessage;
  }

  const message = byId(input.id + '-error');
  if (message.textContent !== error) message.textContent = error;
  message.hidden = !error;
  if (error) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');

  return { value: !input.disabled && !error && input.value ? input.valueAsNumber : 0, error };
}

let announcementTimer;
function announce(message) {
  clearTimeout(announcementTimer);
  announcementTimer = setTimeout(() => {
    byId('estimate-status').textContent = message;
  }, 250);
}

function render(announceUpdate = true) {
  const plan = plans.find(choice => choice.checked);
  const priceCents = Number(plan.dataset.price) * 100;
  const rateCents = plan.dataset.overageCents;
  const includesOverage = rateCents !== undefined;
  const oneIn = Number(conversion.value);

  byId('calls-hint').textContent = plan.dataset.callsHint;
  byId('profit-plan-hint').textContent = plan.dataset.profitHint ? ' ' + plan.dataset.profitHint : '';
  byId('overage-details').hidden = !includesOverage;
  extraInput.disabled = !includesOverage;
  byId('extra-hint').textContent = includesOverage
    ? `Enter only the minutes beyond the included allowance. Additional minutes cost ${money(Number(rateCents))} each.`
    : '';
  byId('estimate').dataset.plan = plan.value;
  byId('price').textContent = '−' + money(priceCents);
  byId('overage-row').hidden = !includesOverage;
  byId('cost-note').textContent = includesOverage
    ? 'Additional calling charges are based on the extra minutes you enter.'
    : 'This estimate excludes potential charges beyond the included AI minute allowance.';

  for (const id of ['resultCta', 'footerCta']) {
    byId(id).setAttribute('href', '/waitlist?plan=' + plan.value);
  }

  const calls = readInput(callsInput, 'your missed calls');
  const profit = readInput(profitInput, 'your profit per customer', 'Enter an amount in dollars and cents.');
  const extra = readInput(extraInput, 'your additional minutes', 'Enter a whole number of minutes.');
  const overageCents = includesOverage ? extra.value * Number(rateCents) : 0;
  byId('overage-cost').textContent = extra.error ? '—' : (overageCents ? '−' : '') + money(overageCents);

  const netOutput = byId('net');
  const explanation = byId('result-explanation');
  const breakEven = byId('breakeven');
  const errors = [calls.error, profit.error, extra.error].filter(Boolean);

  if (errors.length) {
    for (const output of [netOutput, byId('customers'), byId('value')]) output.textContent = '—';
    netOutput.classList.remove('long');
    netOutput.removeAttribute('data-sign');
    explanation.textContent = 'Check the highlighted fields to see your estimate.';
    breakEven.textContent = 'Your break-even estimate will appear when your numbers are ready.';
    if (announceUpdate) announce('Estimate incomplete. ' + errors.join(' '));
    return;
  }

  const monthlyCalls = calls.value * 52 / 12;
  const customers = monthlyCalls / oneIn;
  // Work in cents so exact break-even thresholds do not drift in floating point.
  const profitCents = Math.round(profit.value * 100);
  const customerProfitCents = Math.round(customers * profitCents);
  const totalCostCents = priceCents + overageCents;
  const netCents = customerProfitCents - totalCostCents;
  const sign = netCents < 0 ? '−' : netCents > 0 ? '+' : '';
  const net = sign + money(Math.abs(netCents));

  netOutput.textContent = net;
  netOutput.classList.toggle('long', net.length > 10);
  netOutput.dataset.sign = netCents < 0 ? 'negative' : 'nonnegative';
  byId('customers').textContent = customers > 0 && customers < 0.05 ? '<0.1' : count.format(customers);
  byId('value').textContent = money(customerProfitCents);
  const assumption = `Illustrative scenario using 1 in ${oneIn} missed calls.`;
  if (netCents < 0) {
    explanation.textContent = assumption + ' Estimated customer profit falls short of the modeled monthly costs.';
  } else if (netCents === 0) {
    explanation.textContent = assumption + ' Estimated customer profit covers the modeled monthly costs.';
  } else {
    explanation.textContent = assumption + ' Estimated customer profit exceeds the modeled monthly costs.';
  }

  if (profitCents > 0) {
    const needed = Math.ceil(totalCostCents / profitCents);
    const threshold = document.createElement('strong');
    threshold.textContent = `${count.format(needed)} additional paying ${needed === 1 ? 'customer' : 'customers'}`;
    const charges = overageCents ? ' and estimated additional calling charges' : '';
    breakEven.replaceChildren('You’d need ', threshold, ` per month to cover the subscription${charges}.`);
  } else {
    breakEven.textContent = 'With $0 profit per customer, additional customers cannot cover the monthly costs.';
  }
  if (announceUpdate) {
    announce(`Estimated monthly net value: ${net}. ${breakEven.textContent} ${byId('cost-note').textContent}`);
  }
}

for (const plan of plans) plan.addEventListener('change', () => render());
for (const input of [callsInput, profitInput, extraInput]) input.addEventListener('input', () => render());
conversion.addEventListener('change', () => render());

byId('reset').addEventListener('click', () => {
  defaultPlan.checked = true;
  for (const input of [callsInput, profitInput, extraInput]) input.value = input.defaultValue;
  conversion.selectedIndex = [...conversion.options].findIndex(option => option.defaultSelected);
  byId('assumptions').open = false;
  render();
  defaultPlan.focus();
});

render(false);
