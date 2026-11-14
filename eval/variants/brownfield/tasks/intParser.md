intParser(min, max): a ready-made integer parser for option values

Programs keep rewriting the same port-number parser. Export `intParser(min, max)`, which returns a function for the custom-processing argument of `.option()`. The function takes the value string and returns the integer. It throws `InvalidArgumentError('Not an integer from <min> to <max>.')` when the string is not a whole decimal number (an optional leading minus sign, then digits only) or lies outside min to max. It has to be available as `require('commander').intParser` and as `import { intParser } from 'commander'`.

```js
program.option('-p, --port <number>', 'port number', intParser(1, 65535));
```

`prog --port 8080` gives `port: 8080`; `prog --port 99999` fails with `error: option '-p, --port <number>' argument '99999' is invalid. Not an integer from 1 to 65535.`
