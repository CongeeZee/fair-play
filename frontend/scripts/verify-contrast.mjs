// Reads the palettes straight out of theme.ts rather than restating hexes, so
// this cannot drift the way the earlier audit scripts did.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL("../src/theme.ts", import.meta.url), "utf8")
function palette(name) {
  const i = src.indexOf(`${name}: {`)
  const body = src.slice(i, src.indexOf('\n  },', i))
  const out = {}
  for (const m of body.matchAll(/^\s{4}(\w+): '(#[0-9a-fA-F]{6})',/gm)) out[m[1]] = m[2]
  return out
}
const P = { light: palette('light'), dark: palette('dark') }

const sr = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = (h) => { const n = h.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)); return 0.2126 * sr(r) + 0.7152 * sr(g) + 0.0722 * sr(b) }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const over = (fg, a, bg) => '#' + [0, 2, 4].map((i) =>
  Math.round(parseInt(fg.replace('#', '').slice(i, i + 2), 16) * a +
             parseInt(bg.replace('#', '').slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('')

// [label, fg, bg, minimum]. 4.5 = body text, 3 = large text and non-text (1.4.11).
const cases = (p) => [
  // Text on the two light surfaces.
  ['ink on surface', p.ink, p.surface, 4.5],
  ['inkSoft on surface', p.inkSoft, p.surface, 4.5],
  ['inkSoft on base', p.inkSoft, p.base, 4.5],
  ['inkSoft on sunken', p.inkSoft, p.sunken, 4.5],
  ['greenText on surface', p.greenText, p.surface, 4.5],
  ['goldText on surface', p.goldText, p.surface, 4.5],
  ['errorText on surface', p.errorText, p.surface, 4.5],
  ['infoText on surface', p.infoText, p.surface, 4.5],
  ['successText on surface', p.successText, p.surface, 4.5],
  ['warningText on surface', p.warningText, p.surface, 4.5],
  // Gold as a meaningful graphic, not text: 1.4.11 wants 3:1.
  ['goldGraphic on surface (1.4.11)', p.goldGraphic, p.surface, 3],
  ['goldGraphic on base (1.4.11)', p.goldGraphic, p.base, 3],
  ['goldGraphic on sunken (1.4.11)', p.goldGraphic, p.sunken, 3],
  // Chip and badge fills, each with the foreground it actually ships with.
  ['onGold on gold fill', p.onGold, p.gold, 4.5],
  ['white on green fill', '#ffffff', p.green, 4.5],
  ['white on greenDark fill', '#ffffff', p.greenDark, 4.5],
  ['white on clayBlue fill', '#ffffff', p.clayBlue, 4.5],
  ['white on redDeep fill', '#ffffff', p.redDeep, 4.5],
  ['white on slate fill', '#ffffff', p.slate, 4.5],
  ['white on greenMid fill', '#ffffff', p.greenMid, 4.5],
  // Everything that sits on a green surface. Since both green gradients now
  // run green -> greenDark, `green` is the worst case for all of them.
  ['goldOnGreen on green', p.goldOnGreen, p.green, 4.5],
  ['onGreenSoft on green', p.onGreenSoft, p.green, 4.5],
  ['86% white on green', over('#ffffff', 0.86, p.green), p.green, 4.5],
  ['88% white on green', over('#ffffff', 0.88, p.green), p.green, 4.5],
  ['60% white border on green (1.4.11)', over('#ffffff', 0.6, p.green), p.green, 3],
  ['greenDark on onGreenSoft chip', p.greenDark, p.onGreenSoft, 4.5],
  ['gold brand mark on green (1.4.11)', p.gold, p.green, 3],
  // Alert banners: each standard severity paints `alert*` under `*Text`.
  ['successText on alertSuccess', p.successText, p.alertSuccess, 4.5],
  ['errorText on alertError', p.errorText, p.alertError, 4.5],
  ['warningText on alertWarning', p.warningText, p.alertWarning, 4.5],
  ['infoText on alertInfo', p.infoText, p.alertInfo, 4.5],
  // MUI paints the status `main` values as fills too, with `onStatus` on top.
  ['onStatus on successText fill', p.onStatus, p.successText, 4.5],
  ['onStatus on errorText fill', p.onStatus, p.errorText, 4.5],
  ['onStatus on warningText fill', p.onStatus, p.warningText, 4.5],
  ['onStatus on infoText fill', p.onStatus, p.infoText, 4.5],
  // Body text on the raised card and the page itself.
  ['ink on base', p.ink, p.base, 4.5],
  ['ink on sunken', p.ink, p.sunken, 4.5],
  // Dividers and borders are non-text structure: 1.4.11 wants 3:1.
  ['divider on surface (1.4.11)', p.divider, p.surface, 3],
  ['divider on base (1.4.11)', p.divider, p.base, 3],
  ['borderC on surface (1.4.11)', p.borderC, p.surface, 3],
]

let fails = 0
for (const mode of ['light', 'dark']) {
  console.log(`\n--- ${mode} ---`)
  for (const [label, fg, bg, min] of cases(P[mode])) {
    const r = ratio(fg, bg)
    const ok = r >= min
    if (!ok) fails++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(36)} ${r.toFixed(2)}:1  (needs ${min})  ${fg} on ${bg}`)
  }
}
console.log(`\n${fails} failing pairings`)
