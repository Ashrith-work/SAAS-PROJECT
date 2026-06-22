import Link from "next/link";
import type { ComponentProps } from "react";

// Shared button — dark theme. Variants: primary (brand), secondary (outlined),
// danger, ghost. Renders an <a> (via next/link) when `href` is given, else a
// <button>. Keep visual styling here so every CTA in the app matches.

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-button font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary:
    "border border-line-strong bg-elevated text-ink-secondary hover:bg-line-strong",
  danger: "bg-danger text-white hover:bg-danger/90",
  ghost: "text-ink-secondary hover:bg-elevated",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export function buttonClass(
  variant: Variant = "primary",
  size: Size = "md",
  extra = "",
) {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim();
}

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: CommonProps & ComponentProps<"button">) {
  return (
    <button className={buttonClass(variant, size, className)} {...rest} />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: CommonProps & ComponentProps<typeof Link>) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
