---
name: engineering-standards
description: How substantial engineering work gets done in this repo — scoping, sequencing, verification discipline, and the quality bar to hold it all to. Use when planning a multi-step feature/refactor, breaking work into epics or issues, executing a mechanical extraction or restructuring, or reviewing whether work is actually done well rather than just done.
---

# Engineering standards

The process rules are in [workflow](../../../docs/workflow.md) and
[working with Claude](../../../docs/working-with-claude.md); the code rules
are in [coding standards](../../../docs/coding-standards.md). This is the
judgement underneath them.

## North star

Write code an experienced engineer would be proud of, not just code that
passes review. Apply SOLID, KISS, DRY, YAGNI, Tell-Don't-Ask, high cohesion
and low coupling while building, not only when reviewing. When a task's
honest scope is bigger than the cheapest thing to ship, say so and let the
owner choose. Never silently narrow "modularise the codebase" to "extract
the easy-to-test parts".

## Scoping multi-step work

- Decompose along genuine single-responsibility boundaries, not along
  whatever the file's section comments say. Read the section, then decide
  whether it is one concern.
- Sequence dependencies explicitly: what lands first (a foundational module,
  test infrastructure), what can go in any order.

## Delivering multi-step work

- For a sequential epic, wait for merge confirmation before starting the
  next piece, unless told otherwise. Don't take silence as approval.
- Match the risk approach to the blast radius: a function with many callers
  gets a thin wrapper with the original signature when it moves; one with a
  single caller can take a cleaner signature directly.

## Verification discipline

- Check the effect of a change (a computed style, a DOM count, a real
  response), not just that a function didn't throw.
- Re-verify after a clean rebuild for anything involving build output; a
  pass against stale artefacts proves nothing.

## Reports of state

- When a person says something is done (for example "merged"), trust it and
  move on. State you notice yourself is different: say what you found.
