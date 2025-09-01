import { PrismaClient } from '@prisma/client';
import { Credentials } from 'google-auth-library';

// Initialize Prisma client
const prisma = new PrismaClient();

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
  async saveTokens(userId: string, tokens: Credentials): Promise<void> {
    try {
      if (!tokens.access_token) {
        throw new Error('Invalid tokens: access_token is required');
      }

      const expiresAt = tokens.expiry_date 
        ? new Date(tokens.expiry_date) 
        : new Date(Date.now() + 3600 * 1000); //default 1 hour if not provided

      await prisma.oAuthToken.upsert({
        where: { userId },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenType: tokens.token_type || 'Bearer',
          scope: tokens.scope,
          expiresAt,
          idToken: tokens.id_token,
          updatedAt: new Date()
        },
        create: {
          userId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenType: tokens.token_type || 'Bearer',
          scope: tokens.scope,
          expiresAt,
          idToken: tokens.id_token
        }
      });

      console.log(`Tokens saved for user ${userId}`);
    } catch (error) {
      console.error('Failed to save tokens to database:', error);
      throw new Error('Failed to save tokens to database');
    }
  }

  /**
   * Load OAuth tokens from the database
   * 
   * @param userId User identifier
   * @returns Google OAuth credentials or null if not found
   */
  async loadTokens(userId: string): Promise<Credentials | null> {
    try {
      const tokenRecord = await prisma.oAuthToken.findUnique({
        where: { userId }
      });

      if (!tokenRecord) {
        return null;
      }

      // Check if token is expired
      if (new Date() > tokenRecord.expiresAt) {
        console.log(`Token for user ${userId} is expired`);
        // Return anyway as the OAuth client will refresh it
      }

      // Convert from database model to Google Credentials format
      return {
        access_token: tokenRecord.accessToken,
        refresh_token: tokenRecord.refreshToken || undefined,
        token_type: tokenRecord.tokenType,
        scope: tokenRecord.scope || undefined,
        expiry_date: tokenRecord.expiresAt.getTime(),
        id_token: tokenRecord.idToken || undefined
      };
    } catch (error) {
      console.error('Failed to load tokens from database:', error);
      return null;
    }
  }

  /**
   * Delete OAuth tokens from the database
   * 
   * @param userId User identifier
   */
  async deleteTokens(userId: string): Promise<void> {
    try {
      await prisma.oAuthToken.delete({
        where: { userId }
      });
      console.log(`Tokens deleted for user ${userId}`);
    } catch (error) {
      console.error('Failed to delete tokens from database:', error);
      // Don't throw error for delete operations
    }
  }

  /**
   * Check if a user has valid tokens
   * 
   * @param userId User identifier
   * @returns true if user has non-expired tokens
   */
  async hasValidTokens(userId: string): Promise<boolean> {
    try {
      const count = await prisma.oAuthToken.count({
        where: {
          userId,
          expiresAt: { gt: new Date() }
        }
      });
      return count > 0;
    } catch (error) {
      console.error('Failed to check token validity:', error);
      return false;
    }
  }

  /**
   * Clean up expired tokens from the database
   * This can be run periodically as a maintenance task
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await prisma.oAuthToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
          refreshToken: null // Only delete if no refresh token (can't be refreshed)
        }
      });
      return result.count;
    } catch (error) {
      console.error('Failed to clean up expired tokens:', error);
      return 0;
    }
  }
}

// Export a singleton instance
export const tokenStore = new PrismaTokenStore();
