import type { SVGProps } from 'react';

export function RobinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.61 9.54c-.33 1.16-1.5 2.1-2.61 2.1s-2.28-.94-2.61-2.1c-.1-.35.18-.69.55-.69h4.11c.37 0 .65.34.56.69zM8.5 10.5c.83 0 1.5-.67 1.5-1.5S9.33 7.5 8.5 7.5 7 8.17 7 9s.67 1.5 1.5 1.5zm7 0c.83 0 1.5-.67 1.5-1.5S16.33 7.5 15.5 7.5s-1.5.67-1.5 1.5.67 1.5 1.5 1.5z" />
    </svg>
  );
}
