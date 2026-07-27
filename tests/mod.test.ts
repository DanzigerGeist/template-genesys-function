import { assertEquals } from "@std/assert";
import type { Context } from "aws-lambda";
import { handler } from "../src/mod.ts";

/**
 * The budget this function must finish within.
 *
 * Set this to the timeout configured on your data action. Genesys permits 1–15 seconds and stops
 * a function that exceeds it, so a handler that outgrows this number fails in production rather
 * than here — which is the failure this test exists to bring forward in time.
 */
const ACTION_TIMEOUT_MS = 15_000;

/**
 * Share of the budget the handler may consume before this test fails.
 *
 * Well under 1.0 on purpose. This runs against stubs on a warm machine, while production adds a
 * cold start, TLS handshakes, and a live Genesys round trip per API call. Passing at 90% here
 * would still time out there.
 */
const BUDGET_FRACTION = 0.5;

const stubContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: "test",
  functionVersion: "1",
  invokedFunctionArn: "arn:aws:lambda:us-east-1:000000000000:function:test",
  memoryLimitInMB: "128",
  awsRequestId: "test-request-id",
  logGroupName: "test-log-group",
  logStreamName: "test-log-stream",
  // Matches the platform ceiling. A Genesys function never has more than this.
  getRemainingTimeInMillis: () => ACTION_TIMEOUT_MS,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

Deno.test("handler returns expected response", async () => {
  const response = await handler({}, stubContext, () => {});
  assertEquals(response, { exampleOutput: "Hello from Genesys Cloud function" });
});

Deno.test("handler finishes well inside the action timeout", async () => {
  const started = performance.now();
  await handler({}, stubContext, () => {});
  const elapsedMs = performance.now() - started;

  const ceilingMs = ACTION_TIMEOUT_MS * BUDGET_FRACTION;

  assertEquals(
    elapsedMs < ceilingMs,
    true,
    `Handler took ${elapsedMs.toFixed(0)}ms of a ${ACTION_TIMEOUT_MS}ms budget, past the ` +
      `${ceilingMs}ms mark this test allows. Genesys stops a function that exceeds its action ` +
      `timeout, and production adds a cold start and live API round trips on top of whatever ` +
      `this measures. Do less work, or raise the action timeout and ACTION_TIMEOUT_MS together.`,
  );
});
