/**
 * How a sound made at one spot reaches a listener somewhere else in the maze.
 * Sound travels along the corridors, not through walls: the distance that counts is
 * the walk between the two, and with no straight line between them it arrives muffled.
 * Louder sounds carry further. Players hear this; the AI will use the same rules.
 *
 * @returns {{ volume: number, inSight: boolean }} volume 0 (inaudible) to 1
 */
export function hearSound(maze, from, to, loudness, range) {
  if (loudness <= 0) return { volume: 0, inSight: false };
  const inSight = maze.lineOfSight(from.x, from.z, to.x, to.z);
  let distance;
  if (inSight) {
    distance = Math.hypot(from.x - to.x, from.z - to.z);
  } else {
    const start = maze.cellAt(to.x, to.z);
    const end = maze.cellAt(from.x, from.z);
    const steps = maze.distancesFrom(start)[end.cz * maze.cols + end.cx];
    distance = steps < 0 ? Infinity : steps * maze.tileSize;
  }
  const reach = range * loudness;
  const fade = Math.max(0, 1 - distance / reach);
  return { volume: loudness * fade * fade, inSight };
}
