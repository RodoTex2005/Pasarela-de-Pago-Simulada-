
import os
from contextlib import contextmanager
from threading import Lock
from urllib.parse import urlparse, unquote

import pymysql
from pymysql.cursors import DictCursor
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(
    title="Inventory Service",
    description="Microservicio de inventario para la pasarela de pagos",
    version="1.0.0",
)

inventory_lock = Lock()


def get_db_config():
    database_url = os.getenv(
        "INVENTORY_DB_URL",
        "mysql://inventory_user:inventory_dev_password@localhost:3307/inventory",
    )
    parsed = urlparse(database_url)

    return {
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 3306,
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "database": parsed.path.lstrip("/"),
        "charset": "utf8mb4",
        "cursorclass": DictCursor,
        "autocommit": False,
        "connect_timeout": 5,
    }


@contextmanager
def database():
    connection = pymysql.connect(**get_db_config())
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    with database() as connection:
        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id VARCHAR(100) PRIMARY KEY,
                    name VARCHAR(150) NOT NULL,
                    price DECIMAL(12, 2) NOT NULL,
                    stock INT NOT NULL,
                    reserved INT NOT NULL DEFAULT 0
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS reservations (
                    order_id VARCHAR(150) PRIMARY KEY,
                    status VARCHAR(20) NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS reservation_items (
                    order_id VARCHAR(150) NOT NULL,
                    product_id VARCHAR(100) NOT NULL,
                    quantity INT NOT NULL,
                    PRIMARY KEY (order_id, product_id),
                    FOREIGN KEY (order_id)
                        REFERENCES reservations(order_id),
                    FOREIGN KEY (product_id)
                        REFERENCES products(id)
                )
            """)

            cursor.execute("""
                INSERT IGNORE INTO products (id, name, price, stock, reserved)
                VALUES
                    ('laptop-001', 'Laptop', 1348.00, 10, 0),
                    ('mouse-001', 'Mouse', 250.00, 20, 0)
            """)

            cursor.execute("""
                INSERT IGNORE INTO products (id, name, price, stock, reserved)
                VALUES
                  ('audifonos-bt-001', 'Audífonos Bluetooth', 899.00, 18, 0),
                  ('teclado-mec-001', 'Teclado mecánico RGB', 1299.00, 12, 0),
                  ('monitor-24-001', 'Monitor Full HD 24 pulgadas', 2499.00, 8, 0),
                  ('mousepad-xl-001', 'Mousepad XL', 349.00, 25, 0),
                  ('webcam-hd-001', 'Webcam Full HD', 799.00, 14, 0),
                  ('microfono-usb-001', 'Micrófono USB', 1199.00, 9, 0),
                  ('silla-gamer-001', 'Silla gamer ergonómica', 3899.00, 5, 0),
                  ('ssd-1tb-001', 'SSD NVMe 1 TB', 1799.00, 11, 0),
                  ('ram-16gb-001', 'Memoria RAM 16 GB', 699.00, 20, 0),
                  ('hub-usbc-001', 'Hub USB-C 7 en 1', 649.00, 16, 0),
                  ('bocina-bt-001', 'Bocina Bluetooth portátil', 599.00, 22, 0),
                  ('tablet-10-001', 'Tablet 10 pulgadas', 3299.00, 6, 0),
                  ('cargador-65w-001', 'Cargador USB-C 65 W', 499.00, 24, 0),
                  ('mochila-tech-001', 'Mochila para laptop', 749.00, 13, 0),
                  ('soporte-laptop-001', 'Soporte ajustable para laptop', 429.00, 17, 0),
                  ('control-usb-001', 'Control USB para PC', 899.00, 10, 0),
                  ('impresora-001', 'Impresora multifuncional', 2199.00, 4, 0),
                  ('router-wifi-001', 'Router Wi-Fi de doble banda', 1099.00, 7, 0)
            """)



@app.on_event("startup")
def startup():
    initialize_database()


class ReservationRequest(BaseModel):
    order_id: str = Field(min_length=1)
    items: list[dict] = Field(min_length=1)


def get_reservation(cursor, order_id):
    cursor.execute(
        "SELECT order_id, status FROM reservations WHERE order_id = %s",
        (order_id,),
    )
    reservation = cursor.fetchone()

    if reservation is None:
        return None

    cursor.execute("""
        SELECT product_id AS productId, quantity
        FROM reservation_items
        WHERE order_id = %s
    """, (order_id,))

    reservation["items"] = cursor.fetchall()
    return reservation


@app.get("/health")
def health():
    try:
        with database() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        return {"service": "inventory", "status": "UP", "database": "connected"}
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Inventory database unavailable",
        )


@app.get("/products")
def list_products():
    with database() as connection:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT id, name, price, stock, reserved
                FROM products ORDER BY id
            """)
            products = cursor.fetchall()

    for product in products:
        product["price"] = float(product["price"])

    return {"products": products}


@app.get("/products/{product_id}")
def get_product(product_id: str):
    with database() as connection:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT id, name, price, stock, reserved
                FROM products WHERE id = %s
            """, (product_id,))
            product = cursor.fetchone()

    if product is None:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    product["price"] = float(product["price"])
    return {"product": product}


@app.post("/reserve")
def reserve_inventory(request: ReservationRequest):
    requested_items = {}

    for item in request.items:
        product_id = item.get("productId")
        quantity = item.get("quantity")

        if (
            not isinstance(product_id, str)
            or not isinstance(quantity, int)
            or isinstance(quantity, bool)
            or quantity <= 0
        ):
            raise HTTPException(
                status_code=400,
                detail="Cada artículo requiere productId y quantity positiva",
            )

        requested_items[product_id] = (
            requested_items.get(product_id, 0) + quantity
        )

    with inventory_lock:
        try:
            with database() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT status FROM reservations WHERE order_id = %s",
                        (request.order_id,),
                    )
                    if cursor.fetchone():
                        raise HTTPException(
                            status_code=409,
                            detail="El pedido ya tiene una reserva",
                        )

                    for product_id in sorted(requested_items):
                        cursor.execute("""
                            SELECT stock, reserved
                            FROM products
                            WHERE id = %s
                            FOR UPDATE
                        """, (product_id,))
                        product = cursor.fetchone()

                        if product is None:
                            raise HTTPException(
                                status_code=404,
                                detail=f"Producto no encontrado: {product_id}",
                            )

                        quantity = requested_items[product_id]
                        if quantity > product["stock"] - product["reserved"]:
                            raise HTTPException(
                                status_code=409,
                                detail=f"Existencias insuficientes para {product_id}",
                            )

                    cursor.execute("""
                        INSERT INTO reservations (order_id, status)
                        VALUES (%s, 'RESERVED')
                    """, (request.order_id,))

                    for product_id, quantity in requested_items.items():
                        cursor.execute("""
                            UPDATE products
                            SET reserved = reserved + %s
                            WHERE id = %s
                        """, (quantity, product_id))
                        cursor.execute("""
                            INSERT INTO reservation_items
                                (order_id, product_id, quantity)
                            VALUES (%s, %s, %s)
                        """, (request.order_id, product_id, quantity))

                    reservation = get_reservation(cursor, request.order_id)

            return {
                "message": "Inventario reservado correctamente",
                "reservation": reservation,
            }
        except HTTPException:
            raise
        except pymysql.MySQLError:
            raise HTTPException(
                status_code=503,
                detail="Error al guardar la reserva en MySQL",
            )


@app.post("/release/{order_id}")
def release_inventory(order_id: str):
    with inventory_lock:
        try:
            with database() as connection:
                with connection.cursor() as cursor:
                    reservation = get_reservation(cursor, order_id)

                    if reservation is None:
                        raise HTTPException(
                            status_code=404,
                            detail="No se encontró una reserva para este pedido",
                        )

                    if reservation["status"] == "RELEASED":
                        return {
                            "message": "La reserva ya había sido liberada",
                            "reservation": reservation,
                        }

                    if reservation["status"] == "CONFIRMED":
                        raise HTTPException(
                            status_code=409,
                            detail="No se puede liberar una reserva confirmada",
                        )

                    for item in reservation["items"]:
                        cursor.execute("""
                            UPDATE products
                            SET reserved = reserved - %s
                            WHERE id = %s AND reserved >= %s
                        """, (
                            item["quantity"],
                            item["productId"],
                            item["quantity"],
                        ))

                    cursor.execute("""
                        UPDATE reservations
                        SET status = 'RELEASED'
                        WHERE order_id = %s
                    """, (order_id,))

                    reservation = get_reservation(cursor, order_id)

            return {
                "message": "Reserva liberada correctamente",
                "reservation": reservation,
            }
        except HTTPException:
            raise
        except pymysql.MySQLError:
            raise HTTPException(status_code=503, detail="Error en MySQL")


@app.post("/confirm/{order_id}")
def confirm_inventory(order_id: str):
    with inventory_lock:
        try:
            with database() as connection:
                with connection.cursor() as cursor:
                    reservation = get_reservation(cursor, order_id)

                    if reservation is None:
                        raise HTTPException(
                            status_code=404,
                            detail="No se encontró una reserva para este pedido",
                        )

                    if reservation["status"] == "CONFIRMED":
                        return {
                            "message": "La reserva ya había sido confirmada",
                            "reservation": reservation,
                        }

                    if reservation["status"] != "RESERVED":
                        raise HTTPException(
                            status_code=409,
                            detail="No se puede confirmar una reserva liberada",
                        )

                    for item in reservation["items"]:
                        cursor.execute("""
                            UPDATE products
                            SET stock = stock - %s,
                                reserved = reserved - %s
                            WHERE id = %s
                              AND stock >= %s
                              AND reserved >= %s
                        """, (
                            item["quantity"],
                            item["quantity"],
                            item["productId"],
                            item["quantity"],
                            item["quantity"],
                        ))

                        if cursor.rowcount != 1:
                            raise HTTPException(
                                status_code=409,
                                detail="No hay existencias suficientes para confirmar",
                            )

                    cursor.execute("""
                        UPDATE reservations
                        SET status = 'CONFIRMED'
                        WHERE order_id = %s
                    """, (order_id,))

                    reservation = get_reservation(cursor, order_id)

            return {
                "message": "Inventario confirmado correctamente",
                "reservation": reservation,
            }
        except HTTPException:
            raise
        except pymysql.MySQLError:
            raise HTTPException(status_code=503, detail="Error en MySQL")
