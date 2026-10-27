
const TIMEOUT_MS = 2000;
const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 10000;

let state = 'CLOSED';
let consecutiveFailures = 0;
let openedAt = 0;
let halfOpenRequestInProgress = false;

async function executeWithCircuitBreaker(operation) {
  // Si el circuito está abierto, comprobar si ya puede probar de nuevo.
  if (state === 'OPEN') {
    if (Date.now() - openedAt < RESET_TIMEOUT_MS) {
      return {
        approved: false,
        status: 'TIMEOUT',
        message: 'Circuit Breaker abierto: banco temporalmente no disponible'
      };
    }

    state = 'HALF_OPEN';
  }

  // En HALF_OPEN solo permitimos una petición de prueba.
  if (state === 'HALF_OPEN' && halfOpenRequestInProgress) {
    return {
      approved: false,
      status: 'TIMEOUT',
      message: 'Circuit Breaker comprobando la disponibilidad del banco'
    };
  }

  const wasHalfOpen = state === 'HALF_OPEN';

  if (wasHalfOpen) {
    halfOpenRequestInProgress = true;
  }

  let timeoutId;

  try {
    const result = await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error('El banco superó el límite de 2 segundos');
          error.code = 'BANK_TIMEOUT';
          reject(error);
        }, TIMEOUT_MS);
      })
    ]);

    if (result.status === 'TIMEOUT') {
      throw new Error(result.message);
    }

    // Un rechazo bancario normal no significa que el banco esté caído.
    consecutiveFailures = 0;
    state = 'CLOSED';

    return result;
  } catch (error) {
    consecutiveFailures++;
    console.log(
  `[Circuit Breaker] Fallos consecutivos: ${consecutiveFailures}, estado: ${state}`
    );

    if (wasHalfOpen || consecutiveFailures >= FAILURE_THRESHOLD) {
      state = 'OPEN';
      openedAt = Date.now();
    }
    console.log(`[Circuit Breaker] Estado actual: ${state}`);

    return {
      approved: false,
      status: 'TIMEOUT',
      message: error.code === 'BANK_TIMEOUT'
        ? 'El banco no respondió dentro de 2 segundos'
        : 'Error de comunicación con el banco simulado'
    };
  } finally {
    clearTimeout(timeoutId);

    if (wasHalfOpen) {
      halfOpenRequestInProgress = false;
    }
  }
}

module.exports = { executeWithCircuitBreaker };
