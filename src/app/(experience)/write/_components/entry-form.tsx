"use client";

import { useState, type SubmitEvent } from "react";
import { CRISIS_RESOURCE_URL } from "@/lib/safety/crisis-resource";

const MAX_TEXT_LENGTH = 800;

type Outcome =
  | { type: "crisis" }
  | { type: "general_flagged" }
  | { type: "cap_reached" }
  | { type: "no_match" }
  | { type: "matched"; phraseText: string }
  | { type: "error"; message: string };

export function EntryForm() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const body = await res.json();

      if (!res.ok) {
        setOutcome({ type: "error", message: body.error ?? "Algo salió mal." });
        return;
      }

      setOutcome(
        body.type === "matched"
          ? { type: "matched", phraseText: body.phrase.text }
          : { type: body.type }
      );
    } catch {
      setOutcome({ type: "error", message: "No pudimos conectar. Intenta de nuevo." });
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setText("");
    setOutcome(null);
  }

  if (outcome) {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <OutcomeMessage outcome={outcome} />
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-white/20 px-6 py-2 text-[11px] tracking-[1.5px] text-white/50 transition-colors duration-300 hover:border-[rgba(200,160,30,0.5)] hover:text-white/75"
        >
          escribir otra vez
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-5">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_TEXT_LENGTH}
        placeholder="escribe aquí..."
        rows={7}
        required
        className="w-full resize-none rounded-lg border border-white/12 bg-white/[0.02] p-4 text-[14px] leading-[1.8] tracking-[.2px] text-white/85 placeholder:text-white/25 outline-none transition-colors duration-300 focus:border-[rgba(200,160,30,0.4)]"
      />
      <button
        type="submit"
        disabled={submitting || text.trim().length === 0}
        className="self-center rounded-full border border-white/20 px-8 py-2.5 text-[11px] tracking-[1.5px] text-white/60 transition-colors duration-300 hover:border-[rgba(200,160,30,0.6)] hover:text-white/85 disabled:pointer-events-none disabled:opacity-30"
      >
        {submitting ? "enviando…" : "enviar"}
      </button>
    </form>
  );
}

function OutcomeMessage({ outcome }: { outcome: Outcome }) {
  switch (outcome.type) {
    case "crisis":
      return (
        <div className="flex flex-col gap-3 text-[13px] leading-[1.9] tracking-[.3px] text-white/55">
          <p>No estás solo. Si sientes que necesitas hablar con alguien ahora, aquí hay ayuda:</p>
          <a
            href={CRISIS_RESOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-white/75 underline decoration-white/30 underline-offset-4"
          >
            {CRISIS_RESOURCE_URL}
          </a>
        </div>
      );
    case "general_flagged":
      return (
        <p className="text-[13px] leading-[1.9] tracking-[.3px] text-white/55">
          Tu texto no pudo ser publicado esta vez.
        </p>
      );
    case "cap_reached":
      return (
        <p className="text-[13px] leading-[1.9] tracking-[.3px] text-white/55">
          Ya usamos todo el espacio de hoy, vuelve mañana.
        </p>
      );
    case "no_match":
      return (
        <p className="text-[13px] leading-[1.9] tracking-[.3px] text-white/55">
          Tu presencia quedó registrada. Aún no encontramos un reflejo para ti.
        </p>
      );
    case "matched":
      return (
        <p className="text-[15px] leading-[1.9] tracking-[.3px] text-white/70">
          &ldquo;{outcome.phraseText}&rdquo;
        </p>
      );
    case "error":
      return <p className="text-[13px] leading-[1.9] tracking-[.3px] text-white/55">{outcome.message}</p>;
  }
}
