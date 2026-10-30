import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCheeseWedge, TEXTURE_SIZE } from '../src/models/cheeseWedge.js';

const wedge = buildCheeseWedge();
const triangles = [];
for (let i = 0; i < wedge.positions.length / 9; i++) {
  const p = (k) => wedge.positions.slice(i * 9 + k * 3, i * 9 + k * 3 + 3);
  const n = (k) => wedge.normals.slice(i * 9 + k * 3, i * 9 + k * 3 + 3);
  const t = (k) => wedge.uvs.slice(i * 6 + k * 2, i * 6 + k * 2 + 2);
  triangles.push({ p: [p(0), p(1), p(2)], n: [n(0), n(1), n(2)], uv: [t(0), t(1), t(2)] });
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);

test('every face points outward (front faces wind counter-clockwise from outside)', () => {
  for (const { p, n } of triangles) {
    const facing = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const normal = n[0].map((_, i) => n[0][i] + n[1][i] + n[2][i]);
    assert.ok(dot(facing, normal) > 0);
  }
});

test('no face shows its texture mirrored when seen from outside', () => {
  for (const { uv } of triangles) {
    const area = (uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) - (uv[2][0] - uv[0][0]) * (uv[1][1] - uv[0][1]);
    assert.ok(area > 0, 'UV triangle winds the same way as the face');
  }
});

test('the faces fit inside the image without overlapping', () => {
  for (const v of wedge.uvs) assert.ok(v > 0 && v < 1);
  const boxes = wedge.islands.map(({ outline }) => ({
    x0: Math.min(...outline.map((q) => q[0])),
    x1: Math.max(...outline.map((q) => q[0])),
    y0: Math.min(...outline.map((q) => q[1])),
    y1: Math.max(...outline.map((q) => q[1])),
  }));
  boxes.forEach((a, i) => boxes.forEach((b, j) => {
    if (i >= j) return;
    const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    assert.ok(!overlap, `${wedge.islands[i].name} overlaps ${wedge.islands[j].name}`);
  }));
  for (const b of boxes) assert.ok(b.x1 <= TEXTURE_SIZE && b.y1 <= TEXTURE_SIZE);
});

test('every numbered edge appears on exactly two faces, with matching lengths', () => {
  const edges = new Map();
  for (const island of wedge.islands) {
    for (const edge of island.edges) {
      const length = edge.points.slice(1).reduce((sum, q, i) => sum + Math.hypot(q[0] - edge.points[i][0], q[1] - edge.points[i][1]), 0);
      edges.set(edge.id, [...(edges.get(edge.id) ?? []), length]);
    }
  }
  assert.equal(edges.size, 9);
  for (const [id, lengths] of edges) {
    assert.equal(lengths.length, 2, `edge ${id}`);
    assert.ok(Math.abs(lengths[0] - lengths[1]) / lengths[0] < 0.02, `edge ${id} lengths ${lengths}`);
  }
});

test('the model is centred and keeps its proportions at other sizes', () => {
  const xs = wedge.positions.filter((_, i) => i % 3 === 0);
  assert.ok(Math.abs(Math.max(...xs) + Math.min(...xs)) < 1e-9);
  const small = buildCheeseWedge({ radius: 0.16, thickness: 0.09 });
  small.positions.forEach((v, i) => assert.ok(Math.abs(v * 2 - wedge.positions[i]) < 1e-9));
  assert.deepEqual(small.uvs, wedge.uvs, 'same texture layout at any size');
});
