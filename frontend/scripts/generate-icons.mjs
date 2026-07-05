/**
 * Generates PNG PWA icons from SVG sources.
 * Chrome on Android requires PNG — it ignores SVG in the manifest.
 * Run: node scripts/generate-icons.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const icons = [
  { file: 'icon-192.png', svg: 'icon-192.svg', size: 192 },
  { file: 'icon-512.png', svg: 'icon-512.svg', size: 512 },
];

console.log('Generating PWA icons...');

for (const { file, svg, size } of icons) {
  const svgPath = join(publicDir, svg);
  const svgData = readFileSync(svgPath, 'utf-8');

  const resvg = new Resvg(svgData, {
    fitTo: { mode: 'width', value: size },
  });

  const pngData = resvg.render();
  const outPath = join(publicDir, file);
  writeFileSync(outPath, pngData.asPng());
  console.log(`  ✓ ${file} (${pngData.asPng().length} bytes)`);
}

console.log('Done!');
