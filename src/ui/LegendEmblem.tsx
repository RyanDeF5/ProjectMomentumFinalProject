// Legend's badge, in the style of the Legend Pass emblem: an elongated gold hexagon with a black
// face, a bevelled gold star, the name underneath, and a laurel wreath. Flat gold tones only (no
// gradients or masks) so it renders the same everywhere.

const GOLD_LIGHT = "#ffe27a";
const GOLD = "#f5c21b";
const GOLD_DARK = "#b9820e";
const GOLD_DEEP = "#8a5c06";

const CX = 60;
const STAR_CY = 50;

function starPoints(outer: number, inner: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return [CX + r * Math.cos(a), STAR_CY + r * Math.sin(a)] as const;
  });
}

// Each star arm is split down the middle into a lit face and a shaded face
const STAR = starPoints(22, 9);
const STAR_FACETS = STAR.map((point, i) => {
  const next = STAR[(i + 1) % STAR.length];
  const lit = i % 2 === 1; // faces running from an inner corner out to the next tip
  return { d: `M${CX} ${STAR_CY} L${point[0].toFixed(2)} ${point[1].toFixed(2)} L${next[0].toFixed(2)} ${next[1].toFixed(2)} Z`, lit };
});

// Laurel: two branches that sweep from the bottom of the badge up each side. Angles are measured
// from straight down (0) to straight up (180); each step has an outer and an inner leaf.
const WREATH_CY = 60;
const WREATH_R = 47;
const onArc = (theta: number, side: number, r = WREATH_R) => {
  const rad = (theta * Math.PI) / 180;
  return { x: CX + side * r * Math.sin(rad), y: WREATH_CY + r * Math.cos(rad) };
};
const LEAVES = (() => {
  const leaves: { x: number; y: number; angle: number; light: boolean }[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const theta = 30 + i * 17;
      // Long axis follows the branch, tipped outward (outer leaf) or inward (inner leaf)
      const along = side * (180 - theta);
      const outer = onArc(theta, side, WREATH_R + 4);
      const inner = onArc(theta + 6, side, WREATH_R - 4);
      leaves.push({ ...outer, angle: along + side * 28, light: i % 2 === 0 });
      leaves.push({ ...inner, angle: along - side * 28, light: i % 2 === 1 });
    }
  }
  return leaves;
})();
const branch = (side: number) => {
  const a = onArc(24, side);
  const b = onArc(160, side);
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} A${WREATH_R} ${WREATH_R} 0 0 ${side === 1 ? 0 : 1} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
};

interface LegendEmblemProps {
  size?: number;
  /** Pulses while Legend is working */
  working?: boolean;
  className?: string;
}

export function LegendEmblem({ size = 64, working, className }: LegendEmblemProps) {
  return (
    <svg
      className={`legend-emblem${working ? " is-working" : ""}${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden
    >
      {/* Laurel wreath */}
      <path d={branch(-1)} fill="none" stroke={GOLD_DARK} strokeWidth="2" />
      <path d={branch(1)} fill="none" stroke={GOLD_DARK} strokeWidth="2" />
      {LEAVES.map((leaf, i) => (
        <ellipse
          key={i}
          cx={leaf.x}
          cy={leaf.y}
          rx="3.2"
          ry="7"
          transform={`rotate(${leaf.angle} ${leaf.x} ${leaf.y})`}
          fill={leaf.light ? GOLD : GOLD_DARK}
        />
      ))}

      {/* Hexagon: gold rim with a bevel, black face */}
      <path d="M60 10 L92 28 L92 90 L60 108 L28 90 L28 28 Z" fill={GOLD_DARK} />
      <path d="M60 10 L92 28 L92 59 L28 59 L28 28 Z" fill={GOLD} />
      <path d="M60 16 L87 31 L87 87 L60 102 L33 87 L33 31 Z" fill="#0b0b0c" />
      <path d="M60 16 L87 31 L87 33 L60 18 L33 33 L33 31 Z" fill={GOLD_DEEP} opacity="0.8" />

      {/* Bevelled star */}
      {STAR_FACETS.map((facet, i) => (
        <path key={i} d={facet.d} fill={facet.lit ? GOLD_LIGHT : GOLD_DARK} />
      ))}

      <text
        x={CX}
        y="89"
        textAnchor="middle"
        fontFamily="Rajdhani, sans-serif"
        fontWeight="700"
        fontSize="13"
        letterSpacing="1.5"
        fill={GOLD}
      >
        LEGEND
      </text>
    </svg>
  );
}

const STAR_PATH = `M${STAR.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L")} Z`;

/**
 * The badge at icon size for long lists: the gold hexagon and star only, three shapes instead of
 * the full emblem's wreath of leaves (which can't be seen at 16px anyway).
 */
export function LegendMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={`legend-mark${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="11 10 98 98" aria-hidden>
      <path d="M60 10 L92 28 L92 90 L60 108 L28 90 L28 28 Z" fill={GOLD} />
      <path d="M60 18 L86 32 L86 86 L60 100 L34 86 L34 32 Z" fill="#0b0b0c" />
      <path d={STAR_PATH} transform="translate(0 9)" fill={GOLD_LIGHT} />
    </svg>
  );
}
