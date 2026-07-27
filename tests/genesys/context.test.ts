import { assertEquals, assertThrows } from "@std/assert";
import type { Context } from "aws-lambda";
import { getCredentials } from "../../src/genesys/context.ts";

/** Builds a Lambda context carrying the supplied clientContext headers. */
function contextWith(headers: Record<string, string>): Context {
  return { clientContext: headers } as unknown as Context;
}

const complete = {
  "X-Genesys-API-Host": "https://api.mypurecloud.com",
  "X-Genesys-API-Key": "client-id-123",
  "X-Genesys-API-Secret": "client-secret-456",
};

Deno.test("getCredentials reads the three Genesys headers", () => {
  assertEquals(getCredentials(contextWith(complete)), {
    host: "https://api.mypurecloud.com",
    clientId: "client-id-123",
    clientSecret: "client-secret-456",
  });
});

Deno.test("getCredentials matches header names case-insensitively", () => {
  const credentials = getCredentials(contextWith({
    "x-genesys-api-host": "https://api.mypurecloud.de",
    "X-GENESYS-API-KEY": "id",
    "x-Genesys-Api-Secret": "secret",
  }));

  assertEquals(credentials.host, "https://api.mypurecloud.de");
  assertEquals(credentials.clientId, "id");
  assertEquals(credentials.clientSecret, "secret");
});

Deno.test("getCredentials names every missing header at once", () => {
  const error = assertThrows(
    () => getCredentials(contextWith({ "X-Genesys-API-Host": "https://api.mypurecloud.com" })),
    Error,
  );

  // A misconfigured action should be fixable in one pass, not one header per deploy.
  assertEquals(error.message.includes("X-Genesys-API-Key"), true);
  assertEquals(error.message.includes("X-Genesys-API-Secret"), true);
  assertEquals(error.message.includes("X-Genesys-API-Host"), false);
});

Deno.test("getCredentials rejects blank header values", () => {
  assertThrows(() => getCredentials(contextWith({ ...complete, "X-Genesys-API-Secret": "   " })), Error);
});

Deno.test("getCredentials throws when clientContext is absent", () => {
  assertThrows(() => getCredentials({} as Context), Error);
});

Deno.test("getCredentials never leaks the secret in its error message", () => {
  const error = assertThrows(
    () => getCredentials(contextWith({ "X-Genesys-API-Secret": "super-secret-value" })),
    Error,
  );

  assertEquals(error.message.includes("super-secret-value"), false);
});
