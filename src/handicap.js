// WHS (World Handicap System) handicap calculations

// Number of differentials to use based on how many valid rounds exist
const WHS_TABLE = [
  { min: 20, use: 8, adj: 0 },
  { min: 19, use: 7, adj: 0 },
  { min: 17, use: 6, adj: 0 },
  { min: 15, use: 5, adj: 0 },
  { min: 12, use: 4, adj: 0 },
  { min: 9,  use: 3, adj: 0 },
  { min: 6,  use: 2, adj: 0 },
  { min: 5,  use: 1, adj: 0 },
  { min: 4,  use: 1, adj: -1.0 },
  { min: 3,  use: 1, adj: -2.0 },
];

export function calculateDifferential(score, rating, slope) {
  return (score - rating) * 113 / slope;
}

// Takes an array of completed round objects from Firestore.
// Returns { index: number|null, message: string, validCount: number, countingCount: number }
export function calculateHandicapIndex(rounds) {
  const valid = rounds
    .filter(r => r.completed && !r.abandoned && r.rating && r.slope)
    .map(r => {
      const score = r.holeData.reduce((s, h) => s + (h.score ?? 0), 0);
      return calculateDifferential(score, r.rating, r.slope);
    })
    .sort((a, b) => a - b);

  const n = Math.min(valid.length, 20);
  const recent = valid.slice(0, n);

  const row = WHS_TABLE.find(r => n >= r.min);
  if (!row) {
    return { index: null, message: `Need ${3 - n} more rated round${3 - n === 1 ? '' : 's'}`, validCount: n, countingCount: 0 };
  }

  const lowest = recent.slice(0, row.use);
  const avg = lowest.reduce((s, d) => s + d, 0) / lowest.length;
  const raw = avg * 0.96 + row.adj;
  const index = Math.floor(raw * 10) / 10;

  return { index, message: null, validCount: n, countingCount: row.use };
}

// Returns the course handicap for a given index, slope, rating, and par.
// The WHS formula is: Index × (Slope / 113) + (Rating - Par), rounded to nearest integer.
export function calculateCourseHandicap(index, slope, rating, par) {
  if (index === null || !slope || !rating || !par) return null;
  return Math.round(index * (slope / 113) + (rating - par));
}
