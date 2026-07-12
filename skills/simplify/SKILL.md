---
name: simplify
description: Implements and modifies code using the simplest clear, correct, and maintainable solution that meets the request. Use for coding tasks and design decisions; especially when the user asks for a simple, minimal approach.
disable-model-invocation: true
---

# Simplify

Implement the requested behavior with the smallest clear, correct, and maintainable change. Simplicity requires understanding the code; it does not mean compressed syntax or fewer lines at any cost.

## Understand Before Simplifying

Before editing:

1. Read the relevant files and local instructions.
2. Trace affected callers, inputs, outputs, error paths, and boundaries.
3. Check nearby and shared code for established patterns and reusable behavior.
4. Fix bugs at the narrowest shared root cause, not only at the reported symptom.

Do not conduct a repository-wide audit unless requested. Search beyond the immediate change only to understand the flow or verify reuse.

## Use Parallel Agents Deliberately

Use parallel agents only when independent investigation materially improves the solution or reduces elapsed time: inspect separate modules or call paths, find existing helpers, compare viable platform or dependency options, or validate a design or test approach. Give each agent a bounded, non-overlapping task; reconcile its evidence before deciding. The primary agent owns the final understanding, edits, and validation.

## Build the Simplest Clear Solution

Choose the first option that fully meets the request:

1. Do not add work without a present requirement.
2. Reuse existing project code and conventions.
3. Use the standard library.
4. Use native platform or framework features.
5. Use an already-installed dependency when it clearly fits.
6. Write the minimum clear custom code.

When two options are equally simple, pick the one that is correct on edge cases; simplicity is not a reason to choose the less robust option.

Prefer deletion when touched code is directly superseded and removal is safe. Do not add duplicate helpers, thin wrappers, one-implementation interfaces or factories, hypothetical configuration or extension points, or scaffolding for later. Keep an abstraction only when it provides a real public, domain, policy, validation, lifecycle, cross-cutting, or dependency-isolation boundary. Prefer explicit readable code over clever compression; do not shorten code when that harms clarity.

Simplify only the path involved in the request. Do not turn a scoped change into an unrelated refactor, migration, dependency replacement, or cleanup campaign. Make an incidental cleanup only when it is safe and materially reduces the requested change.

## Preserve Required Guarantees

Never simplify away explicit requirements, input validation at trust boundaries, security or privacy controls, data-loss protection, actionable error handling, accessibility, compatibility behavior, or legitimate project and public API boundaries.

For non-trivial changed logic, add or update the smallest verification that follows the repository's existing conventions. Do not add test infrastructure or elaborate fixtures unless the change requires them.

## Response

Make the change first. Then briefly state what changed, what complexity was avoided or removed, and any real condition that would justify a more elaborate design. Give a fuller explanation, review, or design discussion when requested.
