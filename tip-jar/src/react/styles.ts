// The widget's default look: Allways Access (warm off-white, Allways blue, Inter + DM Mono).
// <TipJar> injects it once, prepended to <head>, and every theme rule sits inside :where(), so
// any stylesheet on the site overrides it without fighting specificity:
//   .tipjar { --tipjar-accent: #6d28d9; --tipjar-radius: 4px; }
//   .tipjar__button { text-transform: uppercase; }
// Pass `unstyled` to drop all of it. The build also writes this string to dist/react/tip-jar.css
// (exported as "./styles.css").

export const STYLE_ELEMENT_ID = "allways-tip-jar-styles";

const LIGHT = `
  --tipjar-bg: #ffffff;
  --tipjar-fg: #1f1e1a;
  --tipjar-muted: rgba(31, 30, 26, 0.6);
  --tipjar-subtle: #f5f4ee;
  --tipjar-border: #e7e4db;
  --tipjar-accent: #0052ff;
  --tipjar-accent-fg: #ffffff;
  --tipjar-error: #c4321f;
  --tipjar-backdrop: rgba(31, 30, 26, 0.45);
  --tipjar-shadow: 0 4px 12px rgba(31, 30, 26, 0.08), 0 12px 40px rgba(31, 30, 26, 0.1);`;

const DARK = `
  --tipjar-bg: #2b2a25;
  --tipjar-fg: #ffffff;
  --tipjar-muted: rgba(255, 255, 255, 0.6);
  --tipjar-subtle: #31302a;
  --tipjar-border: rgba(255, 255, 255, 0.12);
  --tipjar-accent: #7a9bff;
  --tipjar-accent-fg: #1f1e1a;
  --tipjar-error: #ff8a75;
  --tipjar-backdrop: rgba(0, 0, 0, 0.6);
  --tipjar-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 12px 40px rgba(0, 0, 0, 0.4);`;

export const css = `:where(.tipjar) {${LIGHT}
  --tipjar-radius: 16px;
  --tipjar-radius-control: 10px;
  --tipjar-font: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --tipjar-mono: "DM Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
:where(.tipjar[data-theme="dark"]) {${DARK}
}
@media (prefers-color-scheme: dark) {
  :where(.tipjar[data-theme="auto"]) {${DARK}
  }
}
:where(.tipjar) {
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 0;
  border-radius: var(--tipjar-radius);
  background: var(--tipjar-bg);
  color: var(--tipjar-fg);
  font-family: var(--tipjar-font);
  font-size: 15px;
  line-height: 1.45;
  box-shadow: var(--tipjar-shadow);
  /* The dialog renders wherever the site mounts it (a centred footer, a bold nav), so don't let
     inherited text styles leak in. */
  text-align: start;
  font-weight: 400;
  font-style: normal;
  letter-spacing: normal;
  text-transform: none;
  white-space: normal;
}
:where(.tipjar)::backdrop { background: var(--tipjar-backdrop); }
:where(.tipjar *, .tipjar *::before, .tipjar *::after) { box-sizing: border-box; }
:where(.tipjar__panel) { display: flex; flex-direction: column; gap: 20px; padding: 24px; }
:where(.tipjar__header) { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
:where(.tipjar__title) { margin: 0; font-size: 1.3rem; font-weight: 600; letter-spacing: -0.02em; }
:where(.tipjar__close) {
  border: 0;
  border-radius: var(--tipjar-radius-control);
  background: none;
  color: var(--tipjar-muted);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 2px 8px;
}
:where(.tipjar__close:hover) { background: var(--tipjar-subtle); color: var(--tipjar-fg); }
:where(.tipjar__field) { display: flex; flex-direction: column; gap: 6px; }
:where(.tipjar__label) { font-size: 0.8rem; font-weight: 500; color: var(--tipjar-muted); }
:where(.tipjar__input) {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--tipjar-border);
  border-radius: var(--tipjar-radius-control);
  background: var(--tipjar-bg);
  color: var(--tipjar-fg);
  font: inherit;
}
:where(.tipjar__input:focus-within) { outline: 2px solid var(--tipjar-accent); outline-offset: -1px; border-color: transparent; }
:where(.tipjar__input-row) { display: flex; align-items: center; gap: 8px; }
:where(.tipjar__input-row[aria-invalid="true"]) { border-color: var(--tipjar-error); }
:where(.tipjar__bare) { flex: 1; min-width: 0; border: 0; outline: 0; padding: 0; background: transparent; color: inherit; font: inherit; }
:where(.tipjar__suffix, .tipjar__muted) { color: var(--tipjar-muted); }
:where(.tipjar__mono) { font-family: var(--tipjar-mono); font-size: 0.92em; }
:where(.tipjar__hint) { margin: 0; font-size: 0.8rem; color: var(--tipjar-muted); }
:where(.tipjar__hint--error) { color: var(--tipjar-error); }
:where(.tipjar__text) { margin: 0; }
:where(.tipjar__alert) {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--tipjar-radius-control);
  border: 1px solid var(--tipjar-error);
  color: var(--tipjar-error);
  font-size: 0.9rem;
}
:where(.tipjar__button) {
  padding: 11px 16px;
  min-height: 44px;
  border: 0;
  border-radius: var(--tipjar-radius-control);
  background: var(--tipjar-accent);
  color: var(--tipjar-accent-fg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: filter 120ms ease;
}
:where(.tipjar__button:hover:not(:disabled)) { filter: brightness(1.08); }
:where(.tipjar__button:disabled) { opacity: 0.4; cursor: not-allowed; }
:where(.tipjar__link-button) {
  align-self: flex-start;
  border: 0;
  padding: 4px 0;
  background: none;
  color: var(--tipjar-accent);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
:where(.tipjar__link-button:hover) { text-decoration: underline; }
:where(.tipjar__stack) { display: flex; flex-direction: column; gap: 12px; }
:where(.tipjar__row) { display: flex; align-items: center; gap: 12px; }
:where(.tipjar__center) { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 0; }
:where(.tipjar__center .tipjar__link-button) { align-self: center; }
:where(.tipjar__qr) {
  align-self: center;
  padding: 12px;
  border-radius: var(--tipjar-radius-control);
  background: #ffffff; /* QR codes scan best dark-on-light, whatever the theme */
  box-shadow: 0 0 0 1px var(--tipjar-border);
  line-height: 0;
}
:where(.tipjar__copyable) {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border-radius: var(--tipjar-radius-control);
  background: var(--tipjar-subtle);
}
:where(.tipjar__value) { flex: 1; word-break: break-all; }
:where(.tipjar__copy) {
  border: 0;
  border-radius: 6px;
  padding: 4px 8px;
  background: none;
  color: var(--tipjar-accent);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
:where(.tipjar__copy:hover) { background: var(--tipjar-bg); }
:where(.tipjar__footer) { margin: 0; text-align: center; font-size: 0.75rem; color: var(--tipjar-muted); }
:where(.tipjar__footer a) { color: inherit; }
:where(.tipjar__captcha:empty) { display: none; }
:where(.tipjar__spinner) {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: tipjar-spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes tipjar-spin { to { transform: rotate(360deg); } }
`;

// Adds the styles to `doc` once. A strict CSP needs `nonce` (or pass `unstyled` to <TipJar> and
// load "@venturalabs.ai/allways-tip-jar/styles.css" as a stylesheet instead).
export function ensureStyles(doc: Document, nonce?: string): void {
  if (doc.getElementById(STYLE_ELEMENT_ID)) return;
  const el = doc.createElement("style");
  el.id = STYLE_ELEMENT_ID;
  if (nonce) el.nonce = nonce;
  el.textContent = css;
  doc.head.prepend(el);
}
