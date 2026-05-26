import { Box, Container, Typography } from '@mui/material'
import { useParams } from 'react-router-dom'
import CourseReviewsSection from '../components/CourseReviewsSection'

export default function CourseReviewsPage() {
  const { courseId } = useParams<{ courseId: string }>()
  if (!courseId) return null
  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" color="primary.main" fontWeight={700}>
          Reviews
        </Typography>
      </Box>
      <CourseReviewsSection courseId={courseId} />
    </Container>
  )
}
