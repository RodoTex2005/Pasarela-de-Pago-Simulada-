
const VALID_STATUSES = ['APPROVED', 'REJECTED', 'TIMEOUT'];

function createPayment({ orderId, amount, cardNumber }) {
  if (!orderId || typeof orderId !== 'string') {
    throw new Error('Se requiere un identificador de pedido válido');
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('El monto debe ser un número positivo');
  }

  if (typeof cardNumber !== 'string' || !/^\d{16}$/.test(cardNumber)) {
    throw new Error('El número de tarjeta debe contener 16 dígitos');
  }

  return {
    orderId,
    amount,
    cardNumber,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };
}

function updatePaymentStatus(payment, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error('Estado de pago no válido');
  }

  return {
    ...payment,
    status,
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  createPayment,
  updatePaymentStatus
};
