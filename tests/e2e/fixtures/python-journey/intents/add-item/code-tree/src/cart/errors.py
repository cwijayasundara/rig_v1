from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

FIELD_MESSAGES: dict[str, str] = {
    "name": "name: must be a non-empty string",
    "price": "price: must be a number >= 0",
    "quantity": "quantity: must be an integer >= 1",
}
BODY_MESSAGE = "body: must be a JSON object"


def _message(errors: Sequence[Any]) -> str:
    failed = {str(err["loc"][1]) for err in errors if len(err["loc"]) > 1}
    for field, message in FIELD_MESSAGES.items():
        if field in failed:
            return message
    return BODY_MESSAGE


def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return JSONResponse(status_code=400, content={"detail": _message(exc.errors())})


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, validation_error_handler)