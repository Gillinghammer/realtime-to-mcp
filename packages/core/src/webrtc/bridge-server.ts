import express from 'express';
import cors from 'cors';
import { spawn, ChildProcess } from 'child_process';
import type { Server } from 'http';
import type { MCPConfig, OpenAIConfig, MCPClientInterface, MCPTool, MCPToolCallResult, MCPRequest, MCPResponse } from '../types/index.js';
import { MCPClient } from '../mcp/client.js';

/**
 * MCP Client that communicates via stdio with spawned processes
 */
class StdioMCPClient implements MCPClientInterface {
  private readonly process: ChildProcess;
  private readonly timeout: number;
  private requestId = 0;
  private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>();
  private buffer = '';
  private initialized = false;

  constructor(process: ChildProcess, timeout = 10000) {
    this.process = process;
    this.timeout = timeout;
    this.setupStdioHandling();
  }

  async discoverTools(): Promise<MCPTool[]> {
    // Ensure MCP server is initialized before discovering tools
    if (!this.initialized) {
      await this.initializeMCP();
    }

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'tools/list',
    };

    const response = await this.sendRequest(request);
    
    if (response.error) {
      throw new Error(`MCP tools/list failed: ${response.error.message}`);
    }

    return response.result?.tools || [];
  }

  private async initializeMCP(): Promise<void> {
    // Send initialize request
    const initRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'webrtc-bridge',
          version: '1.0.0'
        }
      }
    };

    const initResponse = await this.sendRequest(initRequest);
    
    if (initResponse.error) {
      throw new Error(`MCP initialization failed: ${initResponse.error.message}`);
    }

    // Send initialized notification
    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    };

    // Send notification (no response expected)
    if (this.process.stdin) {
      this.process.stdin.write(JSON.stringify(initializedNotification) + '\n');
    }

    // Wait a moment for the server to process the notification
    await new Promise(resolve => setTimeout(resolve, 1000));

    this.initialized = true;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    // Ensure MCP server is initialized before calling tools
    if (!this.initialized) {
      await this.initializeMCP();
    }

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    };

    const response = await this.sendRequest(request);
    
    if (response.error) {
      throw new Error(`MCP tools/call failed for ${name}: ${response.error.message}`);
    }

    if (!response.result) {
      throw new Error(`MCP tools/call returned no result for ${name}`);
    }

    return response.result;
  }

  isConnected(): boolean {
    return this.process && !this.process.killed;
  }

  async disconnect(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
    }
  }

  private setupStdioHandling(): void {
    if (this.process.stdout) {
      this.process.stdout.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });
    }

    if (this.process.stderr) {
      this.process.stderr.on('data', (data: Buffer) => {
        console.error('MCP stderr:', data.toString());
      });
    }
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line) as MCPResponse<any>;
          this.handleResponse(response);
        } catch (error) {
          // Only log if it looks like it should be JSON (starts with { or [)
          const trimmed = line.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            console.error('Failed to parse MCP response:', line, error);
          }
          // Otherwise it's likely just startup/debug output, ignore silently
        }
      }
    }
  }

  private handleResponse(response: MCPResponse<any>): void {
    const requestId = response.id?.toString();
    if (requestId && this.pendingRequests.has(requestId)) {
      const pending = this.pendingRequests.get(requestId)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.resolve(response);
    }
  }

  private async sendRequest(request: MCPRequest): Promise<MCPResponse<any>> {
    return new Promise((resolve, reject) => {
      const requestId = request.id?.toString();
      if (!requestId) {
        reject(new Error('Request ID is required'));
        return;
      }

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`MCP request timeout after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      const requestLine = JSON.stringify(request) + '\n';
      if (this.process.stdin) {
        this.process.stdin.write(requestLine);
      } else {
        reject(new Error('Process stdin not available'));
      }
    });
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestId}`;
  }
}

export interface WebRTCBridgeConfig {
  openai: OpenAIConfig & {
    /** OpenAI API key for generating ephemeral keys */
    apiKey: string;
  };
  mcp: (
    // HTTP MCP server configuration
    MCPConfig
  ) | (
    // Spawned MCP server configuration
    {
      /** MCP server command and arguments */
      command: string;
      args?: string[];
      /** Environment variables for MCP server */
      env?: Record<string, string>;
      /** Request timeout in milliseconds */
      timeout?: number;
    }
  );
  server?: {
    /** Port for the bridge server (default: 8084) */
    port?: number;
    /** Host for the bridge server (default: localhost) */
    host?: string;
    /** Enable CORS (default: true) */
    cors?: boolean;
  };
  debug?: {
    /** Enable verbose logging for function calls and tools (default: false) */
    enabled?: boolean;
    /** Log discovered tools when creating sessions (default: false) */
    logTools?: boolean;
    /** Log function call details (default: false) */
    logFunctionCalls?: boolean;
  };
}

/**
 * WebRTC Bridge Server that extends OpenAI's Realtime API with MCP integration
 * 
 * This server provides:
 * 1. Ephemeral API key generation for WebRTC connections
 * 2. MCP server bridge for tool calls
 * 3. Simple integration with existing Realtime API applications
 * 
 * Usage:
 * ```typescript
 * const bridge = new WebRTCBridgeServer({
 *   openai: {
 *     apiKey: process.env.OPENAI_API_KEY!,
 *     model: 'gpt-4o-realtime-preview-2024-12-17'
 *   },
 *   mcp: {
 *     command: 'npx',
 *     args: ['-y', '@hubspot/mcp-server'],
 *     env: { PRIVATE_APP_ACCESS_TOKEN: process.env.HUBSPOT_TOKEN }
 *   }
 * });
 * 
 * await bridge.start();
 * ```
 */
export class WebRTCBridgeServer {
  private readonly config: WebRTCBridgeConfig;
  private app: express.Application;
  private server: Server | null = null;
  private mcpProcess: ChildProcess | null = null;
  private mcpClient: MCPClientInterface | null = null;
  private isRunning = false;
  
  // Bidirectional mapping between OpenAI function names and MCP tool names
  private functionNameToMCPTool = new Map<string, string>();
  private mcpToolToFunctionName = new Map<string, string>();

  constructor(config: WebRTCBridgeConfig) {
    this.config = {
      ...config,
      server: {
        port: 8084,
        host: 'localhost',
        cors: true,
        ...config.server,
      },
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Start the WebRTC bridge server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    try {
      // Start MCP server if command is provided
      if ('command' in this.config.mcp) {
        await this.startMCPServer();
      } else if ('url' in this.config.mcp) {
        // Connect to existing MCP server
        await this.connectToMCPServer();
      } else {
        throw new Error('Either mcp.command or mcp.url must be provided');
      }

      // Start HTTP server
      await this.startHTTPServer();
      
      this.isRunning = true;
      console.log(`🚀 WebRTC Bridge Server running on http://${this.config.server!.host}:${this.config.server!.port}`);
      console.log('📡 Endpoints:');
      console.log(`   GET  /session - Get ephemeral API key for WebRTC`);
      console.log(`   POST /mcp     - MCP proxy for tool calls`);
      console.log(`   GET  /health  - Health check`);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop the WebRTC bridge server
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    const stopPromises: Promise<void>[] = [];

    // Stop HTTP server
    if (this.server) {
      stopPromises.push(new Promise(resolve => {
        this.server!.close(() => resolve());
      }));
    }

    // Stop MCP client
    if (this.mcpClient) {
      stopPromises.push(this.mcpClient.disconnect());
    }

    // Stop MCP process
    if (this.mcpProcess && !this.mcpProcess.killed) {
      this.mcpProcess.kill('SIGTERM');
      stopPromises.push(new Promise(resolve => {
        this.mcpProcess!.on('exit', () => resolve());
      }));
    }

    await Promise.all(stopPromises);
    
    // Clear function name mappings for clean state
    this.functionNameToMCPTool.clear();
    this.mcpToolToFunctionName.clear();
    
    console.log('🛑 WebRTC Bridge Server stopped');
  }

  /**
   * Check if the server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the server URL
   */
  getServerURL(): string {
    return `http://${this.config.server!.host}:${this.config.server!.port}`;
  }

  private setupMiddleware(): void {
    // CORS middleware
    if (this.config.server!.cors) {
      this.app.use(cors({
        origin: true,
        credentials: true,
      }));
    }

    // JSON body parser
    this.app.use(express.json());
    
    // Request logging
    this.app.use((req, _res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        mcp: {
          connected: this.mcpClient?.isConnected() ?? false,
          processRunning: this.mcpProcess ? !this.mcpProcess.killed : false,
        },
      });
    });

    // Ephemeral API key endpoint for WebRTC
    this.app.get('/session', async (_req, res) => {
      try {
        // Get MCP tools and format them for OpenAI
        let tools: any[] = [];
        let instructions = this.config.openai.instructions || 'You are a helpful assistant with access to external tools.';
        
        if (this.mcpClient && this.mcpClient.isConnected()) {
          try {
            const mcpTools = await this.mcpClient.discoverTools();
            
            // Convert MCP tools to OpenAI Realtime API format with strict validation
            tools = mcpTools.map(tool => {
              const parameters = this.convertMCPSchemaToOpenAI(tool.inputSchema);
              
              // Ensure function name follows OpenAI conventions
              const functionName = this.sanitizeFunctionName(tool.name);
              
                          return {
              type: 'function',
              name: functionName,
              description: tool.description || `Execute ${tool.name} tool`,
              parameters
              // Note: Realtime API doesn't support strict mode like Chat Completions API
            };
            });

            if (this.config.debug?.enabled || this.config.debug?.logTools) {
              console.log(`📡 Including ${tools.length} MCP tools in session`);
              tools.forEach(tool => {
                console.log(`   - ${tool.name}: ${tool.description?.substring(0, 80)}...`);
                if (this.config.debug?.enabled) {
                  console.log(`     Schema:`, JSON.stringify(tool.parameters, null, 2));
                }
              });
            } else {
              console.log(`📡 Including ${tools.length} MCP tools in session`);
            }
          } catch (error) {
            console.warn('Failed to get MCP tools for session:', error);
          }
        }

        const sessionConfig: any = {
          model: this.config.openai.model,
          voice: this.config.openai.voice || 'alloy',
          modalities: ['text', 'audio'],
          instructions,
        };

        // Only include tools if we have any
        if (tools.length > 0) {
          sessionConfig.tools = tools;
        }

        if (this.config.debug?.enabled) {
          console.log(`🔧 Sending session config to OpenAI:`, JSON.stringify(sessionConfig, null, 2));
        }

        const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.openai.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sessionConfig),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ OpenAI API error ${response.status}:`, errorText);
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        const sessionData = await response.json();
        res.json(sessionData);
      } catch (error) {
        console.error('Failed to create ephemeral session:', error);
        res.status(500).json({
          error: 'Failed to create session',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // MCP proxy endpoint
    this.app.post('/mcp', async (req, res) => {
      try {
        if (!this.mcpClient || !this.mcpClient.isConnected()) {
          throw new Error('MCP client not connected');
        }

        const { method, params, id } = req.body;

        let result;
        switch (method) {
          case 'tools/list':
            result = await this.mcpClient.discoverTools();
            res.json({
              jsonrpc: '2.0',
              result: { tools: result },
              id,
            });
            break;

          case 'tools/call':
            const { name, arguments: args } = params;
            // Map OpenAI function name back to original MCP tool name
            const originalToolName = this.getOriginalMCPToolName(name);
            
            if (this.config.debug?.enabled || this.config.debug?.logFunctionCalls) {
              console.log(`🔄 Function call mapping: "${name}" → "${originalToolName}"`);
            }
            
            result = await this.mcpClient.callTool(originalToolName, args);
            res.json({
              jsonrpc: '2.0',
              result,
              id,
            });
            break;

          default:
            throw new Error(`Unsupported method: ${method}`);
        }
      } catch (error) {
        console.error('MCP proxy error:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error',
          },
          id: req.body.id,
        });
      }
    });

    // Tools endpoint for OpenAI Realtime API format
    this.app.get('/tools', async (_req, res) => {
      try {
        if (!this.mcpClient || !this.mcpClient.isConnected()) {
          res.json({ tools: [] });
          return;
        }

        const mcpTools = await this.mcpClient.discoverTools();
        
        // Convert MCP tools to OpenAI Realtime API format with proper schema validation
        const realtimeTools = mcpTools.map(tool => {
          const parameters = this.convertMCPSchemaToOpenAI(tool.inputSchema);
          const functionName = this.sanitizeFunctionName(tool.name);
          
          return {
            type: 'function',
            name: functionName,
            description: tool.description || `Execute ${tool.name} tool`,
            parameters
            // Note: Realtime API doesn't support strict mode like Chat Completions API
          };
        });

        res.json({ 
          tools: realtimeTools,
          instructions: this.config.openai.instructions || 'You are a helpful assistant with access to external tools.'
        });
      } catch (error) {
        console.error('Failed to get tools:', error);
        res.status(500).json({
          error: 'Failed to get tools',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Serve static files from the examples directory for development
    if (process.env.NODE_ENV === 'development') {
      this.app.use('/demo', express.static('examples/hubspot-test'));
    }

    // Serve the generic demo
    this.app.get('/demo', (_req, res) => {
      res.send(this.getGenericDemoHTML());
    });

    // Serve the generic demo HTML directly
    this.app.get('/generic-demo.html', (_req, res) => {
      res.send(this.getGenericDemoHTML());
    });
  }

  private async startMCPServer(): Promise<void> {
    if (!('command' in this.config.mcp)) {
      throw new Error('MCP command not provided');
    }

    const mcpConfig = this.config.mcp;
    console.log(`🔧 Starting MCP server: ${mcpConfig.command} ${mcpConfig.args?.join(' ') || ''}`);

    this.mcpProcess = spawn(mcpConfig.command, mcpConfig.args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...mcpConfig.env },
    });

    // Handle MCP process events
    this.mcpProcess.on('error', (error) => {
      console.error('MCP process error:', error);
    });

    this.mcpProcess.on('exit', (code, signal) => {
      console.log(`MCP process exited with code ${code}, signal ${signal}`);
    });

    // Create a stdio-based MCP client
    this.mcpClient = new StdioMCPClient(this.mcpProcess, mcpConfig.timeout || 10000);
    
    // Wait for connection and tool discovery
    const tools = await this.mcpClient.discoverTools();
    console.log(`✅ Connected to MCP server - found ${tools.length} tools`);
    
    if (this.config.debug?.enabled || this.config.debug?.logTools) {
      console.log('🔍 Discovered MCP tools:');
      tools.forEach((tool, index) => {
        console.log(`   ${index + 1}. ${tool.name}: ${tool.description || 'No description'}`);
      });
    }
  }

  private async connectToMCPServer(): Promise<void> {
    if (!('url' in this.config.mcp)) {
      throw new Error('MCP URL not provided');
    }

    const mcpConfig = this.config.mcp;
    console.log(`🔗 Connecting to MCP server: ${mcpConfig.url}`);
    
    this.mcpClient = new MCPClient(mcpConfig.url, mcpConfig.auth, mcpConfig.timeout);
    
    const tools = await this.mcpClient.discoverTools();
    console.log(`✅ Connected to MCP server - found ${tools.length} tools`);
  }

  private async startHTTPServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = this.config.server!.port!;
      const host = this.config.server!.host!;
      
      this.server = this.app.listen(port, host, () => {
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  private getGenericDemoHTML(): string {
    const serverUrl = this.getServerURL();
    const modelName = this.config.openai.model;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎤 Generic WebRTC + MCP Demo</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 1fr 400px;
            gap: 20px;
            height: calc(100vh - 40px);
        }

        .main-panel {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .side-panel {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        h1 {
            text-align: center;
            margin-bottom: 20px;
            font-size: 2.2em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .status {
            padding: 15px;
            border-radius: 10px;
            margin: 15px 0;
            font-weight: 600;
            text-align: center;
            transition: all 0.3s ease;
        }
        .status.connecting { background: rgba(255, 193, 7, 0.3); border: 2px solid #ffc107; }
        .status.connected { background: rgba(40, 167, 69, 0.3); border: 2px solid #28a745; }
        .status.error { background: rgba(220, 53, 69, 0.3); border: 2px solid #dc3545; }

        .controls {
            display: flex;
            gap: 15px;
            margin: 20px 0;
            flex-wrap: wrap;
            justify-content: center;
        }

        button {
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.3s ease;
            backdrop-filter: blur(5px);
        }
        button:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.3);
            border-color: rgba(255, 255, 255, 0.5);
            transform: translateY(-2px);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .voice-controls {
            text-align: center;
            margin: 20px 0;
        }

        .connection-indicator {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.2);
            border: 3px solid rgba(255, 255, 255, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 15px;
            font-size: 1.8em;
            transition: all 0.3s ease;
        }
        .connection-indicator.connected {
            background: rgba(40, 167, 69, 0.5);
            border-color: #28a745;
            animation: pulse 2s infinite;
        }
        .connection-indicator.talking {
            background: rgba(220, 53, 69, 0.5);
            border-color: #dc3545;
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }

        .audio-level {
            margin: 15px 0;
        }
        .audio-bar {
            width: 200px;
            height: 15px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 10px;
            overflow: hidden;
            margin: 10px auto;
        }
        .audio-fill {
            height: 100%;
            background: linear-gradient(90deg, #28a745, #ffc107, #dc3545);
            width: 0%;
            transition: width 0.1s ease;
        }

        .transcript-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .transcript {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 10px;
            padding: 20px;
            flex: 1;
            overflow-y: auto;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 14px;
            line-height: 1.5;
        }

        .transcript-entry {
            margin: 10px 0;
            padding: 10px;
            border-radius: 8px;
            border-left: 4px solid;
        }
        .transcript-entry.user {
            background: rgba(59, 130, 246, 0.2);
            border-left-color: #3b82f6;
        }
        .transcript-entry.assistant {
            background: rgba(34, 197, 94, 0.2);
            border-left-color: #22c55e;
        }
        .transcript-entry.system {
            background: rgba(168, 85, 247, 0.2);
            border-left-color: #a855f7;
        }
        .transcript-entry.error {
            background: rgba(239, 68, 68, 0.2);
            border-left-color: #ef4444;
        }

        .transcript-header {
            font-weight: bold;
            margin-bottom: 5px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .transcript-content {
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .tools-section {
            margin-bottom: 20px;
        }

        .tools-list {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 10px;
            padding: 15px;
            max-height: 300px;
            overflow-y: auto;
        }

        .tool-item {
            background: rgba(255, 255, 255, 0.1);
            margin: 8px 0;
            padding: 10px;
            border-radius: 6px;
            font-size: 12px;
        }

        .tool-name {
            font-weight: bold;
            color: #ffc107;
            margin-bottom: 4px;
        }

        .tool-description {
            color: rgba(255, 255, 255, 0.8);
            font-size: 11px;
        }

        .config-section {
            margin-bottom: 20px;
        }

        .config-input {
            width: 100%;
            padding: 8px;
            margin: 5px 0;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 5px;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            font-size: 14px;
        }
        .config-input::placeholder {
            color: rgba(255, 255, 255, 0.6);
        }

        .stats {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 10px;
            padding: 15px;
            margin-top: 20px;
            font-size: 12px;
        }

        .stat-item {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
        }

        .current-transcript {
            background: rgba(255, 193, 7, 0.2);
            border: 1px solid #ffc107;
            border-radius: 8px;
            padding: 10px;
            margin: 10px 0;
            font-style: italic;
            min-height: 40px;
        }

        @media (max-width: 1200px) {
            .container {
                grid-template-columns: 1fr;
                grid-template-rows: auto 1fr;
            }
            .side-panel {
                order: -1;
                height: auto;
                max-height: 300px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="main-panel">
            <h1>🎤 Generic WebRTC + MCP Demo</h1>
            
            <div id="connectionStatus" class="status connecting">
                🔄 Ready to connect...
            </div>

            <div class="controls">
                <button id="connectBtn" onclick="connect()">🔗 Connect</button>
                <button id="disconnectBtn" onclick="disconnect()" disabled>⏹️ Disconnect</button>
                <button id="loadToolsBtn" onclick="loadTools()" disabled>🔧 Load Tools</button>
                <button id="clearBtn" onclick="clearTranscript()">🗑️ Clear</button>
            </div>

            <div class="voice-controls">
                <div id="connectionIndicator" class="connection-indicator">🎤</div>
                <div id="voiceStatus">Configure server URL and click Connect</div>
                
                <div class="audio-level">
                    <div>Audio Level:</div>
                    <div class="audio-bar">
                        <div id="audioFill" class="audio-fill"></div>
                    </div>
                    <div id="audioLevel">0%</div>
                </div>
            </div>

            <div class="current-transcript">
                <strong>Current Speech:</strong>
                <div id="currentTranscript">Start speaking...</div>
            </div>

            <div class="transcript-container">
                <h3>Conversation Transcript</h3>
                <div class="transcript" id="transcript">
                    <div class="transcript-entry system">
                        <div class="transcript-header">
                            <span>System</span>
                            <span id="startTime"></span>
                        </div>
                        <div class="transcript-content">🚀 Generic WebRTC + MCP Demo ready!</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="side-panel">
            <div class="config-section">
                <h3>🔧 Configuration</h3>
                <input type="text" id="serverUrl" class="config-input" 
                       placeholder="Bridge Server URL (e.g., http://localhost:8084)" 
                       value="${serverUrl}">
                <input type="text" id="modelName" class="config-input" 
                       placeholder="Model (e.g., gpt-4o-realtime-preview-2024-12-17)" 
                       value="${modelName}">
            </div>

            <div class="tools-section">
                <h3>🛠️ Available Tools (<span id="toolCount">0</span>)</h3>
                <div class="tools-list" id="toolsList">
                    <div style="text-align: center; color: rgba(255,255,255,0.6);">
                        Click "Load Tools" to discover available MCP tools
                    </div>
                </div>
            </div>

            <div class="stats">
                <h4>📊 Session Stats</h4>
                <div class="stat-item">
                    <span>Connection:</span>
                    <span id="connectionTime">Not connected</span>
                </div>
                <div class="stat-item">
                    <span>Messages:</span>
                    <span id="messageCount">0</span>
                </div>
                <div class="stat-item">
                    <span>Function Calls:</span>
                    <span id="functionCallCount">0</span>
                </div>
                <div class="stat-item">
                    <span>Audio Level:</span>
                    <span id="audioLevelText">0%</span>
                </div>
            </div>
        </div>
    </div>

    <audio id="audioElement" autoplay style="display: none;"></audio>

    <script>
        // Polyfill for Node.js globals in browser environment
        if (typeof process === 'undefined') {
            window.process = { env: {} };
        }
        
        let pc = null;
        let dataChannel = null;
        let audioStream = null;
        let audioContext = null;
        let analyser = null;
        let serverUrl = '${serverUrl}';
        let connectionStartTime = null;
        let messageCount = 0;
        let functionCallCount = 0;
        let currentTranscriptText = '';

        // Initialize
        document.getElementById('startTime').textContent = new Date().toLocaleTimeString();

        // Automatically load tools when page loads
        window.addEventListener('load', () => {
            loadTools();
        });

        function addTranscriptEntry(type, content, metadata = {}) {
            const transcript = document.getElementById('transcript');
            const entry = document.createElement('div');
            entry.className = \`transcript-entry \${type}\`;
            
            const header = document.createElement('div');
            header.className = 'transcript-header';
            header.innerHTML = \`
                <span>\${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                <span>\${new Date().toLocaleTimeString()}</span>
            \`;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'transcript-content';
            contentDiv.textContent = content;
            
            entry.appendChild(header);
            entry.appendChild(contentDiv);
            transcript.appendChild(entry);
            transcript.scrollTop = transcript.scrollHeight;
            
            messageCount++;
            document.getElementById('messageCount').textContent = messageCount;
        }

        function updateStatus(message, type) {
            const status = document.getElementById('connectionStatus');
            status.textContent = message;
            status.className = \`status \${type}\`;
        }

        function updateVoiceStatus(message) {
            document.getElementById('voiceStatus').textContent = message;
        }

        function updateConnectionIndicator(state) {
            const indicator = document.getElementById('connectionIndicator');
            indicator.className = \`connection-indicator \${state}\`;
        }

        function updateCurrentTranscript(text) {
            document.getElementById('currentTranscript').textContent = text || 'Start speaking...';
            currentTranscriptText = text || '';
        }

        async function connect() {
            try {
                serverUrl = document.getElementById('serverUrl').value || '${serverUrl}';
                const model = document.getElementById('modelName').value || '${modelName}';
                
                updateStatus('🔑 Getting ephemeral API key...', 'connecting');
                addTranscriptEntry('system', \`Connecting to \${serverUrl}...\`);

                // Get ephemeral API key
                const tokenResponse = await fetch(\`\${serverUrl}/session\`);
                if (!tokenResponse.ok) {
                    throw new Error(\`Failed to get ephemeral key: \${tokenResponse.status}\`);
                }
                const sessionData = await tokenResponse.json();
                const ephemeralKey = sessionData.client_secret.value;
                addTranscriptEntry('system', '✅ Got ephemeral API key');

                updateStatus('🔄 Creating WebRTC connection...', 'connecting');

                // Create WebRTC peer connection
                pc = new RTCPeerConnection();

                // Set up audio playback
                const audioEl = document.getElementById('audioElement');
                pc.ontrack = e => {
                    addTranscriptEntry('system', '📻 Received audio track from AI');
                    audioEl.srcObject = e.streams[0];
                };

                // Add microphone
                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                pc.addTrack(audioStream.getTracks()[0]);
                addTranscriptEntry('system', '🎤 Added microphone audio track');

                // Set up audio level monitoring
                setupAudioLevelMonitoring(audioStream);

                // Set up data channel
                dataChannel = pc.createDataChannel("oai-events");
                dataChannel.addEventListener("message", handleRealtimeEvent);
                dataChannel.addEventListener("open", () => {
                    addTranscriptEntry('system', '📡 Data channel opened');
                    updateConnectionIndicator('connected');
                    updateVoiceStatus('🎉 Connected! Start talking...');
                    connectionStartTime = new Date();
                    updateConnectionTime();
                    
                    // Configure tools after connection is established
                    configureToolsForSession();
                });

                // Create offer and connect
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                addTranscriptEntry('system', '📤 Created WebRTC offer');

                updateStatus('🌐 Connecting to OpenAI Realtime API...', 'connecting');
                const sdpResponse = await fetch(\`https://api.openai.com/v1/realtime?model=\${model}\`, {
                    method: "POST",
                    body: offer.sdp,
                    headers: {
                        Authorization: \`Bearer \${ephemeralKey}\`,
                        "Content-Type": "application/sdp"
                    },
                });

                if (!sdpResponse.ok) {
                    throw new Error(\`WebRTC connection failed: \${sdpResponse.status}\`);
                }

                const answerSdp = await sdpResponse.text();
                await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

                addTranscriptEntry('system', '✅ WebRTC connection established');
                updateStatus('✅ Connected! Voice conversation active', 'connected');

                // Update UI
                document.getElementById('connectBtn').disabled = true;
                document.getElementById('disconnectBtn').disabled = false;
                document.getElementById('loadToolsBtn').disabled = false;

            } catch (error) {
                addTranscriptEntry('error', \`Connection failed: \${error.message}\`);
                updateStatus('❌ Connection failed', 'error');
                console.error('Connection error:', error);
            }
        }

        function setupAudioLevelMonitoring(stream) {
            audioContext = new AudioContext();
            analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            function updateAudioLevel() {
                if (!analyser) return;
                
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / bufferLength;
                const percentage = Math.round((average / 255) * 100);
                
                document.getElementById('audioFill').style.width = \`\${percentage}%\`;
                document.getElementById('audioLevel').textContent = \`\${percentage}%\`;
                document.getElementById('audioLevelText').textContent = \`\${percentage}%\`;
                
                requestAnimationFrame(updateAudioLevel);
            }
            updateAudioLevel();
        }

        function handleRealtimeEvent(event) {
            try {
                const data = JSON.parse(event.data);
                
                switch (data.type) {
                    case 'session.created':
                        addTranscriptEntry('system', '🎉 AI session created');
                        break;
                        
                    case 'session.updated':
                        addTranscriptEntry('system', '🔄 AI session updated');
                        break;
                        
                    case 'input_audio_buffer.speech_started':
                        addTranscriptEntry('system', '🎤 Speech detected');
                        updateConnectionIndicator('talking');
                        updateVoiceStatus('🎤 Listening...');
                        updateCurrentTranscript('');
                        break;
                        
                    case 'input_audio_buffer.speech_stopped':
                        addTranscriptEntry('system', '🛑 Speech ended');
                        updateConnectionIndicator('connected');
                        updateVoiceStatus('🤔 Processing...');
                        if (currentTranscriptText) {
                            addTranscriptEntry('user', currentTranscriptText);
                            updateCurrentTranscript('');
                        }
                        break;
                        
                    case 'conversation.item.input_audio_transcription.delta':
                        if (data.delta) {
                            updateCurrentTranscript(currentTranscriptText + data.delta);
                        }
                        break;
                        
                    case 'conversation.item.input_audio_transcription.completed':
                        if (data.transcript) {
                            updateCurrentTranscript(data.transcript);
                        }
                        break;
                        
                    case 'response.created':
                        addTranscriptEntry('system', '🚀 AI response started');
                        break;
                        
                    case 'response.text.delta':
                        if (data.delta) {
                            addTranscriptEntry('assistant', data.delta);
                        }
                        break;
                        
                    case 'response.function_call_arguments.delta':
                        addTranscriptEntry('system', \`🛠️ Function call args: \${data.delta}\`);
                        break;
                        
                    case 'response.function_call_arguments.done':
                        functionCallCount++;
                        document.getElementById('functionCallCount').textContent = functionCallCount;
                        addTranscriptEntry('system', \`🛠️ Function call: \${data.name}(\${data.arguments})\`);
                        handleFunctionCall(data);
                        break;
                        
                    case 'response.done':
                        updateVoiceStatus('🎉 Ready for next question...');
                        addTranscriptEntry('system', '✅ Response completed');
                        break;
                        
                    case 'error':
                        addTranscriptEntry('error', \`AI Error: \${data.error?.message || 'Unknown error'}\`);
                        break;
                        
                    default:
                        if (data.type.includes('function') || data.type.includes('tool')) {
                            addTranscriptEntry('system', \`🛠️ \${data.type}\`);
                        }
                }
            } catch (error) {
                console.error('Error parsing realtime event:', error);
                addTranscriptEntry('error', \`Parse error: \${error.message}\`);
            }
        }

        async function handleFunctionCall(functionCallData) {
            const functionName = functionCallData.name;
            const argumentsStr = functionCallData.arguments;
            
            try {
                const functionArgs = JSON.parse(argumentsStr);
                const mcpToolName = functionName;
                
                addTranscriptEntry('system', \`📡 Calling MCP tool: \${mcpToolName}\`);
                
                const mcpRequest = {
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                        name: mcpToolName,
                        arguments: functionArgs
                    },
                    id: \`func-\${Date.now()}\`
                };
                
                const response = await fetch(\`\${serverUrl}/mcp\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mcpRequest)
                });

                if (!response.ok) {
                    throw new Error(\`MCP API error: \${response.status}\`);
                }

                const result = await response.json();
                
                if (result.error) {
                    throw new Error(result.error.message || 'MCP function call failed');
                }

                addTranscriptEntry('system', \`✅ MCP response received for \${functionName}\`);

                // Send result back to AI
                const functionResult = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: functionCallData.call_id,
                        output: JSON.stringify(result.result || result)
                    }
                };

                dataChannel.send(JSON.stringify(functionResult));
                
                setTimeout(() => {
                    dataChannel.send(JSON.stringify({ type: 'response.create' }));
                }, 100);

            } catch (error) {
                console.error('Function call error:', error);
                addTranscriptEntry('error', \`Function call failed: \${error.message}\`);

                const errorResult = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id: functionCallData.call_id,
                        output: JSON.stringify({
                            error: error.message,
                            success: false
                        })
                    }
                };

                dataChannel.send(JSON.stringify(errorResult));
            }
        }

        async function loadTools() {
            try {
                const isInitialLoad = document.getElementById('toolCount').textContent === '0';
                if (isInitialLoad) {
                    addTranscriptEntry('system', '🔧 Loading available tools...');
                }
                
                const response = await fetch(\`\${serverUrl}/mcp\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'tools/list',
                        params: {},
                        id: 'tools-' + Date.now()
                    })
                });

                if (!response.ok) {
                    throw new Error(\`Failed to load tools: \${response.status}\`);
                }

                const result = await response.json();
                const tools = result.result?.tools || [];
                
                document.getElementById('toolCount').textContent = tools.length;
                
                const toolsList = document.getElementById('toolsList');
                if (tools.length === 0) {
                    toolsList.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.6);">No tools available</div>';
                } else {
                    toolsList.innerHTML = tools.map(tool => \`
                        <div class="tool-item">
                            <div class="tool-name">\${tool.name}</div>
                            <div class="tool-description">\${tool.description || 'No description'}</div>
                        </div>
                    \`).join('');
                }
                
                if (isInitialLoad) {
                    addTranscriptEntry('system', \`✅ Loaded \${tools.length} tools (will be auto-configured for AI)\`);
                }
                
            } catch (error) {
                addTranscriptEntry('error', \`Failed to load tools: \${error.message}\`);
            }
        }

        function disconnect() {
            addTranscriptEntry('system', '🔌 Disconnecting...');

            if (dataChannel) {
                dataChannel.close();
                dataChannel = null;
            }

            if (pc) {
                pc.close();
                pc = null;
            }

            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
                audioStream = null;
            }

            if (audioContext) {
                audioContext.close();
                audioContext = null;
                analyser = null;
            }

            updateStatus('🔌 Disconnected', 'connecting');
            updateVoiceStatus('Configure server URL and click Connect');
            updateConnectionIndicator('');
            updateCurrentTranscript('');
            
            document.getElementById('connectBtn').disabled = false;
            document.getElementById('disconnectBtn').disabled = true;
            document.getElementById('loadToolsBtn').disabled = true;
            
            connectionStartTime = null;
            document.getElementById('connectionTime').textContent = 'Not connected';

            addTranscriptEntry('system', '✅ Disconnected successfully');
        }

        function clearTranscript() {
            document.getElementById('transcript').innerHTML = \`
                <div class="transcript-entry system">
                    <div class="transcript-header">
                        <span>System</span>
                        <span>\${new Date().toLocaleTimeString()}</span>
                    </div>
                    <div class="transcript-content">🗑️ Transcript cleared</div>
                </div>
            \`;
            messageCount = 0;
            functionCallCount = 0;
            document.getElementById('messageCount').textContent = '0';
            document.getElementById('functionCallCount').textContent = '0';
        }

        function updateConnectionTime() {
            if (connectionStartTime) {
                const elapsed = Math.floor((new Date() - connectionStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                document.getElementById('connectionTime').textContent = 
                    \`\${minutes}:\${seconds.toString().padStart(2, '0')}\`;
            }
            setTimeout(updateConnectionTime, 1000);
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', disconnect);

        async function configureToolsForSession() {
            try {
                addTranscriptEntry('system', '🛠️ Configuring MCP tools for AI session...');
                
                const response = await fetch(\`\${serverUrl}/tools\`);
                if (!response.ok) {
                    throw new Error(\`Failed to get tools: \${response.status}\`);
                }
                
                const toolsData = await response.json();
                const tools = toolsData.tools || [];
                
                if (tools.length > 0) {
                    // Update session with tools
                    const sessionUpdate = {
                        type: 'session.update',
                        session: {
                            modalities: ['text', 'audio'],
                            instructions: toolsData.instructions || 'You are a helpful assistant with access to external tools.',
                            voice: '${modelName}'.includes('alloy') ? 'alloy' : 'alloy',
                            tools: tools,
                            tool_choice: 'auto',
                            turn_detection: {
                                type: 'server_vad',
                                threshold: 0.5,
                                prefix_padding_ms: 300,
                                silence_duration_ms: 500,
                                create_response: true,
                                interrupt_response: true,
                            },
                        }
                    };
                    
                    dataChannel.send(JSON.stringify(sessionUpdate));
                    addTranscriptEntry('system', \`✅ Configured \${tools.length} MCP tools for AI\`);
                } else {
                    addTranscriptEntry('system', '⚠️ No MCP tools available');
                }
            } catch (error) {
                console.error('Failed to configure tools:', error);
                addTranscriptEntry('error', \`Failed to configure tools: \${error.message}\`);
            }
        }

        
    </script>
</body>
</html>`;
  }

  private sanitizeFunctionName(originalName: string): string {
    // Check if we already have a mapping for this tool
    if (this.mcpToolToFunctionName.has(originalName)) {
      return this.mcpToolToFunctionName.get(originalName)!;
    }

    // Convert MCP tool names to valid OpenAI function names (camelCase)
    // OpenAI Realtime API prefers camelCase over underscores
    let sanitized = originalName
      // Replace non-alphanumeric characters with spaces for proper camelCase conversion
      .replace(/[^a-zA-Z0-9]/g, ' ')
      // Split into words and convert to camelCase
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map((word, index) => {
        if (index === 0) {
          // First word: lowercase
          return word.toLowerCase();
        } else {
          // Subsequent words: capitalize first letter
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
      })
      .join('');

    // Ensure starts with letter (if it doesn't, prepend 'fn')
    if (!/^[a-zA-Z]/.test(sanitized)) {
      sanitized = 'fn' + sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
    }

    // Limit to 64 characters
    if (sanitized.length > 64) {
      sanitized = sanitized.substring(0, 64);
    }

    // Handle edge case where name might be empty or too short
    if (sanitized.length === 0) {
      sanitized = 'unknownTool';
    }

    // Ensure uniqueness by adding suffix if needed
    let finalName = sanitized;
    let counter = 1;
    while (this.functionNameToMCPTool.has(finalName)) {
      const suffix = counter.toString();
      const maxBaseLength = 64 - suffix.length;
      finalName = sanitized.substring(0, maxBaseLength) + suffix;
      counter++;
    }

    // Store bidirectional mapping
    this.functionNameToMCPTool.set(finalName, originalName);
    this.mcpToolToFunctionName.set(originalName, finalName);

    return finalName;
  }

  private getOriginalMCPToolName(functionName: string): string {
    return this.functionNameToMCPTool.get(functionName) || functionName;
  }

  private convertMCPSchemaToOpenAI(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      };
    }

    const converted: any = {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false  // Required for strict mode
    };

    // Convert properties if they exist
    if (schema.properties && typeof schema.properties === 'object') {
      const propertyNames = Object.keys(schema.properties);
      
      // Convert each property
      for (const [key, value] of Object.entries(schema.properties)) {
        converted.properties[key] = this.convertProperty(value as any);
      }
      
      // For strict mode, ALL properties must be in required array
      // Use existing required array or default to all properties
      if (schema.required && Array.isArray(schema.required)) {
        converted.required = schema.required.filter((req: string) => propertyNames.includes(req));
      } else {
        // If no required specified, make all properties required for strict mode
        converted.required = propertyNames;
      }
    }

    return converted;
  }

  private convertProperty(property: any): any {
    if (!property || typeof property !== 'object') {
      return { type: 'string' };
    }

    const converted: any = { ...property };

    // Ensure we have a valid type
    if (!converted.type) {
      converted.type = 'string';
    }

    // Handle arrays - ensure they have proper items schema
    if (converted.type === 'array') {
      if (!converted.items) {
        converted.items = { type: 'string' };
      } else {
        converted.items = this.convertProperty(converted.items);
      }
    }

    // Handle objects - recursively convert properties and ensure strict mode compliance
    if (converted.type === 'object') {
      if (converted.properties) {
        converted.properties = this.convertProperties(converted.properties);
        
        // Ensure additionalProperties is false for strict mode
        converted.additionalProperties = false;
        
        // Ensure all properties are required for strict mode
        if (!converted.required) {
          converted.required = Object.keys(converted.properties);
        }
      } else {
        // Object with no properties defined
        converted.properties = {};
        converted.required = [];
        converted.additionalProperties = false;
      }
    }

    // Handle enums - ensure they are properly formatted
    if (converted.enum && Array.isArray(converted.enum)) {
      // Keep enum as-is, it's valid in OpenAI schema
    }

    // Remove any unsupported fields that might cause issues
    delete converted.examples;
    delete converted.default;

    return converted;
  }

  private convertProperties(properties: any): any {
    const converted: any = {};

    for (const [key, value] of Object.entries(properties)) {
      converted[key] = this.convertProperty(value);
    }

    return converted;
  }
} 