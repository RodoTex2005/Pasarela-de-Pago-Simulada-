
const {
  createPayment,
  updatePaymentStatus
} = require('../../domain/entities/payment');

const {
  simulateBankPayment
} = require('../../infrastructure/bank/bankSimulator');

const {
  executeWithCircuitBreaker
} = require('../../infrastructure/bank/circuitBreaker');

async function processPayment(data) {
  // 1. Validar y crear el pago.
  let payment;

  try {
    payment = createPayment(data);
  } catch (error) {
    const validationError = new Error(error.message);
    validationError.statusCode = 400;
    throw validationError;
  }

  // 2. Consultar el banco simulado.
const bankResult = await executeWithCircuitBreaker(
  () => simulateBankPayment(payment.cardNumber)
);
  // 3. Actualizar el estado del pago.
  payment = updatePaymentStatus(payment, bankResult.status);

  // 4. No devolver el número completo de la tarjeta.
  const { cardNumber, ...safePayment } = payment;

  return {
    payment: {
      ...safePayment,
      cardLast4: cardNumber.slice(-4)
    },
    approved: bankResult.approved,
    message: bankResult.message
  };
}

module.exports = { processPayment };
