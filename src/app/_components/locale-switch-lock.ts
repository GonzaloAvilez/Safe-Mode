export type LocaleSwitchLock = {
  lock: () => void;
  unlock: () => void;
  isLocked: () => boolean;
};

// The mutable value closes the event-sized gap before React can render a disabled
// language selector. The callback keeps the visual state in sync, but correctness
// never depends on that render having happened already.
export function createLocaleSwitchLock(onChange: (locked: boolean) => void): LocaleSwitchLock {
  let locked = false;

  return {
    lock() {
      if (locked) return;
      locked = true;
      onChange(true);
    },
    unlock() {
      if (!locked) return;
      locked = false;
      onChange(false);
    },
    isLocked() {
      return locked;
    },
  };
}

