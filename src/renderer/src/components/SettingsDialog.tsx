import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded'
import { api, DEFAULT_SETTINGS, type AppState, type AppSettings } from '../api'
import { useColorMode, type ThemePref } from '../ColorMode'
import PasscodeInput from './PasscodeInput'

interface Props {
  open: boolean
  state: AppState
  onClose: () => void
  onChange: () => void
  onRequestImport: () => void
}

const INACTIVITY_OPTIONS = [
  { v: 0, label: 'Never' },
  { v: 1, label: '1 minute' },
  { v: 5, label: '5 minutes' },
  { v: 15, label: '15 minutes' },
  { v: 30, label: '30 minutes' },
  { v: 60, label: '1 hour' }
]

export default function SettingsDialog({ open, state, onClose, onChange, onRequestImport }: Props): JSX.Element {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [prefs, setPrefs] = useState<AppSettings>(DEFAULT_SETTINGS)
  const { pref, setPref } = useColorMode()

  useEffect(() => {
    if (open) {
      api.getSettings().then((r) => {
        if (r.ok) setPrefs(r.value)
      })
    }
  }, [open])

  const updatePrefs = async (patch: Partial<AppSettings>): Promise<void> => {
    const optimistic = { ...prefs, ...patch }
    setPrefs(optimistic)
    const r = await api.setSettings(patch)
    if (r.ok) setPrefs(r.value)
  }

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
              Appearance
            </Typography>
            <ToggleButtonGroup size="small" exclusive value={pref} onChange={(_, v: ThemePref | null) => v && setPref(v)}>
              <ToggleButton value="light">Light</ToggleButton>
              <ToggleButton value="dark">Dark</ToggleButton>
              <ToggleButton value="system">System</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Auto-lock
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 1.5 }}>
              <TextField
                select
                size="small"
                label="After inactivity"
                value={prefs.inactivityMinutes}
                onChange={(e) => updatePrefs({ inactivityMinutes: Number(e.target.value) })}
              >
                {INACTIVITY_OPTIONS.map((o) => (
                  <MenuItem key={o.v} value={o.v}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={<Switch checked={prefs.onSleep} onChange={(e) => updatePrefs({ onSleep: e.target.checked })} />}
                label={<Typography variant="body2">When the computer sleeps</Typography>}
              />
              <FormControlLabel
                control={<Switch checked={prefs.onScreenLock} onChange={(e) => updatePrefs({ onScreenLock: e.target.checked })} />}
                label={<Typography variant="body2">When the screen locks or user switches</Typography>}
              />
              <FormControlLabel
                control={<Switch checked={prefs.onMinimize} onChange={(e) => updatePrefs({ onMinimize: e.target.checked })} />}
                label={<Typography variant="body2">When the app is minimized</Typography>}
              />
              <Typography variant="caption" color="text.secondary">
                The vault always locks on quit. Press ⌘/Ctrl+L to lock instantly.
              </Typography>
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Autofill (auto-type)
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={prefs.autotypeEnabled}
                    onChange={(e) => updatePrefs({ autotypeEnabled: e.target.checked })}
                  />
                }
                label={<Typography variant="body2">Enable autofill</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={prefs.autotypeSubmit}
                    disabled={!prefs.autotypeEnabled}
                    onChange={(e) => updatePrefs({ autotypeSubmit: e.target.checked })}
                  />
                }
                label={<Typography variant="body2">Press Enter after filling</Typography>}
              />
              <Typography variant="caption" color="text.secondary">
                Focus a login form in any app or browser, then press ⌘/Ctrl+Shift+U. PassForge matches
                the window against your entries (by website and title) and types username, Tab, password.
                You can also click the ✦ autofill button on an entry. macOS asks for Accessibility
                access on first use; Linux needs xdotool (X11).
              </Typography>
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Import
            </Typography>
            <Button variant="outlined" startIcon={<FileUploadRoundedIcon />} onClick={onRequestImport}>
              Import from another app
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Bitwarden, 1Password, KeePass, Chrome, Firefox, Safari, or a generic CSV. Parsed locally.
            </Typography>
          </Box>

          <Divider />

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
              <Button variant="contained" disabled={current.length !== 6 || next.length !== 6} onClick={changePasscode}>
                Update passcode
              </Button>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
