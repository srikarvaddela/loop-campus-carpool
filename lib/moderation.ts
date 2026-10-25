import { env } from "cloudflare:workers";
// Never grant the first visitor a role; moderator identities are explicit runtime configuration.
export function isModerator(userId: string | undefined) {
  return (
    !!userId &&
    (env.LOOP_MODERATOR_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .includes(userId)
  );
}
