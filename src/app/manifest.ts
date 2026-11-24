import type { MetadataRoute } from "next";

// ADR-005: just enough for Refugio to be installed on a Home Screen, where iOS delivers web push.
// start_url is "/" on purpose: the proxy sends it on to the person's locale, as for any visit.
// The icons are drawn from docs/design/refugio-icon.svg, the same door as src/app/icon.png.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Refugio",
    short_name: "Refugio",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
