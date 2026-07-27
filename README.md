# Genesys Cloud Function Template

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/DanzigerGeist/template-genesys-function/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/DanzigerGeist/template-genesys-function/actions/workflows/pr-checks.yml)

A Deno 2.x template for a **Genesys Cloud Function data action**: an AWS Lambda that Genesys runs inside its own account
and invokes from an Architect flow. You write a typed handler in `src/`, and `make build` bundles it to a single
CommonJS `index.js` zipped as `target/index.zip`. `make publish` ships that zip to a Genesys org and publishes the
action.

## Quick start

**Prerequisites:** [Deno 2.x](https://docs.deno.com/runtime/getting_started/installation/), `make`, and the GitHub CLI
`gh` (only for the template-clone shortcut in step 1). `make setup` installs the project's dependencies, not Deno
itself.

```sh
# 1. Create a repository from the template
gh repo create my-function --template DanzigerGeist/template-genesys-function --clone
cd my-function

# 2. Install dependencies and the Cog git hooks
make setup

# 3. Verify everything works
make check && make test

# 4. Build the zip for Genesys Cloud
make build   # writes target/index.zip
```

`make setup` installs the Cog-managed git hooks (commit-message validation, pre-commit format and lint, pre-push
checks). A bare clone stays green with no secrets configured.

To ship the function to a Genesys org, set the three `GENESYS_*` credentials and run `make publish` — see
[Publishing](#publishing). The full command reference is in [Commands](#commands).

## Not the AWS Lambda data actions integration

Genesys ships two integrations with nearly identical names, and mixing them up is the fastest way to follow wrong
advice.

|                | **Function data actions** (this repo) | AWS Lambda data actions |
| -------------- | ------------------------------------- | ----------------------- |
| Runs in        | Genesys's AWS account                 | _your_ AWS account      |
| IAM role       | none — you have no AWS credentials    | required                |
| VPC / S3 / SQS | unavailable                           | available               |

Everything below assumes Function data actions (the left column). Because the function has no AWS resources of its own,
it must authenticate to the Platform API with credentials the data action hands it. If a source describes IAM, VPC, or
an S3 bucket, it is describing the other integration.

## What you get

```
src/
  mod.ts              # handler — the entry point Genesys invokes
  genesys/            # the kit for calling Genesys APIs back
    mod.ts            # barrel: getClient, getCredentials, clearTokenCache
    client.ts         # getClient — authenticated client, token reused across warm invocations
    context.ts        # getCredentials — reads credentials from clientContext (populated from request headers)
  types/
    mod.ts            # barrel for all types
    FunctionRequest.ts   # input payload (placeholder — edit this)
    FunctionResponse.ts  # output payload (placeholder — edit this)
    FunctionHandler.ts   # Handler<FunctionRequest, FunctionResponse>
    Credentials.ts       # OAuth client-credentials shape
scripts/publish.ts    # deploy pipeline; never bundled, never imported by src/
tests/                # test suite, mirrors src/
benchmarks/           # benchmarks
deno.json             # tasks, dependencies, fmt/lint rules, coverage thresholds, genesys block
Makefile              # shorthand over deno task
cog.toml              # Cocogitto: versioning, changelog, git hooks
```

Dependencies live only in the `deno.json` `imports` map; source files use bare specifiers. `scripts/` is the deliberate
exception so nothing reachable from `src/` can import the deploy tooling.

## Writing your function

The handler starts thin. It returns a placeholder response and touches neither Genesys nor its context:

```ts
import type { Context } from "aws-lambda";
import type { FunctionHandler, FunctionRequest, FunctionResponse } from "./types/mod.ts";

export const handler: FunctionHandler = (
  _request: FunctionRequest,
  _context: Context,
): Promise<FunctionResponse> => {
  return Promise.resolve({ exampleOutput: "Hello from Genesys Cloud function" });
};
```

`FunctionRequest` and `FunctionResponse` are placeholders. Edit them to match the contract your data action declares,
and the handler signature follows:

```ts
export type FunctionRequest = { readonly exampleInput?: string };
export type FunctionResponse = { exampleOutput: string };
```

Keep the handler thin and put logic in functions a test can call directly.

## Talking back to Genesys

A function that only reshapes its input needs nothing more. A function that has to _ask Genesys something_ uses the kit
in `src/genesys/`:

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

`getRoutingQueues({ name })` filters server-side, so this costs one call rather than a paginated sweep. That matters
against the per-token rate limit.

The kit exports three functions:

- `getClient(context, credentials?)` — an authenticated `ApiClientClass`, ready to hand to any `platformClient` API
  class.
- `getCredentials(context)` — pulls host, client ID, and secret out of `context.clientContext`.
- `clearTokenCache()` — drops the cached token, for tests and for recovering from a 401.

For a live execution to authenticate, the credentials must be configured once on the integration in Admin, with fields
named `host`, `clientId`, and `clientSecret`. They reach the function as the `X-Genesys-API-Host`, `-Key`, and `-Secret`
headers, which the data action's `config.request.headers` populate; `make publish` wires the header templates when it
creates the action, and its bootstrap can also set up the integration's credentials for you. If they instead arrive
through the request template body, parse them yourself and pass a `Credentials` object to `getClient` directly.

`getClient` builds a fresh client per invocation rather than configuring the shared `ApiClient.instance`, so a warm
container cannot leak one org's environment or token into the next invocation. The access token itself _is_ reused
across invocations, but only while it is still valid and the credentials that minted it are unchanged; an expired token
— or one whose credentials changed — triggers a fresh client-credentials grant. A 401 is recovered manually: call
`clearTokenCache()` to drop the held token, then retry — the SDK's automatic 401 refresh does not apply to the
client-credentials grant.

Error predicates, retry, pagination, and id-or-name resolution are **not** in the kit. Write them at the call site, or
add the module properly.

## Publishing

`make publish` is the only command you need. It first runs the full CI gate (checks, coverage, security, and the zip
build), then hands off to `scripts/publish.ts`. That script detects which pieces already exist and creates only what is
missing, so you do not have to remember the order.

On a repo with nothing set up, it walks a short bootstrap:

1. Pick or create the integration.
2. Name the action.
3. Optionally wire the integration's function credentials from your `GENESYS_*` values.
4. Choose a runtime.
5. Set the action timeout (1–15s).
6. Create the data action and write the result to the `genesys` block in `deno.json`.

That block is committed, so nobody repeats it.

With an action configured, every run:

1. Opens a draft, uploads the zip, and sets handler, runtime, and timeout.
2. Validates the draft structurally, without executing it.
3. Executes the draft end to end, failing on any bad step.
4. Publishes, retrying while Genesys finishes processing the upload.

Steps 2 and 3 exist to catch the worst failure mode: an upload that succeeds but misconfigures the runtime, so the
function only fails once it is live inside a flow.

Configuration is read from the **process environment** — nothing loads a `.env` file. Export the variables however you
like; [direnv](https://direnv.net) with a gitignored `.envrc` is the usual choice. When run in a terminal, the script
prompts for whatever is missing. Under CI it never waits: it reports the variable or config key to set, then fails.

| Variable                  | Required | Notes                                        |
| ------------------------- | -------- | -------------------------------------------- |
| `GENESYS_HOST`            | yes      | e.g. `mypurecloud.com`                       |
| `GENESYS_CLIENT_ID`       | yes      | OAuth client credentials                     |
| `GENESYS_CLIENT_SECRET`   | yes      |                                              |
| `GENESYS_ACTION_ID`       | no       | overrides `genesys.actionId`                 |
| `GENESYS_RUNTIME`         | no       | overrides `genesys.runtime`                  |
| `GENESYS_TIMEOUT_SECONDS` | no       | overrides `genesys.timeoutSeconds`, max 15   |
| `GENESYS_INTEGRATION_ID`  | no       | skips the integration prompt on bootstrap    |
| `GENESYS_ACTION_NAME`     | no       | bootstrap default, otherwise the action name |

Only the three credentials are required; an environment variable always overrides the committed `genesys` block, which
is how one checkout can target a second org. `make publish` changes a live Genesys org, so treat it accordingly. The SDK
normalizes `GENESYS_HOST` (it strips any protocol and a leading `api.`), and that value is distinct from the runtime
`X-Genesys-API-Host` header, which comes from the integration's configured credentials. See [`AGENTS.md`](AGENTS.md) for
the runtime menu, credential wiring, and CI behaviour in full.

## Constraints that shape the code

These are the Genesys platform limits and standing rules that decide what a handler can do — not template choices.

- **15-second hard timeout.** Configurable from 1 to 15 seconds, and a hard stop. There is no room for a multi-second
  retry ladder; retry is the Architect flow's job, not the function's. (The _data action_ wrapping the function has a
  separate timeout that goes to 60 seconds — a different knob.)
- **No AWS resources.** No IAM, no S3/DynamoDB/SQS, no VPC, no static egress IP, no client certificates.
- **Response budget of 732 KB** (750,000 bytes) across request and response payloads; keep responses under the
  recommended 256 KB.
- **`clientContext` caps at 3,584 bytes** and cannot carry certificates. Put anything bulky in the request template
  body, which has no size limit.
- **300 requests per minute, per token.** The limit is per token, and a client-credentials client holds one token, so
  that is the whole function's budget. A handler that loops and calls the API once per item will hit it. Filter
  server-side, use batch endpoints, and do not re-fetch what has not changed.
- **No logs in production.** The function runs in Genesys's account, so `console` output goes nowhere live. Test
  executions are the exception: `TestExecutionResult` carries the run's full log (last 4 KB). Never log a credential or
  token, even there.
- **Never cache live state** — conversation state, queue or agent statistics, presence. Caching any of these and serving
  a stale copy returns a wrong answer into a live flow.

See [`AGENTS.md`](AGENTS.md) for rate-limit handling (429 / `Retry-After`) and the `purecloud-platform-client-v2` v257
SDK gotchas.

## Commands

| Command          | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `make setup`     | Install dependencies and the Cog git hooks. Run once.     |
| `make format`    | Apply formatting                                          |
| `make check`     | Format, lint, type, dependency, and JSDoc-example checks  |
| `make test`      | Run the suite and collect coverage                        |
| `make ci`        | Every gate CI runs: checks, coverage, security, zip build |
| `make security`  | Secret scan (gitleaks) and dependency audit               |
| `make build`     | Bundle to CJS and zip to `target/index.zip`               |
| `make publish`   | Deploy the zip to Genesys Cloud                           |
| `make benchmark` | Run benchmarks                                            |
| `make update`    | Update dependencies within their semver ranges            |
| `make clean`     | Remove generated artifacts and the Deno cache             |
| `make version`   | Print package metadata                                    |
| `make help`      | List all targets                                          |

`make` is a convenience over `deno task`. Run `deno task` with no arguments for the more granular underlying tasks.
Threshold enforcement (80% lines, 80% branches, 100% functions) runs as part of `make ci`, not `make test`.

## Where to learn more

[`AGENTS.md`](AGENTS.md) is the full reference: the kit's design, the publish pipeline, platform and rate limits, SDK
gotchas, and conventions. For AI-assisted work, the [denoland/skills](https://github.com/denoland/skills) plugin is
recommended.

## License

[MIT](LICENSE).
