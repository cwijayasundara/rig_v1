import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

N = 50
EXAMPLE_201: dict[str, Any] = json.loads(
    (
        Path(__file__).parents[1] / "docs/contracts/examples/add-item-201.json"
    ).read_text()
)


def test_b10_ac_1_1_dr_1_concurrent_posts_keep_every_item(
    client: TestClient, app: FastAPI
) -> None:
    text = json.dumps(EXAMPLE_201["request"]["body"])

    def _post_once(_: int) -> httpx.Response:
        return client.post(
            "/items", content=text, headers={"content-type": "application/json"}
        )

    with ThreadPoolExecutor(max_workers=N) as pool:
        responses = list(pool.map(_post_once, range(N)))

    assert [r.status_code for r in responses] == [201] * N
    ids = [r.json()["id"] for r in responses]
    assert all(uuid.UUID(i).version == 4 for i in ids)
    assert len(set(ids)) == N
    stored = app.state.store.all()
    assert len(stored) == N
    assert {item.id for item in stored} == set(ids)