'use client';

interface WelcomeIllustrationProps {
  className?: string;
  size?: number;
}

export function WelcomeIllustration({ className = '', size = 280 }: WelcomeIllustrationProps) {
  return (
    <svg
      viewBox="0 0 280 200"
      width={size}
      height={(size * 200) / 280}
      className={`opacity-85 max-w-full h-auto ${className}`}
    >
      <defs>
        <linearGradient id="welcomeBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2065D1" stopOpacity={0.06} />
          <stop offset="100%" stopColor="#2065D1" stopOpacity={0.02} />
        </linearGradient>
        <linearGradient id="screenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5A9AFA" stopOpacity={0.15} />
          <stop offset="100%" stopColor="#2065D1" stopOpacity={0.05} />
        </linearGradient>
      </defs>
      {/* Background shape */}
      <ellipse cx="140" cy="100" rx="120" ry="80" fill="url(#welcomeBg)" />
      {/* Monitor/dashboard frame */}
      <rect
        x="60"
        y="50"
        width="160"
        height="100"
        rx="8"
        fill="#222a3d"
        stroke="rgba(66, 71, 83, 0.35)"
        strokeWidth="1"
      />
      {/* Screen content */}
      <rect x="70" y="60" width="140" height="80" rx="4" fill="url(#screenGrad)" />
      {/* Chart bars on screen */}
      <rect x="85" y="95" width="8" height="35" rx="2" fill="#2065D1" opacity={0.4} />
      <rect x="100" y="85" width="8" height="45" rx="2" fill="#2065D1" opacity={0.5} />
      <rect x="115" y="90" width="8" height="40" rx="2" fill="#2065D1" opacity={0.45} />
      <rect x="130" y="80" width="8" height="50" rx="2" fill="#2065D1" opacity={0.55} />
      <rect x="145" y="88" width="8" height="42" rx="2" fill="#2065D1" opacity={0.5} />
      <rect x="160" y="92" width="8" height="38" rx="2" fill="#2065D1" opacity={0.45} />
      <rect x="175" y="85" width="8" height="45" rx="2" fill="#2065D1" opacity={0.5} />
      {/* Camera icon */}
      <g transform="translate(200, 30)">
        <rect x="0" y="5" width="40" height="28" rx="4" fill="#2d3449" stroke="rgba(66, 71, 83, 0.4)" strokeWidth="1" />
        <circle cx="20" cy="19" r="8" fill="#2065D1" opacity={0.3} />
        <circle cx="20" cy="19" r="4" fill="#2065D1" opacity={0.6} />
        <rect x="16" y="0" width="8" height="6" rx="1" fill="rgba(140, 144, 159, 0.35)" />
      </g>
      {/* Shield/security icon */}
      <g transform="translate(35, 75)">
        <path
          d="M20 5 L35 10 L35 22 Q35 35 20 42 Q5 35 5 22 L5 10 Z"
          fill="#2d3449"
          stroke="rgba(66, 71, 83, 0.35)"
          strokeWidth="1"
        />
        <path
          d="M14 22 L18 26 L26 16"
          fill="none"
          stroke="#57e082"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
        />
      </g>
    </svg>
  );
}
