# Standalone Google sign-in

Google sign-in is a separate Cloudflare deployment. Sites keeps its platform-managed ChatGPT authentication and its existing audience. Apple is not enabled in this implementation.

## Provider setup

In Google Auth Platform, create a **Web application** OAuth client named Loop Web. Register `http://localhost:8788` as a JavaScript origin and `http://localhost:8788/api/auth/callback/google` as a redirect URI. Once a standalone production URL exists, add its exact HTTPS origin and `/api/auth/callback/google` redirect as well. This route is handled by Better Auth, not the Sites `/callback` handler.

Add your own Google account and pilot accounts under **Audience → Test users** while the application is in testing mode. Download the credential JSON privately. If a secret was exposed, use Google Auth Platform → Clients → your client → **Add secret**, save the replacement, and disable the old secret. Do not put credential files in Git or screenshots.

References: [Google client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [credential rotation](https://support.google.com/cloud/answer/15549257?hl=en), [Better Auth Google provider](https://better-auth.com/docs/authentication/google).

The Google button image in `public/google-sign-in.png` is Google's pre-approved light button from [its branding guidelines](https://developers.google.com/identity/branding-guidelines). It is used only as the Google sign-in control, with its original aspect ratio preserved.

## Local preview

Run `npm run build:standalone`. The preview uses port 8788. Apply every `drizzle/*.sql` migration to the standalone local database using the generated `.loop/wrangler.json` configuration and `.loop/state` persistence directory.

Import the replacement download with `node scripts/configure-google.mjs <absolute-private-json-path>`. The importer never prints credentials. It writes ignored `.loop/google-secrets.json` and a local Wrangler variables file. Set the local `BETTER_AUTH_URL` to `http://localhost:8788`; it must match the exact origin you open, including hostname and port. Open the preview in a normal browser for Google's OAuth flow, as embedded webviews may be rejected by Google.

Run `npm run start:standalone`. The standalone app defaults to Live mode. Google sign-in appears only when its server configuration is complete. Existing Sites headers do not authenticate a standalone request. No passwords, email sign-up, or automatic account linking are enabled.

## Cloudflare deployment

1. Authenticate Wrangler using `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js login`.
2. Create a D1 database in your own Cloudflare account. Keep this separate from the existing Sites database.
3. Create ignored `.loop/cloudflare.json` with `accountId`, `databaseId`, and `workerName` set to your actual account/database IDs and chosen Worker name. Add `origin` after the first deployment returns its HTTPS URL. These fields are deployment identifiers, not Google secrets.
4. Build with `npm run build:standalone`, apply migrations with `npm run db:standalone`, then deploy with `npm run deploy:standalone`.
5. Register the returned HTTPS origin/callback in Google and set it as `origin` in the local configuration. Upload `.loop/google-secrets.json` using Wrangler `secret bulk` for the generated standalone configuration. Rebuild/redeploy to apply the correct origin. Never pass secret values as shell arguments or publish the JSON file.
6. Test a complete sign-in and sign-out in a normal browser before inviting anyone.

The initial deployment without provider secrets permits anonymous ride discovery and shows a setup notice; authenticated writes stay unavailable. Importing secrets or deploying successfully does not prove a Google account can sign in.

## Identity and data

The standalone deployment stores users, provider accounts, and sessions in dedicated `auth_*` tables. It uses stable application IDs, HttpOnly session cookies, explicit trusted origins, server-side session validation, encrypted OAuth tokens, and persistent atomic authentication rate limits. The existing ownership and moderator checks remain in force.

Existing Sites records and moderator identities are not automatically transferred or linked by email. Preserve the old database and plan an explicit ownership migration before moving real records. The standalone moderator allowlist must contain its own verified application user IDs. Do not grant privileges to the first account or based on a submitted role.

Deploy only `.loop/wrangler.json` to the standalone host. Sites deployments use their own configuration with `LOOP_AUTH_MODE=sites`; standalone requires `LOOP_AUTH_MODE=standalone`. Missing/unknown modes fail closed. Local provider files stay under ignored `.loop/`, outside source and build archives.
