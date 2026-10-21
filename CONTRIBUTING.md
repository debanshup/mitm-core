# Contributing

Thank you for your interest in contributing to `mitm-core`!

## Important Notice: Solo Development

This project is currently developed and maintained by a [single developer](https://debanshupanigrahi.dev).

To avoid wasted effort and merge conflicts, **please open a Discussion or Issue before making internal or architectural changes.** Pull requests introducing major or architectural changes without prior discussion may be closed.

This helps keep the codebase consistent and aligned with the current development roadmap.

## How to Contribute

### Reporting Bugs

Open an Issue and include:

- A clear description of the problem.
- Steps to reproduce the issue.
- Expected and actual behavior.
- Your operating system and Node.js version.

### Suggesting Features

Open a Discussion or Issue to propose your idea. Explain its motivation, intended behavior, and how it benefits the proxy framework before writing code.

### Minor Fixes

For small changes, such as typos, documentation corrections, or isolated bug fixes, you can submit a Pull Request directly without opening a prior Discussion.

If you're unsure whether a change is minor or architectural, open a Discussion or Issue first.

## Local Development

### Prerequisites

- **Node.js** >= 20
- **npm** >= 9

### Setup

1. Fork the repository on GitHub.
2. Clone your fork:

   ```bash
   git clone https://github.com/<your-username>/mitm-core.git
   cd mitm-core
   ```

3. Install dependencies:

   ```bash
   npm ci
   ```

4. Build the project:

   ```bash
   npm run build
   ```

### Required File Structure for Tests and Examples

Before running the test suite or the basic and advanced examples (`npm run dev:basic` and `npm run dev:advanced`), ensure that the following files are present at the expected paths:

```text
mitm-core/
├── creds/
│   └── __self__/
│       ├── CA.pem
│       └── key.pem
├── package.json
└── proxy.ts
```

The tests and examples rely on the CA certificate (`CA.pem`) and private key (`key.pem`) being available at these locations. If either file is missing or stored elsewhere, tests or examples that depend on them may fail to run.

**Make sure both files are in place before running the tests or examples.**

### Before Submitting a Pull Request

Run the full check suite and ensure everything passes:

```bash
npm run typecheck
npm run lint
npm run test
```

If `lint` reports formatting issues, run:

```bash
npm run format
```

Then rerun the checks.

## Pull Request Process

1. Fork the repository to your GitHub account.
2. Create a branch for your changes:

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. Make your changes, following the strict TypeScript patterns used throughout the codebase.
4. Commit with clear, descriptive messages.
5. Push your branch:

   ```bash
   git push origin feature/your-feature-name
   ```

6. Open a Pull Request against the upstream repository's `main` branch.

## Code Style

- All source files are written in **TypeScript**, with strict mode enabled.
- **Prettier** is used for code formatting. Run `npm run format` before committing.
- Avoid excessive use of `any`. Prefer precise types and preserve the codebase's strict typing conventions.

Thank you for helping improve `mitm-core`!
