"use client";

import { useActionState } from "react";
import { loginAdmin } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAdmin, undefined);

  return (
    <form action={action} className="flex w-full max-w-xs flex-col gap-4">
      <h1 className="text-center text-lg font-medium text-white">Admin — Safe-Mode</h1>
      <input
        type="password"
        name="password"
        placeholder="Contraseña"
        required
        autoFocus
        className="rounded border border-white/15 bg-white/5 px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-white/40"
      />
      {state?.error && <p className="text-center text-sm text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-white/15 px-3 py-2 text-white transition-colors hover:bg-white/10 disabled:opacity-50"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
