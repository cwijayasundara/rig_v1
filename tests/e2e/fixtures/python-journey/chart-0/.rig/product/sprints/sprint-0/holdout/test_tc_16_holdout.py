from holdout_support import boot


def test_tc_16_get_item_unknown_id_is_404():
    client = boot()
    r = client.get("/items/does-not-exist")
    assert r.status_code == 404
    assert r.json() == {"detail": "Item not found"}
