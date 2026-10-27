
import pytest
from fastapi import HTTPException

from app.main import (
    ReservationRequest,
    products,
    reservations,
    inventory_lock,
    reserve_inventory,
    release_inventory,
    confirm_inventory,
)


@pytest.fixture(autouse=True)
def reset_inventory():
    """Restablece el inventario antes de cada prueba."""
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


def test_reserve_inventory_successfully():
    request = ReservationRequest(
        order_id="order-001",
        items=[{"productId": "laptop-001", "quantity": 2}],
    )

    result = reserve_inventory(request)

    assert result["reservation"]["status"] == "RESERVED"
    assert products["laptop-001"]["reserved"] == 2
    assert products["laptop-001"]["stock"] == 10


def test_duplicate_reservation_is_rejected():
    request = ReservationRequest(
        order_id="order-001",
        items=[{"productId": "laptop-001", "quantity": 1}],
    )

    reserve_inventory(request)

    with pytest.raises(HTTPException) as exc:
        reserve_inventory(request)

    assert exc.value.status_code == 409
    assert products["laptop-001"]["reserved"] == 1


@pytest.mark.parametrize("quantity", [0, -1, True, 1.5, "2", None])
def test_invalid_quantity_is_rejected(quantity):
    request = ReservationRequest(
        order_id="order-invalid",
        items=[{"productId": "laptop-001", "quantity": quantity}],
    )

    with pytest.raises(HTTPException) as exc:
        reserve_inventory(request)

    assert exc.value.status_code == 400
    assert products["laptop-001"]["reserved"] == 0


def test_missing_product_is_rejected():
    request = ReservationRequest(
        order_id="order-001",
        items=[{"productId": "unknown-001", "quantity": 1}],
    )

    with pytest.raises(HTTPException) as exc:
        reserve_inventory(request)

    assert exc.value.status_code == 404


def test_insufficient_stock_is_rejected():
    request = ReservationRequest(
        order_id="order-001",
        items=[{"productId": "laptop-001", "quantity": 11}],
    )

    with pytest.raises(HTTPException) as exc:
        reserve_inventory(request)

    assert exc.value.status_code == 409
    assert products["laptop-001"]["reserved"] == 0


def test_failed_reservation_does_not_partially_reserve_items():
    request = ReservationRequest(
        order_id="order-001",
        items=[
            {"productId": "laptop-001", "quantity": 2},
            {"productId": "mouse-001", "quantity": 21},
        ],
    )

    with pytest.raises(HTTPException):
        reserve_inventory(request)

    assert products["laptop-001"]["reserved"] == 0
    assert products["mouse-001"]["reserved"] == 0
    assert "order-001" not in reservations


def test_release_reservation_restores_available_stock():
    request = ReservationRequest(
        order_id="order-001",
        items=[{"productId": "laptop-001", "quantity": 3}],
    )
    reserve_inventory(request)

    result = release_inventory("order-001")

    assert result["reservation"]["status"] == "RELEASED"
    assert products["laptop-001"]["reserved"] == 0
    assert products["laptop-001"]["stock"] == 10


def test_release_is_idempotent():
    request = ReservationRequest(
        order_id="order-001",
        items=[{"productId": "laptop-001", "quantity": 2}],
    )
    reserve_inventory(request)

    release_inventory("order-001")
    result = release_inventory("order-001")

    assert result["reservation"]["status"] == "RELEASED"
    assert products["laptop-001"]["reserved"] == 0


def test_confirm_reservation_decreases_stock():
    request = ReservationRequest(
        order_id="order-001",
        items=[{"productId": "laptop-001", "quantity": 3}],
    )
    reserve_inventory(request)

    result = confirm_inventory("order-001")

    assert result["reservation"]["status"] == "CONFIRMED"
    assert products["laptop-001"]["stock"] == 7
    assert products["laptop-001"]["reserved"] == 0


def test_confirm_is_idempotent():
    request = ReservationRequest(
        order_id="order-001",
        items=[{"productId": "laptop-001", "quantity": 3}],
    )
    reserve_inventory(request)

    confirm_inventory("order-001")
    result = confirm_inventory("order-001")

    assert result["reservation"]["status"] == "CONFIRMED"
    assert products["laptop-001"]["stock"] == 7
    assert products["laptop-001"]["reserved"] == 0


def test_released_reservation_cannot_be_confirmed():
    request = ReservationRequest(
        order_id="order-001",
        items=[{"productId": "laptop-001", "quantity": 2}],
    )
    reserve_inventory(request)
    release_inventory("order-001")

    with pytest.raises(HTTPException) as exc:
        confirm_inventory("order-001")

    assert exc.value.status_code == 409
    assert products["laptop-001"]["stock"] == 10


@pytest.mark.parametrize("operation", [release_inventory, confirm_inventory])
def test_missing_reservation_is_rejected(operation):
    with pytest.raises(HTTPException) as exc:
        operation("unknown-order")

    assert exc.value.status_code == 404
