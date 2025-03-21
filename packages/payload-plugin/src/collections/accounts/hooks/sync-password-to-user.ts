import type { CollectionAfterChangeHook } from 'payload'
import type { CollectionHookWithBetterAuth } from '../../../types'

type CollectionAfterChangeHookWithBetterAuth =
  CollectionHookWithBetterAuth<CollectionAfterChangeHook>

type SyncPasswordToUserOptions = {
  userSlug: string
  accountSlug: string
}

export const getSyncPasswordToUserHook = (
  options: SyncPasswordToUserOptions,
): CollectionAfterChangeHook => {
  const hook: CollectionAfterChangeHookWithBetterAuth = async ({
    doc,
    req,
    operation,
    context,
  }) => {
    if (context?.syncAccountHook) return doc

    if (operation !== 'create' && operation !== 'update') {
      return doc
    }

    const userField = req.payload.betterAuth.options.account?.fields?.userId || 'userId'

    if (!doc[userField]) {
      return doc
    }

    const account = await req.payload.findByID({
      collection: options.accountSlug,
      id: doc.id,
      depth: 0,
      req,
      showHiddenFields: true,
    })

    if (!account || !account.password) {
      return doc
    }

    const [salt, hash] = account.password.split(':')

    if (!salt || !hash) {
      return doc
    }

    const userId = typeof doc[userField] === 'string' ? doc[userField] : doc[userField]?.id

    try {
      await req.payload.update({
        collection: options.userSlug,
        id: userId,
        data: {
          salt,
          hash,
        },
        context: { syncPasswordToUser: true },
      })
    } catch (error) {
      console.error('Failed to sync password to user:', error)
    }

    return doc
  }

  return hook as CollectionAfterChangeHook
}
