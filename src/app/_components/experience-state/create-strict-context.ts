import { createContext, useContext } from "react";

export function createStrictContext<T>(hookName: string) {
  const Context = createContext<T | null>(null);

  function useStrictContext(): T {
    const value = useContext(Context);
    if (!value) throw new Error(`${hookName} must be used within ExperienceProviders`);
    return value;
  }

  return [Context, useStrictContext] as const;
}

