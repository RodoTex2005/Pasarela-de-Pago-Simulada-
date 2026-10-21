# Pasarela de Pago Simulada con Microservicios

Simulación de un e-commerce donde **Órdenes, Inventario y Pagos** son servicios independientes. Si el pago falla, el inventario se compensa automáticamente (**Patrón Saga**), y si el banco simulado tarda más de 2 s, un **Circuit Breaker** cancela la operación.

> **Estado actual (rama `dev`):** prototipo funcional de la pantalla **Checkout** (frontend estático). El backend, Docker, pruebas y autenticación están diseñados y listados en el [Roadmap](#roadmap), pero **aún no implementados**.

## Pantallas planeadas

| Pantalla | Estado |
|---|---|
| Catálogo de productos | Pendiente |
| Carrito | Pendiente |
| **Checkout** (pago con tarjeta simulada) | **Prototipo listo** |
| Estado del pedido en tiempo real | Pendiente (el checkout ya muestra el estado simulado) |


**Tarjetas de prueba**

| Tarjeta | Resultado |
|---|---|
| `4242 4242 4242 4242` | Pedido CONFIRMED |
| `4000 0000 0000 0002` | Pedido CANCELLED (rechazo del banco) |
| `4000 0000 0000 0119` | Pedido CANCELLED (timeout > 2 s, Circuit Breaker) |

Usa cualquier fecha futura y un CVV de 3 dígitos. **No se envían ni almacenan datos reales.**

## Arquitectura objetivo

```
Frontend ──HTTP/WebSocket──> API Gateway
                                 │
            ┌────────────────────┼────────────────────┐
         Orders              Inventory             Payments
        (PostgreSQL)          (MySQL)              (MongoDB)
            └──────── eventos asíncronos (RabbitMQ) ────┘
                    Redis: caché y sesiones
```

## Decisiones técnicas

| Tecnología | Por qué se eligió |
|---|---|
| HTML + CSS + JavaScript sin framework (prototipo) | Corre directo en XAMPP, sin build; permite validar el diseño antes de invertir en un framework. |
| React + TypeScript + Tailwind (fase siguiente) | Componentes reutilizables, tipado para evitar errores en estados del pedido y tokens de diseño consistentes. |
| Microservicios con base de datos propia | Cada servicio es su propio *Bounded Context*; evita acoplamiento por base de datos compartida. |
| RabbitMQ (o Kafka) | Comunicación asíncrona y desacoplada, necesaria para orquestar la Saga. |
| PostgreSQL / MySQL / MongoDB | Se usa el motor adecuado por servicio: relacional para órdenes e inventario, documentos para el log de pagos. |
| Redis | Caché y sesiones de baja latencia. |
| Docker Compose | Levantar todo el entorno con un solo comando, reproducible en cualquier equipo. |

## Patrones de diseño

- **Saga (coreografía):** transacción distribuida con compensaciones; si el cobro falla, se repone el stock.
- **Circuit Breaker:** corta la llamada al banco simulado tras 2 s para no saturarlo ni bloquear al usuario. *El prototipo ya lo simula en el cliente (`Promise.race` con tiempo límite).*
- **Domain-Driven Design:** Entidades, Value Objects y Repositorios por contexto.
- **Event-driven architecture:** los servicios se comunican por eventos, no por llamadas directas.
- **Design tokens (frontend):** colores y tipografía como variables CSS, lo que permite el tema claro/oscuro sin duplicar estilos.

## Qué incluye el prototipo del Checkout

- Formulario con etiquetas visibles, validación en línea, algoritmo de Luhn, autocompletado y formato asistido.
- Estados PENDING / CONFIRMED / CANCELLED con **color + icono + texto** y región `aria-live`.
- Tema claro / oscuro / sistema, con preferencia guardada.
- Diseño responsivo *mobile-first*, áreas táctiles de 44 px y respeto de `prefers-reduced-motion`.
- Documentación de diseño y accesibilidad en [`docs/Documentacion_Sitio_Pasarela_Pagos.docx`](docs/Documentacion_Sitio_Pasarela_Pagos.docx).


## Flujo de trabajo con Git

- `main`: versión estable.
- `dev`: desarrollo activo (rama de este prototipo).
- Commits pequeños y descriptivos, por ejemplo: `feat(checkout): validación de tarjeta con Luhn`.
