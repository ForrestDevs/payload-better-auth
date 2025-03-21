import type { PayloadBetterAuthPluginOptions, SanitizedBetterAuthOptions } from '../types.js'
import {
  supportedBetterAuthPluginIds,
  betterAuthPluginSlugs,
  baseCollectionSlugs,
} from './config.js'
import { ensurePasswordSetBeforeUserCreate } from './ensure-password-set-before-create.js'
import { verifyPassword } from './password.js'
import { hashPassword } from './password.js'

/**
 * Sanitizes the BetterAuth options
 */
export function sanitizeBetterAuthOptions(
  options: PayloadBetterAuthPluginOptions,
): SanitizedBetterAuthOptions {
  const baOptions = options.betterAuthOptions
  const userCollectionSlug = options.users?.slug ?? 'users'
  const accountCollectionSlug = options.accounts?.slug ?? 'accounts'
  const sessionCollectionSlug = options.sessions?.slug ?? 'sessions'
  const verificationCollectionSlug = options.verifications?.slug ?? 'verifications'

  const res: SanitizedBetterAuthOptions = { ...baOptions }

  res.user = {
    ...(baOptions?.user ?? {}),
    modelName: userCollectionSlug,
  }

  res.account = {
    ...(baOptions?.account ?? {}),
    modelName: accountCollectionSlug,
    fields: {
      userId: 'user',
    },
  }

  res.session = {
    ...(baOptions?.session ?? {}),
    modelName: sessionCollectionSlug,
    fields: {
      userId: 'user',
    },
  }

  res.verification = {
    ...(baOptions?.verification ?? {}),
    modelName: verificationCollectionSlug,
  }

  res.emailAndPassword = {
    ...(baOptions?.emailAndPassword ?? {}),
    enabled: baOptions?.emailAndPassword?.enabled ?? true,
  }

  if (res.emailAndPassword.enabled) {
    res.emailAndPassword.password = {
      ...(res.emailAndPassword.password ?? {}),
      verify: async ({ hash, password }) => {
        return await verifyPassword({ hash, password })
      },
      hash: async (password) => {
        return await hashPassword(password)
      },
    }
  }

  const originalSendVerificationEmail = baOptions?.emailVerification?.sendVerificationEmail;

  // Only override sendVerificationEmail if the developer provided their own implementation
  if (typeof originalSendVerificationEmail === 'function') {
    res.emailVerification = res?.emailVerification || {};
    res.emailVerification.sendVerificationEmail = async (data, request) => {
      try {
        const user = data.user;
        const createdAt = new Date(user.createdAt);
        const now = new Date();
        // If the user was created less than one minute ago, don't send the verification email
        // as we rely on payload to send the initial email
        if (now.getTime() - createdAt.getTime() < 60000) {
          return;
        }
        
        await originalSendVerificationEmail(data, request);
      } catch (error) {
        console.error('Error sending verification email:', error);
      }
    }
  }

  ensurePasswordSetBeforeUserCreate(res)

  if (res.plugins) {
    try {
      const supportedPlugins = res.plugins.filter((plugin) => {
        return Object.values(supportedBetterAuthPluginIds).includes(
          plugin.id as (typeof supportedBetterAuthPluginIds)[keyof typeof supportedBetterAuthPluginIds],
        )
      })

      if (supportedPlugins.length !== res.plugins.length) {
        console.warn(
          `Unsupported BetterAuth plugins detected: ${res.plugins
            .filter(
              (p) =>
                !Object.values(supportedBetterAuthPluginIds).includes(
                  p.id as (typeof supportedBetterAuthPluginIds)[keyof typeof supportedBetterAuthPluginIds],
                ),
            )
            .map((p) => p.id)
            .join(', ')}. Supported plugins are: ${Object.values(supportedBetterAuthPluginIds).join(
            ', ',
          )}. 
            These plugins will be ignored.`,
        )
      }

      // Add the schema to the supported plugins
      if (supportedPlugins.length > 0) {
        supportedPlugins.forEach((plugin) => {
          const pluginId =
            plugin.id as (typeof supportedBetterAuthPluginIds)[keyof typeof supportedBetterAuthPluginIds]

          switch (pluginId) {
            case supportedBetterAuthPluginIds.admin:
              const adminPlugin = plugin as any
              if (!adminPlugin.adminRoles)
                adminPlugin.adminRoles = options.users?.adminRoles ?? ['admin']
              adminPlugin.adminRoles = options.users?.adminRoles ?? ['admin']
              Object.assign(plugin, adminPlugin)
              break
            case supportedBetterAuthPluginIds.apiKey:
              const apiKeyPlugin = plugin as any
              if (!apiKeyPlugin.schema) apiKeyPlugin.schema = {}
              if (!apiKeyPlugin.schema.apikey) apiKeyPlugin.schema.apikey = {}
              apiKeyPlugin.schema.apikey = {
                ...apiKeyPlugin.schema.apikey,
                modelName: betterAuthPluginSlugs.apiKeys,
                fields: {
                  ...(plugin.schema?.apikey?.fields ?? {}),
                  userId: {
                    ...(plugin.schema?.apikey?.fields?.userId ?? {}),
                    fieldName: 'user',
                  },
                },
              }
              Object.assign(plugin, apiKeyPlugin)
              break
            case supportedBetterAuthPluginIds.passkey:
              const passkeyPlugin = plugin as any
              if (!passkeyPlugin.schema) passkeyPlugin.schema = {}
              if (!passkeyPlugin.schema.passkey) passkeyPlugin.schema.passkey = {}
              passkeyPlugin.schema.passkey = {
                ...passkeyPlugin.schema.passkey,
                modelName: betterAuthPluginSlugs.passkeys,
                fields: {
                  ...(passkeyPlugin.schema.passkey.fields || {}),
                  userId: {
                    ...passkeyPlugin.schema.passkey.fields.userId,
                    fieldName: 'user',
                  },
                },
              }
              Object.assign(plugin, passkeyPlugin)
              break
            case supportedBetterAuthPluginIds.organization:
              const organizationPlugin = plugin as any
              if (!organizationPlugin.schema) organizationPlugin.schema = {}
              if (!organizationPlugin.schema.organization) organizationPlugin.schema.member = {}
              if (!organizationPlugin.schema.invitation) organizationPlugin.schema.invitation = {}
              if (!organizationPlugin.schema.team) organizationPlugin.schema.team = {}
              if (!organizationPlugin.schema.session) organizationPlugin.schema.session = {}
              organizationPlugin.schema = {
                ...organizationPlugin.schema,
                organization: {
                  ...organizationPlugin.schema.organization,
                  modelName: betterAuthPluginSlugs.organizations,
                  fields: {
                    ...(organizationPlugin.schema.organization.fields ?? {}),
                  },
                },
                member: {
                  ...organizationPlugin.schema.member,
                  modelName: betterAuthPluginSlugs.members,
                  fields: {
                    ...(organizationPlugin.schema.member.fields ?? {}),
                    organizationId: {
                      ...(organizationPlugin.schema.member.fields?.organizationId ?? {}),
                      fieldName: 'organization',
                    },
                    userId: {
                      ...(organizationPlugin.schema.member.fields?.userId ?? {}),
                      fieldName: 'user',
                    },
                    teamId: {
                      ...(organizationPlugin.schema.member.fields?.teamId ?? {}),
                      fieldName: 'team',
                    },
                  },
                },
                invitation: {
                  ...organizationPlugin.schema.invitation,
                  modelName: betterAuthPluginSlugs.invitations,
                  fields: {
                    ...(organizationPlugin.schema.invitation.fields ?? {}),
                    organizationId: {
                      ...(organizationPlugin.schema.invitation.fields?.organizationId ?? {}),
                      fieldName: 'organization',
                    },
                    inviterId: {
                      ...(organizationPlugin.schema.invitation.fields?.inviterId ?? {}),
                      fieldName: 'inviter',
                    },
                    teamId: {
                      ...(organizationPlugin.schema.invitation.fields?.teamId ?? {}),
                      fieldName: 'team',
                    },
                  },
                },
                team: {
                  ...organizationPlugin.schema.team,
                  modelName: betterAuthPluginSlugs.teams,
                  fields: {
                    ...(organizationPlugin.schema.team.fields ?? {}),
                    organizationId: {
                      ...(organizationPlugin.schema.team.fields?.organizationId ?? {}),
                      fieldName: 'organization',
                    },
                  },
                },
                session: {
                  ...organizationPlugin.schema.session,
                  modelName: baseCollectionSlugs.sessions,
                  fields: {
                    ...(organizationPlugin.schema.session.fields ?? {}),
                    activeOrganizationId: {
                      ...(organizationPlugin.schema.session.fields?.activeOrganizationId ?? {}),
                      fieldName: 'activeOrganization',
                    },
                  },
                },
              }
              Object.assign(plugin, organizationPlugin)
              break
            case supportedBetterAuthPluginIds.sso:
              const ssoPlugin = plugin as any
              if (!ssoPlugin.schema) ssoPlugin.schema = {}
              if (!ssoPlugin.schema.sso) ssoPlugin.schema.sso = {}
              ssoPlugin.schema.sso = {
                ...ssoPlugin.schema.sso,
                modelName: betterAuthPluginSlugs.ssoProviders,
                fields: {
                  ...(ssoPlugin.schema.sso.fields ?? {}),
                  userId: {
                    ...(ssoPlugin.schema.sso.fields?.userId ?? {}),
                    fieldName: 'user',
                  },
                },
              }
              Object.assign(plugin, ssoPlugin)
              break
            case supportedBetterAuthPluginIds.oidc:
              const oidcPlugin = plugin as any
              if (!oidcPlugin.schema) oidcPlugin.schema = {}
              if (!oidcPlugin.schema.oauthApplication) oidcPlugin.schema.oauthApplication = {}
              if (!oidcPlugin.schema.oauthAccessToken) oidcPlugin.schema.oauthAccessToken = {}
              if (!oidcPlugin.schema.oauthConsent) oidcPlugin.schema.oauthConsent = {}
              oidcPlugin.schema = {
                ...oidcPlugin.schema,
                oauthApplication: {
                  ...oidcPlugin.schema.oauthApplication,
                  modelName: betterAuthPluginSlugs.oauthApplications,
                  fields: {
                    ...(oidcPlugin.schema.oauthApplication.fields ?? {}),
                    userId: {
                      ...(oidcPlugin.schema.oauthApplication.fields?.userId ?? {}),
                      fieldName: 'user',
                    },
                  },
                },
                oauthAccessToken: {
                  ...oidcPlugin.schema.oauthAccessToken,
                  modelName: betterAuthPluginSlugs.oauthAccessTokens,
                  fields: {
                    ...(oidcPlugin.schema.oauthAccessToken.fields ?? {}),
                    userId: {
                      ...(oidcPlugin.schema.oauthAccessToken.fields?.userId ?? {}),
                      fieldName: 'user',
                    },
                    clientId: {
                      ...(oidcPlugin.schema.oauthAccessToken.fields?.clientId ?? {}),
                      fieldName: 'client',
                    },
                  },
                },
                oauthConsent: {
                  ...oidcPlugin.schema.oauthConsent,
                  modelName: betterAuthPluginSlugs.oauthConsents,
                  fields: {
                    ...(oidcPlugin.schema.oauthConsent.fields ?? {}),
                    userId: {
                      ...(oidcPlugin.schema.oauthConsent.fields?.userId ?? {}),
                      fieldName: 'user',
                    },
                    clientId: {
                      ...(oidcPlugin.schema.oauthConsent.fields?.clientId ?? {}),
                      fieldName: 'client',
                    },
                  },
                },
              }
              Object.assign(plugin, oidcPlugin)
              break
            default:
              break
          }
        })
      }
      // Make sure only the supported plugins are used
      Object.assign(res.plugins, supportedPlugins)
    } catch (error) {
      throw new Error(`Error sanitizing BetterAuth plugins: ${error}`)
    }
  }

  return res
}
