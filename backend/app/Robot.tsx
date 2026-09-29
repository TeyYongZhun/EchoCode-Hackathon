/** The EchoCode robot. `waves` adds sound waves on both sides, used for the Pro plan. */
export function Robot({ className = 'mock-robot', waves = false }: { className?: string; waves?: boolean }) {
  return (
    <svg className={className} viewBox={waves ? '-12 0 88 64' : '0 0 64 64'} aria-hidden="true">
      {waves && (
        <>
          <path d="M1 24q-6 7 0 14" />
          <path d="M-5 19q-9 12 0 24" />
          <path d="M63 24q6 7 0 14" />
          <path d="M69 19q9 12 0 24" />
        </>
      )}
      <line x1="32" y1="7" x2="32" y2="14" />
      <circle className="solid" cx="32" cy="5" r="2.6" />
      <rect x="6.5" y="25" width="4.5" height="12" rx="2.2" />
      <rect x="53" y="25" width="4.5" height="12" rx="2.2" />
      <rect x="12" y="14" width="40" height="33" rx="10" />
      <rect x="17.5" y="21.5" width="29" height="14" rx="7" strokeWidth="1.4" />
      <circle className="solid" cx="26" cy="28.5" r="3" />
      <circle className="solid" cx="38" cy="28.5" r="3" />
      <rect className="solid" x="26" y="39" width="12" height="4" rx="1.5" />
      <line x1="25" y1="52" x2="39" y2="52" />
    </svg>
  );
}

export function Check() {
  return (
    <svg className="check" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}
