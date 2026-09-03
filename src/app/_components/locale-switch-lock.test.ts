import { describe, expect, it, vi } from "vitest";
import { createLocaleSwitchLock } from "./locale-switch-lock";

describe("createLocaleSwitchLock", () => {
  it("locks synchronously before the UI notification runs", () => {
    const onChange = vi.fn(() => expect(lock.isLocked()).toBe(true));
    const lock = createLocaleSwitchLock(onChange);

    lock.lock();

    expect(lock.isLocked()).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("stays locked until the destination explicitly unlocks it", () => {
    const onChange = vi.fn();
    const lock = createLocaleSwitchLock(onChange);

    lock.lock();
    // Finishing an API request does not implicitly release a navigation lock.
    expect(lock.isLocked()).toBe(true);

    lock.unlock();
    expect(lock.isLocked()).toBe(false);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("is idempotent under repeated clicks and unlocks", () => {
    const onChange = vi.fn();
    const lock = createLocaleSwitchLock(onChange);

    lock.lock();
    lock.lock();
    lock.unlock();
    lock.unlock();

    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });
});
