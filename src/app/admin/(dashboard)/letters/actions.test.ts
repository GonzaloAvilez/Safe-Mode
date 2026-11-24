import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, approve, reject, revalidate, afterMock, notifyMock } = vi.hoisted(() => ({
  auth: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  revalidate: vi.fn(),
  afterMock: vi.fn(),
  notifyMock: vi.fn(),
}));
vi.mock("@/lib/admin-session", () => ({ requireAdminSession: auth }));
vi.mock("@/lib/letter-review", () => ({ approveLetter: approve, rejectLetter: reject }));
vi.mock("@/lib/notifications/notify", () => ({ notify: notifyMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("next/server", () => ({ after: afterMock }));

import { approveLetterAction, rejectLetterAction } from "./actions";

const LETTER_ID = "6f1c2c8e-8a7b-4c1e-9d5a-2b3c4d5e6f70";

function form(id: string | null = LETTER_ID) {
  const data = new FormData();
  if (id !== null) data.set("id", id);
  return data;
}

// Runs whatever the action handed to after(), the way Next does once the response is sent.
async function runScheduled() {
  for (const [task] of afterMock.mock.calls) await task();
}

beforeEach(() => vi.resetAllMocks());

describe("approveLetterAction", () => {
  it("notifies the letter's recipient after the response, without waiting on it", async () => {
    approve.mockResolvedValueOnce({ ok: true, recipientIdentityId: "recipient-1" });

    await approveLetterAction(form());

    expect(approve).toHaveBeenCalledWith(LETTER_ID);
    expect(afterMock).toHaveBeenCalledOnce();
    expect(notifyMock).not.toHaveBeenCalled(); // only scheduled so far
    await runScheduled();
    expect(notifyMock).toHaveBeenCalledWith("recipient-1", "letter_delivered");
    expect(revalidate).toHaveBeenCalledWith("/admin/letters");
  });

  // A double click or a second tab: only the approval that delivered the letter notifies.
  it("schedules nothing when the letter was already decided", async () => {
    approve.mockResolvedValueOnce({ ok: false, reason: "already_decided" });

    await approveLetterAction(form());

    expect(afterMock).not.toHaveBeenCalled();
  });

  it("schedules exactly one notice across two concurrent approvals of one letter", async () => {
    approve
      .mockResolvedValueOnce({ ok: true, recipientIdentityId: "recipient-1" })
      .mockResolvedValueOnce({ ok: false, reason: "already_decided" });

    await Promise.all([approveLetterAction(form()), approveLetterAction(form())]);

    expect(afterMock).toHaveBeenCalledOnce();
  });

  it("schedules nothing when nobody can be notified (a seed phrase the founder answers)", async () => {
    approve.mockResolvedValueOnce({ ok: true, recipientIdentityId: null });

    await approveLetterAction(form());

    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidate).toHaveBeenCalledWith("/admin/letters");
  });

  it("rejects an unauthenticated direct invocation before approving anything", async () => {
    auth.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(approveLetterAction(form())).rejects.toThrow("NEXT_REDIRECT");
    expect(approve).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("does nothing without a letter id", async () => {
    await approveLetterAction(form(null));

    expect(approve).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });
});

describe("rejectLetterAction", () => {
  it("never notifies: v1 only tells people about delivered letters", async () => {
    reject.mockResolvedValueOnce({ ok: true });

    await rejectLetterAction(form());

    expect(reject).toHaveBeenCalledWith(LETTER_ID);
    expect(afterMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
