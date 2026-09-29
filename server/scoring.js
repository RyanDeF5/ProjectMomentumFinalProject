// Quantitative momentum score: the part of Legend's 0-2000 score that comes straight from the
// numbers. Legend (the model) then adds a news catalyst bonus and subtracts a risk penalty, so the
// final score is anchored in the data rather than invented by the model.
//
//   quant (0-1600) = gap 450 + relative volume 450 + float 350 + price range 150 + float turnover 200
//   catalyst (0-400) and risk penalty (0 to -600) come from Legend's read of the news

/** Piecewise-linear lookup; `log` interpolates on a log scale (for float sizes). */
function curve(points, x, { log = false } = {}) {
  if (!Number.isFinite(x)) return null;
  const key = (v) => (log ? Math.log10(Math.max(v, 1)) : v);
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((key(x) - key(x0)) / (key(x1) - key(x0))) * (y1 - y0);
  }
  return points[points.length - 1][1];
}

// Day-trading momentum profile: a real gap, heavy relative volume, low float, a $2-$20 price
const GAP = [[0, 0], [2, 40], [5, 120], [10, 250], [20, 380], [35, 450]];
const RVOL = [[0.5, 0], [1, 40], [2, 130], [3, 220], [5, 330], [10, 420], [20, 450]];
const FLOAT = [[1e6, 350], [5e6, 340], [1e7, 300], [2e7, 230], [5e7, 130], [1e8, 70], [5e8, 25], [2e9, 5], [1e10, 0]];
const PRICE = [[0.5, 20], [1, 60], [2, 150], [20, 150], [30, 110], [50, 70], [100, 35], [300, 10]];
const TURNOVER = [[0, 0], [1, 20], [5, 60], [20, 120], [50, 170], [100, 200]];

const UNKNOWN_FLOAT_POINTS = 120;

function quantScore(m) {
  const floatKnown = Number(m.floatShares) > 0;
  const components = [
    { key: "gap", label: "GAP", max: 450, points: curve(GAP, Math.max(0, m.changePercent ?? 0)) ?? 0 },
    { key: "rvol", label: "REL VOLUME", max: 450, points: curve(RVOL, m.relativeVolume ?? 0) ?? 0 },
    { key: "float", label: "FLOAT", max: 350, points: floatKnown ? curve(FLOAT, m.floatShares, { log: true }) : UNKNOWN_FLOAT_POINTS },
    { key: "price", label: "PRICE RANGE", max: 150, points: curve(PRICE, m.price ?? 0) ?? 0 },
    { key: "turnover", label: "FLOAT TURNOVER", max: 200, points: floatKnown ? (curve(TURNOVER, m.floatTurnoverPercent ?? 0) ?? 0) : 0 },
  ].map((c) => ({ ...c, points: Math.round(c.points) }));

  // Volume on a falling stock is selling pressure, not momentum: fade those points as it drops
  const change = m.changePercent ?? 0;
  if (change < 0) {
    const fade = Math.max(0.25, 1 + change / 10);
    for (const c of components) if (c.key === "rvol" || c.key === "turnover") c.points = Math.round(c.points * fade);
  }

  // Thinly traded names can't run: scale the score down under $1M of volume traded
  const dollarVolume = Number(m.dollarVolume) || 0;
  const liquidity = dollarVolume >= 1e6 ? 1 : Math.max(0.3, dollarVolume / 1e6);
  const total = Math.round(components.reduce((sum, c) => sum + c.points, 0) * liquidity);
  return { components, liquidity: Math.round(liquidity * 100) / 100, total };
}

const CATALYST_POINTS = { none: 0, weak: 100, moderate: 220, strong: 330, major: 400 };
const RISK_POINTS = { none: 0, minor: -100, moderate: -250, severe: -450, critical: -600 };

/** Rating suggested by the price action alone (Legend can refine it within reason). */
function suggestedRating(m) {
  const change = m.changePercent ?? 0;
  if (change >= 35) return "Overheating";
  if (change >= 3) return "Strong";
  if (change > -3) return "Stable";
  if (change > -12) return "Weak";
  return "Crashing";
}

/** Keep Legend's rating unless it contradicts the direction of the move. */
function reconcileRating(rating, m) {
  const change = m.changePercent ?? 0;
  const up = rating === "Strong" || rating === "Overheating";
  const down = rating === "Weak" || rating === "Crashing";
  if ((up && change < 0) || (down && change > 3)) return suggestedRating(m);
  return rating;
}

function finalScore(quant, catalyst, risk) {
  const catalystPoints = CATALYST_POINTS[catalyst] ?? 0;
  const riskPoints = RISK_POINTS[risk] ?? 0;
  return {
    score: Math.max(0, Math.min(2000, quant.total + catalystPoints + riskPoints)),
    catalystPoints,
    riskPoints,
  };
}

module.exports = { quantScore, finalScore, suggestedRating, reconcileRating, CATALYST_POINTS, RISK_POINTS };
