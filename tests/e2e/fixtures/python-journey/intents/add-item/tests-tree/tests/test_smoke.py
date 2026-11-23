from fastapi.testclient import TestClient

from cart.main import app


def test_list_items_empty() -> None:
    r = TestClient(app).get("/items")
    assert r.status_code == 200
    assert r.json() == []