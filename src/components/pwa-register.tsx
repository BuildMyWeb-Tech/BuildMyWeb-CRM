"use client";

import { useEffect } from "react";

// Registers the minimal passthrough service worker
// (public/sw.js) so browsers offer the "Add to Home Screen" /
// "Install app" prompt. See sw.js for why it deliberately does
// nothing beyond that.
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[pwa] service worker registration failed:", err);
    });
  }, []);

  return null;
}