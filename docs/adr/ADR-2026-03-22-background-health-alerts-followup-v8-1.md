# ADR: Background health alerts follow-up v8.1

## Status
Proposed

## Context
Stage 8 introduced background health alerts, persisted alert records, and an admin alerts view.
A small follow-up is needed to tighten database safety, scheduling compatibility, and a few UI/testing inconsistencies without changing the feature scope.

## Decision
v8.1 focuses on hardening the health-alerts implementation only.

## Included
- SECURITY DEFINER safety hardening
- function execution permission tightening
- alert_type schema constraint alignment
- pg_cron compatibility / bootstrap refinements
- small UI and testability fixes

## Excluded
- new alert types
- support case linking / audit trail
- automatic remediation
- bulk remediation tooling
- broad architecture cleanup
