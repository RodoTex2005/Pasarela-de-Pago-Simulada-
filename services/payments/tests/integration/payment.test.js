
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../../src/app');

const {
  closeDatabaseConnection
} = require('../../src/infrastructure/database/mongoPaymentRepository');

const {
  closeRedisConnection
} = require('../../src/infrastructure/cache/redisIdempotency');

const {
  closeRabbitMQ
} = require('../../src/infrastructure/messaging/rabbitmqPublisher');

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
  try {
    await closeDatabaseConnection();
  } finally {
    try {
      await closeRedisConnection();
    } finally {
      try {
        await closeRabbitMQ();
      } finally {
        if (server?.listening) {
          await new Promise((resolve, reject) => {
            server.close(error => {
              if (error) reject(error);
              else resolve();
            });
          });
        }
      }
    }
  }
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

test('POST / devuelve el mismo resultado al repetir el mismo orderId', async () => {
  const orderId = `integration-idempotency-${randomUUID()}`;

  const payload = {
    orderId,
    amount: 250,
    cardNumber: '4242424242424242'
  };

  const firstResponse = await fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const firstBody = await firstResponse.json();

  const secondResponse = await fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const secondBody = await secondResponse.json();

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.equal(firstBody.approved, true);
  assert.equal(secondBody.approved, true);
  assert.equal(firstBody.payment.orderId, orderId);
  assert.equal(secondBody.payment.orderId, orderId);
  assert.equal(firstBody.payment.status, secondBody.payment.status);
  assert.equal(firstBody.payment.createdAt, secondBody.payment.createdAt);
});

test('POST / evita procesar dos pagos simultáneos con el mismo orderId', async () => {
  const orderId = `integration-concurrent-${randomUUID()}`;

  const payload = {
    orderId,
    amount: 250,
    cardNumber: '4242424242424242'
  };

  const makeRequest = () => fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const [firstResponse, secondResponse] = await Promise.all([
    makeRequest(),
    makeRequest()
  ]);

  const firstBody = await firstResponse.json();
  const secondBody = await secondResponse.json();

  const responses = [
    { status: firstResponse.status, body: firstBody },
    { status: secondResponse.status, body: secondBody }
  ];

  // Una solicitud puede completar el pago y la otra reutilizar
  // el resultado o recibir 409 si el procesamiento sigue en curso.
  for (const response of responses) {
    assert.ok(
      [200, 409].includes(response.status),
      `Estado HTTP inesperado: ${response.status}`
    );

    if (response.status === 200) {
      assert.equal(response.body.payment.orderId, orderId);
      assert.equal(response.body.payment.status, 'APPROVED');
      assert.equal(response.body.approved, true);
    } else {
      assert.match(response.body.error, /procesando un pago/i);
    }
  }

  // Al menos una solicitud debe completar el pago.
  assert.ok(
    responses.some(response => response.status === 200),
    'Al menos una solicitud debe completar el pago'
  );
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
    body: '{"orderIsi, ted":'
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /JSON inválido/i);
});
