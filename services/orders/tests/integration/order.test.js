const request = require('supertest');
const { app } = require('../../src/app');

describe('Integración del servicio Orders', () => {
  test('GET /health debe indicar que el servicio está activo', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      service: 'orders',
      status: 'UP',
      database: 'connected'
    });
  });

  test('POST / debe crear un pedido válido', async () => {
    const response = await request(app)
      .post('/')
      .send({
        customer: 'Cliente de integración',
        items: [
          {
            productId: 'laptop-001',
            quantity: 1
          }
        ],
        total: 1348
      });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Pedido creado correctamente');
    expect(response.body.order).toEqual(
      expect.objectContaining({
        customer: 'Cliente de integración',
        total: 1348,
        status: 'PENDING'
      })
    );
    expect(response.body.order.id).toBeDefined();
  });

  test('POST / debe rechazar un pedido sin artículos', async () => {
    const response = await request(app)
      .post('/')
      .send({
        customer: 'Cliente de integración',
        items: [],
        total: 1348
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      'El pedido debe contener al menos un artículo.'
    );
  });
});