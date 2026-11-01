import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads a .glb model. In the single-file build every model is carried inside the page as
 * text (a data: URL), and some hosts, the claude.ai viewer among them, don't let a page
 * fetch even that. So data: URLs are decoded here and the bytes handed straight to the
 * loader; normal URLs (the dev server) are loaded as usual.
 */
export function loadModel(url, onLoad, onError) {
  const loader = new GLTFLoader();
  if (url.startsWith('data:')) {
    try {
      const text = atob(url.slice(url.indexOf(',') + 1));
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      loader.parse(bytes.buffer, '', onLoad, onError);
    } catch (error) {
      onError(error);
    }
  } else {
    loader.load(url, onLoad, undefined, onError);
  }
}
