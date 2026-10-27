
require('dotenv').config();

const express = require('express');
const { processPayment } = require('./application/use-cases/processPayment');

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

// Procesar un pago simulado.
app.post('/', async (req, res) => {
  try {
    const result = await processPayment(req.body);

    const statusCode = result.approved ? 200 : 402;

    return res.status(statusCode).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Error interno al procesar el pago'
    });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Payments ejecutándose en el puerto ${PORT}`);
});
