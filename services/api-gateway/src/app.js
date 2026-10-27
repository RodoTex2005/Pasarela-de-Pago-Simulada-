
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Verifica que el API Gateway esté funcionando.
app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'api-gateway',
    status: 'UP',
    message: 'API Gateway funcionando correctamente'
  });
});

// Direcciones de los microservicios.
// En Docker se usarán los nombres de los servicios.
const services = {
  orders: process.env.ORDERS_SERVICE_URL || 'http://localhost:3001',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:8000',
  payments: process.env.PAYMENTS_SERVICE_URL || 'http://localhost:3002'
};

// Redirige las peticiones al servicio correspondiente.
app.use(
  '/api/orders',
  createProxyMiddleware({
    target: services.orders,
    changeOrigin: true
  })
);

app.use(
  '/api/inventory',
  createProxyMiddleware({
    target: services.inventory,
    changeOrigin: true
  })
);

app.use(
  '/api/payments',
  createProxyMiddleware({
    target: services.payments,
    changeOrigin: true
  })
);

// Ruta para peticiones inexistentes.
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.originalUrl
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Gateway ejecutándose en el puerto ${PORT}`);
});
