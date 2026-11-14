# CLI conventions for bin/shop.mjs

- The first argument is the command; `node bin/shop.mjs help` lists them. Output goes to stdout, errors to stderr.
- Every flag accepts both `--flag value` and `--flag=value`.
- A flag the command does not know exits 2 with `unknown flag: --x` on stderr (`x` is the flag's name, without a value). A bad value for a known flag also exits 2, with a one-line reason on stderr.
- Orders come from `data/orders.json`, loaded with `loadOrders` from `src/orders/orders.js`.
