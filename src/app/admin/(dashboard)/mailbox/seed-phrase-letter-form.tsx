"use client";

import { useActionState, useId, useState } from "react";
import { submitSeedPhraseLetterAction, type SeedPhraseLetterState } from "./actions";
import { describeSeedPhraseLetterResult } from "./seed-phrase-letter-result";

// maxLength comes from the page: LETTER_MAX_LENGTH lives in letters.ts, server code this
// client component can't import.
export function SeedPhraseLetterForm({ correspondenceId, maxLength }: { correspondenceId: string; maxLength: number }) {
  // Controlled, so the text survives a rejection (React resets uncontrolled fields after
  // an action) and can be fixed instead of rewritten. Cleared once the letter is sent.
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState(
    async (previousState: SeedPhraseLetterState, formData: FormData) => {
      const next = await submitSeedPhraseLetterAction(previousState, formData);
      if (next.result?.type === "held") setText("");
      return next;
    },
    {}
  );
  const textId = useId();
  const sent = state.result?.type === "held";

  return (
    <form action={action} className="flex flex-col gap-2 border-t border-white/10 pt-3">
      <input type="hidden" name="correspondenceId" value={correspondenceId} />
      <label htmlFor={textId} className="text-[11px] uppercase tracking-wide text-white/35">
        Tu respuesta
      </label>
      <textarea
        id={textId}
        name="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={maxLength}
        required
        rows={5}
        className="rounded border border-white/15 bg-black/20 p-3 text-sm leading-relaxed text-white/90 focus:border-white/40 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || text.trim().length === 0}
          className="rounded border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
        >
          {pending ? "Enviando…" : "Enviar"}
        </button>
        <span className="text-[11px] text-white/35">
          {text.length}/{maxLength}
        </span>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state.result && (
        <p role={sent ? "status" : "alert"} className={`text-sm ${sent ? "text-white/70" : "text-red-300"}`}>
          {describeSeedPhraseLetterResult(state.result)}
        </p>
      )}
    </form>
  );
}
