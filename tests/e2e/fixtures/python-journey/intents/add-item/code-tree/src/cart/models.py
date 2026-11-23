from typing import Annotated

from pydantic import BaseModel, Field, StrictFloat, StrictInt, StrictStr

Price = Annotated[StrictInt | StrictFloat, Field(ge=0, allow_inf_nan=False)]
Quantity = Annotated[StrictInt, Field(ge=1)]


class NewItem(BaseModel):
    name: Annotated[StrictStr, Field(min_length=1)]
    price: Price
    quantity: Quantity


class Item(BaseModel):
    id: str
    name: str
    price: float | int
    quantity: int