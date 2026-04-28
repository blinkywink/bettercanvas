import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to listen for real-time updates from the server via Server-Sent Events
 * 
 * Options for real-time sync:
 * 1. Selective updates (current) - Update only changed pieces of state (efficient but can miss edge cases)
 * 2. Full reload (recommended) - Reload all data when any change is detected (simple, reliable)
 * 3. Polling - Periodically check for changes (very reliable but uses more resources)
 * 
 * This implementation uses Option 2: when any change is detected, trigger a full reload.
 * 
 * To prevent reloading on the tab that made the change, we use a unique tab ID and
 * the server includes this ID in the broadcast. The tab that made the change ignores it.
 */
export function useEventStream(profileId: string, onUpdate: (type: string, data: any, sourceTabId?: string) => void) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onUpdateRef = useRef(onUpdate);
  
  // Generate a unique ID for this tab (persists across page reloads via sessionStorage)
  const tabIdRef = useRef<string>((() => {
    const stored = sessionStorage.getItem('bct-tab-id');
    if (stored) return stored;
    const newId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('bct-tab-id', newId);
    return newId;
  })());

  // Keep onUpdate ref up to date
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const connect = useCallback(() => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    try {
      // Create EventSource connection
      const eventSource = new EventSource(`/api/events-stream?profile=${profileId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type !== 'connected') {
            // Only process if this change didn't come from this tab
            if (message.sourceTabId !== tabIdRef.current) {
              console.log('SSE update received from another tab:', message.type);
              onUpdateRef.current(message.type, message.data, message.sourceTabId);
            } else {
              console.log('SSE update ignored (from this tab):', message.type);
            }
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        
        // Close the connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        // Reconnect after a short delay (exponential backoff)
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Reconnecting SSE...');
          connect();
        }, 2000);
      };

      eventSource.onopen = () => {
        console.log('SSE connection opened');
        // Clear any pending reconnect on successful connection
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };
    } catch (error) {
      console.error('Failed to create SSE connection:', error);
      // Retry connection after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 2000);
    }
  }, [profileId]);

  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);
}

