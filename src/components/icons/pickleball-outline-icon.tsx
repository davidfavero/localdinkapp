import type { SVGProps } from 'react';

export function PickleballOutlineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}          // ← bump to 2.25 to match Messages if needed
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      role="img"
      aria-label="Pickleball (outline)"
      {...props}
    >
      {/* outer ring */}
      <circle cx="12" cy="12" r="9" />
      {/* “holes” */}
      <circle cx="12" cy="8"  r="1" fill="currentColor" stroke="none" />
      <circle cx="9"  cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
