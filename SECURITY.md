# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest `main` branch | ✅ |
| Older commits / tags | ❌ |

This project is deployed as a continuously-delivered web application. Only the latest version on the `main` branch receives security updates.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public GitHub issue.** Security reports must be kept confidential until a fix is available.
2. Email the maintainers at the address listed in the repository owner's GitHub profile, or use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) feature.
3. Include a clear description of the vulnerability, steps to reproduce, and potential impact.

### Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix or mitigation | Within 14 business days for critical/high severity |

### What to Expect

- You will receive an acknowledgement with a tracking reference.
- We will assess the severity using [CVSS v3.1](https://www.first.org/cvss/) and communicate the classification.
- If accepted, we will develop a fix and coordinate disclosure timing with you.
- If declined (e.g., not a vulnerability or already known), we will explain the reasoning.

## Security Practices

- **Secrets management**: All credentials (Supabase keys, API keys) are injected via environment variables. See [`docs/SECURITY_OPERATIONS.md`](./docs/SECURITY_OPERATIONS.md) for operational procedures including key rotation.
- **Row-Level Security (RLS)**: All Supabase tables are protected by RLS policies that enforce role-based access (admin / driver).
- **Authentication**: Supabase Auth with email/password. Admin-only operations are guarded by role checks both client-side and via Edge Functions.
- **Dependency updates**: Dependencies are reviewed and updated regularly. The CI pipeline runs on every push and PR.
