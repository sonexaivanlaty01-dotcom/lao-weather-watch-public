// Site logo (owner's choice 28 Oct 2026: "cloud + rain", option 1): light-blue cloud with three white
// rain strokes on navy. Used on the picture cards and province pages. The same drawing lives in
// dist/app-shell.js (header, 24-unit copy), dist/index.html (favicon) and make-icons.mjs (app icons).
export const BRAND_NAVY='#102e53',BRAND_SKY='#75c8ff';
export const LOGO_GLYPH=`<path d="M19 36a9 9 0 0 1-1.5-17.9A13 13 0 0 1 42.6 15.6 10 10 0 0 1 45.5 36z" fill="${BRAND_SKY}"/><path d="M24 43l-2.5 6M32 43l-2.5 6M40 43l-2.5 6" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`;
// Favicon links for every real page (files written by make-icons.mjs, 30 Oct 2026).
export const FAVICON_LINKS='<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml">';
// Rounded navy tile with the glyph; size in px (or '100%').
// Inline size style so page rules such as `.hero svg{position:absolute;width:100%}` cannot stretch it.
export const logoSVG=(size='100%',rx=14)=>`<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" style="position:static;display:block;width:${typeof size==='number'?size+'px':size};height:${typeof size==='number'?size+'px':size}"><rect width="64" height="64" rx="${rx}" fill="${BRAND_NAVY}"/>${LOGO_GLYPH}</svg>`;
