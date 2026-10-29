"""cart-cli: the command line through main(argv, environ)."""

import ast
import json
import os
import stat
from pathlib import Path

import pytest

from cart import cli
from cart.cli import main

SRC = Path(cli.__file__).read_text()


def _items(path: Path) -> list[dict[str, object]]:
    return json.loads(path.read_text())["items"]


def _write(path: Path, items: list[dict[str, object]]) -> None:
    path.write_text(json.dumps({"items": items}) + "\n")


def test_b1_add_writes_the_item(tmp_path: Path) -> None:
    cart_file = tmp_path / "cart.json"
    assert main(["--file", str(cart_file), "add", "coffee", "Coffee beans", "2"], environ={}) == 0
    assert _items(cart_file) == [{"sku": "coffee", "name": "Coffee beans", "quantity": 2}]


def test_b2_remove_empties_the_cart(tmp_path: Path) -> None:
    cart_file = tmp_path / "cart.json"
    _write(cart_file, [{"sku": "coffee", "name": "Coffee beans", "quantity": 2}])
    assert main(["--file", str(cart_file), "remove", "coffee"], environ={}) == 0
    assert _items(cart_file) == []


def test_b3_add_prints_one_line(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    main(["--file", str(tmp_path / "c.json"), "add", "coffee", "Coffee beans", "2"], environ={})
    out, err = capsys.readouterr()
    assert (out, err) == ("Added coffee\n", "")


def test_b4_remove_prints_one_line(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    cart_file = tmp_path / "c.json"
    _write(cart_file, [{"sku": "coffee", "name": "Coffee beans", "quantity": 1}])
    main(["--file", str(cart_file), "remove", "coffee"], environ={})
    out, err = capsys.readouterr()
    assert (out, err) == ("Removed coffee\n", "")


def test_b5_default_is_the_home_cart_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    assert main(["add", "coffee", "Coffee beans", "1"], environ={}) == 0
    assert _items(tmp_path / ".simple_cart.json")[0]["sku"] == "coffee"


def test_b6_file_option_is_the_cart_file(tmp_path: Path) -> None:
    cart_file = tmp_path / "chosen.json"
    main(["--file", str(cart_file), "add", "tea", "Tea", "1"], environ={})
    assert cart_file.exists()


def test_b7_cart_file_variable_is_the_cart_file(tmp_path: Path) -> None:
    cart_file = tmp_path / "env.json"
    main(["add", "tea", "Tea", "1"], environ={"CART_FILE": str(cart_file)})
    assert cart_file.exists()


def test_b8_file_option_wins_over_the_variable(tmp_path: Path) -> None:
    chosen, ignored = tmp_path / "chosen.json", tmp_path / "ignored.json"
    main(["--file", str(chosen), "add", "tea", "Tea", "1"], environ={"CART_FILE": str(ignored)})
    assert chosen.exists() and not ignored.exists()


@pytest.mark.parametrize("quantity", ["abc", "0", "-1"])
def test_b9_bad_quantity_exits_1_and_writes_nothing(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], quantity: str
) -> None:
    cart_file = tmp_path / "c.json"
    assert main(["--file", str(cart_file), "add", "coffee", "Coffee beans", quantity], environ={}) == 1
    out, err = capsys.readouterr()
    assert out == "" and "quantity" in err
    assert not cart_file.exists()


def test_b10_cli_has_no_cart_logic() -> None:
    imported = {
        alias.name
        for node in ast.walk(ast.parse(SRC))
        if isinstance(node, (ast.Import, ast.ImportFrom))
        for alias in node.names
    }
    assert not {"json", "Item"} & imported
    assert "parse_quantity(args.quantity)" in SRC


@pytest.mark.parametrize("sku, name", [("", "Coffee"), ("   ", "Coffee"), ("coffee", ""), ("coffee", "  ")])
def test_b11_blank_sku_or_name_exits_1(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], sku: str, name: str
) -> None:
    cart_file = tmp_path / "c.json"
    assert main(["--file", str(cart_file), "add", sku, name, "1"], environ={}) == 1
    out, err = capsys.readouterr()
    assert out == "" and err
    assert not cart_file.exists()


def test_b12_removing_an_absent_sku_exits_1(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    cart_file = tmp_path / "c.json"
    _write(cart_file, [{"sku": "tea", "name": "Tea", "quantity": 1}])
    before = cart_file.read_bytes()
    assert main(["--file", str(cart_file), "remove", "coffee"], environ={}) == 1
    out, err = capsys.readouterr()
    assert out == "" and "coffee" in err
    assert cart_file.read_bytes() == before


@pytest.mark.parametrize("text", ["{not json", '{"items": 3}', "[]"])
def test_b13_unreadable_cart_file_exits_2(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], text: str
) -> None:
    cart_file = tmp_path / "c.json"
    cart_file.write_text(text)
    assert main(["--file", str(cart_file), "add", "coffee", "Coffee beans", "1"], environ={}) == 2
    out, err = capsys.readouterr()
    assert out == "" and str(cart_file) in err
    assert cart_file.read_text() == text


@pytest.mark.skipif(os.geteuid() == 0, reason="root ignores directory permissions")
def test_b14_unwritable_cart_file_exits_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    locked = tmp_path / "locked"
    locked.mkdir()
    locked.chmod(stat.S_IRUSR | stat.S_IXUSR)
    try:
        assert main(["--file", str(locked / "c.json"), "add", "coffee", "Coffee beans", "1"], environ={}) == 2
        out, err = capsys.readouterr()
        assert out == "" and "c.json" in err
    finally:
        locked.chmod(stat.S_IRWXU)


def test_b15_file_after_the_command_is_a_usage_error(tmp_path: Path) -> None:
    cart_file = tmp_path / "c.json"
    with pytest.raises(SystemExit) as excinfo:
        main(["add", "coffee", "Coffee beans", "2", "--file", str(cart_file)], environ={})
    assert excinfo.value.code == 2
    assert not cart_file.exists()
