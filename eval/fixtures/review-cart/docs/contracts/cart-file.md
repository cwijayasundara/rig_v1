# Contract: the cart file (DR-5)

A public contract (PRD sprint 1, DR-5): tests and other tools may read the file. Changing it needs a person's approval first.

## Shape

One JSON object with a single key `"items"`, whose value is a list of item objects:

```json
{"items": [{"sku": "coffee", "name": "Coffee beans", "quantity": 2}]}
```

Each item has:

| Field | Type | Rule |
|---|---|---|
| `sku` | string | unique within the cart, compared exactly and case-sensitively (DR-2); stored as given, never trimmed |
| `name` | string | stored as given, never trimmed |
| `quantity` | integer | at least 1; never a boolean (DR-3) |

## Rules a loader enforces

- Items are kept in the order they were first added (DR-4).
- A missing file is an empty cart (AC-4.1).
- A file that is not valid JSON, or is valid JSON of any other shape (top level not an object, no `"items"` key, `"items"` not a list, an item that is not an object, a missing field, a field of the wrong type, `quantity` below 1 or a boolean, or a duplicate `sku`), is refused with `StorageError` naming the file. The file is left byte-for-byte unchanged (AC-4.4, AC-4.5).
- An unknown extra field on an item is ignored on load and dropped on the next save.

## Writing

A writer saves the whole file atomically: it writes a temp file in the same directory, then renames it over the target, so a failed write never leaves a half-written file (NFR-1). Example: `cart-file.example.json`.
