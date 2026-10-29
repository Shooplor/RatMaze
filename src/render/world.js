import * as THREE from 'three';
import { TILE, WALL_HEIGHT } from '../config.js';
import { loadTexture } from './textures.js';

const LAMP_COLOR = 0xffb468;
const LAMP_INTENSITY = 7;
const LAMP_RANGE = TILE * 2.3; // short, so light doesn't seep into the next corridor

/** Builds the visible maze: walls, floor, ceiling and hanging lamps. */
export function buildWorld(maze, scene) {
  scene.add(buildWalls(maze));
  scene.add(buildFloor(maze));
  scene.add(buildCeiling(maze));
  const lamps = maze.lamps.map(({ cx, cz }, i) => buildLamp(maze, cx, cz, i));
  lamps.forEach((lamp) => scene.add(lamp.group));

  // Faint fill light so unlit corridors are dark, not pitch black.
  scene.add(new THREE.HemisphereLight(0x8c8296, 0x2a2018, 0.35));

  return {
    update(time) {
      lamps.forEach((lamp) => lamp.update(time));
    },
  };
}

// One instanced box per wall tile: hundreds of walls, a single draw call.
// Only walls that touch a corridor are built; the rest can never be seen.
function buildWalls(maze) {
  const visible = [];
  for (let cz = 0; cz < maze.rows; cz++) {
    for (let cx = 0; cx < maze.cols; cx++) {
      if (maze.isWall(cx, cz) && maze.openNeighbourCount(cx, cz) > 0) visible.push({ cx, cz });
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
  const width = maze.cols * TILE;
  const depth = maze.rows * TILE;
  const material = new THREE.MeshLambertMaterial({
    map: loadTexture('floor.png', { repeatX: maze.cols, repeatY: maze.rows }),
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(width / 2, 0, depth / 2);
  return floor;
}

function buildCeiling(maze) {
  const width = maze.cols * TILE;
  const depth = maze.rows * TILE;
  const material = new THREE.MeshLambertMaterial({
    map: loadTexture('ceiling.png', { repeatX: maze.cols, repeatY: maze.rows }),
  });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(width / 2, WALL_HEIGHT, depth / 2);
  return ceiling;
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
