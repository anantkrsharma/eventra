import type { OAuth2Client, Credentials } from 'google-auth-library';

/**
 * Token store implementation using PostgreSQL with Prisma ORM
 * This class manages OAuth tokens securely in a database
 */
export class PrismaTokenStore {
  /**
   * Save OAuth tokens to the database
   * 
   * @param userId User identifier
   * @param tokens Google OAuth tokens
   */
  saveTokens(userId: string, tokens: Credentials): Promise<void>;

  /**
   * Load OAuth tokens from the database
   * 
   * @param userId User identifier
   * @returns Google OAuth credentials or null if not found
   */
  loadTokens(userId: string): Promise<Credentials | null>;

  /**
   * Delete OAuth tokens from the database
   * 
   * @param userId User identifier
   */
  deleteTokens(userId: string): Promise<void>;

  /**
   * Check if a user has valid tokens
   * 
   * @param userId User identifier
   * @returns true if user has non-expired tokens
   */
  hasValidTokens(userId: string): Promise<boolean>;

  /**
   * Clean up expired tokens from the database
   * This can be run periodically as a maintenance task
   */
  cleanupExpiredTokens(): Promise<number>;
}

/**
 * Singleton instance of the PrismaTokenStore
 */
export const tokenStore: PrismaTokenStore;
