import { Box, IconButton } from '@mui/material'
import StarIcon from '@mui/icons-material/Star'
import StarHalfIcon from '@mui/icons-material/StarHalf'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import { CLAY } from '../theme'

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
      icon = <StarIcon sx={{ fontSize: px, color: CLAY.goldGraphic }} />
    } else if (v >= n - 0.5) {
      icon = <StarHalfIcon sx={{ fontSize: px, color: CLAY.goldGraphic }} />
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
        // Five identical unnamed buttons in a row are unusable without sight
        // of them. `aria-pressed` is what makes the current rating audible;
        // the colour alone was carrying that, and only at 1.73:1.
        aria-label={allowClear && v === n ? 'Clear rating' : `Rate ${n} star${n === 1 ? '' : 's'}`}
        aria-pressed={v >= n}
        onClick={() => onChange!(allowClear && v === n ? 0 : n)}
        sx={{ p: size === 'large' ? 0.75 : 0.25 }}
      >
        {icon}
      </IconButton>
    )
  })

  return <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>{stars}</Box>
}
