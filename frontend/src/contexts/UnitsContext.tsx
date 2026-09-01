import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type DistanceUnit = 'yards' | 'metres'

const STORAGE_KEY = 'distanceUnit'

/**
 * Course data arrives from the provider in yards, always — so yards is the
 * stored unit everywhere and metres is a display conversion applied at the
 * point of render. Nothing is converted on the way into the database, which
 * means switching units can never round-trip a distance through two
 * conversions and lose a yard.
 */
export const YARDS_TO_METRES = 0.9144

function readStored(): DistanceUnit {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'metres' ? 'metres' : 'yards'
  } catch {
    // Private-mode Safari throws on localStorage rather than returning null.
    return 'yards'
  }
}

interface UnitsContextValue {
  unit: DistanceUnit
  setUnit: (u: DistanceUnit) => void
  toggleUnit: () => void
  /** Short suffix for the active unit: "yds" or "m". */
  unitLabel: string
  /** Convert a yardage from the database into the active unit, rounded. */
  toDisplay: (yards: number) => number
  /** A distance with its unit, e.g. "412 yds" or "377 m". */
  formatDistance: (yards: number) => string
}

const UnitsContext = createContext<UnitsContextValue | null>(null)

/**
 * Distance units, kept separate from AppearanceContext because it owns the MUI
 * theme: changing units would otherwise rebuild the whole theme to restyle
 * nothing. This provider re-renders its consumers and no one else.
 */
export function UnitsProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<DistanceUnit>(readStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, unit)
    } catch {
      // Non-fatal: the choice just won't survive a reload.
    }
  }, [unit])

  const value = useMemo<UnitsContextValue>(() => {
    const metric = unit === 'metres'
    const toDisplay = (yards: number) =>
      Math.round(metric ? yards * YARDS_TO_METRES : yards)
    return {
      unit,
      setUnit: setUnitState,
      toggleUnit: () => setUnitState((u) => (u === 'yards' ? 'metres' : 'yards')),
      unitLabel: metric ? 'm' : 'yds',
      toDisplay,
      formatDistance: (yards: number) => `${toDisplay(yards)} ${metric ? 'm' : 'yds'}`,
    }
  }, [unit])

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>
}

export function useUnits(): UnitsContextValue {
  const ctx = useContext(UnitsContext)
  if (!ctx) throw new Error('useUnits must be used inside UnitsProvider')
  return ctx
}
