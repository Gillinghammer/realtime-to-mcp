/**
 * Realtime API event types based on OpenAI's documentation
 */

/**
 * Base event structure for all Realtime API events
 */
export interface RealtimeEvent {
  type: string;
  event_id?: string;
}

/**
 * Session configuration for Realtime API
 */
export interface RealtimeSession {
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
  speed?: number; // Voice speed (0.25 to 1.5, defaults to 1.0)
}

/**
 * Tool definition for Realtime API (converted from MCP tools)
 */
export interface RealtimeTool {
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
export interface SessionUpdateEvent extends RealtimeEvent {
  type: 'session.update';
  session: Partial<RealtimeSession>;
}

export interface ResponseCreateEvent extends RealtimeEvent {
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

export interface ConversationItemCreateEvent extends RealtimeEvent {
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
export interface SessionCreatedEvent extends RealtimeEvent {
  type: 'session.created';
  session: RealtimeSession;
}

export interface SessionUpdatedEvent extends RealtimeEvent {
  type: 'session.updated';
  session: RealtimeSession;
}

export interface ResponseFunctionCallArgumentsDoneEvent extends RealtimeEvent {
  type: 'response.function_call_arguments.done';
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
  name: string;
  arguments: string;
}

export interface ResponseDoneEvent extends RealtimeEvent {
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

export interface ErrorEvent extends RealtimeEvent {
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
export type RealtimeServerEvent = 
  | SessionCreatedEvent
  | SessionUpdatedEvent
  | ResponseFunctionCallArgumentsDoneEvent
  | ResponseDoneEvent
  | ErrorEvent;

/**
 * Union type for all client events we send
 */
export type RealtimeClientEvent = 
  | SessionUpdateEvent
  | ResponseCreateEvent
  | ConversationItemCreateEvent; 