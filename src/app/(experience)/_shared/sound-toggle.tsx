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
      aria-label={enabled ? "Turn sound off" : "Turn sound on"}
      data-ui-zone="sound-toggle"
      className={`group fixed top-10 right-12 z-20 flex h-6 w-11 items-center rounded-full border p-0.5 transition-colors duration-300 ${
        enabled
          ? "border-[rgba(200,160,30,0.5)] bg-[rgba(200,160,30,0.15)]"
          : "border-white/20 bg-white/[0.04] hover:border-white/35"
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full shadow-sm transition-transform duration-300 ${
          enabled ? "translate-x-5 bg-[rgba(210,160,32,0.9)]" : "translate-x-0 bg-white/50 group-hover:bg-white/65"
        }`}
      />
    </button>
  );
}
