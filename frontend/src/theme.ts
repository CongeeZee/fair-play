import { createTheme } from '@mui/material/styles'
import type { Shadows } from '@mui/material/styles'

/* ------------------------------------------------------------------ *
 * Claymorphism design tokens
 *
 * The look is built from three ingredients, applied consistently:
 *   1. Large, soft corner radii (nothing sharper than ~10px).
 *   2. A two-tone drop shadow — a warm shadow down-right, a white
 *      highlight up-left — so surfaces read as pressed out of clay
 *      rather than floating on a page.
 *   3. Inset highlights on the top edge and inset shade on the bottom
 *      edge, which is what gives the "puffy" quality.
 *
 * Everything below derives from CLAY.* so the palette can be retuned
 * in one place. Keeping the original Fairplay green/gold identity —
 * both hues are softened a step so they sit in a clay surface without
 * looking like stickers pasted onto it.
 * ------------------------------------------------------------------ */

const CLAY = {
  /** Page background — the "slab" everything is pressed out of. */
  base: '#e9e1d3',
  /** Raised surfaces (cards, dialogs, menus). Lighter than the base. */
  surface: '#faf6ee',
  /** Recessed surfaces (inputs, wells, table stripes). */
  sunken: '#e4dbcb',
  /** Warm shadow colour, sampled from a darkened base. */
  shade: 'rgba(158, 141, 111, 0.52)',
  shadeSoft: 'rgba(158, 141, 111, 0.3)',
  /** Highlight colour for the up-left light source. */
  light: 'rgba(255, 255, 255, 0.92)',
  green: '#2f6b4c',
  greenLight: '#4a8a68',
  greenDark: '#1f4a34',
  gold: '#e0b95c',
  goldLight: '#f2d492',
  goldDark: '#bf9738',
  ink: '#2b3a30',
  inkSoft: '#68786d',
}

/**
 * The signature raised-clay shadow.
 * `d` scales the whole thing so elevation still means something.
 */
const raised = (d: number) => [
  // outer: warm shadow cast down-right by a light source at the top-left
  `${d * 1.0}px ${d * 1.3}px ${d * 2.6}px 0 ${CLAY.shade}`,
  // outer: matching white bounce up-left, which is what separates clay from
  // a plain material-design drop shadow
  `-${d * 0.8}px -${d * 0.9}px ${d * 2.0}px 0 ${CLAY.light}`,
  // inset: bright top lip and shaded bottom lip give the surface its
  // rounded, puffed-up profile
  `inset 0 ${d * 0.7}px ${d * 1.3}px 0 rgba(255, 255, 255, 0.85)`,
  `inset 0 -${d * 0.6}px ${d * 1.2}px 0 ${CLAY.shadeSoft}`,
].join(', ')

/** Inverse of `raised` — used for inputs and anything that should read as carved in. */
const pressed = (d: number) => [
  `inset ${d * 0.7}px ${d * 0.8}px ${d * 1.6}px 0 ${CLAY.shade}`,
  `inset -${d * 0.5}px -${d * 0.6}px ${d * 1.4}px 0 ${CLAY.light}`,
].join(', ')

/**
 * Flatten an accent tint onto the raised clay surface and return a solid colour.
 *
 * Why this exists: a translucent `rgba(accent, 0.08)` card background composites
 * against whatever is *behind* it. That was fine when the page was near-white
 * (#f5f0e8), but the clay base (#e9e1d3) is darker than the card surface
 * (#faf6ee), so the same tint makes a raised card land darker than the page and
 * read as a sunken smudge. Compositing against the surface up front keeps
 * tinted cards above the page while preserving the accent.
 *
 * @param hex   accent colour, `#rrggbb`
 * @param alpha strength of the tint, 0–1
 * @param base  surface to flatten onto; defaults to the raised clay surface
 */
const tint = (hex: string, alpha: number, base: string = CLAY.surface) => {
  const parse = (h: string) => {
    const n = parseInt(h.replace('#', ''), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [r, g, b] = parse(hex)
  const [br, bg, bb] = parse(base)
  const mix = (c: number, bc: number) => Math.round(bc + (c - bc) * alpha)
  return `rgb(${mix(r, br)}, ${mix(g, bg)}, ${mix(b, bb)})`
}

/**
 * MUI reads `theme.shadows[n]` for every `elevation={n}` prop. Replacing the
 * whole scale is what makes existing `<Card elevation={1}>` / `<Paper
 * elevation={8}>` usages across the app pick up the clay look without any
 * per-component edits.
 */
const clayShadows = [
  'none',
  ...Array.from({ length: 24 }, (_, i) => raised(4.5 + i * 1.15)),
] as unknown as Shadows

const theme = createTheme({
  /**
   * Numeric `borderRadius` values in `sx` are multiplied by this. Raising the
   * base from MUI's default 4 to 10 rounds off every existing
   * `borderRadius: 1 | 1.5 | 2` in the codebase in one move, which is exactly
   * the scale claymorphism wants.
   */
  shape: {
    borderRadius: 10,
  },
  shadows: clayShadows,
  palette: {
    primary: {
      main: CLAY.green,
      light: CLAY.greenLight,
      dark: CLAY.greenDark,
      contrastText: '#fbf8f2',
    },
    secondary: {
      main: CLAY.gold,
      light: CLAY.goldLight,
      dark: CLAY.goldDark,
      contrastText: '#3a2f12',
    },
    background: {
      default: CLAY.base,
      paper: CLAY.surface,
    },
    text: {
      primary: CLAY.ink,
      secondary: CLAY.inkSoft,
    },
    success: { main: '#4f9d6d', light: '#7fbf97', dark: '#357a50' },
    warning: { main: '#e0a03f', light: '#f0c47e', dark: '#b87c22' },
    error: { main: '#cf6b60', light: '#e5978e', dark: '#a1453c' },
    info: { main: '#5c86a8', light: '#8fb2ce', dark: '#3d6183' },
    /**
     * Softened almost to nothing: a lot of pages draw `border: '1px solid'
     * borderColor: 'divider'` around Papers. Under claymorphism the depth cue
     * is the shadow, not a hairline, so the hairline is dialled back rather
     * than removed from ~40 call sites. Warm rather than the old cool grey-green
     * so the lines that do survive read as a seam in the clay, not as ink.
     */
    divider: 'rgba(158, 141, 111, 0.22)',
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
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: CLAY.base,
        },
        /* Scrollbars, so the chrome matches the surfaces. */
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
        '*::-webkit-scrollbar-thumb': {
          background: 'rgba(163, 148, 122, 0.45)',
          borderRadius: 10,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-thumb:hover': {
          background: 'rgba(163, 148, 122, 0.7)',
          backgroundClip: 'content-box',
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
          transition: 'transform .15s ease, box-shadow .2s ease, background-color .2s ease',
          /* The press interaction is the point of clay: the button squashes. */
          '&:active': {
            transform: 'translateY(1px) scale(0.985)',
          },
        },
        contained: {
          boxShadow: raised(3),
          '&:hover': { boxShadow: raised(4) },
          '&:active': { boxShadow: pressed(2.5) },
          '&.Mui-disabled': { boxShadow: 'none' },
        },
        outlined: {
          borderWidth: 2,
          backgroundColor: 'rgba(255,255,255,0.35)',
          '&:hover': { borderWidth: 2 },
        },
        text: {
          '&:active': { transform: 'none' },
        },
        sizeSmall: { paddingInline: 14 },
        sizeLarge: { paddingInline: 28 },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          transition: 'transform .15s ease, background-color .2s ease',
          '&:active': { transform: 'scale(0.94)' },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 22,
        },
        /* Many pages use `elevation={0}` + a hairline border. Give those a
           gentle clay lift so they don't read as flat rectangles. */
        elevation0: {
          boxShadow: raised(3.2),
        },
        outlined: {
          borderColor: 'rgba(43, 58, 48, 0.07)',
          boxShadow: raised(3.2),
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 24,
          backgroundImage: 'none',
          overflow: 'hidden',
        },
      },
    },

    MuiCardContent: {
      styleOverrides: {
        root: {
          '&:last-child': { paddingBottom: 20 },
        },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: CLAY.green,
          backgroundImage: 'none',
          borderRadius: 0,
          boxShadow: `0 6px 20px 0 ${CLAY.shade}`,
        },
      },
    },

    /* Inputs read as carved into the clay rather than sitting on it. */
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          backgroundColor: CLAY.sunken,
          boxShadow: pressed(2),
          transition: 'box-shadow .2s ease, background-color .2s ease',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'transparent',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(47, 107, 76, 0.18)',
          },
          '&.Mui-focused': {
            backgroundColor: '#efe8da',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderWidth: 2,
            borderColor: CLAY.green,
          },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': {
            borderColor: '#cf6b60',
          },
        },
        input: {
          '&:-webkit-autofill': {
            WebkitBoxShadow: `0 0 0 100px ${CLAY.sunken} inset`,
            WebkitTextFillColor: CLAY.ink,
            borderRadius: 16,
          },
        },
      },
    },

    MuiFilledInput: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          backgroundColor: CLAY.sunken,
          boxShadow: pressed(2),
          '&:before, &:after': { display: 'none' },
          '&:hover, &.Mui-focused': { backgroundColor: '#efe8da' },
        },
      },
    },

    MuiSelect: {
      styleOverrides: {
        select: { borderRadius: 16 },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600,
          boxShadow: raised(1.6),
        },
        outlined: {
          boxShadow: 'none',
          borderWidth: 1.5,
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 28,
          boxShadow: raised(12),
        },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: 18 },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          marginInline: 6,
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
          border: 'none',
        },
        standardSuccess: { backgroundColor: '#dfeee4' },
        standardError: { backgroundColor: '#f7e2df' },
        standardWarning: { backgroundColor: '#f8ecd6' },
        standardInfo: { backgroundColor: '#e0e9f1' },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 12,
          backgroundColor: CLAY.greenDark,
          fontSize: '0.78rem',
          padding: '8px 12px',
          boxShadow: `0 6px 18px 0 ${CLAY.shade}`,
        },
        arrow: { color: CLAY.greenDark },
      },
    },

    MuiAvatar: {
      styleOverrides: {
        root: {
          boxShadow: raised(2),
          fontWeight: 700,
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          backgroundColor: CLAY.sunken,
          boxShadow: pressed(1.2),
        },
        bar: { borderRadius: 999 },
      },
    },

    /**
     * `ButtonGroup` is a different component from `ToggleButtonGroup`, and the
     * scorecard uses it for every tee-shot / approach / putt selector. Left
     * unstyled it renders as flat hairline-bordered rectangles, which was the
     * most obviously un-clay surface left in the app. Same treatment as the
     * toggle group: a sunken track holding raised pills.
     */
    MuiButtonGroup: {
      defaultProps: { disableElevation: true, disableRipple: false },
      styleOverrides: {
        root: {
          borderRadius: 999,
          backgroundColor: CLAY.sunken,
          boxShadow: pressed(1.8),
          padding: 3,
          gap: 3,
        },
        grouped: {
          minHeight: 34,
          // `!important` and the doubled class are both needed: MUI's own
          // `grouped` rules set per-position borders and square inner corners
          // at equal specificity, and they win on source order otherwise.
          border: 'none !important',
          borderRadius: '999px !important',
          marginLeft: '0 !important',
          textTransform: 'none',
          // Each unselected option is its own faint pill. Leaving them
          // transparent on the sunken track removed the old hairline dividers
          // and the four choices merged into one undifferentiated bar with no
          // hint that they were separately tappable.
          '&.MuiButton-outlined': {
            backgroundColor: CLAY.surface,
            boxShadow: raised(1.3),
            color: CLAY.green,
            '&:hover': {
              backgroundColor: '#fffdf8',
              boxShadow: raised(2),
            },
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
          backgroundColor: CLAY.sunken,
          borderRadius: 999,
          padding: 4,
          boxShadow: pressed(1.8),
          gap: 4,
        },
        grouped: {
          border: 'none !important',
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
          border: 'none',
          paddingInline: 16,
          '&.Mui-selected': {
            backgroundColor: CLAY.surface,
            color: CLAY.green,
            boxShadow: raised(2),
            '&:hover': { backgroundColor: CLAY.surface },
          },
        },
      },
    },

    /**
     * Tabs as a sunken track holding one raised pill, matching the toggle and
     * button groups. The default 4px underline indicator was the last flat rule
     * in the app; it also collided with the track's rounded bottom corners once
     * the track itself became clay.
     */
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 44,
          backgroundColor: CLAY.sunken,
          boxShadow: pressed(1.8),
          borderRadius: 16,
          padding: 4,
        },
        indicator: {
          // The indicator *is* the pill, so it fills the track height and has
          // to sit behind the labels rather than under them.
          height: '100%',
          borderRadius: 12,
          backgroundColor: CLAY.surface,
          boxShadow: raised(2),
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
          minHeight: 36,
          // Needed for z-index to apply at all — without it the labels render
          // underneath the indicator pill and disappear on the selected tab.
          position: 'relative',
          zIndex: 1,
          '&.Mui-selected': { color: CLAY.green },
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
      styleOverrides: {
        root: {
          borderRadius: 14,
        },
      },
    },

    MuiSwitch: {
      styleOverrides: {
        track: { borderRadius: 999, opacity: 0.35 },
        thumb: { boxShadow: raised(1.4) },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: 'rgba(43, 58, 48, 0.06)',
        },
        head: {
          fontWeight: 700,
          color: CLAY.green,
        },
      },
    },

    MuiSnackbarContent: {
      styleOverrides: {
        root: { borderRadius: 18 },
      },
    },

    MuiSkeleton: {
      styleOverrides: {
        root: { borderRadius: 14, backgroundColor: 'rgba(163, 148, 122, 0.2)' },
      },
    },
  },
})

export { CLAY, raised, pressed, tint }
export default theme
