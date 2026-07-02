import { h } from 'preact';

// Ryboczłek — the fish mascot. A playful fish with a butt (ryba z dupą).
// Rendered as inline SVG so it works offline and has no external deps.

interface RyboczekProps {
  size?: number;
  class?: string;
}

export function Ryboczek({ size = 80, class: cls }: RyboczekProps) {
  const s = size;
  const scale = s / 200;

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 200 200"
      class={cls}
      aria-label="ryboczłek — ryba z dupom"
      style="overflow: visible;"
    >
      {/* Tail fin */}
      <path
        d="M30 100 L5 70 L20 100 L5 130 Z"
        fill="#FF6B6B"
        stroke="#E55A5A"
        stroke-width="2"
      />

      {/* Body — chunky fish shape */}
      <ellipse cx="110" cy="100" rx="75" ry="45" fill="#FF8E72" stroke="#E57A5E" stroke-width="2" />

      {/* The famous butt cheeks (dupa!) */}
      <ellipse cx="170" cy="85" rx="22" ry="18" fill="#FFB3A7" stroke="#E57A5E" stroke-width="1.5" />
      <ellipse cx="170" cy="115" rx="22" ry="18" fill="#FFB3A7" stroke="#E57A5E" stroke-width="1.5" />
      {/* Butt crack */}
      <line x1="170" y1="92" x2="170" y2="108" stroke="#E57A5E" stroke-width="1.5" stroke-linecap="round" />

      {/* Dorsal fin */}
      <path
        d="M90 55 Q110 20 140 55"
        fill="#FF6B6B"
        stroke="#E55A5A"
        stroke-width="2"
        fill-opacity="0.8"
      />

      {/* Pectoral fin */}
      <path
        d="M95 110 Q85 135 105 130"
        fill="#FF6B6B"
        stroke="#E55A5A"
        stroke-width="1.5"
        fill-opacity="0.7"
      />

      {/* Eye */}
      <circle cx="65" cy="90" r="12" fill="white" stroke="#333" stroke-width="2" />
      <circle cx="68" cy="88" r="6" fill="#333" />
      <circle cx="70" cy="85" r="2" fill="white" />

      {/* Mouth — cheeky grin */}
      <path
        d="M42 105 Q50 115 60 108"
        fill="none"
        stroke="#333"
        stroke-width="2"
        stroke-linecap="round"
      />

      {/* Scales pattern (subtle) */}
      <path d="M130 82 Q135 78 140 82 Q135 86 130 82" fill="none" stroke="#FFB3A7" stroke-width="0.8" opacity="0.6" />
      <path d="M145 90 Q150 86 155 90 Q150 94 145 90" fill="none" stroke="#FFB3A7" stroke-width="0.8" opacity="0.6" />
      <path d="M125 95 Q130 91 135 95 Q130 99 125 95" fill="none" stroke="#FFB3A7" stroke-width="0.8" opacity="0.6" />

      {/* Bubbles */}
      <circle cx="30" cy="65" r="4" fill="none" stroke="#4ECDC4" stroke-width="1.5" opacity="0.7" />
      <circle cx="18" cy="48" r="6" fill="none" stroke="#4ECDC4" stroke-width="1.5" opacity="0.5" />
      <circle cx="25" cy="30" r="3" fill="none" stroke="#4ECDC4" stroke-width="1.5" opacity="0.3" />
    </svg>
  );
}

// Simplified small version for avatars / icons
export function RyboczekIcon({ size = 32, class: cls }: RyboczekProps) {
  const s = size;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 200 200"
      class={cls}
      aria-label="ryboczłek"
    >
      <ellipse cx="110" cy="100" rx="70" ry="40" fill="#FF8E72" />
      <ellipse cx="165" cy="87" rx="20" ry="16" fill="#FFB3A7" />
      <ellipse cx="165" cy="113" rx="20" ry="16" fill="#FFB3A7" />
      <path d="M30 100 L5 70 L20 100 L5 130 Z" fill="#FF6B6B" />
      <circle cx="65" cy="90" r="10" fill="white" />
      <circle cx="68" cy="88" r="5" fill="#333" />
      <path d="M42 105 Q50 115 60 108" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}
