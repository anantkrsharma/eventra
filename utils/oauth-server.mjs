import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';

/**
 * Create and configure the OAuth callback server
 * 
 * @param callbackHandler Function that handles the OAuth callback
 * @param options Server configuration options
 * @returns The created server instance
 */
export function createOAuthServer(callbackHandler, options) {
    // Request handler function
    const requestListener = (req, res) => {
        const parsedUrl = new URL(req.url || "", `http://${req.headers.host}`);
        
        // Handle the OAuth callback
        if (parsedUrl.pathname === "/oauth2callback") {
        const code = parsedUrl.searchParams.get('code');
        if (code) {
            callbackHandler(code, res);
        } else {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`
            <html>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <h1>Authorization Failed</h1>
                <p>No authorization code was received. Please try again.</p>
                </body>
            </html>
            `);
        }
        return;
        }
        
        // Handle health check endpoint
        if (parsedUrl.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
        }
        
        // Handle other routes (or 404)
        res.writeHead(404);
        res.end("Not Found");
    };

    let server;
    
    // Create HTTP or HTTPS server based on configuration
    if (options.useHttps && options.sslCertPath && options.sslKeyPath) {
        try {
        const httpsOptions = {
            key: fs.readFileSync(options.sslKeyPath),
            cert: fs.readFileSync(options.sslCertPath)
        };
        
        server = https.createServer(httpsOptions, requestListener);
        console.log("Created HTTPS server for OAuth callbacks");
        } catch (error) {
        console.error("Failed to create HTTPS server:", error);
        console.log("Falling back to HTTP server");
        server = http.createServer(requestListener);
        }
    } else {
        server = http.createServer(requestListener);
        if (options.useHttps) {
        console.warn("HTTPS was requested but certificate/key paths were not provided. Using HTTP instead.");
        }
    }
    
    // Start the server
    server.listen(options.port, () => {
        console.log(`OAuth callback server listening on port ${options.port} (${options.useHttps ? 'HTTPS' : 'HTTP'})`);
    });
    
    return server;
}
