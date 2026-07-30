import { useEffect, useRef } from 'react'
import { Box, InputBase } from '@mui/material'

interface Props {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  autoFocus?: boolean
  disabled?: boolean
}

/** Six-cell numeric passcode entry. Values are digits only. */
export default function PasscodeInput({ value, onChange, onComplete, autoFocus, disabled }: Props): JSX.Element {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')

  useEffect(() => {
    if (autoFocus) refs.current[Math.min(value.length, 5)]?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus])

  const setAt = (index: number, digit: string): void => {
    const next = value.split('')
    next[index] = digit
    const joined = next.join('').replace(/\s/g, '').slice(0, 6)
    onChange(joined)
    if (digit && index < 5) refs.current[index + 1]?.focus()
    if (joined.length === 6) onComplete?.(joined)
  }

  return (
    <Box sx={{ display: 'flex', gap: 1.25, justifyContent: 'center' }}>
      {digits.map((d, i) => (
        <InputBase
          key={i}
          inputRef={(el) => (refs.current[i] = el)}
          value={d.trim()}
          disabled={disabled}
          inputProps={{
            inputMode: 'numeric',
            maxLength: 1,
            'aria-label': `Passcode digit ${i + 1}`,
            style: { textAlign: 'center', fontSize: 24, padding: 0, caretColor: 'transparent' }
          }}
          type="password"
          onChange={(e) => {
            const digit = e.target.value.replace(/\D/g, '').slice(-1)
            if (digit) setAt(i, digit)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault()
              if (value[i]) setAt(i, '')
              else if (i > 0) {
                setAt(i - 1, '')
                refs.current[i - 1]?.focus()
              }
            }
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
          }}
          sx={{
            width: 52,
            height: 60,
            borderRadius: 2,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: value[i] ? 'primary.main' : 'divider',
            transition: 'border-color 120ms'
          }}
        />
      ))}
    </Box>
  )
}
