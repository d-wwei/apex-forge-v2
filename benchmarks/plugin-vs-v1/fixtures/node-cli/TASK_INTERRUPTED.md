# Interrupted Benchmark Task

Add and export `subtract(left, right)` in `src/math.mjs`.

Add automated tests covering positive, zero-result, and negative-result cases.

Acceptance command:

```bash
npm test
```

The benchmark controller will forcibly terminate the first Agent process after
planning begins. A fresh Agent process must resume from the remaining state.
