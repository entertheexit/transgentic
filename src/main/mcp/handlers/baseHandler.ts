import { Request, Response } from 'express';
import { SseTransportManager } from '../sseTransport.js';

export interface McpRequestContext {
  requestId: string | number;
  sessionId: string;
  abortController: AbortController;
  startTime: number;
  dispose?: () => void;
}

export class BaseMcpHandler {
  private static activeContexts: Map<string, McpRequestContext> = new Map();

  /**
   * Creates an execution context with an AbortController wired to the HTTP request lifecycle.
   */
  private static key(requestId: string | number, sessionId: string): string {
    return JSON.stringify([sessionId, requestId]);
  }

  public static createContext(req: Request, sessionId: string, requestId: string | number): McpRequestContext {
    if (this.getContext(requestId, sessionId)) throw new Error('Request ID is already active in this session.');
    const abortController = new AbortController();

    const context: McpRequestContext = {
      requestId,
      sessionId,
      abortController,
      startTime: Date.now(),
    };

    // In SSE transport, the POST /messages HTTP request completes immediately with 202 Accepted.
    // Therefore, tie the AbortController to the persistent SSE client connection lifecycle (GET /sse),
    // or when client explicit disconnect occurs.
    const sseClient = SseTransportManager.getClient(sessionId);
    if (sseClient) {
      const onAbort = () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
        BaseMcpHandler.cleanupContext(requestId, sessionId);
      };
      sseClient.abortListeners.add(onAbort);
      context.dispose = () => sseClient.abortListeners.delete(onAbort);
    } else {
      // Request-body completion is not cancellation. Only an aborted upload or an
      // unfinished response connection closing should stop Streamable HTTP work.
      const onAborted = () => abortController.abort();
      const response = req.res;
      const onClose = () => { if (!response?.writableEnded) onAborted(); };
      req.once?.('aborted', onAborted);
      response?.once('close', onClose);
      context.dispose = () => {
        req.off?.('aborted', onAborted);
        response?.off('close', onClose);
      };
    }

    this.activeContexts.set(this.key(requestId, sessionId), context);
    return context;
  }

  /**
   * Retrieves active context by requestId.
   */
  public static getContext(requestId: string | number, sessionId: string = ''): McpRequestContext | undefined {
    return this.activeContexts.get(this.key(requestId, sessionId));
  }

  /**
   * Cleans up the request context.
   */
  public static cleanupContext(requestId: string | number, sessionId: string = ''): void {
    const key = this.key(requestId, sessionId);
    this.activeContexts.get(key)?.dispose?.();
    this.activeContexts.delete(key);
  }

  /**
   * Sends a successful response back to the client over SSE or HTTP.
   */
  public static sendSuccess(sessionId: string, id: any, result: any): void {
    const payload = {
      jsonrpc: '2.0',
      id,
      result,
    };
    SseTransportManager.sendMessage(sessionId, payload);
  }

  /**
   * Sends an error response back to the client over SSE.
   */
  public static sendError(sessionId: string, id: any, code: number, message: string, data?: any): void {
    const payload = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data,
      },
    };
    SseTransportManager.sendMessage(sessionId, payload);
  }
}
