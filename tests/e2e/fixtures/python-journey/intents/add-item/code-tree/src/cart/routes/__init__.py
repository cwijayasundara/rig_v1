import importlib
import pkgutil

from fastapi import FastAPI


def include_routers(app: FastAPI) -> None:
    for module_info in pkgutil.iter_modules(__path__):
        module = importlib.import_module(f"{__name__}.{module_info.name}")
        app.include_router(module.router)