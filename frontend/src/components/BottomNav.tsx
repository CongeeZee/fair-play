import { Paper, BottomNavigation, BottomNavigationAction } from '@mui/material'
import GolfCourseIcon from '@mui/icons-material/GolfCourse'
import HistoryIcon from '@mui/icons-material/History'
import BarChartIcon from '@mui/icons-material/BarChart'
import { useLocation, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { label: 'Courses', to: '/courses', icon: <GolfCourseIcon /> },
  { label: 'History', to: '/history', icon: <HistoryIcon /> },
  { label: 'Stats', to: '/stats', icon: <BarChartIcon /> },
]

export default function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const currentValue = NAV_ITEMS.findIndex((item) => pathname.startsWith(item.to))

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1200,
        display: { xs: 'block', md: 'none' },
        borderTop: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <BottomNavigation
        value={currentValue === -1 ? false : currentValue}
        onChange={(_, newValue) => {
          navigate(NAV_ITEMS[newValue].to)
        }}
        sx={{
          bgcolor: '#1a3a2a',
          height: 60,
          '& .MuiBottomNavigationAction-root': {
            color: 'rgba(255,255,255,0.5)',
            minWidth: 0,
            '&.Mui-selected': {
              color: '#c9a84c',
            },
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: '0.7rem',
            fontWeight: 600,
            '&.Mui-selected': {
              fontSize: '0.72rem',
            },
          },
        }}
      >
        {NAV_ITEMS.map((item) => (
          <BottomNavigationAction
            key={item.to}
            label={item.label}
            icon={item.icon}
          />
        ))}
      </BottomNavigation>
    </Paper>
  )
}
