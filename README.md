# Eventra

An MCP server that provides calendar integration tools for Large Language Models. Supports both local (stdio) and public (network) access modes.

## Features

- 📅 Fetch calendar events by date
- ➕ Create new calendar events
- 🔐 OAuth2 authentication flow with secure token storage
- 💾 PostgreSQL database for persistent token storage
- 🌐 **Network mode for public accessibility**
- 📡 **Server-Sent Events (SSE) transport for web clients**
- 🔒 Production-ready with HTTPS support

## Quick Start

### 1. Prerequisites

- Node.js 16+
- PostgreSQL database (or use the provided Neon database)
- Google Cloud project with Calendar API enabled
- OAuth credentials from Google Cloud Console

### 2. Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd eventra

# Install dependencies
npm install

# Initialize the database
npm run db:init
```

### 3. Configuration

Create a `.env` file with your credentials:

```env
# Google API Credentials
GOOGLE_PUBLIC_API_KEY=your_api_key
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URL=http://localhost:3000/oauth2callback
CALENDAR_ID=your_calendar_id

# Server Configuration
NODE_ENV=development
SERVER_PORT=3000
USE_HTTPS=false
SSL_CERT_PATH=./certs/cert.pem
SSL_KEY_PATH=./certs/key.pem

# Security
TOKEN_ENCRYPTION_KEY=a_strong_random_string
DEFAULT_USER_ID=default_user

# Database
DATABASE_URL="your_postgresql_connection_string"
```

## Usage Modes

The server automatically detects the transport mode based on the `MCP_TRANSPORT` environment variable:

### Local Development (stdio transport)

For use with Claude Desktop or local MCP clients:

```bash
# Start in stdio mode (default)
npm start

# Or production stdio mode
npm run start:prod
```

**Claude Desktop Configuration:**
```json
{
  "mcpServers": {
    "eventra": {
      "command": "node",
      "args": ["-r", "ts-node/register", "server.ts"],
      "cwd": "d:\\_\\PROJECTS\\MCP\\Calendar MCP",
      "env": {
        "NODE_OPTIONS": "--no-warnings"
      }
    }
  }
}
```

### Public Network Mode (SSE transport)

For public accessibility and web-based LLM clients:

```bash
# Start network server in development
npm run start:network

# Or production network mode
npm run start:network:prod
```

**Access Points:**
- 📡 **MCP Endpoint:** `http://localhost:3000/sse`
- 🔧 **API Documentation:** `http://localhost:3000/tools`
- 💚 **Health Check:** `http://localhost:3000/health`
- 🔐 **OAuth Callback:** `http://localhost:3000/oauth2callback`

## Google API Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Calendar API

### 2. Create Credentials

**API Key (for reading calendars):**
1. Go to Credentials → Create Credentials → API Key
2. Restrict the key to Calendar API (recommended)

**OAuth 2.0 (for creating events):**
1. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
2. Choose "Web application"
3. Add authorized redirect URI: `http://localhost:3000/oauth2callback`
4. For production, add your domain: `https://yourdomain.com/oauth2callback`

## Production Deployment

### 1. Environment Setup

Update `.env` for production:

```env
NODE_ENV=production
USE_HTTPS=true
GOOGLE_REDIRECT_URL=https://yourdomain.com/oauth2callback
TOKEN_ENCRYPTION_KEY=your_strong_production_key
DATABASE_URL="your_production_database_url"
```

### 2. SSL Certificates

**Option A: Let's Encrypt (Recommended)**
```bash
# Install certbot
sudo apt install certbot

# Generate certificates
sudo certbot certonly --standalone -d yourdomain.com

# Copy to project
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./certs/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./certs/key.pem
```

**Option B: Self-signed (Testing only)**
```bash
mkdir certs
openssl req -x509 -newkey rsa:4096 -keyout ./certs/key.pem -out ./certs/cert.pem -days 365 -nodes
```

### 3. Build and Deploy

```bash
# Build the application
npm run build

# Start production server
npm run serve:network

# Or use PM2 for process management
npm install -g pm2
pm2 start dist/network-server.js --name "eventra-mcp"
```

### 4. Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "serve:network"]
```

```bash
# Build and run
docker build -t eventra-mcp .
docker run -p 3000:3000 --env-file .env eventra-mcp
```

## Connecting LLMs to Public Server

### Web-based MCP Client

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const transport = new SSEClientTransport(
  new URL("https://yourdomain.com:3000/sse")
);

const client = new Client(
  { name: "calendar-client", version: "1.0.0" },
  { capabilities: {} }
);

await client.connect(transport);

// Use the tools
const result = await client.callTool("getMyCalendarDataByDate", {
  date: "2025-09-03"
});
```

### API Documentation

Visit `https://yourdomain.com:3000/tools` for interactive API documentation showing:
- Available tools and their parameters
- Usage examples
- Connection information

## Available Tools

### 1. `getMyCalendarDataByDate`
Retrieve calendar events for a specific date.

**Parameters:**
- `date` (string): ISO date format (e.g., "2025-09-03")

**Example:**
```json
{
  "date": "2025-09-03"
}
```

### 2. `createCalendarEvent`
Create a new calendar event.

**Parameters:**
- `summary` (string, required): Event title
- `description` (string, optional): Event description
- `startDateTime` (string, required): ISO datetime
- `endDateTime` (string, required): ISO datetime
- `location` (string, optional): Event location

**Example:**
```json
{
  "summary": "Team Meeting",
  "description": "Weekly team sync",
  "startDateTime": "2025-09-03T14:00:00Z",
  "endDateTime": "2025-09-03T15:00:00Z",
  "location": "Conference Room A"
}
```

### 3. `setGoogleOAuthTokens`
Set OAuth tokens after user authorization.

**Parameters:**
- `code` (string, required): Authorization code from OAuth flow

## OAuth Flow

1. LLM calls `createCalendarEvent` without prior authorization
2. Server returns auth URL
3. User visits URL and authorizes the application
4. Google redirects to callback with authorization code
5. User copies the code from the callback page
6. LLM calls `setGoogleOAuthTokens` with the code
7. Future requests are automatically authenticated

## Development

```bash
# Start development server (stdio mode)
npm start

# Start development server (network mode)
npm run start:network

# View database
npm run db:studio

# Run database migrations
npm run db:migrate

# Initialize/reset database
npm run db:init
```

## Monitoring

- **Health Check:** `GET /health` returns server status
- **Tools Documentation:** `GET /tools` returns API documentation
- **Database Studio:** `npm run db:studio` opens Prisma Studio

## Security Considerations

- 🔐 Always use HTTPS in production
- 🗝️ Use strong, random encryption keys
- 🛡️ Restrict CORS origins in production
- 📱 Regularly rotate OAuth tokens
- 🔍 Monitor OAuth callback logs
- 💾 Backup your PostgreSQL database regularly

## Troubleshooting

**Connection Issues:**
- Check if the database is accessible
- Verify environment variables are set correctly
- Ensure Google API credentials are valid

**OAuth Issues:**
- Verify redirect URLs match in Google Cloud Console
- Check that Calendar API is enabled
- Ensure proper scopes are requested

**Network Issues:**
- Check firewall settings for the specified port
- Verify SSL certificates are valid and accessible
- Test with curl: `curl -I https://yourdomain.com:3000/health`

## License

ISC
