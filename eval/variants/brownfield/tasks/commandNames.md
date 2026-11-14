Command.commandNames(): every command name in a program

Shell-completion generators need the names of all commands. Add `Command.commandNames()`, which returns an array with the name and the aliases of every subcommand at any depth, sorted ascending, with each name once even when it is used in several places in the tree. Large generated programs have to work: with 30 000 subcommands, each with an alias, it has to return in under 400 ms.

```js
program.command('remove').alias('rm');
program.command('remote').command('add');
program.command('add');
```

`program.commandNames()` gives `['add', 'remote', 'remove', 'rm']`.
