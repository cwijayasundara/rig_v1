Bulk upserts with no rows: resolve to an empty array instead of rejecting

Our sync jobs build an upsert from `insert(rows)`, the conflict clause on a key column, and then `.ignore()` or `.merge()`, with whatever rows they were handed, and some runs have none. Today that rejects with "The query is empty", so every job needs a guard around the call. When the conflict clause is used and there are no rows to write, the call should resolve to `[]` and run no query, on every database client.
