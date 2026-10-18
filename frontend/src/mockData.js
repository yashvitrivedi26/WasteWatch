// Synthetic Bhavnagar ward: 10 x 7 grid of ~100 m blocks.
export const ORIGIN = { lat: 21.7645, lng: 72.1490 }; // south-west corner
export const COLS = 10;
export const ROWS = 7;
const DLAT = 0.0009; // ~100 m
const DLNG = 0.000967; // ~100 m at 21.76° N

export const TEAMS = ['Team A', 'Team B', 'Team C', 'Team D'];

export const LANDMARKS = [
  { id: 'market', name: 'Vegetable market', type: 'market', row: 4, col: 2 },
  { id: 'bus', name: 'Bus stand', type: 'bus', row: 1, col: 7 },
  { id: 'construction', name: 'Construction site', type: 'construction', row: 5, col: 8 },
  { id: 'plot', name: 'Open plot', type: 'plot', row: 2, col: 4 },
];

// Deterministic pseudo-random so the demo looks the same on every load.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function blockBounds(row, col) {
  const s = ORIGIN.lat + row * DLAT;
  const w = ORIGIN.lng + col * DLNG;
  return [[s, w], [s + DLAT, w + DLNG]];
}

export function blockCenter(row, col) {
  const [[s, w], [n, e]] = blockBounds(row, col);
  return [(s + n) / 2, (w + e) / 2];
}

const rand = seeded(42);
export const BLOCKS = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    BLOCKS.push({
      id: `${String.fromCharCode(65 + (ROWS - 1 - row))}${col + 1}`, // A = top row
      row,
      col,
      reports7d: Math.floor(rand() * 5), // citizen reports in last 7 days
      daysSincePickup: 1 + Math.floor(rand() * 3),
      footfall: +(0.2 + rand() * 0.8).toFixed(2), // 0..1 relative
    });
  }
}
