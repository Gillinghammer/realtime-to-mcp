# 🎙️ Unified Voice Demo

**One voice interface for all MCP servers** - Switch between HubSpot, Hacker News, Airbnb, Blender, Fewsats, Amazon, and any custom MCP providers with a single click.

## ✨ What This Demo Does

This is a unified voice interface that lets you:
- **Choose any MCP provider** from a web interface
- **Switch between providers** without restarting anything
- **Talk to AI assistants** with specialized knowledge for each provider
- **See real-time status** of all available providers

### Supported Providers

| Provider | Icon | Description | API Key Required |
|----------|------|-------------|------------------|
| **HubSpot CRM** | 🏢 | Manage contacts, companies, deals | ✅ `HUBSPOT_TOKEN` |
| **Hacker News** | 📰 | Tech news and discussions | ❌ No key needed |
| **Airbnb Search** | 🏠 | Find properties and accommodations | ❌ No key needed |
| **Blender 3D** | 🎨 | 3D modeling, animation, rendering | ❌ No key needed |
| **Fewsats** | ⚡ | Bitcoin Lightning Network payments | ✅ `FEWSATS_API_KEY` |
| **Amazon** | 📦 | Search and browse Amazon products | ❌ No key needed |

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
cd examples/voice-demo
npm install
```

### 2. Set Up Environment Variables
```bash
# Copy the example file
cp env.example .env

# Edit .env with your API keys
nano .env  # or use your preferred editor
```

### 3. Get Your API Keys

#### OpenAI API Key (Required)
1. Visit [OpenAI Platform](https://platform.openai.com/account/api-keys)
2. Create a new API key
3. Add to `.env`: `OPENAI_API_KEY=sk-your-key-here`

#### HubSpot Token (Optional - for CRM features)
1. Go to HubSpot → Settings → Integrations → Private Apps
2. Create a new private app with CRM permissions
3. Copy the access token
4. Add to `.env`: `HUBSPOT_TOKEN=pat-your-token-here`

#### Fewsats API Key (Optional - for Lightning Network features)
1. Visit [Fewsats](https://fewsats.com) and create an account
2. Generate an API key from your dashboard
3. Add to `.env`: `FEWSATS_API_KEY=your-api-key-here`

### 4. Start the Demo
```bash
npm run dev
```

### 5. Open the Interface
```
http://localhost:8085
```

## 🎯 How It Works

### Provider Selection
1. **Web Interface** shows all available MCP providers
2. **Status Check** shows which providers are ready (have required API keys)
3. **One Click** starts a voice interface for the selected provider
4. **Dynamic Switching** - change providers anytime without restart

### Voice Commands by Provider

#### 🏢 HubSpot CRM
- *"Show me recent contacts"*
- *"Search for companies with 'tech' in the name"*
- *"Get my account details"*
- *"Add a note to John Smith"*
- *"List my deals"*

#### 📰 Hacker News
- *"What are the top stories on Hacker News?"*
- *"Find articles about artificial intelligence"*
- *"Show trending tech discussions"*
- *"Search for stories about OpenAI"*
- *"What's popular in tech today?"*

#### 🏠 Airbnb Search
- *"Find properties in San Francisco for next weekend"*
- *"Search for apartments in New York for 2 guests"*
- *"Show me places to stay in Tokyo"*
- *"Find vacation rentals in Paris for July"*
- *"Search for cabins in the mountains"*

#### 🎨 Blender 3D
- *"Create a new cube in the scene"*
- *"Add a sphere and move it up"*
- *"Set up basic lighting for the scene"*
- *"Create a simple animation"*  
- *"Render the current scene"*
- *"Add a material to the selected object"*

#### ⚡ Fewsats (Lightning Network)
- *"Check my Lightning balance"*
- *"Create an invoice for 1000 sats"*
- *"Show recent transactions"*
- *"Check payment status"*
- *"Generate a new Lightning invoice"*
- *"Show my node information"*

#### 📦 Amazon
- *"Search for wireless headphones on Amazon"*
- *"Find the best rated coffee makers"*
- *"Show me laptop deals under $1000"*
- *"Search for running shoes"*
- *"Find books about artificial intelligence"*
- *"Look for kitchen appliances"*

## 🔧 Technical Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Browser   │    │  Selection       │    │  Voice Interface│
│  (Provider UI)  │◄──►│  Server          │◄──►│  (WebRTC Bridge)│
└─────────────────┘    │  :8085           │    │  :8086          │
                       └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  MCP Provider    │    │  OpenAI         │
                       │  Selection       │    │  Realtime API   │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Dynamic MCP     │
                       │  Server Process  │
                       │  (HubSpot/HN/etc)│
                       └──────────────────┘
```

### Key Components

1. **Selection Server** (port 8085)
   - Provider management interface
   - Dynamic WebRTC bridge starting/stopping
   - Status monitoring and health checks

2. **WebRTC Bridge** (port 8086)
   - Dynamically created for selected provider
   - Handles voice ↔ MCP communication
   - Provides `/demo` endpoint for voice interface

3. **MCP Servers** (various)
   - Automatically spawned based on provider selection
   - Each has unique configuration and capabilities

## 📁 File Structure

```
examples/voice-demo/
├── server.ts           # Main server with provider selection
├── package.json        # Dependencies and scripts
├── env.example         # Environment variables template
├── README.md          # This file
└── .env               # Your API keys (created from template)
```

## 🔍 Environment Variables

### Required
```bash
# OpenAI API Key (Required for all providers)
OPENAI_API_KEY=sk-your-openai-api-key
```

### Optional (enables specific providers)
```bash
# HubSpot CRM Integration
HUBSPOT_TOKEN=pat-your-hubspot-private-app-token

# Fewsats Lightning Network Integration
FEWSATS_API_KEY=your-fewsats-api-key

# GitHub Integration (if you add GitHub MCP)
GITHUB_TOKEN=ghp_your-github-personal-access-token

# Custom MCP Server
CUSTOM_MCP_URL=http://localhost:3000
CUSTOM_MCP_TOKEN=your-custom-token

# Server Configuration
PORT=8085
HOST=localhost
```

## 🆕 Adding New Providers

To add a new MCP provider, edit `server.ts` and add to the `MCP_PROVIDERS` array:

```typescript
{
  id: 'github',
  name: 'GitHub',
  description: 'Manage repositories, issues, and pull requests',
  icon: '🐙',
  config: {
    command: 'npx',
    args: ['-y', '@github/mcp-server'],
    env: {
      GITHUB_TOKEN: process.env.GITHUB_TOKEN!,
    },
    timeout: 15000,
  },
  instructions: 'You are a helpful GitHub assistant...',
  requiredEnvVars: ['GITHUB_TOKEN'],
  voiceCommands: [
    'Show my repositories',
    'List open pull requests',
    'Create a new issue'
  ]
}
```

## 🧪 Testing

### Manual Testing
1. Start the server: `npm run dev`
2. Open http://localhost:8085
3. Select a provider (with required API keys)
4. Click "Open Voice Interface"
5. Allow microphone access
6. Start talking!

### Provider Status
- ✅ **Ready** - Provider has all required API keys
- ❌ **Setup Required** - Missing required environment variables
- 🔵 **Active** - Currently running voice interface

## 🛠️ Troubleshooting

### Provider Won't Start
- Check that all required environment variables are set
- Verify API keys are valid and have necessary permissions
- Check the console logs for specific error messages

### Voice Interface Not Working
- Ensure microphone permissions are granted
- Check that WebRTC bridge is running (status should show "🟢 Running")
- Try refreshing the page

### Missing Providers
- Make sure the MCP server packages are available (`npx`, `uvx` commands work)
- Check internet connection for downloading MCP servers
- Verify the provider configuration in `server.ts`

## 📚 Next Steps

- **Add more providers** - Extend with GitHub, Slack, or custom MCP servers
- **Enhance UI** - Add more detailed status information and controls
- **Voice feedback** - Add visual indicators for speech detection
- **Provider history** - Remember last used provider and settings

---

**This unified demo showcases the power of the `@realtime-mcp/core` library - one simple API to connect voice AI with any MCP server! 🚀** 