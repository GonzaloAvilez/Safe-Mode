"use client";

import { useState } from "react";
import { useFormTiming, type ExperienceForm } from "@/app/_components/experience-state/form-timing";

const HONEYPOT_FIELD_NAME = "website";

// A visitor never sees or fills this field. A form-filling bot, scanning the DOM
// for inputs rather than rendering it, typically will. Paired with formRenderedAt
// (also captured here) so the API can reject either signal — see bot-protection.ts.
//
// Both survive the component remounting, through FormTimingProvider: a step that sends what an
// earlier step collected (Leave a Trace's letters choice) still carries a field a bot filled
// in before.
export function useHoneypot(form: ExperienceForm) {
  const { getRenderedAt, setRenderedAt, getHoneypotValue, setHoneypotValue } = useFormTiming();
  const [honeypot, setLocalHoneypot] = useState(() => getHoneypotValue(form));
  const [formRenderedAt, setLocalFormRenderedAt] = useState(() => getRenderedAt(form));

  function setHoneypot(value: string) {
    setLocalHoneypot(value);
    setHoneypotValue(form, value);
  }

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
