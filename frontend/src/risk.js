import { LANDMARKS } from './mockData.js';

// Hand-tuned logistic model standing in for the trained ML model (Phase 2).
// Each feature contributes to the log-odds; top contributions become "reasons".
const INTERCEPT = -3.2;

function near(block, type, radius = 1) {
  return LANDMARKS.some(
    (l) => l.type === type && Math.max(Math.abs(l.row - block.row), Math.abs(l.col - block.col)) <= radius
  );
}

export function predict(block, scenario) {
  const { rain, marketDay, missedPickup } = scenario;
  const days = block.daysSincePickup + (missedPickup ? 2 : 0);
  const c = [];
  const add = (label, value) => value > 0 && c.push({ label, value });

  add(`${block.reports7d} citizen report${block.reports7d === 1 ? '' : 's'} this week`, block.reports7d * 0.38);
  add(`${days} days since last pickup${missedPickup ? ' (pickup missed)' : ''}`, days * 0.42);
  add('High foot traffic', block.footfall * 0.9);

  const market = near(block, 'market');
  add('Next to vegetable market', market ? 1.0 : 0);
  add('Market day crowd', market && marketDay ? 1.3 : 0);
  add('Near bus stand', near(block, 'bus') ? 0.9 : 0);
  add('Construction debris nearby', near(block, 'construction') ? 0.8 : 0);
  const plot = near(block, 'plot');
  add('Open plot (illegal dumping)', plot ? 1.2 : 0);
  add('Rain: wet waste & clogged drains', rain ? (plot || market ? 0.9 : 0.4) : 0);

  const logit = INTERCEPT + c.reduce((s, x) => s + x.value, 0);
  const prob = 1 / (1 + Math.exp(-logit));
  const reasons = c.sort((a, b) => b.value - a.value).slice(0, 3).map((x) => x.label);
  return { prob, reasons };
}

export function level(prob) {
  if (prob >= 0.6) return 'high';
  if (prob >= 0.3) return 'medium';
  return 'low';
}

export const LEVEL_COLOR = { high: '#dc2626', medium: '#f59e0b', low: '#16a34a' };
