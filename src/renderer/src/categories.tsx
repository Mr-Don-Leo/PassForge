import type { ComponentType } from 'react'
import type { SvgIconProps } from '@mui/material'
import LoginRoundedIcon from '@mui/icons-material/LoginRounded'
import EmailRoundedIcon from '@mui/icons-material/EmailRounded'
import GroupRoundedIcon from '@mui/icons-material/GroupRounded'
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded'
import WorkRoundedIcon from '@mui/icons-material/WorkRounded'
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import LabelRoundedIcon from '@mui/icons-material/LabelRounded'

const ICONS: Record<string, ComponentType<SvgIconProps>> = {
  login: LoginRoundedIcon,
  email: EmailRoundedIcon,
  social: GroupRoundedIcon,
  finance: AccountBalanceWalletRoundedIcon,
  work: WorkRoundedIcon,
  shopping: ShoppingCartRoundedIcon,
  personal: PersonRoundedIcon,
  other: LabelRoundedIcon
}

/** Icon for a category id, falling back to the generic label icon. */
export function CategoryIcon({ id, ...props }: { id: string } & SvgIconProps): JSX.Element {
  const Icon = ICONS[id] ?? LabelRoundedIcon
  return <Icon {...props} />
}
