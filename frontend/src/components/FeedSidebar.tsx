import { Box } from '@mui/material'
import { UpcomingRoundsCard, CompetitionsCard, PeopleYouMayKnowCard, InviteCard } from './RailCards'

/**
 * Desktop companion column for the feed: what's coming up, people to add and
 * a way to bring the group in. Every section has something to show — the
 * column used to render nothing at all for anyone without a tee time or a
 * competition, leaving a blank 300px gap that pushed the feed off-centre.
 */
export default function FeedSidebar() {
  return (
    <Box>
      <UpcomingRoundsCard />
      <CompetitionsCard />
      <PeopleYouMayKnowCard />
      <InviteCard />
    </Box>
  )
}
