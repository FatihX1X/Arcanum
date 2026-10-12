import { continueRender, delayRender, staticFile } from 'remotion';

const latin = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

const faces: { family: string; file: string; weight: string; range?: string }[] = [
  { family: 'Pixelify Sans', file: 'fonts/PixelifySans.ttf', weight: '400 700' },
  { family: 'Inter', file: 'fonts/inter-latin-wght-normal.woff2', weight: '100 900', range: latin },
  { family: 'JetBrains Mono', file: 'fonts/jetbrains-mono-latin-400-normal.woff2', weight: '400', range: latin },
];

if (typeof document !== 'undefined') {
  const handle = delayRender('Loading Arcanum fonts');
  Promise.all(
    faces.map(async ({ family, file, weight, range }) => {
      const face = new FontFace(family, `url(${staticFile(file)})`, {
        weight,
        ...(range ? { unicodeRange: range } : {}),
      });
      document.fonts.add(await face.load());
    }),
  )
    .then(() => continueRender(handle))
    .catch((error) => {
      console.error(error);
      continueRender(handle);
    });
}
