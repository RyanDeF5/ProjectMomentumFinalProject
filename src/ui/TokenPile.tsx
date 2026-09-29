// Pile of Legend tokens for the token cards, like the game's shop art: stacks of blue slabs with a
// large token leaning in front. `level` (1-4) sets how big the pile is.

const TOP = "#8ed3f7";
const FACE = "#3d97cc";
const SHADE = "#246593";

function Slab({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="56" height="11" fill={FACE} />
      <rect x={x} y={y} width="56" height="3.5" fill={TOP} />
      <rect x={x} y={y + 8} width="56" height="3" fill={SHADE} />
      <rect x={x + 44} y={y} width="12" height="11" fill={SHADE} opacity="0.55" />
    </g>
  );
}

const STACKS: Record<number, { x: number; count: number }[]> = {
  1: [{ x: 84, count: 4 }],
  2: [
    { x: 84, count: 6 },
    { x: 60, count: 3 },
  ],
  3: [
    { x: 92, count: 8 },
    { x: 68, count: 6 },
    { x: 44, count: 3 },
  ],
  4: [
    { x: 96, count: 10 },
    { x: 74, count: 8 },
    { x: 52, count: 6 },
    { x: 30, count: 3 },
  ],
};

export function TokenPile({ level = 1 }: { level?: 1 | 2 | 3 | 4 }) {
  return (
    <svg className="token-pile" viewBox="0 0 160 120" aria-hidden>
      {STACKS[level].map((stack, s) =>
        Array.from({ length: stack.count }, (_, i) => <Slab key={`${s}-${i}`} x={stack.x} y={104 - (i + 1) * 10} />),
      )}
      {/* Large token leaning in front */}
      <g transform="translate(58 82) rotate(-14)">
        <path d="M0 -36 34 -11 21 29H-21L-34 -11Z" fill={SHADE} stroke={SHADE} strokeWidth="6" strokeLinejoin="round" transform="translate(4 5)" />
        <path d="M0 -36 34 -11 21 29H-21L-34 -11Z" fill={TOP} stroke={TOP} strokeWidth="6" strokeLinejoin="round" />
        <path d="M0 -27 26 -8 16 22H-16L-26 -8Z" fill="#26313d" />
        <path d="M0 -14 10 10H4.5L0 0 -4.5 10H-10Z" fill={TOP} />
      </g>
    </svg>
  );
}
