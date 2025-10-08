import type { SVGProps } from 'react';

export function PickleballFilledIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Pickleball (filled)"
      {...props}
    >
      <defs>
        <mask id="pb-mask">
          {/* full canvas transparent -> then reveal with white */}
          <rect width="24" height="24" fill="black" />
          {/* main disc */}
          <circle cx="12" cy="12" r="9" fill="white" />
          {/* holes (black = punched out) */}
          <circle cx="12" cy="8" r="1.4" fill="black" />
          <circle cx="9"  cy="11" r="1.4" fill="black" />
          <circle cx="15" cy="11" r="1.4" fill="black" />
          <circle cx="10" cy="15" r="1.4" fill="black" />
          <circle cx="14" cy="15" r="1.4" fill="black" />
          <circle cx="12" cy="12" r="1.4" fill="black" />
        </mask>
      </defs>
      {/* color inherits from CSS via currentColor */}
      <rect width="24" height="24" fill="currentColor" mask="url(#pb-mask)" />
    </svg>
  );
}
