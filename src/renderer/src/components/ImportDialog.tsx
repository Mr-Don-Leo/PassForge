import { useState } from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import { api, DEFAULT_CATEGORY, type Category, type ImportResult } from '../api'
import { CategoryIcon } from '../categories'

interface Props {
  result: ImportResult
  categories: Category[]
  onClose: () => void
  onImported: (added: number, skipped: number) => void
}

export default function ImportDialog({ result, categories, onClose, onImported }: Props): JSX.Element {
  const [category, setCategory] = useState(DEFAULT_CATEGORY)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const doImport = async (): Promise<void> => {
    setBusy(true)
    setError('')
    const res = await api.importEntries(result.entries, category, skipDuplicates)
    setBusy(false)
    if (res.ok) onImported(res.value.added, res.value.skipped)
    else setError(res.error)
  }

  const catOptions = categories.filter((c) => !c.hidden)

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Import passwords</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Alert severity="info" variant="outlined">
            Detected <strong>{result.formatLabel}</strong> — {result.entries.length} item
            {result.entries.length === 1 ? '' : 's'}. Parsed on your device; nothing is uploaded.
          </Alert>

          <TextField select label="Import into category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {catOptions.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CategoryIcon icon={c.icon} fontSize="small" sx={{ color: c.color }} />
                  <span>{c.label}</span>
                </Stack>
              </MenuItem>
            ))}
          </TextField>

          <FormControlLabel
            control={<Switch checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />}
            label={<Typography variant="body2">Skip items already in the vault</Typography>}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={doImport} disabled={busy || result.entries.length === 0}>
          {busy ? 'Importing…' : `Import ${result.entries.length}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
