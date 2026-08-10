# Case-fold collision fixtures

macOS default APFS volumes are case-insensitive, so two paths differing only by case cannot coexist in `synthetic-vault/`.

These sidecars hold the intended bytes. Phase 1 tests must:

1. Create a temporary directory.
2. Write both files using the exact target names below.
3. On case-insensitive FS, assert the second write collapses and the scanner marks a case-fold collision / invalid set.
4. On case-sensitive FS (Linux CI), assert both names exist and collision detection still flags the pair when normalized.

## Target names

```text
mem_eeee5555-eeee-4eee-8eee-eeeeeeeeeeee.md
Mem_EEEE5555-eeee-4eee-8eee-eeeeeeeeeeee.md
```

Source bodies:

- `lower.md`
- `upper.md`
