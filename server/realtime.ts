import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { db } from './db.ts';

interface ClientMeta {
  ws: WebSocket;
  role: string; // 'customer' | 'staff' | 'chef' | 'admin'
  tableId?: number;
  sessionId?: number;
}

const clients = new Set<ClientMeta>();

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const meta: ClientMeta = { ws, role: 'guest' };
    clients.add(meta);

    ws.send(JSON.stringify({ event: 'ws:connected', timestamp: new Date().toISOString() }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          role?: string;
          tableId?: number;
          sessionId?: number;
        };
        if (msg.type === 'subscribe') {
          if (msg.role) meta.role = msg.role;
          if (typeof msg.tableId === 'number') meta.tableId = msg.tableId;
          if (typeof msg.sessionId === 'number') meta.sessionId = msg.sessionId;
          ws.send(JSON.stringify({ event: 'ws:subscribed', role: meta.role, sessionId: meta.sessionId }));
        }
      } catch {
        // ignore malformed frames
      }
    });

    ws.on('close', () => {
      clients.delete(meta);
    });

    ws.on('error', () => {
      clients.delete(meta);
    });
  });
}

export function broadcastEvent(
  event: string,
  payload: Record<string, unknown>,
  options?: { roles?: string[]; sessionId?: number; tableId?: number }
): void {
  const message = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;

    if (!options) {
      client.ws.send(message);
      continue;
    }

    const roleMatch = !options.roles || options.roles.includes(client.role);
    const sessionMatch =
      !options.sessionId ||
      client.role !== 'customer' ||
      client.sessionId === options.sessionId;
    const tableMatch =
      !options.tableId ||
      client.role !== 'customer' ||
      client.tableId === options.tableId;

    if (roleMatch && sessionMatch && tableMatch) {
      client.ws.send(message);
    }
  }
}

export function createNotification(params: {
  targetRole: 'staff' | 'chef' | 'admin' | 'all';
  type: string;
  title: string;
  message: string;
  orderId?: number | null;
  tableId?: number | null;
}): number {
  const res = db
    .prepare(
      'INSERT INTO notifications (target_role, type, title, message, order_id, table_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      params.targetRole,
      params.type,
      params.title,
      params.message,
      params.orderId ?? null,
      params.tableId ?? null
    );

  const notificationId = Number(res.lastInsertRowid);
  const roles = params.targetRole === 'all' ? ['staff', 'chef', 'admin'] : [params.targetRole, 'admin'];

  broadcastEvent(
    'notification:created',
    {
      notification_id: notificationId,
      target_role: params.targetRole,
      type: params.type,
      title: params.title,
      message: params.message,
      order_id: params.orderId ?? null,
      table_id: params.tableId ?? null,
      created_at: new Date().toISOString(),
    },
    { roles }
  );

  return notificationId;
}
