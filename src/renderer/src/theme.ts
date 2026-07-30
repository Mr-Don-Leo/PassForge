import { createTheme, type Theme, type ThemeOptions } from '@mui/material/styles'

export type Mode = 'light' | 'dark'

/** Shared, mode-independent design tokens. */
const base: ThemeOptions = {
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h4: { fontWeight: 700, letterSpacing: -0.6 },
    h6: { fontWeight: 700, letterSpacing: -0.2 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 }
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 12 } } },
    MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
    MuiTooltip: { defaultProps: { arrow: true } }
  }
}

/** Minimalist Material theme in a light or dark colourway. */
export function getTheme(mode: Mode): Theme {
  const dark = mode === 'dark'
  return createTheme({
    ...base,
    palette: {
      mode,
      primary: { main: dark ? '#7c9cff' : '#3b5bdb' },
      secondary: { main: dark ? '#67e8c3' : '#0ca678' },
      success: { main: dark ? '#67e8c3' : '#0ca678' },
      error: { main: dark ? '#ff6b6b' : '#e03131' },
      divider: dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
      background: dark
        ? { default: '#0e1116', paper: '#161b22' }
        : { default: '#f4f6fb', paper: '#ffffff' },
      text: dark
        ? { primary: '#e6edf3', secondary: '#9aa4b2' }
        : { primary: '#1f2430', secondary: '#5b6472' }
    }
  })
}
