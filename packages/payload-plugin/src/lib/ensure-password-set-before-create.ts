import type { SanitizedBetterAuthOptions } from '../types.js'

/**
 * Adds a before hook to the user create operation to ensure the password is set.
 * This is necessary because the password is not set in the user create operation
 * and is instead set in the sync password accounts hook.
 */
export function ensurePasswordSetBeforeUserCreate(options: SanitizedBetterAuthOptions) {
  if (typeof options.databaseHooks !== 'object') options.databaseHooks = {}
  if (typeof options.databaseHooks.user !== 'object') options.databaseHooks.user = {}
  if (typeof options.databaseHooks.user.create !== 'object') options.databaseHooks.user.create = {}
  const initialBeforeUserCreateHook = options.databaseHooks.user.create.before ?? null

  options.databaseHooks.user.create.before = async (user, ctx) => {
    if (!(user as any).password) {
      ;(user as any).password =
        ctx?.body?.password ??
        Array(3)
          .fill(0)
          .map(() => Math.random().toString(36).slice(2))
          .join('')
    }
    if (typeof initialBeforeUserCreateHook === 'function') {
      return initialBeforeUserCreateHook(user, ctx)
    }
    return { data: user }
  }
}
