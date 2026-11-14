Query builder: whereNotLike and whereNotILike

`whereLike` and `whereILike` match a column against a pattern, but there is no way to ask for the rows that do not match. Add `whereNotLike(column, pattern)`, `orWhereNotLike`, `whereNotILike` and `orWhereNotILike` to the query builder. Each one is the negation of the method it mirrors, so `whereNotLike` excludes exactly what `whereLike` would return and `whereNotILike` excludes exactly what `whereILike` would return, on every database client knex supports (a client that already treats case or collation specially for `whereLike` and `whereILike` keeps doing so). They accept the same arguments, a plain or table-qualified column and a pattern, and the `or` forms join with `or` as the other `orWhere*` methods do. The new methods must also be usable from TypeScript on a typed query builder.

```js
knex('users').where('active', true).whereNotLike('name', 'luk%')
knex('users').whereLike('name', 'a%').orWhereNotILike('email', '%@example.com')
```
