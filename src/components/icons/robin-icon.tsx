import type { SVGProps } from 'react';

export function RobinIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="M12 12c-2 0-4-1-4-4 0-2 2-4 4-4s4 2 4 4c0 3-2 4-4 4z" />
      <path d="M14 14c0 2-1 4-4 4-2 0-4-2-4-4" />
      <path d="M15 9.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0z" />
    </svg>
  );
}
