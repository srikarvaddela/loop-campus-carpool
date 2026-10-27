"use client";
import { useState } from "react";
import { LoaderCircle, LogIn, LogOut } from "lucide-react";
import type { AuthConfig } from "../lib/types";

export function SignInOptions({ config }: { config?: AuthConfig }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function google() {
    setBusy(true);
    setError("");
    try {
      const { createAuthClient } = await import("better-auth/client");
      const result = await createAuthClient({
        baseURL: window.location.origin,
      }).signIn.social({ provider: "google", callbackURL: "/" });
      if (result.error)
        throw new Error("Google sign-in could not start. Please try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in could not start.");
      setBusy(false);
    }
  }
  return (
    <>
      {config?.mode === "sites" ? (
        <a
          className="primary full"
          href="/signin-with-chatgpt?return_to=%2F"
          target="_top"
        >
          <LogIn size={17} />
          Sign in with ChatGPT
        </a>
      ) : config?.providers.includes("google") ? (
        <button
          className="google-sign-in"
          disabled={busy}
          onClick={() => void google()}
        >
          {busy ? (
            <>
              <LoaderCircle className="spin" size={18} /> Opening Google…
            </>
          ) : (
            <img src="/google-sign-in.png" alt="Sign in with Google" />
          )}
        </button>
      ) : (
        <p role="status">
          Sign-in is being configured. Please check back shortly.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function SignOutControl({ config }: { config?: AuthConfig }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (config?.mode === "sites")
    return (
      <a
        className="text-button"
        href="/signout-with-chatgpt?return_to=%2F"
        target="_top"
      >
        Sign out
      </a>
    );
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const { createAuthClient } = await import("better-auth/client");
      const result = await createAuthClient({
        baseURL: window.location.origin,
      }).signOut();
      if (result.error) throw new Error("Please try signing out again.");
      window.location.assign("/");
    } catch {
      setError("Sign-out failed. Please retry.");
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => void signOut()}
        aria-label="Sign out"
      >
        <LogOut size={15} />
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
