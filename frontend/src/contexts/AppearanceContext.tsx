import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'

import { buildTheme, type Appearance, type Density } from '../theme'

const STORAGE_KEY = 'appearance'

/**
 * Routes that are used with the phone held at arm's length, outdoors, usually
 * one-handed and often mid-swing-thought. They render in `course` density:
 * larger tap targets, larger numerals, real borders instead of shadow-only
 * depth cues.
 *
 * This is derived from the URL rather than exposed as a setting because the
 * user should not have to predict, before walking to the first tee, that they
 * will need it. The cost is that it is not overridable — someone reviewing a
 * finished round indoors still gets the chunkier layout. That is the trade the
 * automatic-by-route approach makes.
 */
const COURSE_ROUTES = ['/rounds/:id', '/live/:roundId', '/play']

export function densityForPath(pathname: string): Density {
  return COURSE_ROUTES.some((p) => matchPath(p, pathname)) ? 'course' : 'comfortable'
}

function readStored(): Appearance {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'sunlight' ? 'sunlight' : 'clay'
  } catch {
    // Private-mode Safari throws on localStorage access rather than returning
    // null. Falling back to the default beats taking the whole app down.
    return 'clay'
  }
}

/**
 * Applied at module scope, before React's first render, so the page does not
 * paint in clay and then snap to sunlight. It is a single attribute write; the
 * CSS custom property blocks that respond to it are emitted by the theme's
 * CssBaseline override.
 */
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-appearance', readStored())
}

interface AppearanceContextValue {
  appearance: Appearance
  density: Density
  setAppearance: (a: Appearance) => void
  toggleAppearance: () => void
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

/**
 * Owns both axes of the visual mode and supplies the MUI theme.
 *
 * Must be rendered inside the router: density is read from the current route.
 *
 * Both axes do two things at once: they rebuild the MUI theme (which needs
 * literal colour values, because MUI does colour arithmetic on the palette) and
 * they set an attribute on `<html>` (which drives the `--c-*` custom properties
 * that the `CLAY`, `raised` and `tint` exports resolve against). See the note
 * above `buildTheme` for why the mechanism is split rather than unified.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>(readStored)
  const { pathname } = useLocation()
  const density = densityForPath(pathname)

  useEffect(() => {
    document.documentElement.setAttribute('data-appearance', appearance)
    try {
      localStorage.setItem(STORAGE_KEY, appearance)
    } catch {
      // Non-fatal: the choice just won't survive a reload.
    }
  }, [appearance])

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density)
  }, [density])

  const setAppearance = useCallback((a: Appearance) => setAppearanceState(a), [])
  const toggleAppearance = useCallback(
    () => setAppearanceState((a) => (a === 'clay' ? 'sunlight' : 'clay')),
    [],
  )

  const theme = useMemo(() => buildTheme(appearance, density), [appearance, density])

  const value = useMemo(
    () => ({ appearance, density, setAppearance, toggleAppearance }),
    [appearance, density, setAppearance, toggleAppearance],
  )

  return (
    <AppearanceContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppearanceContext.Provider>
  )
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext)
  if (!ctx) throw new Error('useAppearance must be used inside AppearanceProvider')
  return ctx
}
