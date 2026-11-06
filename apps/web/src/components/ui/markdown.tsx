import * as React from "react";

const inline = (line: string) =>
  line.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : part.length > 2 && part.startsWith("_") && part.endsWith("_") ? (
      <em key={i}>{part.slice(1, -1)}</em>
    ) : (
      part
    ),
  );

/** Enough Markdown for lesson notes and plans: headings, paragraphs, bullet and numbered lists, bold. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className ?? "flex flex-col gap-2.5 text-sm leading-relaxed"}>
      {text.split(/\n{2,}/).map((block, i) => {
        const t = block.trim();
        if (!t) return null;
        const h = t.match(/^(#{1,4})\s+(.+)$/);
        if (h && !t.includes("\n")) {
          const level = h[1].length;
          return level <= 1 ? (
            <h2 key={i} className="mt-1 text-lg font-bold">{inline(h[2])}</h2>
          ) : (
            <h3 key={i} className="mt-2 text-base font-semibold">{inline(h[2])}</h3>
          );
        }
        const lines = t.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s/.test(l))) {
          return <ul key={i} className="list-disc pl-5">{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*[-*•]\s/, ""))}</li>)}</ul>;
        }
        if (lines.every((l) => /^\s*\d+[.)]\s/.test(l))) {
          return <ol key={i} className="list-decimal pl-5">{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*\d+[.)]\s/, ""))}</li>)}</ol>;
        }
        return <p key={i} className="whitespace-pre-line">{inline(t.replace(/ {2}\n/g, "\n"))}</p>;
      })}
    </div>
  );
}
