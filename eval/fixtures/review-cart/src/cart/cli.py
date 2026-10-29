"""Command line entry point (argparse only; no cart logic)."""

import argparse
import sys
from collections.abc import Sequence


def build_parser() -> argparse.ArgumentParser:
    return argparse.ArgumentParser(prog="cart", description="A tiny shopping cart.")


def main(argv: Sequence[str] | None = None) -> int:
    build_parser().parse_args(argv)
    return 0


if __name__ == "__main__":
    sys.exit(main())
