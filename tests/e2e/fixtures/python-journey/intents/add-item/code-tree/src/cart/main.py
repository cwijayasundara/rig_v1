from fastapi import FastAPI

from cart.errors import register_error_handlers
from cart.routes import include_routers
from cart.store import ItemStore


def create_app() -> FastAPI:
    app = FastAPI(title="Shopping Cart")
    app.state.store = ItemStore()
    register_error_handlers(app)
    include_routers(app)
    return app


app = create_app()