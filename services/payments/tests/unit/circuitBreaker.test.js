
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  executeWithCircuitBreaker
} = require('../../src/infrastructure/bank/circuitBreaker');

test('permite una operación exitosa', async () => {
  const result = await executeWithCircuitBreaker(async () => ({
    approved: true,
    status: 'APPROVED',
    message: 'Pago aprobado'
  }));

  assert.equal(result.approved, true);
  assert.equal(result.status, 'APPROVED');
});

test('convierte un timeout en un resultado TIMEOUT', async () => {
  const result = await executeWithCircuitBreaker(
    () => new Promise((resolve) => setTimeout(() => resolve({
      approved: true,
      status: 'APPROVED',
      message: 'Tarde'
    }), 2500))
  );

  assert.equal(result.approved, false);
  assert.equal(result.status, 'TIMEOUT');
  assert.match(result.message, /2 segundos/);
});
