import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    primary: {
      main: '#1a3a2a',
      light: '#2d5e42',
      dark: '#0f2218',
      contrastText: '#f5f0e8',
    },
    secondary: {
      main: '#c9a84c',
      light: '#dbbf6e',
      dark: '#a8882e',
      contrastText: '#1a3a2a',
    },
    background: {
      default: '#f5f0e8',
      paper: '#ffffff',
    },
    text: {
      primary: '#1a2e1a',
      secondary: '#4a5e4a',
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
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 4,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a3a2a',
        },
      },
    },
  },
})

export default theme
