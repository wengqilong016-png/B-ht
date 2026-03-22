# ADR: Manual replay v5

## Status
Proposed

## Context
Stages 1 to 4 improved preview consistency, server-authoritative writes, offline replay safety, and queue diagnostics visibility.
The next gap is safe handling of dead-letter items after they are visible.

## Decision
Stage 5 focuses on safe manual replay tooling for dead-letter items.

## Included
- manual replay workflow
- replay guardrails
- focused tests

## Excluded
- settlement redesign
- approval redesign
- queue engine replacement
- bulk auto replay
