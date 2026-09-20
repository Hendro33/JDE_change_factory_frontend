/**
 * Small, hand-authored line icons for the Agents dashboard — no icon
 * library dependency (none exists in this app; the only prior
 * precedent, Dashboard's KPI tiles, uses plain Unicode glyphs, which
 * read as too casual for a dedicated team page). Deliberately simple,
 * stroke-based, single consistent style: no people, faces, robots or
 * any generated imagery, per the design brief for this page.
 */

import type { SVGProps } from "react";

function Base(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

/** Receive — inbox/download tray. */
export function ReceiveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M4 13V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7" />
      <path d="M4 13h4.4a1 1 0 0 1 .9.55l.6 1.2a1 1 0 0 0 .9.55h2.4a1 1 0 0 0 .9-.55l.6-1.2a1 1 0 0 1 .9-.55H20" />
      <path d="M4 13v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
    </Base>
  );
}

/** Improve — wand with sparkles. */
export function ImproveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M5 19 17 7" />
      <path d="M14 3.5v3M12.5 5h3" />
      <path d="M5 11v2.4M3.8 12.2h2.4" />
    </Base>
  );
}

/** Requirements (Check) — clipboard with a checkmark. */
export function RequirementsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <rect x="5" y="4" width="14" height="17" rx="1.6" />
      <path d="M9 4V3.3A1.3 1.3 0 0 1 10.3 2h3.4A1.3 1.3 0 0 1 15 3.3V4" />
      <path d="M8.2 11.2 9.8 12.8 12.5 9.5" />
      <path d="M8.5 16h7" />
    </Base>
  );
}

/** Architect — compass/direction. */
export function ArchitectIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.2 8.8 13 13l-4.2 2.2L11 11z" />
    </Base>
  );
}

/** Functional — settings sliders. */
export function FunctionalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="1.8" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="1.8" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="7.5" cy="18" r="1.8" />
    </Base>
  );
}

/** Development / Technical — code brackets. */
export function DevelopmentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path d="M9 6.5 4 12l5 5.5" />
      <path d="M15 6.5l5 5.5-5 5.5" />
    </Base>
  );
}
