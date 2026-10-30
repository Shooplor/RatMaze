// Writes the cheese wedge for painting:
//   art/cheese-wedge/cheese-wedge.obj (+ .mtl)   the 3D model with its UVs, for Procreate
//   art/cheese-wedge/layout.json                  face outlines, read by draw_uv_template.py
// Run with `npm run art:cheese-wedge`, which also draws the UV template.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildCheeseWedge } from '../src/models/cheeseWedge.js';

const OUT = 'art/cheese-wedge';
const SCALE = 10; // the game's wedge is 0.6 units wide; bigger is easier to handle in Procreate

const wedge = buildCheeseWedge();
mkdirSync(OUT, { recursive: true });

const lines = ['# Rat\'s Maze cheese wedge, with UVs for painting', 'mtllib cheese-wedge.mtl', 'o cheese_wedge'];
const count = wedge.positions.length / 3;
for (let i = 0; i < count; i++) {
  const [x, y, z] = wedge.positions.slice(i * 3, i * 3 + 3).map((v) => (v * SCALE).toFixed(5));
  lines.push(`v ${x} ${y} ${z}`);
}
for (let i = 0; i < count; i++) lines.push(`vt ${wedge.uvs[i * 2].toFixed(6)} ${wedge.uvs[i * 2 + 1].toFixed(6)}`);
for (let i = 0; i < count; i++) lines.push(`vn ${wedge.normals.slice(i * 3, i * 3 + 3).map((v) => v.toFixed(5)).join(' ')}`);
lines.push('usemtl cheese');
for (let i = 1; i <= count; i += 3) lines.push(`f ${i}/${i}/${i} ${i + 1}/${i + 1}/${i + 1} ${i + 2}/${i + 2}/${i + 2}`);
writeFileSync(`${OUT}/cheese-wedge.obj`, `${lines.join('\n')}\n`);

writeFileSync(`${OUT}/cheese-wedge.mtl`, 'newmtl cheese\nKd 1 1 1\nmap_Kd cheese-wedge.png\n');
writeFileSync(`${OUT}/layout.json`, JSON.stringify({ size: wedge.size, islands: wedge.islands, legend: wedge.legend }, null, 1));
console.log(`wrote ${OUT}/cheese-wedge.obj (${count / 3} triangles), .mtl and layout.json`);
