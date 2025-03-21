import { setCookieCache } from 'better-auth/cookies'
import { createAuthMiddleware } from 'better-auth/api'
import { getFieldsToSign } from 'payload'
import type { SanitizedBetterAuthOptions, PayloadBetterAuthPluginOptions } from '../types.js'
import type { Config, Payload } from 'payload'

/**
 * Adds after-auth middleware to sanitize session data that goes into the cookie cache.
 * This middleware leverages the payload configuration's 'saveToJwt' property to filter
 * both user and session objects, ensuring only permitted fields are included in the cookie cache.
 */
export function setAfterAuthMiddlewareHook({
  sanitizedOptions,
  payloadConfig,
  pluginOptions,
}: {
  sanitizedOptions: SanitizedBetterAuthOptions
  payloadConfig: Payload['config'] | Config
  pluginOptions: PayloadBetterAuthPluginOptions
}) {
  if (typeof sanitizedOptions.hooks !== 'object') sanitizedOptions.hooks = {}

  sanitizedOptions.hooks.after = createAuthMiddleware(async (ctx) => {
    const newSession = ctx.context?.newSession
    if (!newSession) return

    if (newSession && newSession.user) {
      const userCollectionSlug = pluginOptions.users?.slug ?? 'users'
      const sessionCollectionSlug = pluginOptions.sessions?.slug ?? 'sessions'

      const userCollection = payloadConfig?.collections?.find((c) => c.slug === userCollectionSlug)
      const sessionCollection = payloadConfig?.collections?.find((c) => c.slug === sessionCollectionSlug)

      if (!userCollection) {
        throw new Error(`User collection with slug '${userCollectionSlug}' not found`)
      }

      const filteredUser = getFieldsToSign({
        collectionConfig: userCollection,
        email: newSession.user.email,
        user: newSession.user as any,
      })

      let filteredSession = newSession.session
      if (sessionCollection && newSession.session) {
        filteredSession = getFieldsToSign({
          collectionConfig: sessionCollection,
          email: newSession.user.email,
          user: newSession.session as any,
        }) as typeof newSession.session
        
        delete filteredSession.email
        delete filteredSession.collection
      }

      const filteredSessionData = {
        ...newSession,
        user: filteredUser,
        session: filteredSession,
      }
      await setCookieCache(ctx, filteredSessionData as any)
    }
  })
}
