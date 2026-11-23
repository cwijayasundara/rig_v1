import json
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).parents[1]
EXAMPLE_404: dict[str, Any] = json.loads(
    (ROOT / "docs/contracts/examples/remove-item-404.json").read_text()
)
ITEM = {"name": "Coffee beans", "price": 8.5, "quantity": 2}
OTHER = {"name": "Tea bags", "price": 3.25, "quantity": 12}


def _add(client: TestClient, body: dict[str, Any]) -> str:
    return str(client.post("/items", json=body).json()["id"])


def test_b1_ac_1_1_dr_1_delete_stored_item_answers_204_empty(client: TestClient) -> None:
    item_id = _add(client, ITEM)
    r = client.delete(f"/items/{item_id}")
    assert r.status_code == 204
    assert r.content == b""


def test_b2_ac_1_2_get_after_removal_is_404(client: TestClient) -> None:
    item_id = _add(client, ITEM)
    assert client.delete(f"/items/{item_id}").status_code == 204
    assert client.get(f"/items/{item_id}").status_code == 404


def test_b3_ac_1_3_list_after_removal_keeps_the_others_in_order(
    client: TestClient, app: FastAPI
) -> None:
    first = _add(client, ITEM)
    second = _add(client, OTHER)
    third = _add(client, ITEM)
    assert client.delete(f"/items/{second}").status_code == 204
    assert [i.id for i in app.state.store.all()] == [first, third]


def test_b4_ac_1_4_dr_1_delete_unknown_id_is_404_and_changes_nothing(
    client: TestClient, app: FastAPI
) -> None:
    kept = _add(client, ITEM)
    for unknown in ["does-not-exist", kept.upper()]:
        r = client.delete(f"/items/{unknown}")
        assert r.status_code == EXAMPLE_404["response"]["status"] == 404
        assert r.json() == EXAMPLE_404["response"]["body"] == {"detail": "Item not found"}
    assert [i.id for i in app.state.store.all()] == [kept]


def test_b5_ac_1_1_ac_1_4_second_delete_is_404(client: TestClient) -> None:
    item_id = _add(client, ITEM)
    assert client.delete(f"/items/{item_id}").status_code == 204
    r = client.delete(f"/items/{item_id}")
    assert r.status_code == 404
    assert r.json() == {"detail": "Item not found"}


def test_b6_ac_1_1_ac_1_4_concurrent_deletes_answer_one_204_one_404(client: TestClient) -> None:
    item_id = _add(client, ITEM)
    statuses: list[int] = []
    barrier = threading.Barrier(2)

    def go() -> None:
        barrier.wait()
        statuses.append(client.delete(f"/items/{item_id}").status_code)

    threads = [threading.Thread(target=go) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(statuses) == [204, 404]


def test_b7_ac_1_4_delete_never_answers_400_or_422(client: TestClient) -> None:
    for odd in ["%20", "1", "not-a-uuid", "a" * 300]:
        assert client.delete(f"/items/{odd}").status_code == 404