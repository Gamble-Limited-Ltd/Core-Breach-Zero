// Sim randomness: every random roll in the combat sim goes through rand(), so a host can seed it.
// Default is Math.random (browser solo play is unchanged); setSeed() switches to a deterministic mulberry32 stream.
// A host running many rooms gives each room its own stream (createRng) and swaps it in with useRng, so one room's
// rolls never shift another's (a single global stream would couple rooms through their interleaving).
let source = () => Math.random();
export function rand() { return source(); }
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function setSeed(seed) { source = createRng(seed); }
export function useRng(fn) { source = fn; }
export function clearSeed() { source = () => Math.random(); }
