# Arcanum promo film

A 63-second, 1920×1080 / 30 fps promo for Arcanum, built entirely in code with
[Remotion](https://www.remotion.dev/). Every animation, transition and the
soundtrack are generated from source; the only raster assets are the Arcanum
coin and real screenshots of https://www.arcanumchat.xyz.

## Run

```bash
cd promo
npm install
npm run studio      # live preview + timeline scrubbing (generates the soundtrack first)
npm run render      # → out/arcanum-promo.mp4
```

If Remotion cannot download its own Chrome Headless Shell, point it at a local
one: `REMOTION_BROWSER_EXECUTABLE=/path/to/headless_shell npm run render`.

`npm run stills -- ArcanumPromo 120,600,1830` renders half-size review frames
into `out/stills/` from a single bundle.

## Structure

| Path | What it is |
| --- | --- |
| `src/timeline.json` | Scene boundaries (frames). The film **and** the soundtrack read it, so retiming a scene keeps the audio in sync. |
| `src/copy.ts` | All on-screen text. |
| `src/theme.ts` | Colour tokens mirrored from `app/globals.css` (pixel theme), fonts, easings. |
| `src/scenes/` | `Intro` (coin assembles from its pixels) → `Hook` (plaintext → ciphertext) → `Pipeline` (wallet → browser → Arc → recipient) → `AppReveal` (3D camera over the real DM screen, typed message, send) → `Features` (6 animated feature slides over real screens) → `Mainnet` (live contracts + SDK terminal) → `Outro`. |
| `src/components/` | Reusable motion pieces: scramble/morph text, pixel wipe transition, pixel coin, app-style panels, feature visuals. |
| `scripts/generate-soundtrack.mjs` | Dependency-free synth: pad, sub, drums, 8-bit arpeggio, whooshes and UI sounds, all locked to the timeline. Writes `public/soundtrack.wav`. |
| `public/shots/` | Screenshots of the live app (captured at 2× from a 1600×900 viewport). |

Fonts: Pixelify Sans (the app's display font), Inter and JetBrains Mono, all
under the SIL Open Font License and bundled in `public/fonts/`.
