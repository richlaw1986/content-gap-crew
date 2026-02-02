/**
 * Server-side environment validation.
 * Import this in server components or API routes to validate env at startup.
 */

import { getServerEnv } from './env';

// Validate on first import (server-side only)
if (typeof window === 'undefined') {
  try {
    const env = getServerEnv();
    
    // Production-specific validations
    if (process.env.NODE_ENV === 'production') {
      // Ensure at least one OAuth provider is configured
      const hasOAuth = 
        (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) ||
        (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
      
      if (!hasOAuth) {
        console.warn(
          '⚠️  Warning: No OAuth provider configured. ' +
          'Users will not be able to sign in. ' +
          'Set GOOGLE_CLIENT_ID/SECRET or GITHUB_CLIENT_ID/SECRET.'
        );
      }

      // Warn about default secret
      if (env.NEXTAUTH_SECRET === 'dev-secret-change-in-production') {
        throw new Error(
          'NEXTAUTH_SECRET is using development default in production! ' +
          'Generate a secure secret with: openssl rand -base64 32'
        );
      }
    }

    console.log('✓ Environment validated successfully');
  } catch (error) {
    console.error('❌ Environment validation failed:');
    console.error(error);
    process.exit(1);
  }
}

export { getServerEnv, getApiUrl } from './env';
