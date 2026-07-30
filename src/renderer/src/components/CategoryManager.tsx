import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import { alpha } from '@mui/material/styles'
import { api, CATEGORY_ICON_IDS, type Category } from '../api'
import { CategoryIcon } from '../categories'

const COLORS = [
  '#5b8def',
  '#22b8cf',
  '#2fbf87',
  '#a3e635',
  '#f0a13a',
  '#ef6f6c',
  '#e0669a',
  '#8b5cf6',
  '#38bdf8',
  '#f472b6',
  '#f59f00',
  '#94a3b8'
]

interface Draft {
  id?: string
  label: string
  icon: string
  color: string
}

interface Props {
  open: boolean
  categories: Category[]
  onClose: () => void
  onChanged: () => void
}

export default function CategoryManager({ open, categories, onClose, onChanged }: Props): JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  const startNew = (): void => {
    setError('')
    setDraft({ label: '', icon: 'other', color: COLORS[0] })
  }
  const startEdit = (c: Category): void => {
    setError('')
    setDraft({ id: c.id, label: c.label, icon: c.icon, color: c.color })
  }

  const saveDraft = async (): Promise<void> => {
    if (!draft) return
    const res = await api.saveCategory(draft)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setDraft(null)
    onChanged()
  }

  const toggleHidden = async (c: Category): Promise<void> => {
    const res = await api.setCategoryHidden(c.id, !c.hidden)
    if (!res.ok) setError(res.error)
    else onChanged()
  }

  const remove = async (c: Category): Promise<void> => {
    if (!window.confirm(`Delete "${c.label}"? Items in it move to "Other".`)) return
    const res = await api.deleteCategory(c.id)
    if (!res.ok) setError(res.error)
    else onChanged()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Categories</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {draft ? (
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={draft.label}
              autoFocus
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />

            <Box>
              <Typography variant="caption" color="text.secondary">
                Icon
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                {CATEGORY_ICON_IDS.map((icon) => {
                  const active = draft.icon === icon
                  return (
                    <IconButton
                      key={icon}
                      onClick={() => setDraft({ ...draft, icon })}
                      sx={{
                        border: '1px solid',
                        borderColor: active ? draft.color : 'divider',
                        bgcolor: active ? alpha(draft.color, 0.16) : 'transparent',
                        color: active ? draft.color : 'text.secondary',
                        borderRadius: 2
                      }}
                    >
                      <CategoryIcon icon={icon} fontSize="small" />
                    </IconButton>
                  )
                })}
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                Color
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                {COLORS.map((color) => (
                  <Box
                    key={color}
                    onClick={() => setDraft({ ...draft, color })}
                    sx={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      bgcolor: color,
                      cursor: 'pointer',
                      outline: draft.color === color ? '2px solid' : 'none',
                      outlineColor: 'text.primary',
                      outlineOffset: 2
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Stack>
        ) : (
          <List dense disablePadding>
            {categories.map((c) => (
              <ListItem
                key={c.id}
                disableGutters
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title={c.hidden ? 'Show' : 'Hide'}>
                      <IconButton size="small" onClick={() => toggleHidden(c)}>
                        {c.hidden ? (
                          <VisibilityOffRoundedIcon fontSize="small" />
                        ) : (
                          <VisibilityRoundedIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => startEdit(c)}>
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {c.locked ? (
                      <Tooltip title="Protected category">
                        <span>
                          <IconButton size="small" disabled>
                            <LockRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => remove(c)}>
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                }
              >
                <ListItemIcon sx={{ minWidth: 38, color: c.color, opacity: c.hidden ? 0.4 : 1 }}>
                  <CategoryIcon icon={c.icon} fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={c.label}
                  primaryTypographyProps={{ sx: { opacity: c.hidden ? 0.5 : 1 } }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {draft ? (
          <>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="contained" onClick={saveDraft} disabled={!draft.label.trim()}>
              Save
            </Button>
          </>
        ) : (
          <>
            <Button startIcon={<AddRoundedIcon />} onClick={startNew} sx={{ mr: 'auto' }}>
              New category
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
