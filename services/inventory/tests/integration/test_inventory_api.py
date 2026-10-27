
import pytest
from fastapi.testclient import TestClient

from app.main import app, products, reservations, inventory_lock


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_inventory():
    """Aísla los casos de prueba restableciendo los datos."""
    with inventory_lock:
        products.clear()
        products.update({
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
        })
        reservations.clear()

    yield


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "service": "inventory",
        "status": "UP",
    }


def test_list_products_endpoint():
    response = client.get("/products")

    assert response.status_code == 200
    assert len(response.json()["products"]) == 2


def test_get_product_endpoint():
    response = client.get("/products/laptop-001")

    assert response.status_code == 200
    assert response.json()["product"]["id"] == "laptop-001"


def test_get_missing_product_returns_404():
    response = client.get("/products/unknown-001")

    assert response.status_code == 404


def test_reserve_endpoint():
    response = client.post(
        "/reserve",
        json={
            "order_id": "order-001",
            "items": [
                {"productId": "laptop-001", "quantity": 2}
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["reservation"]["status"] == "RESERVED"
    assert products["laptop-001"]["reserved"] == 2


def test_duplicate_reservation_returns_409():
    payload = {
        "order_id": "order-001",
        "items": [{"productId": "laptop-001", "quantity": 1}],
    }

    first = client.post("/reserve", json=payload)
    second = client.post("/reserve", json=payload)

    assert first.status_code == 200
    assert second.status_code == 409


def test_invalid_reservation_returns_400():
    response = client.post(
        "/reserve",
        json={
            "order_id": "order-001",
            "items": [
                {"productId": "laptop-001", "quantity": 0}
            ],
        },
    )

    assert response.status_code == 400


def test_release_endpoint():
    client.post(
        "/reserve",
        json={
            "order_id": "order-001",
            "items": [{"productId": "laptop-001", "quantity": 2}],
        },
    )

    response = client.post("/release/order-001")

    assert response.status_code == 200
    assert response.json()["reservation"]["status"] == "RELEASED"
    assert products["laptop-001"]["reserved"] == 0


def test_confirm_endpoint():
    client.post(
        "/reserve",
        json={
            "order_id": "order-001",
            "items": [{"productId": "laptop-001", "quantity": 3}],
        },
    )

    response = client.post("/confirm/order-001")

    assert response.status_code == 200
    assert response.json()["reservation"]["status"] == "CONFIRMED"
    assert products["laptop-001"]["stock"] == 7
    assert products["laptop-001"]["reserved"] == 0


@pytest.mark.parametrize(
    "endpoint",
    ["/release/unknown-order", "/confirm/unknown-order"],
)
def test_missing_reservation_returns_404(endpoint):
    response = client.post(endpoint)

    assert response.status_code == 404
