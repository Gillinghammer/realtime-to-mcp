import type {
  ProxyConfig,
  ProxyEvents,
  MCPTool,
  RealtimeTool,
  ResponseFunctionCallArgumentsDoneEvent,
} from './types/index.js';
import { ProxyConfigSchema, ConnectionState } from './types/index.js';
import { MCPClient } from './mcp/client.js';
import { RealtimeConnection, type RealtimeEventHandlers } from './realtime/connection.js';

/**
 * Event emitter interface for proxy events
 */
interface EventEmitter {
  emit<K extends keyof ProxyEvents>(event: K, ...args: Parameters<ProxyEvents[K]>): void;
  on<K extends keyof ProxyEvents>(event: K, listener: ProxyEvents[K]): void;
  off<K extends keyof ProxyEvents>(event: K, listener: ProxyEvents[K]): void;
}

/**
 * Simple event emitter implementation
 */
class SimpleEventEmitter implements EventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  emit<K extends keyof ProxyEvents>(event: K, ...args: Parameters<ProxyEvents[K]>): void {
    const eventListeners = this.listeners.get(event as string) || [];
    for (const listener of eventListeners) {
      try {
        listener(...args);
      } catch (error) {
        console.error(`Error in event listener for ${event as string}:`, error);
      }
    }
  }

  on<K extends keyof ProxyEvents>(event: K, listener: ProxyEvents[K]): void {
    const eventName = event as string;
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName)!.push(listener);
  }

  off<K extends keyof ProxyEvents>(event: K, listener: ProxyEvents[K]): void {
    const eventName = event as string;
    const eventListeners = this.listeners.get(eventName);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    }
  }
}

/**
 * Main proxy class that bridges OpenAI's Realtime API with MCP servers
 * Implements our simplified approach for maximum developer experience
 */
export class RealtimeMCPProxy {
  private readonly config: ProxyConfig;
  private readonly events = new SimpleEventEmitter();
  private mcpClient: MCPClient | null = null;
  private realtimeConnection: RealtimeConnection | null = null;
  private currentState: ConnectionState = ConnectionState.DISCONNECTED;
  private mcpTools: MCPTool[] = [];

  constructor(config: ProxyConfig) {
    // Validate configuration using Zod schema
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
  async connect(): Promise<void> {
    if (this.currentState !== ConnectionState.DISCONNECTED) {
      throw new Error(`Cannot connect: current state is ${this.currentState}`);
    }

    this.setState(ConnectionState.CONNECTING);

    try {
      // Step 1: Connect to MCP server and discover tools
      await this.connectToMCP();

      // Step 2: Connect to Realtime API with discovered tools
      await this.connectToRealtime();

      this.setState(ConnectionState.CONNECTED);
    } catch (error) {
      this.setState(ConnectionState.ERROR);
      const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
      const proxyError = new Error(`Failed to connect: ${errorMessage}`);
      this.events.emit('error', proxyError);
      throw proxyError;
    }
  }

  /**
   * Disconnect from both services
   */
  async disconnect(): Promise<void> {
    this.setState(ConnectionState.DISCONNECTED);

    // Disconnect from both services
    const disconnectPromises: Promise<void>[] = [];
    
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
  getState(): ConnectionState {
    return this.currentState;
  }

  /**
   * Get discovered MCP tools
   */
  getTools(): MCPTool[] {
    return [...this.mcpTools];
  }

  /**
   * Check if proxy is connected and ready
   */
  isReady(): boolean {
    return this.currentState === ConnectionState.CONNECTED &&
           this.mcpClient?.isConnected() === true &&
           this.realtimeConnection?.isConnectionActive() === true;
  }

  /**
   * Add event listener
   */
  on<K extends keyof ProxyEvents>(event: K, listener: ProxyEvents[K]): void {
    this.events.on(event, listener);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof ProxyEvents>(event: K, listener: ProxyEvents[K]): void {
    this.events.off(event, listener);
  }

  /**
   * Connect to the MCP server and discover available tools
   */
  private async connectToMCP(): Promise<void> {
    this.mcpClient = new MCPClient(
      this.config.mcp.url,
      this.config.mcp.auth,
      this.config.mcp.timeout
    );

    // Discover available tools
    this.mcpTools = await this.mcpClient.discoverTools();
    
    if (this.mcpTools.length === 0) {
      throw new Error('No tools discovered from MCP server');
    }

    this.events.emit('mcpConnect');
  }

  /**
   * Connect to the Realtime API with the discovered MCP tools
   */
  private async connectToRealtime(): Promise<void> {
    // Convert MCP tools to Realtime API tool format
    const realtimeTools: RealtimeTool[] = this.mcpTools.map(this.convertMCPToRealtimeTool);

    // Set up event handlers for the Realtime connection
    const handlers: RealtimeEventHandlers = {
      onSessionCreated: () => {
        this.log('Realtime session created');
      },
      onSessionUpdated: () => {
        this.log('Realtime session updated with MCP tools');
      },
      onFunctionCall: this.handleFunctionCall.bind(this),
      onError: (error) => {
        this.events.emit('error', error);
      },
      onConnect: () => {
        this.events.emit('realtimeConnect');
      },
      onDisconnect: () => {
        this.events.emit('realtimeDisconnect');
      },
    };

    this.realtimeConnection = new RealtimeConnection(this.config.openai, handlers);
    await this.realtimeConnection.connect(realtimeTools);
  }

  /**
   * Handle function calls from the Realtime API
   * This is the core of our proxy functionality
   */
  private async handleFunctionCall(event: ResponseFunctionCallArgumentsDoneEvent): Promise<void> {
    const { name, arguments: argsString, call_id } = event;
    
    try {
      // Parse function arguments
      const args = JSON.parse(argsString) as Record<string, unknown>;
      
      this.events.emit('functionCall', name, args);
      this.log(`Executing MCP tool: ${name}`);

      // Execute the MCP tool
      if (!this.mcpClient) {
        throw new Error('MCP client not connected');
      }

      const result = await this.mcpClient.callTool(name, args);
      
      // Format result for Realtime API
      const formattedResult = this.formatMCPResult(result);
      
      this.events.emit('functionResult', name, formattedResult);
      
      // Send result back to Realtime API
      if (!this.realtimeConnection) {
        throw new Error('Realtime connection not active');
      }

      this.realtimeConnection.sendFunctionResponse(call_id, formattedResult);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Function call failed: ${errorMessage}`);
      
      // Send error back to Realtime API
      const errorResult = `Error executing ${name}: ${errorMessage}`;
      this.realtimeConnection?.sendFunctionResponse(call_id, errorResult);
      
      this.events.emit('error', new Error(`Function call failed: ${errorMessage}`));
    }
  }

  /**
   * Convert MCP tool to Realtime API tool format
   */
  private convertMCPToRealtimeTool(mcpTool: MCPTool): RealtimeTool {
    const parameters: RealtimeTool['parameters'] = {
      type: 'object',
      properties: mcpTool.inputSchema.properties,
      additionalProperties: mcpTool.inputSchema.additionalProperties ?? false,
    };

    // Only set required if it's defined
    if (mcpTool.inputSchema.required) {
      parameters.required = mcpTool.inputSchema.required;
    }

    const tool: RealtimeTool = {
      type: 'function',
      name: mcpTool.name,
      parameters,
    };

    // Only set description if it's defined
    if (mcpTool.description) {
      tool.description = mcpTool.description;
    }

    return tool;
  }

  /**
   * Format MCP tool result for Realtime API
   */
  private formatMCPResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }

    if (result && typeof result === 'object') {
      // Handle MCP tool call result format
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text)
          .join('\n');
        
        return textContent || JSON.stringify(result);
      }
    }

    return JSON.stringify(result);
  }

  /**
   * Set the current connection state and emit event
   */
  private setState(state: ConnectionState): void {
    if (this.currentState !== state) {
      this.currentState = state;
      this.events.emit('stateChange', state);
    }
  }

  /**
   * Simple logging utility
   */
  private log(message: string): void {
    if (this.config.settings?.logLevel === 'debug') {
      console.log(`[RealtimeMCPProxy] ${message}`);
    }
  }
} 