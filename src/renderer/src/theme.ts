import { createTheme } from '@mui/material/styles'

/** Minimalist Material Design theme — dark, calm, single accent. */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#7c9cff' },
    secondary: { main: '#67e8c3' },
    background: { default: '#0e1116', paper: '#161b22' },
    success: { main: '#67e8c3' },
    error: { main: '#ff6b6b' }
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h4: { fontWeight: 600, letterSpacing: -0.5 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 }
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 12 } } },
    MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } }
  }
})
