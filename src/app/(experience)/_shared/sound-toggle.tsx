"use client";

import { useState } from "react";
import { setSoundEnabled } from "./handpan-audio";

// Off by default, every fresh load — no autoplay, ever. This is a wellness app that
// touches crisis-adjacent content; nobody should be surprised by sound, e.g. in a
// public place. Rendered once in the shared (experience) layout so it (and the
// underlying AudioContext singleton in handpan-audio.ts) persists across client-side
// navigation between screens instead of resetting per-page.
export function SoundToggle() {
  const [enabled, setEnabled] = useState(false);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setSoundEnabled(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Silenciar sonido" : "Activar sonido"}
      className="group fixed top-10 right-12 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 transition-colors duration-300 hover:border-white/40"
    >
      <span
        className={`h-2 w-2 rounded-full transition-colors duration-300 ${
          enabled ? "bg-[rgba(210,158,32,0.85)]" : "bg-white/25 group-hover:bg-white/40"
        }`}
      />
    </button>
  );
}
