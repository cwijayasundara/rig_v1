Option.requires(): an option that needs another option

Some options only make sense together, such as `--cert` and `--key`. Add `Option.requires(names)`, taking an option name or an array of names the way `conflicts()` does. When the option is used on the command line, each named option has to be used too, or the parse fails with an error.

```js
program
  .addOption(new Option('--cert <file>').requires('key'))
  .addOption(new Option('--key <file>'));
```

`prog --cert a.pem` fails with `error: option '--cert <file>' requires option '--key <file>'`; `prog --cert a.pem --key a.key` parses.
