# Domain

This repository uses a single-context layout. Agents consume the repository's
context directly rather than introducing additional context boundaries.

## Canonical authority

- The root `CONTEXT.md` and **Issue #48** represent the canonical domain vocabulary, lifecycle specification, and current product contract for this repository.
- Historical documents under `docs/` (including `docs/online-attendance-system-PRD*.md`) are preserved for context and history but have been superseded. They must not be treated as the current implementation truth or sole specifications. When any conflict arises, `CONTEXT.md` and Issue #48 prevail.

## Consumer rules

- Before starting work, read the root `CONTEXT.md` and the relevant documents
  under `docs/adr/`.
- If `CONTEXT.md` or the relevant ADR directory/files do not exist, continue
  silently. Do not create placeholder context or ADR files just to satisfy
  this rule.
- Use the terminology defined by the repository glossary consistently in
  code, issue comments, and documentation.
- If the requested work conflicts with an applicable ADR, state the conflict
  explicitly before proceeding and explain it in the implementation record.

