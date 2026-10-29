# Pasarela de Pago Simulada con Microservicios

Proyecto académico que simula el proceso de compra y pago de un comercio electrónico mediante una arquitectura de microservicios. Permite consultar productos, gestionar un carrito, crear órdenes y simular el resultado de pagos con tarjetas de prueba.

La solución separa las responsabilidades de órdenes, inventario y pagos, utiliza bases de datos independientes por servicio y contempla mecanismos de coordinación y tolerancia a fallos.

> **Estado del proyecto:** desarrollo en la rama `dev`. Se cuenta con frontend web, API Gateway, microservicios desplegados mediante Docker Compose, persistencia independiente, autenticación y pruebas de los flujos principales de compra y pago.

## Tabla de contenido

- [Funcionalidades](#funcionalidades)
- [Arquitectura](#arquitectura)
- [Tecnologías](#tecnologías)
- [Flujo de compra](#flujo-de-compra)
- [Patrones y mecanismos de resiliencia](#patrones-y-mecanismos-de-resiliencia)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Requisitos previos](#requisitos-previos)
- [Configuración y ejecución](#configuración-y-ejecución)
- [Pruebas](#pruebas)
- [Puertos locales](#puertos-locales)
- [Seguridad y alcance](#seguridad-y-alcance)
- [Git y ramas](#git-y-ramas)

## Funcionalidades

### Tienda y frontend

- Catálogo de productos consultado mediante el API Gateway.
- Búsqueda y ordenamiento de productos por nombre o precio.
- Carrito con gestión de productos y cantidades.
- Checkout con desglose de productos, cantidades, subtotal y total.
- Cálculo dinámico del importe según los productos seleccionados.
- Registro e inicio de sesión mediante autenticación con tokens JWT.

### Órdenes, inventario y pagos

- Creación y seguimiento del estado de las órdenes.
- Gestión del inventario y sus reservas.
- Persistencia de órdenes, inventario y pagos en bases de datos separadas.
- Simulación de pagos aprobados, rechazados y con tiempo de espera agotado.
- Confirmación de órdenes cuando el flujo de compra termina correctamente.
- Cancelación de órdenes cuando el pago falla.
- Liberación de las reservas de inventario durante la compensación de una compra fallida.

### Infraestructura

- API Gateway como punto de entrada para las solicitudes del frontend.
- Servicios y dependencias ejecutados con Docker Compose.
- Mensajería mediante RabbitMQ.
- Redis como componente de infraestructura del entorno.
- Pruebas unitarias, de integración y de extremo a extremo incorporadas al proyecto.

## Arquitectura

La aplicación sigue una arquitectura distribuida basada en microservicios. Cada servicio tiene responsabilidades delimitadas y utiliza su propia tecnología de persistencia.

```text
                   FRONTEND WEB
                 HTML + CSS + JS
                        |
                        v
                   API GATEWAY
                     :3000
                        |
           +------------+------------+
           |            |            |
           v            v            v
        ÓRDENES      INVENTARIO     PAGOS
         :3001          :8000       :3002
           |              |           |
           v              v           v
      PostgreSQL         MySQL      MongoDB
        :5433            :3307       :27018

      RabbitMQ: 5672
      RabbitMQ Management: 15672
      Redis: 6379
```

**Responsabilidades principales:**

| Componente | Responsabilidad |
|---|---|
| Frontend | Catálogo, carrito, autenticación e interfaz de checkout |
| API Gateway | Recibir y dirigir las solicitudes hacia los servicios correspondientes |
| Órdenes | Crear órdenes y gestionar sus estados |
| Inventario | Consultar productos y administrar las reservas de existencias |
| Pagos | Procesar la simulación del pago y aplicar el control de fallos |
| PostgreSQL | Persistir la información de las órdenes |
| MySQL | Persistir el catálogo y los datos del inventario |
| MongoDB | Persistir la información asociada a los pagos |
| RabbitMQ | Proporcionar infraestructura de mensajería entre servicios |
| Redis | Proporcionar infraestructura de almacenamiento en memoria |

La disponibilidad de cada integración depende de su implementación y configuración en el entorno. Los puertos mostrados corresponden a los publicados localmente por Docker Compose.

## Tecnologías

| Tecnología | Uso |
|---|---|
| HTML, CSS y JavaScript | Interfaz de la tienda |
| XAMPP / Apache | Servir el frontend en el entorno local |
| Node.js | API Gateway y servicios backend basados en Node.js |
| Python / FastAPI | Servicio de inventario |
| Docker y Docker Compose | Contenedores y orquestación local |
| PostgreSQL | Persistencia de órdenes |
| MySQL | Persistencia del inventario |
| MongoDB | Persistencia de pagos |
| RabbitMQ | Infraestructura de mensajería |
| Redis | Infraestructura de almacenamiento en memoria |
| JWT | Autenticación basada en tokens |
| Playwright | Pruebas de extremo a extremo del frontend |

## Flujo de compra

El proceso de compra coordina los servicios de órdenes, inventario y pagos.

1. El usuario consulta el catálogo y agrega productos al carrito.
2. El frontend calcula el total y presenta el checkout.
3. Se crea una orden con su información y estado inicial.
4. El inventario recibe la solicitud de reserva de los productos.
5. El servicio de pagos ejecuta la simulación bancaria.
6. Si el pago se aprueba, el flujo puede confirmar la orden y la reserva.
7. Si el pago se rechaza o no puede completarse, la orden se cancela y se libera la reserva correspondiente.

El proceso contempla una compensación para reducir el riesgo de mantener existencias reservadas cuando una compra no se completa.

## Patrones y mecanismos de resiliencia

### Saga y compensación

El flujo distribuido de compra contempla operaciones de reserva, confirmación y liberación de inventario.

Cuando una compra falla durante el pago, la compensación libera la reserva y la orden queda cancelada. Este comportamiento se verificó mediante pruebas de órdenes exitosas y fallidas.

### Circuit Breaker

El servicio de pagos incluye un Circuit Breaker para evitar solicitudes repetidas al simulador bancario cuando se acumulan fallos.

La configuración implementada contempla:

- **Tiempo de espera:** 2 segundos.
- **Umbral de fallos:** 3 fallos consecutivos.
- **Tiempo de espera para recuperación:** 10 segundos.
- **Estados:** `CLOSED`, `OPEN` y `HALF_OPEN`.

Cuando el circuito está abierto, se rechazan temporalmente nuevas operaciones bancarias. Después del periodo de espera, se permite probar nuevamente el servicio para comprobar su recuperación.

Se verificó el comportamiento de apertura del circuito después de los fallos y que, tras esperar el periodo de recuperación, una operación aprobada podía completarse.

### Simulador bancario

El banco es simulado y utiliza tarjetas de prueba para representar distintos resultados. Entre los escenarios contemplados se encuentran:

- Pago aprobado.
- Pago rechazado.
- Operación con demora superior al límite configurado.
- Solicitud bloqueada temporalmente por el Circuit Breaker.

Las tarjetas de prueba son parte de la lógica de simulación; no representan tarjetas bancarias reales.

## Estructura del proyecto

La estructura general incluye los siguientes componentes. Para conocer los nombres y archivos exactos, consulta el árbol de directorios del repositorio.

```text
Pasarela_Pago_Simulacion/
├── frontend/
├── services/
│   ├── api-gateway/
│   ├── orders/
│   │   └── tests/
│   ├── inventory/
│   └── payments/
├── tests/
│   └── e2e/
│       ├── tests/
│       ├── package.json
│       └── playwright.config.js
├── docs/
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Requisitos previos

Para ejecutar el entorno de desarrollo se necesitan:

- Git.
- Docker Desktop con Docker Compose.
- XAMPP con Apache, para servir el frontend localmente.
- Node.js y npm para instalar dependencias y ejecutar las pruebas que correspondan.
- Un navegador web moderno.

Las herramientas específicas necesarias para ejecutar cada prueba pueden variar según el servicio.

## Configuración y ejecución

### 1. Clonar el repositorio

```bash
git clone git@github.com:RodoTex2005/Pasarela-de-Pago-Simulada-.git
cd Pasarela_Pago_Simulacion
```

Si el directorio creado por Git tiene otro nombre, entra en el directorio que corresponda.

### 2. Configurar las variables de entorno

Revisa `.env.example` y prepara la configuración local requerida por los servicios. Si el proyecto utiliza un archivo `.env`, créalo con los valores adecuados para tu entorno.

No publiques contraseñas, tokens JWT, claves privadas ni credenciales reales.

### 3. Iniciar los servicios

Desde la raíz del proyecto:

```bash
docker compose up -d --build
```

Para comprobar el estado de los contenedores:

```bash
docker compose ps
```

Para revisar los registros de ejecución:

```bash
docker compose logs --tail=100
```

### 4. Comprobar el API Gateway

```bash
curl -i http://localhost:3000/health
```

El endpoint de salud del Gateway debe responder correctamente cuando el servicio está disponible.

### 5. Abrir el frontend

Con Apache iniciado en XAMPP, abre:

```text
http://localhost:8080/Pasarela_Pago_Simulacion/frontend/
```

La URL depende de la carpeta del proyecto y del puerto configurado en Apache.

### 6. Detener el entorno

Desde la raíz del proyecto:

```bash
docker compose down
```

Este comando detiene y elimina los contenedores del entorno, pero no elimina por sí solo los volúmenes persistentes. No agregues `-v` si necesitas conservar los datos de las bases de datos.

## Pruebas

El proyecto contiene pruebas para verificar el comportamiento de los servicios y los flujos principales de compra.

### Órdenes y pagos

Se ejecutaron pruebas de los servicios de órdenes y pagos. En las ejecuciones registradas, ambos conjuntos reportaron 14 pruebas aprobadas cada uno.

Los escenarios trabajados incluyen:

- Creación y gestión de órdenes.
- Pagos aprobados y rechazados.
- Tiempos de espera del simulador bancario.
- Bloqueo temporal mediante Circuit Breaker.
- Recuperación de operaciones después del periodo de espera.

### Inventario y compensación

Se verificaron operaciones de reserva, confirmación y liberación del inventario. También se comprobaron órdenes confirmadas y canceladas en la base de datos.

### Pruebas de extremo a extremo

El proyecto incluye la configuración de Playwright y pruebas E2E del checkout en `tests/e2e/`.

Para ejecutarlas, consulta los scripts disponibles en `tests/e2e/package.json`. El flujo habitual consiste en instalar las dependencias y ejecutar el script de pruebas definido allí.

La inclusión de estas pruebas en el repositorio no implica que todos los escenarios E2E hayan sido ejecutados satisfactoriamente en cada entorno.

## Puertos locales

| Componente | Puerto publicado |
|---|---:|
| API Gateway | 3000 |
| Servicio de órdenes | 3001 |
| Servicio de pagos | 3002 |
| Servicio de inventario | 8000 |
| PostgreSQL | 5433 |
| MySQL | 3307 |
| MongoDB | 27018 |
| RabbitMQ | 5672 |
| RabbitMQ Management | 15672 |
| Redis | 6379 |

Si algún puerto se modifica en `docker-compose.yml`, utiliza el valor configurado en ese archivo.

## Seguridad y alcance

Este proyecto tiene fines académicos y de demostración.

- El banco es un simulador; no procesa pagos reales.
- Las tarjetas utilizadas son números de prueba definidos por la aplicación.
- Las credenciales y los secretos deben configurarse localmente y excluirse del control de versiones.
- Los servicios y puertos publicados están pensados para el entorno de desarrollo local.
- Antes de exponer el sistema en Internet se necesitarían medidas adicionales de seguridad, autorización, validación, observabilidad y administración de secretos.

## Git y ramas

El trabajo de desarrollo se mantiene en la rama `dev`.

La rama `main` conserva el commit inicial del proyecto, de acuerdo con la organización elegida para el repositorio.

Para revisar el estado de la rama actual:

```bash
git status
git branch --show-current
```

Para guardar una actualización de documentación en `dev`:

```bash
git add README.md
git commit -m "docs: actualizar README del proyecto"
git push origin dev
```

Los scripts locales `install_store.sh` e `install_store_fixed.sh` no forman parte de esta actualización del README y no deben agregarse accidentalmente si no se desea versionarlos.

---

**Proyecto académico de arquitectura de software:** simulación de un comercio electrónico con microservicios, persistencia distribuida y mecanismos de resiliencia.
