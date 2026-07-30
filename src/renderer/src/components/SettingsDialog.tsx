import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  Typography
} from '@mui/material'
import { api, type AppState } from '../api'
import PasscodeInput from './PasscodeInput'

interface Props {
  open: boolean
  state: AppState
  onClose: () => void
  onChange: () => void
}

export default function SettingsDialog({ open, state, onClose, onChange }: Props): JSX.Element {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const toggleBiometric = async (enabled: boolean): Promise<void> => {
    const res = enabled ? await api.enrollBiometric() : await api.disableBiometric()
    setMsg(res.ok ? { kind: 'success', text: enabled ? 'Biometric enabled.' : 'Biometric disabled.' } : { kind: 'error', text: res.error })
    onChange()
  }

  const changePasscode = async (): Promise<void> => {
    const res = await api.changePasscode(current, next)
    if (res.ok) {
      setMsg({ kind: 'success', text: 'Passcode updated.' })
      setCurrent('')
      setNext('')
    } else {
      setMsg({ kind: 'error', text: res.error })
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {msg && (
            <Alert severity={msg.kind} onClose={() => setMsg(null)}>
              {msg.text}
            </Alert>
          )}

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Biometric unlock
            </Typography>
            {state.biometricAvailable ? (
              <FormControlLabel
                control={<Switch checked={state.biometricEnrolled} onChange={(e) => toggleBiometric(e.target.checked)} />}
                label={state.biometricEnrolled ? 'Enabled' : 'Disabled'}
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Not available on this device.
              </Typography>
            )}
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Change passcode
            </Typography>
            <Stack spacing={2} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Current
              </Typography>
              <PasscodeInput value={current} onChange={setCurrent} />
              <Typography variant="caption" color="text.secondary">
                New
              </Typography>
              <PasscodeInput value={next} onChange={setNext} />
              <Button
                variant="contained"
                disabled={current.length !== 6 || next.length !== 6}
                onClick={changePasscode}
              >
                Update passcode
              </Button>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
