/** The app icon as an inline mark: the favicon's plum canvas and filled
    bubble, drawn on the same 24-unit grid scripts/make-icon.swift uses.
    The hex values are the PIXELS the mattstack iconset ships (measured),
    not the generator's source constants, which Core Graphics colour-manages
    on the way out. */
export function AppMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
    >
      <rect width="64" height="64" rx="14.4" fill="#1d1830" />
      <g transform="translate(7.04 10) scale(2.08)" fill="#ff84ad">
        <path d="M6.5 2h11A4.5 4.5 0 0 1 22 6.5v5a4.5 4.5 0 0 1-4.5 4.5H13l-8.5 6.5L6 16a4.5 4.5 0 0 1-4-4.5v-5A4.5 4.5 0 0 1 6.5 2z" />
      </g>
    </svg>
  );
}
