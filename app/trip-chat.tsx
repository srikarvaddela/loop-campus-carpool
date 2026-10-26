"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Send,
  RefreshCw,
  Flag,
} from "lucide-react";
import type { Conversation, Message } from "../lib/types";

type Props = {
  bookingId: string;
  userId: string;
  title: string;
  partner: string;
  onReport?: (message: Message) => void;
  demo?: {
    messages: Message[];
    canSend: boolean;
    send: (message: Message) => void;
  };
};

export default function TripChat({
  bookingId,
  userId,
  title,
  partner,
  demo,
  onReport,
}: Props) {
  const [conversation, setConversation] = useState<Conversation>({
    messages: [],
    canSend: false,
  });
  const [loading, setLoading] = useState(!demo);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const pending = useRef<{ body: string; id: string } | null>(null);
  const latest = useRef<HTMLDivElement>(null);
  const shown = demo ?? conversation;

  async function load() {
    const res = await fetch(
      `/api/messages?bookingId=${encodeURIComponent(bookingId)}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as Conversation & { error?: string };
    if (!res.ok) throw new Error(data.error || "Couldn't load your messages.");
    setConversation(data);
  }
  useEffect(() => {
    if (demo) return;
    let active = true;
    const refresh = async () => {
      try {
        const res = await fetch(
          `/api/messages?bookingId=${encodeURIComponent(bookingId)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as Conversation & { error?: string };
        if (!res.ok)
          throw new Error(data.error || "Couldn't load your messages.");
        if (active) {
          setConversation(data);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Couldn't load messages.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [bookingId, !!demo]);
  const lastId = shown.messages.at(-1)?.id;
  useEffect(() => {
    latest.current?.scrollIntoView({ block: "nearest" });
  }, [lastId]);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending || !shown.canSend) return;
    setSending(true);
    setSendError("");
    // Retain the same id after an uncertain network failure, making retries safe.
    if (pending.current?.body !== body)
      pending.current = { body, id: crypto.randomUUID() };
    const clientId = pending.current!.id;
    try {
      if (demo) {
        demo.send({
          id: clientId,
          bookingId,
          senderId: userId,
          senderName: "You",
          body,
          createdAt: new Date().toISOString(),
        });
      } else {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId, clientId, body }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok)
          throw new Error(data.error || "Couldn't send this message.");
        await load();
      }
      setDraft("");
      pending.current = null;
    } catch (e) {
      setSendError(
        e instanceof Error
          ? e.message
          : "Couldn't send. Your draft is saved here.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="trip-chat">
      <div className="chat-context">
        <span className="chat-symbol">
          <MessageCircle size={21} />
        </span>
        <div>
          <strong>{partner}</strong>
          <p>{title}</p>
        </div>
      </div>
      <div className="chat-privacy">
        <LockKeyhole size={12} />
        This conversation is private. Messages you report are shared with
        moderators.
      </div>
      {(sendError || error) && (
        <div className="chat-error" role="alert">
          <span>{sendError || error}</span>
          {!demo && !sendError && (
            <button
              type="button"
              className="icon-button"
              aria-label="Retry loading messages"
              onClick={() =>
                load()
                  .then(() => setError(""))
                  .catch((e) => setError(e.message))
              }
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      )}
      <div
        className="message-list"
        role="log"
        aria-label="Trip conversation"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {loading ? (
          <div className="chat-empty">
            <LoaderCircle size={22} className="spin" />
            Loading conversation…
          </div>
        ) : !shown.messages.length ? (
          <div className="chat-empty">
            <MessageCircle size={29} />
            <h3>Make a plan together.</h3>
            <p>
              Confirm where to meet, luggage space, or a quick stop along the
              way.
            </p>
          </div>
        ) : (
          shown.messages.map((m) => (
            <article
              key={m.id}
              className={
                "message " + (m.senderId === userId ? "mine" : "theirs")
              }
            >
              <span className="message-sender">
                {m.senderId === userId ? "You" : m.senderName}
              </span>
              <p className={m.hidden ? "hidden-message" : ""}>{m.body}</p>
              {m.senderId !== userId && !m.hidden && onReport && (
                <button
                  className="message-report-action"
                  type="button"
                  onClick={() => onReport(m)}
                  aria-label={`Report message from ${m.senderName}`}
                >
                  <Flag size={11} />
                  Report message
                </button>
              )}
              <time dateTime={m.createdAt}>
                {new Date(m.createdAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </article>
          ))
        )}
        <div ref={latest} />
      </div>
      {!loading && !shown.canSend ? (
        <div className="conversation-closed">
          <LockKeyhole size={15} />
          This conversation is read-only. Messaging opens after a seat is
          confirmed and closes if the ride or seat is cancelled.
        </div>
      ) : (
        <form className="message-compose" onSubmit={send}>
          <label className="sr-only" htmlFor="trip-message">
            Message to {partner}
          </label>
          <textarea
            id="trip-message"
            placeholder="Write a message…"
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending || loading}
          />
          <div className="compose-footer">
            <span>{draft.length}/2,000 · Latest 200 messages</span>
            <button
              className="primary"
              type="submit"
              disabled={sending || loading || !draft.trim()}
            >
              {sending ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Send size={15} />
              )}
              Send
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
