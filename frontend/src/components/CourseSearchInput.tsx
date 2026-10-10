import { useEffect, useMemo, useState } from 'react'
import {
  Box, TextField, InputAdornment, List, ListItemButton, ListItemText,
  Paper, CircularProgress, Typography, Divider, ListSubheader,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import { useQuery } from '@tanstack/react-query'
import { searchExternalCourses, getCourses, type ExternalCourse } from '../api/courses'
import { formatCourseName } from '../utils'

export interface CourseSearchResult {
  source: 'external' | 'local'
  /** External id (number-as-string) for source=external, local DB id for source=local */
  id: string
  name: string
  /** Secondary label shown under name (club / location for external) */
  subtitle?: string
  /** Optional external id when source=local (rarely set) */
  externalId?: string | null
}

interface Props {
  onSelect: (course: CourseSearchResult) => void
  /**
   * 'external' uses golfcourseapi.com (30k+ courses). 'local' uses our own DB.
   * 'both' shows courses already on Fairplay first (instant, exact tees, and
   * no external quota spent) with the worldwide results under them — and keeps
   * working off the local list when the external API is down or out of quota.
   */
  source?: 'external' | 'local' | 'both'
  /** 'inline' = compact dropdown; 'fullPage' = paper card list. */
  variant?: 'inline' | 'fullPage'
  placeholder?: string
  autoFocus?: boolean
  /** When true, clears the input after the user selects a result. Default: variant === 'inline'. */
  clearOnSelect?: boolean
  /** Optional initial query (used by Play page when arriving from a hint). */
  initialQuery?: string
}

function locationStr(loc?: { city?: string; state?: string; country?: string }) {
  if (!loc) return undefined
  return [loc.city, loc.state, loc.country].filter(Boolean).join(', ') || undefined
}

export default function CourseSearchInput({
  onSelect,
  source = 'external',
  variant = 'inline',
  placeholder = 'Search courses…',
  autoFocus = false,
  clearOnSelect,
  initialQuery = '',
}: Props) {
  const [search, setSearch] = useState(initialQuery)
  const [debounced, setDebounced] = useState(initialQuery)
  const shouldClear = clearOnSelect ?? variant === 'inline'

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const ready = debounced.length >= 2
  const externalQuery = useQuery({
    queryKey: ['course-search-ext', debounced],
    queryFn: () => searchExternalCourses(debounced),
    enabled: ready && source !== 'local',
    staleTime: 60_000,
  })
  const localQuery = useQuery({
    queryKey: ['course-search-local', debounced],
    queryFn: () => getCourses(debounced),
    enabled: ready && source !== 'external',
    staleTime: 60_000,
  })

  const results: CourseSearchResult[] = useMemo(() => {
    const ext = ((externalQuery.data ?? []) as ExternalCourse[]).map((c) => ({
      source: 'external' as const,
      id: String(c.id),
      name: c.course_name,
      subtitle: [c.club_name, locationStr(c.location)].filter(Boolean).join(' · ') || undefined,
    }))
    const local = (localQuery.data ?? []).map((c) => ({
      source: 'local' as const,
      id: String(c.id),
      name: formatCourseName(c.name),
      subtitle: source === 'both' ? `${c.holes?.length ?? 18} holes` : undefined,
      externalId: c.externalId,
    }))
    if (source === 'external') return ext
    if (source === 'local') return local
    return [...local.slice(0, 5), ...ext]
  }, [source, externalQuery.data, localQuery.data])

  const isLoading = source === 'external' ? externalQuery.isLoading
    : source === 'local' ? localQuery.isLoading
    // In 'both', show whatever has arrived rather than waiting on the slower call
    : (externalQuery.isLoading && localQuery.isLoading) || (results.length === 0 && (externalQuery.isLoading || localQuery.isLoading))
  const error = source === 'external' ? externalQuery.error
    : source === 'local' ? localQuery.error
    : (results.length === 0 ? (externalQuery.error ?? localQuery.error) : null)

  const handleSelect = (r: CourseSearchResult) => {
    if (shouldClear) {
      setSearch('')
      setDebounced('')
    }
    onSelect(r)
  }

  const input = (
    <TextField
      fullWidth
      size={variant === 'inline' ? 'small' : 'medium'}
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: 'text.secondary', fontSize: variant === 'inline' ? 20 : 24 }} />
            </InputAdornment>
          ),
        },
      }}
    />
  )

  // ── Inline (dropdown) variant ─────────────────────────────────────────────
  if (variant === 'inline') {
    return (
      <Box>
        {input}
        {ready && (
          <Paper
            elevation={1}
            sx={{
              mt: 1,
              maxHeight: 320,
              overflow: 'auto',
              borderRadius: 1,
            }}
          >
            {isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={20} />
              </Box>
            )}
            {!isLoading && error && (
              <Box sx={{ p: 2 }}>
                <Typography variant="caption" color="error">Search failed. Try again.</Typography>
              </Box>
            )}
            {!isLoading && !error && results.length === 0 && (
              <Box sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">No courses found.</Typography>
              </Box>
            )}
            {!isLoading && !error && results.length > 0 && (
              <List dense disablePadding>
                {results.map((r, idx) => (
                  <Box key={`${r.source}:${r.id}`}>
                    {source === 'both' && (idx === 0 || results[idx - 1].source !== r.source) && (
                      <ListSubheader disableSticky sx={{ lineHeight: '32px', bgcolor: 'transparent', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {r.source === 'local' ? 'On Fairplay' : 'All courses'}
                      </ListSubheader>
                    )}
                    {idx > 0 && results[idx - 1].source === r.source && <Divider />}
                    <ListItemButton onClick={() => handleSelect(r)}>
                      <ListItemText
                        primary={r.name}
                        secondary={r.subtitle}
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItemButton>
                  </Box>
                ))}
              </List>
            )}
          </Paper>
        )}
      </Box>
    )
  }

  // ── Full-page variant ─────────────────────────────────────────────────────
  return (
    <Box>
      {input}

      {!ready && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <GolfCourseIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography color="text.secondary">
            Type at least 2 characters to search
          </Typography>
        </Box>
      )}

      {ready && isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress color="primary" />
        </Box>
      )}

      {ready && error && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="error" variant="body2">Failed to search courses. Please try again.</Typography>
        </Box>
      )}

      {ready && !isLoading && !error && results.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">No courses found for "{debounced}"</Typography>
        </Box>
      )}

      {ready && !isLoading && !error && results.length > 0 && (
        <Paper elevation={1}>
          <List disablePadding>
            {results.map((r, idx) => (
              <Box key={`${r.source}:${r.id}`}>
                {idx > 0 && <Divider />}
                <ListItemButton onClick={() => handleSelect(r)}>
                  <ListItemText
                    primary={r.name}
                    secondary={r.subtitle}
                  />
                </ListItemButton>
              </Box>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  )
}
