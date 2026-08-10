# Pi Roaming Memory

Pi extension design + early implementation for durable, cross-device memory backed by synchronized Obsidian Markdown.

## Status

- Architecture: **accepted** (`docs/DESIGN.md`, ADR 0001–0008)
- Phase 0 (contract + safety baseline): **in progress on Mac**
- Phase 1 (read-only package): **started (skeleton only)**
- Runtime writes / real `AI Memory/` vault: **not started**

## Documents

- [Domain language](./CONTEXT.md)
- [System design](./docs/DESIGN.md)
- [Architecture decisions](./docs/adr/)
- [Phase 0 baseline](./docs/phase-0/)
- [Fixtures](./fixtures/)
- [Example config](./config/config.example.json)

## Layout

```text
pi-roaming-memory/
├── CONTEXT.md
├── README.md
├── config/config.example.json
├── docs/
│   ├── DESIGN.md
│   ├── adr/
│   └── phase-0/
├── fixtures/
│   ├── synthetic-vault/
│   ├── invalid/
│   ├── casefold/
│   └── scripts/
└── src/                    # Phase 1+ package source
```

## Approved local layout (this Mac only)

Source checkout:

```text
/Users/intinyadev/Documents/kev/pi-roaming-memory
```

Canonical synchronized data:

```text
/Users/intinyadev/Documents/kev/si-ian/AI Memory
```

Paths document current device configuration. Implementation must not hardcode them; public examples use placeholders (`config/config.example.json`).

## Safety boundary

- Public source may hold design docs, code, schemas, and **synthetic** fixtures only.
- Never commit real memory notes, handoffs, Syncthing credentials, device identifiers, secrets, or live vault content.
- Do not create a real `AI Memory/` directory in the live vault until write-path tests pass and the operator explicitly requests it.
- Independent backup still missing → sole-source production cutover remains blocked (ADR 0007).

## Development (Phase 1+)

```bash
npm test
node fixtures/scripts/compute-integrity.mjs --write path/to/note.md
```
