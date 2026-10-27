
const { processOrderSaga } = require('../../src/application/saga/processOrderSaga');

describe('Saga de procesamiento de pedidos', () => {
  const originalFetch = global.fetch;

  const order = {
    id: 'order-test-001',
    customer: 'Cliente de prueba',
    items: [{ productId: 'laptop-001', quantity: 1 }],
    total: 1348,
    status: 'PENDING'
  };

  let updateOrderStatus;

  function mockResponse(body, ok = true) {
    return {
      ok,
      json: async () => body
    };
  }

  beforeEach(() => {
    global.fetch = jest.fn();

    // Actualiza el estado del pedido cuando la Saga lo modifica.
    updateOrderStatus = jest.fn((status) => {
      order.status = status;
    });

    order.status = 'PENDING';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('debe confirmar el pedido cuando el pago es aprobado', async () => {
    const currentOrder = { ...order };

    global.fetch
      .mockResolvedValueOnce(mockResponse({ success: true }))
      .mockResolvedValueOnce(mockResponse({
        approved: true,
        payment: { status: 'APPROVED' }
      }))
      .mockResolvedValueOnce(mockResponse({ success: true }));

    const result = await processOrderSaga({
      order: currentOrder,
      cardNumber: '4242424242424242',
      updateOrderStatus: (status) => {
        currentOrder.status = status;
        updateOrderStatus(status);
      }
    });

    expect(result.success).toBe(true);
    expect(result.order.status).toBe('CONFIRMED');
    expect(updateOrderStatus).toHaveBeenCalledWith('CONFIRMED');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test('debe cancelar el pedido y liberar inventario si el pago es rechazado', async () => {
    const currentOrder = { ...order };

    global.fetch
      .mockResolvedValueOnce(mockResponse({ success: true }))
      .mockResolvedValueOnce(mockResponse({
        approved: false,
        message: 'El banco rechazó el pago',
        payment: { status: 'REJECTED' }
      }, false))
      .mockResolvedValueOnce(mockResponse({ success: true }));

    const result = await processOrderSaga({
      order: currentOrder,
      cardNumber: '4000000000000002',
      updateOrderStatus: (status) => {
        currentOrder.status = status;
        updateOrderStatus(status);
      }
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe('PAYMENT');
    expect(result.order.status).toBe('CANCELLED');
    expect(updateOrderStatus).toHaveBeenCalledWith('CANCELLED');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[2][0]).toContain('/release/order-test-001');
  });

  test('debe cancelar el pedido y liberar inventario si el pago termina en timeout', async () => {
    const currentOrder = { ...order };

    global.fetch
      .mockResolvedValueOnce(mockResponse({ success: true }))
      .mockResolvedValueOnce(mockResponse({
        approved: false,
        message: 'El banco no respondió dentro de 2 segundos',
        payment: { status: 'TIMEOUT' }
      }, false))
      .mockResolvedValueOnce(mockResponse({ success: true }));

    const result = await processOrderSaga({
      order: currentOrder,
      cardNumber: '4000000000000119',
      updateOrderStatus: (status) => {
        currentOrder.status = status;
        updateOrderStatus(status);
      }
    });

    expect(result.success).toBe(false);
    expect(result.stage).toBe('PAYMENT');
    expect(result.order.status).toBe('CANCELLED');
    expect(updateOrderStatus).toHaveBeenCalledWith('CANCELLED');
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[2][0]).toContain('/release/order-test-001');
  });
});
