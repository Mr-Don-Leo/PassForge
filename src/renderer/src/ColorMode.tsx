import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { getTheme, type Mode } from './theme'

export type ThemePref = Mode | 'system'

interface ColorModeCtx {
  pref: ThemePref
  resolved: Mode
  setPref: (p: ThemePref) => void
  toggle: () => void
}

const Ctx = createContext<ColorModeCtx | null>(null)
const STORAGE_KEY = 'passforge-theme'

export function useColorMode(): ColorModeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useColorMode must be used within ColorModeProvider')
  return ctx
}

function systemMode(): Mode {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ColorModeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [pref, setPrefState] = useState<ThemePref>(
    () => (localStorage.getItem(STORAGE_KEY) as ThemePref) || 'system'
  )
  const [sys, setSys] = useState<Mode>(systemMode)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => setSys(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved: Mode = pref === 'system' ? sys : pref
  const theme = useMemo(() => getTheme(resolved), [resolved])

  const value = useMemo<ColorModeCtx>(
    () => ({
      pref,
      resolved,
      setPref: (p) => {
        setPrefState(p)
        localStorage.setItem(STORAGE_KEY, p)
      },
      toggle: () => {
        const next: ThemePref = resolved === 'dark' ? 'light' : 'dark'
        setPrefState(next)
        localStorage.setItem(STORAGE_KEY, next)
      }
    }),
    [pref, resolved]
  )

  return (
    <Ctx.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </Ctx.Provider>
  )
}
