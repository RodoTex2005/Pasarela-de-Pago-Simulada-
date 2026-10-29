const { test, expect } = require('@playwright/test');

test('el checkout carga los campos necesarios para pagar', async ({ page }) => {
  await page.goto('http://localhost:8080/Pasarela_Pago_Simulacion/frontend/');

  await expect(page.locator('#checkout')).toBeVisible();
  await expect(page.locator('#name')).toBeVisible();
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#address')).toBeVisible();
  await expect(page.locator('#card')).toBeVisible();
  await expect(page.locator('#exp')).toBeVisible();
  await expect(page.locator('#cvv')).toBeVisible();
  await expect(page.locator('#payBtn')).toBeVisible();
});

test('una tarjeta inválida muestra un error y no envía el pedido', async ({ page }) => {
  await page.goto('http://localhost:8080/Pasarela_Pago_Simulacion/frontend/');

  await page.locator('#name').fill('Usuario de Prueba');
  await page.locator('#email').fill('prueba@example.com');
  await page.locator('#address').fill('Calle de Prueba 123');
  await page.locator('#card').fill('1234567890123456');
  await page.locator('#exp').fill('12/28');
  await page.locator('#cvv').fill('123');

  let checkoutRequests = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().includes('/api/orders/checkout')
    ) {
      checkoutRequests++;
    }
  });

  await page.locator('#payBtn').click();

  await expect(page.locator('#card-err')).toHaveText(
    'Escribe una tarjeta de prueba válida de 16 dígitos.'
  );
  await expect(page.locator('#card')).toHaveAttribute('aria-invalid', 'true');
  expect(checkoutRequests).toBe(0);
});

test('una compra aprobada confirma el pedido', async ({ page }) => {
  await page.goto('http://localhost:8080/Pasarela_Pago_Simulacion/frontend/');

  await page.locator('#name').fill('Prueba E2E');
  await page.locator('#email').fill('e2e@example.com');
  await page.locator('#address').fill('Calle E2E 123');
  await page.locator('#card').fill('4242 4242 4242 4242');
  await page.locator('#exp').fill('12/28');
  await page.locator('#cvv').fill('123');

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/orders/checkout') &&
      response.request().method() === 'POST'
  );

  await page.locator('#payBtn').click();

  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();

  await expect(page.locator('#statusBox')).toBeVisible();
  await expect(page.locator('#badge')).toHaveAttribute('data-state', 'CONFIRMED');
  await expect(page.locator('#orderId')).not.toBeEmpty();
});

test('un pago rechazado cancela el pedido', async ({ page }) => {
  await page.goto('http://localhost:8080/Pasarela_Pago_Simulacion/frontend/');

  await page.locator('#name').fill('Prueba Pago Rechazado');
  await page.locator('#email').fill('rechazo@example.com');
  await page.locator('#address').fill('Calle de Prueba 456');
  await page.locator('#card').fill('4000 0000 0000 0002');
  await page.locator('#exp').fill('12/28');
  await page.locator('#cvv').fill('123');

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/orders/checkout') &&
      response.request().method() === 'POST'
  );

  await page.locator('#payBtn').click();

  const response = await responsePromise;
  const result = await response.json();

  expect(result.order?.status).toBe('CANCELLED');

  await expect(page.locator('#statusBox')).toBeVisible();
  await expect(page.locator('#badge')).toHaveAttribute('data-state', 'CANCELLED');
  await expect(page.locator('#retryBtn')).toBeVisible();
});
