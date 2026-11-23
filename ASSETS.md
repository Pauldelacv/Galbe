# Bundled assets

Galbe only ships assets that are **public domain (CC0)** or under a **free licence that
allows redistribution** inside an MIT-licensed application. Every bundled file is listed
here with its source and licence. Nothing in this repository comes from a commercial 3D
tool, its templates or its presets.

To refresh or extend the set, edit and run `packages/assets/scripts/fetch-assets.mjs`
(then `hdri-previews.mjs`), and update this file in the same pull request.

## Fonts — SIL Open Font License 1.1

Static TrueType subsets (Latin and Latin Extended) of Google Fonts families, downloaded
from Fontsource's CDN. Each family's licence is stored next to its files
(`packages/assets/files/fonts/<family>/OFL.txt`). The OFL allows bundling and
redistributing the fonts with software; the fonts themselves must not be sold on their
own, and Reserved Font Names must not be used for modified versions.

| Family              | Weights         | Subsets           | Licence                                                            | Source                                                                                                                                   |
| ------------------- | --------------- | ----------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Inter               | 400, 700, 900   | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/inter/OFL.txt)               | [Google Fonts](https://fonts.google.com/specimen/Inter) via [Fontsource](https://fontsource.org/fonts/inter)                             |
| Space Grotesk       | 500, 700        | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/space-grotesk/OFL.txt)       | [Google Fonts](https://fonts.google.com/specimen/Space+Grotesk) via [Fontsource](https://fontsource.org/fonts/space-grotesk)             |
| Archivo Black       | 400             | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/archivo-black/OFL.txt)       | [Google Fonts](https://fonts.google.com/specimen/Archivo+Black) via [Fontsource](https://fontsource.org/fonts/archivo-black)             |
| Bricolage Grotesque | 800             | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/bricolage-grotesque/OFL.txt) | [Google Fonts](https://fonts.google.com/specimen/Bricolage+Grotesque) via [Fontsource](https://fontsource.org/fonts/bricolage-grotesque) |
| Syne                | 800             | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/syne/OFL.txt)                | [Google Fonts](https://fonts.google.com/specimen/Syne) via [Fontsource](https://fontsource.org/fonts/syne)                               |
| Unbounded           | 700, 900        | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/unbounded/OFL.txt)           | [Google Fonts](https://fonts.google.com/specimen/Unbounded) via [Fontsource](https://fontsource.org/fonts/unbounded)                     |
| Bebas Neue          | 400             | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/bebas-neue/OFL.txt)          | [Google Fonts](https://fonts.google.com/specimen/Bebas+Neue) via [Fontsource](https://fontsource.org/fonts/bebas-neue)                   |
| Anton               | 400             | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/anton/OFL.txt)               | [Google Fonts](https://fonts.google.com/specimen/Anton) via [Fontsource](https://fontsource.org/fonts/anton)                             |
| DM Serif Display    | 400, 400 italic | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/dm-serif-display/OFL.txt)    | [Google Fonts](https://fonts.google.com/specimen/DM+Serif+Display) via [Fontsource](https://fontsource.org/fonts/dm-serif-display)       |
| Playfair Display    | 700, 900 italic | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/playfair-display/OFL.txt)    | [Google Fonts](https://fonts.google.com/specimen/Playfair+Display) via [Fontsource](https://fontsource.org/fonts/playfair-display)       |
| Fraunces            | 700, 900 italic | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/fraunces/OFL.txt)            | [Google Fonts](https://fonts.google.com/specimen/Fraunces) via [Fontsource](https://fontsource.org/fonts/fraunces)                       |
| Instrument Serif    | 400, 400 italic | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/instrument-serif/OFL.txt)    | [Google Fonts](https://fonts.google.com/specimen/Instrument+Serif) via [Fontsource](https://fontsource.org/fonts/instrument-serif)       |
| JetBrains Mono      | 700             | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/jetbrains-mono/OFL.txt)      | [Google Fonts](https://fonts.google.com/specimen/JetBrains+Mono) via [Fontsource](https://fontsource.org/fonts/jetbrains-mono)           |
| Pacifico            | 400             | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/pacifico/OFL.txt)            | [Google Fonts](https://fonts.google.com/specimen/Pacifico) via [Fontsource](https://fontsource.org/fonts/pacifico)                       |
| Lilita One          | 400             | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/lilita-one/OFL.txt)          | [Google Fonts](https://fonts.google.com/specimen/Lilita+One) via [Fontsource](https://fontsource.org/fonts/lilita-one)                   |
| Rubik Mono One      | 400             | Latin, Latin Ext. | [OFL-1.1](packages/assets/files/fonts/rubik-mono-one/OFL.txt)      | [Google Fonts](https://fonts.google.com/specimen/Rubik+Mono+One) via [Fontsource](https://fontsource.org/fonts/rubik-mono-one)           |

Fonts picked from the **Google Fonts catalogue** inside the studio are downloaded on demand
from Fontsource's CDN (same licence) and stored in the user's project, not in this repository.

## HDRIs — CC0 1.0 (public domain)

1K equirectangular Radiance (`.hdr`) files from [Poly Haven](https://polyhaven.com),
released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The display
names below are Galbe's; the original titles and authors are credited. The 256×128 PNG
previews (`*.preview.png`) are derived from these files by `hdri-previews.mjs` and are
CC0 as well.

| Name in Galbe   | File                            | Original (author)                                                                                                                | Licence |
| --------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Softbox studio  | `hdri/studio-small-09.hdr`      | [Studio Small 09](https://polyhaven.com/a/studio_small_09) — Sergej Majboroda                                                    | CC0-1.0 |
| Warm studio     | `hdri/brown-photostudio-02.hdr` | [Brown Photostudio 02](https://polyhaven.com/a/brown_photostudio_02) — Sergej Majboroda                                          | CC0-1.0 |
| Contrast studio | `hdri/studio-small-03.hdr`      | [Studio Small 03](https://polyhaven.com/a/studio_small_03) — Greg Zaal                                                           | CC0-1.0 |
| Neon studio     | `hdri/neon-photostudio.hdr`     | [Neon Photostudio](https://polyhaven.com/a/neon_photostudio) — Sergej Majboroda                                                  | CC0-1.0 |
| Sunset          | `hdri/venice-sunset.hdr`        | [Venice Sunset](https://polyhaven.com/a/venice_sunset) — Greg Zaal                                                               | CC0-1.0 |
| Open sky        | `hdri/kloofendal-sky.hdr`       | [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) — Greg Zaal, Jarod Guest | CC0-1.0 |
| City night      | `hdri/shanghai-bund.hdr`        | [Shanghai Bund](https://polyhaven.com/a/shanghai_bund) — Greg Zaal                                                               | CC0-1.0 |

## Code-generated content

Material presets, frame presets and the starter scene are original data written for
Galbe (`packages/core/src/presets`) and are covered by the project's MIT licence.

## Third-party libraries

Runtime libraries (three.js, React, React Three Fiber, drei, postprocessing, Zustand,
Zod, opentype.js, fflate, idb, lucide icons…) are installed from npm under their own
permissive licences (MIT, ISC, Apache-2.0); see each package's `LICENSE` in
`node_modules` or on npm.
