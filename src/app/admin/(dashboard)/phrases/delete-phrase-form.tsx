"use client";

import { useActionState, useId, useState } from "react";
import { deletePhraseAction } from "./actions";

export function DeletePhraseForm({ id, text }: { id: string; text: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deletePhraseAction, {});
  const confirmationId = useId();

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <button
        type="button"
        aria-expanded={confirming}
        aria-controls={confirmationId}
        disabled={pending || state.deleted}
        onClick={() => setConfirming(!confirming)}
        className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
      >
        {confirming ? "Cancelar" : "Eliminar definitivamente"}
      </button>
      {confirming && (
        <form id={confirmationId} action={action} className="mt-3 flex flex-col gap-3 rounded border border-red-500/20 bg-red-500/5 p-3">
          <input type="hidden" name="id" value={id} />
          <p className="text-sm text-white/80">¿Eliminar definitivamente esta frase?</p>
          <blockquote className="break-words border-l-2 border-white/20 pl-3 text-sm text-white/70">{text}</blockquote>
          <p className="text-xs text-white/50">Se borrarán la frase, su narrativa y sus resonancias. Esta acción no se puede deshacer.</p>
          {state.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
          {state.deleted && <p role="status" className="text-sm text-white/70">Frase eliminada.</p>}
          <button
            type="submit"
            disabled={pending || state.deleted}
            className="self-start rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/20 disabled:opacity-50"
          >
            {pending ? "Eliminando…" : "Sí, eliminar definitivamente"}
          </button>
        </form>
      )}
    </div>
  );
}
