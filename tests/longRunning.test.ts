import { describe, it, expect, vi } from 'vitest';
import { SseTransportManager } from '../src/main/mcp/sseTransport.js';
import { TimeoutManager, DEFAULT_TIMEOUT_BUDGETS } from '../src/main/config/timeouts.js';
import { DomObserver } from '../src/main/webviews/domObserver.js';
import { BaseMcpHandler } from '../src/main/mcp/handlers/baseHandler.js';

describe('Long-Running Operations & SSE Transports', () => {
  describe('TimeoutManager', () => {
    it('should allocate mode-specific timeout budgets accurately', () => {
      expect(TimeoutManager.getTimeout('coding')).toBe(300_000); // 5 minutes
      expect(TimeoutManager.getTimeout('video')).toBe(420_000);  // 7 minutes
      expect(TimeoutManager.getTimeout('music')).toBe(420_000);  // 7 minutes
      expect(TimeoutManager.getTimeout('image')).toBe(120_000);  // 2 minutes
      expect(TimeoutManager.getTimeout('general')).toBe(60_000); // 60 seconds
      expect(TimeoutManager.getTimeout('writing')).toBe(60_000); // General route budget
    });

    it('should support provider-specific timeout overrides', () => {
      TimeoutManager.configure({
        providerOverrides: {
          grok: {
            video: 500_000,
          },
        },
      });

      expect(TimeoutManager.getTimeout('video', 'grok')).toBe(500_000);
      expect(TimeoutManager.getTimeout('video', 'gemini')).toBe(420_000);
    });
  });

  describe('SseTransportManager Keep-Alive & Heartbeats', () => {
    it('should register client, send initial discovery event, and emit keep-alive pings', () => {
      const mockWrite = vi.fn();
      const mockSetHeader = vi.fn();
      const mockFlushHeaders = vi.fn();

      const mockRes: any = {
        setHeader: mockSetHeader,
        flushHeaders: mockFlushHeaders,
        write: mockWrite,
        writableEnded: false,
      };

      const client = SseTransportManager.registerClient('session_123', mockRes, undefined, '/messages');
      expect(client.id).toBe('session_123');
      expect(mockSetHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockSetHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('event: endpoint'));

      // Send active ping
      SseTransportManager.sendPing(client);
      expect(mockWrite).toHaveBeenCalledWith(': ping\n\n');

      // Send JSON-RPC message
      SseTransportManager.sendMessage('session_123', { jsonrpc: '2.0', id: '1', result: { ok: true } });
      expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('event: message\ndata: {"jsonrpc":"2.0","id":"1","result":{"ok":true}}'));

      // Cleanup
      SseTransportManager.removeClient('session_123');
      expect(SseTransportManager.getClient('session_123')).toBeUndefined();
    });

    it('ends active streams so a gateway restart cannot wait on SSE clients', () => {
      const makeResponse = () => ({
        setHeader: vi.fn(),
        flushHeaders: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        writableEnded: false,
      });
      const first: any = makeResponse();
      const second: any = makeResponse();
      SseTransportManager.registerClient('restart_one', first);
      SseTransportManager.registerClient('restart_two', second);

      SseTransportManager.closeAll();

      expect(first.end).toHaveBeenCalledOnce();
      expect(second.end).toHaveBeenCalledOnce();
      expect(SseTransportManager.getActiveCount()).toBe(0);
    });
  });

  describe('DomObserver', () => {
    it('should generate inspection script containing stop, thinking, and progress detection', () => {
      const script = DomObserver.getInspectionScript('claude', 'coding');
      expect(script).toContain('data-testid="stop-button"');
      expect(script).toContain('thinking-accordion');
      expect(script).toContain('thought-container');
      expect(script).toContain('isThinking');
      expect(script).toContain('isGenerating');
      expect(script).toContain('isMediaRendering');
      expect(script).toContain('isRateLimited');
    });

    it('should inspect media sources for image and video modes', () => {
      const grokScript = DomObserver.getInspectionScript('grok', 'video');
      expect(grokScript).toContain('video source, video[src]');
      expect(grokScript).toContain('img[src*="grok"]');

      const geminiScript = DomObserver.getInspectionScript('gemini', 'music');
      expect(geminiScript).toContain('audio source, audio[src]');
    });
  });

  describe('BaseMcpHandler Abort Propagation', () => {
    it('should create context and trigger abort signal on SSE client disconnect', () => {
      const mockRes: any = {
        setHeader: vi.fn(),
        flushHeaders: vi.fn(),
        write: vi.fn(),
        writableEnded: false,
      };

      const sessionId = 'session_test_abort';
      SseTransportManager.registerClient(sessionId, mockRes);

      const mockReq: any = { on: vi.fn() };
      const ctx = BaseMcpHandler.createContext(mockReq, sessionId, 'req_999');
      expect(ctx.abortController.signal.aborted).toBe(false);
      expect(BaseMcpHandler.getContext('req_999', sessionId)).toBeDefined();

      // Simulate SSE client disconnect
      SseTransportManager.removeClient(sessionId);
      expect(ctx.abortController.signal.aborted).toBe(true);
      expect(BaseMcpHandler.getContext('req_999', sessionId)).toBeUndefined();
    });
  });
});
