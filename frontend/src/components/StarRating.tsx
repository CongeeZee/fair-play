import { Box, IconButton } from '@mui/material'
import StarIcon from '@mui/icons-material/Star'
import StarHalfIcon from '@mui/icons-material/StarHalf'
import StarBorderIcon from '@mui/icons-material/StarBorder'

interface StarRatingProps {
  value: number | null | undefined
  onChange?: (value: number) => void
  size?: 'small' | 'medium' | 'large'
  readOnly?: boolean
  allowClear?: boolean
}

const sizePx = { small: 18, medium: 24, large: 40 }

export default function StarRating({ value, onChange, size = 'medium', readOnly = false, allowClear = false }: StarRatingProps) {
  const v = value ?? 0
  const px = sizePx[size]
  const readonly = readOnly || !onChange

  const stars = [1, 2, 3, 4, 5].map((n) => {
    let icon
    if (v >= n) {
      icon = <StarIcon sx={{ fontSize: px, color: '#e0b95c' }} />
    } else if (v >= n - 0.5) {
      icon = <StarHalfIcon sx={{ fontSize: px, color: '#e0b95c' }} />
    } else {
      icon = <StarBorderIcon sx={{ fontSize: px, color: readonly ? 'text.disabled' : 'text.secondary' }} />
    }

    if (readonly) {
      return <Box key={n} sx={{ display: 'inline-flex', lineHeight: 0 }}>{icon}</Box>
    }
    return (
      <IconButton
        key={n}
        size="small"
        onClick={() => onChange!(allowClear && v === n ? 0 : n)}
        sx={{ p: size === 'large' ? 0.75 : 0.25 }}
      >
        {icon}
      </IconButton>
    )
  })

  return <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>{stars}</Box>
}
