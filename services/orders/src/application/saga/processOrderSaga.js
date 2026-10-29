
const INVENTORY_URL =
  process.env.INVENTORY_SERVICE_URL || 'http://localhost:8000';

const PAYMENTS_URL =
  process.env.PAYMENTS_SERVICE_URL || 'http://localhost:3002';

async function readResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function releaseInventory(orderId) {
  const response = await fetch(
    `${INVENTORY_URL}/release/${encodeURIComponent(orderId)}`,
    { method: 'POST' }
  );

  const result = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      result.detail || result.error || 'No se pudo liberar el inventario'
    );
  }

  return result;
}

async function processOrderSaga({
  order,
  cardNumber,
  updateOrderStatus
}) {
  // 1. Reservar el inventario.
  try {
    const response = await fetch(`${INVENTORY_URL}/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
    order_id: order.id,
    items: order.items.map((item) => ({
      productId: item.productId || item.product_id,
      quantity: item.quantity
        }))
      })
    });

    const result = await readResponse(response);

    if (!response.ok) {
      throw new Error(
        result.detail || result.error || 'No se pudo reservar el inventario'
      );
    }
  } catch (error) {
    await updateOrderStatus('CANCELLED');

    return {
      success: false,
      order,
      message: `Pedido cancelado: ${error.message}`,
      stage: 'INVENTORY_RESERVATION'
    };
  }

  // 2. Procesar el pago.
  let paymentResult;

  try {
    const response = await fetch(PAYMENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        amount: order.total,
        cardNumber
      })
    });

    paymentResult = await readResponse(response);

    if (!response.ok || !paymentResult.approved) {
      const message =
        paymentResult.message ||
        paymentResult.error ||
        'El pago fue rechazado';

      throw new Error(message);
    }
  } catch (error) {
    // 3. Compensación: liberar el inventario si falla el pago.
    try {
      await releaseInventory(order.id);
    } catch (compensationError) {
      return {
        success: false,
        order,
        message: 'Falló el pago y no se pudo confirmar la liberación del inventario.',
        error: compensationError.message,
        stage: 'INVENTORY_RELEASE'
      };
    }

    await updateOrderStatus('CANCELLED');

    return {
      success: false,
      order,
      payment: paymentResult?.payment,
      message: `Pedido cancelado: ${error.message}`,
      stage: 'PAYMENT'
    };
  }

  // 4. El pago fue aprobado: confirmar el inventario.
  try {
    const response = await fetch(
      `${INVENTORY_URL}/confirm/${encodeURIComponent(order.id)}`,
      { method: 'POST' }
    );

    const result = await readResponse(response);

    if (!response.ok) {
      throw new Error(
        result.detail || result.error || 'No se pudo confirmar el inventario'
      );
    }
  } catch (error) {
    // El pago ya fue aprobado. No cancelar silenciosamente:
    // se necesita resolver esta inconsistencia.
    return {
      success: false,
      order,
      payment: paymentResult.payment,
      message: 'El pago fue aprobado, pero no se pudo confirmar el inventario.',
      error: error.message,
      stage: 'INVENTORY_CONFIRMATION'
    };
  }

  // 5. Todo salió bien: confirmar el pedido.
  await updateOrderStatus('CONFIRMED');

  return {
    success: true,
    order,
    payment: paymentResult.payment,
    message: 'Pedido confirmado y pago aprobado correctamente.'
  };
}

module.exports = { processOrderSaga };
