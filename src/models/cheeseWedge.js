// The collectible cheese wedge, built by hand so its texture layout (its UVs) is a clean,
// paintable template: each face has its own area of the image, laid out as you'd see
// that face from outside the model.
//
// Plain data, no three.js, so tools/export-cheese-wedge.mjs can write the very same
// model as an OBJ (for painting on it in Procreate) and draw the UV template from it.

// The wedge's shape: a slice of a cheese wheel. Other sizes reuse the same texture layout.
export const WEDGE = { radius: 0.32, thickness: 0.18, angle: Math.PI * 0.3, segments: 8 };

// The texture: a square image, faces laid out with a margin and gaps for paint to spill into.
export const TEXTURE_SIZE = 1024;
const MARGIN = 40;
const GAP = 40;

// Where each face sits in the image, in pixels from the top left. One scale for every
// face, so the detail you paint is the same size everywhere on the model.
function layout() {
  const { radius: R, thickness: T, angle } = WEDGE;
  const sectorHeight = R * Math.sin(angle);
  const arc = R * angle;
  const scale = Math.min(
    (TEXTURE_SIZE - 2 * MARGIN - GAP) / (2 * R),
    (TEXTURE_SIZE - 2 * MARGIN - 2 * GAP) / (sectorHeight + 2 * T),
  );
  const row2 = MARGIN + sectorHeight * scale + GAP;
  const row3 = row2 + T * scale + GAP;
  return {
    scale,
    sectorHeight,
    arc,
    top: { x: MARGIN, y: MARGIN },
    bottom: { x: MARGIN + R * scale + GAP, y: MARGIN },
    rind: { x: MARGIN, y: row2 },
    cutA: { x: MARGIN + arc * scale + GAP, y: row2 },
    cutB: { x: MARGIN, y: row3 },
    legend: { x: MARGIN + R * scale + GAP, y: row3, right: TEXTURE_SIZE - MARGIN, bottom: TEXTURE_SIZE - MARGIN },
  };
}

/**
 * Builds the wedge at a given size (the texture layout stays the same).
 * @returns positions, normals and uvs as flat arrays (triangles, 3 vertices each), plus
 *   `islands`: each face's outline and edges in image pixels, for drawing the template.
 */
export function buildCheeseWedge({ radius = WEDGE.radius, thickness = WEDGE.thickness } = {}) {
  const { radius: R, thickness: T, angle: A, segments: N } = WEDGE;
  const L = layout();
  const s = L.scale;
  const sx = radius / R; // stretch the reference shape to the size asked for
  const sy = thickness / T;

  const positions = [];
  const normals = [];
  const uvs = [];

  // A point on the wedge: r out from the tip, at angle a around it, at height y.
  const point = (r, a, y) => [r * Math.cos(a) * sx, y * sy, -r * Math.sin(a) * sx];
  // A pixel in the image to a UV coordinate (v runs up from the bottom of the image).
  const uv = ([px, py]) => [px / TEXTURE_SIZE, 1 - py / TEXTURE_SIZE];
  const vertex = (pos, normal, pixel) => {
    positions.push(...pos);
    normals.push(...normal);
    uvs.push(...uv(pixel));
  };
  // Corners in counter-clockwise order as seen from outside: two triangles.
  const quad = (corners) => {
    for (const i of [0, 1, 2, 0, 2, 3]) vertex(...corners[i]);
  };

  const angles = Array.from({ length: N + 1 }, (_, i) => (A * i) / N);
  // Where a point of the slice shape lands on the top / bottom face images.
  const topPx = (r, a) => [L.top.x + r * Math.cos(a) * s, L.top.y + (L.sectorHeight - r * Math.sin(a)) * s];
  // The bottom is seen from below, which mirrors it left to right.
  const bottomPx = (r, a) => [L.bottom.x + (R - r * Math.cos(a)) * s, L.bottom.y + (L.sectorHeight - r * Math.sin(a)) * s];

  // Top and bottom: fans of triangles from the tip.
  for (let i = 0; i < N; i++) {
    const [a0, a1] = [angles[i], angles[i + 1]];
    vertex(point(0, 0, T), [0, 1, 0], topPx(0, 0));
    vertex(point(R, a0, T), [0, 1, 0], topPx(R, a0));
    vertex(point(R, a1, T), [0, 1, 0], topPx(R, a1));

    vertex(point(0, 0, 0), [0, -1, 0], bottomPx(0, 0));
    vertex(point(R, a1, 0), [0, -1, 0], bottomPx(R, a1));
    vertex(point(R, a0, 0), [0, -1, 0], bottomPx(R, a0));
  }

  // Rind: the curved outside, unrolled into a strip. Normals point straight out, so it
  // shades as a smooth curve.
  const rindPx = (a, y) => [L.rind.x + (a / A) * L.arc * s, L.rind.y + (T - y) * s];
  for (let i = 0; i < N; i++) {
    const [a0, a1] = [angles[i], angles[i + 1]];
    const n0 = [Math.cos(a0), 0, -Math.sin(a0)];
    const n1 = [Math.cos(a1), 0, -Math.sin(a1)];
    quad([
      [point(R, a0, 0), n0, rindPx(a0, 0)],
      [point(R, a1, 0), n1, rindPx(a1, 0)],
      [point(R, a1, T), n1, rindPx(a1, T)],
      [point(R, a0, T), n0, rindPx(a0, T)],
    ]);
  }

  // The two flat cut sides. Seen from outside, side A has the tip on the left,
  // side B has it on the right.
  const cutAPx = (r, y) => [L.cutA.x + r * s, L.cutA.y + (T - y) * s];
  const nA = [0, 0, 1];
  quad([
    [point(0, 0, 0), nA, cutAPx(0, 0)],
    [point(R, 0, 0), nA, cutAPx(R, 0)],
    [point(R, 0, T), nA, cutAPx(R, T)],
    [point(0, 0, T), nA, cutAPx(0, T)],
  ]);
  const cutBPx = (r, y) => [L.cutB.x + (R - r) * s, L.cutB.y + (T - y) * s];
  const nB = [-Math.sin(A), 0, -Math.cos(A)];
  quad([
    [point(R, A, 0), nB, cutBPx(R, 0)],
    [point(0, A, 0), nB, cutBPx(0, 0)],
    [point(0, A, T), nB, cutBPx(0, T)],
    [point(R, A, T), nB, cutBPx(R, T)],
  ]);

  centre(positions);

  // For the template: each face's outline, and its edges numbered so that edges with the
  // same number are the ones that meet on the model.
  const arcOf = (fn) => angles.map((a) => fn(a));
  const rect = (o, w, h) => [[o.x, o.y], [o.x + w, o.y], [o.x + w, o.y + h], [o.x, o.y + h]];
  const islands = [
    {
      name: 'top',
      label: 'TOP',
      note: 'from above',
      labelAt: topPx(R * 0.6, A * 0.3),
      outline: [topPx(0, 0), ...arcOf((a) => topPx(R, a))],
      edges: [
        { id: 1, points: arcOf((a) => topPx(R, a)) },
        { id: 3, points: [topPx(0, 0), topPx(R, 0)] },
        { id: 4, points: [topPx(0, 0), topPx(R, A)] },
      ],
      tip: topPx(0, 0),
    },
    {
      name: 'bottom',
      label: 'BOTTOM',
      note: 'from below',
      labelAt: bottomPx(R * 0.6, A * 0.3),
      outline: [bottomPx(0, 0), ...arcOf((a) => bottomPx(R, a))],
      edges: [
        { id: 2, points: arcOf((a) => bottomPx(R, a)) },
        { id: 5, points: [bottomPx(0, 0), bottomPx(R, 0)] },
        { id: 6, points: [bottomPx(0, 0), bottomPx(R, A)] },
      ],
      tip: bottomPx(0, 0),
    },
    {
      name: 'rind',
      label: 'RIND',
      note: 'the curved outside',
      outline: rect(L.rind, L.arc * s, T * s),
      edges: [
        { id: 1, points: [rindPx(0, T), rindPx(A, T)] },
        { id: 2, points: [rindPx(0, 0), rindPx(A, 0)] },
        { id: 7, points: [rindPx(0, 0), rindPx(0, T)] },
        { id: 8, points: [rindPx(A, 0), rindPx(A, T)] },
      ],
    },
    {
      name: 'cutA',
      label: 'CUT SIDE',
      note: 'tip on the left',
      outline: rect(L.cutA, R * s, T * s),
      edges: [
        { id: 3, points: [cutAPx(0, T), cutAPx(R, T)] },
        { id: 5, points: [cutAPx(0, 0), cutAPx(R, 0)] },
        { id: 7, points: [cutAPx(R, 0), cutAPx(R, T)] },
        { id: 9, points: [cutAPx(0, 0), cutAPx(0, T)] },
      ],
      tip: cutAPx(0, T / 2),
    },
    {
      name: 'cutB',
      label: 'CUT SIDE',
      note: 'tip on the right',
      outline: rect(L.cutB, R * s, T * s),
      edges: [
        { id: 4, points: [cutBPx(0, T), cutBPx(R, T)] },
        { id: 6, points: [cutBPx(0, 0), cutBPx(R, 0)] },
        { id: 8, points: [cutBPx(R, 0), cutBPx(R, T)] },
        { id: 9, points: [cutBPx(0, 0), cutBPx(0, T)] },
      ],
      tip: cutBPx(0, T / 2),
    },
  ];

  return { positions, normals, uvs, islands, legend: L.legend, size: TEXTURE_SIZE };
}

// Moves the model so its middle is at the origin: it spins around its own centre.
function centre(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }
  for (let i = 0; i < positions.length; i++) positions[i] -= (min[i % 3] + max[i % 3]) / 2;
}
