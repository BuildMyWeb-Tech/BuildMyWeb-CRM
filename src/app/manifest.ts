import type { MetadataRoute } from "next";

// PWA manifest — served at /manifest.webmanifest, linked from
// src/app/layout.tsx's metadata.manifest. Icons live as static
// files in /public/icons (generated from the real BuildMyWeb logo
// asset, not the hand-approximated SVG chevron used in
// src/app/icon.tsx/src/components/layout/sidebar.tsx — this is the
// one place a pixel-accurate raster actually matters, since it's
// what shows on a phone's home screen).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BuildMyWeb CRM",
    short_name: "BMW CRM",
    description:
      "BuildMyWeb CRM — sales, client projects, and company operations in one place.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}