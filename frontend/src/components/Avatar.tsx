import { useState } from 'preact/hooks';

interface Props {
  userId: number;
  name: string;
  size?: number;
}

export function Avatar({ userId, name, size = 32 }: Props) {
  const [loaded, setLoaded] = useState(true);
  const letter = (name || '?').charAt(0).toUpperCase();

  if (!loaded) {
    return (
      <span
        class="avatar-fallback"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          fontSize: `${Math.round(size * 0.45)}px`,
          lineHeight: `${size}px`,
        }}
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      src={`/api/users/avatar/${userId}`}
      alt={name}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        objectFit: 'cover',
        flexShrink: 0,
        background: 'var(--bg-highlight)',
      }}
      onError={() => setLoaded(false)}
    />
  );
}
