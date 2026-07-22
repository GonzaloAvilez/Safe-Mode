"use client";

import { useState, type SubmitEvent } from "react";
import { HoneypotField, useHoneypot } from "../../_shared/honeypot-field";
import { CONTRIBUTE_ORIGIN } from "@/lib/phrase-origin";

const MAX_TEXT_LENGTH = 120;

type Status = { type: "error"; message: string } | { type: "saved" } | null;

// Standalone contribution form for workshop podmates seeding the corpus directly —
// unlike Leave a Trace (one phrase, the close of the full 9-screen flow), this expects
// several submissions in one sitting, so a successful submit clears the field and loops
// back to a blank form instead of resolving to a closing screen.
export function ContributeForm() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [count, setCount] = useState(0);
  const { honeypot, setHoneypot, formRenderedAt } = useHoneypot();

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);

    try {
      const res = await fetch("/api/phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text, 
          honeypot, 
          formRenderedAt,
          origin: CONTRIBUTE_ORIGIN,
         }),
      });

      if (!res.ok) {
        const body = await res.json();
        setStatus({ type: "error", message: body.error ?? "Something went wrong." });
        setSubmitting(false);
        return;
      }

      setText("");
      setCount((c) => c + 1);
      setStatus({ type: "saved" });
      setSubmitting(false);
    } catch {
      setStatus({ type: "error", message: "We couldn't connect. Try again." });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
      <HoneypotField value={honeypot} onChange={setHoneypot} />
      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (status) setStatus(null);
        }}
        maxLength={MAX_TEXT_LENGTH}
        placeholder="write one, just as it is..."
        rows={4}
        className="w-full resize-none rounded-lg border border-white/12 bg-white/[0.02] p-4 text-[14px] leading-[1.8] tracking-[.2px] text-white/85 placeholder:text-white/25 outline-none transition-colors duration-300 focus:border-[rgba(200,160,30,0.4)]"
      />

      {status?.type === "error" && (
        <p className="text-center text-[12px] leading-[1.7] tracking-[.3px] text-white/50">{status.message}</p>
      )}
      {status?.type === "saved" && (
        <p className="text-center text-[12px] leading-[1.7] tracking-[.3px] text-[rgba(200,160,30,0.75)]">
          Added. Leave another whenever you&rsquo;re ready.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || text.trim().length === 0}
        className="self-center rounded-full border border-white/20 px-8 py-2.5 text-[11px] tracking-[1.5px] text-white/60 transition-colors duration-300 hover:border-[rgba(200,160,30,0.6)] hover:text-white/85 disabled:pointer-events-none disabled:opacity-30"
      >
        {submitting ? "Saving…" : "Add phrase"}
      </button>

      {count > 0 && (
        <p className="text-center text-[11px] tracking-[.3px] text-white/25">
          {count} {count === 1 ? "phrase" : "phrases"} added so far — thank you.
        </p>
      )}
    </form>
  );
}
