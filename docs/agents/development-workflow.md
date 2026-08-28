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
* When the work originated from `/implement #<issue-number>`, include `Closes #<issue-number>` in the Pull Request body.
* Keep the Issue as the authoritative work item; the Pull Request is the delivery and review artifact.
* Leave the Pull Request unmerged for the maintainer unless the user explicitly authorizes the merge.

An `/implement #<issue-number>` run is not complete merely because implementation, verification, commits, or `/code-review` have completed.

Completion criterion: the reviewed branch has been pushed and a Pull Request targeting `master` exists with the originating Issue correctly linked.

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
