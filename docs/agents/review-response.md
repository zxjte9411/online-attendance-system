# Review response contract

When a reviewer leaves actionable feedback on a Pull Request and the implementation is changed in response, the implementing agent must return evidence to the reviewer instead of replying only with a generic acknowledgement.

The response exists to make re-review cheap: the reviewer should be able to tell what changed, what was actually verified, which commit contains the change, and what specific behavior or risk still needs to be checked.

## Response location

- Reply on the original review thread/comment when GitHub supports it.
- When one top-level review comment contains multiple findings, post one follow-up comment with one section per finding, preserving the reviewer’s numbering or short titles.
- Do not replace thread-level responses with an unrelated new PR comment when the original thread can be replied to directly.

## Completion gate

Post the response only after the relevant change has been committed and pushed, and after the affected verification has been run as far as the current environment allows.

A review finding is not ready for re-review until the response gives the reviewer enough evidence to inspect the result without reconstructing the agent’s work from the diff alone.

## Canonical response template

Use this shape for every actionable finding:

```md
### Review follow-up — <finding title or identifier>

**Status:** Resolved | Partially resolved | No change

**Change:**
<Describe the behavioral / architectural / contract change that addresses the finding. Explain the important decision; do not merely list files.>

**Verification:**
- <check actually run and result>
- <another check actually run and result>

**Commit:** `<short-sha>`

**Re-review focus:**
<Tell the reviewer exactly what should be checked now: the behavior, contract, edge case, regression risk, or remaining concern that matters.>

**Pending / external verification:**
<Only include when something still requires browser/device/manual verification, deployment/preview confirmation, remote infrastructure, or another human-only check. State the concrete pending check.>
```

Omit `Pending / external verification` when there is genuinely nothing pending.

## Inline-thread compact form

For a narrow inline comment where the context is already obvious, the same contract may be compressed to:

```md
已處理。

- **Change:** <what changed and why it addresses this comment>
- **Verification:** <actual check and result>
- **Commit:** `<short-sha>`
- **Re-review:** <the exact behavior / edge case the reviewer should verify>
- **Pending:** <only when applicable>
```

The compact form must still contain `Change`, `Verification`, `Commit`, and `Re-review`.

## Status semantics

### Resolved

Use when the implementation now addresses the finding and all repository-level verification available for that change has passed.

### Partially resolved

Use when code has changed but part of the finding still depends on another ticket, external environment, unresolved design decision, unavailable verification, or a human-only check necessary to establish the finding as resolved. State the remaining gap explicitly.

### No change

Use when the implementation is intentionally unchanged after investigation. Explain the evidence and rationale under `Change`, record any verification performed, and tell the reviewer what assumption or contract should be reconsidered. Do not use `No change` as a substitute for ignoring a finding.

## Evidence rules

- `Verification` contains only checks that were actually run. A planned or unavailable check belongs under `Pending / external verification`.
- `Commit` points to the pushed commit that contains the response change. If several tightly related commits are required, list all relevant short SHAs.
- `Change` describes outcome and reasoning, not a file inventory.
- `Re-review focus` is mandatory. It tells the reviewer what evidence would make the finding acceptable on the next pass.
- If the reviewer’s suggestion was not followed exactly but the underlying issue was solved another way, say so directly and explain the chosen solution.

## Multiple findings

When replying to a review summary that contains several findings, keep each one independently auditable:

```md
## Review follow-up

### 1. <original finding title>
**Status:** Resolved
...

### 2. <original finding title>
**Status:** Partially resolved
...
```

Do not collapse several findings into a single sentence such as “all comments addressed”. Each actionable finding needs its own status and re-review focus.

## Review loop

After posting follow-up responses:

1. Read the submitted PR comments back and verify formatting, commit references, and that every actionable finding has a response.
2. Leave unresolved or externally blocked findings visibly marked `Partially resolved` rather than presenting the review as complete.
3. The reviewer re-checks the updated branch using the response evidence as the starting point.
4. If another blocking finding is raised, repeat this contract on the next adjustment round.
