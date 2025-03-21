import { cookies } from 'next/headers'
import type { CollectionAfterLogoutHook } from 'payload'
import type { CollectionHookWithBetterAuth } from '../../../types'

type CollectionAfterLogoutHookWithBetterAuth =
  CollectionHookWithBetterAuth<CollectionAfterLogoutHook>

type AfterLogoutOptions = {
  sessionsCollectionSlug: string
}

export const getAfterLogoutHook = (options: AfterLogoutOptions): CollectionAfterLogoutHook => {
  const hook: CollectionAfterLogoutHookWithBetterAuth = async ({ req }) => {
    const cookieStore = await cookies()
    const authContext = await req.payload.betterAuth.$context
    const sessionTokenName = authContext.authCookies.sessionToken.name
    const sessionDataName = authContext.authCookies.sessionData.name
    const dontRememberTokenName = authContext.authCookies.dontRememberToken.name

    const sessionCookieValue = cookieStore.get(sessionTokenName)?.value
    if (sessionCookieValue) {
      const payload = req.payload
      const [token] = sessionCookieValue.split('.')
      const { docs: sessions } = await payload.find({
        collection: options.sessionsCollectionSlug,
        where: {
          token: { equals: token },
        },
        limit: 1,
      })
      const session = sessions.at(0)
      if (session) {
        await payload.delete({
          collection: options.sessionsCollectionSlug,
          id: session.id,
        })
      }
    }

    cookieStore.delete(sessionTokenName)
    cookieStore.delete(sessionDataName)
    cookieStore.delete(dontRememberTokenName)
  }

  return hook as CollectionAfterLogoutHook
}
