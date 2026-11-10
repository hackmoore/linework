import type { ReactElement } from "react";

/** Static hero illustration; replaced by live renderer output once the render engine lands. */
export function StyleShowcase(): ReactElement {
  return (
    <div className="showcase" aria-hidden="true">
      <svg viewBox="0 0 420 300" className="showcase__svg">
        <rect x="30" y="30" width="140" height="60" rx="10" fill="#eef0ff" stroke="#4f46e5" strokeWidth="2" />
        <text x="100" y="66" textAnchor="middle" fontSize="16" fill="currentColor">
          Idea
        </text>
        <rect
          x="250"
          y="210"
          width="140"
          height="60"
          rx="10"
          fill="#e8f5e9"
          stroke="#2e7d32"
          strokeWidth="2"
        />
        <text x="320" y="246" textAnchor="middle" fontSize="16" fill="currentColor">
          Shipped
        </text>
        <path d="M100 90 V240 H250" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  );
}
