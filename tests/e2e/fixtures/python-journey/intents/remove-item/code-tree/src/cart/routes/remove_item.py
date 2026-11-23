from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import JSONResponse

from cart.deps import get_store
from cart.store import ItemStore

router = APIRouter()


@router.delete("/items/{item_id}")
def remove_item(
    item_id: str, store: Annotated[ItemStore, Depends(get_store)]
) -> Response:
    if store.remove(item_id) is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND, content={"detail": "Item not found"}
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)