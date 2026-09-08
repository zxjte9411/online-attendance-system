# Review response contract

When a reviewer leaves actionable feedback on a Pull Request and the implementation is changed in response, the implementing agent must return evidence to the reviewer instead of replying only with a generic acknowledgement.

The response exists to make re-review cheap: the reviewer should be able to tell what changed, what was actually verified, which commit contains the change, and what specific behavior or risk still needs to be checked.

## Format source

Use `.github/review_response_template.md` as the single source of truth for review-reply formatting.

- Use its **Standard** form for review summaries or findings that need explanation.
- Use its **Compact inline** form only when the original inline thread already provides enough context.
- Do not redefine or duplicate the response format in workflow documents. Workflow documents define behavior; the `.github` template defines presentation.

## Response location

- Reply on the original review thread/comment when GitHub supports it.
- When one top-level review comment contains multiple findings, post one follow-up comment with one section per finding, preserving the reviewer’s numbering or short titles.
- Do not replace thread-level responses with an unrelated new PR comment when the original thread can be replied to directly.

## Completion gate

Post the response only after the relevant change has been committed and pushed, and after the affected verification has been run as far as the current environment allows.

A review finding is not ready for re-review until the response gives the reviewer enough evidence to inspect the result without reconstructing the agent’s work from the diff alone.

## Status semantics

### Resolved

Use when the implementation now addresses the finding and all repository-level verification available for that change has passed.

### Partially resolved

Use when code has changed but part of the finding still depends on another ticket, external environment, unresolved design decision, unavailable verification, or a human-only check necessary to establish the finding as resolved. State the remaining gap explicitly.

### No change

Use when the implementation is intentionally unchanged after investigation. Explain the evidence and rationale, record any verification performed, and tell the reviewer what assumption or contract should be reconsidered. `No change` is an auditable outcome, not a substitute for ignoring a finding.

## Evidence rules

- `Verification` contains only checks that were actually run. A planned or unavailable check belongs under `Pending / external verification`.
- `Commit` points to the pushed commit that contains the response change. If several tightly related commits are required, list all relevant short SHAs.
- `Change` describes outcome and reasoning, not a file inventory.
- `Re-review focus` is mandatory. It tells the reviewer what evidence would make the finding acceptable on the next pass.
- If the reviewer’s suggestion was not followed exactly but the underlying issue was solved another way, say so directly and explain the chosen solution.

## Multiple findings

Keep each actionable finding independently auditable. Preserve the reviewer’s numbering or short title and give every finding its own status, change, verification, commit, and re-review focus using the `.github` template.

Do not collapse several findings into a single sentence such as `all comments addressed`.

## Review loop

After posting follow-up responses:

1. Read the submitted PR comments back and verify formatting, commit references, and that every actionable finding has a response.
2. Leave unresolved or externally blocked findings visibly marked `Partially resolved` rather than presenting the review as complete.
3. The reviewer re-checks the updated branch using the response evidence as the starting point.
4. If another blocking finding is raised, repeat this contract on the next adjustment round.
