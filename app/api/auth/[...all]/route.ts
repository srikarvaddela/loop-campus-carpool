import { authConfig, standaloneOrigin } from "../../../../lib/auth-config";
import { standaloneAuth } from "../../../../lib/standalone-auth";
export const dynamic = "force-dynamic";
async function handle(req: Request) {
  // Drain rejected POST bodies too: the local Worker proxy otherwise corrupts the next keep-alive request.
  let body: string | undefined;
  if (req.method === "POST") {
    try {
      body = await req.text();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
  }
  const config = authConfig();
  if (config.mode !== "standalone")
    return Response.json({ error: "Not found." }, { status: 404 });
  if (!config.providers.length)
    return Response.json(
      { error: "Sign-in has not been configured yet." },
      { status: 503 },
    );
  // These browser auth POSTs must originate on Loop, including a first sign-in with no cookie.
  // Google's authorization callback is a GET and is validated by Better Auth's OAuth state check.
  if (req.method === "POST" && req.headers.get("origin") !== standaloneOrigin())
    return Response.json(
      { error: "Request origin is not allowed." },
      { status: 403 },
    );
  try {
    const response = await standaloneAuth().handler(
      body === undefined ? req : new Request(req.url, { method: req.method, headers: req.headers, body }),
    );
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return Response.json(
      { error: "Sign-in could not finish. Please try again." },
      { status: 503 },
    );
  }
}
export const GET = handle;
export const POST = handle;
