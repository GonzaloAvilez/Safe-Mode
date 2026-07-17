"use client";

import { useState } from "react";

const HONEYPOT_FIELD_NAME = "website";

// A visitor never sees or fills this field. A form-filling bot, scanning the DOM
// for inputs rather than rendering it, typically will. Paired with formRenderedAt
// (also captured here) so the API can reject either signal — see bot-protection.ts.
export function useHoneypot() {
  const [honeypot, setHoneypot] = useState("");
  const [formRenderedAt] = useState(() => Date.now());

  return { honeypot, setHoneypot, formRenderedAt };
}

export function HoneypotField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="text"
      name={HONEYPOT_FIELD_NAME}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      className="pointer-events-none absolute left-[-9999px] top-[-9999px] h-0 w-0 opacity-0"
    />
  );
}
