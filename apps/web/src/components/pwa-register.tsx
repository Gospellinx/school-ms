"use client";
import * as React from "react";

/** Registers the service worker that keeps pages and data for offline use. Production builds only, so dev reloads stay fresh. */
export function PwaRegister() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
