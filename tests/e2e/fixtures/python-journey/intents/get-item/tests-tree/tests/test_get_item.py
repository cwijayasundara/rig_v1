import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

ROOT = Path(__file__).parents[1]
EXAMPLES = ROOT / "docs/contracts/examples"
EXAMPLE_200: dict[str, Any] = json.loads((EXAMPLES / "get-item-200.json").read_text())
EXAMPLE_404: dict[str, Any] = json.loads((EXAMPLES / "get-item-404.json").read_text())
ITEM = {"name": "Coffee beans", "price": 8.5, "quantity": 2}
OTHER = {"name": "Tea bags", "price": 3.25, "quantity": 12}


def test_b1_ac_2_1_get_stored_item_answers_200_with_exactly_that_item(client: TestClient) -> None:
    created = client.post("/items", json=ITEM).json()
    r = client.get(f"/items/{created['id']}")
    assert r.status_code == EXAMPLE_200["response"]["status"] == 200
    assert r.json() == created
    assert set(r.json()) == set(EXAMPLE_200["response"]["body"]) == {"id", "name", "price", "quantity"}


def test_b2_ac_2_1_dr_1_get_returns_the_matching_item_never_another(client: TestClient) -> None:
    first = client.post("/items", json=ITEM).json()
    second = client.post("/items", json=OTHER).json()
    assert client.get(f"/items/{second['id']}").json() == second
    assert client.get(f"/items/{first['id']}").json() == first


def test_b3_ac_2_2_get_unknown_id_answers_404_item_not_found(client: TestClient) -> None:
    r = client.get("/items/unknown")
    assert r.status_code == EXAMPLE_404["response"]["status"] == 404
    assert r.json() == EXAMPLE_404["response"]["body"] == {"detail": "Item not found"}


def test_b4_ac_2_2_dr_1_non_uuid_long_or_other_case_id_is_the_same_404(client: TestClient) -> None:
    stored = client.post("/items", json=ITEM).json()["id"]
    for odd in ["abc", "a" * 300, stored.upper()]:
        r = client.get(f"/items/{odd}")
        assert r.status_code == 404
        assert r.json() == {"detail": "Item not found"}