# Security policy

## Supported versions

Flowdeck has not had a release yet. Security fixes go to the default branch and the active implementation branch.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

- Use GitHub's private reporting: the repository's **Security** tab → **Report a vulnerability** (GitHub Private Vulnerability Reporting). If that button is not available, ask the repository owner on GitHub to enable it, without describing the problem publicly.
- Include affected versions or commits, steps to reproduce, the impact, and any suggested fix.
- Do not test against instances you don't own, and don't access other people's data.

The owner will acknowledge reports as soon as practical. This is a small self-hosted project with no formal response-time commitment.

## Scope and design notes

The security design is summarized in [docs/ARCHITECTURE.md → Security measures](docs/ARCHITECTURE.md#security-measures):
- server-side permission checks with 404 for invisible boards;
- argon2id passwords;
- hashed session tokens with CSRF protection;
- rate-limited login;
- authenticated, sandboxed file downloads;
- no server-side fetching of links;
- Markdown rendered without raw HTML.

Operators are responsible for HTTPS (or a VPN) when Flowdeck is reachable beyond a trusted network, for keeping `.env` private, and for keeping backups. See [docs/OPERATIONS.md](docs/OPERATIONS.md).
