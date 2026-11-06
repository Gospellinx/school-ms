/** Small area line chart, SVG only. */
export function LineChart({ values, labels, height = 180, color = "#6a3bf0", format = (v: number) => String(v) }: { values: number[]; labels: string[]; height?: number; color?: string; format?: (v: number) => string }) {
  const w = 600;
  const h = height;
  const pad = 8;
  const max = Math.max(...values) * 1.15;
  const min = 0;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, h - 24 - ((v - min) / (max - min)) * (h - 40)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1]![0]},${h - 24} L${pts[0]![0]},${h - 24} Z`;
  const last = pts[pts.length - 1]!;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={w} y1={(h - 24) * f} y2={(h - 24) * f} stroke="#ecebf0" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill="url(#lc-fill)" />
        <path d={line} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={last[0]} cy={last[1]} r={5} fill="white" stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] font-medium text-muted">
        {labels.map((l) => <span key={l}>{l}</span>)}
      </div>
      <p className="sr-only">Latest value {format(values[values.length - 1]!)}</p>
    </div>
  );
}
