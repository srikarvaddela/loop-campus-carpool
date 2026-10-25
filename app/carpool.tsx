"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Compass,
  Leaf,
  MapPin,
  Menu,
  Plus,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Inbox,
  LoaderCircle,
  LogIn,
  SlidersHorizontal,
  MessageCircle,
  Flag,
  GraduationCap,
} from "lucide-react";
import type {
  Booking,
  Ride,
  Snapshot,
  Message,
  Profile,
  Report,
} from "../lib/types";
import TripChat from "./trip-chat";
import { ProfileForm, ReportForm, ReportsPanel } from "./community-panels";
import { demoSnapshot } from "../lib/demo";
import { actionSchema } from "../lib/validation";
import { useRideSearch } from "../lib/use-ride-search";

type View = "find" | "trips" | "requests";
type Modal =
  | { type: "post" }
  | { type: "ride"; id: string }
  | { type: "help" }
  | { type: "profile" }
  | { type: "report"; rideId: string }
  | { type: "reports" }
  | { type: "chat"; bookingId: string }
  | { type: "confirm"; action: Record<string, unknown>; message: string }
  | null;
const empty: Snapshot = { rides: [], bookings: [], user: null };
const money = (c: number) =>
  c === 0
    ? "Free"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(c / 100);
const dateLabel = (v: string) =>
  new Date(v).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const timeLabel = (v: string) =>
  new Date(v).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
const initials = (v: string) =>
  v
    .split(/[ @]/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
const endName = (v: string) => v.split(" · ").at(-1) || v;
const localDate = (v: string) => {
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function RouteArt() {
  return (
    <svg
      className="route-art"
      viewBox="0 0 500 280"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M-20 221L505 32M58 300L330-20M-20 71L506 261M128-10L448 300"
        stroke="#D6E0D1"
        strokeWidth="30"
      />
      <path
        d="M-20 221L505 32M58 300L330-20M-20 71L506 261M128-10L448 300"
        stroke="#F5F5E9"
        strokeWidth="21"
      />
      <path
        d="M420-20C350 70 490 110 431 300"
        stroke="#C8DCCE"
        strokeWidth="45"
      />
      <path
        d="M103 211C120 158 164 190 207 141S292 113 341 74"
        stroke="#1E654A"
        strokeWidth="5"
        strokeDasharray="8 10"
        strokeLinecap="round"
      />
      <circle cx="104" cy="211" r="15" fill="#fff" />
      <circle cx="104" cy="211" r="7" fill="#25684D" />
      <path
        d="M341 46c-14 0-25 10-25 24 0 19 25 38 25 38s25-19 25-38c0-14-11-24-25-24Z"
        fill="#25684D"
      />
      <circle cx="341" cy="70" r="8" fill="#E9EFDA" />
      <g transform="translate(202 119) rotate(-31)">
        <rect
          x="0"
          y="0"
          width="52"
          height="29"
          rx="9"
          fill="#E7B94F"
          stroke="#6F633B"
          strokeWidth="2"
        />
        <rect x="13" y="4" width="23" height="21" rx="5" fill="#F8EBC2" />
        <path d="M19 4v21M34 4v21" stroke="#B69D5D" strokeWidth="2" />
      </g>
      <rect x="20" y="236" width="132" height="32" rx="16" fill="#fff" />
      <text x="37" y="257" fill="#3F584A" fontSize="12" fontFamily="Arial">
        Your campus
      </text>
      <rect x="352" y="16" width="110" height="32" rx="16" fill="#fff" />
      <text x="369" y="37" fill="#3F584A" fontSize="12" fontFamily="Arial">
        Your next stop
      </text>
      <g fill="#A6BE9A">
        <circle cx="66" cy="76" r="19" />
        <circle cx="95" cy="61" r="14" />
        <circle cx="296" cy="224" r="18" />
        <circle cx="322" cy="241" r="13" />
      </g>
    </svg>
  );
}

export default function Carpool() {
  const [live, setLive] = useState<Snapshot>(empty);
  const [demo, setDemo] = useState<Snapshot>(() => demoSnapshot());
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [view, setView] = useState<View>("find");
  const [modal, setModal] = useState<Modal>(null);
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [seats, setSeats] = useState("1");
  const [filters, setFilters] = useState({
    origin: "",
    destination: "",
    date: "",
    seats: 1,
  });
  const [category, setCategory] = useState("All rides");
  const [sort, setSort] = useState("soonest");
  const [tripTab, setTripTab] = useState("riding");
  const [campusFilter, setCampusFilter] = useState("");
  const [afterProfile, setAfterProfile] = useState<
    "post" | { rideId: string } | null
  >(null);
  const [demoReports, setDemoReports] = useState<
    (Report & { isMine?: boolean })[]
  >(() => [
    {
      id: "sample-report",
      rideId: "demo-4",
      reason: "Misleading listing",
      details:
        "This is a fictional report to demonstrate reviewing a concern. The listed pickup point and the driver’s note disagree.",
      status: "open",
      resolution: null,
      resolutionNotes: null,
      createdAt: new Date().toISOString(),
      origin: "Campus · West Residence",
      destination: "Chicago · Downtown",
      driverName: "Alex Rivera",
      isMine: false,
    },
  ]);
  const [demoMessages, setDemoMessages] = useState<Record<string, Message[]>>(
    {},
  );
  const discovery = useRideSearch(
    mode === "live" && view === "find",
    live.user?.userId,
    {
      ...filters,
      campus: campusFilter,
      category:
        category === "Airport runs"
          ? "airport"
          : category === "Heading home"
            ? "home"
            : "all",
      sort,
    },
  );
  const s =
    mode === "demo"
      ? demo
      : {
          ...live,
          rides: [
            ...live.rides,
            ...discovery.rides.filter(
              (r) => !live.rides.some((p) => p.id === r.id),
            ),
          ],
        };
  const uid = s.user?.userId;
  const chatBooking =
    modal?.type === "chat"
      ? s.bookings.find((b) => b.id === modal.bookingId)
      : undefined;
  const chatRide = chatBooking
    ? s.rides.find((r) => r.id === chatBooking.rideId)
    : undefined;
  const requests = s.bookings.filter(
    (b) =>
      b.status === "pending" &&
      s.rides.some(
        (r) =>
          r.id === b.rideId &&
          r.driverId === uid &&
          r.status === "active" &&
          Date.parse(r.departure) > Date.now(),
      ),
  );
  const refresh = async (refreshDiscovery = true) => {
    const res = await fetch("/api/loop", { cache: "no-store" });
    const data = (await res.json()) as Snapshot & { error?: string };
    if (!res.ok) throw new Error(data.error || "Could not load rides.");
    setLive(data);
    if (refreshDiscovery) discovery.reload();
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "live")
      setMode("live");
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const t = setInterval(() => {
      refresh(false).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, []);
  const switchMode = (next: "demo" | "live") => {
    setMode(next);
    setModal(null);
    setView("find");
    setMenu(false);
    setFilters({ origin: "", destination: "", date: "", seats: 1 });
    setOrigin("");
    setDestination("");
    setDate("");
    setCategory("All rides");
    setCampusFilter("");
    setError("");
    if (next === "live") refresh().catch((e) => setError(e.message));
  };
  const navigate = (next: View) => {
    setView(next);
    setMenu(false);
  };
  async function mutate(action: Record<string, unknown>, success: string) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const parsed = actionSchema.safeParse(action);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      if (mode === "demo") {
        const next = structuredClone(demo);
        const now = new Date().toISOString();
        if (parsed.data.action === "post") {
          next.rides.push({
            ...parsed.data.ride,
            id: crypto.randomUUID(),
            driverId: "demo-you",
            driverName: demo.profile?.displayName || "You",
            campus: demo.profile?.campus || "Example University",
            status: "active",
            createdAt: now,
            accepted: 0,
          });
        } else if (action.action === "request") {
          const r = next.rides.find((r) => r.id === action.rideId);
          if (!r || r.driverId === uid || r.accepted >= r.seats)
            throw new Error("This ride is unavailable.");
          const existing = next.bookings.find(
            (b) => b.rideId === r.id && b.riderId === uid,
          );
          if (existing && ["pending", "accepted"].includes(existing.status))
            throw new Error("You already requested this ride.");
          if (existing) existing.status = "pending";
          else
            next.bookings.push({
              id: crypto.randomUUID(),
              rideId: r.id,
              riderId: "demo-you",
              riderName: demo.profile?.displayName || "You",
              status: "pending",
              createdAt: now,
            });
        } else if (action.action === "cancelRide") {
          next.rides.forEach((r) => {
            if (r.id === action.rideId) r.status = "cancelled";
          });
          next.bookings.forEach((b) => {
            if (
              b.rideId === action.rideId &&
              ["pending", "accepted"].includes(b.status)
            )
              b.status = "cancelled";
          });
        } else {
          const b = next.bookings.find((b) => b.id === action.bookingId);
          if (!b) throw new Error("Request not found.");
          const r = next.rides.find((r) => r.id === b.rideId)!;
          if (action.action === "accept" && r.accepted >= r.seats)
            throw new Error("This ride is full.");
          b.status =
            action.action === "accept"
              ? "accepted"
              : action.action === "decline"
                ? "declined"
                : "cancelled";
        }
        next.rides.forEach(
          (r) =>
            (r.accepted = next.bookings.filter(
              (b) => b.rideId === r.id && b.status === "accepted",
            ).length),
        );
        setDemo(next);
      } else {
        const res = await fetch("/api/loop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Something went wrong.");
        await refresh();
      }
      setNotice(success + (mode === "demo" ? " · Demo only" : ""));
      setModal(null);
      return true;
    } catch (e) {
      if (mode === "live") discovery.reload();
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const demoMatched = demo.rides
    .filter(
      (r) =>
        !campusFilter || r.campus.toLowerCase() === campusFilter.toLowerCase(),
    )
    .filter(
      (r) =>
        r.status === "active" &&
        Date.parse(r.departure) > Date.now() &&
        r.driverId !== uid,
    )
    .filter(
      (r) =>
        r.origin.toLowerCase().includes(filters.origin.toLowerCase()) &&
        r.destination
          .toLowerCase()
          .includes(filters.destination.toLowerCase()) &&
        (!filters.date || localDate(r.departure) === filters.date) &&
        r.seats - r.accepted >= filters.seats,
    )
    .filter(
      (r) =>
        category === "All rides" ||
        (category === "Airport runs"
          ? /airport/i.test(r.destination)
          : !/airport/i.test(r.destination)),
    )
    .sort((a, b) =>
      sort === "price"
        ? a.priceCents - b.priceCents
        : Date.parse(a.departure) - Date.parse(b.departure),
    );
  const matched = mode === "demo" ? demoMatched : discovery.rides;
  const selected =
    modal?.type === "ride" ? s.rides.find((r) => r.id === modal.id) : undefined;
  const myBooking = selected
    ? s.bookings.find((b) => b.rideId === selected.id && b.riderId === uid)
    : undefined;
  const activeFilter = !!(
    filters.origin ||
    filters.destination ||
    filters.date ||
    filters.seats !== 1 ||
    campusFilter ||
    category !== "All rides"
  );
  const clearFilters = () => {
    setOrigin("");
    setDestination("");
    setDate("");
    setSeats("1");
    setFilters({ origin: "", destination: "", date: "", seats: 1 });
    setCategory("All rides");
    setCampusFilter("");
  };
  const openPost = () => {
    setError("");
    if (mode === "live" && uid && !s.profile) {
      setAfterProfile("post");
      setModal({ type: "profile" });
      return;
    }
    setModal({ type: "post" });
  };
  const reportRide =
    modal?.type === "report"
      ? s.rides.find((r) => r.id === modal.rideId)
      : undefined;
  const campusOptions =
    mode === "demo"
      ? Array.from(
          new Set(demo.rides.map((r) => r.campus).filter(Boolean)),
        ).sort()
      : discovery.campuses;
  async function saveProfile(p: Profile) {
    if (mode === "demo")
      setDemo((previous) => ({
        ...previous,
        profile: p,
        user: previous.user
          ? { ...previous.user, displayName: p.displayName }
          : null,
      }));
    else await refresh();
    const next = afterProfile;
    setAfterProfile(null);
    setNotice("Profile saved" + (mode === "demo" ? " · Demo only" : ""));
    if (next === "post") setModal({ type: "post" });
    else if (next)
      await mutate(
        { action: "request", rideId: next.rideId },
        "Seat requested",
      );
    else setModal(null);
  }
  function demoResolve(
    id: string,
    resolution: "hide" | "dismiss",
    notes: string,
  ) {
    const report = demoReports.find((r) => r.id === id);
    setDemoReports((previous) =>
      previous.map((r) =>
        r.id === id
          ? { ...r, status: "resolved", resolution, resolutionNotes: notes }
          : r,
      ),
    );
    if (resolution === "hide" && report)
      setDemo((previous) => ({
        ...previous,
        rides: previous.rides.map((r) =>
          r.id === report.rideId ? { ...r, status: "removed", accepted: 0 } : r,
        ),
        bookings: previous.bookings.map((b) =>
          b.rideId === report.rideId &&
          ["pending", "accepted"].includes(b.status)
            ? { ...b, status: "cancelled" }
            : b,
        ),
      }));
  }
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "is-open" : "")}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("find");
          }}
          aria-label="Loop home"
        >
          <span className="brand-mark">
            <Route size={25} />
          </span>
          loop<span className="brand-dot">.</span>
        </a>
        <div className="sidebar-caption">A LITTLE CLOSER TO HOME</div>
        <nav aria-label="Main navigation">
          <button
            className={view === "find" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("find")}
          >
            <Compass size={20} />
            Find a ride
          </button>
          <button
            className={view === "trips" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("trips")}
          >
            <CarFront size={20} />
            My trips
          </button>
          <button
            className={view === "requests" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("requests")}
          >
            <Inbox size={20} />
            Requests{" "}
            {requests.length > 0 && (
              <span className="nav-count">{requests.length}</span>
            )}
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setMenu(false);
              setError("");
              setModal({ type: "reports" });
            }}
          >
            <Flag size={20} />
            {s.isModerator ? "Reports & review" : "My reports"}
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="leaf-icon">
            <Leaf size={21} />
          </span>
          <h3>
            Same direction?
            <br />
            Share the journey.
          </h3>
          <p>
            A few empty seats.
            <br />A little more possibility.
          </p>
          <button onClick={openPost}>
            Offer your seats <ArrowUpRight size={16} />
          </button>
        </div>
        <button
          className="help-link"
          onClick={() => setModal({ type: "help" })}
        >
          <CircleHelp size={18} /> How Loop works <ArrowUpRight size={14} />
        </button>
        <div className="sidebar-footer">LESS SOLO. MORE LOOP.</div>
      </aside>
      <main>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle menu"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">Your campus. Your people.</span>
          </div>
          <div className="topbar-actions">
            <div className="mode-switch" aria-label="Data mode">
              <button
                className={mode === "demo" ? "chosen" : ""}
                onClick={() => switchMode("demo")}
              >
                Demo
              </button>
              <button
                className={mode === "live" ? "chosen" : ""}
                onClick={() => switchMode("live")}
              >
                Live
              </button>
            </div>
            <span className="topbar-divider" />
            <button
              className="account-control"
              aria-label="Your campus profile"
              onClick={() => {
                setError("");
                setAfterProfile(null);
                setModal({ type: "profile" });
              }}
            >
              <span className="avatar account">
                {initials(s.user?.displayName || "You")}
              </span>
            </button>
            <span className="account-name">
              {mode === "demo"
                ? "Try Loop"
                : s.user?.displayName.split("@")[0] || "Guest"}
            </span>
          </div>
        </header>
        <div className="main-content">
          <div className="demo-banner">
            <span>
              <Sparkles size={15} />
              {mode === "demo" ? (
                <>
                  You’re exploring demo rides. Try posting, requesting, and
                  approving a seat.
                </>
              ) : (
                <>
                  Live rides ·{" "}
                  {s.user
                    ? "Your changes are saved to your account."
                    : "Sign in to post a ride or request a seat."}
                </>
              )}
            </span>
            {mode === "demo" ? (
              <button onClick={() => switchMode("live")}>
                Switch to live <ArrowRight size={14} />
              </button>
            ) : !s.user ? (
              <a
                href="/signin-with-chatgpt?return_to=%2F%3Fmode%3Dlive"
                target="_top"
              >
                Sign in <LogIn size={14} />
              </a>
            ) : (
              <button
                onClick={() =>
                  refresh()
                    .then(() => setNotice("Rides refreshed."))
                    .catch((e) => setError(e.message))
                }
              >
                Refresh <ArrowDownUp size={14} />
              </button>
            )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {view === "find" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span />
                    THE JOURNEY IS BETTER TOGETHER
                  </div>
                  <h1>
                    Good company.
                    <br />
                    <span>Better way home.</span>
                  </h1>
                  <p>
                    Catch a ride with your campus community.
                    <br />
                    Split the cost. Share the playlist. Enjoy the ride.
                  </p>
                  <div className="hero-foot">
                    <span>
                      <Users size={16} />
                      Built around campus
                    </span>
                    <span className="small-dot" />
                    <span>
                      <Leaf size={16} />
                      More shared miles
                    </span>
                  </div>
                </div>
                <RouteArt />
              </section>
              <form
                className="search-panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  setFilters({
                    origin: origin.trim(),
                    destination: destination.trim(),
                    date,
                    seats: Number(seats),
                  });
                }}
              >
                <label className="search-field">
                  <span>
                    <span className="origin-dot" />
                    LEAVING FROM
                  </span>
                  <input
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="Any campus pickup"
                    aria-label="Leaving from"
                  />
                </label>
                <button
                  type="button"
                  className="swap-button"
                  aria-label="Swap origin and destination"
                  onClick={() => {
                    setOrigin(destination);
                    setDestination(origin);
                  }}
                >
                  <ArrowDownUp size={16} />
                </button>
                <label className="search-field">
                  <span>
                    <MapPin size={14} />
                    GOING TO
                  </span>
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Where are you headed?"
                    aria-label="Going to"
                  />
                </label>
                <label className="search-field date-field">
                  <span>
                    <CalendarDays size={14} />
                    WHEN
                  </span>
                  <input
                    type="date"
                    value={date}
                    min={localDate(new Date().toISOString())}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="Departure date"
                  />
                </label>
                <label className="search-field seats-field">
                  <span>
                    <Users size={14} />
                    SEATS
                  </span>
                  <select
                    value={seats}
                    onChange={(e) => setSeats(e.target.value)}
                    aria-label="Minimum seats available"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option value={n} key={n}>
                        {n} {n === 1 ? "seat" : "seats"}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary search-submit">
                  <Search size={18} />
                  Find a ride
                </button>
              </form>
              <section className="rides-section">
                <div className="section-heading">
                  <div>
                    <div className="section-kicker">
                      A SEAT WITH YOUR NAME ON IT
                    </div>
                    <h2>
                      Catch your next ride<span>.</span>
                    </h2>
                    <p>
                      {mode === "demo"
                        ? "A few examples of where Loop could take you."
                        : "Find your next trip with a little company."}
                    </p>
                  </div>
                  <button className="secondary post-top" onClick={openPost}>
                    <Plus size={17} />
                    Post a ride
                  </button>
                </div>
                <div className="filterbar">
                  <div className="pills">
                    {["All rides", "Airport runs", "Heading home"].map((c) => (
                      <button
                        className={category === c ? "pill selected" : "pill"}
                        key={c}
                        onClick={() => setCategory(c)}
                      >
                        {c === "Airport runs"
                          ? "↗ "
                          : c === "Heading home"
                            ? "⌂ "
                            : ""}
                        {c}
                      </button>
                    ))}
                  </div>
                  <label className="sort-control">
                    <SlidersHorizontal size={14} />
                    <select
                      aria-label="Sort rides"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="soonest">Leaving soonest</option>
                      <option value="price">Lowest price</option>
                    </select>
                    <ChevronDown size={14} />
                  </label>
                </div>
                <div className="campus-filter">
                  <GraduationCap size={15} />
                  <label htmlFor="campus-filter">Campus</label>
                  <select
                    id="campus-filter"
                    value={campusFilter}
                    onChange={(e) => setCampusFilter(e.target.value)}
                  >
                    <option value="">All campuses</option>
                    {campusOptions.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <span>Self-reported membership</span>
                </div>
                <div className="result-line">
                  <span>
                    {matched.length} {mode === "demo" ? "demo " : ""}
                    {matched.length === 1 ? "ride" : "rides"}{" "}
                    {mode === "live" && discovery.hasMore
                      ? "loaded · more available"
                      : "available"}
                  </span>
                  {activeFilter && (
                    <button onClick={clearFilters}>
                      Clear filters <X size={12} />
                    </button>
                  )}
                </div>
                {mode === "live" && discovery.error && (
                  <div className="error-banner" role="alert">
                    {discovery.error}
                    <button className="text-button" onClick={discovery.reload}>
                      Retry search
                    </button>
                  </div>
                )}
                {mode === "live" && (loading || discovery.loading) ? (
                  <div className="empty-state">
                    <LoaderCircle className="spin" />
                    Loading rides…
                  </div>
                ) : mode === "live" &&
                  discovery.error &&
                  !matched.length ? null : matched.length ? (
                  <div className="ride-grid">
                    {matched.map((r, i) => (
                      <RideCard
                        key={r.id}
                        ride={r}
                        index={i}
                        booking={s.bookings.find(
                          (b) => b.rideId === r.id && b.riderId === uid,
                        )}
                        onClick={() => {
                          setError("");
                          setModal({ type: "ride", id: r.id });
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Route size={32} />
                    <h3>
                      {activeFilter
                        ? "No rides match just yet."
                        : "Be the first to get things moving."}
                    </h3>
                    <p>
                      {activeFilter
                        ? "Try another destination or departure date."
                        : "Post a ride and give someone a way home."}
                    </p>
                    <button
                      className="secondary"
                      onClick={activeFilter ? clearFilters : openPost}
                    >
                      {activeFilter ? "Clear filters" : "Post the first ride"}
                    </button>
                  </div>
                )}
                {mode === "live" && discovery.hasMore && (
                  <div className="load-more">
                    <button
                      className="secondary"
                      onClick={() => void discovery.loadMore()}
                      disabled={discovery.loading || discovery.loadingMore}
                    >
                      {discovery.loadingMore ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Plus size={16} />
                      )}
                      Load more rides
                    </button>
                    <span>Showing {matched.length} rides</span>
                  </div>
                )}
              </section>
              <div className="bottom-callout">
                <div className="callout-icon">
                  <CarFront size={26} />
                </div>
                <div>
                  <h3>Already making the trip?</h3>
                  <p>Turn your empty seats into someone’s way home.</p>
                </div>
                <button onClick={openPost}>
                  Offer a ride <ArrowRight size={18} />
                </button>
              </div>
            </>
          )}
          {view === "trips" && (
            <section className="management">
              <div className="section-heading">
                <div>
                  <div className="section-kicker">
                    YOUR NEXT CHAPTER, ON THE ROAD
                  </div>
                  <h1>
                    My trips<span>.</span>
                  </h1>
                  <p>Keep your plans and your people in one place.</p>
                </div>
                <button className="primary" onClick={openPost}>
                  <Plus size={18} />
                  Post a ride
                </button>
              </div>
              <div className="pills trip-tabs">
                <button
                  className={tripTab === "riding" ? "pill selected" : "pill"}
                  onClick={() => setTripTab("riding")}
                >
                  I’m riding
                </button>
                <button
                  className={tripTab === "driving" ? "pill selected" : "pill"}
                  onClick={() => setTripTab("driving")}
                >
                  I’m driving
                </button>
              </div>
              {tripTab === "riding" ? (
                s.bookings.filter((b) => b.riderId === uid).length ? (
                  <div className="trip-list">
                    {s.bookings
                      .filter((b) => b.riderId === uid)
                      .map((b) => {
                        const r = s.rides.find((r) => r.id === b.rideId);
                        return (
                          r && (
                            <div className="trip-row" key={b.id}>
                              <div className="trip-icon">
                                <CarFront />
                              </div>
                              <div className="trip-info">
                                <h3>
                                  {endName(r.origin)} <ArrowRight size={15} />{" "}
                                  {endName(r.destination)}
                                </h3>
                                <p>
                                  {dateLabel(r.departure)} ·{" "}
                                  {timeLabel(r.departure)} · with {r.driverName}
                                </p>
                                <span className={"status " + b.status}>
                                  {b.status === "accepted"
                                    ? "Seat confirmed"
                                    : b.status === "pending"
                                      ? "Awaiting driver approval"
                                      : b.status}
                                </span>
                              </div>
                              <div className="trip-actions">
                                {["accepted", "cancelled"].includes(
                                  b.status,
                                ) && (
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      setError("");
                                      setModal({
                                        type: "chat",
                                        bookingId: b.id,
                                      });
                                    }}
                                  >
                                    <MessageCircle size={14} />
                                    {b.status === "accepted"
                                      ? "Message driver"
                                      : "Conversation"}
                                  </button>
                                )}
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setModal({ type: "ride", id: r.id })
                                  }
                                >
                                  Details <ArrowUpRight size={14} />
                                </button>
                                {["pending", "accepted"].includes(b.status) && (
                                  <button
                                    className="text-button danger"
                                    disabled={busy}
                                    onClick={() =>
                                      setModal({
                                        type: "confirm",
                                        action: {
                                          action: "cancelBooking",
                                          bookingId: b.id,
                                        },
                                        message:
                                          "Cancel your seat request? If accepted, your seat will become available again.",
                                      })
                                    }
                                  >
                                    Cancel request
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        );
                      })}
                  </div>
                ) : (
                  <Empty
                    title="Your next ride starts here."
                    text="Request a seat and it will appear here while the driver reviews it."
                    action={() => navigate("find")}
                    label="Find a ride"
                  />
                )
              ) : s.rides.filter((r) => r.driverId === uid).length ? (
                <div className="trip-list">
                  {s.rides
                    .filter((r) => r.driverId === uid)
                    .map((r) => (
                      <div className="trip-row" key={r.id}>
                        <div className="trip-icon">
                          <CarFront />
                        </div>
                        <div className="trip-info">
                          <h3>
                            {endName(r.origin)} <ArrowRight size={15} />{" "}
                            {endName(r.destination)}
                          </h3>
                          <p>
                            {dateLabel(r.departure)} · {timeLabel(r.departure)}{" "}
                            · {r.accepted}/{r.seats} seats booked
                          </p>
                          <span className={"status " + r.status}>
                            {r.status}
                          </span>
                        </div>
                        <div className="trip-actions">
                          <button
                            className="text-button"
                            onClick={() => setModal({ type: "ride", id: r.id })}
                          >
                            Details <ArrowUpRight size={14} />
                          </button>
                          {r.status === "active" && (
                            <button
                              className="text-button danger"
                              disabled={busy}
                              onClick={() =>
                                setModal({
                                  type: "confirm",
                                  action: {
                                    action: "cancelRide",
                                    rideId: r.id,
                                  },
                                  message:
                                    "Cancel this ride? All pending and confirmed seat requests will also be cancelled.",
                                })
                              }
                            >
                              Cancel ride
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <Empty
                  title="Have a little room to spare?"
                  text="Post your next trip and let someone come along."
                  action={openPost}
                  label="Post a ride"
                />
              )}
            </section>
          )}
          {view === "requests" && (
            <section className="management">
              <div className="section-heading">
                <div>
                  <div className="section-kicker">
                    MAKE ROOM FOR GOOD COMPANY
                  </div>
                  <h1>
                    Seat requests<span>.</span>
                  </h1>
                  <p>You’re in the driver’s seat. Review who’s coming along.</p>
                </div>
              </div>
              {requests.length ? (
                <div className="trip-list">
                  {requests.map((b) => {
                    const r = s.rides.find((r) => r.id === b.rideId)!;
                    return (
                      <div className="trip-row" key={b.id}>
                        <span className="avatar lilac">
                          {initials(b.riderName)}
                        </span>
                        <div className="trip-info">
                          <h3>
                            {b.riderName}{" "}
                            <span className="muted">requested 1 seat</span>
                          </h3>
                          <p>
                            {endName(r.destination)} · {dateLabel(r.departure)}{" "}
                            · {timeLabel(r.departure)}
                          </p>
                          <span className="status pending">
                            {r.seats - r.accepted}{" "}
                            {r.seats - r.accepted === 1 ? "seat" : "seats"} left
                          </span>
                        </div>
                        <div className="request-actions">
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              mutate(
                                { action: "decline", bookingId: b.id },
                                "Request declined",
                              )
                            }
                          >
                            Decline
                          </button>
                          <button
                            className="primary"
                            disabled={busy || r.accepted >= r.seats}
                            onClick={() =>
                              mutate(
                                { action: "accept", bookingId: b.id },
                                "Seat confirmed",
                              )
                            }
                          >
                            <Check size={16} />
                            Accept
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  title="All caught up."
                  text="When someone requests a seat on your ride, you’ll see it here."
                  action={() => {
                    navigate("trips");
                    setTripTab("driving");
                  }}
                  label="View my rides"
                />
              )}
            </section>
          )}
          <footer className="main-footer">
            <span>Made for the miles between campus and home.</span>
            <button onClick={() => setModal({ type: "help" })}>
              A little about Loop <ArrowUpRight size={13} />
            </button>
          </footer>
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {notice}
        </div>
      )}
      {modal && (
        <Dialog
          close={() => {
            if (!busy) setModal(null);
          }}
          title={
            modal.type === "post"
              ? "Offer a ride"
              : modal.type === "ride"
                ? "Your ride, in detail"
                : modal.type === "help"
                  ? "A little about Loop"
                  : modal.type === "chat"
                    ? "Trip messages"
                    : modal.type === "profile"
                      ? "Your campus profile"
                      : modal.type === "report"
                        ? "Report this ride"
                        : modal.type === "reports"
                          ? "Reports & review"
                          : "One quick check"
          }
        >
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {modal.type === "profile" &&
            (mode === "live" && !uid ? (
              <SignInPrompt />
            ) : (
              <ProfileForm
                profile={s.profile || null}
                demo={mode === "demo"}
                onSaved={saveProfile}
              />
            ))}
          {modal.type === "report" &&
            reportRide &&
            (mode === "live" && !uid ? (
              <SignInPrompt />
            ) : (
              <ReportForm
                destination={reportRide.destination}
                rideId={reportRide.id}
                demo={mode === "demo"}
                onSubmit={(reason, details) => {
                  if (
                    demoReports.some(
                      (r) => r.rideId === reportRide.id && r.isMine,
                    )
                  )
                    throw new Error(
                      "You already reported this ride. Track its status in My reports.",
                    );
                  setDemoReports((previous) => [
                    {
                      id: crypto.randomUUID(),
                      rideId: reportRide.id,
                      reason,
                      details,
                      status: "open",
                      resolution: null,
                      resolutionNotes: null,
                      createdAt: new Date().toISOString(),
                      origin: reportRide.origin,
                      destination: reportRide.destination,
                      driverName: reportRide.driverName,
                      isMine: true,
                    },
                    ...previous,
                  ]);
                }}
                onSaved={() => {
                  setModal(null);
                  setNotice(
                    "Report submitted. Track it in My reports." +
                      (mode === "demo" ? " · Demo only" : ""),
                  );
                }}
              />
            ))}
          {modal.type === "reports" &&
            (mode === "live" && !uid ? (
              <SignInPrompt />
            ) : (
              <ReportsPanel
                isModerator={!!s.isModerator}
                demo={
                  mode === "demo"
                    ? { reports: demoReports, resolve: demoResolve }
                    : undefined
                }
                onChanged={async () => {
                  if (mode === "live") await refresh();
                }}
              />
            ))}
          {mode === "demo" && modal.type !== "help" && (
            <div className="modal-demo">
              <Sparkles size={14} />
              Demo mode · changes reset when you reload.
            </div>
          )}
          {modal.type === "chat" && chatBooking && chatRide && uid && (
            <TripChat
              key={chatBooking.id + mode}
              bookingId={chatBooking.id}
              userId={uid}
              title={`${endName(chatRide.origin)} → ${endName(chatRide.destination)}`}
              partner={
                chatRide.driverId === uid
                  ? chatBooking.riderName
                  : chatRide.driverName
              }
              demo={
                mode === "demo"
                  ? {
                      messages: demoMessages[chatBooking.id] || [],
                      canSend:
                        chatBooking.status === "accepted" &&
                        chatRide.status === "active",
                      send: (m) =>
                        setDemoMessages((previous) => ({
                          ...previous,
                          [chatBooking.id]: [
                            ...(previous[chatBooking.id] || []),
                            m,
                          ],
                        })),
                    }
                  : undefined
              }
            />
          )}
          {modal.type === "post" &&
            (mode === "live" && !uid ? (
              <SignInPrompt />
            ) : (
              <PostForm
                busy={busy}
                submit={(ride) =>
                  mutate({ action: "post", ride }, "Ride posted").then((ok) => {
                    if (ok) {
                      navigate("trips");
                      setTripTab("driving");
                    }
                  })
                }
              />
            ))}
          {modal.type === "ride" && selected && (
            <>
              <div className="detail-route">
                <span>
                  <span className="origin-dot" />
                  {selected.origin}
                </span>
                <div className="route-dotted" />
                <span>
                  <MapPin size={17} />
                  {selected.destination}
                </span>
              </div>
              <div className="detail-grid">
                <div>
                  <CalendarDays size={18} />
                  <strong>{dateLabel(selected.departure)}</strong>
                  <span>{timeLabel(selected.departure)}</span>
                </div>
                <div>
                  <Users size={18} />
                  <strong>
                    {selected.seats - selected.accepted} seats left
                  </strong>
                  <span>{selected.seats} total seats</span>
                </div>
                <div>
                  <CarFront size={18} />
                  <strong>{selected.car}</strong>
                  <span>Your driver’s car</span>
                </div>
                <div>
                  <span className="detail-price">
                    {money(selected.priceCents)}
                  </span>
                  <strong>per seat</strong>
                  <span>Arrange payment directly</span>
                </div>
              </div>
              <div className="detail-driver">
                <span className="avatar peach">
                  {initials(selected.driverName)}
                </span>
                <div>
                  <strong>{selected.driverName}</strong>
                  <p>Driving this trip</p>
                </div>
              </div>
              <div className="detail-campus">
                <GraduationCap size={16} />
                {selected.campus || "Campus not set"}
                <span>Self-reported</span>
              </div>
              <h3 className="detail-label">A note from your driver</h3>
              <p className="driver-note">
                {selected.notes ||
                  "No extra details yet. Confirm your pickup arrangements before travelling."}
              </p>
              {selected.status !== "active" ||
              Date.parse(selected.departure) <= Date.now() ? (
                <div className="modal-demo">
                  This ride is{" "}
                  {selected.status !== "active"
                    ? selected.status === "removed"
                      ? "removed by a moderator"
                      : "cancelled"
                    : "in the past"}
                  .
                </div>
              ) : selected.driverId === uid ? (
                <div className="own-ride-info">
                  <CheckCircle2 size={18} />
                  You’re driving this ride. Review seat requests in Requests.
                </div>
              ) : mode === "live" && !uid ? (
                <SignInPrompt />
              ) : myBooking &&
                ["pending", "accepted"].includes(myBooking.status) ? (
                <div className={"booking-confirmation " + myBooking.status}>
                  <CheckCircle2 size={20} />
                  <div>
                    <strong>
                      {myBooking.status === "accepted"
                        ? "Your seat is confirmed."
                        : "Your request is with the driver."}
                    </strong>
                    <p>Track your seat in My trips.</p>
                  </div>
                </div>
              ) : (
                <button
                  className="primary full"
                  disabled={busy || selected.accepted >= selected.seats}
                  onClick={() =>
                    mode === "live" && !s.profile
                      ? (setAfterProfile({ rideId: selected.id }),
                        setModal({ type: "profile" }))
                      : mutate(
                          { action: "request", rideId: selected.id },
                          "Seat requested",
                        )
                  }
                >
                  {busy ? (
                    <LoaderCircle size={18} className="spin" />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}{" "}
                  {selected.accepted >= selected.seats
                    ? "This ride is full"
                    : "Request 1 seat"}
                </button>
              )}
              <p className="fine-print">
                A request isn’t a confirmed seat until the driver accepts. Loop
                doesn’t process payments or verify student status.
              </p>
              {selected.driverId !== uid && (
                <button
                  className="report-link"
                  onClick={() => {
                    setError("");
                    setModal({ type: "report", rideId: selected.id });
                  }}
                >
                  <Flag size={13} />
                  Report this ride
                </button>
              )}
              {selected.driverId === uid &&
                s.bookings.some(
                  (b) =>
                    b.rideId === selected.id &&
                    ["accepted", "cancelled"].includes(b.status),
                ) && (
                  <div className="passenger-panel">
                    <h3 className="detail-label">Rider conversations</h3>
                    {s.bookings
                      .filter(
                        (b) =>
                          b.rideId === selected.id &&
                          ["accepted", "cancelled"].includes(b.status),
                      )
                      .map((b) => (
                        <div className="passenger-row" key={b.id}>
                          <span className="avatar sage">
                            {initials(b.riderName)}
                          </span>
                          <div>
                            <strong>{b.riderName}</strong>
                            <span>
                              {b.status === "accepted"
                                ? "Seat confirmed"
                                : "Cancelled"}
                            </span>
                          </div>
                          <button
                            className="secondary"
                            onClick={() => {
                              setError("");
                              setModal({ type: "chat", bookingId: b.id });
                            }}
                          >
                            <MessageCircle size={14} />
                            Message
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              {myBooking && myBooking.status === "accepted" && (
                <button
                  className="secondary full message-driver"
                  onClick={() => {
                    setError("");
                    setModal({ type: "chat", bookingId: myBooking.id });
                  }}
                >
                  <MessageCircle size={16} />
                  Message your driver
                </button>
              )}
            </>
          )}
          {modal.type === "confirm" && (
            <>
              <p className="confirm-message">{modal.message}</p>
              <div className="request-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Keep it
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => mutate(modal.action, "Cancellation saved")}
                >
                  Confirm cancellation
                </button>
              </div>
            </>
          )}
          {modal.type === "help" && (
            <div className="how-it-works">
              <p className="help-intro">
                A simpler way to share the trip you’re already making.
              </p>
              {[
                [
                  Search,
                  "Find your people",
                  "Search by pickup, destination, date, and available seats.",
                ],
                [
                  Users,
                  "Request a seat",
                  "Drivers review each request. Check My trips for confirmation.",
                ],
                [
                  CarFront,
                  "Make the journey",
                  "Once your seat is confirmed, message your driver to agree on pickup and payment.",
                ],
              ].map(([Icon, title, text]) => {
                const I = Icon as typeof Search;
                return (
                  <div className="help-step" key={title as string}>
                    <span>
                      <I size={22} />
                    </span>
                    <div>
                      <h3>{title as string}</h3>
                      <p>{text as string}</p>
                    </div>
                  </div>
                );
              })}
              <div className="help-disclaimer">
                <ShieldCheck size={20} />
                <p>
                  This is an early version. Accounts use ChatGPT sign-in;
                  student identity, driving credentials, and insurance are not
                  verified. Trip messaging opens after seat confirmation.
                  Payments are arranged outside Loop.
                </p>
              </div>
              <button
                className="secondary full"
                onClick={() => {
                  setDemo(demoSnapshot());
                  setDemoMessages({});
                  setDemoReports([]);
                  switchMode("demo");
                  setNotice("Demo reset. Try requesting or approving a seat.");
                }}
              >
                Reset and explore demo
              </button>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
function RideCard({
  ride: r,
  index,
  booking,
  onClick,
}: {
  ride: Ride;
  index: number;
  booking?: Booking;
  onClick: () => void;
}) {
  return (
    <button className="ride-card" onClick={onClick}>
      <div className="ride-card-top">
        <span className="date-badge">
          <CalendarDays size={14} />
          {dateLabel(r.departure)}
        </span>
        <span className="ride-time">
          <Clock3 size={13} />
          {timeLabel(r.departure)}
        </span>
      </div>
      <div className="card-route">
        <div>
          <span className="origin-dot" />
          <span>{r.origin}</span>
        </div>
        <div className="route-dotted" />
        <div>
          <MapPin size={16} />
          <strong>{r.destination}</strong>
        </div>
      </div>
      <div className="ride-tags">
        <span>
          <Users size={13} />
          {r.seats - r.accepted} {r.seats - r.accepted === 1 ? "seat" : "seats"}{" "}
          left
        </span>
        <span>
          <CarFront size={14} />
          {r.car}
        </span>
        {booking && ["pending", "accepted"].includes(booking.status) && (
          <span className="requested-tag">
            {booking.status === "accepted" ? "Confirmed" : "Requested"}
          </span>
        )}
      </div>
      <div className="ride-card-bottom">
        <div className="driver">
          <span
            className={
              "avatar " + ["peach", "sage", "lilac", "blue"][index % 4]
            }
          >
            {initials(r.driverName)}
          </span>
          <div>
            <strong>{r.driverName}</strong>
            <span>{r.campus || "Campus not set"}</span>
          </div>
        </div>
        <div className="card-price">
          <strong>{money(r.priceCents)}</strong>
          <span>/ seat</span>
          <span className="card-arrow">
            <ArrowUpRight size={18} />
          </span>
        </div>
      </div>
    </button>
  );
}
function Empty({
  title,
  text,
  action,
  label,
}: {
  title: string;
  text: string;
  action: () => void;
  label: string;
}) {
  return (
    <div className="empty-state">
      <Route size={34} />
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="secondary" onClick={action}>
        {label}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
function SignInPrompt() {
  return (
    <div className="sign-in-prompt">
      <p>Sign in to save rides and seat requests to your account.</p>
      <a
        className="primary full"
        href="/signin-with-chatgpt?return_to=%2F%3Fmode%3Dlive"
        target="_top"
      >
        <LogIn size={17} />
        Sign in with ChatGPT
      </a>
    </div>
  );
}
function Dialog({
  children,
  close,
  title,
}: {
  children: React.ReactNode;
  close: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => {
      d?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-header">
          <div>
            <div className="section-kicker">A LITTLE MORE LOOP</div>
            <h2>
              {title}
              <span>.</span>
            </h2>
          </div>
          <button
            className="icon-button close-dialog"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function PostForm({
  submit,
  busy,
}: {
  submit: (ride: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [formError, setFormError] = useState("");
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    const f = new FormData(e.currentTarget);
    const departure = new Date(`${f.get("date")}T${f.get("time")}`);
    if (!Number.isFinite(departure.getTime())) {
      setFormError("Choose a valid departure date and time.");
      return;
    }
    await submit({
      origin: f.get("origin"),
      destination: f.get("destination"),
      departure: departure.toISOString(),
      seats: Number(f.get("seats")),
      priceCents: Math.round(Number(f.get("price")) * 100),
      car: f.get("car"),
      notes: f.get("notes"),
    });
  }
  return (
    <form className="post-form" onSubmit={handle}>
      <p className="form-intro">
        Heading somewhere? Give an empty seat a purpose.
      </p>
      <label>
        Pickup location
        <input
          name="origin"
          placeholder="e.g. Campus · Student Union"
          required
          minLength={2}
          maxLength={100}
        />
      </label>
      <label>
        Destination
        <input
          name="destination"
          placeholder="e.g. Chicago · O’Hare Airport"
          required
          minLength={2}
          maxLength={100}
        />
      </label>
      <div className="form-grid">
        <label>
          Departure date
          <input
            name="date"
            type="date"
            min={localDate(new Date().toISOString())}
            required
          />
        </label>
        <label>
          Departure time
          <input name="time" type="time" required />
        </label>
        <label>
          Available seats
          <select name="seats" defaultValue="3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "seat" : "seats"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cost per seat (USD)
          <input
            name="price"
            type="number"
            min="0"
            max="500"
            step="0.01"
            placeholder="0.00"
            required
          />
        </label>
      </div>
      <label>
        Your car
        <input
          name="car"
          placeholder="e.g. Blue Honda Civic"
          required
          minLength={2}
          maxLength={80}
        />
      </label>
      <label>
        Anything riders should know? <span className="optional">Optional</span>
        <textarea
          name="notes"
          rows={3}
          maxLength={600}
          placeholder="Meeting point, luggage space, or the road-trip playlist…"
        />
      </label>
      {formError && (
        <p role="alert" className="form-error">
          {formError}
        </p>
      )}
      <p className="fine-print">
        Departure uses your device’s local time zone. Each rider requests one
        seat. Payments are arranged directly.
      </p>
      <button className="primary full" disabled={busy}>
        {busy ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <Plus size={17} />
        )}
        Post my ride
      </button>
    </form>
  );
}
