'use strict';

/* ---------- Tema claro / oscuro / sistema ---------- */
const root = document.documentElement;
const themeBtn = document.getElementById('themeBtn');
const MODES = ['system', 'light', 'dark'];
const LABELS = { system: 'sistema', light: 'claro', dark: 'oscuro' };

function currentMode() {
  return root.dataset.theme || 'system';
}

function setMode(mode) {
  if (mode === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = mode;
  }

  try {
    mode === 'system'
      ? localStorage.removeItem('theme')
      : localStorage.setItem('theme', mode);
  } catch (e) {}

  themeBtn.textContent = 'Tema: ' + LABELS[mode];
}

themeBtn.addEventListener('click', () => {
  setMode(MODES[(MODES.indexOf(currentMode()) + 1) % MODES.length]);
});

setMode(currentMode());

/* ---------- Validaciones ---------- */
const $ = (id) => document.getElementById(id);

function luhn(num) {
  let sum = 0;
  let dbl = false;

  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);

    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }

    sum += d;
    dbl = !dbl;
  }

  return sum % 10 === 0;
}

const rules = {
  name: (v) =>
    v.trim().length >= 3 || 'Escribe tu nombre completo.',

  email: (v) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ||
    'Escribe un correo válido, por ejemplo nombre@correo.com.',

  address: (v) =>
    v.trim().length >= 8 || 'Escribe calle, número y colonia.',

  card: (v) => {
    const n = v.replace(/\s/g, '');
    return (/^\d{16}$/.test(n) && luhn(n)) ||
      'Escribe una tarjeta de prueba válida de 16 dígitos.';
  },

  exp: (v) => {
    const m = v.match(/^(\d{2})\/(\d{2})$/);

    if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) {
      return 'Usa el formato MM/AA, por ejemplo 12/28.';
    }

    const end = new Date(2000 + Number(m[2]), Number(m[1]), 1);

    return end > new Date() || 'La tarjeta está vencida.';
  },

  cvv: (v) =>
    /^\d{3,4}$/.test(v) || 'El CVV tiene 3 o 4 dígitos.'
};

function validateField(id) {
  const input = $(id);
  const result = rules[id](input.value);
  const error = $(id + '-err');

  input.setAttribute('aria-invalid', result === true ? 'false' : 'true');
  error.textContent = result === true ? '' : result;

  return result === true;
}

Object.keys(rules).forEach((id) => {
  $(id).addEventListener('blur', () => validateField(id));
});

/* ---------- Formato asistido ---------- */
$('card').addEventListener('input', (e) => {
  e.target.value = e.target.value
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();
});

$('exp').addEventListener('input', (e) => {
  const value = e.target.value.replace(/\D/g, '').slice(0, 4);

  e.target.value = value.length > 2
    ? value.slice(0, 2) + '/' + value.slice(2)
    : value;
});

$('cvv').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

/* ---------- Checkout conectado al backend real ---------- */
const API_URL = 'http://localhost:3000/api/orders/checkout';
const INVENTORY_URL = 'http://localhost:3000/api/inventory/products';
const token = localStorage.getItem('storeToken');
if (!token) {
  const guard = $('authGuard');
  if (guard) guard.hidden = false;
  const checkoutForm = $('checkout');
  if (checkoutForm) checkoutForm.hidden = true;
  location.replace('login.html?next=checkout');
}
let checkoutItems = [];
let checkoutProducts = [];
const money = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
async function loadCartSummary() {
  try {
    checkoutItems = JSON.parse(localStorage.getItem('storeCart') || '[]');
    const r = await fetch(INVENTORY_URL);
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || 'No se pudo consultar el inventario.');
    checkoutProducts = d.products || [];
    if (!checkoutItems.length) checkoutItems = [{ productId: 'laptop-001', quantity: 1 }];
    const summary = $('cartSummary');
    if (summary) {
      summary.replaceChildren();
      let total = 0;
      for (const item of checkoutItems) {
        const product = checkoutProducts.find(p => p.id === item.productId);
        if (!product) continue;
        total += product.price * item.quantity;
        const li = document.createElement('li');
        const name = document.createElement('strong'); name.textContent = product.name;
        const qty = document.createElement('span'); qty.className = 'muted'; qty.textContent = `Cantidad: ${item.quantity}`;
        const price = document.createElement('span'); price.className = 'num'; price.textContent = money(product.price * item.quantity);
        li.append(name, qty, price); summary.append(li);
      }
      const totalLabel = document.querySelector('.totals .total dd');
      const subtotal = document.querySelector('.totals div:first-child dd');
      if (totalLabel) totalLabel.textContent = money(total) + ' MXN';
      if (subtotal) subtotal.textContent = money(total);
      payBtn.textContent = 'Pagar ' + money(total);
    }
  } catch (e) {
    showStatus('ERROR', 'No se pudo cargar el carrito o consultar inventario. Regresa a la tienda e inténtalo de nuevo.');
  }
}
loadCartSummary();

const ICONS = {
  PENDING: '<span class="spin" aria-hidden="true">⏳</span>',
  CONFIRMED: '<span aria-hidden="true">✔</span>',
  CANCELLED: '<span aria-hidden="true">✖</span>',
  ERROR: '<span aria-hidden="true">!</span>'
};

const TEXT = {
  PENDING: 'Procesando',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
  ERROR: 'Revisar estado'
};

function showStatus(state, message, orderId = '') {
  const box = $('statusBox');
  const badge = $('badge');

  box.hidden = false;
  box.dataset.state = state;
  badge.dataset.state = state;
  badge.innerHTML = (ICONS[state] || ICONS.ERROR) +
    ' ' + (TEXT[state] || TEXT.ERROR);

  $('orderId').textContent = orderId;
  $('statusMsg').textContent = message;

  $('retryBtn').hidden = state !== 'CANCELLED';
}

const form = $('checkout');
const payBtn = $('payBtn');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const valid = Object.keys(rules).map(validateField);

  if (valid.includes(false)) {
    document.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  payBtn.disabled = true;
  payBtn.textContent = 'Procesando…';

  showStatus(
    'PENDING',
    'Enviando el pedido al backend. Se está procesando la reserva y el pago.'
  );

  $('statusBox').scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  });

  try {
  const cardNumber = $('card').value.replace(/\s/g, '');

  const cartItems = JSON.parse(localStorage.getItem('storeCart') || '[]');
  const payload = {
    customer: $('name').value.trim(),
    items: cartItems.length ? cartItems : [{ productId: 'laptop-001', quantity: 1 }],
    total: checkoutItems.reduce((sum, item) => {
      const product = checkoutProducts.find(p => p.id === item.productId);
      return sum + (product ? product.price * item.quantity : 0);
    }, 0),
    cardNumber
  };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });

    let result;

    try {
      result = await response.json();
    } catch {
      result = {};
    }

    const orderId = result.order?.id || '';

    if (response.ok && result.success === true) {
      showStatus(
        'CONFIRMED',
        result.message || 'El backend confirmó el pedido y el pago.',
        orderId
      );
    } else if (result.stage === 'INVENTORY_CONFIRMATION') {
      showStatus(
        'ERROR',
        (result.message || 'No se pudo confirmar el inventario.') +
          ' Atención: el pago pudo haber sido aprobado. Revisa el estado del pedido antes de volver a intentarlo.',
        orderId
      );
    } else if (result.stage === 'INVENTORY_RELEASE') {
      showStatus(
        'ERROR',
        (result.message || 'Falló la liberación del inventario.') +
          ' Se requiere revisar el estado del pedido antes de reintentar.',
        orderId
      );
    } else if (result.order?.status === 'CANCELLED' || response.status === 409) {
      showStatus(
        'CANCELLED',
        result.message || 'El backend no pudo completar la compra. El pedido fue cancelado.',
        orderId
      );
    } else {
      showStatus(
        'ERROR',
        result.message || result.error ||
          `El servidor respondió con HTTP ${response.status}. Revisa el estado del pedido antes de reintentar.`,
        orderId
      );
    }
  } catch (error) {
    showStatus(
      'ERROR',
      'No se pudo contactar con el API Gateway. Comprueba que Docker y el servicio del puerto 3000 estén activos. No vuelvas a enviar el pedido hasta comprobar si el servidor lo recibió.'
    );
  } finally {
  payBtn.disabled = false;

  const total = checkoutItems.reduce((sum, item) => {
    const product = checkoutProducts.find(p => p.id === item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  payBtn.textContent = 'Pagar ' + money(total);
}
});

$('retryBtn').addEventListener('click', () => {
  $('statusBox').hidden = true;
  $('card').focus();
});
