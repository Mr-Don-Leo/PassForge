import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Avatar,
  Box,
  Chip,
  Fab,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import LockIcon from '@mui/icons-material/Lock'
import SettingsIcon from '@mui/icons-material/Settings'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import KeyIcon from '@mui/icons-material/Key'
import { api, type AppState, type VaultEntry } from '../api'
import EntryDialog from '../components/EntryDialog'
import SettingsDialog from '../components/SettingsDialog'

interface Props {
  state: AppState
  onLock: () => void
  onStateChange: () => void
}

export default function VaultScreen({ state, onLock, onStateChange }: Props): JSX.Element {
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<VaultEntry | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    const res = await api.listEntries()
    if (res.ok) setEntries(res.value)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? entries.filter((e) => `${e.title} ${e.username} ${e.url}`.toLowerCase().includes(q))
      : entries
    return [...list].sort((a, b) => a.title.localeCompare(b.title))
  }, [entries, query])

  const copy = async (text: string, label: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
    setToast(`${label} copied`)
  }

  const openNew = (): void => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (entry: VaultEntry): void => {
    setEditing(entry)
    setDialogOpen(true)
  }

  const remove = async (id: string): Promise<void> => {
    await api.deleteEntry(id)
    load()
  }

  const lock = async (): Promise<void> => {
    await api.lock()
    onLock()
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ gap: 1, borderBottom: '1px solid', borderColor: 'divider', WebkitAppRegion: 'drag' } as never}>
        <KeyIcon color="primary" />
        <Typography variant="h6" sx={{ mr: 2 }}>
          PassForge
        </Typography>
        <TextField
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ flexGrow: 1, maxWidth: 420, WebkitAppRegion: 'no-drag' } as never}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
        />
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ WebkitAppRegion: 'no-drag' } as never}>
          <Tooltip title="Settings">
            <IconButton onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Lock vault">
            <IconButton onClick={lock}>
              <LockIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <Stack sx={{ height: '100%', minHeight: 300 }} alignItems="center" justifyContent="center" spacing={1}>
            <KeyIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography color="text.secondary">
              {entries.length === 0 ? 'Your vault is empty. Add your first item.' : 'No matches.'}
            </Typography>
          </Stack>
        ) : (
          <List sx={{ maxWidth: 780, mx: 'auto', py: 2 }}>
            {filtered.map((entry) => (
              <ListItem
                key={entry.id}
                disablePadding
                sx={{ mb: 1 }}
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Copy username">
                      <span>
                        <IconButton
                          size="small"
                          disabled={!entry.username}
                          onClick={() => copy(entry.username, 'Username')}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Copy password">
                      <span>
                        <IconButton
                          size="small"
                          disabled={!entry.password}
                          onClick={() => copy(entry.password, 'Password')}
                        >
                          <KeyIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => remove(entry.id)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                }
              >
                <ListItemButton
                  onClick={() => openEdit(entry)}
                  sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', pr: 14 }}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'background.default', color: 'primary.main' }}>
                      {(entry.title[0] || '?').toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={entry.title}
                    secondary={
                      <Stack direction="row" spacing={1} alignItems="center" component="span">
                        <span>{entry.username || '—'}</span>
                        {entry.url && <Chip size="small" label={entry.url} variant="outlined" />}
                      </Stack>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      <Fab color="primary" onClick={openNew} sx={{ position: 'absolute', right: 28, bottom: 28 }}>
        <AddIcon />
      </Fab>

      <EntryDialog
        open={dialogOpen}
        entry={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false)
          load()
        }}
      />
      <SettingsDialog
        open={settingsOpen}
        state={state}
        onClose={() => setSettingsOpen(false)}
        onChange={onStateChange}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={1600}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  )
}
