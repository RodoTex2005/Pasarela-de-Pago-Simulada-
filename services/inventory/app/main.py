
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from threading import Lock

app = FastAPI(
    title="Inventory Service",
    description="Microservicio de inventario para la pasarela de pagos",
    version="1.0.0",
)

# Almacenamiento temporal.
# Más adelante se sustituirá por MySQL.
products = {
    "laptop-001": {
        "id": "laptop-001",
        "name": "Laptop",
        "price": 1348.0,
        "stock": 10,
        "reserved": 0,
    },
    "mouse-001": {
        "id": "mouse-001",
        "name": "Mouse",
        "price": 250.0,
        "stock": 20,
        "reserved": 0,
    },
}

# Guarda las reservas por identificador de pedido.
reservations = {}
inventory_lock = Lock()


class ReservationRequest(BaseModel):
    order_id: str = Field(min_length=1)
    items: list[dict]


@app.get("/health")
def health():
    return {
        "service": "inventory",
        "status": "UP",
    }


@app.get("/products")
def list_products():
    with inventory_lock:
        return {"products": list(products.values())}


@app.get("/products/{product_id}")
def get_product(product_id: str):
    with inventory_lock:
        product = products.get(product_id)

        if product is None:
            raise HTTPException(
                status_code=404,
                detail="Producto no encontrado",
            )

        return {"product": product}


@app.post("/reserve")
def reserve_inventory(request: ReservationRequest):
    with inventory_lock:
        if request.order_id in reservations:
            raise HTTPException(
                status_code=409,
                detail="El pedido ya tiene una reserva",
            )

        # Validar todos los productos antes de modificar existencias.
        requested_items = []

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

            product = products.get(product_id)

            if product is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Producto no encontrado: {product_id}",
                )

            available = product["stock"] - product["reserved"]

            if quantity > available:
                raise HTTPException(
                    status_code=409,
                    detail=f"Existencias insuficientes para {product_id}",
                )

            requested_items.append({
                "productId": product_id,
                "quantity": quantity,
            })

        # Reservar únicamente después de validar todos los artículos.
        for item in requested_items:
            products[item["productId"]]["reserved"] += item["quantity"]

        reservations[request.order_id] = {
            "order_id": request.order_id,
            "items": requested_items,
            "status": "RESERVED",
        }

        return {
            "message": "Inventario reservado correctamente",
            "reservation": reservations[request.order_id],
        }


@app.post("/release/{order_id}")
def release_inventory(order_id: str):
    with inventory_lock:
        reservation = reservations.get(order_id)

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

        for item in reservation["items"]:
            products[item["productId"]]["reserved"] -= item["quantity"]

        reservation["status"] = "RELEASED"

        return {
            "message": "Reserva liberada correctamente",
            "reservation": reservation,
        }


@app.post("/confirm/{order_id}")
def confirm_inventory(order_id: str):
    with inventory_lock:
        reservation = reservations.get(order_id)

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
            product = products[item["productId"]]
            product["stock"] -= item["quantity"]
            product["reserved"] -= item["quantity"]

        reservation["status"] = "CONFIRMED"

        return {
            "message": "Inventario confirmado correctamente",
            "reservation": reservation,
        }
