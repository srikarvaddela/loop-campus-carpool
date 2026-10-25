"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  Flag,
  GraduationCap,
  LoaderCircle,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import type { Profile, Report } from "../lib/types";

export function ProfileForm({
  profile,
  demo,
  onSaved,
}: {
  profile: Profile | null;
  demo: boolean;
  onSaved: (p: Profile) => void | Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const p = {
      displayName: String(form.get("displayName")).trim(),
      campus: String(form.get("campus")).trim(),
    };
    try {
      if (!demo) {
        const res = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok)
          throw new Error(data.error || "Couldn't save your profile.");
      }
      await onSaved(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your profile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="post-form" onSubmit={save}>
      <div className="profile-intro">
        <GraduationCap size={25} />
        <p>Introduce yourself to the people sharing your journey.</p>
      </div>
      <label>
        Name shown to riders
        <input
          name="displayName"
          required
          minLength={2}
          maxLength={60}
          defaultValue={profile?.displayName || ""}
          placeholder="Your preferred name"
        />
      </label>
      <label>
        Your campus
        <input
          name="campus"
          required
          minLength={3}
          maxLength={100}
          defaultValue={profile?.campus || ""}
          placeholder="e.g. Example University"
        />
      </label>
      <div className="campus-disclosure">
        <ShieldCheck size={18} />
        <p>
          Your name and campus are self-reported. Loop has not verified student
          enrollment. Your campus is shown on new rides you post.
        </p>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <CheckCircle2 size={16} />
        )}
        Save profile
      </button>
    </form>
  );
}

export function ReportForm({
  destination,
  demo,
  onSubmit,
  onSaved,
  rideId,
}: {
  destination: string;
  demo: boolean;
  onSubmit?: (reason: string, details: string) => void;
  onSaved: () => void;
  rideId: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <ReportFields
      destination={destination}
      rideId={rideId}
      busy={busy}
      error={error}
      submit={async (reason, details, rideId) => {
        setBusy(true);
        setError("");
        try {
          if (demo) {
            onSubmit?.(reason, details);
          } else {
            const res = await fetch("/api/reports", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rideId, reason, details }),
            });
            const data = (await res.json()) as { error?: string };
            if (!res.ok)
              throw new Error(data.error || "Couldn't submit your report.");
          }
          onSaved();
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Couldn't submit your report.",
          );
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function ReportFields({
  destination,
  busy,
  error,
  submit,
  rideId,
}: {
  destination: string;
  busy: boolean;
  error: string;
  rideId?: string;
  submit: (reason: string, details: string, rideId?: string) => Promise<void>;
}) {
  return (
    <form
      className="post-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void submit(String(f.get("reason")), String(f.get("details")), rideId);
      }}
    >
      <p className="form-intro">
        Report a concern about the ride to <strong>{destination}</strong>. Your
        report is shared with moderators, not the driver.
      </p>
      <label>
        Reason
        <select name="reason">
          {["Unsafe behavior", "Misleading listing", "Spam", "Other"].map(
            (r) => (
              <option key={r}>{r}</option>
            ),
          )}
        </select>
      </label>
      <label>
        What happened?
        <textarea
          name="details"
          required
          minLength={10}
          maxLength={1500}
          rows={5}
          placeholder="Describe the issue so a moderator can review it."
        />
      </label>
      <p className="fine-print">
        Reports do not automatically remove a ride. Review may take time; this
        form does not provide emergency assistance.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Flag size={16} />
        )}
        Submit report
      </button>
    </form>
  );
}

type DemoReports = {
  reports: (Report & { isMine?: boolean })[];
  resolve: (id: string, resolution: "hide" | "dismiss", notes: string) => void;
};
export function ReportsPanel({
  isModerator,
  demo,
  onChanged,
}: {
  isModerator: boolean;
  demo?: DemoReports;
  onChanged: () => void | Promise<void>;
}) {
  const [review, setReview] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function load() {
    const res = await fetch(`/api/reports${review ? "?review=true" : ""}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { reports: Report[]; error?: string };
    if (!res.ok) throw new Error(data.error || "Couldn't load reports.");
    setReports(data.reports);
  }
  useEffect(() => {
    if (demo) return;
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/reports${review ? "?review=true" : ""}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as {
          reports: Report[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Couldn't load reports.");
        if (active) setReports(data.reports);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [review, !!demo]);
  const shown = demo
    ? review
      ? demo.reports
      : demo.reports.filter((r) => r.isMine)
    : reports;
  async function resolve(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const resolution = String(f.get("resolution")) as "hide" | "dismiss";
    const notes = String(f.get("notes")).trim();
    setBusy(id);
    setError("");
    try {
      if (demo) demo.resolve(id, resolution, notes);
      else {
        const res = await fetch("/api/moderation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId: id, resolution, notes }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Couldn't resolve report.");
        await load();
      }
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't resolve report.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="reports-panel">
      <div className="pills">
        <button
          className={!review ? "pill selected" : "pill"}
          onClick={() => setReview(false)}
        >
          My reports
        </button>
        {isModerator && (
          <button
            className={review ? "pill selected" : "pill"}
            onClick={() => setReview(true)}
          >
            Moderator queue
          </button>
        )}
        {!demo && (
          <button
            className="icon-button"
            aria-label="Refresh reports"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>
      <p className="reports-intro">
        {review
          ? "Review concerns fairly. Removing a ride cancels its seat requests and closes new messages."
          : "Track the reports you submitted. Other members cannot read your reports."}
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="chat-empty">
          <LoaderCircle className="spin" />
          Loading reports…
        </div>
      ) : !shown.length ? (
        <div className="chat-empty">
          <ShieldCheck size={30} />
          <h3>{review ? "Queue clear." : "No reports yet."}</h3>
          <p>
            {review
              ? "New concerns will appear here for review."
              : "Use Report this ride in a ride’s details if something seems wrong."}
          </p>
        </div>
      ) : (
        <div className="report-list">
          {shown.map((r) => (
            <article className="report-card" key={r.id}>
              <div className="report-heading">
                <strong>{r.reason}</strong>
                <span
                  className={
                    "status " + (r.status === "open" ? "pending" : "accepted")
                  }
                >
                  {r.status}
                </span>
              </div>
              <p className="report-route">
                {r.origin} → {r.destination}
              </p>
              <p className="report-description">{r.details}</p>
              {r.status === "resolved" ? (
                <div className="resolution-note">
                  <strong>
                    {r.resolution === "hide"
                      ? "Ride removed"
                      : "Report dismissed"}
                  </strong>
                  <p>{r.resolutionNotes}</p>
                </div>
              ) : review ? (
                <form
                  className="review-form"
                  onSubmit={(e) => void resolve(e, r.id)}
                >
                  <label>
                    Decision
                    <select name="resolution">
                      <option value="dismiss">
                        Dismiss report — keep ride
                      </option>
                      <option value="hide">
                        Remove ride and cancel bookings
                      </option>
                    </select>
                  </label>
                  <label>
                    Explanation for the reporter
                    <textarea
                      name="notes"
                      required
                      minLength={5}
                      maxLength={500}
                      rows={2}
                    />
                  </label>
                  <label className="review-confirm">
                    <input type="checkbox" required />I reviewed this report and
                    confirm this decision.
                  </label>
                  <button className="primary" disabled={!!busy}>
                    {busy === r.id ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    Save decision
                  </button>
                </form>
              ) : (
                <p className="report-pending">Awaiting moderator review</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
