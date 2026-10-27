
const { randomUUID } = require('node:crypto');

function createOrder({ customer, items, total }) {
  if (!customer || typeof customer !== 'string') {
    throw new Error('Se requiere un cliente válido.');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('El pedido debe contener al menos un artículo.');
  }

  if (
    typeof total !== 'number' ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    throw new Error('El total debe ser un número positivo.');
  }

  return {
    id: randomUUID(),
    customer,
    items,
    total,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };
}

module.exports = { createOrder };
