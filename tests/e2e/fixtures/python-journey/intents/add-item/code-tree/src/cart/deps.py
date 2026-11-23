from fastapi import Request

from cart.store import ItemStore


def get_store(request: Request) -> ItemStore:
    store: ItemStore = request.app.state.store
    return store