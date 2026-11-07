"use client";
import * as React from "react";
import { CloudOff, RefreshCw, TriangleAlert, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dropOutboxItem, useOutbox } from "@/lib/offline";

/** Tells staff when they are offline, what is waiting to sync, and anything the school turned down. */
export function OfflineBar() {
  const o = useOutbox();
  React.useEffect(() => {
    if (!o.lastSent) return;
    const t = setTimeout(o.clearLastSent, 5000);
    return () => clearTimeout(t);
  }, [o.lastSent, o.clearLastSent]);

  const bar = "no-print mb-4 flex flex-col gap-2 rounded-2xl px-4 py-3 text-sm sm:flex-row sm:items-center";
  return (
    <div role="status" aria-live="polite">
      {!o.online || o.waiting ? (
        <div className={`${bar} ${o.online ? "bg-amber-50 text-amber-800" : "bg-ink text-white"}`}>
          <span className="flex flex-1 items-start gap-2">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {!o.online ? <strong>You are offline. </strong> : null}
              {o.waiting
                ? `${o.waiting} ${o.waiting === 1 ? "change is" : "changes are"} saved on this phone and will sync when the connection is back: ${o.items.filter((i) => !i.failed).map((i) => i.label).join(", ")}.`
                : "You can still enter scores and take the register. They are kept on this phone and sync when you are back online."}
            </span>
          </span>
          {o.online && o.waiting ? (
            <Button size="sm" variant="white" disabled={o.syncing} onClick={() => void o.sync()}>
              <RefreshCw className={`h-3.5 w-3.5 ${o.syncing ? "animate-spin" : ""}`} /> {o.syncing ? "Syncing…" : "Sync now"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {o.failed.map((f) => (
        <div key={f.key} className={`${bar} bg-rose-50 text-rose-700`}>
          <span className="flex flex-1 items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong>{f.label} were not saved.</strong> {f.failed} Open it, fix it and save again.</span>
          </span>
          <Button size="sm" variant="outline" onClick={() => void dropOutboxItem(f.key)}>Dismiss</Button>
        </div>
      ))}
      {o.lastSent && o.online && !o.waiting ? (
        <div className={`${bar} bg-emerald-50 text-emerald-700`}>
          <span className="flex items-center gap-2"><Wifi className="h-4 w-4" /> Back online. {o.lastSent === 1 ? "1 change" : `${o.lastSent} changes`} synced.</span>
        </div>
      ) : null}
    </div>
  );
}
