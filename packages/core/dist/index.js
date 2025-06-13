import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { z } from 'zod';
import WebSocket from 'ws';

// src/mcp/client.ts
var MCPClient = class {
  baseUrl;
  auth;
  timeout;
  requestId = 0;
  constructor(baseUrl, auth, timeout = 1e4) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.auth = auth;
    this.timeout = timeout;
  }
  /**
   * Discover available tools from the MCP server
   * @returns Array of available MCP tools
   */
  async discoverTools() {
    const request = {
      jsonrpc: "2.0",
      id: this.generateRequestId(),
      method: "tools/list"
    };
    const response = await this.sendRequest(request);
    if (response.error) {
      throw new Error(`MCP tools/list failed: ${response.error.message}`);
    }
    if (!response.result) {
      throw new Error("MCP tools/list returned no result");
    }
    return response.result.tools;
  }
  /**
   * Call a specific tool with the provided arguments
   * @param name - Tool name to call
   * @param args - Arguments to pass to the tool
   * @returns Tool execution result
   */
  async callTool(name, args) {
    const request = {
      jsonrpc: "2.0",
      id: this.generateRequestId(),
      method: "tools/call",
      params: {
        name,
        arguments: args
      }
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
  /**
   * Check if the client is connected (basic connectivity test)
   * @returns true if connected, false otherwise
   */
  isConnected() {
    try {
      new URL(this.baseUrl);
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Disconnect from the MCP server
   * For HTTP-based connections, this is a no-op
   */
  async disconnect() {
    return Promise.resolve();
  }
  /**
   * Send a JSON-RPC request to the MCP server
   * @param request - The JSON-RPC request to send
   * @returns The JSON-RPC response
   */
  async sendRequest(request) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(request),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const jsonResponse = await response.json();
      if (jsonResponse.jsonrpc !== "2.0") {
        throw new Error("Invalid JSON-RPC response: missing or incorrect jsonrpc field");
      }
      if (jsonResponse.id !== request.id) {
        throw new Error("Invalid JSON-RPC response: mismatched request ID");
      }
      return jsonResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`MCP request timeout after ${this.timeout}ms`);
        }
        throw error;
      }
      throw new Error("Unknown error during MCP request");
    }
  }
  /**
   * Generate HTTP headers for the request
   * @returns Headers object with authentication and content type
   */
  getHeaders() {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    if (this.auth) {
      const headerName = this.auth.header || "Authorization";
      const headerValue = this.auth.type === "bearer" ? `Bearer ${this.auth.token}` : this.auth.token;
      headers[headerName] = headerValue;
    }
    return headers;
  }
  /**
   * Generate a unique request ID for JSON-RPC
   * @returns Unique request identifier
   */
  generateRequestId() {
    return `req_${Date.now()}_${++this.requestId}`;
  }
};

// src/webrtc/bridge-server.ts
var StdioMCPClient = class {
  process;
  timeout;
  requestId = 0;
  pendingRequests = /* @__PURE__ */ new Map();
  buffer = "";
  initialized = false;
  constructor(process2, timeout = 1e4) {
    this.process = process2;
    this.timeout = timeout;
    this.setupStdioHandling();
  }
  async discoverTools() {
    if (!this.initialized) {
      await this.initializeMCP();
    }
    const request = {
      jsonrpc: "2.0",
      id: this.generateRequestId(),
      method: "tools/list"
    };
    const response = await this.sendRequest(request);
    if (response.error) {
      throw new Error(`MCP tools/list failed: ${response.error.message}`);
    }
    return response.result?.tools || [];
  }
  async initializeMCP() {
    const initRequest = {
      jsonrpc: "2.0",
      id: this.generateRequestId(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: "webrtc-bridge",
          version: "1.0.0"
        }
      }
    };
    const initResponse = await this.sendRequest(initRequest);
    if (initResponse.error) {
      throw new Error(`MCP initialization failed: ${initResponse.error.message}`);
    }
    const initializedNotification = {
      jsonrpc: "2.0",
      method: "notifications/initialized"
    };
    if (this.process.stdin) {
      this.process.stdin.write(JSON.stringify(initializedNotification) + "\n");
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    this.initialized = true;
  }
  async callTool(name, args) {
    if (!this.initialized) {
      await this.initializeMCP();
    }
    const request = {
      jsonrpc: "2.0",
      id: this.generateRequestId(),
      method: "tools/call",
      params: {
        name,
        arguments: args
      }
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
  isConnected() {
    return this.process && !this.process.killed;
  }
  async disconnect() {
    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM");
    }
  }
  setupStdioHandling() {
    if (this.process.stdout) {
      this.process.stdout.on("data", (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });
    }
    if (this.process.stderr) {
      this.process.stderr.on("data", (data) => {
        console.error("MCP stderr:", data.toString());
      });
    }
  }
  processBuffer() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          this.handleResponse(response);
        } catch (error) {
          const trimmed = line.trim();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            console.error("Failed to parse MCP response:", line, error);
          }
        }
      }
    }
  }
  handleResponse(response) {
    const requestId = response.id?.toString();
    if (requestId && this.pendingRequests.has(requestId)) {
      const pending = this.pendingRequests.get(requestId);
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.resolve(response);
    }
  }
  async sendRequest(request) {
    return new Promise((resolve, reject) => {
      const requestId = request.id?.toString();
      if (!requestId) {
        reject(new Error("Request ID is required"));
        return;
      }
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`MCP request timeout after ${this.timeout}ms`));
      }, this.timeout);
      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      const requestLine = JSON.stringify(request) + "\n";
      if (this.process.stdin) {
        this.process.stdin.write(requestLine);
      } else {
        reject(new Error("Process stdin not available"));
      }
    });
  }
  generateRequestId() {
    return `req_${Date.now()}_${++this.requestId}`;
  }
};
var WebRTCBridgeServer = class {
  config;
  app;
  server = null;
  mcpProcess = null;
  mcpClient = null;
  isRunning = false;
  // Bidirectional mapping between OpenAI function names and MCP tool names
  functionNameToMCPTool = /* @__PURE__ */ new Map();
  mcpToolToFunctionName = /* @__PURE__ */ new Map();
  constructor(config) {
    this.config = {
      ...config,
      server: {
        port: 8084,
        host: "localhost",
        cors: true,
        ...config.server
      }
    };
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }
  /**
   * Start the WebRTC bridge server
   */
  async start() {
    if (this.isRunning) {
      throw new Error("Server is already running");
    }
    try {
      if ("command" in this.config.mcp) {
        await this.startMCPServer();
      } else if ("url" in this.config.mcp) {
        await this.connectToMCPServer();
      } else {
        throw new Error("Either mcp.command or mcp.url must be provided");
      }
      await this.startHTTPServer();
      this.isRunning = true;
      console.log(`\u{1F680} WebRTC Bridge Server running on http://${this.config.server.host}:${this.config.server.port}`);
      console.log("\u{1F4E1} Endpoints:");
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
  async stop() {
    this.isRunning = false;
    const stopPromises = [];
    if (this.server) {
      stopPromises.push(new Promise((resolve) => {
        this.server.close(() => resolve());
      }));
    }
    if (this.mcpClient) {
      stopPromises.push(this.mcpClient.disconnect());
    }
    if (this.mcpProcess && !this.mcpProcess.killed) {
      this.mcpProcess.kill("SIGTERM");
      stopPromises.push(new Promise((resolve) => {
        this.mcpProcess.on("exit", () => resolve());
      }));
    }
    await Promise.all(stopPromises);
    this.functionNameToMCPTool.clear();
    this.mcpToolToFunctionName.clear();
    console.log("\u{1F6D1} WebRTC Bridge Server stopped");
  }
  /**
   * Check if the server is running
   */
  isServerRunning() {
    return this.isRunning;
  }
  /**
   * Get the server URL
   */
  getServerURL() {
    return `http://${this.config.server.host}:${this.config.server.port}`;
  }
  setupMiddleware() {
    if (this.config.server.cors) {
      this.app.use(cors({
        origin: true,
        credentials: true
      }));
    }
    this.app.use(express.json());
    this.app.use((req, _res, next) => {
      console.log(`${(/* @__PURE__ */ new Date()).toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }
  setupRoutes() {
    this.app.get("/health", (_req, res) => {
      res.json({
        status: "healthy",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        mcp: {
          connected: this.mcpClient?.isConnected() ?? false,
          processRunning: this.mcpProcess ? !this.mcpProcess.killed : false
        }
      });
    });
    this.app.get("/session", async (_req, res) => {
      try {
        let tools = [];
        let instructions = this.config.openai.instructions || "You are a helpful assistant with access to external tools.";
        if (this.mcpClient && this.mcpClient.isConnected()) {
          try {
            const mcpTools = await this.mcpClient.discoverTools();
            tools = mcpTools.map((tool) => {
              const parameters = this.convertMCPSchemaToOpenAI(tool.inputSchema);
              const functionName = this.sanitizeFunctionName(tool.name);
              return {
                type: "function",
                name: functionName,
                description: tool.description || `Execute ${tool.name} tool`,
                parameters
                // Note: Realtime API doesn't support strict mode like Chat Completions API
              };
            });
            if (this.config.debug?.enabled || this.config.debug?.logTools) {
              console.log(`\u{1F4E1} Including ${tools.length} MCP tools in session`);
              tools.forEach((tool) => {
                console.log(`   - ${tool.name}: ${tool.description?.substring(0, 80)}...`);
                if (this.config.debug?.enabled) {
                  console.log(`     Schema:`, JSON.stringify(tool.parameters, null, 2));
                }
              });
            } else {
              console.log(`\u{1F4E1} Including ${tools.length} MCP tools in session`);
            }
          } catch (error) {
            console.warn("Failed to get MCP tools for session:", error);
          }
        }
        const sessionConfig = {
          model: this.config.openai.model,
          voice: this.config.openai.voice || "alloy",
          modalities: ["text", "audio"],
          instructions
        };
        if (tools.length > 0) {
          sessionConfig.tools = tools;
        }
        if (this.config.debug?.enabled) {
          console.log(`\u{1F527} Sending session config to OpenAI:`, JSON.stringify(sessionConfig, null, 2));
        }
        const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.config.openai.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(sessionConfig)
        });
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`\u274C OpenAI API error ${response.status}:`, errorText);
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }
        const sessionData = await response.json();
        res.json(sessionData);
      } catch (error) {
        console.error("Failed to create ephemeral session:", error);
        res.status(500).json({
          error: "Failed to create session",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });
    this.app.post("/mcp", async (req, res) => {
      try {
        if (!this.mcpClient || !this.mcpClient.isConnected()) {
          throw new Error("MCP client not connected");
        }
        const { method, params, id } = req.body;
        let result;
        switch (method) {
          case "tools/list":
            result = await this.mcpClient.discoverTools();
            res.json({
              jsonrpc: "2.0",
              result: { tools: result },
              id
            });
            break;
          case "tools/call":
            const { name, arguments: args } = params;
            const originalToolName = this.getOriginalMCPToolName(name);
            if (this.config.debug?.enabled || this.config.debug?.logFunctionCalls) {
              console.log(`\u{1F504} Function call mapping: "${name}" \u2192 "${originalToolName}"`);
            }
            result = await this.mcpClient.callTool(originalToolName, args);
            res.json({
              jsonrpc: "2.0",
              result,
              id
            });
            break;
          default:
            throw new Error(`Unsupported method: ${method}`);
        }
      } catch (error) {
        console.error("MCP proxy error:", error);
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal error"
          },
          id: req.body.id
        });
      }
    });
    this.app.get("/tools", async (_req, res) => {
      try {
        if (!this.mcpClient || !this.mcpClient.isConnected()) {
          res.json({ tools: [] });
          return;
        }
        const mcpTools = await this.mcpClient.discoverTools();
        const realtimeTools = mcpTools.map((tool) => {
          const parameters = this.convertMCPSchemaToOpenAI(tool.inputSchema);
          const functionName = this.sanitizeFunctionName(tool.name);
          return {
            type: "function",
            name: functionName,
            description: tool.description || `Execute ${tool.name} tool`,
            parameters
            // Note: Realtime API doesn't support strict mode like Chat Completions API
          };
        });
        res.json({
          tools: realtimeTools,
          instructions: this.config.openai.instructions || "You are a helpful assistant with access to external tools."
        });
      } catch (error) {
        console.error("Failed to get tools:", error);
        res.status(500).json({
          error: "Failed to get tools",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });
    if (process.env.NODE_ENV === "development") {
      this.app.use("/demo", express.static("examples/hubspot-test"));
    }
    this.app.get("/demo", (_req, res) => {
      res.send(this.getGenericDemoHTML());
    });
    this.app.get("/generic-demo.html", (_req, res) => {
      res.send(this.getGenericDemoHTML());
    });
  }
  async startMCPServer() {
    if (!("command" in this.config.mcp)) {
      throw new Error("MCP command not provided");
    }
    const mcpConfig = this.config.mcp;
    console.log(`\u{1F527} Starting MCP server: ${mcpConfig.command} ${mcpConfig.args?.join(" ") || ""}`);
    this.mcpProcess = spawn(mcpConfig.command, mcpConfig.args || [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...mcpConfig.env }
    });
    this.mcpProcess.on("error", (error) => {
      console.error("MCP process error:", error);
    });
    this.mcpProcess.on("exit", (code, signal) => {
      console.log(`MCP process exited with code ${code}, signal ${signal}`);
    });
    this.mcpClient = new StdioMCPClient(this.mcpProcess, mcpConfig.timeout || 1e4);
    const tools = await this.mcpClient.discoverTools();
    console.log(`\u2705 Connected to MCP server - found ${tools.length} tools`);
    if (this.config.debug?.enabled || this.config.debug?.logTools) {
      console.log("\u{1F50D} Discovered MCP tools:");
      tools.forEach((tool, index) => {
        console.log(`   ${index + 1}. ${tool.name}: ${tool.description || "No description"}`);
      });
    }
  }
  async connectToMCPServer() {
    if (!("url" in this.config.mcp)) {
      throw new Error("MCP URL not provided");
    }
    const mcpConfig = this.config.mcp;
    console.log(`\u{1F517} Connecting to MCP server: ${mcpConfig.url}`);
    this.mcpClient = new MCPClient(mcpConfig.url, mcpConfig.auth, mcpConfig.timeout);
    const tools = await this.mcpClient.discoverTools();
    console.log(`\u2705 Connected to MCP server - found ${tools.length} tools`);
  }
  async startHTTPServer() {
    return new Promise((resolve, reject) => {
      const port = this.config.server.port;
      const host = this.config.server.host;
      this.server = this.app.listen(port, host, () => {
        resolve();
      });
      this.server.on("error", (error) => {
        reject(error);
      });
    });
  }
  getGenericDemoHTML() {
    const serverUrl = this.getServerURL();
    const modelName = this.config.openai.model;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>\u{1F3A4} Generic WebRTC + MCP Demo</title>
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
            <h1>\u{1F3A4} Generic WebRTC + MCP Demo</h1>
            
            <div id="connectionStatus" class="status connecting">
                \u{1F504} Ready to connect...
            </div>

            <div class="controls">
                <button id="connectBtn" onclick="connect()">\u{1F517} Connect</button>
                <button id="disconnectBtn" onclick="disconnect()" disabled>\u23F9\uFE0F Disconnect</button>
                <button id="loadToolsBtn" onclick="loadTools()" disabled>\u{1F527} Load Tools</button>
                <button id="clearBtn" onclick="clearTranscript()">\u{1F5D1}\uFE0F Clear</button>
            </div>

            <div class="voice-controls">
                <div id="connectionIndicator" class="connection-indicator">\u{1F3A4}</div>
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
                        <div class="transcript-content">\u{1F680} Generic WebRTC + MCP Demo ready!</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="side-panel">
            <div class="config-section">
                <h3>\u{1F527} Configuration</h3>
                <input type="text" id="serverUrl" class="config-input" 
                       placeholder="Bridge Server URL (e.g., http://localhost:8084)" 
                       value="${serverUrl}">
                <input type="text" id="modelName" class="config-input" 
                       placeholder="Model (e.g., gpt-4o-realtime-preview-2024-12-17)" 
                       value="${modelName}">
            </div>

            <div class="tools-section">
                <h3>\u{1F6E0}\uFE0F Available Tools (<span id="toolCount">0</span>)</h3>
                <div class="tools-list" id="toolsList">
                    <div style="text-align: center; color: rgba(255,255,255,0.6);">
                        Click "Load Tools" to discover available MCP tools
                    </div>
                </div>
            </div>

            <div class="stats">
                <h4>\u{1F4CA} Session Stats</h4>
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
                
                updateStatus('\u{1F511} Getting ephemeral API key...', 'connecting');
                addTranscriptEntry('system', \`Connecting to \${serverUrl}...\`);

                // Get ephemeral API key
                const tokenResponse = await fetch(\`\${serverUrl}/session\`);
                if (!tokenResponse.ok) {
                    throw new Error(\`Failed to get ephemeral key: \${tokenResponse.status}\`);
                }
                const sessionData = await tokenResponse.json();
                const ephemeralKey = sessionData.client_secret.value;
                addTranscriptEntry('system', '\u2705 Got ephemeral API key');

                updateStatus('\u{1F504} Creating WebRTC connection...', 'connecting');

                // Create WebRTC peer connection
                pc = new RTCPeerConnection();

                // Set up audio playback
                const audioEl = document.getElementById('audioElement');
                pc.ontrack = e => {
                    addTranscriptEntry('system', '\u{1F4FB} Received audio track from AI');
                    audioEl.srcObject = e.streams[0];
                };

                // Add microphone
                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                pc.addTrack(audioStream.getTracks()[0]);
                addTranscriptEntry('system', '\u{1F3A4} Added microphone audio track');

                // Set up audio level monitoring
                setupAudioLevelMonitoring(audioStream);

                // Set up data channel
                dataChannel = pc.createDataChannel("oai-events");
                dataChannel.addEventListener("message", handleRealtimeEvent);
                dataChannel.addEventListener("open", () => {
                    addTranscriptEntry('system', '\u{1F4E1} Data channel opened');
                    updateConnectionIndicator('connected');
                    updateVoiceStatus('\u{1F389} Connected! Start talking...');
                    connectionStartTime = new Date();
                    updateConnectionTime();
                    
                    // Configure tools after connection is established
                    configureToolsForSession();
                });

                // Create offer and connect
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                addTranscriptEntry('system', '\u{1F4E4} Created WebRTC offer');

                updateStatus('\u{1F310} Connecting to OpenAI Realtime API...', 'connecting');
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

                addTranscriptEntry('system', '\u2705 WebRTC connection established');
                updateStatus('\u2705 Connected! Voice conversation active', 'connected');

                // Update UI
                document.getElementById('connectBtn').disabled = true;
                document.getElementById('disconnectBtn').disabled = false;
                document.getElementById('loadToolsBtn').disabled = false;

            } catch (error) {
                addTranscriptEntry('error', \`Connection failed: \${error.message}\`);
                updateStatus('\u274C Connection failed', 'error');
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
                        addTranscriptEntry('system', '\u{1F389} AI session created');
                        break;
                        
                    case 'session.updated':
                        addTranscriptEntry('system', '\u{1F504} AI session updated');
                        break;
                        
                    case 'input_audio_buffer.speech_started':
                        addTranscriptEntry('system', '\u{1F3A4} Speech detected');
                        updateConnectionIndicator('talking');
                        updateVoiceStatus('\u{1F3A4} Listening...');
                        updateCurrentTranscript('');
                        break;
                        
                    case 'input_audio_buffer.speech_stopped':
                        addTranscriptEntry('system', '\u{1F6D1} Speech ended');
                        updateConnectionIndicator('connected');
                        updateVoiceStatus('\u{1F914} Processing...');
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
                        addTranscriptEntry('system', '\u{1F680} AI response started');
                        break;
                        
                    case 'response.text.delta':
                        if (data.delta) {
                            addTranscriptEntry('assistant', data.delta);
                        }
                        break;
                        
                    case 'response.function_call_arguments.delta':
                        addTranscriptEntry('system', \`\u{1F6E0}\uFE0F Function call args: \${data.delta}\`);
                        break;
                        
                    case 'response.function_call_arguments.done':
                        functionCallCount++;
                        document.getElementById('functionCallCount').textContent = functionCallCount;
                        addTranscriptEntry('system', \`\u{1F6E0}\uFE0F Function call: \${data.name}(\${data.arguments})\`);
                        handleFunctionCall(data);
                        break;
                        
                    case 'response.done':
                        updateVoiceStatus('\u{1F389} Ready for next question...');
                        addTranscriptEntry('system', '\u2705 Response completed');
                        break;
                        
                    case 'error':
                        addTranscriptEntry('error', \`AI Error: \${data.error?.message || 'Unknown error'}\`);
                        break;
                        
                    default:
                        if (data.type.includes('function') || data.type.includes('tool')) {
                            addTranscriptEntry('system', \`\u{1F6E0}\uFE0F \${data.type}\`);
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
                
                addTranscriptEntry('system', \`\u{1F4E1} Calling MCP tool: \${mcpToolName}\`);
                
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

                addTranscriptEntry('system', \`\u2705 MCP response received for \${functionName}\`);

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
                    addTranscriptEntry('system', '\u{1F527} Loading available tools...');
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
                    addTranscriptEntry('system', \`\u2705 Loaded \${tools.length} tools (will be auto-configured for AI)\`);
                }
                
            } catch (error) {
                addTranscriptEntry('error', \`Failed to load tools: \${error.message}\`);
            }
        }

        function disconnect() {
            addTranscriptEntry('system', '\u{1F50C} Disconnecting...');

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

            updateStatus('\u{1F50C} Disconnected', 'connecting');
            updateVoiceStatus('Configure server URL and click Connect');
            updateConnectionIndicator('');
            updateCurrentTranscript('');
            
            document.getElementById('connectBtn').disabled = false;
            document.getElementById('disconnectBtn').disabled = true;
            document.getElementById('loadToolsBtn').disabled = true;
            
            connectionStartTime = null;
            document.getElementById('connectionTime').textContent = 'Not connected';

            addTranscriptEntry('system', '\u2705 Disconnected successfully');
        }

        function clearTranscript() {
            document.getElementById('transcript').innerHTML = \`
                <div class="transcript-entry system">
                    <div class="transcript-header">
                        <span>System</span>
                        <span>\${new Date().toLocaleTimeString()}</span>
                    </div>
                    <div class="transcript-content">\u{1F5D1}\uFE0F Transcript cleared</div>
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
                addTranscriptEntry('system', '\u{1F6E0}\uFE0F Configuring MCP tools for AI session...');
                
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
                    addTranscriptEntry('system', \`\u2705 Configured \${tools.length} MCP tools for AI\`);
                } else {
                    addTranscriptEntry('system', '\u26A0\uFE0F No MCP tools available');
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
  sanitizeFunctionName(originalName) {
    if (this.mcpToolToFunctionName.has(originalName)) {
      return this.mcpToolToFunctionName.get(originalName);
    }
    let sanitized = originalName.replace(/[^a-zA-Z0-9]/g, " ").split(/\s+/).filter((word) => word.length > 0).map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      } else {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
    }).join("");
    if (!/^[a-zA-Z]/.test(sanitized)) {
      sanitized = "fn" + sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
    }
    if (sanitized.length > 64) {
      sanitized = sanitized.substring(0, 64);
    }
    if (sanitized.length === 0) {
      sanitized = "unknownTool";
    }
    let finalName = sanitized;
    let counter = 1;
    while (this.functionNameToMCPTool.has(finalName)) {
      const suffix = counter.toString();
      const maxBaseLength = 64 - suffix.length;
      finalName = sanitized.substring(0, maxBaseLength) + suffix;
      counter++;
    }
    this.functionNameToMCPTool.set(finalName, originalName);
    this.mcpToolToFunctionName.set(originalName, finalName);
    return finalName;
  }
  getOriginalMCPToolName(functionName) {
    return this.functionNameToMCPTool.get(functionName) || functionName;
  }
  convertMCPSchemaToOpenAI(schema) {
    if (!schema || typeof schema !== "object") {
      return {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      };
    }
    const converted = {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
      // Required for strict mode
    };
    if (schema.properties && typeof schema.properties === "object") {
      const propertyNames = Object.keys(schema.properties);
      for (const [key, value] of Object.entries(schema.properties)) {
        converted.properties[key] = this.convertProperty(value);
      }
      if (schema.required && Array.isArray(schema.required)) {
        converted.required = schema.required.filter((req) => propertyNames.includes(req));
      } else {
        converted.required = propertyNames;
      }
    }
    return converted;
  }
  convertProperty(property) {
    if (!property || typeof property !== "object") {
      return { type: "string" };
    }
    const converted = { ...property };
    if (!converted.type) {
      converted.type = "string";
    }
    if (converted.type === "array") {
      if (!converted.items) {
        converted.items = { type: "string" };
      } else {
        converted.items = this.convertProperty(converted.items);
      }
    }
    if (converted.type === "object") {
      if (converted.properties) {
        converted.properties = this.convertProperties(converted.properties);
        converted.additionalProperties = false;
        if (!converted.required) {
          converted.required = Object.keys(converted.properties);
        }
      } else {
        converted.properties = {};
        converted.required = [];
        converted.additionalProperties = false;
      }
    }
    if (converted.enum && Array.isArray(converted.enum)) ;
    delete converted.examples;
    delete converted.default;
    return converted;
  }
  convertProperties(properties) {
    const converted = {};
    for (const [key, value] of Object.entries(properties)) {
      converted[key] = this.convertProperty(value);
    }
    return converted;
  }
};
var AuthConfigSchema = z.object({
  type: z.literal("bearer"),
  token: z.string().min(1, "Token is required"),
  header: z.string().optional().default("Authorization")
});
var OpenAIConfigSchema = z.object({
  apiKey: z.string().min(1, "OpenAI API key is required"),
  model: z.string().default("gpt-4o-realtime-preview"),
  instructions: z.string().optional(),
  voice: z.enum(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"]).optional().default("alloy")
});
var MCPConfigSchema = z.object({
  url: z.string().url("Valid MCP server URL is required"),
  auth: AuthConfigSchema.optional(),
  timeout: z.number().positive().default(1e4)
});
var ProxyConfigSchema = z.object({
  openai: OpenAIConfigSchema,
  mcp: MCPConfigSchema,
  settings: z.object({
    logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
    retryAttempts: z.number().nonnegative().default(3),
    retryDelay: z.number().positive().default(1e3)
  }).optional().default({})
});
var ConnectionState = /* @__PURE__ */ ((ConnectionState2) => {
  ConnectionState2["DISCONNECTED"] = "disconnected";
  ConnectionState2["CONNECTING"] = "connecting";
  ConnectionState2["CONNECTED"] = "connected";
  ConnectionState2["RECONNECTING"] = "reconnecting";
  ConnectionState2["ERROR"] = "error";
  return ConnectionState2;
})(ConnectionState || {});
function getDefaultSessionConfig() {
  return {
    modalities: ["text", "audio"],
    voice: "alloy",
    tool_choice: "auto",
    // Voice interface optimizations
    speed: 1.2,
    // Optimal speed - fast but not hurried  
    temperature: 0.7,
    // Slightly lower for more consistent, professional responses
    input_audio_transcription: {
      model: "whisper-1"
      // Enable transcription for better UX
    },
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 400,
      // Slightly faster response time
      create_response: true,
      interrupt_response: true
    }
  };
}
var RealtimeConnection = class {
  ws = null;
  config;
  handlers;
  isConnecting = false;
  isConnected = false;
  eventQueue = [];
  constructor(config, handlers = {}) {
    this.config = config;
    this.handlers = handlers;
  }
  /**
   * Connect to the OpenAI Realtime API
   * @param tools - Optional array of tools to configure in the session
   */
  async connect(tools) {
    if (this.isConnected || this.isConnecting) {
      return;
    }
    this.isConnecting = true;
    try {
      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.config.model)}`;
      this.ws = new WebSocket(url, {
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "OpenAI-Beta": "realtime=v1"
        }
      });
      await this.setupWebSocket();
      if (tools && tools.length > 0) {
        await this.updateSession(tools);
      }
      this.isConnected = true;
      this.isConnecting = false;
      this.handlers.onConnect?.();
    } catch (error) {
      this.isConnecting = false;
      this.isConnected = false;
      const errorMessage = error instanceof Error ? error.message : "Unknown connection error";
      this.handlers.onError?.(new Error(`Failed to connect to Realtime API: ${errorMessage}`));
      throw error;
    }
  }
  /**
   * Disconnect from the Realtime API
   */
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.handlers.onDisconnect?.();
  }
  /**
   * Update the session configuration with tools
   * @param tools - Array of Realtime tools to configure
   */
  async updateSession(tools) {
    const session = {
      ...getDefaultSessionConfig(),
      voice: this.config.voice,
      // Allow voice override from config
      tools
    };
    if (this.config.instructions) {
      const voiceGuidance = `

VOICE INTERFACE GUIDANCE & PERSONALITY:
You are having a voice conversation that will be read aloud over audio, and you should embody the personality of Jarvis from Iron Man - a sophisticated, witty, and highly capable AI assistant.

PERSONALITY TRAITS:
- Speak with sophisticated eloquence and confidence, like a well-educated British butler with advanced technical knowledge
- Use occasional dry wit and subtle humor when appropriate
- Be efficient and precise - get to the point while maintaining charm
- Show quiet confidence in your abilities without being arrogant
- Use slightly formal but warm language (e.g., "Certainly, sir/madam" or "I've located the information you requested")
- Occasionally use refined vocabulary and British-influenced phrasing
- Be helpful and anticipate needs, like a truly advanced AI assistant would

VOICE-SPECIFIC GUIDELINES:
- Avoid reading out URLs, file paths, or other text that would be unnatural to say aloud
- Be concise and conversational - voice interactions work best with shorter, more natural responses
- Don't include formatting like bullet points or numbered lists in your speech
- If you need to reference specific data, describe it naturally rather than reading it verbatim
- Focus on the key information that would be most helpful to hear
- Speak as if you're an advanced AI assistant having a sophisticated conversation

`;
      session.instructions = this.config.instructions + voiceGuidance;
    }
    const sessionUpdate = {
      type: "session.update",
      session
    };
    this.sendEvent(sessionUpdate);
  }
  /**
   * Send a function call result back to the Realtime API
   * @param callId - The function call ID from the original function call event
   * @param result - The result from the MCP tool execution
   */
  sendFunctionResponse(callId, result) {
    const response = {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: result
      }
    };
    this.sendEvent(response);
  }
  /**
   * Check if the connection is active
   */
  isConnectionActive() {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
  /**
   * Send an event to the Realtime API
   * @param event - The client event to send
   */
  sendEvent(event) {
    if (!this.isConnectionActive()) {
      this.eventQueue.push(event);
      return;
    }
    try {
      this.ws.send(JSON.stringify(event));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown send error";
      this.handlers.onError?.(new Error(`Failed to send event: ${errorMessage}`));
    }
  }
  /**
   * Set up WebSocket event handlers
   */
  async setupWebSocket() {
    if (!this.ws) {
      throw new Error("WebSocket not initialized");
    }
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error("WebSocket not initialized"));
        return;
      }
      this.ws.onopen = () => {
        while (this.eventQueue.length > 0) {
          const event = this.eventQueue.shift();
          if (event) {
            this.sendEvent(event);
          }
        }
        resolve();
      };
      this.ws.onmessage = (event) => {
        this.handleServerEvent(event.data.toString());
      };
      this.ws.onerror = (error) => {
        const errorMessage = "message" in error ? error.message : "WebSocket error";
        reject(new Error(errorMessage));
      };
      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.isConnecting = false;
        if (!event.wasClean) {
          this.handlers.onError?.(new Error(`WebSocket closed unexpectedly: ${event.code} ${event.reason}`));
        }
        this.handlers.onDisconnect?.();
      };
    });
  }
  /**
   * Handle incoming server events from the Realtime API
   * @param data - Raw event data from the WebSocket
   */
  handleServerEvent(data) {
    try {
      const event = JSON.parse(data);
      switch (event.type) {
        case "session.created":
          this.handlers.onSessionCreated?.();
          break;
        case "session.updated":
          this.handlers.onSessionUpdated?.();
          break;
        case "response.function_call_arguments.done":
          this.handlers.onFunctionCall?.(event);
          break;
        case "error":
          this.handlers.onError?.(new Error(`Realtime API error: ${event.error.message}`));
          break;
        default:
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown parsing error";
      this.handlers.onError?.(new Error(`Failed to parse server event: ${errorMessage}`));
    }
  }
};

// src/proxy.ts
var SimpleEventEmitter = class {
  listeners = /* @__PURE__ */ new Map();
  emit(event, ...args) {
    const eventListeners = this.listeners.get(event) || [];
    for (const listener of eventListeners) {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    }
  }
  on(event, listener) {
    const eventName = event;
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(listener);
  }
  off(event, listener) {
    const eventName = event;
    const eventListeners = this.listeners.get(eventName);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    }
  }
};
var RealtimeMCPProxy = class {
  config;
  events = new SimpleEventEmitter();
  mcpClient = null;
  realtimeConnection = null;
  currentState = "disconnected" /* DISCONNECTED */;
  mcpTools = [];
  constructor(config) {
    const validationResult = ProxyConfigSchema.safeParse(config);
    if (!validationResult.success) {
      throw new Error(`Invalid configuration: ${validationResult.error.message}`);
    }
    this.config = validationResult.data;
  }
  /**
   * Connect to both MCP server and Realtime API
   * Auto-discovers tools and sets up function call routing
   */
  async connect() {
    if (this.currentState !== "disconnected" /* DISCONNECTED */) {
      throw new Error(`Cannot connect: current state is ${this.currentState}`);
    }
    this.setState("connecting" /* CONNECTING */);
    try {
      await this.connectToMCP();
      await this.connectToRealtime();
      this.setState("connected" /* CONNECTED */);
    } catch (error) {
      this.setState("error" /* ERROR */);
      const errorMessage = error instanceof Error ? error.message : "Unknown connection error";
      const proxyError = new Error(`Failed to connect: ${errorMessage}`);
      this.events.emit("error", proxyError);
      throw proxyError;
    }
  }
  /**
   * Disconnect from both services
   */
  async disconnect() {
    this.setState("disconnected" /* DISCONNECTED */);
    const disconnectPromises = [];
    if (this.realtimeConnection) {
      disconnectPromises.push(this.realtimeConnection.disconnect());
    }
    if (this.mcpClient) {
      disconnectPromises.push(this.mcpClient.disconnect());
    }
    await Promise.all(disconnectPromises);
    this.mcpClient = null;
    this.realtimeConnection = null;
    this.mcpTools = [];
  }
  /**
   * Get current connection state
   */
  getState() {
    return this.currentState;
  }
  /**
   * Get discovered MCP tools
   */
  getTools() {
    return [...this.mcpTools];
  }
  /**
   * Check if proxy is connected and ready
   */
  isReady() {
    return this.currentState === "connected" /* CONNECTED */ && this.mcpClient?.isConnected() === true && this.realtimeConnection?.isConnectionActive() === true;
  }
  /**
   * Add event listener
   */
  on(event, listener) {
    this.events.on(event, listener);
  }
  /**
   * Remove event listener
   */
  off(event, listener) {
    this.events.off(event, listener);
  }
  /**
   * Connect to the MCP server and discover available tools
   */
  async connectToMCP() {
    this.mcpClient = new MCPClient(
      this.config.mcp.url,
      this.config.mcp.auth,
      this.config.mcp.timeout
    );
    this.mcpTools = await this.mcpClient.discoverTools();
    if (this.mcpTools.length === 0) {
      throw new Error("No tools discovered from MCP server");
    }
    this.events.emit("mcpConnect");
  }
  /**
   * Connect to the Realtime API with the discovered MCP tools
   */
  async connectToRealtime() {
    const realtimeTools = this.mcpTools.map(this.convertMCPToRealtimeTool);
    const handlers = {
      onSessionCreated: () => {
        this.log("Realtime session created");
      },
      onSessionUpdated: () => {
        this.log("Realtime session updated with MCP tools");
      },
      onFunctionCall: this.handleFunctionCall.bind(this),
      onError: (error) => {
        this.events.emit("error", error);
      },
      onConnect: () => {
        this.events.emit("realtimeConnect");
      },
      onDisconnect: () => {
        this.events.emit("realtimeDisconnect");
      }
    };
    this.realtimeConnection = new RealtimeConnection(this.config.openai, handlers);
    await this.realtimeConnection.connect(realtimeTools);
  }
  /**
   * Handle function calls from the Realtime API
   * This is the core of our proxy functionality
   */
  async handleFunctionCall(event) {
    const { name, arguments: argsString, call_id } = event;
    try {
      const args = JSON.parse(argsString);
      this.events.emit("functionCall", name, args);
      this.log(`Executing MCP tool: ${name}`);
      if (!this.mcpClient) {
        throw new Error("MCP client not connected");
      }
      const result = await this.mcpClient.callTool(name, args);
      const formattedResult = this.formatMCPResult(result);
      this.events.emit("functionResult", name, formattedResult);
      if (!this.realtimeConnection) {
        throw new Error("Realtime connection not active");
      }
      this.realtimeConnection.sendFunctionResponse(call_id, formattedResult);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log(`Function call failed: ${errorMessage}`);
      const errorResult = `Error executing ${name}: ${errorMessage}`;
      this.realtimeConnection?.sendFunctionResponse(call_id, errorResult);
      this.events.emit("error", new Error(`Function call failed: ${errorMessage}`));
    }
  }
  /**
   * Convert MCP tool to Realtime API tool format
   */
  convertMCPToRealtimeTool(mcpTool) {
    const parameters = {
      type: "object",
      properties: mcpTool.inputSchema.properties,
      additionalProperties: mcpTool.inputSchema.additionalProperties ?? false
    };
    if (mcpTool.inputSchema.required) {
      parameters.required = mcpTool.inputSchema.required;
    }
    const tool = {
      type: "function",
      name: mcpTool.name,
      parameters
    };
    if (mcpTool.description) {
      tool.description = mcpTool.description;
    }
    return tool;
  }
  /**
   * Format MCP tool result for Realtime API
   */
  formatMCPResult(result) {
    if (typeof result === "string") {
      return result;
    }
    if (result && typeof result === "object") {
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
        return textContent || JSON.stringify(result);
      }
    }
    return JSON.stringify(result);
  }
  /**
   * Set the current connection state and emit event
   */
  setState(state) {
    if (this.currentState !== state) {
      this.currentState = state;
      this.events.emit("stateChange", state);
    }
  }
  /**
   * Simple logging utility
   */
  log(message) {
    if (this.config.settings?.logLevel === "debug") {
      console.log(`[RealtimeMCPProxy] ${message}`);
    }
  }
};

export { AuthConfigSchema, ConnectionState, MCPClient, MCPConfigSchema, OpenAIConfigSchema, ProxyConfigSchema, RealtimeConnection, RealtimeMCPProxy, WebRTCBridgeServer, getDefaultSessionConfig };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map