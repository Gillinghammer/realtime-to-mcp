/**
 * MCP (Model Context Protocol) types based on JSON-RPC 2.0 specification
 */

/**
 * Base JSON-RPC 2.0 request structure
 */
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

/**
 * Base JSON-RPC 2.0 response structure
 */
export interface MCPResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: MCPError;
}

/**
 * JSON-RPC 2.0 error structure
 */
export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP tool definition as returned by tools/list
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
    description?: string;
    $schema?: string;
  };
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

/**
 * Response from tools/list method
 */
export interface MCPToolsListResponse {
  tools: MCPTool[];
}

/**
 * Parameters for tools/call method
 */
export interface MCPToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Result from tools/call method
 */
export interface MCPToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * Specific request types for MCP methods
 */
export interface MCPToolsListRequest extends MCPRequest {
  method: 'tools/list';
  params?: Record<string, never>;
}

export interface MCPToolCallRequest extends MCPRequest {
  method: 'tools/call';
  params: MCPToolCallParams;
}

/**
 * Union type for all MCP request types we use
 */
export type MCPRequestType = MCPToolsListRequest | MCPToolCallRequest;

/**
 * MCP client interface for communication with MCP servers
 */
export interface MCPClientInterface {
  /**
   * Discover available tools from the MCP server
   */
  discoverTools(): Promise<MCPTool[]>;
  
  /**
   * Call a specific tool with the provided arguments
   */
  callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;
  
  /**
   * Get connection status
   */
  isConnected(): boolean;
  
  /**
   * Disconnect from the MCP server
   */
  disconnect(): Promise<void>;
} 