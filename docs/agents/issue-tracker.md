# Issue tracker

Issues are tracked in GitHub Issues for `zxjte9411/online-attendance-system`.
All `gh` commands must specify `--repo zxjte9411/online-attendance-system` (or
run from a checkout whose remote unambiguously identifies that repository).

Pull requests are not a request surface. Use issues for requests, work
tracking, triage, and agent handoff.

## Native relationship contract

GitHub native parent/sub-issue and blocking dependency relationships are the
canonical representation for ticket graphs in this repository.

A `## Parent` or `## Blocked by` section in an Issue body is useful
human-readable documentation, but it does **not** replace the corresponding
GitHub native relationship. When GitHub supports the relationship, never
silently fall back to Markdown-only references.

Before publishing or repairing a ticket graph, confirm the installed GitHub
CLI exposes the required relationship flags:

```sh
gh issue create --help
gh issue edit --help
gh issue view --help
```

The workflow expects support for `--parent`, `--blocked-by`,
`--add-blocked-by`, `--add-blocking`, `--add-sub-issue`, plus the `parent`,
`subIssues`, `blockedBy`, and `blocking` JSON fields. If those capabilities are
missing, upgrade `gh` or report the relationship publication step as
incomplete instead of pretending the Markdown references are sufficient.

## Create

Create an issue with a clear title, a useful body, and the appropriate triage
label:

```sh
gh issue create --repo zxjte9411/online-attendance-system \
  --title "簡短、可搜尋的標題" \
  --body-file ticket.md \
  --label needs-triage
```

When the parent and blockers are already known, create the native
relationships in the same operation:

```sh
gh issue create --repo zxjte9411/online-attendance-system \
  --title "簡短、可搜尋的標題" \
  --body-file ticket.md \
  --label ready-for-agent \
  --parent 16 \
  --blocked-by 18
```

Multiple blockers can be supplied as a comma-separated list, for example
`--blocked-by 19,20,21`.

## Parent and sub-issue relationships

When a specification is split into child implementation tickets, represent the
hierarchy with GitHub's native parent/sub-issue relationship.

Set an existing child's parent:

```sh
gh issue edit CHILD --repo zxjte9411/online-attendance-system \
  --parent PARENT
```

Or add children from the parent side:

```sh
gh issue edit PARENT --repo zxjte9411/online-attendance-system \
  --add-sub-issue CHILD
```

The `## Parent` body section remains part of the ticket template for readability
but is not the authoritative hierarchy.

## Blocking dependencies

Blocking edges must use GitHub's native Issue Dependencies.

Add a blocker to an existing ticket:

```sh
gh issue edit ISSUE --repo zxjte9411/online-attendance-system \
  --add-blocked-by BLOCKER
```

Multiple blockers may be added together:

```sh
gh issue edit ISSUE --repo zxjte9411/online-attendance-system \
  --add-blocked-by 19,20,21
```

The inverse form is also valid when operating from the blocker:

```sh
gh issue edit BLOCKER --repo zxjte9411/online-attendance-system \
  --add-blocking ISSUE
```

A ticket belongs to the implementation frontier only when every native blocker
is closed. The `## Blocked by` section remains useful documentation, but it is
not the live gate.

## Relationship verification

Publishing the Issue body is not enough. After creating or repairing tickets,
read the native graph back from GitHub:

```sh
gh issue view ISSUE --repo zxjte9411/online-attendance-system \
  --json number,parent,subIssues,blockedBy,blocking
```

For `/to-tickets`, compare the returned graph against the approved ticket
breakdown before reporting publication complete. A child ticket is fully
published only when:

- the GitHub Issue exists with the expected triage label;
- its native `parent` matches the parent specification when one exists;
- its native `blockedBy` set contains every genuine blocker and no invented
  blocker;
- its body retains the human-readable Parent / Blocked by sections used by the
  ticket template.

Missing native edges are an incomplete publish even if the body contains
working `#number` links.

## Read and list

Read one ticket:

```sh
gh issue view NUMBER --repo zxjte9411/online-attendance-system
```

For implementation or ticket-graph work, fetch relationships too:

```sh
gh issue view NUMBER --repo zxjte9411/online-attendance-system \
  --json number,title,body,state,labels,comments,url,parent,subIssues,blockedBy,blocking
```

List tickets, optionally filtered by state or label:

```sh
gh issue list --repo zxjte9411/online-attendance-system --state open
gh issue list --repo zxjte9411/online-attendance-system --label ready-for-agent
```

## Comment

Record investigation notes, decisions, and handoff details on the issue:

```sh
gh issue comment NUMBER --repo zxjte9411/online-attendance-system \
  --body "調查結果與下一步"
```

## Labels

List available labels and update a ticket with the canonical triage labels:

```sh
gh label list --repo zxjte9411/online-attendance-system
gh issue edit NUMBER --repo zxjte9411/online-attendance-system \
  --add-label ready-for-agent --remove-label needs-triage
```

Use the mappings in `docs/agents/triage-labels.md`. Keep labels current and
avoid adding project-specific triage labels without agreement.

## Close

Close a resolved or intentionally declined ticket, leaving a final comment
when useful:

```sh
gh issue close NUMBER --repo zxjte9411/online-attendance-system
```

## Publish and fetch tickets

### Publish

"Publish" means making a local ticket available as a GitHub Issue **and**
publishing its native graph relationships.

Create tickets in dependency order so parent and blocker Issue numbers already
exist when a dependent ticket is created. Use `--parent` and `--blocked-by`
during creation when possible; when a relationship can only be known after
creation, add it immediately with `gh issue edit`.

Apply `needs-triage` unless the ticket has already been triaged. `/to-tickets`
may publish approved agent-ready tickets directly with `ready-for-agent`.

After all tickets are created, perform the relationship read-back described in
**Relationship verification**. Do not report the graph as published until its
native parent and dependency edges match the approved breakdown.

### Fetch

"Fetch" means loading the authoritative GitHub Issue before doing work. Use
`gh issue view` for the description, current state, labels, comments, and
relationships; do not rely on a stale copied ticket or infer blocking state
from Markdown alone.
