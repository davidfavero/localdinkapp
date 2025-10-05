import type { SVGProps } from 'react';

export function RobinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path d="M12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Zm0,18a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" />
      <path d="M12,6a.5.5,0,0,0-.5.5v3a.5.5,0,0,0,.5.5h5a.5.5,0,0,0,0-1H12.5V6.5A.5.5,0,0,0,12,6Z" />
      <path d="M15.2,12.5a3.5,3.5,0,1,0-4.95,0,5.5,5.5,0,0,0-4.75,5.45.5.5,0,0,0,.5.5H19.45a.5.5,0,0,0,.5-.5,5.5,5.5,0,0,0-4.75-5.45Z" />
    </svg>
  );
}
