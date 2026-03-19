import { handler } from "../src/mod.ts";
import type { Context } from "aws-lambda";

const stubContext = {} as Context;

Deno.bench("handler", async () => {
  await handler({}, stubContext, () => {});
});
