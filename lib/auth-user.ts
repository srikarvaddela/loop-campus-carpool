import { headers } from "next/headers";
import { getChatGPTUser, type ChatGPTUser } from "../app/chatgpt-auth";
import { authConfig } from "./auth-config";
import { standaloneAuth } from "./standalone-auth";

export async function getAppUser(): Promise<ChatGPTUser | null> {
  const config = authConfig();
  if (config.mode === "sites") return getChatGPTUser();
  if (config.mode !== "standalone" || !config.providers.length) return null;
  const session = await standaloneAuth().api.getSession({
    headers: await headers(),
  });
  if (!session) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    displayName: session.user.name || session.user.email,
    fullName: session.user.name || null,
  };
}
