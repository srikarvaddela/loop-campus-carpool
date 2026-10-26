"use client";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, Scale } from "lucide-react";
import type { Appeal } from "../lib/types";
import { ReportsPanel, type DemoReports } from "./community-panels";

export type DemoAppeals = {
  appeals: Appeal[];
  review: (id: string, decision: "approve" | "deny", notes: string) => void;
};
export function ReviewCenter({
  isModerator,
  demoReports,
  demoAppeals,
  onChanged,
}: {
  isModerator: boolean;
  demoReports?: DemoReports;
  demoAppeals?: DemoAppeals;
  onChanged: () => void | Promise<void>;
}) {
  const [tab, setTab] = useState("reports");
  return (
    <>
      <div className="review-center-tabs">
        <button
          className={tab === "reports" ? "selected" : ""}
          onClick={() => setTab("reports")}
        >
          Reports
        </button>
        <button
          className={tab === "appeals" ? "selected" : ""}
          onClick={() => setTab("appeals")}
        >
          Ride appeals
        </button>
      </div>
      {tab === "reports" ? (
        <ReportsPanel
          isModerator={isModerator}
          demo={demoReports}
          onChanged={onChanged}
        />
      ) : (
        <AppealsPanel
          isModerator={isModerator}
          demo={demoAppeals}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

export function AppealForm({
  rideId,
  destination,
  demo,
  onSubmit,
  onSaved,
}: {
  rideId: string;
  destination: string;
  demo: boolean;
  onSubmit?: (details: string) => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const details = String(new FormData(e.currentTarget).get("details")).trim();
    try {
      if (demo) onSubmit?.(details);
      else {
        const res = await fetch("/api/appeals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "submit", rideId, details }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok)
          throw new Error(data.error || "Couldn't submit your appeal.");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit your appeal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="post-form" onSubmit={submit}>
      <div className="profile-intro">
        <Scale size={25} />
        <p>
          Request a review of the removal of your ride to{" "}
          <strong>{destination}</strong>.
        </p>
      </div>
      <label>
        Why should the removal be reconsidered?
        <textarea
          name="details"
          required
          minLength={20}
          maxLength={2000}
          rows={5}
          placeholder="Explain what you believe was incorrect and any relevant context."
        />
      </label>
      <div className="campus-disclosure">
        <Scale size={18} />
        <p>
          One appeal is allowed per removal decision for an upcoming ride.
          Approval restores the listing; it does not restore cancelled seats or
          reopen their conversations. Riders must request seats again.
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
        Submit appeal
      </button>
    </form>
  );
}

function AppealsPanel({
  isModerator,
  demo,
  onChanged,
}: {
  isModerator: boolean;
  demo?: DemoAppeals;
  onChanged: () => void | Promise<void>;
}) {
  const [review, setReview] = useState(false);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function load() {
    const res = await fetch(`/api/appeals${review ? "?review=true" : ""}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { appeals: Appeal[]; error?: string };
    if (!res.ok) throw new Error(data.error || "Couldn't load appeals.");
    setAppeals(data.appeals);
  }
  useEffect(() => {
    if (demo) return;
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/appeals${review ? "?review=true" : ""}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as {
          appeals: Appeal[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Couldn't load appeals.");
        if (active) setAppeals(data.appeals);
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
  async function decide(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const decision = String(form.get("decision")) as "approve" | "deny";
    const notes = String(form.get("notes")).trim();
    setBusy(id);
    setError("");
    try {
      if (demo) demo.review(id, decision, notes);
      else {
        const res = await fetch("/api/appeals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "review",
            appealId: id,
            decision,
            notes,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Couldn't review appeal.");
        await load();
      }
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't review appeal.");
    } finally {
      setBusy("");
    }
  }
  const shown = demo ? demo.appeals : appeals;
  return (
    <section>
      <div className="pills">
        <button
          className={!review ? "pill selected" : "pill"}
          onClick={() => setReview(false)}
        >
          My appeals
        </button>
        {isModerator && (
          <button
            className={review ? "pill selected" : "pill"}
            onClick={() => setReview(true)}
          >
            Appeal queue
          </button>
        )}
        {!demo && (
          <button
            className="icon-button"
            aria-label="Refresh appeals"
            onClick={() =>
              load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>
      <p className="reports-intro">
        {review
          ? "Review the driver's explanation. Restoring a listing leaves previous bookings cancelled."
          : "Track appeals for your removed rides. Submit an appeal from the removed ride in My trips."}
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="chat-empty">
          <LoaderCircle className="spin" />
          Loading appeals…
        </div>
      ) : !shown.length ? (
        <div className="chat-empty">
          <Scale size={30} />
          <h3>{review ? "Appeal queue clear." : "No appeals yet."}</h3>
          <p>
            {review
              ? "New removal appeals will appear here."
              : "You can appeal an upcoming removed ride from My trips."}
          </p>
        </div>
      ) : (
        <div className="report-list">
          {shown.map((a) => (
            <article className="report-card" key={a.id}>
              <div className="report-heading">
                <strong>{a.driverName}</strong>
                <span
                  className={
                    "status " +
                    (a.status === "pending"
                      ? "pending"
                      : a.status === "approved"
                        ? "accepted"
                        : "declined")
                  }
                >
                  {a.status}
                </span>
              </div>
              <p className="report-route">
                {a.origin} → {a.destination}
              </p>
              <p className="report-description">{a.details}</p>
              {a.status !== "pending" ? (
                <div className="resolution-note">
                  <strong>
                    {a.status === "approved"
                      ? "Listing restored · seats remain cancelled"
                      : "Removal upheld"}
                  </strong>
                  <p>{a.decisionNotes}</p>
                </div>
              ) : review ? (
                <form
                  className="review-form"
                  onSubmit={(e) => void decide(e, a.id)}
                >
                  <label>
                    Appeal decision
                    <select name="decision">
                      <option value="deny">Uphold removal</option>
                      <option value="approve">
                        Restore listing · seats stay cancelled
                      </option>
                    </select>
                  </label>
                  <label>
                    Explanation for the driver
                    <textarea
                      name="notes"
                      required
                      minLength={5}
                      maxLength={500}
                      rows={2}
                    />
                  </label>
                  <label className="review-confirm">
                    <input type="checkbox" required />I reviewed this appeal and
                    confirm this decision.
                  </label>
                  <button className="primary" disabled={!!busy}>
                    {busy === a.id ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    Save appeal decision
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
