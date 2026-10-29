## Behaviours

- B1 (FR-5, AC-5.1): given a temp cart file, `cart add coffee "Coffee beans" 2` exits 0 and the file holds that item; one test runs it as a subprocess `python -m cart.cli`.
- B2 (FR-5, AC-5.2): given a temp cart file holding `coffee`, `cart remove coffee` exits 0 and the file holds no items.
- B3 (FR-5, AC-5.7): `cart add <sku> <name> <quantity>` that succeeds prints exactly one line `Added <sku>` to stdout (for example `Added coffee`) and nothing on stderr.
- B4 (FR-5, AC-5.8): `cart remove <sku>` that succeeds prints exactly one line `Removed <sku>` to stdout (for example `Removed coffee`) and nothing on stderr.
- B5 (FR-5, AC-5.5): when neither `--file` nor `CART_FILE` is given, the cart file is `~/.simple_cart.json` (`Path.home() / ".simple_cart.json"`; a test patches `Path.home`).
- B6 (FR-5, AC-5.6): when `--file PATH` is given, that path is the cart file.
- B7 (FR-5, AC-5.6): when the `CART_FILE` environment variable is given (and no `--file`), that path is the cart file.
- B8 (FR-5, AC-5.9): when both `--file PATH` and `CART_FILE` are given, `--file PATH` is used.
- B9 (FR-5, AC-5.10): `cart add coffee "Coffee beans" abc`, and a quantity less than 1 (`0`, `-1`), exit 1 with the validation message on stderr (not argparse's exit 2), print nothing on stdout, and leave the cart file unwritten.
- B10 (NFR-2): `cli.py` contains no cart logic (0 cart-logic statements): it only parses arguments, resolves the path, wires `JsonFileStore` and `Cart`, prints the line and maps errors to exit codes; it does not import `json` or `Item`, and calls `parse_quantity` for the quantity. Cart logic stays testable without the CLI because `cart-operations` tests drive `Cart` directly. Verified by review and an AST check in `tests/test_cli.py`.

### Failure behaviour

- B11 (FR-5, AC-5.3): when `add` fails validation (empty or whitespace-only `sku` or `name`), the command exits 1 with the message on stderr, nothing on stdout, and the cart file unwritten.
- B12 (FR-5, AC-5.3): when `cart remove <sku>` names a sku that is not in the cart, the command exits 1 with the message on stderr, nothing on stdout, and the cart file unchanged.
- B13 (FR-5, AC-5.4): when the cart file cannot be read (invalid JSON, valid JSON of the wrong shape, or an unreadable path), the command exits 2 with a message naming the file on stderr, nothing on stdout, and the file is left byte-for-byte unchanged.
- B14 (FR-5, AC-5.12): when the cart file cannot be written (for example a read-only directory), the command exits 2 with a message naming the file on stderr and nothing on stdout, the same as a failed read.
- B15 (FR-5, AC-5.11): `--file PATH` is accepted only before the subcommand; `cart add coffee "Coffee beans" 2 --file x` is an argparse usage error: argparse raises `SystemExit` with code 2 out of `main(...)` (it is not caught or mapped), and a test asserts it with `pytest.raises(SystemExit)` and `excinfo.value.code == 2`; no cart file is written. `--help` shows `--file` as a global option.
