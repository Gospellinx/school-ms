import { cn, initials } from "@/lib/utils";

const palette = ["bg-brand-100 text-brand-700", "bg-orchid-100 text-fuchsia-700", "bg-amber-100 text-amber-700", "bg-emerald-100 text-emerald-700", "bg-sky-100 text-sky-700"];

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const tone = palette[name.length % palette.length];
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-bold", tone, className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
