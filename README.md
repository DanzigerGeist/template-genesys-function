# Genesys Cloud Function Template

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/DanzigerGeist/template-genesys-function/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/DanzigerGeist/template-genesys-function/actions/workflows/pr-checks.yml)

A Deno template for building Genesys Cloud Data Action functions. Produces a non-obfuscated `index.zip` ready to upload.

## Features

- **Genesys Cloud ready** — typed handler wired to `purecloud-platform-client-v2` and `@types/aws-lambda`
- **Zip build** — `make build` bundles into `target/index.js` and zips it to `target/index.zip`
- **Quality gates** — formatting, linting, and type checking
- **Testing & benchmarks** — parallel test runner with coverage, built-in benchmark support
- **Security scanning** — dependency audit (`deno audit`) and secret detection
  ([gitleaks](https://github.com/gitleaks/gitleaks))
- **Conventional Commits** — enforced via [Cocogitto](https://docs.cocogitto.io/) git hooks
- **CI/CD** — GitHub Actions for PR checks and releases

## Quick Start

```sh
# 1. Create a new repository from the template
gh repo create my-function --template danzigergeist/template-genesys-function --clone
cd my-function

# 2. Install dependencies and git hooks
make setup

# 3. Verify everything works
make check && make test

# 4. Build the zip for Genesys Cloud
make build
# Output: target/index.zip
```

## Project Structure

```
.
├── src/
│   ├── mod.ts               # Function entry point — exports handler
│   └── types/
│       ├── mod.ts            # Barrel export for all types
│       ├── FunctionHandler.ts # Handler<FunctionRequest, FunctionResponse>
│       ├── FunctionRequest.ts # Input payload type
│       └── FunctionResponse.ts # Output payload type
├── tests/
│   └── mod.test.ts           # Test suite
├── benchmarks/
│   └── mod.bench.ts          # Benchmarks
├── .github/workflows/        # CI/CD pipelines
│   ├── pr-checks.yml         # PR quality gates
│   └── release.yml           # Release on push to master
├── deno.json                 # Project config, tasks, and dependencies
├── cog.toml                  # Cocogitto config (versioning, hooks, changelog)
├── Makefile                  # Simplified command interface
├── .editorconfig             # Editor formatting rules
└── LICENSE                   # MIT
```

## Usage

### 1. Define your input and output types

Edit `src/types/FunctionRequest.ts` and `src/types/FunctionResponse.ts` to match your Data Action contract:

```ts
// src/types/FunctionRequest.ts
export type FunctionRequest = {
  readonly queueId?: string;
  readonly queueName?: string;
};

// src/types/FunctionResponse.ts
export type FunctionResponse = {
  agentsAvailable: number;
  agentsOnline: number;
};
```

### 2. Implement the handler

Edit `src/mod.ts`. It receives the request payload and an AWS Lambda context:

```ts
import platformClient from "purecloud-platform-client-v2";
import type { FunctionHandler } from "./types/mod.ts";

export const handler: FunctionHandler = async (request, context) => {
  // Authenticate, call Genesys APIs, return response
  return { agentsAvailable: 5, agentsOnline: 12 };
};
```

### 3. Build and upload

```sh
make build
# Upload target/index.zip to Genesys Cloud via Admin > Integrations > Actions
```

## Commands

| Command          | Description                |
| ---------------- | -------------------------- |
| `make setup`     | Install deps and git hooks |
| `make format`    | Format code                |
| `make check`     | Run all quality checks     |
| `make test`      | Run test suite             |
| `make security`  | Run security scans         |
| `make build`     | Build `target/index.zip`   |
| `make benchmark` | Run benchmarks             |
| `make update`    | Update dependencies        |
| `make clean`     | Remove generated artifacts |
| `make version`   | Print package metadata     |
| `make help`      | List all targets           |

For granular control, use `deno task` directly. Run `deno task` with no arguments to see all available tasks.

## Build Output

`make build` (or `deno task build:genesys:zip`) produces two artifacts under `target/`:

| File               | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| `target/index.js`  | Non-obfuscated CJS bundle, single file with all dependencies     |
| `target/index.zip` | Zip archive containing `index.js`. Upload this to Genesys Cloud. |

## CI/CD

### PR Checks

Every pull request runs the following jobs (`.github/workflows/pr-checks.yml`):

- **Commits** — validates conventional commit messages via Cocogitto
- **Dependencies** — verifies lockfile integrity (`deno install --frozen`)
- **Format** — checks code formatting (`deno fmt --check`)
- **Lint** — runs lint rules (`deno lint`)
- **Types** — type-checks the project (`deno check`)
- **Test** — runs the test suite with coverage
- **Security** — audits dependencies for known vulnerabilities

### Releases

The release workflow (`.github/workflows/release.yml`) triggers on every push to `master`. It uses
[Cocogitto](https://docs.cocogitto.io/) for version management with
[Conventional Commits](https://www.conventionalcommits.org/).

When releasable commits are found, the workflow:

1. Bumps the version in `cog.toml` based on commit types
2. Creates a version commit and git tag
3. Pushes the commit and tag back to `master`
4. Generates a changelog from conventional commits
5. Creates a GitHub Release with the changelog as the release body

If no releasable commits exist (no `feat:`, `fix:`, or breaking changes since the last tag), the workflow skips all
steps.

Version bump rules:

```
feat: add parser        →  minor bump (0.1.0 → 0.2.0)
fix: handle empty input →  patch bump (0.2.0 → 0.2.1)
feat!: new API          →  major bump (0.2.1 → 1.0.0)
```

Nothing is published to any package registry. The workflow only creates a GitHub Release.

## Configuration

| File            | Purpose                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| `deno.json`     | Project metadata, dependencies, tasks, compiler options, fmt/lint rules      |
| `cog.toml`      | Cocogitto settings: version tag prefix, pre-bump hooks, changelog, git hooks |
| `.editorconfig` | Cross-editor formatting (indent style, charset, line endings)                |

## License

This project is licensed under the [MIT License](LICENSE).
