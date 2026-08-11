# Security Policy

## Scope and status

This repository is a **portfolio engineering project** running exclusively on **simulated money**.
There are no real funds, no payment processing and no production deployment handling real value.
It is not an authorised gambling operator. That said, security reports are taken seriously,
because the project's purpose is to demonstrate that this kind of system can be built correctly.

Supported: the `main` branch only. Older tags receive no fixes.

## Reporting a vulnerability

Please report privately — do **not** open a public issue.

1. Preferred: GitHub **Private vulnerability reporting** (Security → Report a vulnerability).
2. Alternative: contact the repository owner via the address on their GitHub profile.

Please include: affected component and version/commit, a description of the issue, reproduction
steps or a proof of concept, the impact you believe it has, and any suggested remediation.

**Do not** include third-party data, real personal data, or credentials in a report.

### What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement | within 3 business days |
| Initial assessment and severity | within 7 business days |
| Fix for Critical/High | prioritised over all other work |
| Public disclosure | coordinated with the reporter, after a fix is available |

Credit is given in the release notes unless anonymity is requested. There is no bug bounty.

## Areas of particular interest

- Financial correctness: any path that could create, destroy, duplicate or misallocate funds;
  double settlement; payout above matched exposure; bypassing the ledger.
- Concurrency: races in matching, wallet reservation or settlement.
- Authorization: cross-user data access, admin-only operations reachable without a policy check,
  privilege escalation, bypassing the 4-eyes control on results.
- Authentication and sessions: fixation, non-revocation, step-up bypass.
- Input handling: injection, mass assignment, SSRF, unsafe deserialisation.
- Information disclosure: stack traces, SQL, PII or secrets in responses or logs.

## Testing rules

Testing is welcome **against your own local deployment**. Do not test against any hosted demo
without written permission. Never use denial-of-service, spam, social engineering or physical
attacks. Never access, modify or exfiltrate another person's data — if you encounter data that is
not yours, stop and report it.

## Out of scope

Findings that only apply to a hypothetical real-money deployment (which does not exist and is
blocked by the Production Readiness Gate), missing hardening that is already documented as
`POST-MVP`, best-practice suggestions with no demonstrated impact, results from automated scanners
without a working proof of concept, and issues in third-party services.

## Secrets

If you believe a credential has been committed to this repository, report it privately and
immediately; it will be treated as an incident, rotated, and recorded in the project audit log.
No real credential is expected to exist here — `.env.example` contains placeholders only.
