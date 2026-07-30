import { useEffect, useState } from 'react'
import { Alert, Box, Button, Divider, Paper, Stack, Typography } from '@mui/material'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import FingerprintIcon from '@mui/icons-material/Fingerprint'
import { api, type AppState } from '../api'
import PasscodeInput from '../components/PasscodeInput'

interface Props {
  state: AppState
  onUnlocked: () => void
}

function useCountdown(until: number): number {
  const [remaining, setRemaining] = useState(Math.max(0, until - Date.now()))
  useEffect(() => {
    setRemaining(Math.max(0, until - Date.now()))
    const id = setInterval(() => setRemaining(Math.max(0, until - Date.now())), 500)
    return () => clearInterval(id)
  }, [until])
  return remaining
}

export default function Lock({ state, onUnlocked }: Props): JSX.Element {
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [lockedUntil, setLockedUntil] = useState(state.lockedUntil)
  const [busy, setBusy] = useState(false)
  const remaining = useCountdown(lockedUntil)
  const locked = remaining > 0

  const submit = async (code: string): Promise<void> => {
    if (locked || busy) return
    setBusy(true)
    const res = await api.unlockPasscode(code)
    setBusy(false)
    if (res.ok) {
      onUnlocked()
      return
    }
    setError(res.error)
    setPasscode('')
    if (res.lockedUntil) setLockedUntil(res.lockedUntil)
  }

  const biometric = async (): Promise<void> => {
    setBusy(true)
    const res = await api.unlockBiometric()
    setBusy(false)
    if (res.ok) onUnlocked()
    else setError(res.error)
  }

  const secs = Math.ceil(remaining / 1000)
  const wait = secs >= 60 ? `${Math.ceil(secs / 60)} min` : `${secs}s`

  return (
    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 3 }}>
      <Paper elevation={0} sx={{ p: 5, width: 420, maxWidth: '100%', border: '1px solid', borderColor: 'divider' }}>
        <Stack spacing={3} alignItems="center">
          <LockOutlinedIcon color="primary" sx={{ fontSize: 40 }} />
          <Typography variant="h6">Unlock PassForge</Typography>

          {error && (
            <Alert severity="error" sx={{ width: '100%' }}>
              {error}
            </Alert>
          )}

          {locked ? (
            <Alert severity="warning" sx={{ width: '100%' }}>
              Too many attempts. Try again in {wait}.
            </Alert>
          ) : (
            <PasscodeInput value={passcode} autoFocus disabled={busy} onChange={setPasscode} onComplete={submit} />
          )}

          {state.biometricEnrolled && state.biometricAvailable && (
            <>
              <Divider flexItem sx={{ '&::before, &::after': { borderColor: 'divider' } }}>
                <Typography variant="caption" color="text.secondary">
                  or
                </Typography>
              </Divider>
              <Button startIcon={<FingerprintIcon />} onClick={biometric} disabled={busy}>
                Unlock with biometric
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  )
}
