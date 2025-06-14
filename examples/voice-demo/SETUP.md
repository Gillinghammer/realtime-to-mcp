# 🚀 Voice Demo Setup Guide

**✨ The library is now published on NPM as `@gillinghammer/realtime-mcp-core`!**

## Quick Start

1. **Install dependencies:**
   ```bash
   cd examples/voice-demo
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in this directory with:
   ```bash
   # Required: OpenAI API Key
   OPENAI_API_KEY=sk-proj-your-openai-api-key-here
   
   # Optional: For HubSpot CRM provider
   HUBSPOT_TOKEN=your-hubspot-private-app-token-here
   
   # Optional: Debug settings
   DEBUG=false
   DEBUG_FUNCTIONS=false
   ```

3. **Get your API keys:**
   - **OpenAI API Key**: Visit [OpenAI Platform](https://platform.openai.com/api-keys)
   - **HubSpot Token**: Visit [HubSpot Private Apps](https://app.hubspot.com/private-apps)

4. **Start the demo:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Visit `http://localhost:8085` to try the voice interface!

## Available MCP Providers

| Provider | Requires API Key | Setup |
|----------|------------------|-------|
| 🏢 **HubSpot CRM** | ✅ HUBSPOT_TOKEN | Manage contacts, companies, deals |
| 📰 **Hacker News** | ❌ None | Latest tech news and discussions |
| 🏠 **Airbnb Search** | ❌ None | Find properties and accommodations |
| 🎨 **Blender 3D** | ❌ None | 3D modeling and animation |
| 📦 **Amazon** | ❌ None | Product search and browsing |
| 🎵 **Ableton Live** | ❌ None | Music production controls |

## Troubleshooting

- **"Missing OpenAI API Key"**: Make sure you've created the `.env` file with your API key
- **Provider not available**: Check that required environment variables are set for that provider
- **Port conflicts**: Change `PORT=8085` in your `.env` file to use a different port 