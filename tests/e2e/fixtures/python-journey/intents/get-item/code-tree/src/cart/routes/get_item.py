from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from cart.deps import get_store
from cart.models import Item
from cart.store import ItemStore

router = APIRouter()


@router.get("/items/{item_id}")
def get_item(item_id: str, store: Annotated[ItemStore, Depends(get_store)]) -> Item:
    item = store.get(item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item