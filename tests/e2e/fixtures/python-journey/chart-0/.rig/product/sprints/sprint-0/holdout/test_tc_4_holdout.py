from holdout_support import boot


def test_tc_4_add_item_missing_name_is_400():
    client = boot()
    r = client.post("/items", json={"price": 8.5, "quantity": 2})
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert isinstance(detail, str) and "name" in detail
    assert client.get("/items").json() == []
