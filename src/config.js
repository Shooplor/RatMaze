// Tuning values in one place. Distances are in world units; one maze tile is TILE wide.
// Rat values (radius, speed, eye height) move into hero definitions once heroes exist.

export const TILE = 2.2;          // corridor width, and the size of one wall/floor texture
export const WALL_HEIGHT = 2.2;   // equal to TILE so each wall face shows one square texture
export const EYE_HEIGHT = 1.55;

// Maze size in tiles (odd numbers). Play time grows with the corridors you have to walk:
// 15 gives about 100 cheese, 17 about 130, 21 about 205.
export const MAZE_COLS = 17;
export const MAZE_ROWS = 17;
export const BRAID = 0.6;         // share of dead ends knocked open into loops (0 = perfect maze)

export const RAT_RADIUS = 0.3;
export const RAT_SPEED = 4.2;     // units per second

export const CHEESE_REACH = TILE * 0.45; // how close a rat gets to take a piece (covers the corridor width)
export const CHEESE_HEIGHT = 0.95;       // how high the cheese floats

export const TICK_RATE = 60;      // simulation steps per second

export const FOV = 65;            // vertical degrees; narrower feels more closed in
export const MOUSE_SENSITIVITY = 0.0022;
export const STRAFE_TILT = 2.5;   // degrees the view leans when moving sideways (A / D)

export const FOG_COLOR = 0x070605;
export const FOG_NEAR = 1;
export const FOG_FAR = TILE * 6;
