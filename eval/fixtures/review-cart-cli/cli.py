"""Command line entry point: the composition root (argparse, path, wiring, exit codes; no cart logic)."""

import argparse
import os
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

from cart.errors import CartError, StorageError
from cart.models import Cart, parse_quantity
from cart.storage import JsonFileStore

DEFAULT_NAME = ".simple_cart.json"
EXIT_OK = 0
EXIT_REFUSED = 1  # validation failed or the sku is not in the cart
EXIT_STORAGE = 2  # the cart file cannot be read or written


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cart", description="A tiny shopping cart.")
    parser.add_argument("--file", metavar="PATH", help="the cart file (default: $CART_FILE or ~/.simple_cart.json)")
    commands = parser.add_subparsers(dest="command", required=True, metavar="COMMAND")
    add = commands.add_parser("add", help="add an item, or add to its quantity")
    add.add_argument("sku")
    add.add_argument("name")
    add.add_argument("quantity", help="a whole number of at least 1")
    remove = commands.add_parser("remove", help="remove an item whatever its quantity")
    remove.add_argument("sku")
    return parser


def cart_path(file: str | None, environ: Mapping[str, str]) -> Path:
    """--file, else $CART_FILE, else ~/.simple_cart.json."""
    if file is not None:
        return Path(file)
    if "CART_FILE" in environ:
        return Path(environ["CART_FILE"])
    return Path.home() / DEFAULT_NAME


def main(argv: Sequence[str] | None = None, environ: Mapping[str, str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    path = cart_path(args.file, os.environ if environ is None else environ)
    try:
        cart = Cart(JsonFileStore(path))
        if args.command == "add":
            cart.add(args.sku, args.name, parse_quantity(args.quantity))
            line = f"Added {args.sku}"
        else:
            cart.remove(args.sku)
            line = f"Removed {args.sku}"
    except StorageError as error:
        print(error, file=sys.stderr)
        return EXIT_STORAGE
    except CartError as error:
        print(error, file=sys.stderr)
        return EXIT_REFUSED
    print(line)
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
