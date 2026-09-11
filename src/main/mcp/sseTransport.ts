import { Response } from 'express';
import { AcceptedTaskMode, ProviderId } from '../../shared/types.js';

export interface SseClientConnection {
  id: string;
  res: Response;
  targetProvider?: ProviderId;
  targetMode?: AcceptedTaskMode;
  connectedAt: number;
  lastActivityAt: number;
  heartbeatTimer: NodeJS.Timeout | null;
  onAbort?: () => void;
  abortListeners: Set<() => void>;
}

export class SseTransportManager {
  private static clients: Map<string, SseClientConnection> = new Map();
  private static readonly HEARTBEAT_INTERVAL_MS = 12_000; // 12 seconds

  /**
   * Registers a new SSE client connection and initializes automatic keep-alive heartbeats.
   */
  public static registerClient(
    sessionId: string,
    res: Response,
    targetProvider?: ProviderId,
    messageEndpoint: string = '/messages',
    onAbort?: () => void,
    authToken?: string,
    targetMode?: AcceptedTaskMode
  ): SseClientConnection {
    // Set standard SSE HTTP headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering (Nginx / Cloudflare)
    res.flushHeaders();

    const client: SseClientConnection = {
      id: sessionId,
      res,
      targetProvider,
      targetMode,
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
      heartbeatTimer: null,
      onAbort,
      abortListeners: new Set(),
    };

    // 1. Send initial MCP endpoint discovery event (preserving auth token, mode & provider for MCP client transport)
    const tokenQuery = authToken ? `&token=${encodeURIComponent(authToken)}` : '';
    const modeQuery = targetMode ? `&mode=${encodeURIComponent(targetMode)}` : '';
    const providerQuery = targetProvider ? `&provider=${encodeURIComponent(targetProvider)}` : '';
    this.sendRaw(client, `event: endpoint\ndata: ${messageEndpoint}?sessionId=${sessionId}${tokenQuery}${modeQuery}${providerQuery}\n\n`);

    // 2. Start active keep-alive heartbeat
    client.heartbeatTimer = setInterval(() => {
      this.sendPing(client);
    }, this.HEARTBEAT_INTERVAL_MS);

    this.clients.set(sessionId, client);
    return client;
  }

  /**
   * Sends an SSE comment/ping frame to prevent socket timeout during long reasoning.
   */
  public static sendPing(client: SseClientConnection): void {
    if (!client.res.writableEnded) {
      try {
        client.res.write(': ping\n\n');
        client.lastActivityAt = Date.now();
      } catch (err) {
        this.removeClient(client.id);
      }
    }
  }

  /**
   * Sends a structured JSON-RPC / MCP event frame to the connected client.
   */
  public static sendEvent(sessionId: string, eventName: string, data: any): boolean {
    const client = this.clients.get(sessionId);
    if (!client || client.res.writableEnded) {
      return false;
    }

    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      client.res.write(`event: ${eventName}\ndata: ${payload}\n\n`);
      client.lastActivityAt = Date.now();
      return true;
    } catch {
      this.removeClient(sessionId);
      return false;
    }
  }

  /**
   * Sends a message event (standard JSON-RPC response) to an active SSE session.
   */
  public static sendMessage(sessionId: string, data: any): boolean {
    return this.sendEvent(sessionId, 'message', data);
  }

  /**
   * Sends raw string chunk to an active connection.
   */
  private static sendRaw(client: SseClientConnection, raw: string): void {
    if (!client.res.writableEnded) {
      try {
        client.res.write(raw);
        client.lastActivityAt = Date.now();
      } catch {
        this.removeClient(client.id);
      }
    }
  }

  /**
   * Retrieves an active client connection by session ID.
   */
  public static getClient(sessionId: string): SseClientConnection | undefined {
    return this.clients.get(sessionId);
  }

  /**
   * Cleans up timers and removes client on disconnect.
   */
  public static removeClient(sessionId: string): void {
    const client = this.clients.get(sessionId);
    if (client) {
      if (client.heartbeatTimer) {
        clearInterval(client.heartbeatTimer);
        client.heartbeatTimer = null;
      }
      if (client.onAbort) {
        try {
          client.onAbort();
        } catch {}
      }
      for (const listener of client.abortListeners) listener();
      client.abortListeners.clear();
      this.clients.delete(sessionId);
    }
  }

  /**
   * Gets total number of active SSE client streams.
   */
  public static getActiveCount(): number {
    return this.clients.size;
  }

  /**
   * Ends every long-lived stream before the HTTP listener is restarted.
   * Node's server.close() otherwise waits indefinitely for SSE clients.
   */
  public static closeAll(): void {
    for (const [sessionId, client] of Array.from(this.clients.entries())) {
      this.removeClient(sessionId);
      if (!client.res.writableEnded) {
        try { client.res.end(); } catch {}
      }
    }
  }
}
