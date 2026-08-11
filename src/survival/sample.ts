export const DEFAULT_SEED = 0x5eed1337;

/** Small deterministic PRNG — reproducible sampling across runs and platforms. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** First n items of a seeded Fisher-Yates shuffle — a uniform sample without replacement. */
export function seededSample<T>(items: readonly T[], n: number, seed: number): T[] {
  const arr = [...items];
  const rand = mulberry32(seed);
  const take = Math.min(n, arr.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rand() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.slice(0, take);
}
