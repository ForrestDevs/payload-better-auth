import { SignJWT } from 'jose';

/**
 * Generates a verification URL for email verification
 * 
 * This utility function creates a JWT token containing the user's email and
 * expiration information, signs it with the provided secret, and constructs
 * a verification URL with the token as a query parameter.
 * 
 * @param params.userEmail - The email address of the user to verify
 * @param params.secret - The secret used to sign the JWT
 * @param params.expiresIn - Duration in seconds for token expiration (default: 3600)
 * @param params.verifyRouteUrl - The base URL for the verification endpoint
 * @param params.callbackURL - Optional callback URL after verification (default: "/")
 * @returns The complete verification URL with token
 * 
 * @example
 * const url = await generateVerifyEmailUrl({
 *   userEmail: 'user@example.com',
 *   secret: 'your-secret-key',
 *   verifyRouteUrl: 'https://your-app.com/api/auth/verify-email',
 *   callbackURL: '/profile'
 * });
 */
export const generateVerifyEmailUrl = async ({
  userEmail,
  secret,
  expiresIn = 3600,
  verifyRouteUrl,
  callbackURL = '/',
}: {
  userEmail: string;
  secret: string;
  expiresIn?: number;
  verifyRouteUrl: string;
  callbackURL?: string;
}): Promise<string> => {
  if (!userEmail) {
    throw new Error('userEmail is required to generate a verification URL');
  }
  
  if (!secret) {
    throw new Error('secret is required to sign the JWT token');
  }
  
  if (!verifyRouteUrl) {
    throw new Error('verifyRouteUrl is required to generate a verification URL');
  }

  // Create and sign the JWT token
  const jwt = await new SignJWT({
    email: userEmail,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(secret));

  // Build the verification URL
  const verifyUrl = `${verifyRouteUrl}?token=${jwt}${callbackURL ? `&callbackURL=${encodeURIComponent(callbackURL)}` : ''}`;
  
  return verifyUrl;
};
