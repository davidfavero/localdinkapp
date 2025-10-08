import type { SVGProps } from 'react';

export function GamesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}           // ← adjust thickness here
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      aria-label="Games"
      {...props}
    >
      {/* Paddle head (rounded rectangle rotated 45°) */}
      <rect x="5" y="3" width="10" height="9" rx="4.5" ry="4.5"
            transform="rotate(45 10 7.5)" />
      {/* Handle */}
      <path d="M8.3 13.7 L6.2 15.8" />
      {/* Ball */}
      <circle cx="18.5" cy="12.5" r="1.6" />
    </svg>
  );
}
