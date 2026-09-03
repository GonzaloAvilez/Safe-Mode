"use client";

import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createStrictContext } from "./create-strict-context";

type ExperiencePreferences = {
  arrivalBeat: number;
  setArrivalBeat: Dispatch<SetStateAction<number>>;
  soundEnabled: boolean;
  setSoundEnabled: Dispatch<SetStateAction<boolean>>;
};

const [PreferencesContext, useExperiencePreferences] =
  createStrictContext<ExperiencePreferences>("useExperiencePreferences");

// UI preferences live for the current tab session so locale route remounts do not
// replay the arrival narrative or unexpectedly change the visitor's sound choice.
export function ExperiencePreferencesProvider({ children }: { children: ReactNode }) {
  const [arrivalBeat, setArrivalBeat] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);

  return (
    <PreferencesContext.Provider value={{ arrivalBeat, setArrivalBeat, soundEnabled, setSoundEnabled }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export { useExperiencePreferences };

