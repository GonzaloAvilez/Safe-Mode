// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";

const { readSealFromImageMock } = vi.hoisted(() => ({ readSealFromImageMock: vi.fn() }));
vi.mock("../../_shared/return-key/read-seal-from-image", () => ({ readSealFromImage: readSealFromImageMock }));

import { MAILBOX_CHECK_MS, MAILBOX_FAIL_MS, MAILBOX_OPEN_MS } from "../../_shared/mailbox-scene";
import { ShowSealStep } from "./show-seal-step";
import { SEAL, correspondence, renderMailbox } from "./mailbox-test-harness";

const T = es.mailbox.show;
const MAILBOX = { correspondences: [correspondence()] };

function stubFetch(response: Response | Error | Promise<Response>) {
  const fetchMock =
    response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockReturnValue(Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function reduceMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query }));
}

const imageInput = () => screen.getByLabelText(T.chooseImage) as HTMLInputElement;
const status = () => screen.getByRole("status");
const stage = () => document.querySelector("[data-stage]")!.getAttribute("data-stage");
const phase = () => screen.getByTestId("phase").textContent;

const picture = () => new File(["png"], "refugio-sello.png", { type: "image/png" });

function choosePicture(input = imageInput()) {
  const file = picture();
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

// A drag from outside the page: a picture carries "Files"; text dragged within the page doesn't.
const carrying = (types: string[], files: File[] = []) => ({ dataTransfer: { types, files } });

function dropPicture(file = picture()) {
  const drop = createEvent.drop(document, carrying(["Files"], [file]));
  fireEvent(document, drop);
  return { file, drop };
}

beforeEach(() => {
  reduceMotion(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  readSealFromImageMock.mockReset();
});

describe("ShowSealStep, the picture is the seal", () => {
  it("has no digits to type and no button to press: the picture is the only way in", () => {
    renderMailbox(<ShowSealStep />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(imageInput().type).toBe("file");
    expect(stage()).toBe("closed");
  });

  it("opens the mailbox with the seal read from a chosen picture, sending only the seal in the header", async () => {
    readSealFromImageMock.mockResolvedValue(SEAL);
    const fetchMock = stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    const file = choosePicture();

    await waitFor(() => expect(phase()).toBe("correspondences"));
    expect(readSealFromImageMock).toHaveBeenCalledWith(file);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mailbox");
    expect(init.headers.Authorization).toBe(`Bearer ${SEAL}`);
    expect(screen.getByTestId("key").textContent).toBe(SEAL);
    expect(screen.getByTestId("opened").textContent).toBe("1");
  });

  it("never uploads the picture: the only request carries the seal, and no body", async () => {
    readSealFromImageMock.mockResolvedValue(SEAL);
    const fetchMock = stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    choosePicture();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it("keeps the seal out of the browser's storage and the address bar", async () => {
    localStorage.clear();
    sessionStorage.clear();
    readSealFromImageMock.mockResolvedValue(SEAL);
    stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    choosePicture();

    await waitFor(() => expect(phase()).toBe("correspondences"));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(window.location.href).not.toContain(SEAL);
  });

  it("says when there's no seal in the picture, sends nothing, and offers another picture", async () => {
    readSealFromImageMock.mockResolvedValue(null);
    const fetchMock = stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    choosePicture();

    await waitFor(() => expect(status().textContent).toBe(`${T.noSealInImage}${T.noSealInImageHint}`));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(T.chooseAnother)).toBeTruthy();
  });

  it("a picture that opens the mailbox after one that didn't goes through", async () => {
    readSealFromImageMock.mockResolvedValueOnce(null).mockResolvedValueOnce(SEAL);
    stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    choosePicture();
    await screen.findByLabelText(T.chooseAnother);
    await waitFor(() => expect((screen.getByLabelText(T.chooseAnother) as HTMLInputElement).disabled).toBe(false));
    choosePicture(screen.getByLabelText(T.chooseAnother) as HTMLInputElement);

    await waitFor(() => expect(phase()).toBe("correspondences"));
  });

  it("says, plainly, that a seal opens nothing, and stays on this step", async () => {
    readSealFromImageMock.mockResolvedValue(SEAL);
    stubFetch(Response.json({ error: "return key not recognized" }, { status: 401 }));
    renderMailbox(<ShowSealStep />);

    choosePicture();

    await waitFor(() => expect(status().textContent).toBe(`${T.notRecognized}${T.notRecognizedHint}`));
    expect(phase()).toBe("showing_seal");
    expect(screen.getByTestId("key").textContent).toBe("");
  });

  it.each([
    ["too many tries", Response.json({}, { status: 429 }), T.tooMany],
    ["a server error", new Response("boom", { status: 500 }), T.failed],
    ["no connection", new TypeError("Failed to fetch"), es.common.errors.couldntConnect],
  ])("on %s, says so and lets the person try again", async (_label, response, expected) => {
    readSealFromImageMock.mockResolvedValue(SEAL);
    stubFetch(response);
    renderMailbox(<ShowSealStep />);

    choosePicture();

    await waitFor(() => expect(status().textContent).toBe(expected));
    expect(phase()).toBe("showing_seal");
    await waitFor(() => expect(imageInput().disabled).toBe(false));
    expect(stage()).toBe("closed");
  });

  it("says it is reading, then opening, holding the language switch until it's done", async () => {
    let read: (seal: string | null) => void = () => {};
    let answer: (response: Response) => void = () => {};
    readSealFromImageMock.mockReturnValue(new Promise((resolve) => (read = resolve)));
    stubFetch(new Promise<Response>((resolve) => (answer = resolve)));
    renderMailbox(<ShowSealStep />);

    choosePicture();

    await waitFor(() => expect(status().textContent).toBe(T.reading));
    expect(screen.getByTestId("locked").textContent).toBe("true");
    expect(stage()).toBe("checking");
    await act(async () => read(SEAL));
    expect(status().textContent).toBe(T.opening);
    expect(imageInput().disabled).toBe(true);

    await act(async () => answer(Response.json(MAILBOX)));

    await waitFor(() => expect(phase()).toBe("correspondences"));
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });
});

describe("ShowSealStep, dropping the picture", () => {
  it("opens the mailbox with a picture dropped anywhere on the page, which the browser doesn't open", async () => {
    readSealFromImageMock.mockResolvedValue(SEAL);
    stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    const { file, drop } = dropPicture();

    expect(drop.defaultPrevented).toBe(true);
    await waitFor(() => expect(phase()).toBe("correspondences"));
    expect(readSealFromImageMock).toHaveBeenCalledWith(file);
  });

  it("lifts the mailbox while a picture is over the page, and lets it rest when it leaves", () => {
    renderMailbox(<ShowSealStep />);

    fireEvent.dragEnter(document, carrying(["Files"]));
    // Moving onto an element inside the page enters it before leaving the one before.
    fireEvent.dragEnter(document, carrying(["Files"]));
    fireEvent.dragLeave(document, carrying(["Files"]));
    expect(stage()).toBe("awaiting_drop");

    fireEvent.dragLeave(document, carrying(["Files"]));
    expect(stage()).toBe("closed");
  });

  it("keeps the dragover so the browser allows the drop", () => {
    renderMailbox(<ShowSealStep />);
    const over = createEvent.dragOver(document, carrying(["Files"]));

    fireEvent(document, over);

    expect(over.defaultPrevented).toBe(true);
  });

  it("ignores text or links dragged within the page", () => {
    readSealFromImageMock.mockResolvedValue(SEAL);
    renderMailbox(<ShowSealStep />);
    const drop = createEvent.drop(document, carrying(["text/plain"], []));

    fireEvent.dragEnter(document, carrying(["text/plain"]));
    expect(stage()).toBe("closed");
    fireEvent(document, drop);

    expect(drop.defaultPrevented).toBe(false);
    expect(readSealFromImageMock).not.toHaveBeenCalled();
  });

  it("starts one opening however many pictures are given while it's busy", async () => {
    readSealFromImageMock.mockReturnValue(new Promise(() => {}));
    renderMailbox(<ShowSealStep />);

    choosePicture();
    dropPicture();
    dropPicture();

    await waitFor(() => expect(status().textContent).toBe(T.reading));
    expect(readSealFromImageMock).toHaveBeenCalledOnce();
  });

  it("stops listening for dropped pictures once the step is gone", () => {
    readSealFromImageMock.mockResolvedValue(SEAL);
    const view = renderMailbox(<ShowSealStep />);
    view.unmount();

    const { drop } = dropPicture();

    expect(drop.defaultPrevented).toBe(false);
    expect(readSealFromImageMock).not.toHaveBeenCalled();
  });
});

describe("ShowSealStep, the door's timing", () => {
  async function flush(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("never opens the door before the light went round, nor the mailbox before the door, even if the server answered at once", async () => {
    reduceMotion(false);
    vi.useFakeTimers();
    readSealFromImageMock.mockResolvedValue(SEAL);
    stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);
    await flush(10);

    choosePicture();
    await flush(MAILBOX_CHECK_MS - 50);
    expect(stage()).toBe("checking");

    await flush(100);
    expect(stage()).toBe("opening");
    expect(phase()).toBe("showing_seal");

    await flush(MAILBOX_OPEN_MS);
    expect(phase()).toBe("correspondences");
  });

  it("a seal that opens nothing puts the light out, then the door is as it was, with the reason", async () => {
    reduceMotion(false);
    vi.useFakeTimers();
    readSealFromImageMock.mockResolvedValue(SEAL);
    stubFetch(Response.json({}, { status: 401 }));
    renderMailbox(<ShowSealStep />);
    await flush(10);

    choosePicture();
    await flush(MAILBOX_CHECK_MS + 10);
    expect(stage()).toBe("failing");
    expect(status().textContent).toBe(`${T.notRecognized}${T.notRecognizedHint}`);
    expect(imageInput().disabled).toBe(true);

    await flush(MAILBOX_FAIL_MS);
    expect(stage()).toBe("closed");
    expect(imageInput().disabled).toBe(false);
    expect(status().textContent).toBe(`${T.notRecognized}${T.notRecognizedHint}`);
  });

  it("with reduced motion, opens as soon as the server answers", async () => {
    readSealFromImageMock.mockResolvedValue(SEAL);
    stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    choosePicture();

    // Well under the light's round: nothing waits for an animation that isn't shown.
    await waitFor(() => expect(phase()).toBe("correspondences"), { timeout: MAILBOX_CHECK_MS / 2 });
  });
});

// The step taken away without closing the mailbox: going to another screen.
function LeavableStep() {
  const [here, setHere] = useState(true);
  return (
    <>
      {here && <ShowSealStep />}
      <button type="button" onClick={() => setHere(false)}>
        irse a otra pantalla
      </button>
    </>
  );
}

describe("ShowSealStep, leaving for another screen mid-way", () => {
  const expectClosed = () => {
    expect(screen.getByTestId("key").textContent).toBe("");
    expect(screen.getByTestId("opened").textContent).toBe("");
    expect(phase()).toBe("showing_seal");
  };

  it("a mailbox that arrives after the step is gone doesn't open", async () => {
    let answer: (response: Response) => void = () => {};
    readSealFromImageMock.mockResolvedValue(SEAL);
    stubFetch(new Promise<Response>((resolve) => (answer = resolve)));
    renderMailbox(<LeavableStep />);
    choosePicture();
    await waitFor(() => expect(status().textContent).toBe(T.opening));

    fireEvent.click(screen.getByText("irse a otra pantalla"));
    await act(async () => answer(Response.json(MAILBOX)));

    expectClosed();
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });

  it("a seal read after the step is gone opens nothing and asks nothing", async () => {
    let read: (seal: string | null) => void = () => {};
    readSealFromImageMock.mockReturnValue(new Promise((resolve) => (read = resolve)));
    const fetchMock = stubFetch(Response.json(MAILBOX));
    renderMailbox(<LeavableStep />);
    choosePicture();
    await waitFor(() => expect(status().textContent).toBe(T.reading));

    fireEvent.click(screen.getByText("irse a otra pantalla"));
    await act(async () => read(SEAL));

    expect(fetchMock).not.toHaveBeenCalled();
    expectClosed();
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });

  it("leaving while the door is opening keeps the mailbox closed", async () => {
    reduceMotion(false);
    vi.useFakeTimers();
    readSealFromImageMock.mockResolvedValue(SEAL);
    stubFetch(Response.json(MAILBOX));
    renderMailbox(<LeavableStep />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    choosePicture();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAILBOX_CHECK_MS + 10);
    });
    expect(stage()).toBe("opening");

    fireEvent.click(screen.getByText("irse a otra pantalla"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAILBOX_OPEN_MS);
    });

    expectClosed();
    expect(screen.getByTestId("locked").textContent).toBe("false");
  });
});
