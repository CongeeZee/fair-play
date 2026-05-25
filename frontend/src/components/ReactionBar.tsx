import { useState } from 'react'
import { Box, Chip, Popover, Typography } from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ALLOWED_EMOJI, toggleReaction, getReactions } from '../api/reactions'

interface Props {
  roundId: number
  reactionSummary: Record<string, number>
  userReaction: string | null
  readOnly?: boolean
}

export default function ReactionBar({ roundId, reactionSummary, userReaction, readOnly }: Props) {
  const queryClient = useQueryClient()
  const [optimisticSummary, setOptimisticSummary] = useState<Record<string, number> | null>(null)
  const [optimisticUserReaction, setOptimisticUserReaction] = useState<string | null | undefined>(undefined)
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null)
  const [popoverEmoji, setPopoverEmoji] = useState<string | null>(null)

  const { data: reactionDetail } = useQuery({
    queryKey: ['reaction-detail', roundId],
    queryFn: () => getReactions(roundId),
    enabled: !!popoverAnchor,
  })

  const summary = optimisticSummary ?? reactionSummary
  const currentUserReaction = optimisticUserReaction !== undefined ? optimisticUserReaction : userReaction

  const mutation = useMutation({
    mutationFn: (emoji: string) => toggleReaction(roundId, emoji),
    onMutate: (emoji) => {
      const prev = { ...summary }
      const newSummary = { ...prev }
      if (currentUserReaction === emoji) {
        newSummary[emoji] = Math.max((newSummary[emoji] || 1) - 1, 0)
        if (newSummary[emoji] === 0) delete newSummary[emoji]
        setOptimisticUserReaction(null)
      } else {
        if (currentUserReaction && newSummary[currentUserReaction]) {
          newSummary[currentUserReaction] = Math.max(newSummary[currentUserReaction] - 1, 0)
          if (newSummary[currentUserReaction] === 0) delete newSummary[currentUserReaction]
        }
        newSummary[emoji] = (newSummary[emoji] || 0) + 1
        setOptimisticUserReaction(emoji)
      }
      setOptimisticSummary(newSummary)
      return prev
    },
    onSuccess: (data) => {
      setOptimisticSummary(data.summary)
      setOptimisticUserReaction(data.userReaction)
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['reaction-detail', roundId] })
    },
    onError: (_err, _emoji, context) => {
      if (context) setOptimisticSummary(context as Record<string, number>)
      setOptimisticUserReaction(undefined)
    },
  })

  const handleTapCount = (e: React.MouseEvent<HTMLElement>, emoji: string) => {
    e.stopPropagation()
    setPopoverEmoji(emoji)
    setPopoverAnchor(e.currentTarget)
  }

  const activeCounts = ALLOWED_EMOJI.filter((e) => (summary[e] || 0) > 0)

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {ALLOWED_EMOJI.map((emoji) => {
          const isSelected = currentUserReaction === emoji
          return (
            <Chip
              key={emoji}
              label={emoji}
              size="small"
              onClick={readOnly ? undefined : () => mutation.mutate(emoji)}
              sx={{
                fontSize: '1rem',
                height: 28,
                cursor: readOnly ? 'default' : 'pointer',
                bgcolor: isSelected ? 'rgba(201,168,76,0.2)' : 'rgba(0,0,0,0.04)',
                border: isSelected ? '1.5px solid #c9a84c' : '1.5px solid transparent',
                '&:hover': readOnly ? {} : { bgcolor: isSelected ? 'rgba(201,168,76,0.3)' : 'rgba(0,0,0,0.08)' },
              }}
            />
          )
        })}
      </Box>

      {activeCounts.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5 }}>
          {activeCounts.map((emoji) => (
            <Typography
              key={emoji}
              variant="caption"
              onClick={(e) => handleTapCount(e, emoji)}
              sx={{ cursor: 'pointer', color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
            >
              {emoji} {summary[emoji]}
            </Typography>
          ))}
        </Box>
      )}

      <Popover
        open={!!popoverAnchor}
        anchorEl={popoverAnchor}
        onClose={() => { setPopoverAnchor(null); setPopoverEmoji(null) }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box sx={{ px: 2, py: 1, maxWidth: 200 }}>
          <Typography variant="body2">
            {popoverEmoji}{' '}
            {popoverEmoji && reactionDetail?.names?.[popoverEmoji]
              ? reactionDetail.names[popoverEmoji].join(', ')
              : `${summary[popoverEmoji || ''] || 0} reaction${(summary[popoverEmoji || ''] || 0) !== 1 ? 's' : ''}`
            }
          </Typography>
        </Box>
      </Popover>
    </Box>
  )
}
