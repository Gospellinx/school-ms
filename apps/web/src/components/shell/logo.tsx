import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-brand-600">
        <span className="absolute top-[9px] h-2 w-2 rounded-full bg-white" />
        <span className="absolute bottom-[9px] left-[9px] h-2 w-2 rounded-full bg-white" />
        <span className="absolute right-[9px] bottom-[9px] h-2 w-2 rounded-full bg-white" />
      </span>
      <span className="text-lg font-bold tracking-tight">Linx School</span>
    </Link>
  );
}
