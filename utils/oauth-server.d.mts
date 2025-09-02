import * as http from 'http';
import * as https from 'https';

/**
 * Options for configuring the OAuth server
 */
export interface OAuthServerOptions {
  /**
   * Port number for the server to listen on
   */
  port: number;
  
  /**
   * Whether to use HTTPS
   */
  useHttps?: boolean;
  
  /**
   * Path to SSL certificate file (required if useHttps is true)
   */
  sslCertPath?: string;
  
  /**
   * Path to SSL key file (required if useHttps is true)
   */
  sslKeyPath?: string;
}

/**
 * Callback function type for handling OAuth responses
 */
export type OAuthCallbackHandler = (code: string, res: http.ServerResponse) => void;

/**
 * Create and configure the OAuth callback server
 * 
 * @param callbackHandler Function that handles the OAuth callback
 * @param options Server configuration options
 * @returns The created server instance
 */
export function createOAuthServer(
  callbackHandler: OAuthCallbackHandler, 
  options: OAuthServerOptions
): http.Server | https.Server;
