import type { SVGProps } from 'react';

export function PickleballPaddleBallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M16.1 9.18a4.82 4.82 0 0 0-6.82 0 4.82 4.82 0 0 0 0 6.82l5.4 5.4a1 1 0 0 0 1.42 0l1.42-1.42a1 1 0 0 0 0-1.42Z" />
      <circle cx="8" cy="8" r="4" />
      <circle cx="8" cy="6" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="10" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="6" cy="8" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="10" cy="8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
