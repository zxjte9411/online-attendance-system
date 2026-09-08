# Review response templates

Use the standard form for review summaries or findings that need explanation. Use the compact form only for a narrow inline thread whose context is already obvious.

## Standard

### Review follow-up — <finding title or identifier>

**Status:** Resolved | Partially resolved | No change

**Change:**
<Describe what changed and why it addresses the finding. Focus on behavior, architecture, or contract rather than listing files.>

**Verification:**
- <check actually run and result>
- <another check actually run and result>

**Commit:** `<short-sha>`

**Re-review focus:**
<Tell the reviewer exactly what behavior, edge case, contract, regression risk, or remaining concern should be checked now.>

**Pending / external verification:**
<Only include when something remains pending. State the concrete check.>

## Compact inline

已處理。

- **Change:** <what changed and why it addresses this comment>
- **Verification:** <actual check and result>
- **Commit:** `<short-sha>`
- **Re-review:** <the exact behavior / edge case the reviewer should verify>
- **Pending:** <only when applicable>
