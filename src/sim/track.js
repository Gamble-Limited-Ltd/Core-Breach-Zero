// DOM-free track sampler: turns a map path string into points 2 px apart along its arc length.
// Handles only what src/app/maps.js uses: absolute M, H, V, L, Q. Add a case here before using another command.
const STEP = 2;
const QUAD_SEGS = 200; // fine polyline per Bezier, so arc length is accurate to well under a pixel

function flatten(d) {
  const tok = d.match(/[A-Za-z]|-?\d*\.?\d+/g) || [];
  const poly = [];
  let i = 0; let cmd = ''; let x = 0; let y = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') { x = num(); y = num(); poly.push([x, y]); cmd = 'L'; }
    else if (cmd === 'L') { x = num(); y = num(); poly.push([x, y]); }
    else if (cmd === 'H') { x = num(); poly.push([x, y]); }
    else if (cmd === 'V') { y = num(); poly.push([x, y]); }
    else if (cmd === 'Q') {
      const cx = num(); const cy = num(); const ex = num(); const ey = num();
      const sx = x; const sy = y;
      for (let s = 1; s <= QUAD_SEGS; s += 1) {
        const t = s / QUAD_SEGS; const u = 1 - t;
        poly.push([u * u * sx + 2 * u * t * cx + t * t * ex, u * u * sy + 2 * u * t * cy + t * t * ey]);
      }
      x = ex; y = ey;
    } else throw new Error(`track.js: unsupported path command ${cmd}`);
  }
  return poly;
}

export function buildSampler(d) {
  const poly = flatten(d);
  const cum = [0];
  for (let k = 1; k < poly.length; k += 1) cum.push(cum[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
  const len = cum[cum.length - 1];
  const pts = [];
  let seg = 1;
  for (let l = 0; l <= len; l += STEP) {
    while (seg < cum.length - 1 && cum[seg] < l) seg += 1;
    const span = cum[seg] - cum[seg - 1] || 1;
    const f = (l - cum[seg - 1]) / span;
    pts.push([poly[seg - 1][0] + (poly[seg][0] - poly[seg - 1][0]) * f, poly[seg - 1][1] + (poly[seg][1] - poly[seg - 1][1]) * f]);
  }
  return { pts, len, step: STEP, at(dist) { return pts[Math.min(pts.length - 1, Math.max(0, Math.round(dist / STEP)))]; } };
}
