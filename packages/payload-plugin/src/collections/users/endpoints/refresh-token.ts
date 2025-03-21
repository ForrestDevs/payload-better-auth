import { setCookieCache } from 'better-auth/cookies'
import { CollectionSlug, type Endpoint, getFieldsToSign, refreshOperation, User } from 'payload'
import { GenericEndpointContext } from 'better-auth/types'
import { EndpointWithBetterAuth } from 'src/types'

type RefreshTokenEndpointOptions = {
  userSlug: CollectionSlug
}

export const getRefreshTokenEndpoint = (options?: RefreshTokenEndpointOptions): Endpoint => {
  const userSlug = options?.userSlug

  const endpoint: EndpointWithBetterAuth = {
    path: '/refresh-token',
    method: 'post',
    handler: async (req) => {
      const payload = req.payload
      const betterAuth = payload.betterAuth
      const authContext = await betterAuth?.$context
      const userCollection = payload.collections[userSlug as CollectionSlug]

      if (!betterAuth || !authContext) {
        return new Response(JSON.stringify({ message: 'BetterAuth not initialized' }), {
          status: 500,
        })
      }

      const sessionTokenName = authContext.authCookies.sessionToken.name
      const cookieHeader = req.headers.get('cookie') || ''
      const hasSessionToken = cookieHeader.includes(`${sessionTokenName}=`)

      if (!hasSessionToken) {
        try {
          const result = await refreshOperation({ collection: userCollection, req })
          return new Response(JSON.stringify(result), { status: 200 })
        } catch (error) {
          console.error('Token refresh failed:', error)
          return new Response(JSON.stringify({ message: 'Token refresh failed' }), { status: 401 })
        }
      }

      // @ts-ignore - @TODO, fix type of .api
      const session = await betterAuth.api.getSession({
        headers: req.headers,
        query: { disableCookieCache: true },
      })

      if (!session?.session?.userId) {
        return new Response(JSON.stringify({ message: 'No user in session' }), { status: 401 })
      }

      const user = await payload.findByID({
        collection: userSlug as string,
        id: session.session.userId,
      })

      if (!user) {
        return new Response(JSON.stringify({ message: 'No user found' }), { status: 401 })
      }

      const cookieCacheFields = getFieldsToSign({
        collectionConfig: userCollection.config,
        email: user.email,
        user: user as User,
      })

      const responseData = {
        refreshedToken: null,
        setCookie: !!authContext.options.session?.cookieCache?.enabled,
        strategy: 'better-auth',
        user: { ...user, collection: userSlug },
      }

      const response = new Response(JSON.stringify(responseData), {
        status: 200,
      })

      const ctx = {
        context: authContext,
        setCookie(name, value, options) {
          const path = options?.path || '/'
          const maxAge = options?.maxAge ? `; Max-Age=${options.maxAge}` : ''
          const httpOnly = options?.httpOnly ? '; HttpOnly' : ''
          const secure = options?.secure ? '; Secure' : ''
          const sameSite = options?.sameSite ? `; SameSite=${options.sameSite}` : '; SameSite=Lax'

          response.headers.set(
            'Set-Cookie',
            `${name}=${value}; Path=${path}${maxAge}${httpOnly}${secure}${sameSite}`,
          )
          return name
        },
      } as GenericEndpointContext

      await setCookieCache(ctx, {
        session: session.session,
        user: cookieCacheFields as any,
      })

      return response
    },
  }

  return endpoint as unknown as Endpoint
}
