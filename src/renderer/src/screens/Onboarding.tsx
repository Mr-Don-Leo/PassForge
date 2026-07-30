import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Fade,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography
} from '@mui/material'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import FingerprintIcon from '@mui/icons-material/Fingerprint'
import { api, type AppState } from '../api'
import PasscodeInput from '../components/PasscodeInput'

interface Props {
  state: AppState
  onDone: () => void
}

export default function Onboarding({ state, onDone }: Props): JSX.Element {
  const [step, setStep] = useState<'intro' | 'set' | 'confirm'>('intro')
  const [passcode, setPasscode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [enrollBiometric, setEnrollBiometric] = useState(state.biometricAvailable)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // `confirmValue` comes from the input's onComplete so we compare the just-typed
  // value rather than the React state, which may not have flushed yet.
  const create = async (confirmValue: string = confirm): Promise<void> => {
    if (passcode !== confirmValue) {
      setError('The passcodes do not match.')
      setConfirm('')
      return
    }
    setBusy(true)
    setError('')
    const res = await api.setup({ passcode, enrollBiometric })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      setStep('set')
      setPasscode('')
      setConfirm('')
      return
    }
    onDone()
  }

  return (
    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 3 }}>
      <Paper elevation={0} sx={{ p: 5, width: 440, maxWidth: '100%', border: '1px solid', borderColor: 'divider' }}>
        <Stack spacing={3} alignItems="center">
          <ShieldOutlinedIcon color="primary" sx={{ fontSize: 44 }} />
          <Box textAlign="center">
            <Typography variant="h4">PassForge</Typography>
            <Typography variant="body2" color="text.secondary">
              A local-first, encrypted password vault.
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ width: '100%' }}>
              {error}
            </Alert>
          )}

          {step === 'intro' && (
            <Fade in>
              <Stack spacing={2} sx={{ width: '100%' }}>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Your vault is protected by a 6-digit passcode
                  {state.biometricAvailable ? ' and your device biometric.' : '.'} Everything is encrypted
                  and stored only on this device.
                </Typography>
                <Button variant="contained" size="large" onClick={() => setStep('set')}>
                  Get started
                </Button>
              </Stack>
            </Fade>
          )}

          {step === 'set' && (
            <Fade in>
              <Stack spacing={3} sx={{ width: '100%' }} alignItems="center">
                <Typography variant="subtitle1">Choose a 6-digit passcode</Typography>
                <PasscodeInput
                  value={passcode}
                  autoFocus
                  onChange={setPasscode}
                  onComplete={() => setStep('confirm')}
                />
                <Button disabled={passcode.length !== 6} onClick={() => setStep('confirm')}>
                  Next
                </Button>
              </Stack>
            </Fade>
          )}

          {step === 'confirm' && (
            <Fade in>
              <Stack spacing={3} sx={{ width: '100%' }} alignItems="center">
                <Typography variant="subtitle1">Confirm your passcode</Typography>
                <PasscodeInput value={confirm} autoFocus onChange={setConfirm} onComplete={(v) => create(v)} />

                {state.biometricAvailable && (
                  <FormControlLabel
                    control={
                      <Switch checked={enrollBiometric} onChange={(e) => setEnrollBiometric(e.target.checked)} />
                    }
                    label={
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <FingerprintIcon fontSize="small" />
                        <Typography variant="body2">Enable biometric unlock</Typography>
                      </Stack>
                    }
                  />
                )}

                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={confirm.length !== 6 || busy}
                  onClick={() => create()}
                >
                  {busy ? 'Creating vault…' : 'Create vault'}
                </Button>
              </Stack>
            </Fade>
          )}
        </Stack>
      </Paper>
    </Box>
  )
}
