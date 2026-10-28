// PRNG determinista (mulberry32) para datos reproducibles: seed, fixtures y tests.
// No usar para nada criptográfico.
export type Rng = {
  /** Float uniforme en [0, 1). */
  next: () => number;
  /** Entero uniforme en [min, max] (ambos incluidos). */
  int: (min: number, max: number) => number;
  /** Elemento aleatorio de una lista no vacía. */
  pick: <T>(items: readonly T[]) => T;
  /** true con probabilidad p. */
  chance: (p: number) => boolean;
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  const pick = <T,>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error("pick() con lista vacía");
    return items[int(0, items.length - 1)];
  };
  const chance = (p: number) => next() < p;
  return { next, int, pick, chance };
}
