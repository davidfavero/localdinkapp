import type { SVGProps } from 'react';

export function PickleballOutlineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"     // tight box like common icon sets
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}       // match Messages weight; tweak 2–2.5 to taste
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      aria-label="Pickleball"
      {...props}
    >
      {/* Ball outline */}
      <circle cx="12" cy="12" r="8.5" />

      {/* Perforation holes (stroke-only rings to match outline style) */}
      <circle cx="12" cy="8.2" r="1.25" />
      <circle cx="8.2"  cy="12" r="1.25" />
      <circle cx="15.8" cy="12" r="1.25" />
      <circle cx="12" cy="15.8" r="1.25" />
      <circle cx="8.7"  cy="8.7"  r="1.25" />
      <circle cx="15.3" cy="8.7"  r="1.25" />
      <circle cx="15.3" cy="15.3" r="1.25" />
      <circle cx="8.7"  cy="15.3" r="1.25" />
    </svg>
  );
}
