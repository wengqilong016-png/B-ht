# ADR: Background health alerts v8

## Status
Proposed

## Context
Stages 1 to 7 improved preview consistency, server-authoritative writes, offline replay safety, diagnostics visibility, manual replay tooling, fleet-wide diagnostics, and support/export workflow.
The next gap is proactive alerting when queue health degrades.

## Decision
Stage 8 focuses on background health alerts for stale device snapshots and unhealthy queue states.

## Included
- alert generation for stale snapshots and queue health thresholds
- low-risk admin alert visibility
- focused tests
- required Supabase-side scheduling / storage scaffolding if needed

## Excluded
- settlement redesign
- approval redesign
- queue engine replacement
- broad architecture cleanup
- automatic remediation
- bulk remediation tooling
