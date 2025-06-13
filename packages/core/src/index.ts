/**
 * Realtime MCP Proxy - Core Library
 * Bridges OpenAI's Realtime API with Model Context Protocol (MCP) servers
 */

// Primary API - WebRTC bridge server for easy integration
export { WebRTCBridgeServer } from './webrtc/bridge-server.js';
export type { WebRTCBridgeConfig } from './webrtc/bridge-server.js';

// Advanced Usage - Direct proxy class for custom implementations
export { RealtimeMCPProxy } from './proxy.js';

// Internal Components - For advanced users who need direct access
export { MCPClient } from './mcp/client.js';
export { RealtimeConnection, getDefaultSessionConfig } from './realtime/connection.js';
export type { RealtimeEventHandlers } from './realtime/connection.js';

// All types and schemas
export type {
  // Configuration types
  AuthConfig,
  OpenAIConfig,
  MCPConfig,
  ProxyConfig,
  ProxyEvents,
  
  // Realtime API types
  RealtimeEvent,
  RealtimeSession,
  RealtimeTool,
  SessionUpdateEvent,
  ResponseCreateEvent,
  ConversationItemCreateEvent,
  SessionCreatedEvent,
  SessionUpdatedEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseDoneEvent,
  ErrorEvent,
  RealtimeServerEvent,
  RealtimeClientEvent,
  
  // MCP protocol types
  MCPRequest,
  MCPResponse,
  MCPError,
  MCPTool,
  MCPToolsListResponse,
  MCPToolCallParams,
  MCPToolCallResult,
  MCPToolsListRequest,
  MCPToolCallRequest,
  MCPRequestType,
  MCPClientInterface,
} from './types/index.js';

export {
  // Configuration schemas for validation
  AuthConfigSchema,
  OpenAIConfigSchema,
  MCPConfigSchema,
  ProxyConfigSchema,
  
  // Enums
  ConnectionState,
} from './types/index.js'; 