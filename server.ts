import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import * as dotenv from "dotenv";
import { google } from "googleapis";
import { z } from "zod";
import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import express from "express";
import cors from "cors";
import { tokenStore } from "./utils/prisma-token-store.mjs";
import { createOAuthServer } from "./utils/oauth-server.mjs";

dotenv.config();

//initialize Google Calendar API for reading (public API key)
const calendarReadOnly = google.calendar({ 
  version: "v3", 
  auth: process.env.GOOGLE_PUBLIC_API_KEY 
});

//initialize OAuth2 client for writing to calendar
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URL
);

// If you have a refresh token stored securely, you can set it here
// oauth2Client.setCredentials({
//   refresh_token: process.env.GOOGLE_REFRESH_TOKEN
// });

//calendar API with OAuth2 for creating events
const calendarWithAuth = google.calendar({ 
  version: "v3", 
  auth: oauth2Client 
});

//generate auth URL for OAuth2
function getAuthUrl() {
  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
}

const server = new McpServer({
  name: "Eventra",
  version: "1.0.0",
});

//logic for fetching calendar data
async function getMyCalendarDataByDate(date: string | number | Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  try {
    const res = await calendarReadOnly.events.list({
      calendarId: process.env.CALENDAR_ID,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = res.data.items || [];
    const meetings = events.map(event => {
      const time = event.start
        ? event.start.dateTime || event.start.date
        : "Unknown time";
      return `${event.summary} at ${time}`;
    });

    return { meetings };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

//logic for creating a new calendar event
async function createCalendarEvent(eventDetails: {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
}) {
  try {
    //check if we have valid credentials
    const credentials = oauth2Client.credentials;
    if (!credentials || !credentials.access_token) {
      const authUrl = getAuthUrl();
      return {
        success: false,
        error: "Authentication required",
        authUrl: authUrl,
        message: "Please visit the URL to authenticate and allow access to your Google Calendar."
      };
    }

    const event = {
      summary: eventDetails.summary,
      description: eventDetails.description || '',
      location: eventDetails.location || '',
      start: {
        dateTime: new Date(eventDetails.startDateTime).toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: new Date(eventDetails.endDateTime).toISOString(),
        timeZone: 'UTC',
      },
    };

    const response = await calendarWithAuth.events.insert({
      calendarId: process.env.CALENDAR_ID,
      requestBody: event,
    });

    return {
      success: true,
      eventId: response.data.id,
      htmlLink: response.data.htmlLink,
      created: response.data.created,
    };
  } catch (err) {
    console.error('Error creating calendar event:', err);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

//TOOL - tool to get calendar events
server.registerTool(
  "getMyCalendarDataByDate",
  {
    title: "Fetch Calendar by Date",
    description: "Retrieve your calendar events for a specific date.",
    inputSchema: {
      date: z
            .string()
            .refine(
              val => !isNaN(Date.parse(val)), 
              { message: "Invalid date format; please provide a valid date string." }
            )
    }
  },
  async ({ date }) => {
    const data = await getMyCalendarDataByDate(date);
    
    return {
      content: [
        { 
          type: "text", 
          text: JSON.stringify(data) 
        }
      ],
    };
  }
);

//TOOL - tool to create calendar events
server.registerTool(
  "createCalendarEvent",
  {
    title: "Create Calendar Event",
    description: "Create a new event in your Google Calendar.",
    inputSchema: {
      summary: z.string().min(1, "Event summary is required"),
      description: z.string().optional(),
      startDateTime: z
        .string()
        .refine(val => !isNaN(Date.parse(val)), {
          message: "Invalid start date/time format; please provide a valid ISO date string."
        }),
      endDateTime: z
        .string()
        .refine(val => !isNaN(Date.parse(val)), {
          message: "Invalid end date/time format; please provide a valid ISO date string."
        }),
      location: z.string().optional(),
    }
  },
  async ({ summary, description, startDateTime, endDateTime, location }) => {
    //validate that end time is after start time
    const startTime = new Date(startDateTime).getTime();
    const endTime = new Date(endDateTime).getTime();
    
    if (endTime <= startTime) {
      return {
        content: [
          { 
            type: "text", 
            text: JSON.stringify({ 
              success: false, 
              error: "End time must be after the start time." 
            }) 
          }
        ],
      };
    }
    
    const result = await createCalendarEvent({
      summary,
      description,
      startDateTime,
      endDateTime,
      location
    });
    
    return {
      content: [
        { 
          type: "text", 
          text: JSON.stringify(result) 
        }
      ],
    };
  }
);

//TOOL - tool to set OAuth tokens
server.registerTool(
  "setGoogleOAuthTokens",
  {
    title: "Set Google OAuth Tokens",
    description: "Set the OAuth tokens for Google Calendar after authorization.",
    inputSchema: {
      code: z.string().min(1, "Authorization code is required"),
    }
  },
  async ({ code }) => {
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      
      // Save tokens securely
      const userId = process.env.DEFAULT_USER_ID || 'default_user';
      await tokenStore.saveTokens(userId, tokens);
      
      return {
        content: [
          { 
            type: "text", 
            text: JSON.stringify({ 
              success: true, 
              message: "Authentication successful! You can now create calendar events." 
            }) 
          }
        ],
      };
    } catch (err) {
      console.error('Error getting tokens:', err);
      return {
        content: [
          { 
            type: "text", 
            text: JSON.stringify({ 
              success: false, 
              error: err instanceof Error ? err.message : String(err) 
            }) 
          }
        ],
      };
    }
  }
);

//initialize and connect via stdio or network based on environment
async function init() {
  try {
    //initialize tokens first
    await initializeTokens();
    
    const transportMode = process.env.MCP_TRANSPORT || 'stdio';
    
    if (transportMode === 'network') {
      await initNetworkMode();
    } else {
      await initStdioMode();
    }
  } catch (error) {
    console.error("Failed to initialize MCP server:", error);
    process.exit(1);
  }
}

//initialize tokens from database
async function initializeTokens() {
  const userId = process.env.DEFAULT_USER_ID || 'default_user';
  
  try {
    const savedTokens = await tokenStore.loadTokens(userId);
    
    if (savedTokens) {
      console.log('Loaded saved tokens for user from database');
      oauth2Client.setCredentials(savedTokens);
    }
  } catch (err) {
    console.error('Error loading tokens from database:', err);
  }
}

//initialize stdio mode (for Claude Desktop)
async function initStdioMode() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  //start the OAuth callback server
  startProductionOAuthServer();
  
  console.log("MCP server initialized successfully (stdio mode)");
}

//initialize network mode (for public access)
async function initNetworkMode() {
  const port = parseInt(process.env.SERVER_PORT || '3000', 10);
  const useHttps = process.env.USE_HTTPS === 'true';
  const isProduction = process.env.NODE_ENV === 'production';
  
  const app = express();

  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control']
  }));

  app.use(express.json());

  //health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      server: 'Eventra MCP Server',
      version: '1.0.0'
    });
  });

  //API documentation endpoint
  app.get('/tools', (req, res) => {
    res.json({
      server: "Eventra MCP Server",
      version: "1.0.0",
      description: "Calendar integration tools for Large Language Models",
      tools: [
        {
          name: "getMyCalendarDataByDate",
          description: "Retrieve calendar events for a specific date",
          parameters: {
            date: "string (ISO date format, e.g., '2025-09-03')"
          },
          example: {
            date: "2025-09-03"
          }
        },
        {
          name: "createCalendarEvent",
          description: "Create a new calendar event",
          parameters: {
            summary: "string (required) - Event title",
            description: "string (optional) - Event description",
            startDateTime: "string (ISO datetime) - Event start time",
            endDateTime: "string (ISO datetime) - Event end time",
            location: "string (optional) - Event location"
          },
          example: {
            summary: "Team Meeting",
            description: "Weekly team sync",
            startDateTime: "2025-09-03T14:00:00Z",
            endDateTime: "2025-09-03T15:00:00Z",
            location: "Conference Room A"
          }
        },
        {
          name: "setGoogleOAuthTokens",
          description: "Set OAuth tokens after authorization",
          parameters: {
            code: "string (authorization code from OAuth flow)"
          }
        }
      ],
      connection: {
        endpoint: "/sse",
        protocol: "Server-Sent Events (SSE)",
        usage: "Connect your MCP client to this endpoint to access the tools"
      },
      oauth: {
        endpoint: "/oauth2callback",
        description: "OAuth callback endpoint for Google Calendar authorization"
      }
    });
  });

  //SSE endpoint for MCP communication
  app.get('/sse', async (req, res) => {
    console.log('New SSE connection established');
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    try {
      const transport = new SSEServerTransport('/message', res);
      await server.connect(transport);
      console.log('MCP server connected via SSE');
    } catch (error) {
      console.error('Failed to establish SSE connection:', error);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Connection failed' })}\n\n`);
      res.end();
    }
  });

  //handle POST requests to /message for SSE transport
  app.post('/message', async (req, res) => {
    //this will be handled by the SSE transport
    res.status(200).json({ status: 'received' });
  });

  //OAuth callback endpoint
  app.get('/oauth2callback', (req, res) => {
    const code = req.query.code as string;
    if (code) {
      handleOAuthCallback(code, res);
    } else {
      res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1>Authorization Failed</h1>
            <p>No authorization code was received. Please try again.</p>
          </body>
        </html>
      `);
    }
  });

  let httpServer: http.Server | https.Server;

  if (useHttps && isProduction) {
    try {
      const sslOptions = {
        key: fs.readFileSync(process.env.SSL_KEY_PATH || './certs/key.pem'),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH || './certs/cert.pem')
      };
      
      httpServer = https.createServer(sslOptions, app);
      console.log('HTTPS server created');
    } catch (error) {
      console.error('Failed to create HTTPS server:', error);
      console.log('Falling back to HTTP server');
      httpServer = http.createServer(app);
    }
  } else {
    httpServer = http.createServer(app);
  }

  //start the server
  httpServer.listen(port, () => {
    const protocol = useHttps && isProduction ? 'https' : 'http';
    console.log(`🚀 Eventra MCP Server running on ${protocol}://localhost:${port}`);
    console.log(`📡 MCP Endpoint: ${protocol}://localhost:${port}/sse`);
    console.log(`🔧 API Documentation: ${protocol}://localhost:${port}/tools`);
    console.log(`🔐 OAuth Callback: ${protocol}://localhost:${port}/oauth2callback`);
    console.log(`💚 Health Check: ${protocol}://localhost:${port}/health`);
    console.log(`🌍 Server mode: ${isProduction ? 'production' : 'development'}`);
  });

  //shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down gracefully...');
    httpServer.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
}

//function to handle OAuth callback and display the code to the user with instructions
function handleOAuthCallback(code: string, res: http.ServerResponse) {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
    <html>
      <head>
        <title>Eventra - Authorization Successful</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #f5f5f5;">
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h1 style="color: #4285f4; margin-bottom: 20px;">✅ Authorization Successful</h1>
          <p>Please copy the code below and paste it back into your conversation with the AI assistant:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; border: 1px solid #e9ecef;">
            <code style="word-break: break-all; user-select: all; font-size: 14px; color: #d63384;">${code}</code>
          </div>
          <button onclick="copyToClipboard('${code}')" style="background-color: #4285f4; color: white; border: none; padding: 12px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; margin-right: 10px;">
            📋 Copy Code
          </button>
          <button onclick="closeWindow()" style="background-color: #6c757d; color: white; border: none; padding: 12px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;">
            Close
          </button>
          <p style="margin-top: 20px; color: #6c757d; font-size: 14px;">
            After pasting the code, the assistant will be able to create calendar events for you.
          </p>
        </div>
        <script>
          function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
              alert('Code copied to clipboard!');
            }).catch(() => {
              // Fallback for older browsers
              const textArea = document.createElement('textarea');
              textArea.value = text;
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand('copy');
              document.body.removeChild(textArea);
              alert('Code copied to clipboard!');
            });
          }
          
          function closeWindow() {
            window.close();
          }
        </script>
      </body>
    </html>
  `);
}

//function to start the production-ready OAuth callback server
function startProductionOAuthServer() {
  //get server configuration from environment variables
  const port = parseInt(process.env.SERVER_PORT || '3000', 10);
  const useHttps = process.env.USE_HTTPS === 'true';
  const sslCertPath = process.env.SSL_CERT_PATH || '';
  const sslKeyPath = process.env.SSL_KEY_PATH || '';
  
  //check if we're in production mode
  const isProduction = process.env.NODE_ENV === 'production';
  
  //create the server with appropriate settings
  createOAuthServer(handleOAuthCallback, {
    port,
    useHttps: isProduction ? useHttps : false,
    sslCertPath: isProduction ? sslCertPath : undefined,
    sslKeyPath: isProduction ? sslKeyPath : undefined
  });
  
  console.log(`Server running in ${isProduction ? 'production' : 'development'} mode`);
}

init();
