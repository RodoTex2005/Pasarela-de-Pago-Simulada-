
require('dotenv').config();

const express = require('express');
const { processPayment } = require('./application/use-cases/processPayment');

const {
  getCachedResult,
  acquirePaymentLock,
  saveCachedResult,
  releasePaymentLock
} = require('./infrastructure/cache/redisIdempotency');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

// Comprobar que el servicio está activo.
app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'payments',
    status: 'UP',
    message: 'Microservicio de pagos funcionando correctamente'
  });
});

// Esperar brevemente a que termine una solicitud concurrente.
async function waitForCachedResult(orderId) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await getCachedResult(orderId);

    if (result) {
      return result;
    }
  }

  return null;
}

// Procesar un pago con protección de idempotencia.
app.post('/', async (req, res) => {
  let orderId;
  let lockToken;
  let paymentResult;

  try {
    orderId = req.body?.orderId;

    // Dejar que el caso de uso valide las solicitudes mal formadas.
    if (typeof orderId !== 'string' || !orderId.trim()) {
      paymentResult = await processPayment(req.body);
      const statusCode = paymentResult.approved ? 200 : 402;
      return res.status(statusCode).json(paymentResult);
    }

    orderId = orderId.trim();

    // 1. Si ya existe un resultado en Redis, reutilizarlo.
    const cachedResult = await getCachedResult(orderId);

    if (cachedResult) {
      const statusCode = cachedResult.approved ? 200 : 402;
      return res.status(statusCode).json(cachedResult);
    }

    // 2. Evitar que dos solicitudes procesen simultáneamente el mismo pedido.
    lockToken = await acquirePaymentLock(orderId);

    if (!lockToken) {
      const concurrentResult = await waitForCachedResult(orderId);

      if (concurrentResult) {
        const statusCode = concurrentResult.approved ? 200 : 402;
        return res.status(statusCode).json(concurrentResult);
      }

      return res.status(409).json({
        error: 'Ya se está procesando un pago para este pedido. Intenta de nuevo.'
      });
    }

    // 3. Revisar otra vez la caché después de adquirir el bloqueo.
    const resultAfterLock = await getCachedResult(orderId);

    if (resultAfterLock) {
      const statusCode = resultAfterLock.approved ? 200 : 402;
      return res.status(statusCode).json(resultAfterLock);
    }

    // 4. MongoDB verifica si el pedido ya tiene un pago registrado.
    paymentResult = await processPayment(req.body);

    // 5. Guardar el resultado en Redis. Si falla la caché, conservar
    // la respuesta obtenida de MongoDB/caso de uso.
    try {
      await saveCachedResult(orderId, lockToken, paymentResult);
      lockToken = undefined;
    } catch (cacheError) {
      console.error(
        '[Payments] No se pudo guardar el resultado en Redis:',
        cacheError.message
      );
    }

    const statusCode = paymentResult.approved ? 200 : 402;
    return res.status(statusCode).json(paymentResult);
  } catch (error) {
    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      error: error.statusCode
        ? error.message
        : 'Error interno al procesar el pago'
    });
  } finally {
    // Liberar el bloqueo si el flujo no lo liberó al guardar la caché.
    if (lockToken && orderId) {
      try {
        await releasePaymentLock(orderId, lockToken);
      } catch (error) {
        console.error(
          '[Payments] No se pudo liberar el bloqueo de Redis:',
          error.message
        );
      }
    }
  }
});

// Manejar solicitudes con JSON inválido.
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      error: 'El cuerpo de la solicitud contiene JSON inválido'
    });
  }

  return next(error);
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Payments ejecutándose en el puerto ${PORT}`);
  });
}

module.exports = app;
