# 🎙️ Realtime MCP Proxy

**Add voice + tools to OpenAI's Realtime API in 3 lines of code.**

A TypeScript library that bridges OpenAI's Realtime API with [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) servers, enabling voice-driven tool execution.

## ✨ Features

- **🎯 Ultra-Simple API** - Just add your MCP config to get voice + tools working
- **🔌 WebRTC Ready** - Built-in server for browser voice applications  
- **🛠️ Universal MCP Support** - Works with any MCP server (HubSpot, GitHub, custom, etc.)
- **🔒 Type Safe** - Full TypeScript support with comprehensive type definitions
- **⚡ Production Ready** - Error handling, timeouts, graceful shutdown, health checks

## 🚀 Quick Start

### Installation

```bash
npm install @gillinghammer/realtime-mcp-core
```

### Basic Usage

```typescript
import { WebRTCBridgeServer } from '@gillinghammer/realtime-mcp-core';

const bridge = new WebRTCBridgeServer({
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o-realtime-preview-2024-12-17',
    voice: 'alloy',
    instructions: 'You are a helpful assistant with access to external tools.',
  },
  mcp: {
    command: 'npx',
    args: ['-y', '@hubspot/mcp-server'],
    env: {
      PRIVATE_APP_ACCESS_TOKEN: process.env.HUBSPOT_TOKEN!,
    },
  },
});

await bridge.start();
console.log('🚀 Voice AI with tools running on http://localhost:8084');
```

**That's it!** Your Realtime API now has voice-driven access to all MCP tools.

## 🎬 What You Get

The bridge provides everything needed for voice + tools:

- **`GET /session`** - Ephemeral API keys for WebRTC connections
- **`POST /mcp`** - MCP proxy for tool calls  
- **`GET /tools`** - OpenAI-formatted tool definitions
- **`GET /demo`** - Live demo page to test voice interactions
- **`GET /health`** - Health check and status

## 🌟 Examples

### HubSpot CRM Integration
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

**Voice commands:** *"Show me recent contacts"* • *"Search for companies with 'tech'"* • *"Add a note to John Smith"*

### Hacker News Integration
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

**Voice commands:** *"What are the top stories on Hacker News?"* • *"Find articles about AI"* • *"Show trending tech discussions"*

### Custom MCP Server
```typescript
const bridge = new WebRTCBridgeServer({
  openai: { /* ... */ },
  mcp: {
    url: 'http://localhost:3000',  // Your custom MCP server
    auth: {
      type: 'bearer',
      token: process.env.CUSTOM_TOKEN
    }
  }
});
```

## 🌐 Browser Integration

Use the bridge from any web application:

```html
<button onclick="startVoiceChat()">Start Voice Chat</button>
<script>
async function startVoiceChat() {
  // Get ephemeral API key from your bridge server
  const session = await fetch('http://localhost:8084/session').then(r => r.json());
  
  // Set up WebRTC connection to OpenAI
  const pc = new RTCPeerConnection();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(stream.getTracks()[0]);
  
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
```

## 📁 Examples

### 🎙️ [Unified Voice Demo](./examples/voice-demo/)

**One interface for all MCP providers** - Switch between HubSpot, Hacker News, Airbnb, and custom servers with a single click.

**Features:**
- **🏢 HubSpot CRM** - *"Show me recent contacts"* • *"Search for companies"*
- **📰 Hacker News** - *"What's trending in tech?"* • *"Find AI articles"*  
- **🏠 Airbnb Search** - *"Find places in Tokyo"* • *"Search vacation rentals"*
- **➕ Easy to extend** with any MCP server

**Setup:**
```bash
cd examples/voice-demo
cp .env.example .env  # Add your API keys
npm install && npm run dev
# Open http://localhost:8085
```

## 🔧 Configuration

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

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md).

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

**Made with ❤️ for the voice AI community** 