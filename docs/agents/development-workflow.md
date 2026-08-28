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

`/implement` owns the implementation/test/review loop. A blocking Standards or Spec finding from `/code-review` must be corrected on the same branch and reviewed again before delivery.

Judgement-call smells alone do not require speculative refactoring.

## Pull request

After implementation and review pass:

* Push the dedicated branch.
* Open a Pull Request targeting `master`.
* When the work originated from `/implement #<issue-number>`, include `Closes #<issue-number>` in the Pull Request body.
* Keep the Issue as the authoritative work item; the Pull Request is the delivery and review artifact.
* Do not manually close the Issue before merge when the Pull Request is expected to complete it.
* Do not merge the Pull Request unless explicitly authorized by the user.

The Pull Request is not ready for human merge until required CI checks and deployment/preview checks associated with the change have completed successfully.

If a required check needs human-only access or judgement, surface that requirement instead of representing the work as fully verified.

## Parent specs

When `/to-tickets` has split a parent specification into implementation tickets:

* Each implementation Pull Request closes only its originating child ticket with `Closes #<ticket-number>`.
* Do not close the parent specification from a child Pull Request.
* The parent remains open while its implementation tickets are being completed.
* After the child tickets have reached their final states, the maintainer performs the parent-level acceptance check and closes the parent specification when its overall outcome is satisfied.

Completion of all child tickets is evidence for parent completion, not a substitute for the parent-level acceptance check.
