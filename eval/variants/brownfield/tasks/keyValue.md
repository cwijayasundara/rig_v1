Option.keyValue(): an option that collects name=value pairs

Programs such as build tools take `-D name=value` any number of times. Add `Option.keyValue()`: every use of the option gives a `name=value` string, and the option's value becomes an object holding all the pairs, with the value kept as a string. When a name is used twice, the later one wins. A string with no `=`, or with nothing before the `=`, is rejected as an invalid argument with the message `Expected key=value.`

```js
program.addOption(new Option('-D, --define <pair>').keyValue());
```

`prog -D greeting=hello --define mood=calm` gives `define: { greeting: 'hello', mood: 'calm' }`.
