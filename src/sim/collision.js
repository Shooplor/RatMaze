/**
 * Moves a circle (a rat seen from above) through the maze, sliding along walls.
 * Wall tiles are squares, so each check is circle-vs-box: find the closest point
 * on the box and push the circle out along that direction.
 */
export function moveCircle(maze, x, z, radius, dx, dz) {
  // Small sub-steps so a fast move can never skip through a wall.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.5)));
  for (let i = 0; i < steps; i++) {
    x += dx / steps;
    z += dz / steps;
    ({ x, z } = pushOutOfWalls(maze, x, z, radius));
  }
  return { x, z };
}

function pushOutOfWalls(maze, x, z, radius) {
  const t = maze.tileSize;
  // Two passes settle corners where pushing out of one wall nudges into another.
  for (let pass = 0; pass < 2; pass++) {
    const minCx = Math.floor((x - radius) / t);
    const maxCx = Math.floor((x + radius) / t);
    const minCz = Math.floor((z - radius) / t);
    const maxCz = Math.floor((z + radius) / t);

    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        if (!maze.isWall(cx, cz)) continue;
        const nearX = clamp(x, cx * t, (cx + 1) * t);
        const nearZ = clamp(z, cz * t, (cz + 1) * t);
        const ox = x - nearX;
        const oz = z - nearZ;
        const dist2 = ox * ox + oz * oz;
        if (dist2 >= radius * radius) continue;

        if (dist2 > 1e-12) {
          const dist = Math.sqrt(dist2);
          x = nearX + (ox / dist) * radius;
          z = nearZ + (oz / dist) * radius;
        } else {
          // Centre inside the box (sub-steps should prevent this): leave by the nearest side.
          const exits = [
            [cx * t - radius, z, x - cx * t],
            [(cx + 1) * t + radius, z, (cx + 1) * t - x],
            [x, cz * t - radius, z - cz * t],
            [x, (cz + 1) * t + radius, (cz + 1) * t - z],
          ];
          exits.sort((a, b) => a[2] - b[2]);
          [x, z] = exits[0];
        }
      }
    }
  }
  return { x, z };
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
