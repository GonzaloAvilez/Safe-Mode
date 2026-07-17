"use client";

import { useState, type SubmitEvent } from "react";
import { HoneypotField, useHoneypot } from "../../_shared/honeypot-field";

const MAX_TEXT_LENGTH = 120;

type ErrorOutcome = { message: string } | null;

// The last step of the flow — optional, so it offers an explicit way out ("prefiero
// no dejar nada") rather than only a submit button. Reuses Write's own textarea/button
// spec per the 2026-07-12 mockup direction, just at 120 chars instead of 800 and
// without Searching: submitUserPhrase is a single insert (moderation runs after the
// response via next/server's after(), see /api/phrases), so there's no real wait to
// ritualize here.
//
// Doesn't render its own closing state — LeaveATracePage owns that (the rich
// Gratitude-style canvas + closing copy), so it just reports back which way this
// resolved.
export function TraceForm({ onResolved }: { onResolved: (phase: "submitted" | "skipped") => void }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ErrorOutcome>(null);
  const { honeypot, setHoneypot, formRenderedAt } = useHoneypot();

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, honeypot, formRenderedAt }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError({ message: body.error ?? "Something went wrong." });
        setSubmitting(false);
        return;
      }

      onResolved("submitted");
    } catch {
      setError({ message: "We couldn't connect. Try again." });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
      <HoneypotField value={honeypot} onChange={setHoneypot} />
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_TEXT_LENGTH}
        placeholder="leave something, if you want..."
        rows={4}
        className="w-full resize-none rounded-lg border border-white/12 bg-white/[0.02] p-4 text-[14px] leading-[1.8] tracking-[.2px] text-white/85 placeholder:text-white/25 outline-none transition-colors duration-300 focus:border-[rgba(200,160,30,0.4)]"
      />

      {error && (
        <p className="text-center text-[12px] leading-[1.7] tracking-[.3px] text-white/50">{error.message}</p>
      )}

      <div className="flex flex-col items-center gap-4">
        <button
          type="submit"
          disabled={submitting || text.trim().length === 0}
          className="self-center rounded-full border border-white/20 px-8 py-2.5 text-[11px] tracking-[1.5px] text-white/60 transition-colors duration-300 hover:border-[rgba(200,160,30,0.6)] hover:text-white/85 disabled:pointer-events-none disabled:opacity-30"
        >
          {submitting ? "Saving…" : "Leave a trace"}
        </button>
        <button
          type="button"
          onClick={() => onResolved("skipped")}
          disabled={submitting}
          className="text-[11px] tracking-[.5px] text-white/25 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white/45 disabled:pointer-events-none disabled:opacity-30"
        >
          I&rsquo;d rather not leave anything
        </button>
      </div>
    </form>
  );
}
