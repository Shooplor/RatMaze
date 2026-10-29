// Packs the built game into one self-contained HTML file for a Claude artifact.
// Run through `npm run build:artifact`, which first builds with `vite build --mode artifact`
// (textures already inlined as data). This script inlines the CSS and JS and leaves out
// <html>, <head> and <body>, which the artifact host adds itself.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = 'dist-artifact';
const out = `${dir}/rats-maze.html`;

const html = readFileSync(`${dir}/index.html`, 'utf8');
const assets = readdirSync(`${dir}/assets`);
const read = (ext) => {
  const files = assets.filter((f) => f.endsWith(ext));
  if (files.length !== 1) throw new Error(`expected one ${ext} file in ${dir}/assets, found ${files.length}`);
  return readFileSync(`${dir}/assets/${files[0]}`, 'utf8');
};

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const body = html
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script\b[^>]*src=[^>]*><\/script>/g, '')
  .trim();
// "</script" inside the code would end the inline script early; "<\/script" means the same in JS.
const js = read('.js').replaceAll('</script', '<\\/script');
const css = read('.css');

writeFileSync(out, `${title}\n<style>\n${css}\n</style>\n${body}\n<script type="module">\n${js}\n</script>\n`);
console.log(`wrote ${out} (${(Buffer.byteLength(readFileSync(out)) / 1024).toFixed(0)} kB)`);
