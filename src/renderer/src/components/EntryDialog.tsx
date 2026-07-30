import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import TuneIcon from '@mui/icons-material/Tune'
import { api, CATEGORIES, DEFAULT_CATEGORY, type PasswordOptions, type VaultEntry } from '../api'
import { CategoryIcon } from '../categories'

type Draft = Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

const EMPTY: Draft = { title: '', username: '', password: '', url: '', notes: '', category: DEFAULT_CATEGORY }

interface Props {
  open: boolean
  entry: VaultEntry | null
  defaultCategory?: string
  onClose: () => void
  onSaved: () => void
}

export default function EntryDialog({ open, entry, defaultCategory, onClose, onSaved }: Props): JSX.Element {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [show, setShow] = useState(false)
  const [showGen, setShowGen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [opts, setOpts] = useState<PasswordOptions>({
    length: 20,
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true
  })

  useEffect(() => {
    if (open) {
      setDraft(entry ? { ...entry } : { ...EMPTY, category: defaultCategory || DEFAULT_CATEGORY })
      setShow(false)
      setShowGen(false)
    }
  }, [open, entry, defaultCategory])

  const set = (k: keyof Draft, v: string): void => setDraft((d) => ({ ...d, [k]: v }))

  const generate = async (): Promise<void> => {
    const res = await api.generatePassword(opts)
    if (res.ok) set('password', res.value)
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    const res = await api.saveEntry(draft)
    setBusy(false)
    if (res.ok) onSaved()
  }

  const charsets: (keyof PasswordOptions)[] = ['lowercase', 'uppercase', 'numbers', 'symbols']

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{entry ? 'Edit item' : 'New item'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Title" value={draft.title} autoFocus onChange={(e) => set('title', e.target.value)} />
          <TextField
            select
            label="Category"
            value={draft.category}
            onChange={(e) => set('category', e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CategoryIcon id={c.id} fontSize="small" sx={{ color: c.color }} />
                  <span>{c.label}</span>
                </Stack>
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Username or email" value={draft.username} onChange={(e) => set('username', e.target.value)} />
          <TextField
            label="Password"
            type={show ? 'text' : 'password'}
            value={draft.password}
            onChange={(e) => set('password', e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Generator">
                    <IconButton edge="end" onClick={() => setShowGen((s) => !s)} size="small">
                      <TuneIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Generate">
                    <IconButton edge="end" onClick={generate} size="small">
                      <AutorenewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <IconButton edge="end" onClick={() => setShow((s) => !s)} size="small">
                    {show ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          <Collapse in={showGen}>
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider' }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="body2" sx={{ minWidth: 56 }}>
                    Length
                  </Typography>
                  <Slider
                    min={8}
                    max={64}
                    value={opts.length}
                    onChange={(_, v) => setOpts((o) => ({ ...o, length: v as number }))}
                    valueLabelDisplay="auto"
                  />
                </Stack>
                <ToggleButtonGroup
                  size="small"
                  value={charsets.filter((c) => opts[c])}
                  onChange={(_, next: string[]) =>
                    setOpts((o) => ({
                      ...o,
                      lowercase: next.includes('lowercase'),
                      uppercase: next.includes('uppercase'),
                      numbers: next.includes('numbers'),
                      symbols: next.includes('symbols')
                    }))
                  }
                >
                  <ToggleButton value="lowercase">a-z</ToggleButton>
                  <ToggleButton value="uppercase">A-Z</ToggleButton>
                  <ToggleButton value="numbers">0-9</ToggleButton>
                  <ToggleButton value="symbols">!@#</ToggleButton>
                </ToggleButtonGroup>
                <Button startIcon={<AutorenewIcon />} onClick={generate} variant="outlined" size="small">
                  Generate password
                </Button>
              </Stack>
            </Box>
          </Collapse>

          <TextField label="Website" value={draft.url} onChange={(e) => set('url', e.target.value)} />
          <TextField label="Notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !draft.title.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
