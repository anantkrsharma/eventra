/**
 * Example MCP client for connecting to Eventra server
 * This demonstrates how to connect to the public network server
 * and use the calendar tools programmatically.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

class EventraClient {
  constructor(serverUrl = "http://localhost:3000") {
    this.serverUrl = serverUrl;
    this.client = null;
    this.transport = null;
  }

  async connect() {
    try {
      console.log(`Connecting to Eventra server at ${this.serverUrl}...`);
      
      // Create SSE transport
      this.transport = new SSEClientTransport(
        new URL(`${this.serverUrl}/sse`)
      );

      // Create MCP client
      this.client = new Client(
        { 
          name: "eventra-client", 
          version: "1.0.0" 
        },
        { 
          capabilities: {} 
        }
      );

      // Connect to server
      await this.client.connect(this.transport);
      console.log("✅ Connected successfully!");
      
      // List available tools
      const tools = await this.listTools();
      console.log("Available tools:", tools.map(t => t.name).join(", "));
      
      return true;
    } catch (error) {
      console.error("❌ Connection failed:", error);
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.transport = null;
      console.log("Disconnected from server");
    }
  }

  async listTools() {
    if (!this.client) {
      throw new Error("Not connected to server");
    }
    
    const response = await this.client.listTools();
    return response.tools;
  }

  async getCalendarData(date) {
    if (!this.client) {
      throw new Error("Not connected to server");
    }

    try {
      console.log(`📅 Fetching calendar data for ${date}...`);
      
      const response = await this.client.callTool("getMyCalendarDataByDate", {
        date: date
      });

      const result = JSON.parse(response.content[0].text);
      
      if (result.error) {
        console.error("Error:", result.error);
        return null;
      }

      console.log("✅ Calendar data retrieved:", result);
      return result;
    } catch (error) {
      console.error("❌ Failed to get calendar data:", error);
      return null;
    }
  }

  async createEvent(eventDetails) {
    if (!this.client) {
      throw new Error("Not connected to server");
    }

    try {
      console.log("➕ Creating calendar event...");
      
      const response = await this.client.callTool("createCalendarEvent", eventDetails);
      const result = JSON.parse(response.content[0].text);
      
      if (result.success) {
        console.log("✅ Event created successfully:", result);
        return result;
      } else {
        console.error("❌ Failed to create event:", result.error);
        if (result.authUrl) {
          console.log("🔐 Authorization required. Please visit:", result.authUrl);
          console.log("After authorization, copy the code and call setOAuthTokens()");
        }
        return result;
      }
    } catch (error) {
      console.error("❌ Failed to create event:", error);
      return null;
    }
  }

  async setOAuthTokens(authCode) {
    if (!this.client) {
      throw new Error("Not connected to server");
    }

    try {
      console.log("🔐 Setting OAuth tokens...");
      
      const response = await this.client.callTool("setGoogleOAuthTokens", {
        code: authCode
      });

      const result = JSON.parse(response.content[0].text);
      
      if (result.success) {
        console.log("✅ OAuth tokens set successfully!");
        return true;
      } else {
        console.error("❌ Failed to set tokens:", result.error);
        return false;
      }
    } catch (error) {
      console.error("❌ Failed to set tokens:", error);
      return false;
    }
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      const data = await response.json();
      console.log("Health check:", data);
      return data;
    } catch (error) {
      console.error("Health check failed:", error);
      return null;
    }
  }

  async getServerInfo() {
    try {
      const response = await fetch(`${this.serverUrl}/tools`);
      const data = await response.json();
      console.log("Server info:", data);
      return data;
    } catch (error) {
      console.error("Failed to get server info:", error);
      return null;
    }
  }
}

// Example usage
async function example() {
  const client = new EventraClient("http://localhost:3000");
  
  try {
    // Connect to server
    const connected = await client.connect();
    if (!connected) {
      return;
    }

    // Check server health
    await client.healthCheck();

    // Get server information
    await client.getServerInfo();

    // Get calendar data for today
    const today = new Date().toISOString().split('T')[0];
    await client.getCalendarData(today);

    // Try to create an event
    const eventDetails = {
      summary: "Test Meeting",
      description: "Created via MCP client",
      startDateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      endDateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      location: "Conference Room A"
    };

    const result = await client.createEvent(eventDetails);
    
    // If authorization is needed, you would typically:
    // 1. Display the authUrl to the user
    // 2. Wait for them to complete authorization
    // 3. Get the authorization code
    // 4. Call setOAuthTokens with the code
    // 5. Retry creating the event

    if (result && result.authUrl) {
      console.log("\n🔐 To create events, please:");
      console.log("1. Visit this URL:", result.authUrl);
      console.log("2. Complete the authorization");
      console.log("3. Copy the authorization code");
      console.log("4. Call client.setOAuthTokens(code)");
      console.log("5. Retry creating the event");
    }

  } catch (error) {
    console.error("Example failed:", error);
  } finally {
    // Clean up
    await client.disconnect();
  }
}

// Export for use as a module
export { EventraClient };

// Run example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  example().catch(console.error);
}
