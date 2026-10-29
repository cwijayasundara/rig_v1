import subprocess
import sys

from cart.cli import main


def test_main_returns_zero() -> None:
    assert main([]) == 0


def test_cli_module_runs() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "cart.cli"],
        capture_output=True,
        env={"PYTHONPATH": "src"},
        check=False,
    )
    assert result.returncode == 0
