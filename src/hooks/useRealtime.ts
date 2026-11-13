import { useEffect, useRef, useState } from 'react';

interface UseRealtimeOptions {
  role: 'customer' | 'staff' | 'chef' | 'admin';
  sessionId?: number;
  tableId?: number;
  onEvent: (event: string, payload: Record<string, unknown>) => void;
  fallbackPollMs?: number;
  onFallbackPoll?: () => void;
}

export function useRealtime({
  role,
  sessionId,
  tableId,
  onEvent,
  fallbackPollMs = 15000,
  onFallbackPoll,
}: UseRealtimeOptions) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  const onPollRef = useRef(onFallbackPoll);
  onEventRef.current = onEvent;
  onPollRef.current = onFallbackPoll;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closedByUser = false;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws`;
      try {
        ws = new WebSocket(url);
      } catch {
        setConnected(false);
        return;
      }

      ws.onopen = () => {
        setConnected(true);
        ws?.send(
          JSON.stringify({
            type: 'subscribe',
            role,
            sessionId,
            tableId,
          })
        );
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { event?: string; payload?: Record<string, unknown> };
          if (msg.event && msg.event !== 'ws:connected' && msg.event !== 'ws:subscribed') {
            onEventRef.current(msg.event, msg.payload || {});
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closedByUser) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        setConnected(false);
      };
    };

    connect();

    // Reliable polling fallback ensures state sync even if proxy drops WS
    const pollInterval = window.setInterval(() => {
      if (onPollRef.current) {
        onPollRef.current();
      }
    }, fallbackPollMs);

    return () => {
      closedByUser = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearInterval(pollInterval);
      ws?.close();
    };
  }, [role, sessionId, tableId, fallbackPollMs]);

  return { connected };
}
