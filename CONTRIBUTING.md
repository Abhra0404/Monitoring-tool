# Contributing to Theoria

Thanks for your interest in improving Theoria. This document explains how to
get a development environment running, the conventions we follow, and the
process for submitting changes.

## Code of Conduct

Be respectful, assume good intent, and keep discussions focused on the work.
Harassment or personal attacks will not be tolerated.

## Getting Started

### Prerequisites

- Node.js ≥ 18
- Go ≥ 1.25 (for agent work)
- Docker (optional — only needed for container-based testing)

### Setup

```bash
git clone https://github.com/Abhra0404/Monitoring-tool.git
cd Monitoring-tool

# Install root + workspace dependencies
npm install
cd server && npm install && cd ..
cd client && npm install --legacy-peer-deps && cd ..

# Build the client (required to serve the dashboard)
npm run build:client

# Build the Go agent (optional, for agent testing)
cd agent && go build -o theoria-agent ./cmd/agent && cd ..

# Start the full stack
npm start
```

The dashboard will be available at http://localhost:4000.

## Project Layout

See [CLAUDE.md](CLAUDE.md) for an architectural overview. In short:

- `bin/theoria.js` — CLI entry point
- `server/src/` — Express 5 + Socket.IO runtime (CommonJS)
- `server/src-new/` — Fastify + TypeScript migration target (ESM)
- `client/` — Vite + React 19 dashboard
- `agent/` — Go 1.25 metrics collector
- `landing/` — Vite marketing site

## Development Workflow

### Branching

- Create a feature branch off `main`: `git checkout -b feat/short-description`
- Use `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, or `chore/` prefixes.

### Commits

- Write commit messages in the imperative mood ("Add X", not "Added X").
- Keep commits focused. Squash noisy work-in-progress commits before opening a PR.
- Reference issues when relevant: `Fix alert duplication (#42)`.

### Code Style

- **JavaScript / TypeScript:** follow the style already in the file. Avoid
  introducing new linters or reformatting untouched code.
- **Go:** run `gofmt` (or `go fmt ./...`) before committing.
- **React:** prefer function components and hooks. New state should go through
  the existing Zustand store or TanStack Query where possible.

### Tests

Please add or update tests for any behavioural change.

```bash
# Server tests (Vitest, runs on server/src-new/)
cd server && npm test

# Server typecheck
cd server && npx tsc --noEmit

# Go agent tests
cd agent && go test ./...

# Client lint (if you added rules)
cd client && npm run lint  # if configured
```

All of these must pass before a PR is merged.

## Submitting a Pull Request

1. Ensure `main` is up to date: `git fetch origin && git rebase origin/main`.
2. Push your branch: `git push -u origin feat/your-branch`.
3. Open a PR against `main` with:
   - A clear title summarising the change
   - A description explaining the motivation and approach
   - Screenshots or terminal output for UI / CLI changes
   - A checklist of tests run locally
4. Keep PRs small and focused. Split large refactors into logical commits or
   multiple PRs.
5. Respond to review feedback by pushing follow-up commits — avoid force-pushes
   once review has started unless a rebase is explicitly requested.

## Reporting Bugs

Open a GitHub issue with:

- Theoria version (`npx theoria-cli --version`) and OS
- Exact steps to reproduce
- Expected vs. actual behaviour
- Any relevant logs from the server or agent

## Proposing Features

Open an issue describing the problem before writing code. A short design
discussion up front saves rework. For larger proposals, include a rough
sketch of the API or UI change you have in mind.

## Security

Do **not** open public issues for security vulnerabilities. Instead, email the
maintainer via the address on the GitHub profile, or open a private security
advisory on GitHub.

## License

By contributing, you agree that your contributions will be licensed under the
same [ISC License](LICENSE) that covers the project.
