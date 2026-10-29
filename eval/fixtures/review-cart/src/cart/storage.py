"""The JSON cart file (docs/contracts/cart-file.md): strict load, atomic save."""

import json
import os
import stat
import tempfile
from pathlib import Path
from typing import Any

from cart.errors import StorageError
from cart.models import Item

FIELDS = ("sku", "name", "quantity")


class JsonFileStore:
    """Loads and saves one cart file in the DR-5 format."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> list[Item]:
        """Return the stored items in file order; a missing file is an empty cart. Never writes."""
        try:
            raw = self.path.read_bytes()
        except FileNotFoundError:
            return []
        except OSError as error:
            raise StorageError(self.path, f"cannot be read ({error.strerror})") from error
        try:
            data = json.loads(raw.decode("utf-8"))
        except UnicodeDecodeError as error:
            raise StorageError(self.path, "is not valid UTF-8") from error
        except json.JSONDecodeError as error:
            raise StorageError(self.path, f"is not valid JSON ({error.msg})") from error
        except (RecursionError, ValueError) as error:
            raise StorageError(self.path, "is not valid JSON (too deeply nested or too large a number)") from error
        return self._items_from(data)

    def save(self, items: list[Item]) -> None:
        """Replace the cart file atomically, following a symlink and keeping its permissions."""
        target = Path(os.path.realpath(self.path))
        text = json.dumps(
            {"items": [{field: getattr(item, field) for field in FIELDS} for item in items]},
            ensure_ascii=False,
        )
        try:
            content = (text + "\n").encode("utf-8")
        except UnicodeEncodeError as error:
            raise StorageError(self.path, "cannot be written (text is not valid UTF-8)") from error
        temp: str | None = None
        try:
            mode = _mode_for(target)
            fd, temp = tempfile.mkstemp(dir=target.parent, prefix=f".{target.name}.", suffix=".tmp")
            with os.fdopen(fd, "wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temp, mode)
            os.replace(temp, target)
            temp = None
            _fsync_directory(target.parent)
        except OSError as error:
            raise StorageError(self.path, f"cannot be written ({error})") from error
        finally:
            if temp is not None:
                Path(temp).unlink(missing_ok=True)

    def _items_from(self, data: Any) -> list[Item]:
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            raise StorageError(self.path, 'is not an object with an "items" list')
        items: list[Item] = []
        seen: set[str] = set()
        for position, entry in enumerate(data["items"]):
            item = self._item_from(entry, position)
            if item.sku in seen:
                raise StorageError(self.path, f"item {position} repeats sku {item.sku!r}")
            seen.add(item.sku)
            items.append(item)
        return items

    def _item_from(self, entry: Any, position: int) -> Item:
        if not isinstance(entry, dict) or any(field not in entry for field in FIELDS):
            raise StorageError(self.path, f"item {position} needs sku, name and quantity")
        sku, name, quantity = entry["sku"], entry["name"], entry["quantity"]
        if not (_is_utf8_text(sku) and _is_utf8_text(name)):
            raise StorageError(self.path, f"item {position} sku and name must be UTF-8 strings")
        if type(quantity) is not int or quantity < 1:
            raise StorageError(self.path, f"item {position} quantity must be an integer of at least 1")
        return Item(sku, name, quantity)


def _is_utf8_text(value: Any) -> bool:
    """A string that can be written back as UTF-8 (JSON allows lone surrogates; UTF-8 does not)."""
    if not isinstance(value, str):
        return False
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


def _mode_for(target: Path) -> int:
    """The existing file's permission bits, or what an ordinary new file would get."""
    try:
        return stat.S_IMODE(target.stat().st_mode)
    except FileNotFoundError:
        umask = os.umask(0)
        os.umask(umask)
        return 0o666 & ~umask


def _fsync_directory(directory: Path) -> None:
    fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
