// Line icons, same style as the bottom menu (app-shell.js): 24 grid, 1.8 stroke, current text colour.
// Used instead of symbol characters: iPhones draw ☂ ☁ ⚠ as colour emoji, which clashed with the
// white line icons (owner's report, 26 Oct 2026). Size follows the surrounding font size (1em).
export const UI_ICONS={
 satellite:'<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="m4 15 5-5 4 4 3-3 4 4"/>',
 grid:'<path d="M4 9h16M4 15h16M9 4v16M15 4v16"/>',
 radar:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="m12 12 5.5-5.5"/>',
 coverage:'<rect x="4" y="4" width="16" height="16" rx="2.5" stroke-dasharray="3.2 2.4"/>',
 station:'<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/>',
 river:'<path d="M3 8c3 0 3 2 6 2s3-2 6-2 3 2 6 2M3 15c3 0 3 2 6 2s3-2 6-2 3 2 6 2"/>',
 rain:'<path d="M7 14.5h10a3.8 3.8 0 0 0 .4-7.6A5.6 5.6 0 0 0 6.6 6 4.3 4.3 0 0 0 7 14.5z"/><path d="m9 17.5-1 2.5M13 17.5l-1 2.5M17 17.5l-1 2.5"/>',
 cloud:'<path d="M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 9 4.5 4.5 0 0 0 7 18z"/>',
 sum:'<path d="M17 5H7l5 7-5 7h10"/>',
 terrain:'<path d="m3 19 6-11 4 6 3-4 5 9H3z"/>',
 elevation:'<path d="M4 20h16M7 20v-5M12 20V8M17 20v-9"/>',
 alert:'<path d="M12 4 2.8 19.5h18.4L12 4z"/><path d="M12 10v4.5M12 17v.4"/>',
 pond:'<path d="M4 10c2.5-2 5.5-2 8 0s5.5 2 8 0M4 16c2.5-2 5.5-2 8 0s5.5 2 8 0"/>',
 temp:'<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>',
 up:'<path d="M12 19V5M6 11l6-6 6 6"/>',down:'<path d="M12 5v14M6 13l6 6 6-6"/>',flat:'<path d="M5 12h14"/>',
 chart:'<path d="M4 19h16"/><path d="m7 15 4-5 3 3 5-7"/>',
 info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.4"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
 pointer:'<path d="M15 5 8 12l7 7"/>',
 storm:'<circle cx="12" cy="12" r="2.6"/><path d="M4.5 9.5A8 8 0 0 1 18 6M19.5 14.5A8 8 0 0 1 6 18M12 4.5c-3 0-5 1.5-6 3.5M12 19.5c3 0 5-1.5 6-3.5"/>'
};
export const uiIcon=name=>`<svg class="ui-icon" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICONS[name]}</svg>`;
// Same icon as a DOM node (for code that builds elements).
export function uiIconNode(name){const t=document.createElement('template');t.innerHTML=uiIcon(name);return t.content.firstChild}
