import React from "react";

interface QrisLogoProps {
  className?: string;
}

/**
 * Official-style QRIS Logo SVG Component
 * Quick Response Code Indonesian Standard (Bank Indonesia / ASPI)
 */
export function QrisLogo({ className = "h-7 w-auto" }: QrisLogoProps) {
  return (
    <svg
      viewBox="0 0 160 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logo Resmi QRIS (Quick Response Code Indonesian Standard)"
      role="img"
    >
      {/* Red Indonesian National Standard Chevrons (Top Right) */}
      <path
        d="M130 5L150 5L138 17L118 17L130 5Z"
        fill="#ED1C24"
      />
      <path
        d="M141 18L151 18L141 28L131 28L141 18Z"
        fill="#ED1C24"
      />

      {/* "Q" */}
      <path
        d="M20 7C12.5 7 7 12.5 7 20C7 27.5 12.5 33 20 33C23.2 33 26.1 31.9 28.3 30.1L32.2 34H37.5L32.7 29.2C33.5 26.6 33.5 23.5 33 20C33 12.5 27.5 7 20 7ZM20 13C24 13 26.8 16 26.8 20C26.8 24 24 27 20 27C16 27 13.2 24 13.2 20C13.2 16 16 13 20 13Z"
        fill="#1C1C1E"
      />

      {/* "R" */}
      <path
        d="M42 7.5H55C59.5 7.5 63 10.5 63 15C63 18.2 60.8 20.8 57.5 21.8L63.5 33.5H57.2L51.8 22.5H48V33.5H42V7.5ZM48 12.5V17.5H54.5C56.2 17.5 57.5 16.5 57.5 15C57.5 13.5 56.2 12.5 54.5 12.5H48Z"
        fill="#1C1C1E"
      />

      {/* "I" */}
      <path
        d="M70 7.5H76V33.5H70V7.5Z"
        fill="#1C1C1E"
      />

      {/* "S" */}
      <path
        d="M97.5 7.5C103.5 7.5 107.5 11 107.5 16H101.5C101.5 13.5 99.5 12.2 97.2 12.2C94.5 12.2 92.8 13.5 92.8 15.5C92.8 17.2 94.2 18.2 98.2 19.2C104.5 20.8 108 23 108 27.5C108 32.2 103.8 34 97.5 34C91.2 34 86.8 30.5 86.5 25H92.5C92.8 28 94.8 29.3 97.5 29.3C100.5 29.3 102 28 102 26C102 24 100.5 23 96.5 22C90.5 20.5 87 18.5 87 14C87 9.5 91.2 7.5 97.5 7.5Z"
        fill="#1C1C1E"
      />

      {/* Subtitle: QUICK RESPONSE CODE INDONESIAN STANDARD */}
      <text
        x="7"
        y="45"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        fontWeight="700"
        fontSize="6.2"
        letterSpacing="0.9px"
        fill="#52525B"
      >
        QUICK RESPONSE CODE INDONESIAN STANDARD
      </text>
    </svg>
  );
}
