import type { CollectionAfterChangeHook } from 'payload'
import type { CollectionHookWithBetterAuth } from '../../../types'
import { BETTER_AUTH_CONTEXT_KEY } from '@payload-auth/better-auth-db-adapter'

type CollectionAfterChangeHookWithBetterAuth =
  CollectionHookWithBetterAuth<CollectionAfterChangeHook>

type SyncAccountOptions = {
  userSlug: string
  accountSlug: string
}

export const getSyncAccountHook = (
  options: SyncAccountOptions,
): CollectionAfterChangeHook => {
  const hook: CollectionAfterChangeHookWithBetterAuth = async ({
    doc,
    req,
    operation,
    context,
  }) => {
    if (context?.syncPasswordToUser) return doc

    if (operation !== 'create' && operation !== 'update') return doc

    const user = await req.payload.findByID({
      collection: options.userSlug,
      id: doc.id,
      depth: 0,
      req,
      showHiddenFields: true,
    })

    if (!user || !user.hash || !user.salt) return doc

    const passwordValue = `${user.salt}:${user.hash}`
    const userField = req.payload.betterAuth.options.account?.fields?.userId || 'userId'

    if (operation === 'create' && !(BETTER_AUTH_CONTEXT_KEY in context)) {
      try {
        await req.payload.create({
          collection: options.accountSlug,
          data: {
            [userField]: doc.id,
            accountId: doc.id,
            providerId: 'credential',
            password: passwordValue,
            context: { syncAccountHook: true },
          },
        })
      } catch (error) {
        console.error('Failed to create account for user:', error)
      }
    }

    if (operation === 'update') {
      try {
        const accounts = await req.payload.find({
          collection: options.accountSlug,
          where: {
            and: [
              { [userField]: { equals: doc.id } },
              { providerId: { equals: 'credential' } },
            ],
          },
          depth: 0,
          context: { syncAccountHook: true },
        })

        const account = accounts.docs.at(0)
        if (account) {
          await req.payload.update({
            collection: options.accountSlug,
            id: account.id,
            data: {
              password: passwordValue,
            },
            context: { syncAccountHook: true },
          })
        }
      } catch (error) {
        console.error('Failed to sync hash/salt to account:', error)
      }
    }

    return doc
  }

  return hook as CollectionAfterChangeHook
}