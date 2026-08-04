import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Avatar,
  Box,
  Chip,
  Fab,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import VpnKeyRoundedIcon from '@mui/icons-material/VpnKeyRounded'
import KeyRoundedIcon from '@mui/icons-material/KeyRounded'
import PasswordRoundedIcon from '@mui/icons-material/PasswordRounded'
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import GitHubIcon from '@mui/icons-material/GitHub'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded'
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded'
import { api, categoryById, type AppState, type Category, type ImportResult, type ItemType, type VaultEntry } from '../api'
import { analyze } from '../health'
import { CategoryIcon } from '../categories'
import { useColorMode } from '../ColorMode'
import EntryDialog from '../components/EntryDialog'
import SettingsDialog from '../components/SettingsDialog'
import CategoryManager from '../components/CategoryManager'
import HealthDashboard from '../components/HealthDashboard'
import ImportDialog from '../components/ImportDialog'

interface Props {
  state: AppState
  onLock: () => void
  onStateChange: () => void
}

const SIDEBAR_WIDTH = 232
const SECONDARY_MAX_CHARS = 28

function truncate(text: string, max = SECONDARY_MAX_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export default function VaultScreen({ state, onLock, onStateChange }: Props): JSX.Element {
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string>('all')
  const [editing, setEditing] = useState<VaultEntry | null>(null)
  const [newType, setNewType] = useState<ItemType>('password')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [addAnchor, setAddAnchor] = useState<null | HTMLElement>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [toast, setToast] = useState('')
  const { resolved, toggle } = useColorMode()
  const isMac = state.platform === 'darwin'
  const showHealth = selected === 'health'

  const load = useCallback(async () => {
    const [e, c] = await Promise.all([api.listEntries(), api.listCategories()])
    if (e.ok) setEntries(e.value)
    if (c.ok) setCategories(c.value)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of entries) c[e.category] = (c[e.category] || 0) + 1
    return c
  }, [entries])

  const visibleCategories = useMemo(() => categories.filter((c) => !c.hidden), [categories])
  const favoritesCount = useMemo(() => entries.filter((e) => e.favorite).length, [entries])
  const healthIssues = useMemo(() => analyze(entries, Date.now()).issueCount, [entries])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = entries
    if (selected === 'favorites') list = list.filter((e) => e.favorite)
    else if (selected !== 'all') list = list.filter((e) => e.category === selected)
    if (q)
      list = list.filter((e) =>
        `${e.title} ${e.username} ${e.clientId} ${e.url}`.toLowerCase().includes(q)
      )
    return [...list].sort((a, b) => a.title.localeCompare(b.title))
  }, [entries, query, selected])

  const copy = async (text: string, label: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
    setToast(`${label} copied`)
  }

  const openNew = (type: ItemType): void => {
    setEditing(null)
    setNewType(type)
    setAddAnchor(null)
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

  const lock = useCallback(async (): Promise<void> => {
    await api.lock()
    onLock()
  }, [onLock])

  const toggleFavorite = async (id: string): Promise<void> => {
    await api.toggleFavorite(id)
    load()
  }

  const requestImport = async (): Promise<void> => {
    setSettingsOpen(false)
    const res = await api.importOpen()
    if (res.ok && res.value) setImportResult(res.value)
    else if (!res.ok) setToast(res.error)
  }

  // Opens in the user's browser via the main-process window-open handler.
  const openGitHub = (): void => {
    window.open('https://github.com/Mr-Don-Leo/PassForge')
  }

  // Immediate-lock shortcut: Cmd/Ctrl+L.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        lock()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lock])

  // Inactivity auto-lock: reset a timer on user activity.
  useEffect(() => {
    let minutes = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const reset = (): void => {
      if (timer) clearTimeout(timer)
      if (minutes > 0) timer = setTimeout(() => lock(), minutes * 60_000)
    }
    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']
    api.getSettings().then((r) => {
      if (!r.ok) return
      minutes = r.value.inactivityMinutes
      reset()
      events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }))
    })
    return () => {
      if (timer) clearTimeout(timer)
      events.forEach((ev) => window.removeEventListener(ev, reset))
    }
  }, [lock, settingsOpen])

  const emptyMessage =
    entries.length === 0
      ? 'Your vault is empty. Add your first item.'
      : query.trim()
        ? 'No matches.'
        : 'No items in this category.'

  const SidebarRow = ({
    id,
    label,
    color,
    count,
    icon
  }: {
    id: string
    label: string
    color: string
    count: number
    icon: JSX.Element
  }): JSX.Element => {
    const active = selected === id
    return (
      <ListItemButton
        selected={active}
        onClick={() => setSelected(id)}
        sx={{
          mx: 1,
          my: 0.25,
          borderRadius: 2,
          '&.Mui-selected': { bgcolor: alpha(color, 0.16) },
          '&.Mui-selected:hover': { bgcolor: alpha(color, 0.22) }
        }}
      >
        <ListItemIcon sx={{ minWidth: 34, color }}>{icon}</ListItemIcon>
        <ListItemText
          primary={label}
          primaryTypographyProps={{ variant: 'body2', fontWeight: active ? 700 : 500 }}
        />
        {count > 0 && (
          <Typography variant="caption" color="text.secondary">
            {count}
          </Typography>
        )}
      </ListItemButton>
    )
  }

  const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* macOS: a draggable strip above the header gives the traffic lights their
          own space instead of pushing the logo/title sideways. */}
      {isMac && <Box style={dragStyle} sx={{ height: 30, flexShrink: 0 }} />}
      <Toolbar
        style={dragStyle}
        sx={{ gap: 1, borderBottom: '1px solid', borderColor: 'divider', pl: 2, minHeight: 56 }}
      >
        <VpnKeyRoundedIcon color="primary" />
        <Typography variant="h6" sx={{ mr: 2 }}>
          PassForge
        </Typography>
        <TextField
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={noDragStyle}
          sx={{ flexGrow: 1, maxWidth: 420 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon fontSize="small" />
              </InputAdornment>
            )
          }}
        />
        <Box sx={{ flexGrow: 1 }} />
        <Box style={noDragStyle}>
          <Tooltip title={resolved === 'dark' ? 'Light mode' : 'Dark mode'}>
            <IconButton onClick={toggle}>
              {resolved === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Settings">
            <IconButton onClick={() => setSettingsOpen(true)}>
              <SettingsRoundedIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Lock vault">
            <IconButton onClick={lock}>
              <LockRoundedIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>

      <Box sx={{ flexGrow: 1, display: 'flex', minHeight: 0 }}>
        {/* Category sidebar */}
        <Box
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            borderRight: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <Box sx={{ flexGrow: 1, overflowY: 'auto', py: 1 }}>
            <List dense disablePadding>
            <SidebarRow
              id="all"
              label="All Items"
              color={resolved === 'dark' ? '#7c9cff' : '#3b5bdb'}
              count={entries.length}
              icon={<Inventory2RoundedIcon fontSize="small" />}
            />
            <SidebarRow
              id="favorites"
              label="Favorites"
              color="#f5b301"
              count={favoritesCount}
              icon={<StarRoundedIcon fontSize="small" />}
            />
            <SidebarRow
              id="health"
              label="Password Health"
              color={healthIssues > 0 ? '#ff922b' : '#2fbf87'}
              count={healthIssues}
              icon={<ShieldRoundedIcon fontSize="small" />}
            />
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ px: 2.5, pt: 1.5, pb: 0.5 }}
            >
              <Typography variant="overline" color="text.secondary">
                Categories
              </Typography>
              <Tooltip title="Manage categories">
                <IconButton size="small" onClick={() => setManagerOpen(true)}>
                  <TuneRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            {visibleCategories.map((c) => (
              <SidebarRow
                key={c.id}
                id={c.id}
                label={c.label}
                color={c.color}
                count={counts[c.id] || 0}
                icon={<CategoryIcon icon={c.icon} fontSize="small" />}
              />
            ))}
            </List>
          </Box>

          {/* Subtle attribution — links to the repo in the user's browser. */}
          <Tooltip title="View PassForge on GitHub" placement="top">
            <Box
              onClick={openGitHub}
              sx={{
                borderTop: '1px solid',
                borderColor: 'divider',
                px: 2,
                py: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                cursor: 'pointer',
                color: 'text.disabled',
                transition: 'color 120ms',
                '&:hover': { color: 'text.secondary' }
              }}
            >
              <GitHubIcon sx={{ fontSize: 15 }} />
              <Typography variant="caption" noWrap>
                Mr-Don-Leo
              </Typography>
            </Box>
          </Tooltip>
        </Box>

        {/* Main pane */}
        <Box sx={{ flexGrow: 1, overflowY: 'auto', position: 'relative' }}>
          {showHealth ? (
            <HealthDashboard
              entries={entries}
              onOpenEntry={(e) => {
                setSelected('all')
                openEdit(e)
              }}
            />
          ) : filtered.length === 0 ? (
            <Stack sx={{ height: '100%', minHeight: 320 }} alignItems="center" justifyContent="center" spacing={1.5}>
              <VpnKeyRoundedIcon sx={{ fontSize: 52, color: 'text.disabled' }} />
              <Typography color="text.secondary">{emptyMessage}</Typography>
            </Stack>
          ) : (
            <List sx={{ maxWidth: 720, mx: 'auto', p: 2 }}>
              {filtered.map((entry) => {
                const cat = categoryById(categories, entry.category)
                const isSecret = entry.type === 'secret'
                const primary = isSecret ? entry.secret : entry.password
                const secondary = isSecret ? entry.clientId : entry.username
                return (
                  <ListItem
                    key={entry.id}
                    disablePadding
                    sx={{ mb: 1 }}
                    secondaryAction={
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title={entry.favorite ? 'Unfavorite' : 'Favorite'}>
                          <IconButton size="small" onClick={() => toggleFavorite(entry.id)}>
                            {entry.favorite ? (
                              <StarRoundedIcon fontSize="small" sx={{ color: '#f5b301' }} />
                            ) : (
                              <StarBorderRoundedIcon fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={isSecret ? 'Copy Client ID' : 'Copy username'}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={!secondary}
                              onClick={() => copy(secondary, isSecret ? 'Client ID' : 'Username')}
                            >
                              <ContentCopyRoundedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={isSecret ? 'Copy secret' : 'Copy password'}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={!primary}
                              onClick={() => copy(primary, isSecret ? 'Secret' : 'Password')}
                            >
                              <KeyRoundedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => remove(entry.id)}>
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    }
                  >
                    <ListItemButton
                      onClick={() => openEdit(entry)}
                      sx={{ borderRadius: 2.5, border: '1px solid', borderColor: 'divider', pr: 18, py: 1.25 }}
                    >
                      <ListItemIcon sx={{ minWidth: 52 }}>
                        <Avatar
                          variant="rounded"
                          sx={{ bgcolor: alpha(cat.color, 0.16), color: cat.color, width: 40, height: 40 }}
                        >
                          <CategoryIcon icon={cat.icon} fontSize="small" />
                        </Avatar>
                      </ListItemIcon>
                      <ListItemText
                        primary={entry.title}
                        primaryTypographyProps={{ fontWeight: 600 }}
                        secondary={
                          <Stack direction="row" spacing={0.75} alignItems="center" component="span" sx={{ mt: 0.25 }}>
                            <Chip
                              size="small"
                              label={cat.label}
                              sx={{
                                height: 20,
                                bgcolor: alpha(cat.color, 0.16),
                                color: cat.color,
                                fontWeight: 600,
                                '& .MuiChip-label': { px: 1 }
                              }}
                            />
                            {isSecret && (
                              <Chip
                                size="small"
                                label="Secret"
                                variant="outlined"
                                sx={{ height: 20, '& .MuiChip-label': { px: 1 } }}
                              />
                            )}
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              component="span"
                              noWrap
                              sx={{ minWidth: 0 }}
                            >
                              {secondary ? truncate(secondary) : '—'}
                            </Typography>
                          </Stack>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                )
              })}
            </List>
          )}

          {!showHealth && (
            <>
              <Fab
                color="primary"
                onClick={(e) => setAddAnchor(e.currentTarget)}
                sx={{ position: 'absolute', right: 28, bottom: 28 }}
              >
                <AddRoundedIcon />
              </Fab>
              <Menu
                anchorEl={addAnchor}
                open={Boolean(addAnchor)}
                onClose={() => setAddAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              >
                <MenuItem onClick={() => openNew('password')}>
                  <ListItemIcon>
                    <PasswordRoundedIcon fontSize="small" />
                  </ListItemIcon>
                  Password
                </MenuItem>
                <MenuItem onClick={() => openNew('secret')}>
                  <ListItemIcon>
                    <KeyRoundedIcon fontSize="small" />
                  </ListItemIcon>
                  Secret / API key
                </MenuItem>
              </Menu>
            </>
          )}
        </Box>
      </Box>

      <EntryDialog
        open={dialogOpen}
        entry={editing}
        type={newType}
        categories={categories}
        defaultCategory={selected !== 'all' ? selected : undefined}
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
        onRequestImport={requestImport}
      />
      {importResult && (
        <ImportDialog
          result={importResult}
          categories={categories}
          onClose={() => setImportResult(null)}
          onImported={(added, skipped) => {
            setImportResult(null)
            setToast(`Imported ${added} item${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}`)
            load()
          }}
        />
      )}
      <CategoryManager
        open={managerOpen}
        categories={categories}
        onClose={() => setManagerOpen(false)}
        onChanged={() => {
          setSelected('all')
          load()
        }}
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
