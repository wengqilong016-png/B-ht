# ADR: Support export v7

## Status
Proposed

## Context
Stages 1 to 6 improved preview consistency, server-authoritative writes, offline replay safety, local diagnostics, manual replay tooling, and fleet-wide diagnostics.
The next gap is turning diagnostics into a support-friendly export workflow.

## Decision
Stage 7 focuses on support/export workflow for diagnostics data.

## Included
- diagnostics export workflow
- support-friendly summary payloads
- filtering/export by driver/device/error state
- focused tests

## Excluded
- settlement redesign
- approval redesign
- queue engine replacement
- broad architecture cleanup
- bulk remediation tooling
