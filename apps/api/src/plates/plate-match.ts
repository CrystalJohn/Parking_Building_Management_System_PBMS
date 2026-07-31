import { normalize } from './plate-formatter';

export interface PlateMatch {
  rawPlate: string;
  canonicalPlate: string;
  similarity: number;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return 1;
  if (x.length === 0 || y.length === 0) return 0;
  const dist = levenshtein(x, y);
  return 1 - dist / Math.max(x.length, y.length);
}

export function matchPlate(
  rawPlate: string,
  knownCanonicals: string[],
  threshold = 0.8,
): PlateMatch | null {
  let best: PlateMatch | null = null;
  for (const candidate of knownCanonicals) {
    const score = similarity(rawPlate, candidate);
    if (!best || score > best.similarity) {
      best = { rawPlate, canonicalPlate: candidate, similarity: score };
    }
  }
  if (!best || best.similarity < threshold) return null;
  return best;
}
