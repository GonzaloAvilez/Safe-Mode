"use client";

import { useState } from "react";
import { useFormTiming, type ExperienceForm } from "@/app/_components/experience-state/form-timing";

const HONEYPOT_FIELD_NAME = "website";

// A visitor never sees or fills this field. A form-filling bot, scanning the DOM
// for inputs rather than rendering it, typically will. Paired with formRenderedAt
// (also captured here) so the API can reject either signal — see bot-protection.ts.
export function useHoneypot(form: ExperienceForm) {
  const { getRenderedAt, setRenderedAt } = useFormTiming();
  const [honeypot, setHoneypot] = useState("");
  const [formRenderedAt, setLocalFormRenderedAt] = useState(() => getRenderedAt(form));

  function restartHoneypot() {
    const renderedAt = Date.now();
    setHoneypot("");
    setLocalFormRenderedAt(renderedAt);
    setRenderedAt(form, renderedAt);
  }

  return { honeypot, setHoneypot, formRenderedAt, restartHoneypot };
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
