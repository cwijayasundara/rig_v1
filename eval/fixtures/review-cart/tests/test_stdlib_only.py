"""B10 (NFR-3): the runtime uses only the Python 3.11+ standard library."""

import ast
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "src" / "cart"
ALLOWED = set(sys.stdlib_module_names) | {"cart"}


def _top_level_imports(source: str) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            names.add(node.module.split(".")[0])
    return names


def _non_stdlib_imports(sources: dict[str, str]) -> dict[str, set[str]]:
    found = {name: _top_level_imports(text) - ALLOWED for name, text in sources.items()}
    return {name: bad for name, bad in found.items() if bad}


def test_b10_nfr_3_pyproject_has_no_runtime_dependencies() -> None:
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]
    assert project["dependencies"] == []
    assert project["requires-python"] == ">=3.11"


def test_b10_nfr_3_package_imports_only_stdlib() -> None:
    for module in ("errors.py", "models.py", "storage.py"):
        assert (PACKAGE / module).is_file(), f"{module} is missing"
    sources = {path.name: path.read_text() for path in PACKAGE.glob("*.py")}
    assert _non_stdlib_imports(sources) == {}


def test_b10_nfr_3_scanner_flags_a_third_party_import() -> None:
    planted = {"planted.py": "import json\nimport requests\nfrom yaml import safe_load\n"}
    assert _non_stdlib_imports(planted) == {"planted.py": {"requests", "yaml"}}
