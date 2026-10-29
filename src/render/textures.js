import * as THREE from 'three';

// Every texture is a PNG in src/assets/textures/. Replacing a file with a drawing of the
// same name is all it takes to put new art in the game.
const files = import.meta.glob('../assets/textures/*.png', { eager: true, import: 'default' });

const loader = new THREE.TextureLoader();
const cache = new Map();
let crisp = false;
let anisotropy = 1;

/** One shared texture per file; surfaces that repeat it scale their own UVs. */
export function loadTexture(name) {
  if (cache.has(name)) return cache.get(name);

  const url = files[`../assets/textures/${name}`];
  if (!url) console.warn(`Missing texture: src/assets/textures/${name}`);
  const texture = url ? loader.load(url) : new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  applyFiltering(texture);
  cache.set(name, texture);
  return texture;
}

export function setMaxAnisotropy(value) {
  anisotropy = value;
  cache.forEach(applyFiltering);
}

/** Crisp = hard-edged texture pixels up close, the retro look. Off = smooth. */
export function setCrispTextures(on) {
  crisp = on;
  cache.forEach(applyFiltering);
}

function applyFiltering(texture) {
  texture.magFilter = crisp ? THREE.NearestFilter : THREE.LinearFilter;
  texture.minFilter = crisp ? THREE.NearestMipmapLinearFilter : THREE.LinearMipmapLinearFilter;
  texture.anisotropy = anisotropy;
  if (texture.image) texture.needsUpdate = true; // not yet loaded: the loader uploads it later
}
