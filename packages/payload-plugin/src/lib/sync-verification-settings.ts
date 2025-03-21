import type { CollectionConfig } from 'payload'
import type { SanitizedBetterAuthOptions } from '../types.js'

/**
 * Syncs the verification settings between the collections and the BetterAuth options bidirectionally:
 * 1. If any collection with auth has verify=true → set requireEmailVerification=true in BetterAuth options
 * 2. If BetterAuth options has requireEmailVerification=true → set verify=true on all collections with auth
 */
export function syncVerificationSettings({
  collections,
  sanitizedBAOptions,
}: {
  collections: CollectionConfig[]
  sanitizedBAOptions: SanitizedBetterAuthOptions
}): void {
  const authCollection = collections.find(collection => Boolean(collection.auth)) || null
  const hasVerify = authCollection?.auth && typeof authCollection.auth === 'object' && Boolean(authCollection.auth.verify)
  
  if (hasVerify && 
      (!sanitizedBAOptions.emailAndPassword || 
       sanitizedBAOptions.emailAndPassword.requireEmailVerification !== true)) {
    
    sanitizedBAOptions.emailAndPassword = sanitizedBAOptions?.emailAndPassword || { enabled: true }
    sanitizedBAOptions.emailAndPassword.requireEmailVerification = true
  }
  
  if (sanitizedBAOptions.emailAndPassword?.requireEmailVerification === true &&
      authCollection?.auth && 
      typeof authCollection.auth === 'object' &&
      !authCollection.auth.verify) {
    
    authCollection.auth.verify = true
  }
} 