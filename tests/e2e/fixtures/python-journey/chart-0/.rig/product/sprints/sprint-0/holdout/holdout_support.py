"""Shared boot code for the holdout tests: black-box access via the public HTTP interface."""
import sys
from pathlib import Path

from fastapi.testclient import TestClient

_root = Path.cwd()
sys.path.insert(0, str(_root / "src"))

from cart.main import create_app  # noqa: E402  (public app factory, used only to boot)


def boot() -> TestClient:
    """A client on a fresh app with an empty cart."""
    return TestClient(create_app())
