"""Tests for cart-storage: errors, Item and JsonFileStore (B1-B9, B11-B18)."""

import dataclasses
import json
import os
import stat
import tempfile
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest

from cart.errors import CartError, ItemNotFoundError, StorageError, ValidationError
from cart.models import Item
from cart.storage import JsonFileStore

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / ".rig" / "product" / "sprints" / "sprint-1" / "testplan" / "data"
CONTRACT_EXAMPLE = ROOT / "docs" / "contracts" / "cart-file.example.json"

COFFEE = Item("coffee", "Coffee beans", 2)
MILK = Item("milk", "Whole milk", 1)


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _cart_file_from(fixture: str, directory: Path) -> Path:
    """A writable cart file in `directory` holding the fixture's bytes (for save tests)."""
    target = directory / "cart.json"
    target.write_bytes((DATA / fixture).read_bytes())
    return target


def _assert_refused_unchanged(path: Path) -> None:
    before = path.read_bytes()
    with pytest.raises(StorageError) as excinfo:
        JsonFileStore(path).load()
    assert str(path) in str(excinfo.value)
    assert path.read_bytes() == before


@pytest.fixture
def umask_022() -> Iterator[None]:
    old = os.umask(0o022)
    yield
    os.umask(old)


def _failing(name: str) -> Callable[..., Any]:
    def fail(*args: Any, **kwargs: Any) -> Any:
        raise OSError(f"injected {name} failure")

    return fail


# B1


def test_b1_ac_4_1_missing_file_loads_empty_and_creates_nothing(tmp_path: Path) -> None:
    path = tmp_path / "cart.json"
    assert JsonFileStore(path).load() == []
    assert not path.exists()


# B2


def test_b2_ac_4_6_save_writes_dr_5_format(tmp_path: Path) -> None:
    path = tmp_path / "cart.json"
    JsonFileStore(path).save([COFFEE, MILK])
    assert _read_json(path) == _read_json(DATA / "valid-coffee-milk.json")


def test_b2_ac_4_6_contract_example_round_trips(tmp_path: Path) -> None:
    assert _read_json(CONTRACT_EXAMPLE) == _read_json(DATA / "valid-one.json")
    items = JsonFileStore(CONTRACT_EXAMPLE).load()
    assert items == [COFFEE]
    path = tmp_path / "cart.json"
    JsonFileStore(path).save(items)
    assert _read_json(path) == _read_json(CONTRACT_EXAMPLE)


# B3


def test_b3_ac_4_2_load_keeps_file_order() -> None:
    assert JsonFileStore(DATA / "valid-coffee-milk.json").load() == [COFFEE, MILK]


def test_b3_ac_4_2_save_then_load_keeps_order(tmp_path: Path) -> None:
    store = JsonFileStore(tmp_path / "cart.json")
    store.save([MILK, COFFEE])
    assert store.load() == [MILK, COFFEE]


# B4


def test_b4_dr_1_item_has_three_fields_and_is_frozen() -> None:
    assert [field.name for field in dataclasses.fields(Item)] == ["sku", "name", "quantity"]
    with pytest.raises(dataclasses.FrozenInstanceError):
        setattr(COFFEE, "quantity", 3)


def test_b4_errors_share_a_base() -> None:
    for error in (ValidationError, ItemNotFoundError, StorageError):
        assert issubclass(error, CartError)


# B5


def test_b5_ac_4_7_extra_field_is_ignored_then_dropped_on_save(tmp_path: Path) -> None:
    items = JsonFileStore(DATA / "valid-extra-field.json").load()
    assert items == [COFFEE]
    path = tmp_path / "cart.json"
    JsonFileStore(path).save(items)
    assert _read_json(path) == {"items": [{"sku": "coffee", "name": "Coffee beans", "quantity": 2}]}


# B6


@pytest.mark.parametrize(
    "fixture", ["invalid-json.json", "invalid-json-truncated.json", "invalid-json-empty.json"]
)
def test_b6_ac_4_4_invalid_json_is_refused_unchanged(fixture: str) -> None:
    _assert_refused_unchanged(DATA / fixture)


# B7


@pytest.mark.parametrize(
    "fixture",
    [
        "wrong-top-array.json",
        "wrong-no-items.json",
        "wrong-items-not-list.json",
        "wrong-item-not-object.json",
        "wrong-missing-field.json",
        "wrong-sku-not-string.json",
        "wrong-name-not-string.json",
    ],
)
def test_b7_ac_4_5_wrong_shape_is_refused_unchanged(fixture: str) -> None:
    _assert_refused_unchanged(DATA / fixture)


# B8


@pytest.mark.parametrize(
    "fixture",
    [
        "wrong-qty-zero.json",
        "wrong-qty-negative.json",
        "wrong-qty-string.json",
        "wrong-qty-float.json",
        "wrong-qty-bool.json",
    ],
)
def test_b8_ac_4_5_ac_1_5_bad_quantity_is_refused_unchanged(fixture: str) -> None:
    _assert_refused_unchanged(DATA / fixture)


# B9


def test_b9_ac_4_5_duplicate_sku_is_refused_unchanged() -> None:
    _assert_refused_unchanged(DATA / "duplicate-sku.json")


def test_b9_dr_2_skus_differing_in_case_are_two_items() -> None:
    items = JsonFileStore(DATA / "valid-case-skus.json").load()
    assert [item.sku for item in items] == ["coffee", "Coffee"]


# B11 (NFR-1)


@pytest.mark.parametrize("patched", ["replace", "fsync"])
def test_b11_nfr_1_failed_save_leaves_original_and_no_temp(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, patched: str
) -> None:
    path = _cart_file_from("valid-one.json", tmp_path)
    before = path.read_bytes()
    monkeypatch.setattr(os, patched, _failing(patched))
    with pytest.raises(StorageError):
        JsonFileStore(path).save([COFFEE, MILK])
    assert path.read_bytes() == before
    assert sorted(p.name for p in tmp_path.iterdir()) == ["cart.json"]


def test_b11_nfr_1_failed_first_save_leaves_no_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(os, "replace", _failing("replace"))
    with pytest.raises(StorageError):
        JsonFileStore(tmp_path / "cart.json").save([COFFEE])
    assert list(tmp_path.iterdir()) == []


def test_b11_nfr_1_temp_file_is_made_beside_the_target(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dirs: list[str] = []
    real_mkstemp = tempfile.mkstemp

    def spy(*args: Any, **kwargs: Any) -> tuple[int, str]:
        dirs.append(str(kwargs.get("dir")))
        return real_mkstemp(*args, **kwargs)

    monkeypatch.setattr(tempfile, "mkstemp", spy)
    JsonFileStore(tmp_path / "cart.json").save([COFFEE])
    assert dirs == [str(tmp_path)]
    assert sorted(p.name for p in tmp_path.iterdir()) == ["cart.json"]


# B12


def test_b12_ac_4_3_ac_4_8_unwritable_directory_raises_and_leaves_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = _cart_file_from("valid-one.json", tmp_path)
    before = path.read_bytes()

    def read_only_directory(*args: Any, **kwargs: Any) -> tuple[int, str]:
        raise PermissionError(13, "Permission denied", str(tmp_path))

    monkeypatch.setattr(tempfile, "mkstemp", read_only_directory)
    with pytest.raises(StorageError) as excinfo:
        JsonFileStore(path).save([COFFEE, MILK])
    assert str(path) in str(excinfo.value)
    assert path.read_bytes() == before
    assert sorted(p.name for p in tmp_path.iterdir()) == ["cart.json"]


# B13


def test_b13_ac_5_4_unreadable_path_raises_storage_error(tmp_path: Path) -> None:
    with pytest.raises(StorageError) as excinfo:
        JsonFileStore(tmp_path).load()
    assert str(tmp_path) in str(excinfo.value)


def test_b13_ac_5_4_permission_denied_raises_storage_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = _cart_file_from("valid-one.json", tmp_path)

    def denied(self: Path) -> bytes:
        raise PermissionError(13, "Permission denied", str(self))

    monkeypatch.setattr(Path, "read_bytes", denied)
    with pytest.raises(StorageError) as excinfo:
        JsonFileStore(path).load()
    assert str(path) in str(excinfo.value)


# B14


def test_b14_nfr_1_save_keeps_existing_permissions(tmp_path: Path) -> None:
    path = _cart_file_from("valid-one.json", tmp_path)
    path.chmod(0o640)
    JsonFileStore(path).save([COFFEE, MILK])
    assert stat.S_IMODE(path.stat().st_mode) == 0o640


# B15


def test_b15_nfr_1_new_file_follows_umask(tmp_path: Path, umask_022: None) -> None:
    path = tmp_path / "cart.json"
    JsonFileStore(path).save([COFFEE])
    assert stat.S_IMODE(path.stat().st_mode) == 0o644


# B16


def test_b16_ac_4_6_names_are_written_as_readable_utf8(tmp_path: Path) -> None:
    path = tmp_path / "cart.json"
    store = JsonFileStore(path)
    store.save([Item("cafe", "Café crème", 1)])
    assert "Café crème" in path.read_bytes().decode("utf-8")
    assert store.load() == [Item("cafe", "Café crème", 1)]


# B17


def test_b17_ac_4_4_non_utf8_file_is_refused_unchanged(tmp_path: Path) -> None:
    path = tmp_path / "cart.json"
    path.write_bytes(b'{"items": [{"sku": "caf\xe9", "name": "x", "quantity": 1}]}')
    _assert_refused_unchanged(path)


@pytest.mark.parametrize(
    "content",
    [
        "[" * 100_000,
        '{"items": [{"sku": "a", "name": "b", "quantity": ' + "9" * 5000 + "}]}",
    ],
    ids=["too-deeply-nested", "too-many-digits"],
)
def test_b6_ac_4_4_hostile_json_is_refused_as_storage_error(tmp_path: Path, content: str) -> None:
    path = tmp_path / "cart.json"
    path.write_text(content, encoding="utf-8")
    _assert_refused_unchanged(path)


def test_b7_ac_4_5_lone_surrogate_in_a_name_is_refused(tmp_path: Path) -> None:
    path = tmp_path / "cart.json"
    path.write_text('{"items": [{"sku": "a", "name": "\\ud800", "quantity": 1}]}', encoding="utf-8")
    _assert_refused_unchanged(path)


def test_b12_ac_4_8_unencodable_name_raises_storage_error_and_leaves_file(tmp_path: Path) -> None:
    path = _cart_file_from("valid-one.json", tmp_path)
    before = path.read_bytes()
    with pytest.raises(StorageError) as excinfo:
        JsonFileStore(path).save([Item("a", "\ud800", 1)])
    assert str(path) in str(excinfo.value)
    assert path.read_bytes() == before
    assert sorted(p.name for p in tmp_path.iterdir()) == ["cart.json"]


# B18


def test_b18_nfr_1_save_through_symlink_replaces_target(tmp_path: Path) -> None:
    real_dir = tmp_path / "synced"
    real_dir.mkdir()
    target = _cart_file_from("valid-one.json", real_dir)
    link = tmp_path / "cart.json"
    link.symlink_to(target)
    store = JsonFileStore(link)
    store.save([COFFEE, MILK])
    assert link.is_symlink()
    assert link.resolve() == target.resolve()
    assert _read_json(target) == _read_json(DATA / "valid-coffee-milk.json")
    assert store.load() == [COFFEE, MILK]
    assert sorted(p.name for p in real_dir.iterdir()) == ["cart.json"]
