
const { Pool } = require('pg');

const connectionString = process.env.ORDERS_DB_URL;

if (!connectionString) {
  throw new Error('Falta configurar la variable ORDERS_DB_URL.');
}

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
  max: 10
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      customer VARCHAR(255) NOT NULL,
      items JSONB NOT NULL,
      total NUMERIC(12, 2) NOT NULL CHECK (total > 0),
      status VARCHAR(20) NOT NULL
        CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED')),
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log('[Orders] Tabla orders verificada en PostgreSQL.');
}

async function createOrderRecord(order) {
  const result = await pool.query(
    `INSERT INTO orders (id, customer, items, total, status, created_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING *`,
    [
      order.id,
      order.customer,
      JSON.stringify(order.items),
      order.total,
      order.status,
      order.createdAt
    ]
  );

  return mapOrder(result.rows[0]);
}

async function updateOrderStatus(orderId, status) {
  const result = await pool.query(
    `UPDATE orders
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [orderId, status]
  );

  if (result.rowCount === 0) {
    throw new Error(`No se encontró el pedido ${orderId}.`);
  }

  return mapOrder(result.rows[0]);
}

async function getOrderById(orderId) {
  const result = await pool.query(
    'SELECT * FROM orders WHERE id = $1',
    [orderId]
  );

  return result.rowCount === 0 ? null : mapOrder(result.rows[0]);
}

function mapOrder(row) {
  return {
    id: row.id,
    customer: row.customer,
    items: row.items,
    total: Number(row.total),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

async function closeDatabaseConnection() {
  await pool.end();
}

module.exports = {
  pool,
  initializeDatabase,
  createOrderRecord,
  updateOrderStatus,
  getOrderById,
  closeDatabaseConnection
};
