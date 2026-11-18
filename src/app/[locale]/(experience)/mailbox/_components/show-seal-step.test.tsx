// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";

const { readSealFromImageMock } = vi.hoisted(() => ({ readSealFromImageMock: vi.fn() }));
vi.mock("./read-seal-from-image", () => ({ readSealFromImage: readSealFromImageMock }));

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

const sealField = () => screen.getByLabelText(T.fieldLabel);
const imageInput = () => screen.getByLabelText(T.chooseImage) as HTMLInputElement;
const status = () => screen.getByRole("status");

function typeAndOpen(text: string) {
  fireEvent.change(sealField(), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: T.submit }));
}

function choosePicture(input = imageInput()) {
  const file = new File(["png"], "refugio-sello.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  readSealFromImageMock.mockReset();
});

describe("ShowSealStep, typing the numbers", () => {
  it("sends nothing until the seal is whole", () => {
    const fetchMock = stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    typeAndOpen("48213 39017");

    expect(status().textContent).toBe(T.incomplete);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the mailbox with the seal however it was typed, sending only its digits in the header", async () => {
    const fetchMock = stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    typeAndOpen("48213 · 39017 · 56229");

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("correspondences"));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mailbox");
    expect(init.headers.Authorization).toBe(`Bearer ${SEAL}`);
    expect(screen.getByTestId("key").textContent).toBe(SEAL);
    expect(screen.getByTestId("opened").textContent).toBe("1");
  });

  it("keeps the seal out of the browser's storage and the address bar", async () => {
    localStorage.clear();
    sessionStorage.clear();
    stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    typeAndOpen(SEAL);

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("correspondences"));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(window.location.href).not.toContain(SEAL);
  });

  it("says, plainly, that a seal opens nothing, and stays on this step", async () => {
    stubFetch(Response.json({ error: "return key not recognized" }, { status: 401 }));
    renderMailbox(<ShowSealStep />);

    typeAndOpen(SEAL);

    await waitFor(() => expect(status().textContent).toBe(`${T.notRecognized}${T.notRecognizedHint}`));
    expect(screen.getByTestId("phase").textContent).toBe("showing_seal");
    expect(screen.getByTestId("key").textContent).toBe("");
  });

  it.each([
    ["too many tries", Response.json({}, { status: 429 }), T.tooMany],
    ["a server error", new Response("boom", { status: 500 }), T.failed],
    ["no connection", new TypeError("Failed to fetch"), es.common.errors.couldntConnect],
  ])("on %s, says so and lets the person try again", async (_label, response, expected) => {
    stubFetch(response);
    renderMailbox(<ShowSealStep />);

    typeAndOpen(SEAL);

    await waitFor(() => expect(status().textContent).toBe(expected));
    expect(screen.getByTestId("phase").textContent).toBe("showing_seal");
    expect((screen.getByRole("button", { name: T.submit }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("while opening, says so, sends once however many times it's pressed, and holds the language switch", async () => {
    let answer: (response: Response) => void = () => {};
    const fetchMock = stubFetch(new Promise<Response>((resolve) => (answer = resolve)));
    renderMailbox(<ShowSealStep />);

    typeAndOpen(SEAL);
    await waitFor(() => expect(status().textContent).toBe(T.opening));
    fireEvent.submit(sealField().closest("form")!);
    expect(screen.getByTestId("locked").textContent).toBe("true");
    expect((screen.getByRole("button", { name: T.submit }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => answer(Response.json(MAILBOX)));

    expect(fetchMock).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByTestId("locked").textContent).toBe("false"));
  });

  it("a new keystroke clears the last message", async () => {
    stubFetch(Response.json({}, { status: 401 }));
    renderMailbox(<ShowSealStep />);
    typeAndOpen(SEAL);
    await waitFor(() => expect(status().textContent).not.toBe(""));

    fireEvent.change(sealField(), { target: { value: "4" } });

    expect(status().textContent).toBe("");
  });
});

describe("ShowSealStep, choosing the picture", () => {
  it("opens the mailbox with the seal read from the picture", async () => {
    readSealFromImageMock.mockResolvedValue(SEAL);
    const fetchMock = stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    const file = choosePicture();

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("correspondences"));
    expect(readSealFromImageMock).toHaveBeenCalledWith(file);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${SEAL}`);
  });

  it("never uploads the picture: the only request carries the seal, and no body", async () => {
    readSealFromImageMock.mockResolvedValue(SEAL);
    const fetchMock = stubFetch(Response.json(MAILBOX));
    renderMailbox(<ShowSealStep />);

    choosePicture();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
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
    choosePicture(screen.getByLabelText(T.chooseAnother) as HTMLInputElement);

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("correspondences"));
  });

  it("says it is reading the picture while it reads", async () => {
    let read: (seal: string | null) => void = () => {};
    readSealFromImageMock.mockReturnValue(new Promise((resolve) => (read = resolve)));
    renderMailbox(<ShowSealStep />);

    choosePicture();

    await waitFor(() => expect(status().textContent).toBe(T.reading));
    await act(async () => read(null));
  });
});
