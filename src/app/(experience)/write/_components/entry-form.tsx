"use client";

import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
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
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center text-foreground">
        <OutcomeMessage outcome={outcome} />
        <Button type="button" variant="outline" onClick={reset}>
          Escribir otra vez
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_TEXT_LENGTH}
        placeholder="escribe aquí..."
        rows={6}
        required
        className="w-full resize-none rounded-lg border border-border bg-background p-3 text-foreground"
      />
      <Button type="submit" disabled={submitting || text.trim().length === 0}>
        {submitting ? "Enviando..." : "Enviar"}
      </Button>
    </form>
  );
}

function OutcomeMessage({ outcome }: { outcome: Outcome }) {
  switch (outcome.type) {
    case "crisis":
      return (
        <>
          <p>No estás solo. Si sientes que necesitas hablar con alguien ahora, aquí hay ayuda:</p>
          <a href={CRISIS_RESOURCE_URL} target="_blank" rel="noreferrer" className="underline">
            {CRISIS_RESOURCE_URL}
          </a>
        </>
      );
    case "general_flagged":
      return <p>Tu texto no pudo ser publicado esta vez.</p>;
    case "cap_reached":
      return <p>Ya usamos todo el espacio de hoy, vuelve mañana.</p>;
    case "no_match":
      return <p>Tu presencia quedó registrada. Aún no encontramos un reflejo para ti.</p>;
    case "matched":
      return <p>&ldquo;{outcome.phraseText}&rdquo;</p>;
    case "error":
      return <p>{outcome.message}</p>;
  }
}
