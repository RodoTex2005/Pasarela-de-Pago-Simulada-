const { randomUUID } = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../../src/app');

const {
  closeDatabaseConnection
} = require('../../src/infrastructure/database/mongoPaymentRepository');


const approvedOrderId = `integration-approved-${randomUUID()}`;
const rejectedOrderId = `integration-rejected-${randomUUID()}`;

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error);
      else resolve();
    });
  });

  await closeDatabaseConnection();
});

test('GET /health devuelve que Payments está activo', async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.service, 'payments');
  assert.equal(body.status, 'UP');
});

test('POST / aprueba un pago válido', async () => {
  const response = await fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: approvedOrderId,
      amount: 250,
      cardNumber: '4242424242424242'
    })
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.approved, true);
  assert.equal(body.payment.status, 'APPROVED');
  assert.equal(body.payment.cardLast4, '4242');
  assert.equal('cardNumber' in body.payment, false);
  assert.equal(JSON.stringify(body).includes('4242424242424242'), false);
});

test('POST / rechaza una tarjeta rechazada por el simulador', async () => {
  const response = await fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: rejectedOrderId,
      amount: 250,
      cardNumber: '4000000000000002'
    })
  });

  const body = await response.json();

  assert.equal(response.status, 402);
  assert.equal(body.approved, false);
  assert.equal(body.payment.status, 'REJECTED');
});

test('POST / devuelve 400 cuando los datos son inválidos', async () => {
  const response = await fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: 'integration-invalid-001',
      amount: -10,
      cardNumber: '1234'
    })
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /monto debe ser un número positivo/i);
});

test('POST / devuelve 400 cuando el JSON es inválido', async () => {
  const response = await fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"orderId":'
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /JSON inválido/i);
});

