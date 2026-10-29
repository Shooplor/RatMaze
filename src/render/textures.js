import * as THREE from 'three';

// Every texture is a file in public/textures/. Replacing a file with a drawing of the
// same name is all it takes to put new art in the game.

const loader = new THREE.TextureLoader();
const loaded = [];
let crisp = false;
let anisotropy = 1;

export function loadTexture(name, { repeatX = 1, repeatY = 1 } = {}) {
  const url = `${import.meta.env.BASE_URL}textures/${name}`;
  const texture = loader.load(url, undefined, undefined, () => console.warn(`Missing texture: ${url}`));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  applyFiltering(texture);
  loaded.push(texture);
  return texture;
}

export function setMaxAnisotropy(value) {
  anisotropy = value;
  loaded.forEach(applyFiltering);
}

/** Crisp = hard-edged texture pixels up close, the retro look. Off = smooth. */
export function setCrispTextures(on) {
  crisp = on;
  loaded.forEach(applyFiltering);
}

function applyFiltering(texture) {
  texture.magFilter = crisp ? THREE.NearestFilter : THREE.LinearFilter;
  texture.minFilter = crisp ? THREE.NearestMipmapLinearFilter : THREE.LinearMipmapLinearFilter;
  texture.anisotropy = anisotropy;
  if (texture.image) texture.needsUpdate = true; // not yet loaded: the loader uploads it later
}
