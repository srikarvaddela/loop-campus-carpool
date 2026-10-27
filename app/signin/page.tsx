import { authConfig } from "../../lib/auth-config";
import { SignInOptions } from "../auth-controls";
export const dynamic = "force-dynamic";
export default function SignIn() {
  return (
    <main className="login-page">
      <section className="login-card">
        <a href="/?mode=live" className="login-home">
          ← Back to Loop
        </a>
        <div className="section-kicker">YOUR CAMPUS. YOUR PEOPLE.</div>
        <h1>Welcome to Loop.</h1>
        <p>Sign in to post rides, request seats, and coordinate your trip.</p>
        <SignInOptions config={authConfig()} />
        <p className="login-note">
          Your campus profile is self-reported. Sign-in does not verify student
          enrollment.
        </p>
      </section>
    </main>
  );
}
