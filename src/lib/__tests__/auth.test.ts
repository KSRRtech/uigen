// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

// Must mock before importing auth.ts
vi.mock("server-only", () => ({}));

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

// Dynamic import after mocks are registered
const { createSession, getSession, deleteSession, verifySession } =
  await import("@/lib/auth");

// ---- helpers ----

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

async function makeValidToken(
  payload: { userId: string; email: string },
  expiresIn = "7d"
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return new SignJWT({ ...payload, expiresAt })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

function makeNextRequest(token?: string) {
  const url = "http://localhost/api/test";
  const headers = new Headers();
  if (token) headers.set("cookie", `auth-token=${token}`);
  return new NextRequest(url, { headers });
}

// ---- tests ----

describe("createSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sets an httpOnly cookie named auth-token", async () => {
    await createSession("user-1", "test@example.com");

    expect(mockCookieStore.set).toHaveBeenCalledOnce();
    const [name, _token, options] = mockCookieStore.set.mock.calls[0];

    expect(name).toBe("auth-token");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  test("cookie expires approximately 7 days from now", async () => {
    const before = new Date();
    await createSession("user-1", "test@example.com");
    const after = new Date();

    const [, , options] = mockCookieStore.set.mock.calls[0];
    const expires: Date = options.expires;

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expires.getTime()).toBeGreaterThanOrEqual(
      before.getTime() + sevenDaysMs - 1000
    );
    expect(expires.getTime()).toBeLessThanOrEqual(
      after.getTime() + sevenDaysMs + 1000
    );
  });

  test("token encodes userId and email", async () => {
    await createSession("user-42", "hello@example.com");

    const [, token] = mockCookieStore.set.mock.calls[0];
    // Decode without verification to inspect claims
    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    );

    expect(payload.userId).toBe("user-42");
    expect(payload.email).toBe("hello@example.com");
  });
});

describe("getSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns null when no cookie is present", async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns the session payload for a valid token", async () => {
    const token = await makeValidToken({
      userId: "user-1",
      email: "test@example.com",
    });
    mockCookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-1");
    expect(session?.email).toBe("test@example.com");
  });

  test("returns null for a tampered token", async () => {
    mockCookieStore.get.mockReturnValue({ value: "not.a.valid.jwt" });

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for an expired token", async () => {
    const token = await makeValidToken(
      { userId: "user-1", email: "test@example.com" },
      "-1s"
    );
    mockCookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for a token signed with the wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await new SignJWT({
      userId: "user-1",
      email: "x@y.com",
      expiresAt: new Date(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(wrongSecret);

    mockCookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null when cookie value is an empty string", async () => {
    mockCookieStore.get.mockReturnValue({ value: "" });

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("reads from the auth-token cookie name", async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    await getSession();

    expect(mockCookieStore.get).toHaveBeenCalledWith("auth-token");
  });

  test("returns all session fields from the token payload", async () => {
    const token = await makeValidToken({
      userId: "user-123",
      email: "full@example.com",
    });
    mockCookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).toMatchObject({
      userId: "user-123",
      email: "full@example.com",
    });
    expect(session?.expiresAt).toBeDefined();
  });

  test("returns null for a structurally valid JWT with the wrong algorithm", async () => {
    // none algorithm — jose rejects it as unsigned
    const [header, payload] = [
      Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
        "base64url"
      ),
      Buffer.from(
        JSON.stringify({ userId: "user-1", email: "x@y.com", exp: 9999999999 })
      ).toString("base64url"),
    ];
    const unsignedToken = `${header}.${payload}.`;

    mockCookieStore.get.mockReturnValue({ value: unsignedToken });

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for a token with a truncated signature", async () => {
    const token = await makeValidToken({
      userId: "user-1",
      email: "test@example.com",
    });
    const truncated = token.slice(0, -5); // lop off the end of the signature

    mockCookieStore.get.mockReturnValue({ value: truncated });

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for a token whose payload has been tampered with", async () => {
    const token = await makeValidToken({
      userId: "user-1",
      email: "test@example.com",
    });

    // Replace the payload segment with a different base64url-encoded object
    const [header, , signature] = token.split(".");
    const fakeClaims = Buffer.from(
      JSON.stringify({ userId: "attacker", email: "evil@example.com", exp: 9999999999 })
    ).toString("base64url");
    const tampered = `${header}.${fakeClaims}.${signature}`;

    mockCookieStore.get.mockReturnValue({ value: tampered });

    const session = await getSession();

    expect(session).toBeNull();
  });
});

describe("deleteSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("deletes the auth-token cookie", async () => {
    await deleteSession();

    expect(mockCookieStore.delete).toHaveBeenCalledOnce();
    expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
  });
});

describe("verifySession", () => {
  test("returns null when no auth-token cookie is on the request", async () => {
    const req = makeNextRequest();

    const session = await verifySession(req);

    expect(session).toBeNull();
  });

  test("returns the session payload for a valid token on the request", async () => {
    const token = await makeValidToken({
      userId: "user-99",
      email: "req@example.com",
    });
    const req = makeNextRequest(token);

    const session = await verifySession(req);

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-99");
    expect(session?.email).toBe("req@example.com");
  });

  test("returns null for an invalid token on the request", async () => {
    const req = makeNextRequest("bad.token.here");

    const session = await verifySession(req);

    expect(session).toBeNull();
  });

  test("returns null for an expired token on the request", async () => {
    const token = await makeValidToken(
      { userId: "user-1", email: "test@example.com" },
      "-1s"
    );
    const req = makeNextRequest(token);

    const session = await verifySession(req);

    expect(session).toBeNull();
  });
});
