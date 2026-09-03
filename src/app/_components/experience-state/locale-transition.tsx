"use client";

import { useState, type ReactNode } from "react";
import { createLocaleSwitchLock } from "../locale-switch-lock";
import { createStrictContext } from "./create-strict-context";

type LocaleTransition = {
  locked: boolean;
  lock: () => void;
  unlock: () => void;
  isLocked: () => boolean;
};

const [LocaleTransitionContext, useLocaleTransition] =
  createStrictContext<LocaleTransition>("useLocaleTransition");

// The lock has a synchronous imperative value for event safety and a React value
// for disabled UI. Write holds it until Mirror mounts; settled forms release it.
export function LocaleTransitionProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [controller] = useState(() => createLocaleSwitchLock(setLocked));

  return (
    <LocaleTransitionContext.Provider
      value={{ locked, lock: controller.lock, unlock: controller.unlock, isLocked: controller.isLocked }}
    >
      {children}
    </LocaleTransitionContext.Provider>
  );
}

export { useLocaleTransition };

