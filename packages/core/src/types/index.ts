/**
 * Type definitions for the Realtime MCP Proxy library
 */

// Configuration types
export type {
  AuthConfig,
  OpenAIConfig,
  MCPConfig,
  ProxyConfig,
  ProxyEvents,
} from './config.js';

export {
  AuthConfigSchema,
  OpenAIConfigSchema,
  MCPConfigSchema,
  ProxyConfigSchema,
  ConnectionState,
} from './config.js';

// Realtime API types
export type {
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
} from './realtime.js';

// MCP protocol types
export type {
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
} from './mcp.js'; 