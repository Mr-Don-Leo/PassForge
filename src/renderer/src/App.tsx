import { useCallback, useEffect, useState } from 'react'
import { Box, CircularProgress } from '@mui/material'
import { api, type AppState } from './api'
import Onboarding from './screens/Onboarding'
import Lock from './screens/Lock'
import VaultScreen from './screens/Vault'

export default function App(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null)

  const refresh = useCallback(async () => {
    setState(await api.getState())
  }, [])

  useEffect(() => {
    refresh()
    // The main process locks on OS/app events (sleep, screen-lock, minimize).
    const unsubscribe = api.onLocked(() => refresh())
    return unsubscribe
  }, [refresh])

  if (!state) {
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!state.hasVault) return <Onboarding state={state} onDone={refresh} />
  if (!state.unlocked) return <Lock state={state} onUnlocked={refresh} />
  return <VaultScreen state={state} onLock={refresh} onStateChange={refresh} />
}
