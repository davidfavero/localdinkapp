import type { SVGProps } from 'react';

interface PickleballBallIconProps extends SVGProps<SVGSVGElement> {
  ballColor?: string;
  holeColor?: string;
}

export function PickleballBallIcon({ 
  ballColor = 'currentColor', 
  holeColor = '#333',
  ...props 
}: PickleballBallIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Ball body - filled */}
      <circle cx="12" cy="12" r="10" fill={ballColor} />
      {/* Holes - dark */}
      <circle cx="12" cy="6" r="1.2" fill={holeColor} />
      <circle cx="12" cy="18" r="1.2" fill={holeColor} />
      <circle cx="6" cy="12" r="1.2" fill={holeColor} />
      <circle cx="18" cy="12" r="1.2" fill={holeColor} />
      <circle cx="8.5" cy="8.5" r="1.2" fill={holeColor} />
      <circle cx="15.5" cy="15.5" r="1.2" fill={holeColor} />
      <circle cx="8.5" cy="15.5" r="1.2" fill={holeColor} />
      <circle cx="15.5" cy="8.5" r="1.2" fill={holeColor} />
    </svg>
  );
}
