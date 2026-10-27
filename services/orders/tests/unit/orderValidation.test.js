
const { createOrder } = require('../../src/domain/entities/order');

describe('Validación de pedidos', () => {
  test('debe crear un pedido válido con estado PENDING', () => {
    const order = createOrder({
      customer: 'Cliente de prueba',
      items: [
        {
          productId: 'laptop-001',
          quantity: 1
        }
      ],
      total: 1348
    });

    expect(order.id).toBeDefined();
    expect(order.customer).toBe('Cliente de prueba');
    expect(order.total).toBe(1348);
    expect(order.status).toBe('PENDING');
    expect(order.items).toHaveLength(1);
  });

  test('debe rechazar un cliente vacío', () => {
    expect(() =>
      createOrder({
        customer: '',
        items: [{ productId: 'laptop-001', quantity: 1 }],
        total: 1348
      })
    ).toThrow('Se requiere un cliente válido.');
  });

  test('debe rechazar una lista de artículos vacía', () => {
    expect(() =>
      createOrder({
        customer: 'Cliente de prueba',
        items: [],
        total: 1348
      })
    ).toThrow('El pedido debe contener al menos un artículo.');
  });

  test.each([0, -100, NaN, Infinity, '1348'])(
    'debe rechazar el total inválido: %s',
    (total) => {
      expect(() =>
        createOrder({
          customer: 'Cliente de prueba',
          items: [{ productId: 'laptop-001', quantity: 1 }],
          total
        })
      ).toThrow('El total debe ser un número positivo.');
    }
  );
});
