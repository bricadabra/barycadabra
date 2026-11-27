/**
 * BaryScore: how good a place is for the whole group, 0-100. Pure.
 *
 *   proximity  linear on the group's mean trip: 100 at 0 min, 0 from 66 min
 *   fairness   one minus the coefficient of variation of the trips
 *
 * blended by a weight the user sets, 85 % proximity by default: getting there
 * fast matters most, but not at any cost in fairness — a place next door for
 * three people and an hour away for the fourth loses to one that is twenty
 * minutes for everyone.
 */

export const DEFAULT_WEIGHT = 0.85;

/** Score one place from the trip of every participant, in minutes. */
export function baryScore(minutes, weight = DEFAULT_WEIGHT) {
  const mean = minutes.reduce((s, m) => s + m, 0) / minutes.length;
  const variance = minutes.reduce((s, m) => s + (m - mean) ** 2, 0) / minutes.length;
  // Everyone already there is perfectly fair.
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  const proximity = Math.max(0, 100 - mean * 1.5);
  const fairness = Math.max(0, 100 * (1 - cv));
  return {
    score: Math.round(Math.max(1, Math.min(100, proximity * weight + fairness * (1 - weight)))),
    mean,
    max: Math.max(...minutes),
    minutes,
    // Each participant's gap to the group mean: negative is advantaged.
    gaps: minutes.map((m) => m - mean),
  };
}

/**
 * Whether every trip is possible (travel.js returns Infinity beyond a mode's
 * reach) and keeps within its person's limit (null: no limit).
 */
export const admissible = (minutes, limits) =>
  minutes.every((m, k) => Number.isFinite(m) && (limits[k] == null || m <= limits[k]));

/**
 * Rank places for a group, best first.
 *
 * `times[p]` holds the trips to `places[p]`, as travel.js `travelTimes`
 * returns them. A place someone cannot reach, or only beyond their time
 * limit, is left out — hard constraints, not preferences. Ties keep the closer
 * place.
 */
export function rank(places, times, { weight = DEFAULT_WEIGHT, limits = [] } = {}) {
  return places
    .flatMap((place, i) => (admissible(times[i], limits) ? [{ ...place, ...baryScore(times[i], weight) }] : []))
    .sort((a, b) => b.score - a.score || a.mean - b.mean);
}

/**
 * What to tell the group when nothing is left: the person who rules out the
 * most places, and why — "reach" (out of reach of their mode) or "limit"
 * (their own time limit). `{ who: -1 }` when no one rules anything out.
 */
export function blocker(times, limits) {
  let best = { who: -1, why: null, count: 0 };
  limits.forEach((limit, k) => {
    const reach = times.filter((t) => !Number.isFinite(t[k])).length;
    const over = limit == null ? 0 : times.filter((t) => Number.isFinite(t[k]) && t[k] > limit).length;
    if (reach + over > best.count) best = { who: k, why: reach >= over ? "reach" : "limit", count: reach + over };
  });
  return { who: best.who, why: best.why };
}
