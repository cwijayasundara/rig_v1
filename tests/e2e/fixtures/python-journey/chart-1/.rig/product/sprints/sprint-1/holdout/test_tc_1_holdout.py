from holdout_support import boot


def test_tc_1_remove_item_happy_path():
    client = boot()
    created = client.post("/items", json={"name": "Coffee beans", "price": 8.5, "quantity": 2}).json()
    r = client.delete(f"/items/{created['id']}")
    assert r.status_code == 204
    assert r.content == b""
