import Link from 'next/link';

/** PrintPesa brand lockup — P mark + two-tone wordmark, theme-aware via currentColor. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="PrintPesa home"
      className={`flex items-center gap-2 text-fg ${className}`}
    >
      <svg
        viewBox="0 0 44 48"
        className="h-7 w-7 shrink-0"
        role="img"
        aria-hidden
        fill="none"
      >
        {/* "P" letterform (inherits text colour; counter cut with evenodd). */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10 4a2 2 0 0 0-2 2v36a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V32h9a14 14 0 0 0 0-28H10Zm8 8v12h7a6 6 0 0 0 0-12h-7Z"
          fill="currentColor"
        />
        {/* Brand-green folded-page accent over the lower stem (follows the theme accent). */}
        <path
          className="text-accent"
          d="M5.6 23.2l8.8-3.1a1.8 1.8 0 0 1 2.4 1.7v14.4a1.8 1.8 0 0 1-1.2 1.7l-8.8 3.1A1.8 1.8 0 0 1 4.4 39.3V24.9a1.8 1.8 0 0 1 1.2-1.7Z"
          fill="currentColor"
        />
      </svg>
      <span className="text-lg font-extrabold tracking-tight leading-none">
        <span>Print</span>
        <span className="text-accent">Pesa</span>
      </span>
    </Link>
  );
}
