"use client";

import { useRef, type ReactNode, type HTMLAttributes } from "react";

// Adapted spotlight "GlowCard" for HotelTrack dashboard KPI tiles.
//
// Adapted from the generic spotlight-card pattern with four deliberate changes
// for a dashboard that mounts many cards at once:
//   1. FIXED BRAND HUE — no cursor-driven hue spread. The glow is a single
//      emerald token (--kpi-glow-rgb), theme-aware, never drifting to blue/purple.
//   2. HOVER-ONLY — pointermove is bound to THIS card (React onPointerMove only
//      fires while the cursor is over it). At rest the glow opacity is 0. There is
//      NO document-wide listener, so 8+ idle cards cost nothing.
//   3. PERFORMANCE — the move handler writes CSS custom properties straight to the
//      node via a ref (no React state, no re-render per move); only the hovered
//      card paints its spotlight.
//   4. REDUCED MOTION — handled in CSS: the moving spotlight is dropped for a
//      static, subtle emerald border glow (see .kpi-glow in globals.css).
//
// Visual-only: it renders the card's outer element (spread className), so wrapping
// an existing KPI card never changes its content, values, sizing, or grid slot.

export function GlowCard({
  children,
  className = "",
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  ...rest
}: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      {...rest}
      ref={ref}
      data-hover="false"
      className={`kpi-glow ${className}`}
      onPointerEnter={(e) => {
        ref.current?.setAttribute("data-hover", "true");
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        ref.current?.setAttribute("data-hover", "false");
        onPointerLeave?.(e);
      }}
      onPointerMove={(e) => {
        const el = ref.current;
        if (el) {
          const r = el.getBoundingClientRect();
          el.style.setProperty("--glow-x", `${e.clientX - r.left}px`);
          el.style.setProperty("--glow-y", `${e.clientY - r.top}px`);
        }
        onPointerMove?.(e);
      }}
    >
      <span aria-hidden className="kpi-glow__layer kpi-glow__ring" />
      <span aria-hidden className="kpi-glow__layer kpi-glow__spot" />
      {children}
    </div>
  );
}
