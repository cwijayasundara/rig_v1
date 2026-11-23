from holdout_support import boot


def test_tc_18_list_items_happy_path():
    client = boot()
    created = client.post("/items", json={"name": "Coffee beans", "price": 8.5, "quantity": 2}).json()
    r = client.get("/items")
    assert r.status_code == 200
    assert r.json() == [{"id": created["id"], "name": "Coffee beans", "price": 8.5, "quantity": 2}]
