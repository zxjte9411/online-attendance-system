# Development workflow

This repository uses GitHub Issues as the authoritative work surface and pull requests as the delivery and review surface.

## Implementation branch

Implementation work originating from an Issue must run on a dedicated branch rather than directly on `master`.

Before modifying code:

* Fetch the authoritative Issue, including its current body and comments.
* Inspect the current repository state rather than assuming the Issue describes unimplemented work.
* Start from the current `master` baseline.
* Create a dedicated branch that identifies the originating Issue.
* If already on a dedicated branch for that Issue, continue there instead of creating another branch.

Use the originating `master` baseline as the fixed point for `/code-review`.

Use `/git-master` for Git operations.

## Scope

The originating Issue defines the implementation scope.

Future notes, next-slice constraints, and explicitly out-of-scope material provide context but do not become implementation requirements.

Preserve existing behavior that already satisfies the Issue. Prefer extending existing seams over introducing speculative abstractions or unrelated refactors.

## Verification and review

Use the repository-defined verification seam during implementation.

Commits on the implementation branch are review candidates, not evidence that the work is complete. `/implement` owns the implementation/test/review loop.

After the implementation passes repository verification:

1. Commit the reviewable implementation to the dedicated branch.
2. Run `/code-review` against the originating `master` fixed point.
3. If `/code-review` reports a blocking Standards or Spec finding, correct it on the same branch, verify the correction, commit it, and run `/code-review` again.
4. Continue until no blocking Standards or Spec findings remain.

Judgement-call smells alone do not require speculative refactoring.

Review completion is a delivery gate, not the end of the implementation workflow.

## Pull request delivery

After `/code-review` passes, continue directly to delivery:

* Push the dedicated implementation branch to the remote.
* Open a Pull Request targeting `master`.
* Keep the Issue as the authoritative work item; the Pull Request is the delivery and review artifact.
* Leave the Pull Request unmerged for the maintainer unless the user explicitly authorizes the merge.

### Pull Request body

Use `.github/pull_request_template.md` as the structure for every implementation Pull Request.

Fill it from the actual reviewed diff and verification results:

* **Summary** contains 2–4 meaningful bullets describing the delivered outcome or user-observable behavior. It complements the Issue instead of repeating it.
* **Changes** records the important implementation, behavioral, architectural, or contract changes that a reviewer needs to understand. It describes changes rather than listing files.
* **Verification** lists only checks that were actually run and passed, including the repository verification seam, relevant focused/manual checks, and `/code-review` when applicable.
* **Review notes** records UI/Preview details, migrations, risks, compatibility concerns, manual verification points, or other reviewer context when relevant. Remove this optional section when there is genuinely nothing to add.
* **Related issue** uses `Closes #<issue-number>` for the originating implementation ticket when the work came from `/implement #<issue-number>`.

Every applicable section must contain meaningful content. A Pull Request with only an Issue reference, placeholder content, empty required sections, or a token summary does not satisfy delivery.

When creating or editing a Pull Request from a shell, prepare the body as a Markdown file and pass that file to the GitHub CLI instead of embedding a multiline body directly in a shell argument. This keeps headings, lists, code spans, and line breaks intact.

After creating or updating the Pull Request, read it back and verify all of the following before reporting completion:

* the base branch is `master`;
* the title describes the delivered change;
* Summary, Changes, and Verification render as complete sections with meaningful content;
* optional Review notes are either meaningful or removed;
* `Closes #<issue-number>` points to the originating implementation ticket;
* no template comments, placeholders, broken Markdown, or malformed line breaks remain in the submitted body.

An `/implement #<issue-number>` run is not complete merely because implementation, verification, commits, or `/code-review` have completed.

Completion criterion: the reviewed branch has been pushed and a Pull Request targeting `master` exists, follows the repository template, renders cleanly, and correctly links the originating Issue.

If branch push or Pull Request creation cannot be performed because of credentials, permissions, or another external blocker, report that blocker explicitly as the incomplete delivery step.

The Pull Request is not ready for human merge until required CI checks and deployment/preview checks associated with the change have completed successfully.

If a required check needs human-only access or judgement, surface that requirement instead of representing the work as fully verified.

## Parent specs

When `/to-tickets` has split a parent specification into implementation tickets:

* Each implementation Pull Request closes only its originating child ticket with `Closes #<ticket-number>`.
* Do not close the parent specification from a child Pull Request.
* The parent remains open while its implementation tickets are being completed.
* After the child tickets have reached their final states, the maintainer performs the parent-level acceptance check and closes the parent specification when its overall outcome is satisfied.

Completion of all child tickets is evidence for parent completion, not a substitute for the parent-level acceptance check.
