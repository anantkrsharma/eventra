# Calendar MCP Server

An MCP server that provides calendar integration tools for Large Language Models.

## Features

- Fetch calendar events by date
- Create new calendar events
- OAuth2 authentication flow
- Secure token storage
- Production-ready deployment options

## Setup

### Prerequisites

- Node.js 16+
- A Google Cloud project with the Calendar API enabled
- OAuth credentials (see below)

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with your Google credentials (see below)
4. Run the server:
   ```
   npm start
   ```

### Google API Credentials

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Google Calendar API
3. Create OAuth credentials (Web application type)
4. Add an authorized redirect URI (e.g., `http://localhost:3000/oauth2callback`)
5. Create an API key for read-only operations

### Environment Variables

Create a `.env` file with the following variables:

```
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
```

## Production Deployment

For production deployment:

1. Generate SSL certificates and place them in the `certs` directory
2. Update the `.env` file with production settings:
   ```
   NODE_ENV=production
   USE_HTTPS=true
   GOOGLE_REDIRECT_URL=https://your-domain.com/oauth2callback
   TOKEN_ENCRYPTION_KEY=your_strong_random_key
   ```
3. Build the application:
   ```
   npm run build
   ```
4. Run the production server:
   ```
   npm run serve
   ```

### SSL Certificates

For production, you'll need valid SSL certificates. You can:

1. Purchase certificates from a trusted provider
2. Use Let's Encrypt for free certificates
3. For testing, generate self-signed certificates:
   ```
   openssl req -x509 -newkey rsa:4096 -keyout ./certs/key.pem -out ./certs/cert.pem -days 365 -nodes
   ```

## LLM Integration

This MCP server provides the following tools for LLMs:

1. `getMyCalendarDataByDate` - Fetches calendar events for a specific date
2. `createCalendarEvent` - Creates a new event in the calendar
3. `setGoogleOAuthTokens` - Sets OAuth tokens after user authorization

## OAuth Flow

1. The LLM calls `createCalendarEvent` without prior authorization
2. The server returns an auth URL
3. The user visits the URL and authorizes the app
4. Google redirects to the callback URL with an authorization code
5. The user copies the code and provides it to the LLM
6. The LLM calls `setGoogleOAuthTokens` with the code
7. Future requests are authenticated automatically
