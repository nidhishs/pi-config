---
name: planning
description: Create an implementation plan from a clear request, design, or spec. Use before coding multi-step changes, refactors, migrations, features, or behavior changes.
---

# Planning

Create a concrete implementation plan before making changes.

Do not implement unless the user explicitly asks.

## Process

1. Understand the request, design, or spec.
2. Inspect relevant files, tests, docs, and existing patterns.
3. Identify scope, constraints, risks, and open questions.
4. If the environment supports subagents or parallel workers, use them when helpful for independent exploration/research, execution or review.
5. Produce a plan proportional to the task.

Ask clarifying questions when a missing decision would materially change the plan. Otherwise, make a reasonable assumption and state it.

When you ask, do not leave it open-ended. Present the decision as a small set of options:
- List 2-3 concrete options.
- Give each a 1-2 line pro/con.
- Recommend one and say why.

Ask one decision at a time, and only for decisions that actually change the plan.

## Scope Check

Before planning, check whether the request spans multiple independent subsystems. If it does, recommend splitting it into separate plans, one per subsystem, each producing working, testable software on its own. Do not cram unrelated subsystems into a single plan.

Apply YAGNI: plan only what the request needs. Cut speculative features and scope.

## Plan Depth

Write plans for a competent implementer who is unfamiliar with this codebase and the reasoning behind the plan.

Include the context they need to avoid rediscovering decisions:
- which files matter,
- why those files matter,
- existing patterns to follow,
- relevant tests or commands,
- important constraints,
- sequencing dependencies between tasks.

Do not over-explain obvious language or framework basics.

## File Map and Design Boundaries

Before defining tasks, map out the files that will be created or modified and what each one is responsible for. Use this to lock in decomposition decisions before sequencing work.

Design principles:
- Prefer focused files with clear responsibilities.
- Define boundaries and interfaces between units.
- Keep files that change together near each other when possible.
- Split by responsibility, not by arbitrary technical layer.
- Follow existing codebase patterns.
- Do not introduce unrelated restructuring.

## Task Right-Sizing

A task should be the smallest coherent change that:
- has its own validation,
- is worth reviewing independently,
- produces a useful intermediate state,
- does not leave the system knowingly broken.

Fold setup, scaffolding, config, and docs into the task that first needs them. Split tasks only where a reviewer could reasonably accept one task and reject another. Each task should produce an independently verifiable increment.

## Plan Format

Use this structure:

```md
# [Feature / Change] Plan

## Goal

[What we are trying to accomplish.]

## Context / Findings

[Relevant facts from the codebase, docs, or discussion, plus any project-wide constraints.]

## Scope

In scope:
- ...

Out of scope:
- ...

## Approach

[Short explanation of the implementation strategy.]

## File Changes

- `path/to/file`: create/modify; purpose
- `path/to/test`: create/modify; purpose

## Tasks

### Task 1: [Name]

**Purpose:** [What this task accomplishes.]

**Changes:**
- `path/to/file`: [specific change]

**Validation:**
- `command or manual check`
- Expected result: [observable acceptance condition]

### Task 2: [Name]

...

## Final Validation

- `command`
- Expected result: [what should happen]

## Risks / Open Questions

- [Only real risks or unresolved decisions.]
```

## Standards

- Use exact file paths when working in a codebase.
- Keep tasks small enough to verify independently.
- Include validation for every meaningful behavior change.
- Avoid vague placeholders like `TODO`, `TBD`, "handle edge cases", or "add tests."
- Do not include full implementation code unless it clarifies an interface or tricky change.
- Keep the plan proportional to the task.
- If the plan is short, respond in chat. If it is substantial or will be executed later, save it to `.pi/plans/YYYY-MM-DD-<topic>.md` or the project's existing plan location.

## Self-Review

Before finalizing, review the plan as if someone else must implement it.

Check:

1. **Completeness:** No missing tasks, placeholders, or vague handwaves.
2. **Alignment:** The plan covers the user's request or spec without major scope creep.
3. **Task clarity:** Each task has a clear purpose, concrete file changes, and validation with an observable expected result.
4. **Interface consistency:** Names, signatures, and types introduced in earlier tasks match how later tasks use them.
5. **Buildability:** A competent implementer could follow the plan without rediscovering the whole codebase.
6. **Risk:** Any unresolved question that would materially change implementation is called out.

Only fix issues that would cause real implementation problems. Do not over-polish.
