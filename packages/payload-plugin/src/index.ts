import { getPayload } from 'payload'
import type { BasePayload, Config, SanitizedConfig } from 'payload'
import type {
  BetterAuthFunctionOptions,
  BetterAuthReturn,
  PayloadBetterAuthPluginOptions,
  TPlugins,
} from './types.js'
import { sanitizeBetterAuthOptions } from './lib/sanitize-auth-options.js'
import { getRequiredCollectionSlugs } from './lib/get-required-collection-slugs.js'
import { buildCollectionConfigs } from './lib/build-collection-configs.js'
import { payloadAdapter } from '@payload-auth/better-auth-db-adapter'
import { betterAuth } from 'better-auth'
import { setAfterAuthMiddlewareHook } from './lib/set-after-auth-middleware-hook.js'
import { syncVerificationSettings } from './lib/sync-verification-settings.js'

export * from './types.js'
export * from './helpers/index.js'

function initBetterAuth<P extends TPlugins>({
  payload,
  options,
}: {
  payload: BasePayload
  options: BetterAuthFunctionOptions<P>
}): BetterAuthReturn<P> {
  const auth = betterAuth({
    ...options,
    database: payloadAdapter(payload, {
      enableDebugLogs: options.enableDebugLogs ?? false,
    }),
  })

  return auth as unknown as BetterAuthReturn<P>
}

export function payloadBetterAuth(pluginOptions: PayloadBetterAuthPluginOptions) {
  return (config: Config): Config => {
    if (pluginOptions.disabled) {
      return config
    }

    if (!config.collections) {
      config.collections = []
    }

    let sanitzedBetterAuthOptions = sanitizeBetterAuthOptions(pluginOptions)

    // Determine which collections to add based on the options and plugins
    const requiredCollectionSlugs = getRequiredCollectionSlugs({
      logTables: pluginOptions.logTables ?? false,
      pluginOptions,
      sanitizedBAOptions: sanitzedBetterAuthOptions,
    })

    // Update with the required collections + existing collections
    config.collections = buildCollectionConfigs({
      incomingCollections: config.collections ?? [],
      requiredCollectionSlugs,
      pluginOptions,
      sanitizedBAOptions: sanitzedBetterAuthOptions,
    })

    syncVerificationSettings({
      collections: config.collections,
      sanitizedBAOptions: sanitzedBetterAuthOptions,
    })

    setAfterAuthMiddlewareHook({
      sanitizedOptions: sanitzedBetterAuthOptions,
      payloadConfig: config,
      pluginOptions,
    })

    const incomingOnInit = config.onInit

    config.onInit = async (payload) => {
      // Ensure we are executing any existing onInit functions before running our own.
      if (incomingOnInit) {
        await incomingOnInit(payload)
      }

      // Initialize and set the betterAuth instance
      const auth = initBetterAuth<NonNullable<typeof sanitzedBetterAuthOptions.plugins>>({
        payload,
        options: {
          ...sanitzedBetterAuthOptions,
          enableDebugLogs: pluginOptions.enableDebugLogs,
          plugins: [...(sanitzedBetterAuthOptions.plugins ?? [])],
        },
      })

      ;(payload as BasePayload & { betterAuth: typeof auth }).betterAuth = auth
    }
    return config
  }
}

export async function getPayloadWithAuth<P extends TPlugins>(
  config: Promise<SanitizedConfig> | SanitizedConfig,
): Promise<BasePayload & { betterAuth: BetterAuthReturn<P> }> {
  const payload = (await getPayload({ config })) as BasePayload & {
    betterAuth: BetterAuthReturn<P>
  }
  return payload
}
