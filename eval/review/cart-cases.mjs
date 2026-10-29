// Review cases on real code (verification evidence 1): shop_app at 26f1105 (eval/fixtures/review-cart), and its next change, cart-cli,
// with its real intent and spec. A correct cart-cli (eval/fixtures/review-cart-cli) is the clean control; each defect case seeds one
// bug into that 230-line diff that the builder's own tests still pass. Most break no B-line by name: the reviewer has to see it.
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(import.meta.dirname, '../fixtures/review-cart-cli')
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8')
const CLI = read('cli.py'), TESTS = read('test_cli.py'), SMOKE = read('test_smoke.py')
const edit = (text, ...pairs) => pairs.reduce((t, [from, to]) => { if (!t.includes(from)) throw new Error(`seed edit did not apply: ${from.slice(0, 40)}`); return t.replace(from, to) }, text)

const plan = '## Files\n- src/cart/cli.py\n- tests/test_cli.py\n- tests/test_smoke.py\n\n## Tests\n- B1-B9, B11-B15: tests/test_cli.py\n- B1 (subprocess): tests/test_smoke.py\n- B10: tests/test_cli.py (AST check) and review\n\n## Contracts\nnone'
const base = { base: 'cart', slug: 'cart-cli', intent: read('intent.md'), spec: read('spec.md'), plan, hard: true }
// A probe is Python run in the case's repo (T a temp dir; main, Cart, Path, os, json imported): its output differs from the clean control's, so the seeded defect is a real bug.
const change = (cli, tests = TESTS) => ({ edits: { 'src/cart/cli.py': () => cli, 'tests/test_smoke.py': () => SMOKE }, newFiles: { 'tests/test_cli.py': tests } })

export const CART_CASES = [
  { ...base, id: 'cli-ok', control: true, hard: false, ...change(CLI), notes: 'Built cart-cli to the spec; 121 tests pass.', defects: [] },
  {
    ...base, id: 'cli-ok-handlers', control: true, hard: false, notes: 'Split add and remove into small handlers; same behaviour, 121 tests pass.', defects: [],
    ...change(edit(CLI,
      ['    try:\n        cart = Cart(JsonFileStore(path))\n        if args.command == "add":\n            cart.add(args.sku, args.name, parse_quantity(args.quantity))\n            line = f"Added {args.sku}"\n        else:\n            cart.remove(args.sku)\n            line = f"Removed {args.sku}"\n',
        '    handler = _add if args.command == "add" else _remove\n    try:\n        line = handler(Cart(JsonFileStore(path)), args)\n'],
      ['if __name__ == "__main__":', 'def _add(cart: Cart, args: argparse.Namespace) -> str:\n    cart.add(args.sku, args.name, parse_quantity(args.quantity))\n    return f"Added {args.sku}"\n\n\ndef _remove(cart: Cart, args: argparse.Namespace) -> str:\n    cart.remove(args.sku)\n    return f"Removed {args.sku}"\n\n\nif __name__ == "__main__":'])),
  },
  {
    ...base, id: 'cli-except-order', probe: "f = T / 'c.json'; f.write_text('{bad'); print(main(['--file', str(f), 'remove', 'x'], environ={}))", notes: 'Mapped errors to exit codes; the read and write failure tests check the command fails and names the file.',
    ...change(
      edit(CLI, ['    except StorageError as error:\n        print(error, file=sys.stderr)\n        return EXIT_STORAGE\n    except CartError as error:\n        print(error, file=sys.stderr)\n        return EXIT_REFUSED\n',
        '    except CartError as error:\n        print(error, file=sys.stderr)\n        return EXIT_REFUSED\n    except StorageError as error:\n        print(error, file=sys.stderr)\n        return EXIT_STORAGE\n']),
      edit(TESTS, ['"add", "coffee", "Coffee beans", "1"], environ={}) == 2\n    out, err = capsys.readouterr()\n    assert out == "" and str(cart_file) in err', '"add", "coffee", "Coffee beans", "1"], environ={}) != 0\n    out, err = capsys.readouterr()\n    assert out == "" and str(cart_file) in err'],
        ['"Coffee beans", "1"], environ={}) == 2\n        out, err', '"Coffee beans", "1"], environ={}) != 0\n        out, err'])),
    // StorageError is a CartError: the first clause takes it, so a damaged or unwritable file exits 1, not 2 (B13, B14).
    defects: [{ id: 'storage-error-exits-1', file: ['src/cart/cli.py', 'tests/test_cli.py'], re: /order|first|subclass|unreachable|never reach|shadow|exit(s)? 1|B13|B14|!= 0/i }],
  },
  {
    ...base, id: 'cli-environ-falsy', probe: "os.environ['CART_FILE'] = str(T / 'env.json'); Path.home = lambda: T; main(['add', 'a', 'A', '1'], environ={}); print((T / 'env.json').exists())", notes: 'main takes environ for tests and falls back to the process environment.',
    ...change(edit(CLI, ['cart_path(args.file, os.environ if environ is None else environ)', 'cart_path(args.file, environ or os.environ)'])),
    // An empty mapping is falsy: every test passing environ={} reads the real environment, so a set CART_FILE sends the tests' writes to the person's cart.
    defects: [{ id: 'empty-environ-reads-real-env', file: 'src/cart/cli.py', re: /falsy|empty (dict|mapping|environ)|environ=\{\}|`?environ or|\bor os\.environ|is None/i }],
  },
  {
    ...base, id: 'cli-empty-file-arg', probe: "print(main(['--file', '', 'add', 'a', 'A', '1'], environ={'CART_FILE': str(T / 'env.json')}), (T / 'env.json').exists())", notes: 'cart_path picks --file, then CART_FILE, then the home file.',
    ...change(edit(CLI, ['    if file is not None:\n        return Path(file)\n    if "CART_FILE" in environ:', '    if file:\n        return Path(file)\n    if environ.get("CART_FILE"):'])),
    // --file "" (or CART_FILE="") is silently ignored and the next source wins: the person named a file and the command writes another one.
    defects: [{ id: 'empty-file-ignored', file: 'src/cart/cli.py', re: /empty|""|''|falsy|blank|truthy/i }],
  },
  {
    ...base, id: 'cli-strips-input', probe: "f = T / 'c.json'; main(['--file', str(f), 'add', ' a ', 'A', '1'], environ={}); print(repr(json.loads(f.read_text())['items'][0]['sku']))", notes: 'The CLI trims stray spaces people type around the sku and name before calling the cart.',
    ...change(edit(CLI, ['            cart.add(args.sku, args.name, parse_quantity(args.quantity))\n            line = f"Added {args.sku}"', '            sku, name = args.sku.strip(), args.name.strip()\n            cart.add(sku, name, parse_quantity(args.quantity))\n            line = f"Added {sku}"'])),
    // Trimming is a cart rule in cli.py (B10, NFR-2), and the cart stores sku and name untrimmed (AC-1.4): the CLI and the cart now disagree.
    defects: [{ id: 'cli-trims-sku-and-name', file: 'src/cart/cli.py', re: /strip|trim/i }],
  },
  {
    ...base, id: 'cli-catch-all', probe: "Cart.add = lambda *a: 1 / 0\ntry: print(main(['--file', str(T / 'c.json'), 'add', 'a', 'A', '1'], environ={}))\nexcept ZeroDivisionError: print('raised')", notes: 'Added a last-resort handler so a person never sees a Python traceback.',
    ...change(edit(CLI, ['        return EXIT_REFUSED\n', '        return EXIT_REFUSED\n    except Exception as error:  # never show a person a traceback\n        print(f"cart: {error}", file=sys.stderr)\n        return EXIT_STORAGE\n'])),
    // Any programming error now exits 2 as if the file were unreadable, with no traceback: bugs look like storage failures.
    defects: [{ id: 'catch-all-hides-bugs', file: 'src/cart/cli.py', re: /Exception|catch-all|catch all|broad|swallow|bare|programming error|traceback/i }],
  },
  {
    ...base, id: 'cli-command-optional', probe: "try: main([], environ={})\nexcept SystemExit as e: print('exit', e.code)\nexcept AttributeError: print('crash')", notes: 'Subcommands are add and remove, dispatched on args.command.',
    ...change(edit(CLI, ['add_subparsers(dest="command", required=True, metavar="COMMAND")', 'add_subparsers(dest="command", metavar="COMMAND")'])),
    // `cart` with no command parses; args.command is None, the else branch calls cart.remove(args.sku) and crashes with AttributeError (not argparse's exit 2).
    defects: [{ id: 'no-command-crashes', file: 'src/cart/cli.py', re: /required|no (sub)?command|without a (sub)?command|missing (sub)?command|bare `?cart|AttributeError|args\.sku|None/i }],
  },
]
