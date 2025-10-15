import { cookies } from 'next/headers'
import { HomePageContent } from '@/components/home-page-content'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubStars } from '@/lib/github-stars'
import { MAX_SANDBOX_DURATION } from '@/lib/constants'

export default async function Home() {
  const cookieStore = await cookies()
  const selectedOwner = cookieStore.get('selected-owner')?.value || ''
  const selectedRepo = cookieStore.get('selected-repo')?.value || ''
  const installDependencies = cookieStore.get('install-dependencies')?.value === 'true'
  const maxDuration = parseInt(cookieStore.get('max-duration')?.value || MAX_SANDBOX_DURATION.toString(), 10)
  const keepAlive = cookieStore.get('keep-alive')?.value === 'true'

  const [session, stars] = await Promise.all([getServerSession(), getGitHubStars()])

  return (
    <HomePageContent
      initialSelectedOwner={selectedOwner}
      initialSelectedRepo={selectedRepo}
      initialInstallDependencies={installDependencies}
      initialMaxDuration={maxDuration}
      initialKeepAlive={keepAlive}
      maxSandboxDuration={MAX_SANDBOX_DURATION}
      user={session?.user ?? null}
      initialStars={stars}
    />
  )
}
