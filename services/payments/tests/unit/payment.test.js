
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPayment,
  updatePaymentStatus
} = require('../../src/domain/entities/payment');

test('crea un pago con estado PENDING', () => {
  const payment = createPayment({
    orderId: 'order-001',
    amount: 250,
    cardNumber: '4242424242424242'
  });

  assert.equal(payment.status, 'PENDING');
  assert.equal(payment.amount, 250);
  assert.equal(payment.orderId, 'order-001');
  assert.ok(payment.createdAt);
});

test('rechaza un monto negativo', () => {
  assert.throws(
    () => createPayment({
      orderId: 'order-001',
      amount: -10,
      cardNumber: '4242424242424242'
    }),
    /monto debe ser un número positivo/
  );
});

test('rechaza una tarjeta que no tiene 16 dígitos', () => {
  assert.throws(
    () => createPayment({
      orderId: 'order-001',
      amount: 250,
      cardNumber: '1234'
    }),
    /tarjeta debe contener 16 dígitos/
  );
});

test('actualiza el estado a APPROVED', () => {
  const payment = createPayment({
    orderId: 'order-002',
    amount: 100,
    cardNumber: '4242424242424242'
  });

  const updated = updatePaymentStatus(payment, 'APPROVED');

  assert.equal(updated.status, 'APPROVED');
  assert.ok(updated.updatedAt);
});

test('rechaza un estado de pago inválido', () => {
  const payment = createPayment({
    orderId: 'order-003',
    amount: 100,
    cardNumber: '4242424242424242'
  });

  assert.throws(
    () => updatePaymentStatus(payment, 'INVALID'),
    /Estado de pago no válido/
  );
});
