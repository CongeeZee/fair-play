import { createTheme } from '@mui/material/styles'
import type { Shadows, Theme } from '@mui/material/styles'

/* ------------------------------------------------------------------ *
 * Fairplay theming
 *
 * Two independent axes:
 *
 *   appearance  'clay'     — the default. Soft claymorphic surfaces, depth
 *                            carried by two-tone shadows.
 *               'sunlight' — high-contrast light mode for playing outdoors.
 *                            Depth is carried by BORDERS, because shadows are
 *                            the first thing to disappear under glare.
 *
 *   density     'comfortable' — the default.
 *               'course'      — applied automatically on the three screens
 *                               used while actually playing. Bigger touch
 *                               targets, bigger numerals, visible borders on
 *                               anything tappable.
 *
 * ---- Why CSS custom properties rather than plain JS objects ----
 *
 * About ten files import `CLAY`, `raised`, `pressed` and `tint` directly and
 * use them inside `sx`. If those were static JS values, switching appearance
 * would restyle everything driven by the MUI theme and silently leave those
 * call sites on clay colours — the exact "half-converted" result this work is
 * meant to avoid. Emitting `var(--c-*)` instead means the switch is a single
 * data attribute on <html>, every existing call site follows it for free, and
 * there is no re-render cost.
 * ------------------------------------------------------------------ */

export type Appearance = 'clay' | 'sunlight'
export type Density = 'comfortable' | 'course'

/**
 * Raw palette values per appearance.
 *
 * Every text colour here was solved against the lightest background it can
 * land on, not picked by eye: clay targets WCAG AA (4.5:1) and sunlight targets
 * AAA (7:1). The sunlight target is higher because bright ambient light adds a
 * roughly constant reflected luminance to the screen, which compresses the
 * effective ratio — designing to 7:1 indoors is what leaves usable margin
 * outdoors.
 *
 * The fill/text split matters: the previous palette used one hex for both a
 * filled chip (with white text on it) and coloured text on a light card. Those
 * are opposite requirements and no single value satisfies both, which is why
 * two thirds of the old pairs failed. `green` is a fill, `greenText` is text.
 */
const PALETTES: Record<Appearance, Record<string, string>> = {
  clay: {
    base: '#e9e1d3',
    surface: '#faf6ee',
    sunken: '#e4dbcb',
    surfaceHi: '#fffdf8',
    focus: '#efe8da',

    shade: 'rgba(158, 141, 111, 0.52)',
    shadeSoft: 'rgba(158, 141, 111, 0.3)',
    light: 'rgba(255, 255, 255, 0.92)',
    /** Multiplier on every clay shadow. 1 = full clay. */
    depth: '1',
    /** Border width used by interactive surfaces. Zero in clay: shadow is the cue. */
    borderW: '0px',
    borderC: 'transparent',

    ink: '#2b3a30',
    inkSoft: '#57645b',

    green: '#2f6b4c',
    greenMid: '#468262',
    greenDark: '#1f4a34',
    greenText: '#396b50',

    gold: '#e0b95c',
    goldLight: '#f2d492',
    goldText: '#765e23',
    onGold: '#3a2f12',
    // Gold *on the green bar or a green banner*. Neither `gold` (3.38:1) nor
    // `goldLight` (4.39:1) clears 4.5:1 against #2f6b4c, so on-green gold needs
    // its own step. This is 4.70:1 and still unmistakably gold rather than cream.
    goldOnGreen: '#f5dca4',
    // Secondary text on a green banner. The old #c1d3c9 measured 4.03:1.
    onGreenSoft: '#e4ede8',
    // Gold as a *meaningful graphic* on a light surface — a filled star, a
    // progress bar, a chart series. WCAG 1.4.11 wants 3:1 for these and `gold`
    // manages 1.73:1 on cream, so a filled star was barely distinguishable
    // from an empty one. `goldText` (#765e23) would clear it easily but reads
    // as brown; this is the shallowest darkening that still passes on all
    // three light surfaces while staying recognisably gold — 4.03:1 on the
    // card, 3.34:1 on the page base, 3.16:1 in a sunken well. The first
    // attempt (#9c7a1c) was measured against the card and the base only and
    // came out at 2.93:1 in a well, which is where the stat tiles live.
    goldGraphic: '#95751a',

    // Darkened from #547a99, which carried white text at 4.54:1 — passing, but
    // with about 1% of headroom. Anti-aliasing and any future nudge to the
    // value would drop it under. 5.07:1 leaves room.
    clayBlue: '#4e7291',
    infoText: '#44647f',
    red: '#b0574c',
    redDeep: '#a1453c',
    errorText: '#a73e32',
    successText: '#366b4b',
    warningText: '#845815',
    slate: '#5c5470',

    divider: 'rgba(158, 141, 111, 0.22)',
    scrollThumb: 'rgba(163, 148, 122, 0.45)',
    scrollThumbHi: 'rgba(163, 148, 122, 0.7)',
    skeleton: 'rgba(163, 148, 122, 0.2)',

    alertSuccess: '#dfeee4',
    alertError: '#f7e2df',
    alertWarning: '#f8ecd6',
    alertInfo: '#e0e9f1',
  },

  sunlight: {
    base: '#f2f1ec',
    surface: '#ffffff',
    sunken: '#e6e4db',
    surfaceHi: '#ffffff',
    focus: '#dfddd2',

    // Shadows are nearly switched off. A soft shadow conveys nothing once
    // reflected glare lifts the black level, so structure moves to borders.
    shade: 'rgba(0, 0, 0, 0.22)',
    shadeSoft: 'rgba(0, 0, 0, 0.12)',
    light: 'rgba(255, 255, 255, 0)',
    depth: '0.28',
    borderW: '2px',
    borderC: '#2a3129',

    ink: '#10160f',
    inkSoft: '#48534c',

    green: '#2c6347',
    greenMid: '#3e7357',
    greenDark: '#14331f',
    greenText: '#305943',

    gold: '#e0b95c',
    goldLight: '#f2d492',
    goldText: '#634e1d',
    onGold: '#1a1508',
    // Sunlight's green bar is #2c6347, marginally darker, so these clear by
    // more (5.25:1 and 5.89:1). Held identical to clay so the bar does not
    // shift hue when the mode is toggled.
    goldOnGreen: '#f5dca4',
    onGreenSoft: '#e4ede8',
    // Sunlight surfaces are lighter, so the graphic gold goes one step deeper
    // to keep the same headroom: 4.37:1 on white, 3.86:1 on the tinted base.
    goldGraphic: '#96741b',

    clayBlue: '#4a6c88',
    infoText: '#39546a',
    red: '#a35046',
    redDeep: '#8c342a',
    errorText: '#8c342a',
    successText: '#2d5a3e',
    warningText: '#6e4912',
    slate: '#5c5470',

    // Solved to clear the 3:1 non-text minimum on both surface and base;
    // the old warm hairline measured 1.8:1 here and vanished outdoors.
    divider: '#8f897c',
    scrollThumb: 'rgba(42, 49, 41, 0.45)',
    scrollThumbHi: 'rgba(42, 49, 41, 0.7)',
    skeleton: 'rgba(42, 49, 41, 0.16)',

    alertSuccess: '#dcebe1',
    alertError: '#f6ded9',
    alertWarning: '#f7e9cd',
    alertInfo: '#dde8f0',
  },
}

/** Density-dependent metrics, emitted as vars so `sx` can read them too. */
const DENSITY: Record<Density, Record<string, string>> = {
  comfortable: {
    tap: '36px',
    tapLg: '44px',
    numScale: '1',
    // Extra border applied to tappable things. Off by default; course mode
    // turns it on so touch targets have hard edges in bright light.
    tapBorderW: '0px',
    rowGap: '12px',
  },
  course: {
    // 48px is the WCAG 2.2 target-size minimum and roughly a thumb pad.
    tap: '48px',
    tapLg: '56px',
    // Scorecard numerals get materially bigger — they are read at arm's
    // length, in sun, often one-handed.
    numScale: '1.25',
    tapBorderW: '2px',
    rowGap: '8px',
  },
}

const v = (name: string) => `var(--c-${name})`

/**
 * Token accessors. These return `var(--c-*)` strings, so anything that consumes
 * them tracks the active appearance automatically.
 *
 * The name `CLAY` is kept because ~10 files already import it; renaming it
 * would be a large diff for no behavioural gain.
 */
const CLAY = {
  base: v('base'),
  surface: v('surface'),
  sunken: v('sunken'),
  shade: v('shade'),
  shadeSoft: v('shadeSoft'),
  light: v('light'),
  green: v('green'),
  greenLight: v('greenMid'),
  greenDark: v('greenDark'),
  greenText: v('greenText'),
  gold: v('gold'),
  goldLight: v('goldLight'),
  goldDark: v('goldText'),
  goldText: v('goldText'),
  onGold: v('onGold'),
  goldOnGreen: v('goldOnGreen'),
  onGreenSoft: v('onGreenSoft'),
  goldGraphic: v('goldGraphic'),
  ink: v('ink'),
  inkSoft: v('inkSoft'),
  red: v('red'),
  redDeep: v('redDeep'),
  clayBlue: v('clayBlue'),
  slate: v('slate'),
  errorText: v('errorText'),
  successText: v('successText'),
  warningText: v('warningText'),
  infoText: v('infoText'),
}

/**
 * The signature raised-clay shadow.
 *
 * Every offset is multiplied by `--c-depth`, which is 1 in clay and 0.28 in
 * sunlight. That single var is what lets the same component overrides serve
 * both appearances: in sunlight the shadows shrink to almost nothing and the
 * border vars take over as the structural cue.
 */
const scale = (n: number) => `calc(${n}px * ${v('depth')})`

const raised = (d: number) =>
  [
    `${scale(d * 1.0)} ${scale(d * 1.3)} ${scale(d * 2.6)} 0 ${v('shade')}`,
    `calc(-1 * ${scale(d * 0.8)}) calc(-1 * ${scale(d * 0.9)}) ${scale(d * 2.0)} 0 ${v('light')}`,
    `inset 0 ${scale(d * 0.7)} ${scale(d * 1.3)} 0 ${v('light')}`,
    `inset 0 calc(-1 * ${scale(d * 0.6)}) ${scale(d * 1.2)} 0 ${v('shadeSoft')}`,
  ].join(', ')

/** Inverse of `raised` — for inputs and anything that should read as carved in. */
const pressed = (d: number) =>
  [
    `inset ${scale(d * 0.7)} ${scale(d * 0.8)} ${scale(d * 1.6)} 0 ${v('shade')}`,
    `inset calc(-1 * ${scale(d * 0.5)}) calc(-1 * ${scale(d * 0.6)}) ${scale(d * 1.4)} 0 ${v('light')}`,
  ].join(', ')

/**
 * Flatten an accent tint onto the raised surface and return a solid colour.
 *
 * A translucent `rgba(accent, 0.08)` card background composites against
 * whatever is *behind* it. On the clay base (#e9e1d3, darker than the card
 * surface) that made a raised card land darker than the page and read as a
 * sunken smudge. `color-mix` does the flattening in the browser, which — unlike
 * the previous JS implementation — keeps working when the surface changes with
 * the appearance.
 *
 * @param color accent colour; a hex or a `var(--c-*)` reference
 * @param alpha strength of the tint, 0–1
 * @param base  surface to flatten onto; defaults to the raised surface
 */
const tint = (color: string, alpha: number, base: string = CLAY.surface) =>
  `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, ${base})`

/**
 * The green hero gradient used by the stats, competition and tee-time banners.
 *
 * All three had `#2f6b4c → #4a8a68` inline, and white text sits on top of the
 * whole sweep. The light end carried white at 4.10:1, so the bottom-right
 * corner of every one of those banners was below AA while the top-left was
 * comfortably above it — the kind of failure that only shows up if you measure
 * the end of a gradient rather than its start.
 *
 * The first fix pushed the end stop to #3d7a59, which carries *full* white at
 * 5.09:1. That was not enough. The banners are full of translucent white —
 * 70% for overlines, 60% and 50% for captions — and on #3d7a59 those measure
 * 3.39:1, 2.92:1 and 2.48:1. Worse, the `ON_GREEN` steps were derived against
 * #2f6b4c, so they were not valid on a lighter stop either: `onGreenSoft`
 * dropped from 5.28:1 to 4.26:1 just by moving along the sweep.
 *
 * So the gradient now travels *down* from `green` rather than up from it, and
 * the invariant is simply: no green surface in the app is ever lighter than
 * `green`. That makes `#2f6b4c` the worst case everywhere — the navbar bar,
 * the hero banners, the resume card — which is the backdrop every `ON_GREEN`
 * value was measured against in the first place. One number to check instead
 * of one per surface.
 *
 * The cost is that these banners are darker and read as heavier than the
 * original mint-green sweep. That is the honest price of putting five
 * different opacities of white on a gradient.
 */
const greenGradient = `linear-gradient(135deg, ${CLAY.green} 0%, ${CLAY.greenDark} 100%)`

/**
 * MUI reads `theme.shadows[n]` for every `elevation={n}`. Replacing the whole
 * scale is what makes existing `<Card elevation={1}>` usages across the app
 * pick up the look without per-component edits.
 */
const shadowScale = [
  'none',
  ...Array.from({ length: 24 }, (_, i) => raised(4.5 + i * 1.15)),
] as unknown as Shadows

/** Emit one appearance's values as a CSS custom property block. */
const varsFor = (vals: Record<string, string>) =>
  Object.fromEntries(Object.entries(vals).map(([k, val]) => [`--c-${k}`, val]))

/**
 * Appearance is carried by two mechanisms at once, and the split is not
 * arbitrary.
 *
 * 1. `palette` below gets *literal hex values* for the active appearance.
 *    It has to: MUI runs real colour arithmetic on palette entries —
 *    `getContrastText` when deriving `contrastText`, and `alpha()` / `lighten()`
 *    inside the default styles of Alert, Chip, LinearProgress, Button and
 *    others. Handing those a `var(--c-…)` string throws MUI error #9 at render
 *    time, because a custom property cannot be decomposed into channels by JS.
 *    Verified the hard way: every route rendered blank until this was split.
 *
 * 2. The `CLAY`, `raised`, `pressed` and `tint` exports stay custom-property
 *    based. Ten modules import them at module scope and pass them straight into
 *    `sx` as plain CSS values, where nothing ever parses them — so they follow
 *    the `data-appearance` attribute with no call-site changes.
 *
 * Both axes therefore rebuild the theme. That is one React render on a
 * deliberate user action, which is cheap; the alternative was rewriting every
 * one of those call sites.
 */
export function buildTheme(appearance: Appearance, density: Density): Theme {
  const isCourse = density === 'course'
  const P = PALETTES[appearance]

  return createTheme({
    /**
     * Numeric `borderRadius` values in `sx` are multiplied by this. Raising the
     * base from MUI's default 4 to 10 rounds off every existing
     * `borderRadius: 1 | 1.5 | 2` in one move. Course mode pulls it in: very
     * round corners eat usable area in a dense scorecard grid.
     */
    shape: { borderRadius: isCourse ? 7 : 10 },
    shadows: shadowScale,
    palette: {
      primary: {
        main: P.green,
        light: P.greenMid,
        dark: P.greenDark,
        contrastText: '#ffffff',
      },
      secondary: {
        main: P.gold,
        light: P.goldLight,
        dark: P.goldText,
        contrastText: P.onGold,
      },
      background: { default: P.base, paper: P.surface },
      /* `disabled` is raised to the same value as `secondary` deliberately.
         Every use of it in this app is content, not an inactive control —
         placeholder text, em-dashes for missing figures, "N/A", "(You)" — and
         MUI's default rgba(0,0,0,0.38) measured 2.6:1 against every surface.
         WCAG exempts genuinely disabled controls, so nothing here needed to be
         dim; the token was just being used for the wrong job. The cost is that
         a disabled input label no longer looks dimmer than an enabled one,
         which MUI still signals through `action.disabled` on the control. */
      text: { primary: P.ink, secondary: P.inkSoft, disabled: P.inkSoft },
      /* `main` on each status colour is used both as a fill and as text in
         this codebase. These are the text-safe values; the fill-safe ones are
         exposed separately as CLAY.red / CLAY.greenLight / CLAY.clayBlue.
         `contrastText` is given explicitly rather than left to MUI, so the
         white-on-fill pairings are the ones the audit measured. */
      success: { main: P.successText, light: P.greenMid, dark: P.greenDark, contrastText: '#ffffff' },
      warning: { main: P.warningText, light: P.goldLight, dark: P.goldText, contrastText: '#ffffff' },
      error: { main: P.errorText, light: P.red, dark: P.redDeep, contrastText: '#ffffff' },
      info: { main: P.infoText, light: P.clayBlue, dark: P.infoText, contrastText: '#ffffff' },
      divider: P.divider,
      action: {
        hover: 'rgba(47, 107, 76, 0.06)',
        selected: 'rgba(47, 107, 76, 0.1)',
      },
    },
    typography: {
      fontFamily: '"Source Sans 3", "Source Sans Pro", sans-serif',
      h1: { fontFamily: '"Playfair Display", serif' },
      h2: { fontFamily: '"Playfair Display", serif' },
      h3: { fontFamily: '"Playfair Display", serif' },
      h4: { fontFamily: '"Playfair Display", serif' },
      h5: { fontFamily: '"Playfair Display", serif' },
      h6: { fontFamily: '"Playfair Display", serif' },
      button: { fontWeight: 700, letterSpacing: '0.01em' },
      /* Course mode lifts body text a step. Small secondary labels are the
         first thing to become unreadable at arm's length in sun. */
      body2: isCourse ? { fontSize: '0.95rem' } : undefined,
      caption: isCourse ? { fontSize: '0.82rem' } : undefined,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          /* Both appearances are emitted, scoped by a data attribute on
             <html>. Switching mode is then one attribute write — no React
             re-render, no flash, and `var()` consumers update instantly. */
          ':root': { ...varsFor(PALETTES.clay), ...varsFor(DENSITY.comfortable) },
          '[data-appearance="sunlight"]': varsFor(PALETTES.sunlight),
          '[data-density="course"]': varsFor(DENSITY.course),
          body: { backgroundColor: v('base') },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
          '*::-webkit-scrollbar-thumb': {
            background: v('scrollThumb'),
            borderRadius: 10,
            border: '2px solid transparent',
            backgroundClip: 'content-box',
          },
          '*::-webkit-scrollbar-thumb:hover': {
            background: v('scrollThumbHi'),
            backgroundClip: 'content-box',
          },
          /* Visible focus ring. The clay style removes borders, which left
             keyboard focus relying on MUI's default outline against a
             low-contrast surface. */
          ':focus-visible': {
            outline: `3px solid ${v('green')}`,
            outlineOffset: 2,
          },
        },
      },

      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 999,
            textTransform: 'none',
            fontWeight: 700,
            paddingInline: 20,
            minHeight: v('tap'),
            transition: 'transform .15s ease, box-shadow .2s ease, background-color .2s ease',
            '&:active': { transform: 'translateY(1px) scale(0.985)' },
          },
          contained: {
            boxShadow: raised(3),
            // In sunlight and on course screens this is what actually defines
            // the button's edge, since the shadow is turned down to nearly nil.
            border: `${v('borderW')} solid ${v('borderC')}`,
            '&:hover': { boxShadow: raised(4) },
            '&:active': { boxShadow: pressed(2.5) },
            '&.Mui-disabled': { boxShadow: 'none' },
          },
          outlined: {
            borderWidth: 2,
            '&:hover': { borderWidth: 2 },
            // The surface fill is what makes an outlined button read as a
            // raised clay tile rather than a hairline rectangle. But it must
            // not apply to `color="inherit"` buttons: those exist precisely
            // because they sit on a coloured backdrop and take its foreground,
            // so filling them with the page surface paints near-white text on
            // near-white. The navbar's Sign out button measured 1.06:1 that
            // way — legible only as a rectangle. Scoping to the explicit
            // colour variants keeps the effect where the backdrop is known.
            '&.MuiButton-colorPrimary, &.MuiButton-colorSecondary, &.MuiButton-colorSuccess, &.MuiButton-colorError, &.MuiButton-colorWarning, &.MuiButton-colorInfo':
              { backgroundColor: v('surface') },
          },
          text: { '&:active': { transform: 'none' } },
          sizeSmall: { paddingInline: 14, minHeight: 'auto' },
          sizeLarge: { paddingInline: 28, minHeight: v('tapLg') },
        },
      },

      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            transition: 'transform .15s ease, background-color .2s ease',
            '&:active': { transform: 'scale(0.94)' },
          },
          sizeMedium: { minWidth: v('tap'), minHeight: v('tap') },
        },
      },

      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderRadius: isCourse ? 14 : 22,
            border: `${v('borderW')} solid ${v('borderC')}`,
          },
          elevation0: { boxShadow: raised(3.2) },
          outlined: { borderColor: v('divider'), boxShadow: raised(3.2) },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: isCourse ? 14 : 24,
            backgroundImage: 'none',
            overflow: 'hidden',
          },
        },
      },

      MuiCardContent: {
        styleOverrides: {
          root: { '&:last-child': { paddingBottom: isCourse ? 14 : 20 } },
        },
      },

      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: v('green'),
            backgroundImage: 'none',
            borderRadius: 0,
            boxShadow: `0 6px 20px 0 ${v('shade')}`,
          },
        },
      },

      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            backgroundColor: v('sunken'),
            boxShadow: pressed(2),
            transition: 'box-shadow .2s ease, background-color .2s ease',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: v('borderC'),
              borderWidth: v('borderW'),
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(47, 107, 76, 0.35)',
            },
            '&.Mui-focused': { backgroundColor: v('focus') },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderWidth: 2,
              borderColor: v('green'),
            },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': {
              borderWidth: 2,
              borderColor: v('errorText'),
            },
          },
          input: {
            '&:-webkit-autofill': {
              WebkitBoxShadow: `0 0 0 100px ${v('sunken')} inset`,
              WebkitTextFillColor: v('ink'),
              borderRadius: 16,
            },
          },
        },
      },

      MuiFilledInput: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            backgroundColor: v('sunken'),
            boxShadow: pressed(2),
            '&:before, &:after': { display: 'none' },
            '&:hover, &.Mui-focused': { backgroundColor: v('focus') },
          },
        },
      },

      MuiSelect: { styleOverrides: { select: { borderRadius: 16 } } },

      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontWeight: 600,
            boxShadow: raised(1.6),
            border: `${v('borderW')} solid ${v('borderC')}`,
          },
          outlined: { boxShadow: 'none', borderWidth: 1.5 },
        },
      },

      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 28, boxShadow: raised(12) },
        },
      },

      MuiMenu: { styleOverrides: { paper: { borderRadius: 18 } } },

      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            marginInline: 6,
            minHeight: v('tap'),
            '&:first-of-type': { marginTop: 6 },
            '&:last-of-type': { marginBottom: 6 },
          },
        },
      },

      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 18,
            boxShadow: raised(2.5),
            border: `${v('borderW')} solid ${v('borderC')}`,
          },
          standardSuccess: { backgroundColor: v('alertSuccess'), color: v('successText') },
          standardError: { backgroundColor: v('alertError'), color: v('errorText') },
          standardWarning: { backgroundColor: v('alertWarning'), color: v('warningText') },
          standardInfo: { backgroundColor: v('alertInfo'), color: v('infoText') },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 12,
            backgroundColor: v('greenDark'),
            fontSize: '0.78rem',
            padding: '8px 12px',
            boxShadow: `0 6px 18px 0 ${v('shade')}`,
          },
          arrow: { color: v('greenDark') },
        },
      },

      MuiAvatar: {
        styleOverrides: { root: { boxShadow: raised(2), fontWeight: 700 } },
      },

      MuiLinearProgress: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            backgroundColor: v('sunken'),
            boxShadow: pressed(1.2),
          },
          bar: { borderRadius: 999 },
        },
      },

      /**
       * `ButtonGroup` is a different component from `ToggleButtonGroup`, and the
       * scorecard uses it for every tee-shot / approach / putt selector. A
       * sunken track holding raised pills. Each unselected option keeps its own
       * faint pill — made transparent they merge into one undifferentiated bar
       * with no hint that they are separately tappable.
       */
      MuiButtonGroup: {
        defaultProps: { disableElevation: true, disableRipple: false },
        styleOverrides: {
          root: {
            borderRadius: 999,
            backgroundColor: v('sunken'),
            boxShadow: pressed(1.8),
            padding: 3,
            gap: 3,
          },
          grouped: {
            minHeight: v('tap'),
            // `!important` and the doubled class are both needed: MUI's own
            // `grouped` rules set per-position borders and square inner corners
            // at equal specificity, and win on source order otherwise.
            borderRadius: '999px !important',
            marginLeft: '0 !important',
            textTransform: 'none',
            border: `${v('tapBorderW')} solid ${v('borderC')} !important`,
            '&.MuiButton-outlined': {
              backgroundColor: v('surface'),
              boxShadow: raised(1.3),
              color: v('greenText'),
              '&:hover': { backgroundColor: v('surfaceHi'), boxShadow: raised(2) },
            },
            '&.MuiButton-contained': {
              boxShadow: raised(2),
              '&:hover': { boxShadow: raised(2.8) },
            },
          },
        },
      },

      MuiToggleButtonGroup: {
        styleOverrides: {
          root: {
            backgroundColor: v('sunken'),
            borderRadius: 999,
            padding: 4,
            boxShadow: pressed(1.8),
            gap: 4,
          },
          grouped: {
            border: `${v('tapBorderW')} solid ${v('borderC')} !important`,
            borderRadius: '999px !important',
          },
        },
      },

      MuiToggleButton: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            textTransform: 'none',
            fontWeight: 600,
            paddingInline: 16,
            minHeight: v('tap'),
            color: v('inkSoft'),
            '&.Mui-selected': {
              backgroundColor: v('surface'),
              color: v('greenText'),
              boxShadow: raised(2),
              '&:hover': { backgroundColor: v('surface') },
            },
          },
        },
      },

      /** A sunken track holding one raised pill, matching the button groups. */
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 44,
            backgroundColor: v('sunken'),
            boxShadow: pressed(1.8),
            borderRadius: 16,
            padding: 4,
          },
          indicator: {
            // The indicator *is* the pill, so it fills the track height and has
            // to sit behind the labels rather than under them.
            height: '100%',
            borderRadius: 12,
            backgroundColor: v('surface'),
            boxShadow: raised(2),
            border: `${v('tapBorderW')} solid ${v('borderC')}`,
            zIndex: 0,
          },
        },
      },

      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 12,
            minHeight: v('tap'),
            // Needed for z-index to apply — without it the labels render
            // underneath the indicator pill and vanish on the selected tab.
            position: 'relative',
            zIndex: 1,
            '&.Mui-selected': { color: v('greenText') },
          },
        },
      },

      MuiAccordion: {
        styleOverrides: {
          root: {
            borderRadius: '18px !important',
            marginBottom: 8,
            '&:before': { display: 'none' },
          },
        },
      },

      MuiListItemButton: {
        styleOverrides: { root: { borderRadius: 14, minHeight: v('tap') } },
      },

      MuiSwitch: {
        styleOverrides: {
          track: { borderRadius: 999, opacity: 0.35 },
          thumb: { boxShadow: raised(1.4) },
        },
      },

      MuiTableCell: {
        styleOverrides: {
          root: { borderBottomColor: v('divider') },
          head: { fontWeight: 700, color: v('greenText') },
        },
      },

      MuiSnackbarContent: { styleOverrides: { root: { borderRadius: 18 } } },

      MuiSkeleton: {
        styleOverrides: { root: { borderRadius: 14, backgroundColor: v('skeleton') } },
      },
    },
  })
}

export { CLAY, raised, pressed, tint, greenGradient, PALETTES }
export default buildTheme('clay', 'comfortable')
