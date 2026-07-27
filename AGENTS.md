# AGENTS.md

Guidance for AI agents working in this repository.

## Project

A template for a **Genesys Cloud Function data action** — an AWS Lambda that
Genesys runs inside *its own* account and invokes from an Architect flow.

Deno 2.x source, bundled to CommonJS and shipped as `target/index.zip`.

- `src/mod.ts` — the handler Genesys invokes. Entry point.
- `src/genesys/` — the kit for calling Genesys APIs back.
- `src/types/` — handler, request and response types.
- `tests/` — test suite. `benchmarks/` — benchmarks.
- `scripts/publish.ts` — deployment tooling. Never bundled, never imported by
  `src/`.

Repos generated from this template keep `src/`; the template itself must stay
green on a bare `git clone` + `make setup`, with no secrets configured.

## This is not the AWS Lambda data actions integration

Genesys ships two integrations whose names read almost identically. Confusing
them is the single easiest way to import wrong guidance into this repo.

|                | **Function data actions** (this repo) | AWS Lambda data actions |
| -------------- | ------------------------------------- | ----------------------- |
| Runs in        | Genesys's AWS account                 | *Your* AWS account      |
| IAM role       | none — you have no AWS credentials    | required                |
| VPC / S3 / SQS | unavailable                           | available               |

Every "no IAM", "no VPC", "no static egress IP" statement below is **false** for
the second product. Check which one a source is describing before trusting it.

## Setup

Run `make setup` once — installs dependencies and the Cog git hooks
(commit-message validation, pre-commit format/lint, pre-push checks).

For AI-assisted work, the official [denoland/skills](https://github.com/denoland/skills)
plugin is recommended (`/plugin marketplace add denoland/skills`, then
`/plugin install deno-skills@denoland-skills` in Claude Code).

## Commands

- `make check` — format, lint, type and dependency checks
- `make test` — test suite with coverage
- `make security` — secret scan (gitleaks) and vulnerability audit
- `make build` — bundle to CJS and zip to `target/index.zip`
- `make publish` — ship the zip to Genesys Cloud (see below)
- `make format` — apply formatting

## Talking back to Genesys

A function that only shapes its input needs none of this. A function that has to
*ask Genesys something* uses the kit in `src/genesys/`.

```ts
import platformClient from "purecloud-platform-client-v2";
import { getClient } from "./genesys/mod.ts";
import type { FunctionHandler } from "./types/mod.ts";

export const handler: FunctionHandler = async (request, context) => {
  const client = await getClient(context);
  const routing = new platformClient.RoutingApi(client);

  const result = await routing.getRoutingQueues({ name: request.queueName });

  return { queueId: result.entities?.[0]?.id ?? null };
};
```

`FunctionRequest` and `FunctionResponse` in `src/types/` are placeholders — edit
them to match the contract your data action actually declares, and the handler
signature follows. Note that `getRoutingQueues({name})` filters server-side, so
this costs one call rather than a paginated sweep.

What the kit exports today:

- `getClient(context, credentials?)` — an authenticated `ApiClientClass`, ready
  to hand to any `platformClient` API class.
- `getCredentials(context)` — pulls host, client ID and secret out of
  `context.clientContext`.
- `clearTokenCache()` — drops the cached token. For tests, and for recovering
  from a 401.

Credentials arrive as the `X-Genesys-API-Host`, `-Key` and `-Secret` headers,
which the data action's `config.request.headers` populates —
`make publish` wires them up when it creates the action. If they reach you through
the request template body instead, parse them yourself and pass a `Credentials`
object to `getClient` directly.

`getClient` builds a fresh `ApiClientClass` per invocation rather than
configuring the shared `ApiClient.instance`, so a warm container cannot leak one
org's environment or token into the next invocation. The access token *is*
reused across invocations, and only while the credentials that minted it are
unchanged.

**Not in the kit yet** — do not import these, they do not exist: error
predicates, retry, pagination helpers, id-or-name resolution. Write them at the
call site, or add the module properly.

## Publishing

`make publish` is the only command you need. It lives in `scripts/publish.ts`,
and it works out which pieces already exist rather than assuming a sequence you
have to remember.

After `check`, `test`, `security` and the zip build, it:

1. Opens a draft, PUTs the zip, sets handler / runtime / timeout
2. Validates the draft structurally, without executing it
3. Executes the draft end to end, failing on any bad step
4. Publishes, retrying while Genesys finishes processing the upload

Steps 2 and 3 exist to catch the nastiest failure mode: an upload that succeeds
but misconfigures the runtime, so the function only fails once it is live inside
a contact-centre flow.

On a repo with nothing set up yet it walks the bootstrap first — picking or
creating an integration, naming the action, choosing a runtime, then creating the
data action and writing the result to the `genesys` block in `deno.json`. That
block is committed, so nobody else has to repeat it.

The prompts appear only when attached to a terminal. Under CI it never waits for
input: whatever is missing is reported as the variable or config key to set, and
the run fails instead of hanging.

Configuration is read from the **process environment** — nothing here loads a
`.env` file. Export the variables however you like; [direnv](https://direnv.net)
with a gitignored `.envrc` is the usual choice, and it pairs well with pulling
the secrets from a password store rather than writing them to disk.

Only the three credentials are required. Everything else has somewhere else to
come from — the `genesys` block in `deno.json`, or a prompt — and an environment
variable overrides it, which is how one checkout targets a second org.

| Variable                  | Required | Notes                                       |
| ------------------------- | -------- | ------------------------------------------- |
| `GENESYS_HOST`            | yes      | e.g. `mypurecloud.com`¹                     |
| `GENESYS_CLIENT_ID`       | yes      | OAuth client credentials                    |
| `GENESYS_CLIENT_SECRET`   | yes      |                                             |
| `GENESYS_ACTION_ID`       | no       | overrides `genesys.actionId`                |
| `GENESYS_RUNTIME`         | no       | overrides `genesys.runtime`                 |
| `GENESYS_TIMEOUT_SECONDS` | no       | overrides `genesys.timeoutSeconds`, max 15  |
| `GENESYS_INTEGRATION_ID`  | no       | skips the integration prompt on bootstrap   |
| `GENESYS_ACTION_NAME`     | no       | bootstrap default, otherwise the `name`     |

¹ The SDK normalizes this — it strips any protocol and a leading `api.`, so
`mypurecloud.com` and `https://api.mypurecloud.com` are equivalent. What the
deployed function receives as `X-Genesys-API-Host` is a different value with the
same job: the `host` field of the credentials configured on the integration in
Admin, which the action's header templates dereference. The bootstrap does not
create those credentials — configure them once on the integration, with fields
named `host`, `clientId` and `clientSecret`.

Never hardcode a list of supported Node versions anywhere in this repo. The set
changes, and published version lists go stale — the runtime menu `make publish`
offers is the live answer, read from the API at the moment you need it. It
reports each runtime's status and end-of-life date, hides the ones already past
it, and warns before reusing a deprecated one. A deprecated runtime still
*executes*, but blocks any create or update,
so a deploy can hard-fail while production traffic keeps working fine.

## Platform limits

Verified against Genesys documentation:

- **Execution timeout is 1–15 seconds**, configurable, and a hard stop. This is
  the constraint that shapes everything else — there is no room for a multi-
  second retry ladder. The *data action* wrapping the function has a separate
  timeout that goes to 60 seconds; a source quoting "60" describes that knob,
  not this ceiling.
- Handler is configurable — `{path_to_module}.{export_name}`, set per upload.
  This template bundles to a root `index.js` exporting `handler`, so it always
  deploys as `index.handler`.
- ZIP ceiling 256 MB, unencrypted. Bundle size is a non-issue.
- **No AWS resources at all** — no IAM, no S3/DynamoDB/SQS, no VPC, no static
  egress IPs, no client certificates.
- Response budget is **732 KB** (750,000 bytes) for the function's request and
  response payloads — keep responses under the recommended 256 KB. The
  Architect Call Data action's own 2 MB cap sits behind it and never binds
  first.
- `clientContext` caps at 3,584 bytes of base64-encoded data and cannot carry
  certificates. Anything bulky belongs in the request template body, which has
  no size restriction.
- Memory is **1536 MB** with one vCPU — from the launch blog, and confirmed
  live by the REPORT line in the execution log.

Not documented by Genesys — treat as engineering judgement, not fact:

- Container reuse, container lifetime, cold-start behaviour. The token cache
  assumes warm containers exist; if they do not, it degrades to today's
  behaviour at no risk, which is why it is safe to keep.

## Rate limits

The Platform API limit is per **token** — 300 requests per minute by default. A
client-credentials client holds one cached token at a time, so in practice that
is this function's whole budget. A handler that loops over a list and calls the
API once per item will reach it, and when it does the Architect flow above it
degrades with no obvious cause.

Design around it rather than retrying into it: filter server-side instead of
paginating and filtering locally, use a batch endpoint where one exists, and do
not re-fetch what has not changed between invocations.

When you are limited:

- The response is **429**, carrying a `Retry-After` header.
- Headers only exist on a rejection after
  `client.setReturnExtendedResponses(true)` — the default rejection is the
  bare error body, which carries no headers at all.
- v257 stores header names lowercased: read `headers["retry-after"]`, or
  `headers.get("Retry-After")`, which ignores case. The platform docs say to
  read it exact-case — for this SDK that advice is backwards.
- `Retry-After` is in **seconds**.
- A response *without* `Retry-After` must not be retried automatically.
- Most 429 bodies include a `limit` object naming the limiter that tripped.

The documented backoff for 502/503/504 — 3 s, rising to 9 s and 27 s the longer
an outage persists — **cannot run here**. This function's entire lifetime is 15
seconds, so a single 27-second
wait is nearly double the whole budget. Check the remaining time before any
sleep and fail fast when the wait would not leave room to finish: sleeping until
the platform kills you turns a slow call into no answer at all.

Retry is also the caller's job. The Architect flow above can retry far more
cheaply than a function spending its own 15-second budget doing it.

## Logs exist only in test runs

The function runs in Genesys's AWS account, so there is no CloudWatch and no log
group. In a deployed function, `console` output goes nowhere — do not reach for
logging to diagnose live traffic.

Test executions are the exception, and a big one. The `TestExecutionResult`
contains an "External execution log" operation carrying the run's full log:
every `console.log` and `console.error` as structured entries, plus the Lambda
START/END/REPORT lines with memory and init duration. Genesys caps it at the
last 4 KB. Log freely while diagnosing — but never let a credential into a log
line, even here.

What comes back from a test:

- **The draft test inside `make publish`** — a structured `TestExecutionResult`:
  `operations[]` of `{step, name, success, result, error}`, plus top-level
  `finalResult`, `error` and `success`. The `error` fields are `ErrorBody`
  objects — `{message, code, status, …}` — not strings.
- **`postIntegrationsActionTest`** — the same, against the published action
  rather than the draft.
- **Your return value, and anything you throw.** A thrown `Error`'s message and
  stack come back verbatim in the failing step's `error` (verified against the
  live platform); in production the same `ErrorBody` takes the flow's failure
  path. Make the message one a human can act on.

Tests are therefore the only place you can watch this code run. Keep the handler
thin and put the logic in functions a test can call directly.

## SDK gotchas

Verified against `purecloud-platform-client-v2` **v257**. Re-check after a major
bump — several of these changed between v111 and v257.

- **Three rejection shapes.** An HTTP error rejects with the parsed error
  body — `{message, code, status}`, a plain object. After
  `setReturnExtendedResponses(true)` it is `{status, statusText, headers, body,
  text, error}` instead — still plain, but `message` is gone. A transport
  failure rejects with the raw `AxiosError`, which *is* an `Error`. Never
  assume a field exists on a caught rejection; probe for it.
- **Nothing ships with retry, pagination or caching** — write them at the call
  site. A seam does exist (`setPreHook`/`setPostHook` on the HTTP client, or
  `setHttpClient` with an `AbstractHttpClient` subclass), but the v257 hook
  wiring ejects against the wrong axios object, so prefer call-site wrappers
  until that is fixed.
- **`ApiClient.instance` assignment is guarded**, so constructing your own
  instance does not clobber it. Injection is free — every API class takes a
  client.
- **Default HTTP timeout is 16000 ms**, which is longer than the function's
  maximum 15-second lifetime, so it can never fire. A transport hang becomes a
  hard function kill rather than a catchable error. Set a per-call deadline with
  `client.getHttpClient().setTimeout(ms)` where it matters.
- The 401 refresh path only applies to the authorization code grant; under
  client credentials it is correctly skipped. Client credentials issue no
  refresh token, so an expired token means running the full grant again.

## Where to look things up

In rough order of how much to trust them:

1. **The SDK's own typings.** They describe the exact version this repo pins,
   which the website does not — the 401-refresh behaviour changed between
   versions, and the site only ever documents the current one. Deno caches them
   under the path `deno info --json` reports as `npmCache`, at
   `.../purecloud-platform-client-v2/<version>/index.d.ts`. When the question is
   "does this SDK have X", grep that file rather than searching the web.
   `deno doc` does not work on this package — its default-export namespace does
   not surface — so grep is the route.
2. **The live API.** `getIntegrationsActionsFunctionsRuntimes` beats any
   published runtime list. The full swagger sits at
   `https://api.mypurecloud.com/api/v2/docs/swagger` — authoritative, but it
   redirects to a 22 MB JSON document, so filter it rather than reading it.
3. **[developer.genesys.cloud](https://developer.genesys.cloud)** — API
   Explorer, resource reference, platform guides.
4. **[The developer forum](https://developer.genesys.cloud/forum/)** — often the
   only place a Functions-specific behaviour is described at all. Much of this
   product is undocumented and the forum is where the gaps get filled in.

**The developer centre renders its content in JavaScript.** A plain HTTP fetch
returns an empty shell, not the page — so a fetch that "succeeds" and shows
nothing useful has not actually failed in a way you will notice. Use a renderer
such as Firecrawl to read those pages, and treat an empty result as a tooling
problem rather than as an absence of documentation.

Two further cautions:

- **Some pages carry an AI-generated summary.** Read the body text, not the
  summary.
- **Two timeouts read alike.** The function's ceiling is 15 seconds; the data
  action's own timeout goes to 60. The 60-second figure in the release notes is
  the action knob, not the function.
- **Search results conflate the two integrations.** Confirm a result is about
  Function data actions and not the AWS Lambda data actions integration before
  acting on it.

## Relationship to template-deno

This repo is generated from
[template-deno](https://github.com/DanzigerGeist/template-deno), the single source of truth for the
shared toolchain — the `deno.json` task graph, Makefile, `cog.toml`, CI workflows, lint rules,
coverage thresholds and git hooks. Sync those from the baseline and treat any difference as drift,
**unless** it is one of the intentional divergences below. When you add a new one, record it here so
the next sync knows it is deliberate.

- **Build and release.** Ships an AWS Lambda zip, not a JSR/npm package. The `build:genesys*` tasks
  replace the bundle/npm/binary tasks; `publish` runs `scripts/publish.ts` against a live Genesys
  org; there is no docs site and no JSR/npm publish job.
- **No `check:docs`.** The public API is expressed in vendor types (`Context`, `Handler`,
  `ApiClientClass`), which `deno doc --lint` rejects as private-type references — that rule assumes a
  self-contained library, so it is dropped here. Typed exports are still enforced by the
  `explicit-module-boundary-types` lint rule.
- **Test permissions.** The Platform SDK reads `process.env` and the home directory as it loads, so
  tests run with `--allow-env --allow-sys --allow-read` rather than the baseline's bare `--no-prompt`.
- **`scripts/` is not linted.** `publish.ts` is an interactive CLI that writes to the console, which
  the baseline's `no-console` rule forbids, so `scripts/` stays out of `deno lint`. It is still
  type-checked under the same strict `compilerOptions` — `check:types` covers `src/ tests/ scripts/`.

## Conventions

- **Conventional Commits**, enforced by the Cog `commit-msg` hook and by CI.
- **Commit messages are a single line ending in `[skip ci]`.** No bodies, no
  `Co-Authored-By:` trailers, no multi-line messages. This overrides the default
  behaviour of most coding agents.
- **All dependencies live in the `deno.json` `imports` map** — source files use
  bare specifiers only; never write inline `npm:`/`jsr:` specifiers in `src/`.
  `deno lint` enforces this. `scripts/` is the one exception — its prompt library
  is pinned inline and disabled per-file, deliberately, so that nothing reachable
  from `src/` can import it.
- **Avoid `node_modules` in every possible case** — prefer `jsr:` packages, use
  `npm:` only when no JSR alternative exists, and never set `nodeModulesDir`.
  The bundle has to load under Node without one.
- **Coverage targets**: 80% lines, 80% branches, 100% functions — every function
  exercised by tests.
- Formatting and linting follow `deno fmt` / `deno lint` (line width 120).
- Every exported symbol needs JSDoc; public functions ship a runnable
  `@example`.

## Boundaries

Always:

- Run `make check` and `make test` before preparing a commit.
- Keep `deno.lock` in sync — `deno task check:dependencies` verifies it.
- Treat the 15-second ceiling as the budget when adding any API call.

Ask first:

- Adding or updating a dependency.
- Changing CI workflows, `cog.toml`, the `publish` task, or `scripts/publish.ts`.
- Raising or lowering coverage thresholds.
- Running `make publish` — it changes a live Genesys org.

Never:

- Log `clientSecret`, an access token, or anything else from `clientContext`.
- Cache live state — conversation state, queue or agent statistics, presence.
  Serving those stale returns a wrong answer into a live flow, which reads as a
  working function.
- Commit secrets — `make security` runs gitleaks over both the working tree and
  the full Git history.
- Skip, delete, or weaken failing tests, or bypass hooks with `--no-verify`.
- Edit `version` in `deno.json` by hand — `cog bump` owns it.
- Commit generated artifacts: `target/`, `.coverage/`.
