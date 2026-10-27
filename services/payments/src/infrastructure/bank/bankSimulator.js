
const APPROVED_CARD = '4242424242424242';
const REJECTED_CARD = '4000000000000002';
const DELAYED_CARD = '4000000000000119';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateBankPayment(cardNumber) {
  if (cardNumber === DELAYED_CARD) {
    // Simula un banco que tarda 3 segundos.
    await wait(3000);

    return {
      approved: false,
      status: 'TIMEOUT',
      message: 'El banco simulado tardó demasiado en responder'
    };
  }

  if (cardNumber === REJECTED_CARD) {
    return {
      approved: false,
      status: 'REJECTED',
      message: 'El banco rechazó el pago'
    };
  }

  if (cardNumber === APPROVED_CARD) {
    return {
      approved: true,
      status: 'APPROVED',
      message: 'Pago aprobado correctamente'
    };
  }

  return {
    approved: false,
    status: 'REJECTED',
    message: 'Tarjeta de prueba no reconocida'
  };
}

module.exports = { simulateBankPayment };
