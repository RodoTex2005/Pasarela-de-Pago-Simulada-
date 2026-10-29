
require('dotenv').config();

const express = require('express');
const { createOrder: buildOrder } = require('./domain/entities/order');
const { processOrderSaga } = require('./application/saga/processOrderSaga');

const {
  initializeDatabase,
  createOrderRecord,
  updateOrderStatus: saveOrderStatus,
  getOrderById
} = require('./infrastructure/database/orderRepository');

const app = express();

app.use(express.json());

// Comprobar que el servicio está activo.
app.get('/health', async (req, res) => {
  try {
    const { pool } = require('./infrastructure/database/orderRepository');
    await pool.query('SELECT 1');

    return res.status(200).json({
      service: 'orders',
      status: 'UP',
      database: 'connected'
    });
  } catch (error) {
    return res.status(503).json({
      service: 'orders',
      status: 'DOWN',
      database: 'disconnected'
    });
  }
});

// Crear un pedido en PostgreSQL.
async function createOrder(req, res) {
  try {
    const order = buildOrder(req.body);
    return await createOrderRecord(order);
  } catch (error) {
    if (error.message?.includes('Se requiere') ||
        error.message?.includes('El pedido')) {
      res.status(400).json({ error: error.message });
      return null;
    }

    console.error('[Orders] Error al guardar el pedido:', error.message);
    res.status(500).json({ error: 'No se pudo guardar el pedido.' });
    return null;
  }
}

// Crear un pedido sin iniciar el pago.
app.post('/', async (req, res) => {
  const order = await createOrder(req, res);

  if (!order) return;

  return res.status(201).json({
    message: 'Pedido creado correctamente',
    order
  });
});

// Ejecutar la Saga: inventario -> pago -> confirmación.
app.post('/checkout', async (req, res) => {
  const { cardNumber } = req.body;
  const order = await createOrder(req, res);

  if (!order) return;

  if (typeof cardNumber !== 'string' || !/^\d{16}$/.test(cardNumber)) {
    try {
      const cancelledOrder = await saveOrderStatus(order.id, 'CANCELLED');

      return res.status(400).json({
        message: 'Pedido cancelado: se requiere una tarjeta de prueba de 16 dígitos.',
        order: cancelledOrder
      });
    } catch (error) {
      console.error('[Orders] Error al cancelar el pedido:', error.message);
      return res.status(500).json({
        message: 'No se pudo actualizar el estado del pedido.'
      });
    }
  }

  // La función se usa desde la Saga para persistir cada cambio de estado.
  const persistOrderStatus = async (status) => {
    const updatedOrder = await saveOrderStatus(order.id, status);
    Object.assign(order, updatedOrder);
  };

  try {
    const result = await processOrderSaga({
      order,
      cardNumber,
      updateOrderStatus: persistOrderStatus
    });

    if (result.success) {
      return res.status(200).json(result);
    }

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
app.get('/:id', async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({
        error: 'Pedido no encontrado'
      });
    }

    return res.status(200).json({ order });
  } catch (error) {
    console.error('[Orders] Error al consultar el pedido:', error.message);

    return res.status(500).json({
      error: 'No se pudo consultar el pedido.'
    });
  }
});

module.exports = { app, initializeDatabase };
