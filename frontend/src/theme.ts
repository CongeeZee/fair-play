import { createTheme } from '@mui/material/styles'
import type { Shadows, Theme } from '@mui/material/styles'

/* ------------------------------------------------------------------ *
 * Fairplay theming
 *
 * Two independent axes:
 *
 *   appearance  'light' — the default. The high-contrast palette that used to
 *                         be opt-in "sunlight" mode: text solved to AAA and
 *                         depth carried by BORDERS rather than shadow, because
 *                         a shadow is the first thing to disappear under glare.
 *                         It is the default because the app is used outdoors,
 *                         and nobody predicts they will need the readable
 *                         palette before they walk to the first tee.
 *               'dark'  — the same structure inverted for low light: dark
 *                         surfaces, light ink, borders kept (they are what
 *                         separates one dark card from another).
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
 * call sites on the light palette — the exact "half-converted" result this
 * work is meant to avoid. Emitting `var(--c-*)` instead means the switch is a single
 * data attribute on <html>, every existing call site follows it for free, and
 * there is no re-render cost.
 * ------------------------------------------------------------------ */

export type Appearance = 'light' | 'dark'
export type Density = 'comfortable' | 'course'

/**
 * Raw palette values per appearance.
 *
 * Every text colour was solved against the worst background it can land on,
 * not picked by eye, and `npm run verify:contrast` re-measures every pairing
 * in both appearances. Light targets AAA (7:1) where it can rather than AA,
 * because bright ambient light adds a roughly constant reflected luminance to
 * the screen and compresses the effective ratio — designing past the minimum
 * indoors is what leaves usable margin outdoors. Dark is solved to the same
 * table with the surfaces inverted.
 *
 * The fill/text split matters: the previous palette used one hex for both a
 * filled chip (with white text on it) and coloured text on a light card. Those
 * are opposite requirements and no single value satisfies both, which is why
 * two thirds of the old pairs failed. `green` is a fill, `greenText` is text.
 */
const PALETTES: Record<Appearance, Record<string, string>> = {
  light: {
    base: '#f2f1ec',
    surface: '#ffffff',
    sunken: '#e6e4db',
    surfaceHi: '#ffffff',
    focus: '#dfddd2',

    // Shadows are nearly switched off. A soft shadow conveys nothing once
    // reflected glare lifts the black level, so structure moves to borders.
    // `depth` scales every shadow offset in the app from one place.
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
    // The green bar is #2c6347, so these clear at 5.25:1 and 5.89:1. Held
    // identical in dark mode so the bar does not shift hue when toggled.
    goldOnGreen: '#f5dca4',
    onGreenSoft: '#e4ede8',
    // Gold as a meaningful graphic (a filled star, a bar) on a light surface.
    // WCAG 1.4.11 wants 3:1 and raw `gold` manages 1.73:1, so it needs its own
    // darker step: 4.37:1 on white, 3.86:1 on the tinted base.
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

    /* Foreground for a filled success/warning/error/info swatch. The status
       `main` values above are the *text* steps; MUI also paints them as fills
       and needs a foreground that survives the inversion, so it is a token
       rather than a hardcoded white. */
    onStatus: '#ffffff',
    actionHover: 'rgba(47, 107, 76, 0.06)',
    actionSelected: 'rgba(47, 107, 76, 0.1)',
  },

  /* Dark.
   *
   * Not a tint of light with the lightness flipped: the roles are re-solved.
   * Surfaces climb *toward* the viewer (base is the darkest thing on screen,
   * a card is lighter, a hover state lighter still), which is the inverse of
   * light mode where a sunken well is darker than its card. Every `*Text`
   * token becomes a light step, because it now sits on a dark card; every
   * *fill* — the green bar, the gold chip, the red badge — is unchanged, so a
   * chip means the same thing in both modes and the brand green never shifts.
   *
   * Borders stay on (`borderW: 1px`). In light mode they replace shadow under
   * glare; in dark mode they do the same job for a different reason, since a
   * dark shadow on a dark ground separates nothing. */
  dark: {
    base: '#12171a',
    surface: '#1c2327',
    sunken: '#161c20',
    surfaceHi: '#242c31',
    focus: '#2a3339',

    shade: 'rgba(0, 0, 0, 0.62)',
    shadeSoft: 'rgba(0, 0, 0, 0.4)',
    // A near-black ground has no white bevel to give; the inset highlight is
    // a whisper of white instead, or every raised surface gets a milky rim.
    light: 'rgba(255, 255, 255, 0.05)',
    depth: '0.8',
    // 1px rather than light mode's 2px: the line is doing the same structural
    // job, but nothing here has to survive glare, so it can be a hairline.
    borderW: '1px',
    borderC: '#6e7c81',

    ink: '#e9efeb',
    inkSoft: '#a3aeaa',

    // Fills, held identical to light mode. `green` carries white at 7.35:1 on
    // either ground because the ground is not what it is measured against.
    green: '#2c6347',
    greenMid: '#3e7357',
    greenDark: '#14331f',
    // Text, not a fill — inverted to a light step so it reads on a dark card.
    greenText: '#7fc79c',

    gold: '#e0b95c',
    goldLight: '#f2d492',
    goldText: '#e3c079',
    onGold: '#1a1508',
    goldOnGreen: '#f5dca4',
    onGreenSoft: '#e4ede8',
    // On a dark card raw `gold` clears 1.4.11 several times over, so the
    // graphic step and the fill step converge — no separate darkening needed.
    goldGraphic: '#e0b95c',

    clayBlue: '#4a6c88',
    infoText: '#93bcd8',
    red: '#a35046',
    redDeep: '#8c342a',
    errorText: '#f0a096',
    successText: '#7ec9a0',
    warningText: '#e2bc72',
    slate: '#5c5470',

    // 3:1 against `surface`, so a table rule or a list separator is still a
    // line and not a suggestion. MUI's stock dark divider is white at 12%,
    // which measures 1.5:1 and disappears the moment the row it separates has
    // any content in it.
    divider: '#657377',
    scrollThumb: 'rgba(233, 239, 235, 0.28)',
    scrollThumbHi: 'rgba(233, 239, 235, 0.5)',
    skeleton: 'rgba(233, 239, 235, 0.1)',

    // Alert grounds are tinted *darker* than the card, so a banner reads as
    // inset rather than as another card floating on the page.
    alertSuccess: '#16301f',
    alertError: '#331a17',
    alertWarning: '#302512',
    alertInfo: '#15242e',

    // White on a light status fill would be unreadable; the fills are the
    // light steps here, so their foreground is the page's darkest ink.
    onStatus: '#101619',
    actionHover: 'rgba(255, 255, 255, 0.07)',
    actionSelected: 'rgba(255, 255, 255, 0.13)',
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
 * The name `CLAY` predates the light/dark split and is kept because ~10 files
 * already import it; renaming it would be a large diff for no behavioural gain.
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
 * The signature raised-surface shadow.
 *
 * Every offset is multiplied by `--c-depth`, which is 0.28 in light and 0.8
 * in dark. That single var is what lets the same component overrides serve
 * both appearances: in light the shadows shrink to almost nothing and the
 * border vars take over as the structural cue.
 */
const scale = (n: number) => `calc(${n}px * ${v('depth')})`

const raised = (d: number) =>
  [
    `${scale(d * 1.0)} ${scale(d * 1.3)} ${scale(d * 2.6)} 0 ${v('shade')}`,
    // There used to be a second OUTER shadow here, offset up-left in
    // `--c-light` (near-opaque white). On the light page background it read as
    // soft two-tone depth, but it is painted outside the element, so on any
    // dark backdrop it became a white halo — the hero's "Get Started" button
    // and every dialog glowed. The bevel below gives the same lift from
    // *inside* the shape, where it can't bleed onto the backdrop.
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
 * whatever is *behind* it. On a page base darker than the card surface that
 * made a raised card land darker than the page and read as a sunken smudge. `color-mix` does the flattening in the browser, which — unlike
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
      /* Tells MUI which way round the world is. Every surface and text colour
         is given explicitly below, but `mode` is what makes the components we
         do *not* override — Backdrop, the Dialog scrim, ripples, the default
         Divider — pick the right end of their own scales. */
      mode: appearance,
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
         on-fill pairings are the ones the audit measured, in both modes. */
      success: { main: P.successText, light: P.greenMid, dark: P.greenDark, contrastText: P.onStatus },
      warning: { main: P.warningText, light: P.goldLight, dark: P.goldText, contrastText: P.onStatus },
      error: { main: P.errorText, light: P.red, dark: P.redDeep, contrastText: P.onStatus },
      info: { main: P.infoText, light: P.clayBlue, dark: P.infoText, contrastText: P.onStatus },
      divider: P.divider,
      action: {
        hover: P.actionHover,
        selected: P.actionSelected,
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
         first thing to become unreadable at arm's length in sun.

         Spread rather than `body2: isCourse ? {...} : undefined`. MUI builds
         the typography object by spreading this input over its defaults, and a
         spread does not skip explicit `undefined`s — so the old form did not
         mean "leave body2 alone" in comfortable density, it meant
         `body2: undefined`, deleting the variant outright. Nothing noticed
         until a component read a field off one: `StepIcon` does
         `theme.typography.caption.fontSize`, so every Stepper in the app threw
         "Cannot read properties of undefined (reading 'fontSize')" during
         render. The app's only Stepper is the Create Competition wizard, which
         made creating a competition impossible — it took the whole app down to
         the root error boundary ("Something went wrong. Please reload the
         page.") the moment the dialog opened. */
      ...(isCourse
        ? {
            body2: { fontSize: '0.95rem' },
            caption: { fontSize: '0.82rem' },
          }
        : {}),
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          /* Light is emitted unscoped so it is what `:root` resolves to
             before React mounts — the default appearance is the one you get
             for free. Dark is layered on top by a data attribute on <html>,
             so switching mode is one attribute write: no React re-render, no
             flash, and every `var()` consumer updates instantly. */
          ':root': { ...varsFor(PALETTES.light), ...varsFor(DENSITY.comfortable) },
          '[data-appearance="dark"]': varsFor(PALETTES.dark),
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
          /* Visible focus ring in the brand green. The default UA outline
             was all but invisible against these surfaces. */
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
            // This is what actually defines the button's edge in light mode
            // and on course screens, where the shadow is turned down to nil.
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
              borderColor: v('greenText'),
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
export default buildTheme('light', 'comfortable')
