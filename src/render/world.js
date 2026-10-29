import * as THREE from 'three';
import { TILE, WALL_HEIGHT } from '../config.js';
import { loadTexture } from './textures.js';

const LAMP_COLOR = 0xffb468;
const LAMP_INTENSITY = 7;
const LAMP_RANGE = TILE * 2.3; // short, so light doesn't seep into the next corridor

/** Builds the visible maze: walls, floor, ceiling and hanging lamps, all in one group. */
export function buildWorld(maze) {
  const group = new THREE.Group();
  group.add(buildWalls(maze));
  group.add(buildFloor(maze));
  group.add(buildCeiling(maze));
  const lamps = maze.lamps.map(({ cx, cz }, i) => buildLamp(maze, cx, cz, i));
  lamps.forEach((lamp) => group.add(lamp.group));

  // Faint fill light so unlit corridors are dark, not pitch black.
  group.add(new THREE.HemisphereLight(0x8c8296, 0x2a2018, 0.35));

  return {
    group,
    update(time) {
      lamps.forEach((lamp) => lamp.update(time));
    },
    /** Frees GPU memory when switching mazes. Textures are shared, so they stay. */
    dispose() {
      group.traverse((object) => {
        object.geometry?.dispose();
        object.material?.dispose();
        object.dispose?.(); // instanced meshes and lights
      });
    },
  };
}

// One instanced box per wall tile: hundreds of walls, a single draw call.
// Only walls that touch a corridor are built; the rest can never be seen.
function buildWalls(maze) {
  const visible = [];
  for (let cz = 0; cz < maze.rows; cz++) {
    for (let cx = 0; cx < maze.cols; cx++) {
      const isExit = maze.exit && cx === maze.exit.cx && cz === maze.exit.cz; // the door is built separately
      if (maze.isWall(cx, cz) && !isExit && maze.openNeighbourCount(cx, cz) > 0) visible.push({ cx, cz });
    }
  }

  const geometry = new THREE.BoxGeometry(TILE, WALL_HEIGHT, TILE);
  const material = new THREE.MeshLambertMaterial({ map: loadTexture('wall.png') });
  const walls = new THREE.InstancedMesh(geometry, material, visible.length);
  const matrix = new THREE.Matrix4();
  visible.forEach(({ cx, cz }, i) => {
    const { x, z } = maze.cellCenter(cx, cz);
    walls.setMatrixAt(i, matrix.makeTranslation(x, WALL_HEIGHT / 2, z));
  });
  return walls;
}

// Floor and ceiling are single planes; the texture repeats once per tile.
function buildFloor(maze) {
  const material = new THREE.MeshLambertMaterial({ map: loadTexture('floor.png') });
  const floor = new THREE.Mesh(tiledPlane(maze), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((maze.cols * TILE) / 2, 0, (maze.rows * TILE) / 2);
  return floor;
}

function buildCeiling(maze) {
  const material = new THREE.MeshLambertMaterial({ map: loadTexture('ceiling.png') });
  const ceiling = new THREE.Mesh(tiledPlane(maze), material);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((maze.cols * TILE) / 2, WALL_HEIGHT, (maze.rows * TILE) / 2);
  return ceiling;
}

// A plane covering the whole maze whose UVs run 0..cols and 0..rows, so a shared
// texture repeats once per tile without each surface needing its own texture copy.
function tiledPlane(maze) {
  const geometry = new THREE.PlaneGeometry(maze.cols * TILE, maze.rows * TILE);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * maze.cols, uv.getY(i) * maze.rows);
  return geometry;
}

// A bare bulb hanging on a cord, with a slight flicker.
function buildLamp(maze, cx, cz, index) {
  const { x, z } = maze.cellCenter(cx, cz);
  const cordLength = 0.45;
  const group = new THREE.Group();
  group.position.set(x, WALL_HEIGHT, z);

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, cordLength, 4),
    new THREE.MeshBasicMaterial({ color: 0x0c0a08 }),
  );
  cord.position.y = -cordLength / 2;
  group.add(cord);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe2a8 }),
  );
  bulb.position.y = -cordLength - 0.05;
  group.add(bulb);

  const light = new THREE.PointLight(LAMP_COLOR, LAMP_INTENSITY, LAMP_RANGE, 2);
  light.position.y = bulb.position.y - 0.05;
  group.add(light);

  const phase = index * 12.9898;
  return {
    group,
    update(time) {
      // Mostly steady with an occasional dip, like a weak bulb.
      const wobble = Math.sin(time * 7.3 + phase) * Math.sin(time * 2.1 + phase * 0.5);
      const dip = wobble > 0.93 ? 0.45 : 1;
      light.intensity = LAMP_INTENSITY * dip * (0.94 + 0.06 * Math.sin(time * 23 + phase));
    },
  };
}
