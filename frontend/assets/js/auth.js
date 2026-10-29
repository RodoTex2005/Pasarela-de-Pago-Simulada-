'use strict';
const API = 'http://localhost:3000/api';
const form = document.getElementById('authForm');
const msg = document.getElementById('message');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = document.getElementById('submitBtn');
  button.disabled = true; msg.textContent = 'Procesando…';
  const isRegister = location.pathname.endsWith('register.html');
  const payload = { email: document.getElementById('email').value.trim(), password: document.getElementById('password').value };
  if (isRegister) payload.name = document.getElementById('name').value.trim();
  try {
    const r = await fetch(`${API}/auth/${isRegister ? 'register' : 'login'}`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
    localStorage.setItem('storeToken', data.token);
    localStorage.setItem('storeUser', JSON.stringify(data.user));
    const next = new URLSearchParams(location.search).get('next');
    location.href = next === 'checkout' ? 'index.html' : 'store.html';
  } catch (err) { msg.textContent = err.message || 'No se pudo conectar con el servidor.'; }
  finally { button.disabled = false; }
});