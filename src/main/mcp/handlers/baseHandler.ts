import { Request, Response } from 'express';
import { SseTransportManager } from '../sseTransport.js';

export interface McpRequestContext {
  requestId: string;
  sessionId: string;
  abortController: AbortController;
  startTime: number;
}

export class BaseMcpHandler {
  private static activeContexts: Map<string, McpRequestContext> = new Map();

  /**
   * Creates an execution context with an AbortController wired to the HTTP request lifecycle.
   */
  public static createContext(req: Request, sessionId: string, requestId: string): McpRequestContext {
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
      const prevAbort = sseClient.onAbort;
      sseClient.onAbort = () => {
        if (prevAbort) prevAbort();
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
        BaseMcpHandler.cleanupContext(requestId);
      };
    }

    this.activeContexts.set(requestId, context);
    return context;
  }

  /**
   * Retrieves active context by requestId.
   */
  public static getContext(requestId: string): McpRequestContext | undefined {
    return this.activeContexts.get(requestId);
  }

  /**
   * Cleans up the request context.
   */
  public static cleanupContext(requestId: string): void {
    this.activeContexts.delete(requestId);
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
