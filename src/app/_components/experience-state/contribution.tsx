"use client";

import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createStrictContext } from "./create-strict-context";

type ContributionState = {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  count: number;
  setCount: Dispatch<SetStateAction<number>>;
  saved: boolean;
  setSaved: Dispatch<SetStateAction<boolean>>;
};

const [ContributionStateContext, useContributionState] =
  createStrictContext<ContributionState>("useContributionState");

// Contribute is a standalone looping tool, not part of the visitor ritual; its
// progress therefore survives locale changes but is not cleared by resetRitual.
export function ContributionStateProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState("");
  const [count, setCount] = useState(0);
  const [saved, setSaved] = useState(false);

  return (
    <ContributionStateContext.Provider value={{ draft, setDraft, count, setCount, saved, setSaved }}>
      {children}
    </ContributionStateContext.Provider>
  );
}

export { useContributionState };

