import json
import uuid
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).parents[1]
DATA: dict[str, Any] = json.loads(
    (ROOT / ".rig/product/sprints/sprint-0/testplan/data/items.json").read_text()
)
EXAMPLES = ROOT / "docs/contracts/examples"
EXAMPLE_201: dict[str, Any] = json.loads((EXAMPLES / "add-item-201.json").read_text())
EXAMPLE_400: dict[str, Any] = json.loads((EXAMPLES / "add-item-400.json").read_text())
INVALID: dict[str, dict[str, Any]] = DATA["invalid"]
VALID: dict[str, Any] = DATA["items"][0]

NAME_MSG = "name: must be a non-empty string"
PRICE_MSG = "price: must be a number >= 0"
QUANTITY_MSG = "quantity: must be an integer >= 1"
BODY_MSG = "body: must be a JSON object"

NAN_TEXT = '{"name":"x","price":NaN,"quantity":1}'
INFINITY_TEXT = '{"name":"x","price":Infinity,"quantity":1}'


def _texts(bodies: dict[str, Any]) -> dict[str, str]:
    return {case: json.dumps(body) for case, body in bodies.items()}


def _without(body: dict[str, Any], key: str) -> dict[str, Any]:
    return {k: v for k, v in body.items() if k != key}


def _with(body: dict[str, Any], **changes: Any) -> dict[str, Any]:
    return {**body, **changes}


def _post(client: TestClient, text: str) -> httpx.Response:
    return client.post(
        "/items", content=text, headers={"content-type": "application/json"}
    )


def _assert_rejected(client: TestClient, app: FastAPI, text: str, message: str) -> None:
    r = _post(client, text)
    assert r.status_code == 400
    assert r.json() == {"detail": message}
    assert app.state.store.all() == []
    assert client.get("/items").json() == []


NAME_TEXTS = _texts(
    {
        "missing_name": INVALID["missing_name"],
        "empty_name": INVALID["empty_name"],
        "non_string_name": INVALID["non_string_name"],
    }
)
PRICE_TEXTS = _texts(
    {
        "missing_price": _without(VALID, "price"),
        "negative_price": INVALID["negative_price"],
        "just_below_zero": _with(VALID, price=-0.01),
        "non_number_price": _with(VALID, price="eight"),
    }
)
QUANTITY_TEXTS = _texts(
    {
        "missing_quantity": _without(VALID, "quantity"),
        "zero_quantity": INVALID["zero_quantity"],
        "negative_quantity": _with(VALID, quantity=-1),
        "fractional_quantity": _with(VALID, quantity=2.5),
    }
)
TYPE_PRICE_TEXTS = {
    **_texts(
        {
            "bool_price": _with(VALID, price=True),
            "numeric_string_price": INVALID["string_price"],
        }
    ),
    "nan_price": NAN_TEXT,
    "infinity_price": INFINITY_TEXT,
}
TYPE_QUANTITY_TEXTS = _texts(
    {
        "float_quantity": INVALID["float_quantity"],
        "string_quantity": _with(VALID, quantity="2"),
        "bool_quantity": _with(VALID, quantity=True),
    }
)
BODY_TEXTS = {
    "invalid_json": "{not json",
    "empty_body": "",
    "array_body": "[1, 2]",
    "string_body": '"hello"',
}
ALL_INVALID = {
    **NAME_TEXTS,
    **PRICE_TEXTS,
    **QUANTITY_TEXTS,
    **TYPE_PRICE_TEXTS,
    **TYPE_QUANTITY_TEXTS,
    **BODY_TEXTS,
}


def test_b1_ac_1_1_dr_1_contract_example_answers_201_with_the_item(
    client: TestClient,
) -> None:
    body = EXAMPLE_201["request"]["body"]
    r = _post(client, json.dumps(body))
    assert r.status_code == 201
    created = r.json()
    assert created["name"] == body["name"]
    assert created["price"] == body["price"]
    assert created["quantity"] == body["quantity"]
    assert set(created) == set(EXAMPLE_201["response"]["body"])
    assert isinstance(created["id"], str)
    assert uuid.UUID(created["id"]).version == 4


@pytest.mark.parametrize(
    "item", DATA["items"], ids=[item["name"] for item in DATA["items"]]
)
def test_b1_ac_1_1_dr_1_each_valid_item_answers_201(
    client: TestClient, item: dict[str, Any]
) -> None:
    r = _post(client, json.dumps(item))
    assert r.status_code == 201
    created = r.json()
    for key, value in item.items():
        assert created[key] == value
    assert uuid.UUID(created["id"]).version == 4


def test_b2_ac_1_1_dr_1_two_posts_of_same_body_get_different_ids(
    client: TestClient, app: FastAPI
) -> None:
    r1 = _post(client, json.dumps(VALID))
    r2 = _post(client, json.dumps(VALID))
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["id"] != r2.json()["id"]
    assert len(app.state.store.all()) == 2


def test_b3_ac_1_1_dr_3_dr_4_lowest_valid_price_and_quantity_answer_201(
    client: TestClient, app: FastAPI
) -> None:
    r = _post(client, json.dumps(DATA["items"][1]))
    assert r.status_code == 201
    created = r.json()
    assert created["price"] == 0
    assert created["quantity"] == 1
    assert len(app.state.store.all()) == 1


@pytest.mark.parametrize("text", list(NAME_TEXTS.values()), ids=list(NAME_TEXTS))
def test_b4_ac_1_2_dr_2_invalid_name_rejected(
    client: TestClient, app: FastAPI, text: str
) -> None:
    _assert_rejected(client, app, text, NAME_MSG)


@pytest.mark.parametrize("text", list(PRICE_TEXTS.values()), ids=list(PRICE_TEXTS))
def test_b5_ac_1_3_dr_3_invalid_price_rejected(
    client: TestClient, app: FastAPI, text: str
) -> None:
    _assert_rejected(client, app, text, PRICE_MSG)


@pytest.mark.parametrize(
    "text", list(QUANTITY_TEXTS.values()), ids=list(QUANTITY_TEXTS)
)
def test_b6_ac_1_4_dr_4_invalid_quantity_rejected(
    client: TestClient, app: FastAPI, text: str
) -> None:
    _assert_rejected(client, app, text, QUANTITY_MSG)


def test_b7_ac_1_5_rejected_post_answers_example_400_body(
    client: TestClient, app: FastAPI
) -> None:
    r = _post(client, json.dumps(EXAMPLE_400["request"]["body"]))
    assert r.status_code == 400
    assert r.json() == EXAMPLE_400["response"]["body"]
    assert app.state.store.all() == []


def test_b8_ac_1_1_dr_1_client_id_is_ignored_and_a_uuid4_is_generated(
    client: TestClient, app: FastAPI
) -> None:
    r = _post(client, json.dumps(_with(VALID, id="client-chosen-id")))
    assert r.status_code == 201
    created_id = r.json()["id"]
    assert created_id != "client-chosen-id"
    assert uuid.UUID(created_id).version == 4
    assert [item.id for item in app.state.store.all()] == [created_id]


def test_b8_ac_1_1_dr_1_unknown_key_is_not_echoed(client: TestClient) -> None:
    r = _post(client, json.dumps(_with(VALID, colour="red")))
    assert r.status_code == 201
    assert set(r.json()) == {"id", "name", "price", "quantity"}
    assert "colour" not in r.json()


@pytest.mark.parametrize(
    "text", list(TYPE_PRICE_TEXTS.values()), ids=list(TYPE_PRICE_TEXTS)
)
def test_b9_ac_1_3_dr_3_non_number_price_rejected(
    client: TestClient, app: FastAPI, text: str
) -> None:
    _assert_rejected(client, app, text, PRICE_MSG)


@pytest.mark.parametrize(
    "text", list(TYPE_QUANTITY_TEXTS.values()), ids=list(TYPE_QUANTITY_TEXTS)
)
def test_b9_ac_1_4_dr_4_non_integer_quantity_rejected(
    client: TestClient, app: FastAPI, text: str
) -> None:
    _assert_rejected(client, app, text, QUANTITY_MSG)


@pytest.mark.parametrize("text", list(ALL_INVALID.values()), ids=list(ALL_INVALID))
def test_b11_ac_1_2_ac_1_3_ac_1_4_ac_1_5_never_422_and_detail_is_a_string(
    client: TestClient, text: str
) -> None:
    r = _post(client, text)
    assert r.status_code == 400
    assert isinstance(r.json()["detail"], str)


@pytest.mark.parametrize("text", list(BODY_TEXTS.values()), ids=list(BODY_TEXTS))
def test_b12_ac_1_2_ac_1_3_ac_1_4_ac_1_5_non_object_body_rejected(
    client: TestClient, app: FastAPI, text: str
) -> None:
    _assert_rejected(client, app, text, BODY_MSG)


@pytest.mark.parametrize(
    "text, message",
    [
        pytest.param(
            json.dumps(_with(VALID, name="", price=-1, quantity=0)),
            NAME_MSG,
            id="all_invalid",
        ),
        pytest.param(
            json.dumps(_with(VALID, price=-1, quantity=0)),
            PRICE_MSG,
            id="price_and_quantity_invalid",
        ),
        pytest.param(
            json.dumps(_with(VALID, name=123, quantity=0)),
            NAME_MSG,
            id="name_and_quantity_invalid",
        ),
    ],
)
def test_b13_ac_1_2_ac_1_3_ac_1_4_ac_1_5_first_invalid_field_in_order_is_named(
    client: TestClient, app: FastAPI, text: str, message: str
) -> None:
    _assert_rejected(client, app, text, message)