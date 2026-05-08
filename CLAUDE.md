# Katazome — Developer Notes

## Key Design Decisions

- **`undefined` over `null`**: use `undefined` to represent the absence of a value. `null` is only acceptable where the bun's API or the third-party libraries explicitly require it. Values received as `null` from external sources should be converted with `?? undefined` before use in internal code.
