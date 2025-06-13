import WebSocket from 'ws';
import type {
  RealtimeServerEvent,
  RealtimeClientEvent,
  RealtimeTool,
  RealtimeSession,
  SessionUpdateEvent,
  ConversationItemCreateEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  OpenAIConfig,
} from '../types/index.js';

/**
 * Event handlers for Realtime API events
 */
export interface RealtimeEventHandlers {
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
export function getDefaultSessionConfig(): Partial<RealtimeSession> {
  return {
    modalities: ['text', 'audio'],
    voice: 'alloy',
    tool_choice: 'auto',
    // Voice interface optimizations
    speed: 1.2, // Optimal speed - fast but not hurried  
    temperature: 0.7, // Slightly lower for more consistent, professional responses
    input_audio_transcription: {
      model: 'whisper-1' // Enable transcription for better UX
    },
    turn_detection: {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 400, // Slightly faster response time
      create_response: true,
      interrupt_response: true,
    },
  };
}

/**
 * WebSocket connection manager for OpenAI's Realtime API
 * Handles the core WebSocket communication following our simplified approach
 */
export class RealtimeConnection {
  private ws: WebSocket | null = null;
  private readonly config: OpenAIConfig;
  private readonly handlers: RealtimeEventHandlers;
  private isConnecting = false;
  private isConnected = false;
  private eventQueue: RealtimeClientEvent[] = [];

  constructor(config: OpenAIConfig, handlers: RealtimeEventHandlers = {}) {
    this.config = config;
    this.handlers = handlers;
  }

  /**
   * Connect to the OpenAI Realtime API
   * @param tools - Optional array of tools to configure in the session
   */
  async connect(tools?: RealtimeTool[]): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.config.model)}`;
      
      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      await this.setupWebSocket();
      
      // Configure session with tools if provided
      if (tools && tools.length > 0) {
        await this.updateSession(tools);
      }

      this.isConnected = true;
      this.isConnecting = false;
      this.handlers.onConnect?.();
    } catch (error) {
      this.isConnecting = false;
      this.isConnected = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
      this.handlers.onError?.(new Error(`Failed to connect to Realtime API: ${errorMessage}`));
      throw error;
    }
  }

  /**
   * Disconnect from the Realtime API
   */
  async disconnect(): Promise<void> {
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
  async updateSession(tools: RealtimeTool[]): Promise<void> {
    const session: Partial<RealtimeSession> = {
      ...getDefaultSessionConfig(),
      voice: this.config.voice, // Allow voice override from config
      tools,
    };

    // Combine user instructions with voice-specific guidance
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

    const sessionUpdate: SessionUpdateEvent = {
      type: 'session.update',
      session,
    };

    this.sendEvent(sessionUpdate);
  }

  /**
   * Send a function call result back to the Realtime API
   * @param callId - The function call ID from the original function call event
   * @param result - The result from the MCP tool execution
   */
  sendFunctionResponse(callId: string, result: string): void {
    const response: ConversationItemCreateEvent = {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: result,
      },
    };

    this.sendEvent(response);
  }

  /**
   * Check if the connection is active
   */
  isConnectionActive(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send an event to the Realtime API
   * @param event - The client event to send
   */
  private sendEvent(event: RealtimeClientEvent): void {
    if (!this.isConnectionActive()) {
      // Queue events if not connected
      this.eventQueue.push(event);
      return;
    }

    try {
      this.ws!.send(JSON.stringify(event));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown send error';
      this.handlers.onError?.(new Error(`Failed to send event: ${errorMessage}`));
    }
  }

  /**
   * Set up WebSocket event handlers
   */
  private async setupWebSocket(): Promise<void> {
    if (!this.ws) {
      throw new Error('WebSocket not initialized');
    }

    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not initialized'));
        return;
      }

      this.ws.onopen = () => {
        // Send any queued events
        while (this.eventQueue.length > 0) {
          const event = this.eventQueue.shift();
          if (event) {
            this.sendEvent(event);
          }
        }
        resolve();
      };

      this.ws.onmessage = (event: WebSocket.MessageEvent) => {
        this.handleServerEvent(event.data.toString());
      };

      this.ws.onerror = (error: WebSocket.ErrorEvent) => {
        const errorMessage = 'message' in error ? error.message : 'WebSocket error';
        reject(new Error(errorMessage));
      };

      this.ws.onclose = (event: WebSocket.CloseEvent) => {
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
  private handleServerEvent(data: string): void {
    try {
      const event = JSON.parse(data) as RealtimeServerEvent;

      switch (event.type) {
        case 'session.created':
          this.handlers.onSessionCreated?.();
          break;
          
        case 'session.updated':
          this.handlers.onSessionUpdated?.();
          break;
          
        case 'response.function_call_arguments.done':
          // This is the key event for our proxy - a function call from the AI
          this.handlers.onFunctionCall?.(event);
          break;
          
        case 'error':
          this.handlers.onError?.(new Error(`Realtime API error: ${event.error.message}`));
          break;
          
        default:
          // Log other events for debugging but don't handle them
          // In a full implementation, we might want to handle more events
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      this.handlers.onError?.(new Error(`Failed to parse server event: ${errorMessage}`));
    }
  }
} 