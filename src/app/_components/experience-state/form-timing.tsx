"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { createStrictContext } from "./create-strict-context";

export type ExperienceForm = "write" | "leave-a-trace" | "contribute";

type FormTiming = {
  getRenderedAt: (form: ExperienceForm) => number;
  setRenderedAt: (form: ExperienceForm, renderedAt: number) => void;
  resetRitualTimings: () => void;
};

const [FormTimingContext, useFormTiming] = createStrictContext<FormTiming>("useFormTiming");

// Anti-bot timestamps survive only locale remounts. Keeping them outside drafts
// prevents a legitimate immediate submit after switching language from being rejected.
export function FormTimingProvider({ children }: { children: ReactNode }) {
  const renderedAtByForm = useRef<Partial<Record<ExperienceForm, number>>>({});

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

  const resetRitualTimings = useCallback(() => {
    delete renderedAtByForm.current.write;
    delete renderedAtByForm.current["leave-a-trace"];
  }, []);

  return (
    <FormTimingContext.Provider value={{ getRenderedAt, setRenderedAt, resetRitualTimings }}>
      {children}
    </FormTimingContext.Provider>
  );
}

export { useFormTiming };

