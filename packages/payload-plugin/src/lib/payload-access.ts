import type { Access, FieldAccess } from 'payload'

export type AdminRolesConfig = {
  adminRoles?: string[]
}

export type AdminOrCurrentUserConfig = AdminRolesConfig & {
  idField?: string
}

export type AdminOrCurrentUserUpdateConfig = AdminOrCurrentUserConfig & {
  allowedFields?: string[]
  userSlug: string
}

export const isAdminWithRoles =
  (config: AdminRolesConfig = {}): FieldAccess =>
  ({ req }) => {
    const { adminRoles = ['admin'] } = config
    if (!req?.user || !req.user.role || !adminRoles.includes(req.user.role)) return false
    return true
  }

export const isAdminOrCurrentUserWithRoles =
  (config: AdminOrCurrentUserConfig = {}): Access =>
  ({ req }) => {
    const { adminRoles = ['admin'], idField = 'id' } = config
    if (isAdminWithRoles({ adminRoles })({ req })) return true
    if (!req?.user) return false
    return {
      [idField]: {
        equals: req?.user?.id,
      },
    }
  }

export const isAdminOrCurrentUserUpdateWithAllowedFields = (
  config: AdminOrCurrentUserUpdateConfig,
): Access => {
  return async ({ req, id, data }) => {
    const { adminRoles = ['admin'], allowedFields = [], userSlug, idField = 'id' } = config
    const user = req.user

    if (isAdminWithRoles({ adminRoles })({ req })) return true

    if (!user) return false

    if (user[idField] === id && data) {
      const dataKeys = Object.keys(data)

      const hasCurrentPassword = dataKeys.includes('currentPassword')
      const hasPassword = dataKeys.includes('password')

      if (hasPassword || hasCurrentPassword) {
        if (!(hasCurrentPassword && hasPassword)) return false
        try {
          if (!user.email) return false

          const result = await req.payload.login({
            collection: userSlug,
            data: {
              email: user.email,
              password: data.currentPassword,
            },
          })

          if (!result) return false

          allowedFields.push('password', 'currentPassword')
        } catch (error) {
          return false
        }
      }

      const hasDisallowedField = dataKeys.some((key) => !allowedFields.includes(key))

      return !hasDisallowedField
    }

    return false
  }
}
