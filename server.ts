import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { google } from "googleapis";
import { z } from "zod";
import http from "http";
import { tokenStore } from "./utils/prisma-token-store.js";
import { createOAuthServer } from "./utils/oauth-server.js";

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

//load tokens from the database for the default user
(async () => {
  //get the default user ID from environment variables
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
})();

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
    prompt: 'consent' // Forces the approval prompt
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

//initialize and connect via stdio
async function init() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  //start the OAuth callback server
  startProductionOAuthServer();
}

//function to handle OAuth callback and display the code to the user with instructions
function handleOAuthCallback(code: string, res: http.ServerResponse) {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h1>Authorization Successful</h1>
        <p>Please copy the code below and paste it back into your conversation with the AI assistant:</p>
        <div style="background-color: #f0f0f0; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <code style="word-break: break-all; user-select: all;">${code}</code>
        </div>
        <button onclick="copyToClipboard('${code}')" style="background-color: #4285f4; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer;">
          Copy Code
        </button>
        <p style="margin-top: 20px;">After pasting the code, the assistant will be able to create calendar events for you.</p>
        <script>
          function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
              alert('Code copied to clipboard!');
            });
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
