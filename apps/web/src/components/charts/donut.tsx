export interface DonutSlice { label: string; value: number; color: string }

/** SVG donut with a center total, like the "Progress" card. */
export function Donut({ slices, size = 180, thickness = 26, centerValue, centerLabel }: { slices: DonutSlice[]; size?: number; thickness?: number; centerValue: string; centerLabel: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f4f1ff" strokeWidth={thickness} />
        {slices.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - 3)} ${c}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight">{centerValue}</span>
        <span className="text-xs text-muted">{centerLabel}</span>
      </div>
    </div>
  );
}

export function Legend({ slices }: { slices: DonutSlice[] }) {
  return (
    <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
      {slices.map((s) => (
        <li key={s.label} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
          <span className="text-muted">{s.label}</span>
          <span className="ml-auto font-semibold">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}
