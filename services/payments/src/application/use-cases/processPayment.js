
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

const {
  publishPaymentEvent
} = require('../../infrastructure/messaging/rabbitmqPublisher');

const {
  savePayment,
  getPaymentByOrderId
} = require('../../infrastructure/database/mongoPaymentRepository');

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

    // Si el pedido ya tiene un pago guardado, no volver a consultar al banco.
  const existingPayment = await getPaymentByOrderId(payment.orderId);

  if (existingPayment) {
    const approved = existingPayment.status === 'APPROVED';

    const messages = {
      APPROVED: 'Pago aprobado correctamente',
      REJECTED: 'Pago rechazado por el banco simulado',
      TIMEOUT: 'El banco no respondió dentro del tiempo permitido'
    };

    return {
      payment: {
        orderId: existingPayment.orderId,
        amount: existingPayment.amount,
        status: existingPayment.status,
        createdAt: existingPayment.createdAt,
        updatedAt: existingPayment.updatedAt,
        cardLast4: existingPayment.cardLast4
      },
      approved,
      message: messages[existingPayment.status] ||
        'El pedido ya tiene un registro de pago'
    };
  }
  // 2. Consultar el banco simulado.
  const bankResult = await executeWithCircuitBreaker(
    () => simulateBankPayment(payment.cardNumber)
  );

  // 3. Actualizar el estado del pago.
  payment = updatePaymentStatus(payment, bankResult.status);

  // 4. Guardar el resultado en MongoDB.
  // El repositorio excluye el número completo de la tarjeta.
  await savePayment(payment);

  // 5. Publicar el evento sin alterar el resultado del pago
// si RabbitMQ está temporalmente fuera de servicio.
try {
  await publishPaymentEvent({
    payment: {
      orderId: payment.orderId,
      status: payment.status
    },
    approved: bankResult.approved
  });
} catch (error) {
  console.error(
    '[Payments] No se pudo publicar el evento en RabbitMQ:',
    error.message
  );
}
  // 5. Preparar una respuesta segura para el cliente.
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
