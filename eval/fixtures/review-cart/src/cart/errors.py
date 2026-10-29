"""Errors raised by the cart; every one is a CartError."""

from pathlib import Path


class CartError(Exception):
    """Base class for every error the cart raises."""


class ValidationError(CartError):
    """An argument to a cart operation is not acceptable."""


class ItemNotFoundError(CartError):
    """No item with the requested sku is in the cart."""


class StorageError(CartError):
    """The cart file cannot be read, parsed or written."""

    def __init__(self, path: Path, reason: str) -> None:
        super().__init__(f"cart file {path}: {reason}")
        self.path = path
        self.reason = reason
