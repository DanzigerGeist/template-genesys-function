import { assertEquals, assertNotStrictEquals, assertRejects } from "@std/assert";
import { stub } from "@std/testing/mock";
import platformClient from "purecloud-platform-client-v2";
import type { Context } from "aws-lambda";
import type { Credentials } from "../../src/types/Credentials.ts";
import { clearTokenCache, getClient } from "../../src/genesys/client.ts";

const orgA: Credentials = {
  host: "https://api.mypurecloud.com",
  clientId: "org-a-id",
  clientSecret: "org-a-secret",
};

const orgB: Credentials = {
  host: "https://api.mypurecloud.de",
  clientId: "org-b-id",
  clientSecret: "org-b-secret",
};

/** Records every grant and hands back a token derived from the client ID. */
function stubLogin(options: { expiresInMs?: number; token?: string } = {}) {
  const calls: string[] = [];

  const s = stub(
    platformClient.ApiClientClass.prototype,
    "loginClientCredentialsGrant",
    // deno-lint-ignore no-explicit-any
    function (this: any, clientId: string): Promise<any> {
      calls.push(clientId);
      return Promise.resolve({
        accessToken: options.token ?? `token-for-${clientId}`,
        tokenExpiryTime: Date.now() + (options.expiresInMs ?? 86_400_000),
      });
    },
  );

  return { calls, restore: () => s.restore() };
}

/** A Lambda context with the given budget, carrying orgA's credentials in clientContext. */
function ctx(remainingMs = 15_000, creds: Credentials = orgA): Context {
  return {
    clientContext: {
      "X-Genesys-API-Host": creds.host,
      "X-Genesys-API-Key": creds.clientId,
      "X-Genesys-API-Secret": creds.clientSecret,
    },
    getRemainingTimeInMillis: () => remainingMs,
  } as unknown as Context;
}

/** Clears module-scope token state so each case starts from a cold container. */
function reset() {
  clearTokenCache();
}

Deno.test("getClient authenticates and returns a usable client", async () => {
  reset();
  const login = stubLogin();

  try {
    const client = await getClient(ctx(), orgA);

    assertEquals(login.calls, ["org-a-id"]);
    assertEquals(typeof client.setEnvironment, "function");
  } finally {
    login.restore();
  }
});

Deno.test("getClient reuses a cached token on a warm container", async () => {
  reset();
  const login = stubLogin();

  try {
    await getClient(ctx(), orgA);
    await getClient(ctx(), orgA);
    await getClient(ctx(), orgA);

    // Three invocations, one grant: the point of the cache.
    assertEquals(login.calls, ["org-a-id"]);
  } finally {
    login.restore();
  }
});

Deno.test("getClient re-authenticates for different credentials", async () => {
  reset();
  const login = stubLogin();

  try {
    await getClient(ctx(), orgA);
    await getClient(ctx(), orgB);

    // A warm container serving two organizations must never share a token between them.
    assertEquals(login.calls, ["org-a-id", "org-b-id"]);
  } finally {
    login.restore();
  }
});

Deno.test("getClient re-authenticates when the client ID changes", async () => {
  reset();
  const login = stubLogin();

  try {
    await getClient(ctx(), orgA);
    await getClient(ctx(), { ...orgA, clientId: "rotated-id" });

    assertEquals(login.calls, ["org-a-id", "rotated-id"]);
  } finally {
    login.restore();
  }
});

Deno.test("getClient re-authenticates when only the client SECRET is rotated", async () => {
  reset();
  const secrets: string[] = [];

  const s = stub(
    platformClient.ApiClientClass.prototype,
    "loginClientCredentialsGrant",
    // deno-lint-ignore no-explicit-any
    function (_clientId: string, clientSecret: string): Promise<any> {
      secrets.push(clientSecret);
      return Promise.resolve({ accessToken: "token", tokenExpiryTime: Date.now() + 86_400_000 });
    },
  );

  try {
    await getClient(ctx(), orgA);
    await getClient(ctx(), { ...orgA, clientSecret: "rotated-secret" });

    // A revoked secret must not keep serving the token it minted. Keying the cache on host and
    // client ID alone silently reused the stale token here.
    assertEquals(secrets, ["org-a-secret", "rotated-secret"]);
  } finally {
    s.restore();
  }
});

Deno.test("getClient constructs a fresh instance per call, not the shared singleton", async () => {
  reset();
  const login = stubLogin();

  try {
    const first = await getClient(ctx(), orgA);
    const second = await getClient(ctx(), orgA);

    assertNotStrictEquals(first, second);
    assertNotStrictEquals(first, platformClient.ApiClient);
  } finally {
    login.restore();
  }
});

Deno.test("getClient re-authenticates once a token has expired", async () => {
  reset();
  const login = stubLogin({ expiresInMs: -1 });

  try {
    await getClient(ctx(), orgA);
    await getClient(ctx(), orgA);

    assertEquals(login.calls.length, 2);
  } finally {
    login.restore();
  }
});

Deno.test("getClient collapses concurrent logins into one grant", async () => {
  reset();
  const login = stubLogin();

  try {
    await Promise.all([getClient(ctx(), orgA), getClient(ctx(), orgA), getClient(ctx(), orgA)]);

    // A cold container serving parallel invocations must not stampede the token endpoint.
    assertEquals(login.calls, ["org-a-id"]);
  } finally {
    login.restore();
  }
});

Deno.test("clearTokenCache forces the next call to authenticate", async () => {
  reset();
  const login = stubLogin();

  try {
    await getClient(ctx(), orgA);
    clearTokenCache();
    await getClient(ctx(), orgA);

    assertEquals(login.calls, ["org-a-id", "org-a-id"]);
  } finally {
    login.restore();
  }
});

Deno.test("getClient rejects when the grant returns no token", async () => {
  reset();
  const s = stub(
    platformClient.ApiClientClass.prototype,
    "loginClientCredentialsGrant",
    // deno-lint-ignore no-explicit-any
    (): Promise<any> => Promise.resolve({ accessToken: "" }),
  );

  try {
    await assertRejects(() => getClient(ctx(), orgA), Error, "no access token");
  } finally {
    s.restore();
  }
});

Deno.test("a failed grant is not cached", async () => {
  reset();
  const failing = stub(
    platformClient.ApiClientClass.prototype,
    "loginClientCredentialsGrant",
    // deno-lint-ignore no-explicit-any
    (): Promise<any> => Promise.reject(new Error("invalid_client")),
  );

  try {
    await assertRejects(() => getClient(ctx(), orgA), Error, "invalid_client");
  } finally {
    failing.restore();
  }

  const login = stubLogin();

  try {
    // The next invocation must retry rather than serve a poisoned cache entry.
    await getClient(ctx(), orgA);
    assertEquals(login.calls, ["org-a-id"]);
  } finally {
    login.restore();
  }
});

Deno.test("getClient reads credentials from clientContext by default", async () => {
  reset();
  const login = stubLogin();

  try {
    await getClient(ctx(15_000, { ...orgA, clientId: "ctx-id" }));
    assertEquals(login.calls, ["ctx-id"]);
  } finally {
    login.restore();
  }
});

Deno.test("explicit credentials override clientContext", async () => {
  reset();
  const login = stubLogin();

  try {
    // Credentials arriving through the request template body rather than the headers.
    await getClient(ctx(15_000), { ...orgA, clientId: "from-body" });
    assertEquals(login.calls, ["from-body"]);
  } finally {
    login.restore();
  }
});
