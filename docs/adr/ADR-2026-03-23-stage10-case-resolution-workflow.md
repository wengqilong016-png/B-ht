# ADR: Stage 10 — support case resolution workflow

## Status
Accepted

## Context
Stage 9 established support case creation, lightweight case linking, and an operator-visible audit trail. Operators can now group exports, health-alert links, and replay actions under a case and see core history.

The next highest-value step is not more background infrastructure. It is to make support cases easier to work through to completion: capture operator notes, surface linked activity more clearly, and make resolution outcomes explicit and reviewable.

## Decision
Open a clean stage 10 focused on support case resolution workflow only.

## Included
- support case detail view or focused workflow panel
- operator notes / resolution summary on a case
- explicit resolution metadata (who resolved, when, short outcome)
- improved case history visibility from within the case workflow
- minimal UI needed to review and complete a case cleanly
- focused tests and documentation updates for the stage 10 scope

## Excluded
- automatic remediation
- bulk remediation tooling
- queue engine replacement
- settlement redesign
- approval redesign
- broad architecture cleanup
- unrelated observability expansion
- major workflow changes outside support-case completion
