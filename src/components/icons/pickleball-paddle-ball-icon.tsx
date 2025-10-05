import type { SVGProps } from 'react';

export function PickleballPaddleBallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      {...props}
    >
      <path d="m14.68 7.76-1.42 1.42"/>
      <path d="m11.84 10.6-1.42 1.42"/>
      <path d="m7.12 15.32-1.42 1.42"/>
      <path d="m10.42 12.02-1.42 1.42"/>
      <path d="M16.1,9.18a4.82,4.82,0,0,0-6.82,0,4.82,4.82,0,0,0,0,6.82l5.4,5.4a1,1,0,0,0,1.42,0l1.42-1.42a1,1,0,0,0,0-1.42Z"/>
      <circle cx="16" cy="16" r="2" />
    </svg>
  );
}
