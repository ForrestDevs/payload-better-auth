import type { UnionToIntersection, betterAuth } from 'better-auth'
import type {
  BetterAuthOptions,
  BetterAuthPlugin,
  InferAPI,
  InferPluginTypes,
} from 'better-auth/types'
import type { BasePayload, CollectionConfig, Config, Endpoint, PayloadRequest } from 'payload'

/**
 * BetterAuth options with the following caveats:
 * - The `database` option is removed as it is configured internally
 * - The `user` `modelName` and `fields` is removed as it is configured internally
 * - The `account` `modelName` and `fields` is removed as it is configured internally
 * - The `session` `modelName` and `fields` is removed as it is configured internally
 * - The `verification` `modelName` and `fields` is removed as it is configured internally
 *
 * @see https://www.better-auth.com/docs/reference/options
 */
export interface PayloadBetterAuthOptions
  extends Omit<
    BetterAuthOptions,
    'database' | 'user' | 'account' | 'verification' | 'session' | 'advanced'
  > {
  user?: Omit<NonNullable<BetterAuthOptions['user']>, 'modelName' | 'fields'> | undefined
  account?: Omit<NonNullable<BetterAuthOptions['account']>, 'modelName' | 'fields'> | undefined
  session?: Omit<NonNullable<BetterAuthOptions['session']>, 'modelName' | 'fields'> | undefined
  verification?:
    | Omit<NonNullable<BetterAuthOptions['verification']>, 'modelName' | 'fields'>
    | undefined
  advanced?: Omit<NonNullable<BetterAuthOptions['advanced']>, 'generateId'> | undefined
}

export interface SanitizedBetterAuthOptions extends Omit<BetterAuthOptions, 'database'> {}

export interface PayloadBetterAuthPluginOptions {
  /**
   * Disable the plugin
   * @default false
   */
  disabled?: boolean
  /**
   * Enable debug logs
   * @default false
   */
  enableDebugLogs?: boolean
  /**
   * Log the tables that are needed for better-auth on init
   * @default false
   */
  logTables?: boolean
  /**
   * Hide the plugin collections from the payload admin UI
   * @default false
   */
  hidePluginCollections?: boolean
  /**
   * Configure the Users collections:
   */
  users?: {
    /**
     * Will set the `modelName` for the `user` table in better-auth
     *
     * and the `slug` for the `users` collection in payload
     *
     * @default 'users'
     */
    slug?: string | undefined
    /**
     * Define better-auth admin plugin access control
     *
     * This will also set the role which gives the user access to the payload admin UI
     * @see https://www.better-auth.com/docs/plugins/admin#access-control
     *
     * @default ["admin"]
     */
    adminRoles?: string[]
    /**
     * Define roles for the users collection
     *
     * This should match the roles in the better-auth admin plugin if you are using it
     * @see https://www.better-auth.com/docs/plugins/admin#access-control
     */
    roles?: string[]
    /**
     * Hide the `users` collection from the payload admin UI
     */
    hidden?: boolean | undefined
    /**
     * Define which fields users can update themselves
     *
     * Password field is automatically included and doesn't need to be specified here
     *
     * @example ['name', 'dateOfBirth', 'phoneNumber']
     * @default ['name']
     */
    allowedFields?: string[] | undefined
    /**
     * Function to override the collection configuration
     * 
     * This allows modifying the collection config after it has been built
     * Example use cases include adding saveToJwt to specific fields or
     * modifying field descriptions
     * 
     * @param options Object containing the collection config and potentially additional parameters
     * @returns Modified collection config
     */
    collectionOverrides?: (options: { collection: CollectionConfig }) => CollectionConfig
  }
  /**
   * Configure the Accounts collections:
   */
  accounts?: {
    /**
     * Will set the `modelName` for the `account` table in better-auth
     *
     * and the `slug` for the `accounts` collection in payload
     *
     * @default 'accounts'
     */
    slug?: string | undefined
    /**
     * Hide the `accounts` collection from the payload admin UI
     */
    hidden?: boolean | undefined
    /**
     * Function to override the collection configuration
     * 
     * This allows modifying the collection config after it has been built
     * 
     * @param options Object containing the collection config and potentially additional parameters
     * @returns Modified collection config
     */
    collectionOverrides?: (options: { collection: CollectionConfig }) => CollectionConfig
  }
  /**
   * Configure the Sessions collections:
   */
  sessions?: {
    /**
     * Will set the `modelName` for the `session` table in better-auth
     *
     * and the `slug` for the `sessions` collection in payload
     *
     * @default 'sessions'
     */
    slug?: string | undefined
    /**
     * Hide the `sessions` collection from the payload admin UI
     */
    hidden?: boolean | undefined
    /**
     * Function to override the collection configuration
     * 
     * This allows modifying the collection config after it has been built
     * 
     * @param options Object containing the collection config and potentially additional parameters
     * @returns Modified collection config
     */
    collectionOverrides?: (options: { collection: CollectionConfig }) => CollectionConfig
  }
  /**
   * Configure the Verifications collections:
   */
  verifications?: {
    /**
     * Will set the `modelName` for the `verification` table in better-auth
     *
     * and the `slug` for the `verifications` collection in payload
     *
     * @default 'verifications'
     */
    slug?: string | undefined
    /**
     * Hide the `verifications` collection from the payload admin UI
     */
    hidden?: boolean | undefined
  }
  /**
   * BetterAuth options with the following caveats:
   * - The `database` option is removed as it is configured internally
   * - The `user` `modelName` and `fields` is removed as it is configured internally
   * - The `account` `modelName` and `fields` is removed as it is configured internally
   * - The `session` `modelName` and `fields` is removed as it is configured internally
   * - The `verification` `modelName` and `fields` is removed as it is configured internally
   *
   * @see https://www.better-auth.com/docs/reference/options
   */
  betterAuthOptions?: PayloadBetterAuthOptions
}

export interface PayloadBetterAuthPlugin {
  (config: Config): Config
  pluginOptions: PayloadBetterAuthPluginOptions
}

export interface PayloadRequestWithBetterAuth<TPlugins extends BetterAuthPlugin[] = []>
  extends PayloadRequest {
  payload: BasePayload & {
    betterAuth: BetterAuthReturn<TPlugins>
  }
}

export type CollectionHookWithBetterAuth<T extends (args: any) => any> = T extends (
  args: infer A,
) => infer R
  ? (args: Omit<A, 'req'> & { req: PayloadRequestWithBetterAuth }) => R
  : never

export type EndpointWithBetterAuth = Omit<Endpoint, 'handler'> & {
  handler: (req: PayloadRequestWithBetterAuth) => Promise<Response> | Response
}

export type ExtractEndpoints<T> = T extends BetterAuthPlugin
  ? T extends { endpoints?: infer E }
    ? E
    : {}
  : {}

export type TPlugins<TPlugins extends BetterAuthPlugin[] = BetterAuthPlugin[]> = TPlugins
export type PluginInferTypes<T extends TPlugins> = {
  [K in keyof InferPluginTypes<{ plugins: T }>]: InferPluginTypes<{ plugins: T }>[K]
}

export type BetterAuthReturn<T extends TPlugins> = Omit<ReturnType<typeof betterAuth>, '$Infer'> & {
  api: T extends (infer P)[] ? InferAPI<UnionToIntersection<ExtractEndpoints<P>>> : {}
  $Infer: ReturnType<typeof betterAuth>['$Infer'] & PluginInferTypes<T>
}

export type BetterAuthFunctionOptions<P extends TPlugins> = Omit<
  BetterAuthOptions,
  'database' | 'plugins'
> & {
  enableDebugLogs?: boolean
  plugins: P
}
