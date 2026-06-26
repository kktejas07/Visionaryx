'use client';

interface EmptyStateIllustrationProps {
  size?: number;
  className?: string;
}

export function EmptyStateIllustration({ size = 200, className = '' }: EmptyStateIllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`opacity-60 max-w-full h-auto ${className}`}
    >
      <defs>
        <linearGradient id="emptyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#919EAB" stopOpacity={0.2} />
          <stop offset="100%" stopColor="#919EAB" stopOpacity={0.05} />
        </linearGradient>
      </defs>
      {/* Document/box outline */}
      <rect
        x="50"
        y="45"
        width="100"
        height="110"
        rx="8"
        fill="none"
        stroke="url(#emptyGrad)"
        strokeWidth="2"
      />
      {/* Horizontal lines */}
      <line x1="65" y1="75" x2="135" y2="75" stroke="#919EAB" strokeWidth="1.5" opacity={0.4} />
      <line x1="65" y1="95" x2="120" y2="95" stroke="#919EAB" strokeWidth="1.5" opacity={0.3} />
      <line x1="65" y1="115" x2="130" y2="115" stroke="#919EAB" strokeWidth="1.5" opacity={0.3} />
      {/* Magnifying glass */}
      <circle cx="140" cy="130" r="18" fill="none" stroke="#2065D1" strokeWidth="2" opacity={0.5} />
      <line
        x1="152"
        y1="142"
        x2="165"
        y2="155"
        stroke="#2065D1"
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.5}
      />
    </svg>
  );
}
