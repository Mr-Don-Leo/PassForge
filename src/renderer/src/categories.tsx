import type { ComponentType } from 'react'
import type { SvgIconProps } from '@mui/material'
import LoginRoundedIcon from '@mui/icons-material/LoginRounded'
import KeyRoundedIcon from '@mui/icons-material/KeyRounded'
import EmailRoundedIcon from '@mui/icons-material/EmailRounded'
import GroupRoundedIcon from '@mui/icons-material/GroupRounded'
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded'
import WorkRoundedIcon from '@mui/icons-material/WorkRounded'
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import LabelRoundedIcon from '@mui/icons-material/LabelRounded'
import CloudRoundedIcon from '@mui/icons-material/CloudRounded'
import StorageRoundedIcon from '@mui/icons-material/StorageRounded'
import PublicRoundedIcon from '@mui/icons-material/PublicRounded'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded'
import CodeRoundedIcon from '@mui/icons-material/CodeRounded'
import DnsRoundedIcon from '@mui/icons-material/DnsRounded'
import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded'
import MusicNoteRoundedIcon from '@mui/icons-material/MusicNoteRounded'
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import PinRoundedIcon from '@mui/icons-material/PinRounded'

const ICONS: Record<string, ComponentType<SvgIconProps>> = {
  login: LoginRoundedIcon,
  apikey: KeyRoundedIcon,
  pin: PinRoundedIcon,
  email: EmailRoundedIcon,
  social: GroupRoundedIcon,
  finance: AccountBalanceWalletRoundedIcon,
  work: WorkRoundedIcon,
  shopping: ShoppingCartRoundedIcon,
  personal: PersonRoundedIcon,
  other: LabelRoundedIcon,
  cloud: CloudRoundedIcon,
  database: StorageRoundedIcon,
  globe: PublicRoundedIcon,
  folder: FolderRoundedIcon,
  star: StarRoundedIcon,
  shield: ShieldRoundedIcon,
  code: CodeRoundedIcon,
  server: DnsRoundedIcon,
  game: SportsEsportsRoundedIcon,
  music: MusicNoteRoundedIcon,
  heart: FavoriteRoundedIcon,
  home: HomeRoundedIcon,
  lock: LockRoundedIcon
}

/** Icon for a preset icon id, falling back to the generic label icon. */
export function CategoryIcon({ icon, ...props }: { icon: string } & SvgIconProps): JSX.Element {
  const Icon = ICONS[icon] ?? LabelRoundedIcon
  return <Icon {...props} />
}
