import type { CollectionAfterDeleteHook } from 'payload'
import type { CollectionHookWithBetterAuth } from 'src/types'

type CollectionAfterDeleteHookWithBetterAuth =
  CollectionHookWithBetterAuth<CollectionAfterDeleteHook>

export const cleanUpUserAfterDelete: CollectionAfterDeleteHookWithBetterAuth = async ({
  doc,
  req,
}) => {
  try {
    const { payload } = req
    const betterAuthContext = await payload.betterAuth.$context
    const userId = doc.id
    const beforeDelete = betterAuthContext.options.user?.deleteUser?.beforeDelete
    if (typeof beforeDelete === 'function') {
      await beforeDelete(doc, req as Request)
    }
    await betterAuthContext.internalAdapter.deleteSessions(userId)
    await betterAuthContext.internalAdapter.deleteAccounts(userId)
    if (payload.collections.verifications) {
      await payload.delete({
        collection: payload.collections.verifications.config.slug,
        where: {
          value: {
            like: `"${userId}"`,
          },
        },
      })
    }
    const afterDelete = betterAuthContext.options.user?.deleteUser?.afterDelete
    if (typeof afterDelete === 'function') {
      await afterDelete(doc, req as Request)
    }
    return doc
  } catch (error) {
    console.error('Error in user afterDelete hook:', error)
    return doc
  }
}
