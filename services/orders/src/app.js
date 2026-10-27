
require('dotenv').config();

const express = require('express');
const { createOrder: buildOrder } = require('./domain/entities/order');
const { processOrderSaga } = require('./application/saga/processOrderSaga');

const app = express();

// Almacenamiento temporal.
// Más adelante se sustituirá por PostgreSQL.
const orders = new Map();

app.use(express.json());

// Comprobar que el servicio está activo.
app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'orders',
    status: 'UP'
  });
});

// Crear y validar un pedido.

function createOrder(req, res) {
  try {
    const order = buildOrder(req.body);

    orders.set(order.id, order);

    return order;
  } catch (error) {
    res.status(400).json({
      error: error.message
    });

    return null;
  }
}


// Crear un pedido sin iniciar el pago.
app.post('/', (req, res) => {
  const order = createOrder(req, res);

  if (!order) {
    return;
  }

  return res.status(201).json({
    message: 'Pedido creado correctamente',
    order
  });
});

// Ejecutar la Saga: inventario -> pago -> confirmación.
app.post('/checkout', async (req, res) => {
  const { cardNumber } = req.body;
  const order = createOrder(req, res);

  if (!order) {
    return;
  }

  if (typeof cardNumber !== 'string' || !/^\d{16}$/.test(cardNumber)) {
    order.status = 'CANCELLED';
    order.updatedAt = new Date().toISOString();

    return res.status(400).json({
      message: 'Pedido cancelado: se requiere una tarjeta de prueba de 16 dígitos.',
      order
    });
  }

  try {
    const result = await processOrderSaga({
      order,
      cardNumber,
      updateOrderStatus: (status) => {
        order.status = status;
        order.updatedAt = new Date().toISOString();
        orders.set(order.id, order);
      }
    });

    if (result.success) {
      return res.status(200).json(result);
    }

    // Si no se pudo completar una compensación o confirmar
    // el inventario, informamos que requiere atención.
    if (
      result.stage === 'INVENTORY_RELEASE' ||
      result.stage === 'INVENTORY_CONFIRMATION'
    ) {
      return res.status(500).json(result);
    }

    return res.status(409).json(result);
  } catch (error) {
    console.error('[Orders Saga] Error inesperado:', error.message);

    return res.status(500).json({
      message: 'Ocurrió un error inesperado al procesar el pedido.',
      order
    });
  }
});

// Consultar un pedido por ID.
app.get('/:id', (req, res) => {
  const order = orders.get(req.params.id);

  if (!order) {
    return res.status(404).json({
      error: 'Pedido no encontrado'
    });
  }

  return res.status(200).json({ order });
});

module.exports = app;