// Legend token, after the game's A-token: a rounded blue pentagon with a dark arch mark.
// Flat colors only, so it renders the same everywhere.
export function TokenIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="token-icon">
      <path d="M12 2.2 21.6 9.2 17.9 20.6H6.1L2.4 9.2Z" fill="#2f80f5" stroke="#2f80f5" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M12 6.6 17.2 17h-3l-2.2-4.7L9.8 17h-3Z" fill="#0f1c33" />
    </svg>
  );
}
