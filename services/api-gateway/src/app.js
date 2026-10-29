require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.warn('[Gateway] Define JWT_ACCESS_SECRET con al menos 32 caracteres en .env para un uso local seguro.');
}
const pool = new Pool({
  connectionString: process.env.ORDERS_DB_URL,
  connectionTimeoutMillis: 5000,
  max: 10
});

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json({ limit: '32kb' }));

app.get('/health', (_req, res) => res.status(200).json({
  service: 'api-gateway', status: 'UP'
}));

async function initializeAuthTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_users (
      id UUID PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
const { randomUUID } = require('node:crypto');

function signToken(user) {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('Configura JWT_ACCESS_SECRET con al menos 32 caracteres.');
  }
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: '2h', issuer: 'pasarela-demo', audience: 'pasarela-store'
  });
}

app.post('/api/auth/register', async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (name.length < 3 || name.length > 120) {
    return res.status(400).json({ error: 'El nombre debe tener entre 3 y 120 caracteres.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Introduce un correo válido.' });
  }
  if (password.length < 10 || password.length > 72) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 10 y 72 caracteres.' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const id = randomUUID();
    await pool.query(
      'INSERT INTO store_users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
      [id, name, email, hash]
    );
    const user = { id, name, email };
    return res.status(201).json({ user, token: signToken(user) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese correo ya tiene una cuenta.' });
    console.error('[Auth] Error al registrar:', error.message);
    return res.status(503).json({ error: 'No se pudo crear la cuenta. Comprueba que PostgreSQL esté disponible.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Introduce correo y contraseña.' });
  try {
    const result = await pool.query(
      'SELECT id, name, email, password_hash FROM store_users WHERE email = $1',
      [email]
    );
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    const user = { id: row.id, name: row.name, email: row.email };
    return res.json({ user, token: signToken(user) });
  } catch (error) {
    console.error('[Auth] Error al iniciar sesión:', error.message);
    return res.status(503).json({ error: 'No se pudo iniciar sesión. Comprueba la base de datos.' });
  }
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Inicia sesión para realizar una compra.' });
  try {
    req.user = jwt.verify(match[1], JWT_SECRET, {
      issuer: 'pasarela-demo', audience: 'pasarela-store'
    });
    return next();
  } catch {
    return res.status(401).json({ error: 'Tu sesión venció. Inicia sesión nuevamente.' });
  }
}

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.sub, name: req.user.name, email: req.user.email } });
});

const services = {
  orders: process.env.ORDERS_SERVICE_URL || 'http://localhost:3001',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:8000',
  payments: process.env.PAYMENTS_SERVICE_URL || 'http://localhost:3002'
};

// The inventory/catalog remains public. Checkout requires a verified JWT.
app.use('/api/orders/checkout', requireAuth);
app.use('/api/orders', createProxyMiddleware({
  target: services.orders,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq, req, res) => {
      console.log(
        `[Gateway -> Orders] ${req.method} ${req.originalUrl} | destino=${services.orders}`
      );

      // Conserva el arreglo del cuerpo JSON después de express.json().
      fixRequestBody(proxyReq, req);

      proxyReq.on('error', (error) => {
        console.error('[Gateway] Error en la solicitud al servicio Orders:', error.message);
      });
    },

    proxyRes: (proxyRes, req) => {
      console.log(
        `[Orders -> Gateway] ${req.method} ${req.originalUrl} | HTTP ${proxyRes.statusCode}`
      );

      proxyRes.on('error', (error) => {
        console.error('[Gateway] Error al recibir respuesta de Orders:', error.message);
      });
    },

    error: (error, req, res) => {
      console.error(
        `[Gateway] Error de proxy en ${req.method} ${req.originalUrl}:`,
        error.message
      );

      if (!res.headersSent && !res.destroyed) {
        res.status(502).json({
          error: 'No se pudo obtener una respuesta del servicio Orders.'
        });
      }
    }
  }
}));
app.use('/api/inventory', createProxyMiddleware({ target: services.inventory, changeOrigin: true }));
app.use('/api/payments', createProxyMiddleware({ target: services.payments, changeOrigin: true }));

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

initializeAuthTable()
  .then(() => app.listen(PORT, '0.0.0.0', () => {
    console.log(`API Gateway ejecutándose en el puerto ${PORT}`);
  }))
  .catch((error) => {
    console.error('[Gateway] No se pudo inicializar autenticación:', error.message);
    process.exit(1);
  });

module.exports = { app, initializeAuthTable };
