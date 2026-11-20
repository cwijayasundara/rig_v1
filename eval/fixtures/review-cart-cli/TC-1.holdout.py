"""An explicit empty --file must never fall back to the environment's cart."""

import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory


source = str(Path("src").resolve())
with TemporaryDirectory() as temp:
    cart_file = Path(temp) / "fallback.json"
    run = subprocess.run(
        [sys.executable, "-m", "cart.cli", "--file", "", "add", "a", "A", "1"],
        cwd=temp,
        env={**os.environ, "PYTHONPATH": source, "CART_FILE": str(cart_file)},
        capture_output=True,
    )
    assert (run.returncode, cart_file.exists()) == (2, False)
