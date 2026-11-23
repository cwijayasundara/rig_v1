import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def app() -> FastAPI:
    # Imported inside the fixture so a missing create_app fails only the tests that use it.
    from cart.main import create_app

    return create_app()


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)