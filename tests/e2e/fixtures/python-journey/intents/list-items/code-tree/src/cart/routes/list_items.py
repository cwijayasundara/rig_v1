from typing import Annotated

from fastapi import APIRouter, Depends

from cart.deps import get_store
from cart.models import Item
from cart.store import ItemStore

router = APIRouter()


@router.get("/items")
def list_items(store: Annotated[ItemStore, Depends(get_store)]) -> list[Item]:
    return store.all()