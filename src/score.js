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

/** Whether every trip keeps within its person's limit (null: no limit). */
export const withinLimits = (minutes, limits) => minutes.every((m, k) => limits[k] == null || m <= limits[k]);

/**
 * Rank places for a group, best first.
 *
 * `times[p]` holds the trips to `places[p]`, as travel.js `travelTimes`
 * returns them. A place that breaks anyone's time limit is left out — a limit
 * is a hard constraint, not a preference. Ties keep the closer place.
 */
export function rank(places, times, { weight = DEFAULT_WEIGHT, limits = [] } = {}) {
  return places
    .map((place, i) => ({ ...place, ...baryScore(times[i], weight) }))
    .filter((r) => withinLimits(r.minutes, limits))
    .sort((a, b) => b.score - a.score || a.mean - b.mean);
}

/**
 * The person whose limit rules out the most places, or -1: what to tell the
 * group when nothing is left.
 */
export function tightest(times, limits) {
  let worst = -1;
  let most = 0;
  limits.forEach((limit, k) => {
    if (limit == null) return;
    const out = times.filter((t) => t[k] > limit).length;
    if (out > most) [worst, most] = [k, out];
  });
  return worst;
}
