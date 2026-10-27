import assert from "node:assert/strict";
import { serializeSignedCookie } from "better-call";
const base = process.env.LOOP_TEST_URL;
if (!base || new URL(base).hostname !== "127.0.0.1")
  throw new Error("Auth tests require an isolated loopback Worker.");
const secret = "loop-integration-test-secret-not-a-real-credential-00000000";
let checks = 0;
function eq(actual, expected, label) {
  checks++;
  assert.deepEqual(actual, expected, label);
}
const headers = {
  "content-type": "application/json",
  Origin: base,
  "cf-connecting-ip": "192.0.2.25",
};
async function request(route, body, cookie, extra = {}) {
  const res = await fetch(`${base}${route}`, {
    method: body === undefined ? "GET" : "POST",
    redirect: "manual",
    headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { res, data };
}
const spoof = {
  "oai-authenticated-user-id": "loop-test-moderator",
  "oai-authenticated-user-email": "spoof@loop.test",
};
const config = await request("/api/auth/config");
eq(config.res.status, 200, "auth configuration readable");
eq(config.data.mode, process.env.LOOP_TEST_AUTH_MODE, "auth mode is explicit");
const anonymous = await request("/api/loop", undefined, undefined, spoof);
eq(
  anonymous.data.user,
  null,
  "Sites headers cannot forge a standalone identity",
);
eq(anonymous.data.isModerator, false, "forged moderator identity ignored");
eq(
  (
    await request(
      "/api/profile",
      { displayName: "Forged", campus: "Campus" },
      undefined,
      spoof,
    )
  ).res.status,
  401,
  "forged identity cannot write",
);
if (process.env.LOOP_TEST_AUTH_READY !== "true") {
  eq(config.data.providers, [], "unconfigured providers remain hidden");
  eq(
    (
      await request("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "/",
      })
    ).res.status,
    config.data.mode === "standalone" ? 503 : 404,
    "unconfigured sign-in rejected",
  );
  console.log(`PASS: ${checks} disabled-auth assertions.`);
} else {
  eq(config.data.providers, ["google"], "only configured provider advertised");
  eq(
    JSON.stringify(config.data).includes("secret"),
    false,
    "no secret material in public config",
  );
  const driverCookie = (
    await serializeSignedCookie(
      "better-auth.session_token",
      "loop-driver-session",
      secret,
      { path: "/" },
    )
  ).split(";")[0];
  const riderCookie = (
    await serializeSignedCookie(
      "better-auth.session_token",
      "loop-rider-session",
      secret,
      { path: "/" },
    )
  ).split(";")[0];
  const expiredCookie = (
    await serializeSignedCookie(
      "better-auth.session_token",
      "loop-expired-session",
      secret,
      { path: "/" },
    )
  ).split(";")[0];
  const driver = await request("/api/loop", undefined, driverCookie);
  eq(driver.res.status, 200, "signed session accepted");
  eq(
    driver.data.user?.userId,
    "oauth-driver",
    "session determines stable app identity",
  );
  eq(driver.data.isModerator, false, "first session gets no moderator role");
  eq(
    (await request("/api/loop", undefined, driverCookie, spoof)).data.user
      ?.userId,
    "oauth-driver",
    "headers cannot replace signed user",
  );
  eq(
    (await request("/api/loop", undefined, "better-auth.session_token=forged"))
      .data.user,
    null,
    "invalid cookie rejected",
  );
  eq(
    (await request("/api/loop", undefined, expiredCookie)).data.user,
    null,
    "expired session rejected",
  );
  eq(
    (await request("/api/auth/get-session", undefined, driverCookie)).data?.user
      ?.id,
    "oauth-driver",
    "auth endpoint validates session",
  );
  eq(
    (
      await request("/api/auth/sign-in/email", {
        email: "driver@loop.test",
        password: "unused",
      })
    ).res.status,
    400,
    "password sign-in disabled",
  );
  eq(
    (
      await request("/api/auth/sign-up/email", {
        email: "new@loop.test",
        password: "unused",
        name: "Fake",
      })
    ).res.status,
    400,
    "password account creation disabled",
  );
  eq(
    (
      await request(
        "/api/auth/sign-in/social",
        { provider: "google", callbackURL: `${base}/?mode=live` },
        undefined,
        { Origin: "https://outside.invalid" },
      )
    ).res.status,
    403,
    "cross-origin sign-in blocked",
  );
  eq(
    (
      await request("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "https://outside.invalid",
      })
    ).res.status,
    403,
    "external return path blocked",
  );
  const started = await request("/api/auth/sign-in/social", {
    provider: "google",
    callbackURL: `${base}/?mode=live`,
  });
  eq(
    started.res.status,
    200,
    "Google authorization begins without contacting Google",
  );
  const target = new URL(started.data.url);
  eq(target.origin, "https://accounts.google.com", "redirect points to Google");
  eq(
    target.searchParams.get("client_id"),
    "loop-integration.apps.googleusercontent.com",
    "configured client used",
  );
  eq(
    target.searchParams.get("redirect_uri"),
    `${base}/api/auth/callback/google`,
    "callback matches deployment origin",
  );
  eq(
    target.searchParams.get("response_type"),
    "code",
    "authorization code flow used",
  );
  eq(Boolean(target.searchParams.get("state")), true, "state generated");
  eq(
    Boolean(target.searchParams.get("code_challenge")),
    true,
    "PKCE challenge generated",
  );
  eq(
    target.searchParams.get("code_challenge_method"),
    "S256",
    "PKCE uses SHA256",
  );
  const stateCookie = started.res.headers.get("set-cookie") || "";
  eq(
    stateCookie.toLowerCase().includes("httponly"),
    true,
    "OAuth cookie is HttpOnly",
  );
  eq(
    target.searchParams
      .get("scope")
      .split(" ")
      .every((s) => ["openid", "email", "profile"].includes(s)),
    true,
    "only sign-in scopes requested",
  );
  const badCallback = await request(
    "/api/auth/callback/google?state=invalid&code=invalid",
  );
  eq(
    [302, 303, 400, 401, 403].includes(badCallback.res.status),
    true,
    "callback without valid state rejected",
  );
  eq(
    (
      await request(
        "/api/profile",
        {
          displayName: "OAuth Driver",
          campus: "OAuth Campus",
          role: "moderator",
        },
        driverCookie,
      )
    ).res.status,
    200,
    "signed user can create profile",
  );
  eq(
    (await request("/api/profile", undefined, riderCookie)).data.profile,
    null,
    "profile isolated by session",
  );
  eq(
    (await request("/api/profile", undefined, driverCookie)).data.isModerator,
    false,
    "submitted role ignored",
  );
  const ride = {
    origin: "OAuth Campus",
    destination: "OAuth Airport",
    departure: new Date(Date.now() + 86400000).toISOString(),
    seats: 1,
    priceCents: 1000,
    car: "Demo Car",
    notes: "Local auth test.",
  };
  eq(
    (await request("/api/loop", { action: "post", ride }, driverCookie)).res
      .status,
    201,
    "signed driver can post",
  );
  const rides = (await request("/api/loop", undefined, driverCookie)).data
    .rides;
  const posted = rides.find((r) => r.origin === ride.origin);
  eq(Boolean(posted), true, "signed driver sees own ride");
  eq(posted.driverId, "oauth-driver", "ride ownership uses signed session");
  eq(
    (
      await request(
        "/api/loop",
        { action: "cancelRide", rideId: posted.id },
        riderCookie,
      )
    ).res.status,
    409,
    "another session cannot cancel ride",
  );
  eq(
    (
      await request(
        "/api/loop",
        {
          action: "request",
          rideId: posted.id,
          expectedVersion: posted.version,
        },
        driverCookie,
      )
    ).res.status,
    409,
    "signed driver cannot self-book",
  );
  eq(
    (
      await request("/api/auth/sign-out", {}, driverCookie, {
        Origin: "https://outside.invalid",
      })
    ).res.status,
    403,
    "cross-origin sign-out blocked",
  );
  eq(
    (await request("/api/auth/sign-out", {}, driverCookie)).res.status,
    200,
    "sign-out succeeds",
  );
  eq(
    (await request("/api/loop", undefined, driverCookie)).data.user,
    null,
    "sign-out revokes server session",
  );
  eq(
    (
      await request(
        "/api/profile",
        { displayName: "Expired", campus: "Campus" },
        driverCookie,
      )
    ).res.status,
    401,
    "revoked cookie cannot write",
  );
  eq(
    (await request("/api/loop", undefined, riderCookie)).data.user?.userId,
    "oauth-rider",
    "other session remains valid",
  );
  const quotaResponses = await Promise.all(
    Array.from({ length: 8 }, () =>
      request(
        "/api/auth/sign-in/social",
        { provider: "google", callbackURL: `${base}/?mode=live` },
        undefined,
        { "cf-connecting-ip": "192.0.2.99" },
      ),
    ),
  );
  eq(
    quotaResponses.filter((r) => r.res.status === 200).length,
    3,
    "auth quota is atomic under concurrent requests",
  );
  eq(
    quotaResponses.filter((r) => r.res.status === 429).length,
    5,
    "auth quota rejects excess requests",
  );
  eq(
    Number(
      quotaResponses
        .find((r) => r.res.status === 429)
        ?.res.headers.get("x-retry-after"),
    ) > 0,
    true,
    "auth quota returns retry delay",
  );
  console.log(
    `PASS: ${checks} standalone auth assertions. Real Google consent remains a separate manual check.`,
  );
}
