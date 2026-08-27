# Issue tracker

Issues are tracked in GitHub Issues for `zxjte9411/online-attendance-system`.
All `gh` commands must specify `--repo zxjte9411/online-attendance-system` (or
run from a checkout whose remote unambiguously identifies that repository).

Pull requests are not a request surface. Use issues for requests, work
tracking, triage, and agent handoff.

## Create

Create an issue with a clear title, a useful body, and the appropriate triage
label:

```sh
gh issue create --repo zxjte9411/online-attendance-system \
  --title "簡短、可搜尋的標題" \
  --body-file ticket.md \
  --label needs-triage
```

## Read and list

Read one ticket:

```sh
gh issue view NUMBER --repo zxjte9411/online-attendance-system
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

"Publish" means making a local ticket available as a GitHub Issue. Prepare
the ticket body in a file, then create it with `gh issue create` and capture
the returned issue URL and number. Apply `needs-triage` unless the ticket has
already been triaged.

### Fetch

"Fetch" means loading the authoritative GitHub Issue before doing work. Use
`gh issue view` for the description, current state, labels, and comments; do
not rely on a stale copied ticket. Fetch a machine-readable view when needed:

```sh
gh issue view NUMBER --repo zxjte9411/online-attendance-system \
  --json number,title,body,state,labels,comments,url
```
