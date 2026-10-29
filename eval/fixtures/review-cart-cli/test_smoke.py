"""B1 end to end: the module runs as a program."""

import json
import subprocess
import sys
from pathlib import Path


def test_b1_cli_module_adds_an_item(tmp_path: Path) -> None:
    cart_file = tmp_path / "cart.json"
    result = subprocess.run(
        [sys.executable, "-m", "cart.cli", "--file", str(cart_file), "add", "coffee", "Coffee beans", "2"],
        capture_output=True,
        text=True,
        env={"PYTHONPATH": "src"},
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(cart_file.read_text())["items"] == [{"sku": "coffee", "name": "Coffee beans", "quantity": 2}]
