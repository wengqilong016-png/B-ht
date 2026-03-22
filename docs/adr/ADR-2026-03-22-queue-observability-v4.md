# ADR: Queue observability v4

## Status
Proposed

## Context
Stages 1 to 3 improved preview consistency, server-authoritative writes, and offline replay safety.
The next gap is operational visibility for queue state, replay failures, and dead-letter items.

## Decision
Stage 4 focuses on observability and diagnostics for queue health and dead-letter inspection.

## Included
- queue health summary
- dead-letter inspection UI
- retry metadata visibility
- focused diagnostics tests

## Excluded
- settlement redesign
- approval redesign
- queue engine replacement
- broad architecture cleanup

## Follow-up
Possible later work:
- safe manual replay tooling
- export/debug workflow
- health alerts
