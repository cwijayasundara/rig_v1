from holdout_support import boot


def test_tc_4_remove_unknown_id_is_404():
    client = boot()
    created = client.post("/items", json={"name": "Coffee beans", "price": 8.5, "quantity": 2}).json()
    r = client.delete("/items/does-not-exist")
    assert r.status_code == 404
    assert r.json() == {"detail": "Item not found"}
    assert client.delete(f"/items/{created['id']}").status_code == 204
