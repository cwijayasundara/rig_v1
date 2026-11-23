import json
import threading
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

ROOT = Path(__file__).parents[1]
EXAMPLE_200: dict[str, Any] = json.loads(
    (ROOT / "docs/contracts/examples/list-items-200.json").read_text()
)
ITEM = {"name": "Coffee beans", "price": 8.5, "quantity": 2}
OTHER = {"name": "Filter papers", "price": 3, "quantity": 1}


def test_b1_ac_3_1_list_holds_every_added_item_as_posted(client: TestClient) -> None:
    created = [client.post("/items", json=b).json() for b in (ITEM, OTHER)]
    r = client.get("/items")
    assert r.status_code == EXAMPLE_200["response"]["status"] == 200
    assert r.json() == created
    assert [set(i) for i in r.json()] == [set(i) for i in EXAMPLE_200["response"]["body"]]


def test_b2_ac_3_2_empty_cart_answers_200_with_empty_list(client: TestClient) -> None:
    r = client.get("/items")
    assert r.status_code == 200
    assert r.json() == []


def test_b3_ac_3_3_list_is_in_insertion_order_on_every_call(client: TestClient) -> None:
    ids = [client.post("/items", json=ITEM).json()["id"] for _ in range(5)]
    for _ in range(3):
        assert [i["id"] for i in client.get("/items").json()] == ids


def test_b4_ac_3_1_list_while_posting_answers_whole_items_only(client: TestClient) -> None:
    def post_many() -> None:
        for _ in range(50):
            client.post("/items", json=ITEM)

    poster = threading.Thread(target=post_many)
    poster.start()
    while poster.is_alive():
        r = client.get("/items")
        assert r.status_code == 200
        assert all(set(i) == {"id", "name", "price", "quantity"} for i in r.json())
    poster.join()
    assert len(client.get("/items").json()) == 50


def test_b5_ac_3_1_query_string_is_ignored(client: TestClient) -> None:
    created = client.post("/items", json=ITEM).json()
    r = client.get("/items?limit=0&sort=price")
    assert r.status_code == 200
    assert r.json() == [created]