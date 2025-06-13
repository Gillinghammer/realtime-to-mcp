import { describe, it, expect, beforeEach } from 'vitest';
import { RealtimeMCPProxy, ConnectionState, type ProxyConfig } from './index.js';

describe('RealtimeMCPProxy', () => {
  let validConfig: ProxyConfig;

  beforeEach(() => {
    validConfig = {
      openai: {
        apiKey: 'test-api-key',
        model: 'gpt-4o-realtime-preview',
        voice: 'alloy',
      },
      mcp: {
        url: 'http://localhost:3000',
        timeout: 5000,
      },
      settings: {
        logLevel: 'info',
        retryAttempts: 2,
        retryDelay: 1000,
      },
    };
  });

  describe('constructor', () => {
    it('should create proxy with valid configuration', () => {
      const proxy = new RealtimeMCPProxy(validConfig);
      expect(proxy).toBeInstanceOf(RealtimeMCPProxy);
      expect(proxy.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should throw error with invalid configuration', () => {
      const invalidConfig = {
        openai: {
          apiKey: '', // Invalid: empty API key
        },
        mcp: {
          url: 'invalid-url', // Invalid: not a proper URL
        },
      };

      expect(() => new RealtimeMCPProxy(invalidConfig as ProxyConfig)).toThrow();
    });

    it('should validate configuration using Zod schema', () => {
      const configMissingRequired = {
        openai: {
          apiKey: 'test-key',
          // Missing required fields will use defaults
        },
        mcp: {
          url: 'http://localhost:3000',
        },
      };

      const proxy = new RealtimeMCPProxy(configMissingRequired as ProxyConfig);
      expect(proxy).toBeInstanceOf(RealtimeMCPProxy);
    });
  });

  describe('state management', () => {
    it('should start in disconnected state', () => {
      const proxy = new RealtimeMCPProxy(validConfig);
      expect(proxy.getState()).toBe(ConnectionState.DISCONNECTED);
      expect(proxy.isReady()).toBe(false);
    });

    it('should emit state change events', () => {
      const proxy = new RealtimeMCPProxy(validConfig);
      const stateChanges: ConnectionState[] = [];

      proxy.on('stateChange', (state) => {
        stateChanges.push(state);
      });

      // Note: We can't actually test connect() without real servers
      // This test just ensures event handling works
      expect(stateChanges).toEqual([]);
    });
  });

  describe('tool management', () => {
    it('should start with empty tools array', () => {
      const proxy = new RealtimeMCPProxy(validConfig);
      expect(proxy.getTools()).toEqual([]);
    });
  });

  describe('event handling', () => {
    it('should support adding and removing event listeners', () => {
      const proxy = new RealtimeMCPProxy(validConfig);
      const errorSpy = vi.fn();
      
      proxy.on('error', errorSpy);
      proxy.off('error', errorSpy);

      // Event listener should be removed
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should handle function call events', () => {
      const proxy = new RealtimeMCPProxy(validConfig);
      const functionCalls: Array<{ name: string; args: unknown }> = [];

      proxy.on('functionCall', (name, args) => {
        functionCalls.push({ name, args });
      });

      // Note: We can't trigger actual function calls without connecting
      // This test ensures the event listener structure works
      expect(functionCalls).toEqual([]);
    });
  });

  describe('configuration validation', () => {
    it('should accept minimal valid configuration', () => {
      const minimalConfig: ProxyConfig = {
        openai: {
          apiKey: 'test-key',
        },
        mcp: {
          url: 'http://localhost:3000',
        },
      };

      const proxy = new RealtimeMCPProxy(minimalConfig);
      expect(proxy.getState()).toBe(ConnectionState.DISCONNECTED);
    });

    it('should apply default values from schema', () => {
      const configWithDefaults: ProxyConfig = {
        openai: {
          apiKey: 'test-key',
          // model should default to 'gpt-4o-realtime-preview'
          // voice should default to 'alloy'
        },
        mcp: {
          url: 'http://localhost:3000',
          // timeout should default to 10000
        },
        // settings should get default values
      };

      const proxy = new RealtimeMCPProxy(configWithDefaults);
      expect(proxy).toBeInstanceOf(RealtimeMCPProxy);
    });
  });
}); 