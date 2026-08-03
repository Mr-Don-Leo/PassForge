import { useMemo } from 'react'
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import type { VaultEntry } from '../api'
import { analyze } from '../health'

interface Props {
  entries: VaultEntry[]
  onOpenEntry: (entry: VaultEntry) => void
}

export default function HealthDashboard({ entries, onOpenEntry }: Props): JSX.Element {
  const report = useMemo(() => analyze(entries, Date.now()), [entries])
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])

  const scoreColor = report.score >= 80 ? 'success.main' : report.score >= 50 ? 'warning.main' : 'error.main'

  const Section = ({
    title,
    color,
    groups
  }: {
    title: string
    color: string
    groups: Array<{ ids: string[]; note?: string }>
  }): JSX.Element | null => {
    if (groups.length === 0) return null
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
          <Typography variant="subtitle2">{title}</Typography>
          <Chip size="small" label={groups.length} sx={{ height: 20, bgcolor: alpha('#888', 0.16) }} />
        </Stack>
        <List dense disablePadding>
          {groups.map((g, i) => (
            <ListItemButton
              key={i}
              onClick={() => {
                const first = byId.get(g.ids[0])
                if (first) onOpenEntry(first)
              }}
              sx={{ borderRadius: 2 }}
            >
              <ListItemText
                primary={
                  g.ids.length > 1
                    ? g.ids.map((id) => byId.get(id)?.title || 'Untitled').join(' · ')
                    : byId.get(g.ids[0])?.title || 'Untitled'
                }
                secondary={g.note}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
              />
            </ListItemButton>
          ))}
        </List>
      </Paper>
    )
  }

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', p: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <ShieldRoundedIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>
          Password Health
        </Typography>
      </Stack>

      <Alert
        icon={<LockRoundedIcon fontSize="inherit" />}
        severity="info"
        variant="outlined"
        sx={{ mb: 3, borderRadius: 2 }}
      >
        This analysis runs entirely on your device. Nothing is ever uploaded or shared.
      </Alert>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography variant="h2" fontWeight={800} sx={{ color: scoreColor }}>
            {report.score}
          </Typography>
          <Typography variant="h6" color="text.secondary">
            / 100
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {report.issueCount === 0
              ? 'No issues found'
              : `${report.issueCount} issue${report.issueCount === 1 ? '' : 's'} across ${report.total} items`}
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={report.score}
          sx={{
            mt: 2,
            height: 8,
            borderRadius: 4,
            '& .MuiLinearProgress-bar': { bgcolor: scoreColor }
          }}
        />
      </Paper>

      {report.issueCount === 0 ? (
        <Stack alignItems="center" spacing={1.5} sx={{ py: 6 }}>
          <CheckCircleRoundedIcon sx={{ fontSize: 56, color: 'success.main' }} />
          <Typography color="text.secondary">Your vault looks healthy.</Typography>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Section
            title="Reused passwords"
            color="#ff6b6b"
            groups={report.reused.map((g) => ({ ids: g.entryIds, note: `Used by ${g.entryIds.length} items` }))}
          />
          <Section
            title="Weak passwords"
            color="#ff922b"
            groups={report.weak.map((w) => ({ ids: [w.entryId], note: w.reason }))}
          />
          <Section
            title="Similar passwords"
            color="#fab005"
            groups={report.similar.map((s) => ({ ids: [s.a, s.b], note: 'Nearly identical' }))}
          />
          <Section
            title="Old passwords (365+ days)"
            color="#fab005"
            groups={report.old.map((id) => ({ ids: [id] }))}
          />
          <Section
            title="Missing username or URL"
            color="#868e96"
            groups={report.missing.map((m) => ({ ids: [m.entryId], note: `Missing ${m.missing.join(' & ')}` }))}
          />
          <Section
            title="Possible duplicates"
            color="#868e96"
            groups={report.duplicates.map((d) => ({ ids: d.entryIds, note: `${d.entryIds.length} matching items` }))}
          />
          <Section
            title="Expired API keys / secrets"
            color="#ff6b6b"
            groups={report.secretsExpired.map((id) => ({ ids: [id], note: 'Past its expiry date' }))}
          />
          <Section
            title="Secrets expiring soon"
            color="#ff922b"
            groups={report.secretsDueSoon.map((id) => ({ ids: [id], note: 'Expires within 14 days' }))}
          />
          <Section
            title="Secrets due for rotation (90+ days)"
            color="#fab005"
            groups={report.secretsStale.map((id) => ({ ids: [id], note: 'Not rotated in over 90 days' }))}
          />
        </Stack>
      )}
    </Box>
  )
}
