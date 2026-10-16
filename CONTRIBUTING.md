# Contributing

Thank you for your interest in contributing to `mitm-core`!

## Important Notice: Solo Development

This project is currently developed and maintained by a [single developer](https://debanshupanigrahi.dev).

To avoid wasted effort and merge conflicts, **please open a Discussion or Issue before making internal or architectural changes.** Pull requests introducing major or architectural changes without prior discussion may be closed. This helps keep the codebase consistent and aligned with the current development roadmap.

## How to Contribute

### Reporting Bugs

Open an Issue and include:

- A clear description of the problem.
- Steps to reproduce the issue.
- Expected versus actual behavior.
- Your operating system and Node.js version.

### Suggesting Features

Open a Discussion or Issue to propose your idea. Explain its motivation, intended behavior, and how it benefits the proxy framework before writing code.

### Minor Fixes

For small changes—such as typos, documentation corrections, or isolated bug fixes—you may submit a Pull Request directly without opening a prior Discussion.

If you're unsure whether a change is minor or architectural, open a Discussion or Issue first.

## Local Development

### Prerequisites

- **Node.js** >= 20
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
```

To run the example proxy, refer to the examples provided in the repository.

The development command runs the example proxy with the built-in bypass plugin.

### Before Submitting a Pull Request

Run the full check suite and ensure everything passes:

```bash
npm run typecheck
npm run lint
npm run test
```

If `lint` reports formatting issues, run `npm run format` and then rerun the checks.

## Pull Request Process

1. Fork the repository to your GitHub account.
2. Create a new branch: `git checkout -b feature/your-feature-name`.
3. Make your changes, following the strict TypeScript patterns used throughout the codebase.
4. Commit with clear, descriptive messages.
5. Push your branch: `git push origin feature/your-feature-name`.
6. Open a Pull Request against the upstream repository's `main` branch.

## Code Style

- All source files are written in **TypeScript**, with strict mode enabled.
- Formatting is enforced by **Prettier**. Run `npm run format` before committing.
- Avoid excessive use of `any`. Prefer precise types and preserve the codebase's strict typing conventions.
