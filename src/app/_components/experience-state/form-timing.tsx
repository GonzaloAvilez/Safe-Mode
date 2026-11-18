"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { createStrictContext } from "./create-strict-context";

export type ExperienceForm = "write" | "leave-a-trace" | "contribute";

type FormTiming = {
  getRenderedAt: (form: ExperienceForm) => number;
  setRenderedAt: (form: ExperienceForm, renderedAt: number) => void;
  getHoneypotValue: (form: ExperienceForm) => string;
  setHoneypotValue: (form: ExperienceForm, value: string) => void;
  resetRitualTimings: () => void;
};

const [FormTimingContext, useFormTiming] = createStrictContext<FormTiming>("useFormTiming");

// Anti-bot state survives remounts: the locale switch, and Leave a Trace moving from writing to
// the letters choice, which sends the phrase from a different component than the one that
// showed the form. Keeping the timestamps outside drafts prevents a legitimate immediate submit
// after switching language from being rejected; keeping the honeypot value means a field a bot
// filled in one step still counts in the step that finally sends.
export function FormTimingProvider({ children }: { children: ReactNode }) {
  const renderedAtByForm = useRef<Partial<Record<ExperienceForm, number>>>({});
  const honeypotByForm = useRef<Partial<Record<ExperienceForm, string>>>({});

  const getRenderedAt = useCallback((form: ExperienceForm) => {
    const existing = renderedAtByForm.current[form];
    if (existing !== undefined) return existing;

    const renderedAt = Date.now();
    renderedAtByForm.current[form] = renderedAt;
    return renderedAt;
  }, []);

  const setRenderedAt = useCallback((form: ExperienceForm, renderedAt: number) => {
    renderedAtByForm.current[form] = renderedAt;
  }, []);

  const getHoneypotValue = useCallback((form: ExperienceForm) => honeypotByForm.current[form] ?? "", []);

  const setHoneypotValue = useCallback((form: ExperienceForm, value: string) => {
    honeypotByForm.current[form] = value;
  }, []);

  const resetRitualTimings = useCallback(() => {
    delete renderedAtByForm.current.write;
    delete renderedAtByForm.current["leave-a-trace"];
    delete honeypotByForm.current.write;
    delete honeypotByForm.current["leave-a-trace"];
  }, []);

  return (
    <FormTimingContext.Provider
      value={{ getRenderedAt, setRenderedAt, getHoneypotValue, setHoneypotValue, resetRitualTimings }}
    >
      {children}
    </FormTimingContext.Provider>
  );
}

export { useFormTiming };

