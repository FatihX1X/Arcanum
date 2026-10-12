// Render review stills from one bundle: node scripts/stills.mjs <comp> <frame,frame,...>
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';

const [comp = 'ArcanumPromo', frames = '0'] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const inputProps = { withAudio: false };
const composition = await selectComposition({ serveUrl, id: comp, inputProps, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE });
for (const f of frames.split(',').map(Number)) {
  const output = `out/stills/${comp}-${String(f).padStart(4, '0')}.jpg`;
  await renderStill({ serveUrl, composition, frame: f, output, inputProps, imageFormat: 'jpeg', jpegQuality: 80, scale: 0.5, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE });
  console.log(output);
}
