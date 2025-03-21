import type { CollectionConfig, Field } from 'payload'
import type { PayloadBetterAuthPluginOptions, SanitizedBetterAuthOptions } from '../types.js'
import { baseCollectionSlugs, betterAuthPluginSlugs } from './config.js'
import { betterAuthStrategy } from './auth-strategy.js'
import { getAfterLogoutHook } from '../collections/users/hooks/after-logout.js'
import { getRefreshTokenEndpoint } from '../collections/users/endpoints/refresh-token.js'
import {
  isAdminOrCurrentUserUpdateWithAllowedFields,
  isAdminOrCurrentUserWithRoles,
  isAdminWithRoles,
} from './payload-access.js'
import { cleanUpUserAfterDelete } from '../collections/users/hooks/clean-up-user-after-delete.js'
import { getSyncPasswordToUserHook } from '../collections/accounts/hooks/sync-password-to-user.js'
import { getSyncAccountHook } from '../collections/users/hooks/sync-account.js'
import { onVerifiedChange } from '../collections/users/hooks/on-verified-change.js'

/**
 * Builds the required collections based on the BetterAuth options and plugins
 */
export function buildCollectionConfigs({
  incomingCollections,
  requiredCollectionSlugs,
  pluginOptions,
  sanitizedBAOptions,
}: {
  incomingCollections: CollectionConfig[]
  requiredCollectionSlugs: Set<string>
  pluginOptions: PayloadBetterAuthPluginOptions
  sanitizedBAOptions: SanitizedBetterAuthOptions
}): CollectionConfig[] {
  const userSlug = pluginOptions.users?.slug ?? baseCollectionSlugs.users
  const accountSlug = pluginOptions.accounts?.slug ?? baseCollectionSlugs.accounts
  const sessionSlug = pluginOptions.sessions?.slug ?? baseCollectionSlugs.sessions
  const verificationSlug = pluginOptions.verifications?.slug ?? baseCollectionSlugs.verifications
  const baPlugins = sanitizedBAOptions.plugins ?? null
  const adminRoles = pluginOptions.users?.adminRoles ?? ['admin']

  const getTimestampFields = ({
    saveUpdatedAtToJWT = true,
    saveCreatedAtToJWT = true,
  }: {
    saveUpdatedAtToJWT?: boolean;
    saveCreatedAtToJWT?: boolean;
  } = {}): Field[] => {
    return [{
      name: 'updatedAt',
      type: 'date',
      saveToJWT: saveUpdatedAtToJWT,
      admin: {
        disableBulkEdit: true,
        hidden: true,
      },
      index: true,
      label: ({ t }) => t('general:updatedAt'),
    },
    {
      name: 'createdAt',
      saveToJWT: saveCreatedAtToJWT,
      admin: {
        disableBulkEdit: true,
        hidden: true,
      },
      type: 'date',
      index: true,
      label: ({ t }) => t('general:createdAt'),
    }]
  }

  const enhancedCollections: CollectionConfig[] = []

  requiredCollectionSlugs.forEach((slug) => {
    switch (slug as keyof typeof baseCollectionSlugs | keyof typeof betterAuthPluginSlugs) {
      case baseCollectionSlugs.users:
        const existingUserCollection = incomingCollections.find(
          (collection) => collection.slug === userSlug,
        ) as CollectionConfig | undefined
        const allowedFields = pluginOptions.users?.allowedFields ?? ['name']
        let usersCollection: CollectionConfig = {
          ...existingUserCollection,
          slug: userSlug,
          admin: {
            defaultColumns: ['email'],
            useAsTitle: 'email',
            ...existingUserCollection?.admin,
            hidden: pluginOptions.users?.hidden ?? false,
          },
          access: {
            admin: ({ req }) => adminRoles.includes((req.user?.role as string) ?? 'user'),
            read: isAdminOrCurrentUserWithRoles({ adminRoles, idField: 'id' }),
            create: isAdminWithRoles({ adminRoles }),
            delete: isAdminOrCurrentUserWithRoles({ adminRoles, idField: 'id' }),
            update: isAdminOrCurrentUserUpdateWithAllowedFields({
              allowedFields,
              adminRoles,
              userSlug,
            }),
            ...(existingUserCollection?.access ?? {}),
          },
          endpoints: [
            ...(existingUserCollection?.endpoints ? existingUserCollection.endpoints : []),
            getRefreshTokenEndpoint({ userSlug }),
          ],
          hooks: {
            beforeChange: [
              ...(existingUserCollection?.hooks?.beforeChange ?? []),
              onVerifiedChange,
            ],
            afterChange: [
              ...(existingUserCollection?.hooks?.afterChange ?? []),
              getSyncAccountHook({
                userSlug,
                accountSlug,
              })
            ],
            afterLogout: [
              ...(existingUserCollection?.hooks?.afterLogout ?? []),
              getAfterLogoutHook({ sessionsCollectionSlug: sessionSlug }),
            ],
            afterDelete: [
              ...(existingUserCollection?.hooks?.afterDelete ?? []),
              (args) => cleanUpUserAfterDelete(args as any),
            ],
          },
          auth: {
            ...(existingUserCollection && typeof existingUserCollection.auth === 'object'
              ? existingUserCollection.auth
              : {}),
            //disableLocalStrategy: false,
            strategies: [betterAuthStrategy(adminRoles, userSlug)],
          },
          fields: [
            ...(existingUserCollection?.fields ?? []),
            {
              name: 'betterAuthAdminButtons',
              type: 'ui',
              admin: {
                position: 'sidebar',
                components: {
                  Field: {
                    path: '@payload-auth/better-auth-plugin/client#AdminButtons',
                    clientProps: () => {
                      return {
                        userSlug,
                      }
                    },
                  },
                },
                condition: () => {
                  // Only show the impersonate button if the admin plugin is enabled
                  return (baPlugins && baPlugins.some((plugin) => plugin.id === 'admin')) ?? false
                },
              },
            },
            {
              name: 'name',
              type: 'text',
              label: 'Name',
              saveToJWT: true,
              admin: {
                description: 'Users chosen display name',
              },
            },
            {
              name: 'email',
              type: 'text',
              required: true,
              unique: true,
              index: true,
              label: 'Email',
              admin: {
                description: 'The email of the user',
              },
            },
            {
              name: 'emailVerified',
              type: 'checkbox',
              required: true,
              defaultValue: false,
              saveToJWT: true,
              label: 'Email Verified',
              admin: {
                description: 'Whether the email of the user has been verified',
              },
            },
            {
              name: 'image',
              type: 'text',
              label: 'Image',
              saveToJWT: true,
              admin: {
                description: 'The image of the user',
              },
            },
            {
              name: 'role',
              type: 'select',
              required: true,
              defaultValue: 'user',
              saveToJWT: true,
              options: [
                ...(
                  pluginOptions.users?.roles ?? [
                    { label: 'Admin', value: 'admin' },
                    { label: 'User', value: 'user' },
                  ]
                ).map((role) => {
                  if (typeof role === 'string') {
                    return {
                      label: role.charAt(0).toUpperCase() + role.slice(1),
                      value: role,
                    }
                  }
                  return role
                }),
              ],
              label: 'Role',
              admin: {
                description: 'The role of the user',
              },
            },
            ...getTimestampFields({ saveUpdatedAtToJWT: false, saveCreatedAtToJWT: false }),
          ],
        }
        if (baPlugins) {
          baPlugins.forEach((plugin) => {
            switch (plugin.id) {
              case 'two-factor':
                usersCollection.fields.push({
                  name: 'twoFactorEnabled',
                  type: 'checkbox',
                  defaultValue: false,
                  label: 'Two Factor Enabled',
                  admin: {
                    description: 'Whether the user has two factor authentication enabled',
                  },
                })
                break
              case 'username':
                usersCollection.fields.push(
                  {
                    name: 'username',
                    type: 'text',
                    unique: true,
                    required: false, // TODO: decide if this should be required, will have to tell users they need to add ui for it.
                    label: 'Username',
                    admin: {
                      description: 'The username of the user',
                    },
                  },
                  {
                    name: 'displayUsername',
                    type: 'text',
                    required: true,
                    label: 'Display Username',
                    admin: {
                      description: 'The display username of the user',
                    },
                  },
                )
                break
              case 'anonymous':
                usersCollection.fields.push({
                  name: 'isAnonymous',
                  type: 'checkbox',
                  defaultValue: false,
                  label: 'Is Anonymous',
                  admin: {
                    description: 'Whether the user is anonymous.',
                  },
                })
                break
              case 'phone-number':
                usersCollection.fields.push(
                  {
                    name: 'phoneNumber',
                    type: 'text',
                    label: 'Phone Number',
                    admin: {
                      description: 'The phone number of the user',
                    },
                  },
                  {
                    name: 'phoneNumberVerified',
                    type: 'checkbox',
                    defaultValue: false,
                    label: 'Phone Number Verified',
                    admin: {
                      description: 'Whether the phone number of the user has been verified',
                    },
                  },
                )
                break
              case 'admin':
                usersCollection.fields.push(
                  {
                    name: 'banned',
                    type: 'checkbox',
                    defaultValue: false,
                    label: 'Banned',
                    admin: {
                      description: 'Whether the user is banned from the platform',
                    },
                  },
                  {
                    name: 'banReason',
                    type: 'text',
                    label: 'Ban Reason',
                    admin: {
                      description: 'The reason for the ban',
                    },
                  },
                  {
                    name: 'banExpires',
                    type: 'date',
                    label: 'Ban Expires',
                    admin: {
                      description: 'The date and time when the ban will expire',
                    },
                  },
                )
                break
              case 'harmony-email':
                usersCollection.fields.push({
                  name: 'normalizedEmail',
                  type: 'text',
                  required: false,
                  unique: true,
                  admin: {
                    readOnly: true,
                    description: 'The normalized email of the user',
                  },
                })
                break
              default:
                break
            }
          })
        }
        
        if (pluginOptions.users?.collectionOverrides) {
          usersCollection = pluginOptions.users.collectionOverrides({ collection: usersCollection })
        }
        
        enhancedCollections.push(usersCollection)
        break
      case baseCollectionSlugs.accounts:
        const existingAccountCollection = incomingCollections.find(
          (collection) => collection.slug === accountSlug,
        ) as CollectionConfig | undefined
        let accountCollection: CollectionConfig = {
          slug: accountSlug,
          admin: {
            useAsTitle: 'accountId',
            description: 'Accounts are used to store user accounts for authentication providers',
            ...existingAccountCollection?.admin,
            hidden: pluginOptions.accounts?.hidden,
          },
          hooks: {
            afterChange: [
              ...(existingAccountCollection?.hooks?.afterChange ?? []),
              getSyncPasswordToUserHook({
                userSlug,
                accountSlug,
              }),
            ],
          },
          access: {
            create: isAdminWithRoles({ adminRoles }),
            delete: isAdminWithRoles({ adminRoles }),
            read: isAdminOrCurrentUserWithRoles({ adminRoles, idField: 'user' }),
            update: isAdminWithRoles({ adminRoles }),
            ...(existingAccountCollection?.access ?? {}),
          },
          fields: [
            ...(existingAccountCollection?.fields ?? []),
            {
              name: 'user',
              type: 'relationship',
              relationTo: userSlug,
              required: true,
              index: true,
              label: 'User',
              admin: {
                readOnly: true,
                description: 'The user that the account belongs to',
              },
            },
            {
              name: 'accountId',
              type: 'text',
              label: 'Account ID',
              required: true,
              index: true,
              admin: {
                readOnly: true,
                description:
                  'The id of the account as provided by the SSO or equal to userId for credential accounts',
              },
            },
            {
              name: 'providerId',
              type: 'text',
              required: true,
              label: 'Provider ID',
              admin: {
                readOnly: true,
                description: 'The id of the provider as provided by the SSO',
              },
            },
            {
              name: 'accessToken',
              type: 'text',
              label: 'Access Token',
              admin: {
                readOnly: true,
                description: 'The access token of the account. Returned by the provider',
              },
            },
            {
              name: 'refreshToken',
              type: 'text',
              label: 'Refresh Token',
              admin: {
                readOnly: true,
                description: 'The refresh token of the account. Returned by the provider',
              },
            },
            {
              name: 'accessTokenExpiresAt',
              type: 'date',
              label: 'Access Token Expires At',
              admin: {
                readOnly: true,
                description: 'The date and time when the access token will expire',
              },
            },
            {
              name: 'refreshTokenExpiresAt',
              type: 'date',
              label: 'Refresh Token Expires At',
              admin: {
                readOnly: true,
                description: 'The date and time when the refresh token will expire',
              },
            },
            {
              name: 'scope',
              type: 'text',
              label: 'Scope',
              admin: {
                readOnly: true,
                description: 'The scope of the account. Returned by the provider',
              },
            },
            {
              name: 'idToken',
              type: 'text',
              label: 'ID Token',
              admin: {
                readOnly: true,
                description: 'The id token for the account. Returned by the provider',
              },
            },
            {
              name: 'password',
              type: 'text',
              label: 'Password',
              admin: {
                readOnly: true,
                hidden: true,
                description:
                  'The hashed password of the account. Mainly used for email and password authentication',
              },
            },
            ...getTimestampFields(),
          ],
          ...existingAccountCollection,
        }
        if (pluginOptions.accounts?.collectionOverrides) {
          accountCollection = pluginOptions.accounts.collectionOverrides({ collection: accountCollection })
        }
        
        enhancedCollections.push(accountCollection)
        break
      case baseCollectionSlugs.sessions:
        const existingSessionCollection = incomingCollections.find(
          (collection) => collection.slug === sessionSlug,
        ) as CollectionConfig | undefined
        let sessionCollection: CollectionConfig = {
          slug: sessionSlug,
          admin: {
            ...existingSessionCollection?.admin,
            hidden: pluginOptions.sessions?.hidden,
            description:
              'Sessions are active sessions for users. They are used to authenticate users with a session token',
          },
          fields: [
            ...(existingSessionCollection?.fields ?? []),
            {
              name: 'user',
              type: 'relationship',
              relationTo: userSlug,
              required: true,
              saveToJWT: true,
              index: true,
              admin: {
                readOnly: true,
                description: 'The user that the session belongs to',
              },
            },
            {
              name: 'token',
              type: 'text',
              required: true,
              unique: true,
              index: true,
              saveToJWT: true,
              label: 'Token',
              admin: {
                description: 'The unique session token',
                readOnly: true,
              },
            },
            {
              name: 'expiresAt',
              type: 'date',
              required: true,
              label: 'Expires At',
              saveToJWT: true,
              admin: {
                description: 'The date and time when the session will expire',
                readOnly: true,
              },
            },
            {
              name: 'ipAddress',
              type: 'text',
              label: 'IP Address',
              saveToJWT: true,
              admin: {
                description: 'The IP address of the device',
                readOnly: true,
              },
            },
            {
              name: 'userAgent',
              type: 'text',
              label: 'User Agent',
              saveToJWT: true,
              admin: {
                description: 'The user agent information of the device',
                readOnly: true,
              },
            },
            ...getTimestampFields(),
          ],
          ...existingSessionCollection,
        }
        if (baPlugins) {
          baPlugins.forEach((plugin) => {
            switch (plugin.id) {
              case 'admin':
                sessionCollection.fields.push({
                  name: 'impersonatedBy',
                  type: 'relationship',
                  relationTo: userSlug,
                  required: false,
                  label: 'Impersonated By',
                  admin: {
                    readOnly: true,
                    description: 'The admin who is impersonating this session',
                  },
                })
                break
              case 'organization':
                sessionCollection.fields.push({
                  name: 'activeOrganization',
                  type: 'relationship',
                  relationTo: betterAuthPluginSlugs.organizations,
                  label: 'Active Organization',
                  admin: {
                    readOnly: true,
                    description: 'The currently active organization for the session',
                  },
                })
                break
              default:
                break
            }
          })
        }

        if (pluginOptions.sessions?.collectionOverrides) {
          sessionCollection = pluginOptions.sessions.collectionOverrides({ collection: sessionCollection })
        }

        enhancedCollections.push(sessionCollection)
        break
      case baseCollectionSlugs.verifications:
        const existingVerificationCollection = incomingCollections.find(
          (collection) => collection.slug === verificationSlug,
        )
        const verificationCollection: CollectionConfig = {
          slug: verificationSlug,
          admin: {
            ...existingVerificationCollection?.admin,
            hidden: pluginOptions.verifications?.hidden,
            useAsTitle: 'identifier',
            description: 'Verifications are used to verify authentication requests',
          },
          fields: [
            ...(existingVerificationCollection?.fields ?? []),
            {
              name: 'identifier',
              type: 'text',
              required: true,
              index: true,
              label: 'Identifier',
              admin: {
                description: 'The identifier of the verification request',
                readOnly: true,
              },
            },
            {
              name: 'value',
              type: 'text',
              required: true,
              label: 'Value',
              admin: {
                description: 'The value to be verified',
                readOnly: true,
              },
            },
            {
              name: 'expiresAt',
              type: 'date',
              required: true,
              label: 'Expires At',
              admin: {
                description: 'The date and time when the verification request will expire',
                readOnly: true,
              },
            },
          ],
          timestamps: true,
          ...existingVerificationCollection,
        }
        enhancedCollections.push(verificationCollection)
        break
      case betterAuthPluginSlugs.organizations:
        const organizationCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.organizations,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            useAsTitle: 'name',
            description:
              'Organizations are groups of users that share access to certain resources.',
          },
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              label: 'Name',
              admin: {
                description: 'The name of the organization.',
              },
            },
            {
              name: 'slug',
              type: 'text',
              unique: true,
              index: true,
              label: 'Slug',
              admin: {
                description: 'The slug of the organization.',
              },
            },
            {
              name: 'logo',
              type: 'text',
              label: 'Logo',
              admin: {
                description: 'The logo of the organization.',
              },
            },
            {
              name: 'metadata',
              type: 'json',
              label: 'Metadata',
              admin: {
                description: 'Additional metadata for the organization.',
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(organizationCollection)
        break
      case betterAuthPluginSlugs.members:
        const memberCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.members,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            useAsTitle: 'organization',
            description: 'Members of an organization.',
          },
          fields: [
            {
              name: 'organization',
              type: 'relationship',
              relationTo: betterAuthPluginSlugs.organizations,
              required: true,
              index: true,
              label: 'Organization',
              admin: {
                readOnly: true,
                description: 'The organization that the member belongs to.',
              },
            },
            {
              name: 'user',
              type: 'relationship',
              relationTo: userSlug,
              required: true,
              index: true,
              label: 'User',
              admin: {
                readOnly: true,
                description: 'The user that is a member of the organization.',
              },
            },
            {
              name: 'team',
              type: 'relationship',
              relationTo: betterAuthPluginSlugs.teams,
              required: false,
              label: 'Team',
              admin: {
                description: 'The team that the member belongs to.',
              },
            },
            {
              name: 'role',
              type: 'text',
              required: true,
              defaultValue: 'member',
              label: 'Role',
              admin: {
                description: 'The role of the member in the organization.',
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(memberCollection)
        break
      case betterAuthPluginSlugs.invitations:
        const invitationCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.invitations,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            useAsTitle: 'email',
            description: 'Invitations to join an organization',
          },
          fields: [
            {
              name: 'email',
              type: 'text',
              required: true,
              index: true,
              label: 'Email',
              admin: {
                description: 'The email of the user being invited.',
                readOnly: true,
              },
            },
            {
              name: 'inviter',
              type: 'relationship',
              relationTo: userSlug,
              required: true,
              label: 'Inviter',
              admin: {
                description: 'The user who invited the user.',
                readOnly: true,
              },
            },
            {
              name: 'organization',
              type: 'relationship',
              relationTo: betterAuthPluginSlugs.organizations,
              required: true,
              index: true,
              label: 'Organization',
              admin: {
                description: 'The organization that the user is being invited to.',
                readOnly: true,
              },
            },
            {
              name: 'role',
              type: 'text',
              required: true,
              label: 'Role',
              admin: {
                description: 'The role of the user being invited.',
                readOnly: true,
              },
            },
            {
              name: 'status',
              type: 'text',
              required: true,
              defaultValue: 'pending',
              label: 'Status',
              admin: {
                description: 'The status of the invitation.',
                readOnly: true,
              },
            },
            {
              name: 'expiresAt',
              type: 'date',
              required: true,
              label: 'Expires At',
              admin: {
                description: 'The date and time when the invitation will expire.',
                readOnly: true,
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(invitationCollection)
        break
      case betterAuthPluginSlugs.teams:
        const teamCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.teams,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            useAsTitle: 'name',
            description: 'Teams are groups of users that share access to certain resources.',
          },
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              label: 'Name',
              admin: {
                description: 'The name of the team.',
              },
            },
            {
              name: 'organization',
              type: 'relationship',
              relationTo: betterAuthPluginSlugs.organizations,
              required: true,
              label: 'Organization',
              admin: {
                readOnly: true,
                description: 'The organization that the team belongs to.',
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(teamCollection)
        break
      case betterAuthPluginSlugs.jwks:
        const jwksCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.jwks,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            useAsTitle: 'publicKey',
            description: 'JWKS are used to verify the signature of the JWT token',
          },
          fields: [
            {
              name: 'publicKey',
              type: 'text',
              required: true,
              index: true,
              label: 'Public Key',
              admin: {
                description: 'The public part of the web key',
              },
            },
            {
              name: 'privateKey',
              type: 'text',
              required: true,
              label: 'Private Key',
              admin: {
                description: 'The private part of the web key',
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(jwksCollection)
        break
      case betterAuthPluginSlugs.apiKeys:
        const apiKeyCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.apiKeys,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            useAsTitle: 'name',
            description: 'API keys are used to authenticate requests to the API.',
          },
          fields: [
            {
              name: 'name',
              type: 'text',
              label: 'Name',
              admin: {
                readOnly: true,
                description: 'The name of the API key.',
              },
            },
            {
              name: 'start',
              type: 'text',
              label: 'Starting Characters',
              admin: {
                readOnly: true,
                description:
                  'The starting characters of the API key. Useful for showing the first few characters of the API key in the UI for the users to easily identify.',
              },
            },
            {
              name: 'prefix',
              type: 'text',
              label: 'Prefix',
              admin: {
                readOnly: true,
                description: 'The API Key prefix. Stored as plain text.',
              },
            },
            {
              name: 'key',
              type: 'text',
              required: true,
              label: 'API Key',
              admin: {
                readOnly: true,
                description: 'The hashed API key itself.',
              },
            },
            {
              name: 'user',
              type: 'relationship',
              relationTo: userSlug,
              required: true,
              label: 'User',
              admin: {
                readOnly: true,
                description: 'The user associated with the API key.',
              },
            },
            {
              name: 'refillInterval',
              type: 'number',
              label: 'Refill Interval',
              admin: {
                readOnly: true,
                description: 'The interval to refill the key in milliseconds.',
              },
            },
            {
              name: 'refillAmount',
              type: 'number',
              label: 'Refill Amount',
              admin: {
                readOnly: true,
                description: 'The amount to refill the remaining count of the key.',
              },
            },
            {
              name: 'lastRefillAt',
              type: 'date',
              label: 'Last Refill At',
              admin: {
                readOnly: true,
                description: 'The date and time when the key was last refilled.',
              },
            },
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: true,
              label: 'Enabled',
              admin: {
                readOnly: true,
                description: 'Whether the API key is enabled.',
              },
            },
            {
              name: 'rateLimitEnabled',
              type: 'checkbox',
              defaultValue: true,
              label: 'Rate Limit Enabled',
              admin: {
                readOnly: true,
                description: 'Whether the API key has rate limiting enabled.',
              },
            },
            {
              name: 'rateLimitTimeWindow',
              type: 'number',
              label: 'Rate Limit Time Window',
              admin: {
                readOnly: true,
                description: 'The time window in milliseconds for the rate limit.',
              },
            },
            {
              name: 'rateLimitMax',
              type: 'number',
              label: 'The maximum number of requests allowed within the `rateLimitTimeWindow`.',
              admin: {
                readOnly: true,
                description:
                  'The maximum number of requests allowed within the rate limit time window.',
              },
            },
            {
              name: 'requstCount',
              type: 'number',
              label: 'Request Count',
              required: true,
              admin: {
                readOnly: true,
                description: 'The number of requests made within the rate limit time window.',
              },
            },
            {
              name: 'remaining',
              type: 'number',
              label: 'Remaining Requests',
              admin: {
                readOnly: true,
                description: 'The number of requests remaining.',
              },
            },
            {
              name: 'lastRequest',
              type: 'date',
              label: 'Last Request At',
              admin: {
                readOnly: true,
                description: 'The date and time of the last request made to the key.',
              },
            },
            {
              name: 'expiresAt',
              type: 'date',
              label: 'Expires At',
              admin: {
                readOnly: true,
                description: 'The date and time of when the API key will expire.',
              },
            },
            {
              name: 'permissions',
              type: 'text',
              label: 'Permissions',
              admin: {
                readOnly: true,
                description: 'The permissions for the API key.',
              },
            },
            {
              name: 'metadata',
              type: 'json',
              label: 'Metadata',
              admin: {
                readOnly: true,
                description: 'Any additional metadata you want to store with the key.',
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(apiKeyCollection)
        break
      case betterAuthPluginSlugs.twoFactors:
        const twoFactorCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.twoFactors,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            useAsTitle: 'secret',
            description: 'Two factor authentication secrets',
          },
          fields: [
            {
              name: 'user',
              type: 'relationship',
              relationTo: userSlug,
              required: true,
              label: 'User',
              admin: {
                readOnly: true,
                description: 'The user that the two factor authentication secret belongs to',
              },
            },
            {
              name: 'secret',
              type: 'text',
              label: 'Secret',
              index: true,
              admin: {
                readOnly: true,
                description: 'The secret used to generate the TOTP code.',
              },
            },
            {
              name: 'backupCodes',
              type: 'text',
              required: true,
              label: 'Backup Codes',
              admin: {
                readOnly: true,
                description:
                  'The backup codes used to recover access to the account if the user loses access to their phone or email',
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(twoFactorCollection)
        break
      case betterAuthPluginSlugs.oauthAccessTokens:
        const oauthAccessTokenCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.oauthAccessTokens,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            useAsTitle: 'accessToken',
            description: 'OAuth access tokens for custom OAuth clients',
          },
          fields: [
            {
              name: 'accessToken',
              type: 'text',
              required: true,
              index: true,
              label: 'Access Token',
              admin: {
                readOnly: true,
                description: 'Access token issued to the client',
              },
            },
            {
              name: 'refreshToken',
              type: 'text',
              required: true,
              label: 'Refresh Token',
              admin: {
                readOnly: true,
                description: 'Refresh token issued to the client',
              },
            },
            {
              name: 'accessTokenExpiresAt',
              type: 'date',
              required: true,
              label: 'Access Token Expires At',
              admin: {
                readOnly: true,
                description: 'Expiration date of the access token',
              },
            },
            {
              name: 'refreshTokenExpiresAt',
              type: 'date',
              required: true,
              label: 'Refresh Token Expires At',
              admin: {
                readOnly: true,
                description: 'Expiration date of the refresh token',
              },
            },
            {
              name: 'client',
              type: 'relationship',
              relationTo: betterAuthPluginSlugs.oauthApplications,
              required: true,
              label: 'Client',
              admin: {
                readOnly: true,
                description: 'OAuth application associated with the access token',
              },
            },
            {
              name: 'user',
              type: 'relationship',
              relationTo: userSlug,
              required: true,
              label: 'User',
              admin: {
                readOnly: true,
                description: 'User associated with the access token',
              },
            },
            {
              name: 'scopes',
              type: 'text',
              required: true,
              label: 'Scopes',
              admin: {
                description: 'Comma-separated list of scopes granted',
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(oauthAccessTokenCollection)
        break
      case betterAuthPluginSlugs.oauthApplications:
        const oauthApplicationCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.oauthApplications,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            useAsTitle: 'name',
            description: 'OAuth applications are custom OAuth clients',
          },
          fields: [
            {
              name: 'clientId',
              type: 'text',
              unique: true,
              index: true,
              required: true,
              label: 'Client ID',
              admin: {
                readOnly: true,
                description: 'Unique identifier for each OAuth client',
              },
            },
            {
              name: 'clientSecret',
              type: 'text',
              required: true,
              label: 'Client Secret',
              admin: {
                readOnly: true,
                description: 'Secret key for the OAuth client',
              },
            },
            {
              name: 'name',
              type: 'text',
              required: true,
              index: true,
              label: 'Name',
              admin: {
                description: 'Name of the OAuth application',
              },
            },
            {
              name: 'redirectURLs',
              type: 'text',
              required: true,
              label: 'Redirect URLs',
              admin: {
                description: 'Comma-separated list of redirect URLs',
              },
            },
            {
              name: 'metadata',
              type: 'json',
              admin: {
                readOnly: true,
                description: 'Additional metadata for the OAuth application',
              },
            },
            {
              name: 'type',
              type: 'text',
              required: true,
              label: 'Type',
              admin: {
                readOnly: true,
                description: 'Type of OAuth client (e.g., web, mobile)',
              },
            },
            {
              name: 'disabled',
              type: 'checkbox',
              defaultValue: false,
              required: true,
              label: 'Disabled',
              admin: {
                description: 'Indicates if the client is disabled',
              },
            },
            {
              name: 'icon',
              type: 'text',
              label: 'Icon',
              admin: {
                description: 'Icon of the OAuth application',
              },
            },
            {
              name: 'user',
              type: 'relationship',
              relationTo: userSlug,
              required: false,
              label: 'User',
              admin: {
                readOnly: true,
                description: 'ID of the user who owns the client. (optional)',
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(oauthApplicationCollection)
        break
      case betterAuthPluginSlugs.oauthConsents:
        const oauthConsentCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.oauthConsents,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            description: 'OAuth consents are used to store user consents for OAuth clients',
          },
          fields: [
            {
              name: 'client',
              type: 'relationship',
              relationTo: betterAuthPluginSlugs.oauthApplications,
              required: true,
              label: 'Client',
              admin: {
                readOnly: true,
                description: 'OAuth client associated with the consent',
              },
            },
            {
              name: 'user',
              type: 'relationship',
              relationTo: userSlug,
              required: true,
              label: 'User',
              admin: {
                readOnly: true,
                description: 'User associated with the consent',
              },
            },
            {
              name: 'scopes',
              type: 'text',
              required: true,
              label: 'Scopes',
              admin: {
                readOnly: true,
                description: 'Comma-separated list of scopes consented to',
              },
            },
            {
              name: 'consentGiven',
              type: 'checkbox',
              defaultValue: false,
              required: true,
              label: 'Consent Given',
              admin: {
                readOnly: true,
                description: '	Indicates if consent was given',
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(oauthConsentCollection)
        break
      case betterAuthPluginSlugs.passkeys:
        const passkeyCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.passkeys,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            useAsTitle: 'name',
            description: 'Passkeys are used to authenticate users',
          },
          fields: [
            {
              name: 'name',
              type: 'text',
              label: 'Name',
              admin: {
                readOnly: true,
                description: 'The name of the passkey',
              },
            },
            {
              name: 'publicKey',
              type: 'text',
              required: true,
              index: true,
              label: 'Public Key',
              admin: {
                readOnly: true,
                description: 'The public key of the passkey',
              },
            },
            {
              name: 'user',
              type: 'relationship',
              relationTo: userSlug,
              required: true,
              index: true,
              label: 'User',
              admin: {
                readOnly: true,
                description: 'The user that the passkey belongs to',
              },
            },
            {
              name: 'credentialID',
              type: 'text',
              required: true,
              unique: true,
              label: 'Credential ID',
              admin: {
                readOnly: true,
                description: 'The unique identifier of the registered credential',
              },
            },
            {
              name: 'counter',
              type: 'number',
              required: true,
              label: 'Counter',
              admin: {
                readOnly: true,
                description: 'The counter of the passkey',
              },
            },
            {
              name: 'deviceType',
              type: 'text',
              required: true,
              label: 'Device Type',
              admin: {
                readOnly: true,
                description: 'The type of device used to register the passkey',
              },
            },
            {
              name: 'backedUp',
              type: 'checkbox',
              required: true,
              label: 'Backed Up',
              admin: {
                readOnly: true,
                description: 'Whether the passkey is backed up',
              },
            },
            {
              name: 'transports',
              type: 'text',
              required: true,
              label: 'Transports',
              admin: {
                readOnly: true,
                description: 'The transports used to register the passkey',
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(passkeyCollection)
        break
      case betterAuthPluginSlugs.ssoProviders:
        const ssoProviderCollection: CollectionConfig = {
          slug: betterAuthPluginSlugs.ssoProviders,
          admin: {
            hidden: pluginOptions.hidePluginCollections ?? false,
            useAsTitle: 'issuer',
            description: 'SSO providers are used to authenticate users with an external provider',
          },
          fields: [
            {
              name: 'issuer',
              type: 'text',
              required: true,
              index: true,
              label: 'Issuer',
              admin: {
                description: 'The issuer of the SSO provider',
              },
            },
            {
              name: 'domain',
              type: 'text',
              required: true,
              label: 'Domain',
              admin: {
                description: 'The domain of the SSO provider',
              },
            },
            {
              name: 'oidcConfig',
              type: 'text',
              required: true,
              label: 'OIDC Config',
              admin: {
                description: 'The OIDC config of the SSO provider',
              },
            },
            {
              name: 'user',
              type: 'relationship',
              relationTo: userSlug,
              required: true,
              label: 'User',
              admin: {
                description: 'The user associated with the SSO provider',
              },
            },
            {
              name: 'providerId',
              type: 'text',
              required: true,
              label: 'Provider ID',
              admin: {
                readOnly: true,
                description:
                  'The provider id. Used to identify a provider and to generate a redirect url',
              },
            },
            {
              name: 'organizationId',
              type: 'text',
              required: true,
              label: 'Organization ID',
              admin: {
                readOnly: true,
                description: 'The organization Id. If provider is linked to an organization',
              },
            },
          ],
          timestamps: true,
        }
        enhancedCollections.push(ssoProviderCollection)
        break
      default:
        break
    }
  })

  const restOfCollections = incomingCollections.filter((collection) => {
    return !enhancedCollections.some(
      (enhancedCollection) => enhancedCollection.slug === collection.slug,
    )
  })

  return [...enhancedCollections, ...restOfCollections]
}
