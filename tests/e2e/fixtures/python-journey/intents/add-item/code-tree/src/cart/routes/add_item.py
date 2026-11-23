from typing import Annotated

from fastapi import APIRouter, Depends, status

from cart.deps import get_store
from cart.models import Item, NewItem
from cart.store import ItemStore

router = APIRouter()


@router.post("/items", status_code=status.HTTP_201_CREATED)
def add_item(
    new_item: NewItem, store: Annotated[ItemStore, Depends(get_store)]
) -> Item:
    return store.add(new_item)