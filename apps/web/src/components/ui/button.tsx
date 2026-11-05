import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  outline: "border border-line bg-white text-ink hover:bg-canvas",
  ghost: "text-muted hover:bg-canvas hover:text-ink",
  white: "bg-white text-brand-700 hover:bg-brand-50",
  danger: "bg-rose-50 text-rose-600 hover:bg-rose-100",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-base rounded-2xl gap-2",
  icon: "h-10 w-10 rounded-xl",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export function buttonClass(variant: keyof typeof variants = "primary", size: keyof typeof sizes = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}
