from holdout_support import boot


def test_tc_1_add_item_happy_path():
    client = boot()
    r = client.post("/items", json={"name": "Coffee beans", "price": 8.5, "quantity": 2})
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Coffee beans"
    assert body["price"] == 8.5
    assert body["quantity"] == 2
    assert isinstance(body["id"], str) and body["id"]
