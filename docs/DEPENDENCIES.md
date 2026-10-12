# Third-party dependencies

Flowdeck’s own code has **no license chosen yet** (see README). The packages below keep their own licenses. Versions are pinned in `package.json` / `package-lock.json`. Regenerate with `node scripts/dependency-notices.mjs`.

## Runtime (installed in the production image)

| Package | Version | License | Purpose |
|---|---|---|---|
| @fastify/compress | 9.2.1 | MIT | Response compression |
| @fastify/cookie | 11.1.3 | MIT | Session cookies |
| @fastify/multipart | 10.1.3 | MIT | Streaming file uploads |
| @fastify/rate-limit | 11.2.1 | MIT | Login rate limiting |
| @fastify/static | 10.1.6 | MIT | Serving the web client |
| @fastify/websocket | 11.3.4 | MIT | Real-time WebSocket |
| @node-rs/argon2 | 2.2.2 | MIT | Password hashing (argon2id) |
| fastify | 5.12.5 | MIT | HTTP server |
| fractional-indexing | 4.0.0 | CC0-1.0 | Card and list ordering keys |
| pg | 8.23.1 | MIT | PostgreSQL client |

## Bundled into the web client (build time)

| Package | Version | License |
|---|---|---|
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| react-router-dom | 7.18.4 | MIT |
| @dnd-kit/core | 6.3.1 | MIT |
| @dnd-kit/sortable | 10.0.0 | MIT |
| @dnd-kit/utilities | 3.2.2 | MIT |
| markdown-it | 15.0.2 | MIT |
| lucide-react | 1.45.0 | ISC |

## Development and test only (not shipped)

| Package | Version | License |
|---|---|---|
| @axe-core/playwright | 4.13.0 | MPL-2.0 |
| @playwright/test | 1.64.0 | Apache-2.0 |
| @types/markdown-it | 14.2.0 | MIT |
| @types/node | 22.20.5 | MIT |
| @types/pg | 8.23.1 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @types/ws | 8.18.1 | MIT |
| @vitejs/plugin-react | 5.2.0 | MIT |
| concurrently | 9.2.5 | MIT |
| playwright-core | 1.64.0 | Apache-2.0 |
| tsx | 4.23.15 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vite | 7.3.7 | MIT |
| vitest | 5.0.4 | MIT |
| ws | 8.22.0 | MIT |

## Container images

| Image | Use | License |
|---|---|---|
| `node:22-bookworm-slim` | Build and runtime base | Node.js: MIT; Debian packages: various free licenses |
| `postgres:16-alpine` | Database | PostgreSQL License |
| `caddy:2` (optional) | HTTPS proxy | Apache-2.0 |

## All installed packages by license

- MIT: 201
- ISC: 18
- Apache-2.0: 7
- BSD-3-Clause: 5
- BlueOak-1.0.0: 5
- MPL-2.0: 2
- PSF-2.0: 1
- CC-BY-4.0: 1
- BSD-2-Clause: 1
- CC0-1.0: 1
- 0BSD: 1

MPL-2.0 applies to `axe-core` (test-only accessibility scanner, not shipped). Icons are Unicode characters and an original SVG logo; no third-party icon or font files are bundled. Run `npm audit` after dependency changes.
