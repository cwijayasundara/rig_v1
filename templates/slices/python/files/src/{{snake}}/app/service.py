"""The use cases: they combine the domain with a store they are given. They import the domain only; the store arrives as an argument."""
from {{snake}}.domain.{{snake}} import {{Name}}Error, create_{{snake}}


class {{Name}}Service:
    def __init__(self, store) -> None:
        self._store = store

    def add(self, id: str, name: str) -> dict:
        item = create_{{snake}}(id, name)
        self._store.save(item)
        return item

    def get(self, id: str) -> dict:
        item = self._store.get(id)
        if item is None:
            raise {{Name}}Error("not-found", f"no {{name}} {id}")
        return item
