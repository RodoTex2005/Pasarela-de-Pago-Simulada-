'use strict';
/* ---------- Tema claro / oscuro / sistema ---------- */
const root = document.documentElement;
const themeBtn = document.getElementById('themeBtn');
const MODES = ['system', 'light', 'dark'];
const LABELS = { system: 'sistema', light: 'claro', dark: 'oscuro' };
function currentMode() { return root.dataset.theme || 'system'; }
function setMode(mode) {
  if (mode === 'system') delete root.dataset.theme; else root.dataset.theme = mode;
  try { mode === 'system' ? localStorage.removeItem('theme') : localStorage.setItem('theme', mode); } catch (e) {}
  themeBtn.textContent = 'Tema: ' + LABELS[mode];
}
themeBtn.addEventListener('click', () => setMode(MODES[(MODES.indexOf(currentMode()) + 1) % MODES.length]));
setMode(currentMode());

/* ---------- Validaciones ---------- */
const $ = (id) => document.getElementById(id);
function luhn(num) {
  let sum = 0, dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = +num[i];
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}
const rules = {
  name: (v) => v.trim().length >= 3 || 'Escribe tu nombre completo.',
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Escribe un correo válido, por ejemplo nombre@correo.com.',
  address: (v) => v.trim().length >= 8 || 'Escribe calle, número y colonia.',
  card: (v) => { const n = v.replace(/\s/g, ''); return (/^\d{13,19}$/.test(n) && luhn(n)) || 'El número de tarjeta no es válido.'; },
  exp: (v) => {
    const m = v.match(/^(\d{2})\/(\d{2})$/);
    if (!m || +m[1] < 1 || +m[1] > 12) return 'Usa el formato MM/AA, por ejemplo 12/28.';
    const end = new Date(2000 + +m[2], +m[1], 1);
    return end > new Date() || 'La tarjeta está vencida.';
  },
  cvv: (v) => /^\d{3,4}$/.test(v) || 'El CVV tiene 3 o 4 dígitos.',
};
function validateField(id) {
  const input = $(id), res = rules[id](input.value), err = $(id + '-err');
  input.setAttribute('aria-invalid', res === true ? 'false' : 'true');
  err.textContent = res === true ? '' : res;
  return res === true;
}
Object.keys(rules).forEach((id) => $(id).addEventListener('blur', () => validateField(id)));

/* ---------- Formato asistido ---------- */
$('card').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim(); });
$('exp').addEventListener('input', (e) => {
  let v = e.target.value.replace(/\D/g, '').slice(0, 4);
  e.target.value = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v;
});
$('cvv').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });

/* ---------- Simulación del flujo de pago (Saga + Circuit Breaker, solo front) ----------
   En el sistema real esto lo hacen los microservicios Orders / Inventory / Payments.
   Aquí se simula para demostrar los estados PENDING -> CONFIRMED / CANCELLED. */
const BANK_TIMEOUT_MS = 2000;
function fakeBank(cardDigits) {
  return new Promise((resolve, reject) => {
    const delay = cardDigits.endsWith('0119') ? 2600 : 900;
    setTimeout(() => (cardDigits.endsWith('0002') ? reject(new Error('DECLINED')) : resolve('APPROVED')), delay);
  });
}
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ms))]);
}
const ICONS = { PENDING: '<span class="spin" aria-hidden="true">⏳</span>', CONFIRMED: '<span aria-hidden="true">✔</span>', CANCELLED: '<span aria-hidden="true">✖</span>' };
const TEXT = { PENDING: 'Pendiente', CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado' };
function showStatus(state, msg, orderId) {
  const box = $('statusBox'), badge = $('badge');
  box.hidden = false; box.dataset.state = state; badge.dataset.state = state;
  badge.innerHTML = ICONS[state] + ' ' + TEXT[state];
  if (orderId) $('orderId').textContent = orderId;
  $('statusMsg').textContent = msg;
  $('retryBtn').hidden = state !== 'CANCELLED';
}

const form = $('checkout'), payBtn = $('payBtn');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const results = Object.keys(rules).map(validateField);
  if (results.includes(false)) { document.querySelector('[aria-invalid="true"]').focus(); return; }

  payBtn.disabled = true; /* evita cobros duplicados por doble clic */
  payBtn.textContent = 'Procesando…';
  const orderId = 'ORD-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  showStatus('PENDING', 'Estamos reservando tu inventario y procesando el pago.', orderId);
  $('statusBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const digits = $('card').value.replace(/\s/g, '');
  try {
    await withTimeout(fakeBank(digits), BANK_TIMEOUT_MS);
    showStatus('CONFIRMED', 'Pago aprobado. Te enviamos la confirmación por correo.');
  } catch (err) {
    const msg = err.message === 'TIMEOUT'
      ? 'El banco tardó más de 2 segundos. Cancelamos el pedido y liberamos el inventario. Puedes intentarlo de nuevo.'
      : 'El banco rechazó el pago. Liberamos el inventario; prueba con otra tarjeta.';
    showStatus('CANCELLED', msg);
  }
  payBtn.disabled = false; payBtn.textContent = 'Pagar $1,348.00 MXN';
});
$('retryBtn').addEventListener('click', () => { $('statusBox').hidden = true; $('card').focus(); });
