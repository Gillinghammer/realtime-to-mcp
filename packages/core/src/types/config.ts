import { z } from 'zod';

/**
 * Authentication configuration for MCP servers
 */
export const AuthConfigSchema = z.object({
  type: z.literal('bearer'),
  token: z.string().min(1, 'Token is required'),
  header: z.string().optional().default('Authorization'),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

/**
 * OpenAI Realtime API configuration
 */
export const OpenAIConfigSchema = z.object({
  apiKey: z.string().min(1, 'OpenAI API key is required'),
  model: z.string().default('gpt-4o-realtime-preview'),
  instructions: z.string().optional(),
  voice: z.enum(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse']).optional().default('alloy'),
});

export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

/**
 * MCP server configuration
 */
export const MCPConfigSchema = z.object({
  url: z.string().url('Valid MCP server URL is required'),
  auth: AuthConfigSchema.optional(),
  timeout: z.number().positive().default(10000),
});

export type MCPConfig = z.infer<typeof MCPConfigSchema>;

/**
 * Main proxy configuration following our simplified approach
 */
export const ProxyConfigSchema = z.object({
  openai: OpenAIConfigSchema,
  mcp: MCPConfigSchema,
  settings: z.object({
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    retryAttempts: z.number().nonnegative().default(3),
    retryDelay: z.number().positive().default(1000),
  }).optional().default({}),
});

export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;

/**
 * Connection states for the proxy
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * Proxy events for monitoring and debugging
 */
export interface ProxyEvents {
  stateChange: (state: ConnectionState) => void;
  error: (error: Error) => void;
  functionCall: (functionName: string, args: unknown) => void;
  functionResult: (functionName: string, result: unknown) => void;
  mcpConnect: () => void;
  mcpDisconnect: () => void;
  realtimeConnect: () => void;
  realtimeDisconnect: () => void;
} 