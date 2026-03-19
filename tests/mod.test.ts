import { assertEquals } from "@std/assert";
import type { Context } from "aws-lambda";
import { handler } from "../src/mod.ts";

const stubContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: "test",
  functionVersion: "1",
  invokedFunctionArn: "arn:aws:lambda:us-east-1:000000000000:function:test",
  memoryLimitInMB: "128",
  awsRequestId: "test-request-id",
  logGroupName: "test-log-group",
  logStreamName: "test-log-stream",
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

Deno.test("handler returns expected response", async () => {
  const response = await handler({}, stubContext, () => {});
  assertEquals(response, { exampleOutput: "Hello from Genesys Cloud function" });
});
