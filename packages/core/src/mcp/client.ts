import type {
  MCPClientInterface,
  MCPTool,
  MCPToolCallResult,
  MCPRequest,
  MCPResponse,
  MCPToolsListResponse,
  AuthConfig,
} from '../types/index.js';

/**
 * HTTP client for communicating with MCP servers
 * Implements the simplified approach focusing on HTTP/SSE transport
 */
export class MCPClient implements MCPClientInterface {
  private readonly baseUrl: string;
  private readonly auth: AuthConfig | undefined;
  private readonly timeout: number;
  private requestId = 0;

  constructor(baseUrl: string, auth?: AuthConfig, timeout = 10000) {
    // Ensure URL doesn't have trailing slash for consistent API calls
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.auth = auth;
    this.timeout = timeout;
  }

  /**
   * Discover available tools from the MCP server
   * @returns Array of available MCP tools
   */
  async discoverTools(): Promise<MCPTool[]> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'tools/list',
    };

    const response = await this.sendRequest<MCPToolsListResponse>(request);
    
    if (response.error) {
      throw new Error(`MCP tools/list failed: ${response.error.message}`);
    }

    if (!response.result) {
      throw new Error('MCP tools/list returned no result');
    }

    return response.result.tools;
  }

  /**
   * Call a specific tool with the provided arguments
   * @param name - Tool name to call
   * @param args - Arguments to pass to the tool
   * @returns Tool execution result
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    };

    const response = await this.sendRequest<MCPToolCallResult>(request);
    
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
  isConnected(): boolean {
    // For HTTP-based MCP, we don't maintain persistent connections
    // This is a simple URL validation
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
  async disconnect(): Promise<void> {
    // No persistent connection to close for HTTP-based MCP
    return Promise.resolve();
  }

  /**
   * Send a JSON-RPC request to the MCP server
   * @param request - The JSON-RPC request to send
   * @returns The JSON-RPC response
   */
  private async sendRequest<T>(request: MCPRequest): Promise<MCPResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const jsonResponse = await response.json() as MCPResponse<T>;
      
      // Validate JSON-RPC response structure
      if (jsonResponse.jsonrpc !== '2.0') {
        throw new Error('Invalid JSON-RPC response: missing or incorrect jsonrpc field');
      }

      if (jsonResponse.id !== request.id) {
        throw new Error('Invalid JSON-RPC response: mismatched request ID');
      }

      return jsonResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`MCP request timeout after ${this.timeout}ms`);
        }
        throw error;
      }
      
      throw new Error('Unknown error during MCP request');
    }
  }

  /**
   * Generate HTTP headers for the request
   * @returns Headers object with authentication and content type
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Add authentication header if configured
    if (this.auth) {
      const headerName = this.auth.header || 'Authorization';
      const headerValue = this.auth.type === 'bearer' 
        ? `Bearer ${this.auth.token}`
        : this.auth.token;
      
      headers[headerName] = headerValue;
    }

    return headers;
  }

  /**
   * Generate a unique request ID for JSON-RPC
   * @returns Unique request identifier
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestId}`;
  }
} 