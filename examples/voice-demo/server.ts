// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

// Debug environment loading
console.log('🔧 Environment variable debug:');
console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'Set ✅' : 'Not set ❌'}`);
console.log(`   .env file path: ${process.cwd()}/.env`);

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { WebRTCBridgeServer } from '@gillinghammer/realtime-mcp-core';
import type { WebRTCBridgeConfig } from '@gillinghammer/realtime-mcp-core';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || '8085');
const HOST = process.env.HOST || 'localhost';

// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('\n❌ ERROR: Missing required environment variable');
  console.error('📝 Please create a .env file in the project root with:');
  console.error('   OPENAI_API_KEY=sk-proj-your-api-key-here');
  console.error('   HUBSPOT_TOKEN=your-hubspot-token-here (optional)');
  console.error('\n🔗 Get your OpenAI API key from: https://platform.openai.com/api-keys');
  process.exit(1);
}

// MCP Provider Configurations
interface MCPProvider {
  id: string;
  name: string;
  description: string;
  icon: string;
  config: WebRTCBridgeConfig['mcp'];
  instructions: string;
  requiredEnvVars: string[];
  voiceCommands: string[];
}

const MCP_PROVIDERS: MCPProvider[] = [
  {
    id: 'hubspot',
    name: 'HubSpot CRM',
    description: 'Manage contacts, companies, deals, and notes in your HubSpot CRM',
    icon: '🏢',
    config: {
      command: 'npx',
      args: ['-y', '@hubspot/mcp-server'],
      env: {
        PRIVATE_APP_ACCESS_TOKEN: process.env.HUBSPOT_TOKEN!,
      },
      timeout: 30000, // Increased timeout
    },
    instructions: `You are a helpful HubSpot CRM assistant. You can help users manage their HubSpot data including:
- Viewing and searching contacts, companies, and deals
- Creating notes and tasks
- Getting account information
- Searching for specific records

Always be friendly and provide clear, actionable information. When calling HubSpot functions, explain what you're doing and what the results mean.`,
    requiredEnvVars: ['HUBSPOT_TOKEN'],
    voiceCommands: [
      'Show me recent contacts',
      'Search for companies with "tech" in the name',
      'Get my account details',
      'Add a note to John Smith',
      'List my deals'
    ]
  },
  {
    id: 'hackernews',
    name: 'Hacker News',
    description: 'Get the latest tech news and discussions from Hacker News',
    icon: '📰',
    config: {
      command: 'uvx',
      args: ['mcp-hn'],
      timeout: 30000,
    },
    instructions: `You are a helpful tech news assistant with access to real-time Hacker News data.

You can help users with:
- Getting the latest top stories from Hacker News
- Finding trending tech discussions and news
- Searching for specific topics or keywords in HN stories
- Providing summaries of popular tech articles and discussions
- Keeping users updated on what's happening in the tech world

Always be enthusiastic about technology and provide insightful commentary on the stories you find. When sharing stories, mention the key details like title, points, comments, and why it might be interesting to tech enthusiasts.

This is a conversational voice interface, so be concise and to the point. Avoid reading out URLs or other links that wouldn't make sense to say out loud.`,
    requiredEnvVars: [],
    voiceCommands: [
      'What are the top stories on Hacker News?',
      'Find articles about artificial intelligence',
      'Show trending tech discussions',
      'Search for stories about OpenAI',
      'What\'s popular in tech today?'
    ]
  },
  {
    id: 'airbnb',
    name: 'Airbnb Search',
    description: 'Search for Airbnb properties and accommodations',
    icon: '🏠',
    config: {
      command: 'npx',
      args: ['-y', '@openbnb/mcp-server-airbnb', '--ignore-robots-txt'],
      timeout: 30000,
    },
    instructions: `You are a helpful travel assistant with access to Airbnb property search.

You can help users with:
- Searching for properties in specific locations
- Finding accommodations for specific dates
- Getting details about property availability and pricing
- Helping with travel planning and accommodation selection

Always be helpful and provide clear information about properties. When searching, mention key details like location, dates, number of guests, and any special preferences they might have.

This is a voice interface, so be conversational and avoid reading out long URLs or complex booking details that would be hard to follow by voice.`,
    requiredEnvVars: [],
    voiceCommands: [
      'Find properties in San Francisco for next weekend',
      'Search for apartments in New York for 2 guests',
      'Show me places to stay in Tokyo',
      'Find vacation rentals in Paris for July',
      'Search for cabins in the mountains'
    ]
  },
  {
    id: 'blender',
    name: 'Blender 3D',
    description: 'Control Blender 3D software for modeling, animation, and rendering',
    icon: '🎨',
    config: {
      command: 'uvx',
      args: ['blender-mcp'],
      timeout: 30000,
    },
    instructions: `You are a helpful 3D modeling and animation assistant with access to Blender 3D software.

You can help users with:
- Creating and manipulating 3D objects, meshes, and scenes
- Setting up materials, lighting, and textures
- Managing animations and keyframes
- Rendering images and animations
- Working with the Blender scene graph and objects
- Modifying object properties, transforms, and modifiers

Always provide clear step-by-step guidance for 3D operations. When working with Blender, explain what you're doing in simple terms since 3D modeling can be complex. Be patient and thorough in your explanations.

This is a voice interface, so focus on the most important details and avoid overwhelming users with too many technical parameters at once.`,
    requiredEnvVars: [],
    voiceCommands: [
      'Create a new cube in the scene',
      'Add a sphere and move it up',
      'Set up basic lighting for the scene',
      'Create a simple animation',
      'Render the current scene',
      'Add a material to the selected object'
    ]
  },
  {
    id: 'amazon',
    name: 'Amazon',
    description: 'Search and browse Amazon products',
    icon: '📦',
    config: {
      command: 'env',
      args: [
        'PYTHONHTTPSVERIFY=0',
        'SSL_VERIFY=false',
        'REQUESTS_CA_BUNDLE=',
        'uvx',
        'amazon-mcp'
      ],
      timeout: 30000,
    },
    instructions: `You are a helpful shopping assistant with access to Amazon product search.

You can help users with:
- Searching for products on Amazon
- Finding product details, prices, and availability
- Comparing different products and options
- Getting product reviews and ratings
- Finding deals and discounts
- Helping with product recommendations based on needs

Always provide clear information about products including prices, ratings, and key features. When showing multiple products, highlight the key differences to help users make informed decisions.

This is a voice interface, so focus on the most important product details and avoid reading out long product descriptions or technical specifications that would be hard to follow by voice.`,
    requiredEnvVars: [],
    voiceCommands: [
      'Search for wireless headphones on Amazon',
      'Find the best rated coffee makers',
      'Show me laptop deals under $1000',
      'Search for running shoes',
      'Find books about artificial intelligence',
      'Look for kitchen appliances'
    ]
  },
  {
    id: 'ableton',
    name: 'Ableton Live',
    description: 'Control Ableton Live DAW for music production and performance',
    icon: '🎵',
    config: {
      command: 'uvx',
      args: ['ableton-mcp'],
      timeout: 30000,
    },
    instructions: `You are a helpful music production assistant with access to Ableton Live DAW.

You can help users with:
- Controlling playback, recording, and transport functions
- Managing tracks, clips, and scenes in Live sets
- Adjusting mixer settings, volumes, and effects
- Working with devices, instruments, and audio effects
- Managing the session and arrangement views
- Controlling tempo, quantization, and timing

Always provide clear guidance for music production tasks. When working with Ableton Live, explain what you're doing in musical terms that producers would understand. Be helpful with both creative and technical aspects of music production.

This is a voice interface, so focus on the most important controls and avoid overwhelming users with too many technical parameters at once.`,
    requiredEnvVars: [],
    voiceCommands: [
      'Start playbook in Ableton',
      'Stop the current recording',
      'Set the tempo to 120 BPM',
      'Create a new audio track',
      'Launch the first scene',
      'Adjust the master volume'
    ]
  },
];

// Global state
let activeBridge: WebRTCBridgeServer | null = null;
let currentProvider: string | null = null;
let discoveredTools: any[] = [];
let isConnecting = false;
let connectionLogs: string[] = [];
let wsClients: Set<any> = new Set();

// Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server for WebSocket
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// WebSocket for real-time updates
wss.on('connection', (ws) => {
  wsClients.add(ws);
  
  // Send current state
  ws.send(JSON.stringify({
    type: 'state',
    data: {
      providers: getProvidersWithStatus(),
      currentProvider,
      discoveredTools,
      isConnecting,
      logs: connectionLogs.slice(-50) // Last 50 log entries
    }
  }));
  
  ws.on('close', () => {
    wsClients.delete(ws);
  });
});

// Broadcast to all WebSocket clients
function broadcast(message: any) {
  const data = JSON.stringify(message);
  wsClients.forEach(ws => {
    if (ws.readyState === 1) { // OPEN
      ws.send(data);
    }
  });
}

// Add log entry and broadcast
function addLog(message: string, type: 'info' | 'error' | 'success' = 'info') {
  const timestamp = new Date().toISOString().substr(11, 8);
  const logEntry = `[${timestamp}] ${message}`;
  connectionLogs.push(logEntry);
  
  // Keep only last 100 entries
  if (connectionLogs.length > 100) {
    connectionLogs = connectionLogs.slice(-100);
  }
  
  console.log(logEntry);
  
  broadcast({
    type: 'log',
    data: { message: logEntry, type }
  });
}

function getProvidersWithStatus() {
  return MCP_PROVIDERS.map(provider => {
    const missingEnvVars = provider.requiredEnvVars.filter(envVar => !process.env[envVar]);
    return {
      ...provider,
      available: missingEnvVars.length === 0,
      missingEnvVars,
      config: undefined // Don't expose config in API
    };
  });
}

// API Routes
app.get('/api/providers', (req, res) => {
  res.json({
    providers: getProvidersWithStatus(),
    currentProvider,
    discoveredTools,
    isConnecting
  });
});

app.post('/api/connect/:providerId', async (req, res) => {
  const { providerId } = req.params;
  
  if (isConnecting) {
    return res.status(400).json({ error: 'Connection in progress' });
  }
  
  try {
    const provider = MCP_PROVIDERS.find(p => p.id === providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }
    
    // Check required environment variables
    const missingEnvVars = provider.requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingEnvVars.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required environment variables',
        missingEnvVars 
      });
    }
    
    isConnecting = true;
    discoveredTools = [];
    
    broadcast({
      type: 'state',
      data: { isConnecting: true, discoveredTools: [] }
    });
    
    console.log('\n🎯 ===== STARTING CONNECTION =====');
    addLog(`🚀 Starting connection to ${provider.name}...`, 'info');
    
    // Stop current bridge if running
    if (activeBridge) {
      addLog(`🛑 Stopping current bridge (${currentProvider})`, 'info');
      await activeBridge.stop();
      activeBridge = null;
    }
    
    // Create bridge config without WebRTC server (we'll handle that separately)
    const bridgeConfig: WebRTCBridgeConfig = {
      openai: {
        apiKey: process.env.OPENAI_API_KEY!,
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy',
        instructions: provider.instructions,
      },
      mcp: provider.config,
      server: {
        port: PORT + 100, // Use a different port to avoid conflicts
        host: HOST,
        cors: true,
      },
      debug: {
        enabled: process.env.DEBUG === 'true',
        logTools: false, // Disable verbose tool logging during connection
        logFunctionCalls: process.env.DEBUG_FUNCTIONS === 'true',
      },
    };
    
    addLog(`🔧 Creating WebRTC bridge on port ${PORT + 100}...`, 'info');
    activeBridge = new WebRTCBridgeServer(bridgeConfig);
    
    addLog(`🚀 Starting bridge server...`, 'info');
    await activeBridge.start();
    
    // Get tools from the MCP API after connection
    try {
      const toolsResponse = await fetch(`http://${HOST}:${PORT + 100}/tools`);
      if (toolsResponse.ok) {
        const toolsData = await toolsResponse.json();
        discoveredTools = toolsData.tools || [];
        addLog(`✅ Connected! Discovered ${discoveredTools.length} tools`, 'success');
      } else {
        addLog(`⚠️ Connected but couldn't fetch tools`, 'info');
      }
    } catch (error) {
      addLog(`⚠️ Connected but couldn't fetch tools: ${error}`, 'info');
    }
    
    currentProvider = providerId;
    isConnecting = false;
    
    // Broadcast the updated state
    broadcast({
      type: 'state',
      data: { 
        currentProvider: providerId,
        discoveredTools,
        isConnecting: false
      }
    });
    
    addLog(`🎙️ Voice interface ready at http://${HOST}:${PORT + 100}/demo`, 'success');
    console.log('🎯 ===== CONNECTION SUCCESSFUL =====\n');
    
    res.json({ 
      success: true, 
      provider: provider.name,
      tools: discoveredTools,
      voiceUrl: `http://${HOST}:${PORT + 100}/demo`,
      bridgeUrl: `http://${HOST}:${PORT + 100}`
    });
    
  } catch (error) {
    isConnecting = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const fullError = error instanceof Error ? error.stack : error;
    
    // Log to both our system and stderr for visibility
    addLog(`❌ CRITICAL ERROR: Failed to connect to ${providerId}`, 'error');
    addLog(`💥 Error details: ${errorMessage}`, 'error');
    console.error('\n🚨 ===== CONNECTION ERROR =====');
    console.error(`Provider: ${providerId}`);
    console.error(`Error: ${errorMessage}`);
    console.error(`Full stack:`, fullError);
    console.error('🚨 =============================\n');
    
    broadcast({
      type: 'state',
      data: { isConnecting: false }
    });
    
    res.status(500).json({ 
      error: 'Failed to start bridge',
      message: errorMessage,
      provider: providerId
    });
  }
});

app.post('/api/disconnect', async (req, res) => {
  try {
    if (activeBridge) {
      addLog(`🛑 Disconnecting from ${currentProvider}...`, 'info');
      await activeBridge.stop();
      activeBridge = null;
    }
    
    currentProvider = null;
    discoveredTools = [];
    isConnecting = false;
    
    broadcast({
      type: 'state',
      data: {
        currentProvider: null,
        discoveredTools: [],
        isConnecting: false
      }
    });
    
    addLog(`✅ Disconnected successfully`, 'success');
    
    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    addLog(`❌ Disconnect failed: ${errorMessage}`, 'error');
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    currentProvider,
    discoveredTools,
    isConnecting,
    bridgeRunning: activeBridge?.isServerRunning() || false,
    bridgeUrl: activeBridge ? `http://${HOST}:${PORT + 100}` : null,
    logs: connectionLogs.slice(-20)
  });
});

// Serve the main interface
app.get('/', (req, res) => {
  res.send(getMainHTML());
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (activeBridge) {
    await activeBridge.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (activeBridge) {
    await activeBridge.stop();
  }
  process.exit(0);
});

// Start the server
httpServer.listen(PORT, HOST, () => {
  console.log('\n🎙️ Realtime MCP Voice Demo');
  console.log('============================');
  console.log(`🌐 Interface: http://${HOST}:${PORT}`);
  console.log('\n📋 Available Providers:');
  
  MCP_PROVIDERS.forEach(provider => {
    const missingEnvVars = provider.requiredEnvVars.filter(envVar => !process.env[envVar]);
    const status = missingEnvVars.length === 0 ? '✅' : '❌';
    console.log(`   ${status} ${provider.icon} ${provider.name}`);
    if (missingEnvVars.length > 0) {
      console.log(`      Missing: ${missingEnvVars.join(', ')}`);
    }
  });
  
  console.log('\n🚀 Ready! Open the interface to get started.');
});

function getMainHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎙️ Realtime MCP Voice Demo</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #fafbfc;
            min-height: 100vh;
            color: #2c3e50;
            padding: 24px;
            line-height: 1.5;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .header {
            text-align: left;
            margin-bottom: 32px;
            padding-bottom: 24px;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .header h1 {
            font-size: 1.875rem;
            margin-bottom: 4px;
            font-weight: 600;
            color: #1a202c;
            letter-spacing: -0.025em;
        }
        
        .main-content {
            display: grid;
            grid-template-columns: 1.4fr 1fr;
            gap: 24px;
            margin-bottom: 24px;
            height: calc(100vh - 200px);
        }
        
        .panel {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        
        .panel.provider-panel {
            height: 634px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }
        
        .panel h2 {
            margin: 0 0 20px 0;
            font-size: 1.125rem;
            font-weight: 600;
            color: #1a202c;
            padding-bottom: 12px;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .panel.transcript-panel {
            height: 634px;
            display: flex;
            flex-direction: column;
        }
        
        .provider-section h2 {
            margin-bottom: 20px;
            color: #1a202c;
            font-size: 1.125rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .provider-select {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 14px;
            background: white;
            color: #374151;
            margin-bottom: 12px;
        }
        
        .provider-select:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        .control-buttons {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
        }
        
        .btn {
            padding: 8px 16px;
            border: 1px solid transparent;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        
        .btn-primary {
            background: #3b82f6;
            color: white;
            border-color: #3b82f6;
        }
        
        .btn-primary:hover:not(:disabled) {
            background: #2563eb;
            border-color: #2563eb;
        }
        
        .btn-secondary {
            background: white;
            color: #374151;
            border-color: #d1d5db;
        }
        
        .btn-secondary:hover:not(:disabled) {
            background: #f9fafb;
            border-color: #9ca3af;
        }
        
        .btn-danger {
            background: #ef4444;
            color: white;
            border-color: #ef4444;
        }
        
        .btn-danger:hover:not(:disabled) {
            background: #dc2626;
            border-color: #dc2626;
        }
        
        .btn:disabled {
            background: #f3f4f6;
            color: #9ca3af;
            border-color: #e5e7eb;
            cursor: not-allowed;
        }
        
        .provider-info {
            background: #f8fafc;
            padding: 16px;
            border-radius: 4px;
            border: 1px solid #e2e8f0;
            margin-bottom: 16px;
            display: none;
        }
        
        .provider-info.active {
            display: block;
        }
        
        .status {
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 16px;
            font-weight: 500;
            font-size: 14px;
            border: 1px solid transparent;
        }
        
        .status.connected {
            background: #f0fdf4;
            color: #166534;
            border-color: #bbf7d0;
        }
        
        .status.connecting {
            background: #fffbeb;
            color: #92400e;
            border-color: #fed7aa;
        }
        
        .status.disconnected {
            background: #fef2f2;
            color: #991b1b;
            border-color: #fecaca;
        }
        

        

        

        

        
        .voice-status {
            font-weight: 600;
            margin: 10px 0;
        }
        
        .voice-status.connecting {
            color: #856404;
        }
        
        .voice-status.connected {
            color: #155724;
        }
        
        .voice-status.listening {
            color: #2196f3;
            background: rgba(33, 150, 243, 0.1);
            animation: pulse 2s infinite;
        }
        
        .voice-status.paused {
            color: #9e9e9e;
            background: rgba(158, 158, 158, 0.1);
        }
        
        .voice-status.error {
            color: #721c24;
        }
        
        .loading-spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .voice-commands {
            margin-top: 12px;
            text-align: left;
        }
        
        .voice-commands h4 {
            margin-bottom: 8px;
            color: #374151;
            font-size: 14px;
            font-weight: 500;
        }
        
        .voice-commands ul {
            list-style: none;
            padding: 0;
        }
        
        .voice-commands li {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            padding: 8px 12px;
            margin-bottom: 4px;
            border-radius: 4px;
            font-style: italic;
            color: #64748b;
            font-size: 13px;
        }
        
        .available-tools {
            margin-top: 16px;
        }
        
        .available-tools h4 {
            margin-bottom: 8px;
            color: #374151;
            font-size: 14px;
            font-weight: 500;
        }
        
        .tools-list-inline {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        
        .tool-item-inline {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            color: #64748b;
            border-left: 3px solid #3b82f6;
        }
        
        .tool-item-inline .tool-name {
            font-weight: 600;
            color: #374151;
            font-size: 13px;
        }
        
        .conversation {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 16px;
            margin-top: 16px;
            max-height: 300px;
            overflow-y: auto;
            text-align: left;
        }
        
        .message {
            margin-bottom: 12px;
            padding: 12px 16px;
            border-radius: 4px;
            border: 1px solid transparent;
        }
        
        .message.user {
            background: #eff6ff;
            border-color: #dbeafe;
            margin-left: 24px;
        }
        
        .message.assistant {
            background: #f0fdf4;
            border-color: #bbf7d0;
            margin-right: 24px;
        }
        
        .message.system {
            background: #f8fafc;
            border-color: #e2e8f0;
            color: #64748b;
            font-size: 13px;
        }
        
        .message-sender {
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            margin-bottom: 4px;
            letter-spacing: 0.05em;
        }
        
        /* Modal styles */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.4);
        }
        
        .modal-content {
            background-color: white;
            margin: 5% auto;
            padding: 24px;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .modal-title {
            font-size: 1.125rem;
            font-weight: 600;
            color: #1a202c;
        }
        
        .close {
            color: #9ca3af;
            font-size: 24px;
            font-weight: bold;
            cursor: pointer;
            border: none;
            background: none;
            padding: 4px;
        }
        
        .close:hover {
            color: #374151;
        }
        
        /* Transcript panel */
        .transcript {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 16px;
            flex: 1;
            overflow-y: auto;
            scroll-behavior: smooth;
        }
        
        .transcript-item {
            margin-bottom: 16px;
            padding: 12px 16px;
            border-radius: 4px;
            border: 1px solid transparent;
            font-size: 14px;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        
        .transcript-item.user {
            background: #eff6ff;
            border-color: #dbeafe;
            margin-left: 24px;
            margin-right: 0;
        }
        
        .transcript-item.assistant {
            background: #f0fdf4;
            border-color: #bbf7d0;
            margin-right: 24px;
            margin-left: 0;
        }
        
        .transcript-item.tool {
            background: #f8fafc;
            border-color: #e2e8f0;
            margin-left: 12px;
            margin-right: 12px;
            font-size: 13px;
        }
        
        .transcript-sender {
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            margin-bottom: 4px;
            letter-spacing: 0.05em;
        }
        
        .tool-call-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        
        .tool-name {
            font-weight: 600;
            color: #374151;
        }
        
        .tool-status {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
        }
        
        .tool-status.starting {
            background: #fed7aa;
            color: #92400e;
        }
        
        .tool-status.success {
            background: #bbf7d0;
            color: #166534;
        }
        
        .tool-status.error {
            background: #fecaca;
            color: #991b1b;
        }
        
        .tool-args {
            color: #64748b;
            font-size: 12px;
            margin-top: 4px;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        
        /* Tool response modal */
        .tool-response-modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.4);
        }
        
        .tool-response-content {
            background-color: white;
            margin: 5% auto;
            padding: 24px;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            width: 90%;
            max-width: 800px;
            max-height: 80vh;
            overflow-y: auto;
        }
        
        .tool-response-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .tool-response-title {
            font-size: 1.125rem;
            font-weight: 600;
            color: #1a202c;
        }
        
        .tool-response-body {
            font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
            font-size: 13px;
            line-height: 1.5;
        }
        
        .tool-response-section {
            margin-bottom: 16px;
        }
        
        .tool-response-section h4 {
            margin-bottom: 8px;
            color: #374151;
            font-size: 14px;
            font-weight: 600;
        }
        
        .tool-response-json {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 12px;
            white-space: pre-wrap;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>MCP Voice Interface</h1>
            <p>Connect to MCP providers and start voice conversations</p>
        </div>
        
        <div class="main-content">
            <div class="panel provider-panel provider-section">
                <h2>Provider</h2>
                
                <select id="providerSelect" class="provider-select">
                    <option value="">Select a provider...</option>
                </select>
                
                <div class="control-buttons">
                    <button id="connectBtn" class="btn btn-primary" disabled>
                        Connect
                    </button>
                    <button id="disconnectBtn" class="btn btn-danger" disabled>
                        Disconnect
                    </button>
                </div>
                
                <div id="connectionStatus" class="status disconnected">
                    Disconnected - select a provider and click Connect to start voice chat
                </div>
                
                <div id="providerInfo" class="provider-info">
                    <h3 id="providerName"></h3>
                    <p id="providerDescription"></p>
                    <div id="providerStatus"></div>
                    
                    <div class="voice-commands">
                        <h4>Try saying:</h4>
                        <ul id="voiceCommands"></ul>
                    </div>
                    
                    <div id="availableTools" class="available-tools">
                        <h4>Available Tools:</h4>
                        <div id="toolsList" class="tools-list-inline">
                            <p style="color: #9ca3af; font-style: italic; font-size: 13px;">
                                Connect to see available tools
                            </p>
                        </div>
                    </div>
                </div>
                
                <div id="voiceInterface" style="display: none;">
                </div>
            </div>
            
            <div class="panel transcript-panel">
                <h2>Transcript</h2>
                <div id="transcript" class="transcript">
                    <p style="color: #64748b; text-align: center; padding: 20px; font-size: 13px;">
                        Conversation transcript will appear here when you start talking
                    </p>
                </div>
            </div>
        </div>
    </div>



    <!-- Tool Response Modal -->
    <div id="toolResponseModal" class="tool-response-modal">
        <div class="tool-response-content">
            <div class="tool-response-header">
                <h3 class="tool-response-title" id="toolResponseTitle">Tool Response</h3>
                <button class="close" id="closeToolResponseModal">&times;</button>
            </div>
            <div class="tool-response-body" id="toolResponseBody">
                <!-- Tool response details will be populated here -->
            </div>
        </div>
    </div>

    <script>
        let ws = null;
        let currentState = {
            providers: [],
            currentProvider: null,
            discoveredTools: [],
            isConnecting: false
        };
        
        // Voice chat state
        let pc = null;
        let dataChannel = null;
        let conversation = null;
        let isVoiceConnected = false;
        let userHasSpoken = false;
        let currentAssistantResponse = null;
        
        // Configuration - bridge port is embedded from server
        const BRIDGE_PORT = ${PORT + 100};
        
        function initWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(\`\${protocol}//\${window.location.host}\`);
            
            ws.onopen = () => {
                console.log('WebSocket connected');
            };
            
            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                
                if (message.type === 'state') {
                    Object.assign(currentState, message.data);
                    updateUI();
                }
            };
            
            ws.onclose = () => {
                console.log('WebSocket disconnected, reconnecting...');
                setTimeout(initWebSocket, 1000);
            };
        }
        

        
        async function loadProviders() {
            try {
                const response = await fetch('/api/providers');
                const data = await response.json();
                Object.assign(currentState, data);
                updateUI();
            } catch (error) {
                console.error('Failed to load providers:', error);
            }
        }
        
        function updateUI() {
            updateProviderSelect();
            updateConnectionStatus();
            updateToolsList();
        }
        
        function updateProviderSelect() {
            const select = document.getElementById('providerSelect');
            const currentValue = select.value;
            
            select.innerHTML = '<option value="">Select an MCP provider...</option>';
            
            currentState.providers.forEach(provider => {
                const option = document.createElement('option');
                option.value = provider.id;
                option.textContent = \`\${provider.icon} \${provider.name}\`;
                if (!provider.available) {
                    option.textContent += ' (Setup Required)';
                    option.disabled = true;
                }
                select.appendChild(option);
            });
            
            if (currentState.currentProvider) {
                select.value = currentState.currentProvider;
                showProviderInfo(currentState.currentProvider);
            } else if (currentValue) {
                select.value = currentValue;
                showProviderInfo(currentValue);
            }
        }
        
        function showProviderInfo(providerId) {
            const provider = currentState.providers.find(p => p.id === providerId);
            if (!provider) return;
            
            const info = document.getElementById('providerInfo');
            const connectBtn = document.getElementById('connectBtn');
            
            document.getElementById('providerName').textContent = \`\${provider.icon} \${provider.name}\`;
            document.getElementById('providerDescription').textContent = provider.description;
            
            const statusEl = document.getElementById('providerStatus');
            if (provider.available) {
                statusEl.innerHTML = '<span style="color: #16a34a;">Ready to connect</span>';
                connectBtn.disabled = currentState.isConnecting || currentState.currentProvider === providerId;
            } else {
                statusEl.innerHTML = \`<span style="color: #dc2626;">Missing: \${provider.missingEnvVars.join(', ')}</span>\`;
                connectBtn.disabled = true;
            }
            
            const commandsList = document.getElementById('voiceCommands');
            commandsList.innerHTML = '';
            provider.voiceCommands.slice(0, 3).forEach(cmd => {
                const li = document.createElement('li');
                li.textContent = \`"\${cmd}"\`;
                commandsList.appendChild(li);
            });
            
            info.classList.add('active');
        }
        
        function updateConnectionStatus() {
            const statusEl = document.getElementById('connectionStatus');
            const connectBtn = document.getElementById('connectBtn');
            const disconnectBtn = document.getElementById('disconnectBtn');
            const voiceInterface = document.getElementById('voiceInterface');
            
            if (currentState.isConnecting) {
                statusEl.className = 'status connecting';
                statusEl.innerHTML = '<span class="loading-spinner"></span> Connecting and starting voice chat...';
                connectBtn.disabled = true;
                disconnectBtn.disabled = true;
            } else if (currentState.currentProvider) {
                const provider = currentState.providers.find(p => p.id === currentState.currentProvider);
                statusEl.className = 'status connected';
                statusEl.innerHTML = \`Voice chat active with \${provider?.name} - you can speak now!\`;
                connectBtn.disabled = true;
                disconnectBtn.disabled = false;
                
                // Show voice interface and auto-start voice chat
                voiceInterface.style.display = 'block';
                
                // Auto-start voice chat after MCP connection
                if (!isVoiceConnected) {
                    setTimeout(() => startVoiceChat(), 500);
                }
            } else {
                statusEl.className = 'status disconnected';
                statusEl.innerHTML = 'Disconnected - select a provider and click Connect to start voice chat';
                connectBtn.disabled = !document.getElementById('providerSelect').value;
                disconnectBtn.disabled = true;
                voiceInterface.style.display = 'none';
                
                // Cleanup voice connection
                if (pc) {
                    pc.close();
                    pc = null;
                    isVoiceConnected = false;
                    userHasSpoken = false;
                }
            }
        }
        
        function updateToolsList() {
            const toolsList = document.getElementById('toolsList');
            
            if (currentState.discoveredTools.length === 0) {
                toolsList.innerHTML = '<p style="color: #9ca3af; font-style: italic; font-size: 13px;">Connect to see available tools</p>';
                return;
            }
            
            toolsList.innerHTML = '';
            currentState.discoveredTools.forEach(tool => {
                const toolItem = document.createElement('div');
                toolItem.className = 'tool-item-inline';
                toolItem.title = tool.description || 'No description available';
                
                const toolName = document.createElement('div');
                toolName.className = 'tool-name';
                toolName.textContent = tool.name;
                
                toolItem.appendChild(toolName);
                toolsList.appendChild(toolItem);
            });
        }
        
        // Voice chat functions
        async function startVoiceChat() {
            if (!currentState.currentProvider) return;
            
                            try {
                
                // Get ephemeral API key
                const sessionResponse = await fetch(\`http://localhost:\${BRIDGE_PORT}/session\`);
                if (!sessionResponse.ok) {
                    throw new Error('Failed to get session key');
                }
                const session = await sessionResponse.json();
                
                // Set up WebRTC connection
                pc = new RTCPeerConnection();
                
                // Set up audio element to play remote audio from the model
                const audioEl = document.createElement("audio");
                audioEl.autoplay = true;
                document.body.appendChild(audioEl); // Add to DOM so it can play
                pc.ontrack = e => {
                    console.log('Received remote audio track');
                    audioEl.srcObject = e.streams[0];
                };
                
                // Get microphone access
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                pc.addTrack(stream.getTracks()[0]);
                
                // Create data channel for events
                dataChannel = pc.createDataChannel("oai-events");
                dataChannel.onmessage = handleVoiceMessage;
                
                // Configure session when data channel opens
                dataChannel.onopen = () => {
                    // Default session config optimized for voice interactions
                    const defaultSessionConfig = {
                        modalities: ['text', 'audio'],
                        voice: 'alloy',
                        tool_choice: 'auto',
                        // Voice interface optimizations
                        speed: 1.2, // Optimal speed - fast but not hurried  
                        temperature: 0.7, // Slightly lower for more consistent, professional responses
                        input_audio_transcription: {
                            model: 'whisper-1' // Enable transcription for better UX
                        },
                        turn_detection: {
                            type: 'server_vad',
                            threshold: 0.5,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 400, // Slightly faster response time
                            create_response: true,
                            interrupt_response: true,
                        },
                    };
                    
                    // Use default config with ability to override specific settings
                    const sessionConfig = {
                        ...defaultSessionConfig,
                        // Any voice demo specific overrides can go here
                        // For example: speed: 1.0, // Override default speed if needed
                    };
                    
                    dataChannel.send(JSON.stringify({
                        type: 'session.update',
                        session: sessionConfig
                    }));
                };
                
                // Connect to OpenAI Realtime API
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                
                const response = await fetch(\`https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17\`, {
                    method: "POST",
                    body: offer.sdp,
                    headers: {
                        Authorization: \`Bearer \${session.client_secret.value}\`,
                        "Content-Type": "application/sdp"
                    }
                });
                
                if (!response.ok) {
                    throw new Error('Failed to connect to OpenAI');
                }
                
                const answerSdp = await response.text();
                await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
                
                isVoiceConnected = true;
                
            } catch (error) {
                console.error('Voice chat error:', error);
            }
        }
        
        function handleVoiceMessage(event) {
            try {
                const data = JSON.parse(event.data);
                
                // Handle different message types
                if (data.type === 'conversation.item.input_audio_transcription.completed') {
                    currentAssistantResponse = null; // Reset for new conversation
                    userHasSpoken = true;
                    addTranscriptMessage('user', data.transcript);
                } else if (data.type === 'response.created') {
                    currentAssistantResponse = null; // Reset for new response
                } else if (data.type === 'response.text.delta') {
                    // Collect text deltas but don't add to transcript yet
                    if (userHasSpoken) {
                        if (!currentAssistantResponse) {
                            currentAssistantResponse = '';
                        }
                        currentAssistantResponse += data.delta;
                    }
                } else if (data.type === 'response.text.done') {
                    // Add complete AI text response to transcript
                    if (userHasSpoken && currentAssistantResponse) {
                        addTranscriptMessage('assistant', currentAssistantResponse);
                        currentAssistantResponse = null;
                    }
                } else if (data.type === 'response.function_call_arguments.done') {
                    // Add small delay to ensure user transcription is processed first
                    setTimeout(() => handleFunctionCall(data), 100);
                } else if (data.type === 'conversation.item.created') {
                    // Skip - we handle AI responses through response.text.done and response.audio_transcript.done
                } else if (data.type === 'response.audio_transcript.delta') {
                    // Collect audio transcript deltas but don't add to transcript yet
                    if (userHasSpoken) {
                        if (!currentAssistantResponse) {
                            currentAssistantResponse = '';
                        }
                        currentAssistantResponse += data.delta;
                    }
                } else if (data.type === 'response.audio_transcript.done') {
                    // Add complete AI audio transcript to transcript
                    if (userHasSpoken && currentAssistantResponse) {
                        addTranscriptMessage('assistant', currentAssistantResponse);
                        currentAssistantResponse = null;
                    }
                }
            } catch (error) {
                console.error('Error handling voice message:', error);
            }
        }
        
        async function handleFunctionCall(functionCallData) {
            try {
                const { call_id, name, arguments: args } = functionCallData;
                
                // Bridge server now handles function name mapping automatically
                // Just send the OpenAI function name directly
                const parsedArgs = JSON.parse(args);
                
                // Call the MCP tool via our bridge server
                const response = await fetch(\`http://localhost:\${BRIDGE_PORT}/mcp\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: Date.now(),
                        method: 'tools/call',
                        params: {
                            name: name, // Bridge server handles the mapping
                            arguments: parsedArgs
                        }
                    })
                });
                
                const result = await response.json();
                
                if (result.error) {
                    throw new Error(result.error.message);
                }
                
                // Add tool call to transcript with response
                addToolCallToTranscript(name, parsedArgs, result.result, 'success');
                
                // Send the result back to OpenAI via the data channel
                dataChannel.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: call_id,
                        output: JSON.stringify(result.result)
                    }
                }));
                
                // Trigger AI to generate a response with the function results
                setTimeout(() => {
                    dataChannel.send(JSON.stringify({ 
                        type: 'response.create',
                        response: {
                            modalities: ['text', 'audio']
                        }
                    }));
                }, 100);
                
            } catch (error) {
                console.error('Function call error:', error);
                
                // Add error to transcript
                try {
                    const errorArgs = args ? JSON.parse(args) : {};
                    addToolCallToTranscript(name, errorArgs, { error: error.message }, 'error');
                } catch (parseError) {
                    addToolCallToTranscript(name, { args }, { error: error.message }, 'error');
                }
                
                // Send error back to OpenAI
                if (dataChannel && dataChannel.readyState === 'open') {
                    dataChannel.send(JSON.stringify({
                        type: 'conversation.item.create',
                        item: {
                            type: 'function_call_output',
                            call_id: functionCallData.call_id,
                            output: JSON.stringify({ error: error.message })
                        }
                    }));
                }
            }
        }
        
        function addTranscriptMessage(sender, message) {
            // Skip system messages about function calls - they only go to the tool calls in transcript
            if (sender === 'system' && (message.includes('Executing') || message.includes('Calling function') || message.includes('Tool completed'))) {
                return;
            }
            
            const transcript = document.getElementById('transcript');
            
            if (!transcript) {
                return;
            }
            
            // Remove placeholder text if it exists
            if (transcript.children.length === 1 && transcript.children[0].tagName === 'P') {
                transcript.innerHTML = '';
            }
            
            const messageDiv = document.createElement('div');
            messageDiv.className = \`transcript-item \${sender}\`;
            
            const senderDiv = document.createElement('div');
            senderDiv.className = 'transcript-sender';
            senderDiv.textContent = sender === 'user' ? 'YOU' : sender === 'assistant' ? 'AI' : 'SYSTEM';
            
            const contentDiv = document.createElement('div');
            contentDiv.textContent = message;
            
            messageDiv.appendChild(senderDiv);
            messageDiv.appendChild(contentDiv);
            transcript.appendChild(messageDiv);
            
            // Auto-scroll to bottom
            setTimeout(() => {
                transcript.scrollTop = transcript.scrollHeight;
            }, 10);
        }
        
        function addToolCallToTranscript(toolName, args = null, response = null, type = 'starting') {
            const transcript = document.getElementById('transcript');
            
            // Remove placeholder text if it exists
            if (transcript.children.length === 1 && transcript.children[0].tagName === 'P') {
                transcript.innerHTML = '';
            }
            
            const item = document.createElement('div');
            item.className = 'transcript-item tool';
            
            const headerDiv = document.createElement('div');
            headerDiv.className = 'tool-call-header';
            
            const toolNameSpan = document.createElement('span');
            toolNameSpan.className = 'tool-name';
            toolNameSpan.textContent = toolName;
            
            const statusSpan = document.createElement('span');
            statusSpan.className = \`tool-status \${type}\`;
            statusSpan.textContent = type === 'success' ? 'SUCCEEDED' : type === 'error' ? 'FAILED' : type.toUpperCase();
            
            headerDiv.appendChild(toolNameSpan);
            headerDiv.appendChild(statusSpan);
            
            item.appendChild(headerDiv);
            
            // Add simplified args preview
            if (args && Object.keys(args).length > 0) {
                const argsDiv = document.createElement('div');
                argsDiv.className = 'tool-args';
                
                const argsPreview = Object.entries(args)
                    .slice(0, 2) // Show first 2 args
                    .map(([key, value]) => {
                        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
                        const truncated = stringValue.length > 30 ? stringValue.substring(0, 30) + '...' : stringValue;
                        return \`\${key}: \${truncated}\`;
                    })
                    .join(', ');
                
                argsDiv.textContent = argsPreview;
                item.appendChild(argsDiv);
            }
            
            // Store the response data for modal
            item.setAttribute('data-response', JSON.stringify({ args, response }));
            
            transcript.appendChild(item);
            
            // Auto-scroll to bottom
            setTimeout(() => {
                transcript.scrollTop = transcript.scrollHeight;
            }, 10);
            
            // Keep only last 50 transcript items
            while (transcript.children.length > 50) {
                transcript.removeChild(transcript.firstChild);
            }
        }
        
        function openToolResponseModal(toolName, args, response) {
            const modal = document.getElementById('toolResponseModal');
            const title = document.getElementById('toolResponseTitle');
            const body = document.getElementById('toolResponseBody');
            
            title.textContent = \`Tool Response: \${toolName}\`;
            
            let content = '';
            
            if (args && Object.keys(args).length > 0) {
                content += \`
                    <div class="tool-response-section">
                        <h4>Arguments</h4>
                        <div class="tool-response-json">\${JSON.stringify(args, null, 2)}</div>
                    </div>
                \`;
            }
            
            if (response) {
                content += \`
                    <div class="tool-response-section">
                        <h4>Response</h4>
                        <div class="tool-response-json">\${JSON.stringify(response, null, 2)}</div>
                    </div>
                \`;
            }
            
            body.innerHTML = content;
            modal.style.display = 'block';
        }

        // Removed streaming functions - now using complete responses only
        
        // Event listeners
        document.getElementById('providerSelect').addEventListener('change', (e) => {
            if (e.target.value) {
                showProviderInfo(e.target.value);
            } else {
                document.getElementById('providerInfo').classList.remove('active');
                document.getElementById('connectBtn').disabled = true;
            }
        });
        
        document.getElementById('connectBtn').addEventListener('click', async () => {
            const providerId = document.getElementById('providerSelect').value;
            if (!providerId) return;
            
            try {
                const response = await fetch(\`/api/connect/\${providerId}\`, {
                    method: 'POST'
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    alert(\`Connection failed: \${error.message}\`);
                }
            } catch (error) {
                alert(\`Connection failed: \${error.message}\`);
            }
        });
        
        document.getElementById('disconnectBtn').addEventListener('click', async () => {
            try {
                const response = await fetch('/api/disconnect', {
                    method: 'POST'
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    alert(\`Disconnect failed: \${error.error}\`);
                }
            } catch (error) {
                alert(\`Disconnect failed: \${error.message}\`);
            }
        });
        

        
        // Tool response modal functionality
        document.getElementById('closeToolResponseModal').addEventListener('click', () => {
            document.getElementById('toolResponseModal').style.display = 'none';
        });

        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            const toolResponseModal = document.getElementById('toolResponseModal');
            
            if (event.target === toolResponseModal) {
                toolResponseModal.style.display = 'none';
            }
        });
        
        // Initialize
        // conversation variable is no longer needed - using transcript directly
        
        loadProviders();
        initWebSocket();
    </script>
</body>
</html>`;
} 