import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { intlMiddlewareMock, isContributeOpenMock, isSitePublicMock } = vi.hoisted(() => ({
  intlMiddlewareMock: vi.fn(() => new Response(null, { headers: { "x-intl": "handled" } })),
  isContributeOpenMock: vi.fn(),
  isSitePublicMock: vi.fn(),
}));

vi.mock("next-intl/middleware", () => ({
  default: vi.fn(() => intlMiddlewareMock),
}));

vi.mock("@/lib/settings", () => ({
  isContributeOpen: isContributeOpenMock,
  isSitePublic: isSitePublicMock,
}));

const { proxy } = await import("@/proxy");

function request(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("locale routing proxy", () => {
  it.each(["/api/phrases", "/closed", "/icon.png"])("keeps %s outside locale routing", async (pathname) => {
    const response = await proxy(request(pathname));

    expect(response.headers.get("x-intl")).toBeNull();
    expect(intlMiddlewareMock).not.toHaveBeenCalled();
  });

  it.each(["/api/observe?locale=es", "/api/entries", "/api/phrases"])(
    "does not canonicalize the unprefixed API path %s as a locale alias",
    async (pathname) => {
      if (pathname !== "/api/phrases") isSitePublicMock.mockResolvedValueOnce(true);

      const response = await proxy(request(pathname));

      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-intl")).toBeNull();
      expect(intlMiddlewareMock).not.toHaveBeenCalled();
    }
  );

  it("hands public experience routes to locale negotiation", async () => {
    isSitePublicMock.mockResolvedValueOnce(true);

    const response = await proxy(request("/"));

    expect(response.headers.get("x-intl")).toBe("handled");
    expect(intlMiddlewareMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["/en/admin", "/admin"],
    ["/es/admin/phrases?status=pending", "/admin/phrases?status=pending"],
    ["/en/closed", "/closed"],
  ])("canonicalizes %s to the locale-independent URL", async (source, destination) => {
    const response = await proxy(request(source));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://localhost${destination}`);
    expect(intlMiddlewareMock).not.toHaveBeenCalled();
  });

  it.each(["/es/api/observe", "/es/api/entries"])(
    "does not canonicalize the locale-prefixed API path %s into a working API",
    async (pathname) => {
      isSitePublicMock.mockResolvedValueOnce(true);

      const response = await proxy(request(pathname));

      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-intl")).toBe("handled");
    }
  );

  it.each([
    ["/fr", "/en"],
    ["/FR/observe?from=test", "/en/observe?from=test"],
    ["/es-MX", "/es"],
    ["/ES-mx/observe?from=test", "/es/observe?from=test"],
    ["/en-US/write", "/en/write"],
    ["/fr-CA/write", "/en/write"],
  ])("falls back from unsupported locale %s to %s", async (source, destination) => {
    const response = await proxy(request(source));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://localhost${destination}`);
    expect(intlMiddlewareMock).not.toHaveBeenCalled();
  });

  it.each([
    ["/es-MX/admin/phrases?status=pending", "/admin/phrases?status=pending"],
    ["/en-US/closed", "/closed"],
  ])("canonicalizes locale aliases on independent pages without a second redirect", async (source, destination) => {
    const response = await proxy(request(source));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://localhost${destination}`);
  });

  it("does not redirect an API prefixed by a locale alias", async () => {
    const response = await proxy(request("/es-MX/api/entries"));

    expect(response.headers.get("location")).toBeNull();
    expect(intlMiddlewareMock).not.toHaveBeenCalled();
  });

  it("leaves ordinary unprefixed paths to locale negotiation", async () => {
    isSitePublicMock.mockResolvedValueOnce(true);

    const response = await proxy(request("/unknown"));

    expect(response.headers.get("x-intl")).toBe("handled");
  });

  it("applies the contribute gate after stripping either locale prefix", async () => {
    isContributeOpenMock.mockResolvedValue(true);

    await proxy(request("/en/contribute"));
    await proxy(request("/es/contribute"));

    expect(intlMiddlewareMock).toHaveBeenCalledTimes(2);
    expect(isSitePublicMock).not.toHaveBeenCalled();
  });

  it("redirects a localized experience route to /closed when the site is closed", async () => {
    isSitePublicMock.mockResolvedValueOnce(false);

    const response = await proxy(request("/es/observe"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/closed");
    expect(intlMiddlewareMock).not.toHaveBeenCalled();
  });
});
