# @realtime-mcp/core

A TypeScript library that bridges OpenAI's Realtime API with Model Context Protocol (MCP) servers, enabling voice-based AI interactions with external tools and services.

## Features

- **🎯 Ultra-Simple API**: Just add your MCP config to get voice + tools working
- **🔌 WebRTC Integration**: Built-in server for browser-based voice applications  
- **🛠️ MCP Bridge**: Seamless integration with any MCP server
- **🔒 Type Safety**: Full TypeScript support with comprehensive type definitions
- **⚡ Production Ready**: Error handling, timeouts, graceful shutdown, health checks

## Installation

```bash
npm install @realtime-mcp/core
```

## Quick Start

The easiest way to add MCP tools to OpenAI's Realtime API:

```typescript
import { WebRTCBridgeServer } from '@realtime-mcp/core';

const bridge = new WebRTCBridgeServer({
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o-realtime-preview-2024-12-17',
    voice: 'alloy',
    instructions: 'You are a helpful assistant with access to external tools.',
  },
  mcp: {
    // Option 1: Start an MCP server automatically
    command: 'npx',
    args: ['-y', '@hubspot/mcp-server'],
    env: {
      PRIVATE_APP_ACCESS_TOKEN: process.env.HUBSPOT_TOKEN!,
    },
    // Option 2: Connect to existing MCP server
    // url: 'http://localhost:3000',
  },
});

await bridge.start();
console.log('🚀 Voice AI with tools running on http://localhost:8084');
```

That's it! Your Realtime API now has access to all MCP tools.

## What You Get

The bridge server provides these endpoints:
- **`GET /session`** - Ephemeral API keys for WebRTC connections
- **`POST /mcp`** - MCP proxy for tool calls  
- **`GET /tools`** - OpenAI-formatted tool definitions
- **`GET /health`** - Health check and status
- **`GET /demo`** - Live demo page to test voice interactions

## Browser Integration

Use the bridge from your frontend application:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Voice AI with MCP Tools</title>
</head>
<body>
    <button onclick="startVoiceChat()">Start Voice Chat</button>
    <script>
        async function startVoiceChat() {
            // Get ephemeral API key from your bridge server
            const session = await fetch('http://localhost:8084/session')
                .then(r => r.json());
            
            // Set up WebRTC connection to OpenAI
            const pc = new RTCPeerConnection();
            
            // Add microphone
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            pc.addTrack(stream.getTracks()[0]);
            
            // Create data channel for events
            const dataChannel = pc.createDataChannel("oai-events");
            
            // Connect to OpenAI Realtime API
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            const response = await fetch(
                `https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`,
                {
                    method: "POST",
                    body: offer.sdp,
                    headers: {
                        Authorization: `Bearer ${session.client_secret.value}`,
                        "Content-Type": "application/sdp"
                    }
                }
            );
            
            const answerSdp = await response.text();
            await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
            
            // Now you can talk to AI and it has access to your MCP tools!
        }
    </script>
</body>
</html>
```

## Configuration

### WebRTCBridgeConfig

```typescript
interface WebRTCBridgeConfig {
  openai: {
    apiKey: string;              // OpenAI API key
    model: string;               // Model (e.g., 'gpt-4o-realtime-preview-2024-12-17')
    voice?: string;              // Voice (alloy, echo, sage, etc.)
    instructions?: string;       // System instructions
  };
  mcp: {
    // Option 1: Start MCP server automatically
    command?: string;            // Command (e.g., 'npx', 'uvx')
    args?: string[];             // Arguments (e.g., ['-y', '@hubspot/mcp-server'])
    env?: Record<string, string>; // Environment variables
    timeout?: number;            // Request timeout (default: 10000ms)
    
    // Option 2: Connect to existing MCP server
    url?: string;                // MCP server URL
    auth?: {                     // Authentication
      type: 'bearer';
      token: string;
    };
  };
  server?: {
    port?: number;               // Server port (default: 8084)
    host?: string;               // Server host (default: 'localhost')  
    cors?: boolean;              // Enable CORS (default: true)
  };
}
```

## Examples

The repository includes working examples with popular MCP servers:

### HubSpot CRM
```typescript
const bridge = new WebRTCBridgeServer({
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o-realtime-preview-2024-12-17',
    instructions: 'You are a helpful HubSpot CRM assistant...'
  },
  mcp: {
    command: 'npx',
    args: ['-y', '@hubspot/mcp-server'],
    env: { PRIVATE_APP_ACCESS_TOKEN: process.env.HUBSPOT_TOKEN! }
  }
});
```

### Hacker News
```typescript
const bridge = new WebRTCBridgeServer({
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o-realtime-preview-2024-12-17',
    instructions: 'You are a tech news assistant...'
  },
  mcp: {
    command: 'uvx',
    args: ['mcp-hn']
  }
});
```

## Advanced Usage

For more control over the connection, you can access the underlying components:

```typescript
import { RealtimeMCPProxy } from '@realtime-mcp/core';

const proxy = new RealtimeMCPProxy({
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o-realtime-preview-2024-12-17',
  },
  mcp: {
    url: 'http://localhost:3000',
  },
});

// Event listeners
proxy.on('functionCall', (name, args) => {
  console.log(`AI called function: ${name}`, args);
});

await proxy.connect();
```

## API Reference

### WebRTCBridgeServer

Main class for WebRTC integration with MCP servers.

#### Methods

- `start(): Promise<void>` - Start the bridge server
- `stop(): Promise<void>` - Stop the bridge server and cleanup
- `isServerRunning(): boolean` - Check if server is running
- `getServerURL(): string` - Get server URL

## Contributing

Contributions welcome! Please see our [Contributing Guide](../../CONTRIBUTING.md).

## License

MIT License - see [LICENSE](../../LICENSE) for details. 