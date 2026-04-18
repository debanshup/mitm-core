<!-- markdownlint-disable MD033 -->

# Contributing

Thank you for your interest in contributing to `mitm-core`.

## Important Notice: Solo Development

This project is currently developed and maintained by a <a href="https://debanshupanigrahi.dev" target="_blank" rel="noopener noreferrer">single developer</a>. To avoid wasted effort and merge conflicts, **you must open a Discussion or Issue before making any internal or architectural changes.** Pull requests that introduce major or architectural changes without prior discussion will be closed. This keeps the codebase consistent and aligned with the current development roadmap.

---

## How to Contribute

### Reporting Bugs

Open an Issue and include:

- A clear description of the problem.
- Steps to reproduce the issue.
- The expected versus actual behavior.
- Your operating system and Node.js version.

### Suggesting Features

Open a Discussion or Issue to propose your idea. Explain the motivation and how it benefits the proxy framework before writing any code.

### Minor Fixes

For small changes — typos, documentation corrections, or isolated bug fixes — you may submit a Pull Request directly without opening a prior Discussion.

---

## Local Development

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9

### Setup

```bash
# 1. Clone your fork
git clone https://github.com/<your-username>/mitm-core.git
cd mitm-core

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. Start the dev watcher (runs the example proxy with built in bypass plugin)
npm run dev
```

### Before Submitting a Pull Request

Run the full check suite and ensure everything passes cleanly:

```bash
npm run typecheck
npm run lint
npm run test
```

If `lint` reports formatting issues, run `npm run format` to fix them automatically, then re-check.

---

## Pull Request Process

1. Fork the repository to your own GitHub account.
2. Create a new branch: `git checkout -b feature/your-feature-name`.
3. Write your code, following the strict TypeScript patterns used throughout the codebase.
4. Commit with clear, descriptive messages.
5. Push your branch: `git push origin feature/your-feature-name`.
6. Open a Pull Request against the `main` branch of the upstream repository.

---

## Code Style

- All source files are in **TypeScript** with strict mode enabled.
- Formatting is enforced by **Prettier**. Run `npm run format` before committing.
- No `any` abuse — the codebase tends to use strict typing throughout. Prefer precise types over broad ones.
