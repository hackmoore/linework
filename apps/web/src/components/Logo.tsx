import type { ReactElement } from "react";

interface LogoProps {
  readonly size?: number;
  readonly withWordmark?: boolean;
}

export function Logo({ size = 28, withWordmark = true }: LogoProps): ReactElement {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="var(--color-accent)" />
        <rect x="6" y="7" width="9" height="7" rx="1.5" fill="none" stroke="#fff" strokeWidth="2" />
        <rect x="17" y="18" width="9" height="7" rx="1.5" fill="none" stroke="#fff" strokeWidth="2" />
        <path
          d="M10.5 14v7.5H17"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark && <span className="logo__word">Linework</span>}
    </span>
  );
}
