# Pasarela de Pago Simulada con Microservicios

Proyecto académico que simula un e-commerce con catálogo de productos, carrito de compras y un proceso de pago mediante una tarjeta bancaria de prueba. La aplicación utiliza una arquitectura de microservicios para separar las responsabilidades de órdenes, inventario y pagos.

> **Estado actual:** rama `dev`. El proyecto cuenta con frontend servido mediante XAMPP, API Gateway, servicios backend ejecutados con Docker Compose, catálogo conectado al inventario, carrito, Checkout y autenticación. La implementación continúa en desarrollo.

## Funcionalidades implementadas

- **Catálogo de productos:** consulta productos desde el inventario a través del API Gateway.
- **Búsqueda y ordenamiento:** permite buscar productos y ordenarlos por precio o nombre.
- **Carrito de compras:** permite gestionar los productos seleccionados y sus cantidades.
- **Checkout:** muestra los productos seleccionados, las cantidades, el subtotal y el total a pagar.
- **Cálculo de precios:** el importe se calcula a partir del precio de cada producto y su cantidad. El botón de pago muestra el total acumulado, tanto para un solo producto como para varios.
- **Autenticación:** registro e inicio de sesión con tokens JWT.
- **Órdenes y pagos:** los servicios backend gestionan el flujo de compra y el resultado de la operación.
- **Simulación bancaria:** contempla pagos aprobados, rechazos y tiempos de espera.
- **Contenedores:** los servicios y sus dependencias se ejecutan mediante Docker Compose.

## Tecnologías utilizadas

| Tecnología | Uso |
|---|---|
| HTML, CSS y JavaScript | Interfaz web |
| XAMPP / Apache | Servir el frontend localmente |
| Node.js | Servicios backend |
| API Gateway | Punto de entrada para las solicitudes del frontend |
| Docker Compose | Orquestación del entorno |
| PostgreSQL | Persistencia de órdenes |
| MySQL | Persistencia del inventario |
| MongoDB | Persistencia de pagos |
| RabbitMQ | Mensajería entre servicios |
| Redis | Servicio de caché y sesiones |
| JWT | Autenticación mediante tokens |

## Arquitectura

```text
                    FRONTEND
               HTML + CSS + JS
                       |
                       v
                  API GATEWAY
                   Puerto 3000
                       |
          +------------+------------+
          |            |            |
          v            v            v
       ÓRDENES      INVENTARIO     PAGOS
        :3001         :8000        :3002
          |            |            |
     PostgreSQL       MySQL       MongoDB
       :5433          :3307       :27018

      RabbitMQ: 5672 / panel: 15672
      Redis: 6379
```

Los puertos indicados corresponden a los puertos publicados en el entorno local de Docker Compose.

## Estructura general

```text
Pasarela_Pago_Simulada/
├── frontend/
│   ├── assets/
│   │   └── js/
│   │       ├── app.js
│   │       ├── store.js
│   │       └── cart.js
│   ├── index.html
│   ├── store.html
│   └── cart.html
├── services/
│   ├── api-gateway/
│   ├── orders/
│   ├── inventory/
│   └── payments/
├── docs/
├── docker-compose.yml
├── .env.example
└── README.md
```

*La estructura anterior es una referencia general; conserva los nombres y las carpetas reales del repositorio si difieren.*

## Variables de entorno

El archivo `.env.example` documenta la configuración necesaria para el entorno. Entre las variables contempladas se encuentran:

- `NODE_ENV`
- `FRONTEND_URL`
- `ORDERS_DB_URL`
- `INVENTORY_DB_URL`
- `PAYMENTS_DB_URL`
- `BROKER_URL`
- `REDIS_URL`
- Secretos JWT
- `BANK_TIMEOUT_MS`

Consulta `.env.example` para conocer los nombres y valores de referencia. Los secretos reales deben mantenerse fuera del control de versiones.

## Estado del proyecto y próximos pasos

- [x] Frontend de tienda y catálogo.
- [x] Consulta del inventario desde el frontend mediante el API Gateway.
- [x] Búsqueda y ordenamiento de productos.
- [x] Carrito de compras.
- [x] Checkout con cálculo dinámico del importe.
- [x] API Gateway y servicios desplegados con Docker Compose.
- [x] Registro e inicio de sesión con JWT.
- [ ] Ampliar y automatizar las pruebas unitarias, de integración y de extremo a extremo.
- [ ] Completar y documentar el seguimiento de pedidos en tiempo real, si aún no está terminado.
- [ ] Actualizar la documentación técnica conforme se estabilicen los servicios.

## Flujo de trabajo con Git

- `main`: rama estable del proyecto.
- `dev`: rama de desarrollo activo.

Antes de realizar cambios, comprueba la rama actual:

```bash
git status
git branch
```

Usa commits pequeños y descriptivos, por ejemplo:

```bash
git add README.md
git commit -m "docs: actualizar README del proyecto"
