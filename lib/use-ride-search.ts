"use client";
import { useEffect, useRef, useState } from "react";
import type { RideSearchResult } from "./types";
const empty: RideSearchResult = {
  rides: [],
  hasMore: false,
  nextCursor: null,
  campuses: [],
};
type Filters = {
  origin: string;
  destination: string;
  campus: string;
  date: string;
  seats: number;
  category: string;
  sort: string;
};

export function useRideSearch(
  enabled: boolean,
  userId: string | undefined,
  filters: Filters,
) {
  const [result, setResult] = useState<RideSearchResult>(empty);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const moreBusy = useRef(false);
  const query = new URLSearchParams({
    origin: filters.origin,
    destination: filters.destination,
    campus: filters.campus,
    seats: String(filters.seats),
    category: filters.category,
    sort: filters.sort,
    limit: "12",
  });
  if (filters.date) {
    // Use local midnights on both sides so daylight-saving transitions retain their real 23/25-hour day.
    const from = new Date(`${filters.date}T00:00:00`);
    const until = new Date(from);
    until.setDate(until.getDate() + 1);
    if (Number.isFinite(from.getTime()) && Number.isFinite(until.getTime())) {
      query.set("from", from.toISOString());
      query.set("until", until.toISOString());
    }
  }
  const url = `/api/rides?${query.toString()}`;
  useEffect(() => {
    const current = ++generation.current;
    abort.current?.abort();
    moreBusy.current = false;
    if (!enabled) {
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setResult((previous) => ({ ...empty, campuses: previous.campuses }));
    setLoading(true);
    setLoadingMore(false);
    setError("");
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const data = (await res.json()) as RideSearchResult & {
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Couldn't search rides.");
        if (current === generation.current) setResult(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted && current === generation.current)
          setError(e.message);
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      controller.abort();
      abort.current?.abort();
    };
  }, [enabled, url, userId, version]);

  async function loadMore() {
    if (!enabled || loading || moreBusy.current || !result.nextCursor) return;
    const current = generation.current;
    const controller = new AbortController();
    abort.current = controller;
    moreBusy.current = true;
    setLoadingMore(true);
    setError("");
    try {
      const res = await fetch(
        `${url}&cursor=${encodeURIComponent(result.nextCursor)}`,
        { cache: "no-store", signal: controller.signal },
      );
      const data = (await res.json()) as RideSearchResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't load more rides.");
      if (current === generation.current)
        setResult((previous) => ({
          ...data,
          rides: [
            ...previous.rides,
            ...data.rides.filter(
              (r) => !previous.rides.some((p) => p.id === r.id),
            ),
          ],
        }));
    } catch (e) {
      if (!controller.signal.aborted && current === generation.current)
        setError(e instanceof Error ? e.message : "Couldn't load more rides.");
    } finally {
      if (current === generation.current) {
        moreBusy.current = false;
        setLoadingMore(false);
      }
    }
  }
  return {
    ...result,
    loading,
    loadingMore,
    error,
    loadMore,
    reload: () => setVersion((v) => v + 1),
  };
}
