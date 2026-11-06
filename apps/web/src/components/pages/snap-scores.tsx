"use client";
import * as React from "react";
import { Camera, ImageUp, RotateCcw, ScanLine, TriangleAlert } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { ErrorNote } from "@/components/ui/feedback";
import { apiUpload, useApi } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import type { Component, SnapReading } from "@/lib/types";
import { cn } from "@/lib/utils";

type Cells = Record<string, Record<string, string>>;

/** Shrinks a phone photo (often 4–12 MB) to about 2000 px on the long side, as JPEG: clear enough to read, quick to send on 3G. */
async function shrink(file: File, maxSide = 2000): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

const toneFor = { high: "green", medium: "amber", low: "red" } as const;
const labelFor = { high: "Matched", medium: "Check", low: "Unsure" } as const;

/**
 * Snap-to-score: photograph a handwritten score sheet, let AI read it, check every number against
 * the photo, then put the scores into the score sheet. Nothing is saved until the teacher presses Save.
 */
export function SnapScores({
  open,
  onClose,
  path,
  rows,
  components,
  current,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** The score sheet's API path. */
  path: string;
  rows: { studentId: string; name: string; admissionNumber: string }[];
  components: Component[];
  /** What the score sheet holds now, to show what a reading would replace. */
  current: Cells;
  onApply: (cells: Cells) => void;
}) {
  const status = useApi<{ enabled: boolean }>(open ? "snap/status" : null);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState<SnapReading | null>(null);
  const [cells, setCells] = React.useState<Cells>({});
  const [assign, setAssign] = React.useState<Record<number, string>>({});
  const camera = React.useRef<HTMLInputElement>(null);
  const gallery = React.useRef<HTMLInputElement>(null);
  const a = useAction();

  const reset = React.useCallback(() => {
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(null);
    setReading(null);
    setCells({});
    setAssign({});
    a.setError(null);
  }, [photo, a]);

  const close = () => {
    reset();
    onClose();
  };

  async function pick(file: File | undefined) {
    if (!file) return;
    reset();
    setPhoto(URL.createObjectURL(file));
    const r = await a.run(async () => apiUpload<SnapReading>(`${path}/snap`, await shrink(file), { mimeType: "image/jpeg" }));
    if (!r) return;
    setReading(r);
    setCells(Object.fromEntries(r.matches.map((m) => [m.studentId, Object.fromEntries(Object.entries(m.scores).map(([k, v]) => [k, String(v)]))])));
  }

  const byStudent = new Map(reading?.matches.map((m) => [m.studentId, m]) ?? []);
  const free = rows.filter((r) => !byStudent.has(r.studentId) && !Object.values(assign).includes(r.studentId));

  const setCell = (studentId: string, key: string, v: string) => setCells((c) => ({ ...c, [studentId]: { ...c[studentId], [key]: v.replace(/[^\d.]/g, "") } }));

  const assignRow = (line: number, studentId: string) => {
    const row = reading?.unmatched.find((u) => u.line === line);
    setAssign((x) => {
      const next = { ...x };
      if (studentId) next[line] = studentId;
      else delete next[line];
      return next;
    });
    if (row && studentId) {
      const vals: Record<string, string> = {};
      for (const [k, v] of Object.entries(row.scores)) if (v !== null && v !== undefined) vals[k] = String(v);
      setCells((c) => ({ ...c, [studentId]: vals }));
    }
  };

  const bad = (k: string, v: string) => {
    const c = components.find((x) => x.key === k)!;
    return v.trim() !== "" && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > c.maxScore);
  };
  const filled = Object.entries(cells).filter(([, v]) => Object.values(v).some((x) => x.trim() !== ""));
  const anyBad = filled.some(([, v]) => Object.entries(v).some(([k, x]) => bad(k, x)));
  const toCheck = reading?.matches.filter((m) => m.confidence !== "high").length ?? 0;

  const inputCls = "h-9 w-14 rounded-lg border text-center text-sm font-semibold outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100";

  return (
    <Dialog open={open} onClose={close} title="Snap score sheet" subtitle="Take a photo of the handwritten sheet. You check every score before it goes in." wide>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />

      {status.data && !status.data.enabled ? (
        <ErrorNote>Reading photos needs AI, which is not switched on for your school yet. Type the scores for now, or ask the school to switch AI on.</ErrorNote>
      ) : !photo ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="lg" onClick={() => camera.current?.click()}><Camera className="h-5 w-5" /> Take photo</Button>
            <Button size="lg" variant="outline" onClick={() => gallery.current?.click()}><ImageUp className="h-5 w-5" /> Choose a photo</Button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Lay the sheet flat in good light, with no shadow across it.</li>
            <li>Get the whole sheet in, with the column headings (1st CA, 2nd CA, Exam) showing.</li>
            <li>One sheet per photo. Names and numbers should be sharp when you zoom in.</li>
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <a href={photo} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Your score sheet photo" className="h-28 w-24 rounded-xl border border-line object-cover" />
            </a>
            <div className="min-w-0 flex-1 text-sm">
              {a.busy ? (
                <p className="flex items-center gap-2 font-semibold text-brand-700"><ScanLine className="h-4 w-4 animate-pulse" /> Reading the sheet… this takes about 20 seconds.</p>
              ) : reading ? (
                <>
                  <p className="font-semibold">Read {reading.matches.length} of {rows.length} students.{toCheck ? ` ${toCheck} to check.` : " All matched by name."}</p>
                  <p className="text-muted">Compare with the photo (tap it to open full size) and correct anything that is wrong. Amber boxes were hard to read or above the maximum.</p>
                  {reading.notes ? <p className="mt-1 flex gap-1.5 text-amber-700"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {reading.notes}</p> : null}
                </>
              ) : null}
              <ErrorNote className="mt-2">{a.error}</ErrorNote>
              {!a.busy ? <Button size="sm" variant="ghost" className="mt-1 -ml-3" onClick={() => camera.current?.click()}><RotateCcw className="h-3.5 w-3.5" /> Take another photo</Button> : null}
            </div>
          </div>

          {reading ? (
            <>
              <div className="-mx-5 overflow-x-auto sm:-mx-7">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-xs font-semibold text-muted uppercase">
                    <tr className="border-b border-line">
                      <th className="py-2 pl-5 text-left sm:pl-7">Student</th>
                      {components.map((c) => <th key={c.key} className="px-1 py-2">{c.label}<span className="block normal-case">/{c.maxScore}</span></th>)}
                      <th className="py-2 pr-5 sm:pr-7" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const m = byStudent.get(r.studentId);
                      const assignedLine = Object.entries(assign).find(([, s]) => s === r.studentId)?.[0];
                      const have = cells[r.studentId];
                      return (
                        <tr key={r.studentId} className={cn("border-b border-line last:border-0", !have && "text-muted")}>
                          <td className="py-2 pr-2 pl-5 sm:pl-7">
                            <span className="font-semibold">{r.name}</span>
                            {m && m.issues.length ? <span className="block text-xs text-amber-700">{m.issues.join(". ")}</span> : null}
                            {assignedLine ? <span className="block text-xs text-muted">From row {assignedLine} on the sheet</span> : null}
                          </td>
                          {components.map((c) => {
                            const v = have?.[c.key] ?? "";
                            const was = current[r.studentId]?.[c.key] ?? "";
                            const flag = (m?.check.includes(c.key) ?? false) || bad(c.key, v);
                            return (
                              <td key={c.key} className="px-1 text-center">
                                {have ? (
                                  <>
                                    <input
                                      inputMode="decimal"
                                      aria-label={`${r.name} ${c.label}`}
                                      className={cn(inputCls, bad(c.key, v) ? "border-rose-400 bg-rose-50" : flag ? "border-amber-400 bg-amber-50" : "border-line")}
                                      value={v}
                                      onChange={(e) => setCell(r.studentId, c.key, e.target.value)}
                                    />
                                    {was && v && was !== v ? <span className="block text-[10px] text-muted">was {was}</span> : null}
                                  </>
                                ) : (
                                  <span>–</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2 pr-5 text-right sm:pr-7">
                            {m ? <Badge tone={toneFor[m.confidence]}>{labelFor[m.confidence]}</Badge> : assignedLine ? <Badge tone="blue">Matched by you</Badge> : <Badge tone="gray">Not on photo</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {reading.unmatched.length ? (
                <div className="rounded-2xl bg-amber-50 p-4">
                  <p className="mb-2 text-sm font-semibold text-amber-800">Rows on the sheet we could not match to a student</p>
                  <ul className="flex flex-col gap-2">
                    {reading.unmatched.map((u) => (
                      <li key={u.line} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
                        <span className="flex-1">
                          Row {u.line}: <strong>{u.name || "(no name)"}</strong>{" "}
                          <span className="text-muted">{components.map((c) => `${c.label} ${u.scores[c.key] ?? "–"}`).join(", ")}</span>
                        </span>
                        <Select aria-label={`Who is row ${u.line}?`} className="sm:w-56" value={assign[u.line] ?? ""} onChange={(e) => assignRow(u.line, e.target.value)}>
                          <option value="">Skip this row</option>
                          {[...rows.filter((r) => assign[u.line] === r.studentId), ...free].map((r) => <option key={r.studentId} value={r.studentId}>{r.name}</option>)}
                        </Select>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">Next, the scores go into the score sheet. They are only saved when you press Save scores there.</p>
                <Button
                  disabled={!filled.length || anyBad}
                  onClick={() => {
                    onApply(Object.fromEntries(filled));
                    close();
                  }}
                >
                  Put {filled.length} into score sheet
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
