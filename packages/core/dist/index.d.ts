import { z } from 'zod';

/**
 * Authentication configuration for MCP servers
 */
declare const AuthConfigSchema: z.ZodObject<{
    type: z.ZodLiteral<"bearer">;
    token: z.ZodString;
    header: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    type: "bearer";
    token: string;
    header: string;
}, {
    type: "bearer";
    token: string;
    header?: string | undefined;
}>;
type AuthConfig = z.infer<typeof AuthConfigSchema>;
/**
 * OpenAI Realtime API configuration
 */
declare const OpenAIConfigSchema: z.ZodObject<{
    apiKey: z.ZodString;
    model: z.ZodDefault<z.ZodString>;
    instructions: z.ZodOptional<z.ZodString>;
    voice: z.ZodDefault<z.ZodOptional<z.ZodEnum<["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"]>>>;
}, "strip", z.ZodTypeAny, {
    apiKey: string;
    model: string;
    voice: "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse";
    instructions?: string | undefined;
}, {
    apiKey: string;
    model?: string | undefined;
    instructions?: string | undefined;
    voice?: "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse" | undefined;
}>;
type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;
/**
 * MCP server configuration
 */
declare const MCPConfigSchema: z.ZodObject<{
    url: z.ZodString;
    auth: z.ZodOptional<z.ZodObject<{
        type: z.ZodLiteral<"bearer">;
        token: z.ZodString;
        header: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        type: "bearer";
        token: string;
        header: string;
    }, {
        type: "bearer";
        token: string;
        header?: string | undefined;
    }>>;
    timeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    url: string;
    timeout: number;
    auth?: {
        type: "bearer";
        token: string;
        header: string;
    } | undefined;
}, {
    url: string;
    auth?: {
        type: "bearer";
        token: string;
        header?: string | undefined;
    } | undefined;
    timeout?: number | undefined;
}>;
type MCPConfig = z.infer<typeof MCPConfigSchema>;
/**
 * Main proxy configuration following our simplified approach
 */
declare const ProxyConfigSchema: z.ZodObject<{
    openai: z.ZodObject<{
        apiKey: z.ZodString;
        model: z.ZodDefault<z.ZodString>;
        instructions: z.ZodOptional<z.ZodString>;
        voice: z.ZodDefault<z.ZodOptional<z.ZodEnum<["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"]>>>;
    }, "strip", z.ZodTypeAny, {
        apiKey: string;
        model: string;
        voice: "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse";
        instructions?: string | undefined;
    }, {
        apiKey: string;
        model?: string | undefined;
        instructions?: string | undefined;
        voice?: "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse" | undefined;
    }>;
    mcp: z.ZodObject<{
        url: z.ZodString;
        auth: z.ZodOptional<z.ZodObject<{
            type: z.ZodLiteral<"bearer">;
            token: z.ZodString;
            header: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            type: "bearer";
            token: string;
            header: string;
        }, {
            type: "bearer";
            token: string;
            header?: string | undefined;
        }>>;
        timeout: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        timeout: number;
        auth?: {
            type: "bearer";
            token: string;
            header: string;
        } | undefined;
    }, {
        url: string;
        auth?: {
            type: "bearer";
            token: string;
            header?: string | undefined;
        } | undefined;
        timeout?: number | undefined;
    }>;
    settings: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        logLevel: z.ZodDefault<z.ZodEnum<["debug", "info", "warn", "error"]>>;
        retryAttempts: z.ZodDefault<z.ZodNumber>;
        retryDelay: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        logLevel: "debug" | "info" | "warn" | "error";
        retryAttempts: number;
        retryDelay: number;
    }, {
        logLevel?: "debug" | "info" | "warn" | "error" | undefined;
        retryAttempts?: number | undefined;
        retryDelay?: number | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    openai: {
        apiKey: string;
        model: string;
        voice: "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse";
        instructions?: string | undefined;
    };
    mcp: {
        url: string;
        timeout: number;
        auth?: {
            type: "bearer";
            token: string;
            header: string;
        } | undefined;
    };
    settings: {
        logLevel: "debug" | "info" | "warn" | "error";
        retryAttempts: number;
        retryDelay: number;
    };
}, {
    openai: {
        apiKey: string;
        model?: string | undefined;
        instructions?: string | undefined;
        voice?: "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse" | undefined;
    };
    mcp: {
        url: string;
        auth?: {
            type: "bearer";
            token: string;
            header?: string | undefined;
        } | undefined;
        timeout?: number | undefined;
    };
    settings?: {
        logLevel?: "debug" | "info" | "warn" | "error" | undefined;
        retryAttempts?: number | undefined;
        retryDelay?: number | undefined;
    } | undefined;
}>;
type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
/**
 * Connection states for the proxy
 */
declare enum ConnectionState {
    DISCONNECTED = "disconnected",
    CONNECTING = "connecting",
    CONNECTED = "connected",
    RECONNECTING = "reconnecting",
    ERROR = "error"
}
/**
 * Proxy events for monitoring and debugging
 */
interface ProxyEvents {
    stateChange: (state: ConnectionState) => void;
    error: (error: Error) => void;
    functionCall: (functionName: string, args: unknown) => void;
    functionResult: (functionName: string, result: unknown) => void;
    mcpConnect: () => void;
    mcpDisconnect: () => void;
    realtimeConnect: () => void;
    realtimeDisconnect: () => void;
}

/**
 * Realtime API event types based on OpenAI's documentation
 */
/**
 * Base event structure for all Realtime API events
 */
interface RealtimeEvent {
    type: string;
    event_id?: string;
}
/**
 * Session configuration for Realtime API
 */
interface RealtimeSession {
    modalities?: string[];
    instructions?: string;
    voice?: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse';
    input_audio_format?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
    output_audio_format?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
    input_audio_transcription?: {
        model?: string;
    };
    turn_detection?: {
        type: 'server_vad' | 'semantic_vad' | null;
        threshold?: number;
        prefix_padding_ms?: number;
        silence_duration_ms?: number;
        create_response?: boolean;
        interrupt_response?: boolean;
    };
    tools?: RealtimeTool[];
    tool_choice?: 'auto' | 'none' | 'required';
    temperature?: number;
    max_response_output_tokens?: number;
    speed?: number;
}
/**
 * Tool definition for Realtime API (converted from MCP tools)
 */
interface RealtimeTool {
    type: 'function';
    name: string;
    description?: string;
    parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
        additionalProperties?: boolean;
    };
}
/**
 * Client events sent to Realtime API
 */
interface SessionUpdateEvent extends RealtimeEvent {
    type: 'session.update';
    session: Partial<RealtimeSession>;
}
interface ResponseCreateEvent extends RealtimeEvent {
    type: 'response.create';
    response?: {
        modalities?: string[];
        instructions?: string;
        voice?: string;
        output_audio_format?: string;
        tools?: RealtimeTool[];
        tool_choice?: string;
        temperature?: number;
        max_output_tokens?: number;
    };
}
interface ConversationItemCreateEvent extends RealtimeEvent {
    type: 'conversation.item.create';
    item: {
        type: 'function_call_output';
        call_id: string;
        output: string;
    };
}
/**
 * Server events received from Realtime API
 */
interface SessionCreatedEvent extends RealtimeEvent {
    type: 'session.created';
    session: RealtimeSession;
}
interface SessionUpdatedEvent extends RealtimeEvent {
    type: 'session.updated';
    session: RealtimeSession;
}
interface ResponseFunctionCallArgumentsDoneEvent extends RealtimeEvent {
    type: 'response.function_call_arguments.done';
    response_id: string;
    item_id: string;
    output_index: number;
    call_id: string;
    name: string;
    arguments: string;
}
interface ResponseDoneEvent extends RealtimeEvent {
    type: 'response.done';
    response: {
        id: string;
        object: string;
        status: string;
        status_details?: unknown;
        output: Array<{
            id: string;
            object: string;
            type: string;
            status: string;
            name?: string;
            call_id?: string;
            arguments?: string;
        }>;
        usage?: {
            total_tokens: number;
            input_tokens: number;
            output_tokens: number;
        };
    };
}
interface ErrorEvent extends RealtimeEvent {
    type: 'error';
    error: {
        type: string;
        code: string;
        message: string;
        param?: string;
        event_id?: string;
    };
}
/**
 * Union type for all server events we handle
 */
type RealtimeServerEvent = SessionCreatedEvent | SessionUpdatedEvent | ResponseFunctionCallArgumentsDoneEvent | ResponseDoneEvent | ErrorEvent;
/**
 * Union type for all client events we send
 */
type RealtimeClientEvent = SessionUpdateEvent | ResponseCreateEvent | ConversationItemCreateEvent;

/**
 * MCP (Model Context Protocol) types based on JSON-RPC 2.0 specification
 */
/**
 * Base JSON-RPC 2.0 request structure
 */
interface MCPRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: unknown;
}
/**
 * Base JSON-RPC 2.0 response structure
 */
interface MCPResponse<T = unknown> {
    jsonrpc: '2.0';
    id: string | number;
    result?: T;
    error?: MCPError;
}
/**
 * JSON-RPC 2.0 error structure
 */
interface MCPError {
    code: number;
    message: string;
    data?: unknown;
}
/**
 * MCP tool definition as returned by tools/list
 */
interface MCPTool {
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
interface MCPToolsListResponse {
    tools: MCPTool[];
}
/**
 * Parameters for tools/call method
 */
interface MCPToolCallParams {
    name: string;
    arguments: Record<string, unknown>;
}
/**
 * Result from tools/call method
 */
interface MCPToolCallResult {
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
interface MCPToolsListRequest extends MCPRequest {
    method: 'tools/list';
    params?: Record<string, never>;
}
interface MCPToolCallRequest extends MCPRequest {
    method: 'tools/call';
    params: MCPToolCallParams;
}
/**
 * Union type for all MCP request types we use
 */
type MCPRequestType = MCPToolsListRequest | MCPToolCallRequest;
/**
 * MCP client interface for communication with MCP servers
 */
interface MCPClientInterface {
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

interface WebRTCBridgeConfig {
    openai: OpenAIConfig & {
        /** OpenAI API key for generating ephemeral keys */
        apiKey: string;
    };
    mcp: (MCPConfig) | ({
        /** MCP server command and arguments */
        command: string;
        args?: string[];
        /** Environment variables for MCP server */
        env?: Record<string, string>;
        /** Request timeout in milliseconds */
        timeout?: number;
    });
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
declare class WebRTCBridgeServer {
    private readonly config;
    private app;
    private server;
    private mcpProcess;
    private mcpClient;
    private isRunning;
    constructor(config: WebRTCBridgeConfig);
    /**
     * Start the WebRTC bridge server
     */
    start(): Promise<void>;
    /**
     * Stop the WebRTC bridge server
     */
    stop(): Promise<void>;
    /**
     * Check if the server is running
     */
    isServerRunning(): boolean;
    /**
     * Get the server URL
     */
    getServerURL(): string;
    private setupMiddleware;
    private setupRoutes;
    private startMCPServer;
    private connectToMCPServer;
    private startHTTPServer;
    private getGenericDemoHTML;
    private sanitizeFunctionName;
    private convertMCPSchemaToOpenAI;
    private convertProperty;
    private convertProperties;
}

/**
 * Main proxy class that bridges OpenAI's Realtime API with MCP servers
 * Implements our simplified approach for maximum developer experience
 */
declare class RealtimeMCPProxy {
    private readonly config;
    private readonly events;
    private mcpClient;
    private realtimeConnection;
    private currentState;
    private mcpTools;
    constructor(config: ProxyConfig);
    /**
     * Connect to both MCP server and Realtime API
     * Auto-discovers tools and sets up function call routing
     */
    connect(): Promise<void>;
    /**
     * Disconnect from both services
     */
    disconnect(): Promise<void>;
    /**
     * Get current connection state
     */
    getState(): ConnectionState;
    /**
     * Get discovered MCP tools
     */
    getTools(): MCPTool[];
    /**
     * Check if proxy is connected and ready
     */
    isReady(): boolean;
    /**
     * Add event listener
     */
    on<K extends keyof ProxyEvents>(event: K, listener: ProxyEvents[K]): void;
    /**
     * Remove event listener
     */
    off<K extends keyof ProxyEvents>(event: K, listener: ProxyEvents[K]): void;
    /**
     * Connect to the MCP server and discover available tools
     */
    private connectToMCP;
    /**
     * Connect to the Realtime API with the discovered MCP tools
     */
    private connectToRealtime;
    /**
     * Handle function calls from the Realtime API
     * This is the core of our proxy functionality
     */
    private handleFunctionCall;
    /**
     * Convert MCP tool to Realtime API tool format
     */
    private convertMCPToRealtimeTool;
    /**
     * Format MCP tool result for Realtime API
     */
    private formatMCPResult;
    /**
     * Set the current connection state and emit event
     */
    private setState;
    /**
     * Simple logging utility
     */
    private log;
}

/**
 * HTTP client for communicating with MCP servers
 * Implements the simplified approach focusing on HTTP/SSE transport
 */
declare class MCPClient implements MCPClientInterface {
    private readonly baseUrl;
    private readonly auth;
    private readonly timeout;
    private requestId;
    constructor(baseUrl: string, auth?: AuthConfig, timeout?: number);
    /**
     * Discover available tools from the MCP server
     * @returns Array of available MCP tools
     */
    discoverTools(): Promise<MCPTool[]>;
    /**
     * Call a specific tool with the provided arguments
     * @param name - Tool name to call
     * @param args - Arguments to pass to the tool
     * @returns Tool execution result
     */
    callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;
    /**
     * Check if the client is connected (basic connectivity test)
     * @returns true if connected, false otherwise
     */
    isConnected(): boolean;
    /**
     * Disconnect from the MCP server
     * For HTTP-based connections, this is a no-op
     */
    disconnect(): Promise<void>;
    /**
     * Send a JSON-RPC request to the MCP server
     * @param request - The JSON-RPC request to send
     * @returns The JSON-RPC response
     */
    private sendRequest;
    /**
     * Generate HTTP headers for the request
     * @returns Headers object with authentication and content type
     */
    private getHeaders;
    /**
     * Generate a unique request ID for JSON-RPC
     * @returns Unique request identifier
     */
    private generateRequestId;
}

/**
 * Event handlers for Realtime API events
 */
interface RealtimeEventHandlers {
    onSessionCreated?: () => void;
    onSessionUpdated?: () => void;
    onFunctionCall?: (event: ResponseFunctionCallArgumentsDoneEvent) => Promise<void>;
    onError?: (error: Error) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
}
/**
 * Get the default session configuration optimized for voice interactions
 */
declare function getDefaultSessionConfig(): Partial<RealtimeSession>;
/**
 * WebSocket connection manager for OpenAI's Realtime API
 * Handles the core WebSocket communication following our simplified approach
 */
declare class RealtimeConnection {
    private ws;
    private readonly config;
    private readonly handlers;
    private isConnecting;
    private isConnected;
    private eventQueue;
    constructor(config: OpenAIConfig, handlers?: RealtimeEventHandlers);
    /**
     * Connect to the OpenAI Realtime API
     * @param tools - Optional array of tools to configure in the session
     */
    connect(tools?: RealtimeTool[]): Promise<void>;
    /**
     * Disconnect from the Realtime API
     */
    disconnect(): Promise<void>;
    /**
     * Update the session configuration with tools
     * @param tools - Array of Realtime tools to configure
     */
    updateSession(tools: RealtimeTool[]): Promise<void>;
    /**
     * Send a function call result back to the Realtime API
     * @param callId - The function call ID from the original function call event
     * @param result - The result from the MCP tool execution
     */
    sendFunctionResponse(callId: string, result: string): void;
    /**
     * Check if the connection is active
     */
    isConnectionActive(): boolean;
    /**
     * Send an event to the Realtime API
     * @param event - The client event to send
     */
    private sendEvent;
    /**
     * Set up WebSocket event handlers
     */
    private setupWebSocket;
    /**
     * Handle incoming server events from the Realtime API
     * @param data - Raw event data from the WebSocket
     */
    private handleServerEvent;
}

export { type AuthConfig, AuthConfigSchema, ConnectionState, type ConversationItemCreateEvent, type ErrorEvent, MCPClient, type MCPClientInterface, type MCPConfig, MCPConfigSchema, type MCPError, type MCPRequest, type MCPRequestType, type MCPResponse, type MCPTool, type MCPToolCallParams, type MCPToolCallRequest, type MCPToolCallResult, type MCPToolsListRequest, type MCPToolsListResponse, type OpenAIConfig, OpenAIConfigSchema, type ProxyConfig, ProxyConfigSchema, type ProxyEvents, type RealtimeClientEvent, RealtimeConnection, type RealtimeEvent, type RealtimeEventHandlers, RealtimeMCPProxy, type RealtimeServerEvent, type RealtimeSession, type RealtimeTool, type ResponseCreateEvent, type ResponseDoneEvent, type ResponseFunctionCallArgumentsDoneEvent, type SessionCreatedEvent, type SessionUpdateEvent, type SessionUpdatedEvent, type WebRTCBridgeConfig, WebRTCBridgeServer, getDefaultSessionConfig };
