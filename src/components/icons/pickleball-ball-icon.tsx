import type { SVGProps } from 'react';

export function PickleballBallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="6" r="1.2" />
      <circle cx="12" cy="18" r="1.2" />
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
      <circle cx="8.5" cy="8.5" r="1.2" />
      <circle cx="15.5" cy="15.5" r="1.2" />
      <circle cx="8.5" cy="15.5" r="1.2" />
      <circle cx="15.5" cy="8.5" r="1.2" />
    </svg>
  );
}
