import { useState } from 'react'
import { Box, Button, ButtonBase, Popover, Typography, Tooltip } from '@mui/material'
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ALLOWED_EMOJI, toggleReaction, getReactions } from '../api/reactions'
import ProfileLink from './ProfileLink'
import { CLAY, tint } from '../theme'

interface Props {
  roundId: number
  reactionSummary: Record<string, number>
  userReaction: string | null
  readOnly?: boolean
}

const EMOJI_LABELS: Record<string, string> = {
  '\u{1F525}': 'Fire',
  '\u{1F44F}': 'Applause',
  '\u{1F602}': 'Laughing',
  '\u{1F480}': 'Skull',
  '⛳': 'Flag in hole',
}

/**
 * One "React" button that opens an emoji picker, plus a tappable summary of
 * who reacted.
 *
 * It used to render all five emoji as chips on every card, all the time — a
 * row of buttons that made each card look like a poll and pushed the actual
 * round further apart. Reacting is one tap more now; reading the feed is a lot
 * calmer.
 */
export default function ReactionBar({ roundId, reactionSummary, userReaction, readOnly }: Props) {
  const queryClient = useQueryClient()
  const [optimisticSummary, setOptimisticSummary] = useState<Record<string, number> | null>(null)
  const [optimisticUserReaction, setOptimisticUserReaction] = useState<string | null | undefined>(undefined)
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null)
  const [whoAnchor, setWhoAnchor] = useState<HTMLElement | null>(null)

  const { data: reactionDetail } = useQuery({
    queryKey: ['reaction-detail', roundId],
    queryFn: () => getReactions(roundId),
    enabled: !!whoAnchor,
  })

  const summary = optimisticSummary ?? reactionSummary
  const currentUserReaction = optimisticUserReaction !== undefined ? optimisticUserReaction : userReaction

  const mutation = useMutation({
    mutationFn: (emoji: string) => toggleReaction(roundId, emoji),
    onMutate: (emoji) => {
      const prev = { ...summary }
      const next = { ...prev }
      const dec = (e: string) => {
        next[e] = Math.max((next[e] || 1) - 1, 0)
        if (next[e] === 0) delete next[e]
      }
      if (currentUserReaction === emoji) {
        dec(emoji)
        setOptimisticUserReaction(null)
      } else {
        if (currentUserReaction && next[currentUserReaction]) dec(currentUserReaction)
        next[emoji] = (next[emoji] || 0) + 1
        setOptimisticUserReaction(emoji)
      }
      setOptimisticSummary(next)
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

  const pick = (emoji: string) => {
    setPickerAnchor(null)
    mutation.mutate(emoji)
  }

  const active = ALLOWED_EMOJI.filter((e) => (summary[e] || 0) > 0)
    .sort((a, b) => (summary[b] || 0) - (summary[a] || 0))
  const total = active.reduce((n, e) => n + (summary[e] || 0), 0)

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      {!readOnly && (
        <Button
          size="small"
          onClick={(e) => setPickerAnchor(e.currentTarget)}
          aria-label={currentUserReaction ? `Your reaction: ${EMOJI_LABELS[currentUserReaction] ?? currentUserReaction}. Change reaction` : 'React to this round'}
          aria-haspopup="true"
          startIcon={currentUserReaction
            ? <Box component="span" sx={{ fontSize: '1.05rem', lineHeight: 1 }}>{currentUserReaction}</Box>
            : <AddReactionOutlinedIcon />}
          sx={{
            color: currentUserReaction ? CLAY.goldText : 'text.secondary',
            bgcolor: currentUserReaction ? tint(CLAY.gold, 0.18) : 'transparent',
            fontWeight: 600,
            px: 1.25,
            '&:hover': { bgcolor: currentUserReaction ? tint(CLAY.gold, 0.26) : 'action.hover' },
          }}
        >
          {currentUserReaction ? 'Reacted' : 'React'}
        </Button>
      )}

      {total > 0 && (
        <Tooltip title="See who reacted">
          <ButtonBase
            onClick={(e) => setWhoAnchor(e.currentTarget)}
            sx={{ borderRadius: 999, px: 0.75, py: 0.25, gap: 0.5, display: 'flex', alignItems: 'center' }}
            aria-label={`${total} reaction${total === 1 ? '' : 's'}. See who reacted`}
          >
            <Box sx={{ display: 'flex' }}>
              {active.slice(0, 3).map((e, i) => (
                <Box
                  key={e}
                  component="span"
                  sx={{
                    fontSize: '0.9rem', lineHeight: 1, width: 22, height: 22, display: 'grid', placeItems: 'center',
                    borderRadius: '50%', bgcolor: CLAY.sunken, border: '2px solid', borderColor: 'background.paper',
                    ml: i === 0 ? 0 : -0.75,
                  }}
                >
                  {e}
                </Box>
              ))}
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>{total}</Typography>
          </ButtonBase>
        </Tooltip>
      )}

      {/* Emoji picker */}
      <Popover
        open={!!pickerAnchor}
        anchorEl={pickerAnchor}
        onClose={() => setPickerAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { borderRadius: 999, p: 0.5, mt: -1 } } }}
      >
        <Box role="menu" sx={{ display: 'flex', gap: 0.25 }}>
          {ALLOWED_EMOJI.map((emoji) => {
            const selected = currentUserReaction === emoji
            return (
              <ButtonBase
                key={emoji}
                role="menuitemradio"
                aria-checked={selected}
                aria-label={EMOJI_LABELS[emoji] ?? emoji}
                onClick={() => pick(emoji)}
                sx={{
                  width: 44, height: 44, borderRadius: '50%', fontSize: '1.45rem',
                  bgcolor: selected ? tint(CLAY.gold, 0.25) : 'transparent',
                  transition: 'transform .12s ease',
                  '&:hover': { transform: 'scale(1.2)' },
                }}
              >
                {emoji}
              </ButtonBase>
            )
          })}
        </Box>
      </Popover>

      {/* Who reacted */}
      <Popover
        open={!!whoAnchor}
        anchorEl={whoAnchor}
        onClose={() => setWhoAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box sx={{ px: 2, py: 1.5, maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {active.map((emoji) => (
            <Typography key={emoji} variant="body2" component="div">
              <Box component="span" sx={{ mr: 0.75 }}>{emoji}</Box>
              {reactionDetail?.names?.[emoji]
                ? reactionDetail.names[emoji].map((p, i) => (
                    <span key={p.userId}>
                      {i > 0 && ', '}
                      <ProfileLink userId={p.userId} name={p.name} variant="body2" />
                    </span>
                  ))
                : `${summary[emoji]} reaction${summary[emoji] !== 1 ? 's' : ''}`}
            </Typography>
          ))}
        </Box>
      </Popover>
    </Box>
  )
}
