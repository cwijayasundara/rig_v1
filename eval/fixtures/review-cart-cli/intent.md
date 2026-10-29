# Cart CLI: the `cart add` and `cart remove` command

## Intent

A shopper uses the cart from the command line (FR-5): `cart add <sku> <name> <quantity>` and `cart remove <sku>`. `cli.py` is the composition root and nothing more: it parses arguments with `argparse`, resolves the cart file path, builds `JsonFileStore` and `Cart`, calls one method, prints the result line and maps errors to exit codes (NFR-2). Done when the CLI tests pass through `main(argv, environ)` and one subprocess smoke test runs `python -m cart.cli`. The skeleton's `tests/test_smoke.py` asserts `main([]) == 0`, which no longer holds once a subcommand is required; this intent rewrites that file.

## Non-goals

- Do not put any cart rule in `cli.py` (validation, merge, quantity parsing, sku comparison): call `Cart` and `parse_quantity`.
- Do not add a read command (`get`, `list`) or any option beyond `--file`.
- Do not change argparse's own usage errors (unknown command, missing argument): they keep argparse's exit 2.
- Do not edit `models.py`, `storage.py` or `errors.py`.

## Design

| Part | Responsibility | Must not |
|---|---|---|
| `main(argv=None, environ=None) -> int` in `cli.py` | composition root: parse `cart [--file PATH] add <sku> <name> <quantity>` or `cart [--file PATH] remove <sku>`, resolve the path, build `JsonFileStore` and `Cart`, call one method, print the line, map errors to the exit code | contain cart logic; read `os.environ` directly (it takes `environ` so tests inject it); call `sys.exit` itself except under `__main__`; the one exception is argparse's own `SystemExit` (code 2) for a usage error, which `main` lets propagate |
| `build_parser()` in `cli.py` | the `argparse` parser with the global `--file` and the `add` and `remove` subcommands; `quantity` is taken as a string | convert or check the quantity (that is `parse_quantity`) |
| path resolution in `cli.py` | `--file`, else `environ["CART_FILE"]`, else `Path.home() / ".simple_cart.json"` | check that the file exists |

## Interfaces

None (kind: internal). The command line is the product surface: `cart [--file PATH] add <sku> <name> <quantity>` and `cart [--file PATH] remove <sku>`; the console script `cart = "cart.cli:main"` already exists in `pyproject.toml`.
