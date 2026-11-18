import { afterEach, describe, expect, it, vi } from "vitest";

const { isLettersOpenMock } = vi.hoisted(() => ({ isLettersOpenMock: vi.fn() }));

vi.mock("@/lib/settings", () => ({ isLettersOpen: isLettersOpenMock }));
vi.mock("./_components/leave-a-trace-screen", () => ({ LeaveATraceScreen: () => null }));

import LeaveATracePage, { dynamic } from "./page";

afterEach(() => {
  vi.clearAllMocks();
});

describe("Leave a Trace page", () => {
  it.each([true, false])("hands the screen whether letters are open: %s", async (open) => {
    isLettersOpenMock.mockResolvedValue(open);

    const element = await LeaveATracePage();

    expect(element.props.lettersOpen).toBe(open);
  });

  it("is rendered on every visit: the founder can flip the switch any time, so it must not be frozen at build", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
