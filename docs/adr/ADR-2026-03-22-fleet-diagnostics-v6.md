# ADR: Fleet diagnostics v6

## Status
Proposed

## Context
Stages 1 to 5 improved preview consistency, server-authoritative writes, offline replay safety, local diagnostics, and manual replay tooling.
The next gap is a true fleet-wide diagnostics surface for admins.

## Decision
Stage 6 focuses on aggregated diagnostics across drivers/devices rather than browser-local queue state.

## Included
- aggregated diagnostics data source
- admin fleet-wide queue health view
- summary counts and item listing across drivers/devices
- focused tests

## Excluded
- settlement redesign
- approval redesign
- queue engine replacement
- broad architecture cleanup
- automatic remediation workflows
