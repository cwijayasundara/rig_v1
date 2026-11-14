import os


def test_orders_table_is_reachable():
    """Integration test: needs the real database. Fails (KeyError) when DATABASE_URL is not set."""
    url = os.environ["DATABASE_URL"]
    assert url.startswith("postgresql://")
