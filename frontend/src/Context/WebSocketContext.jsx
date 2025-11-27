import React, { createContext, useContext, useRef, useEffect, useState, useCallback } from 'react';

const WebSocketContext = createContext();

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

const WebSocketProvider = ({ children }) => {
  const ws = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [commandResponses, setCommandResponses] = useState({});
  const [responseCallbacks, setResponseCallbacks] = useState({});
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [shouldAutoConnect, setShouldAutoConnect] = useState(true);
  const [agentStatus, setAgentStatus] = useState('checking');
  const [username, setUsername] = useState(null);
  const listeners = useRef(new Set());
  const reconnectTimeoutRef = useRef(null);
  const isConnectingRef = useRef(false);

  const maxReconnectAttempts = 10;

  const checkAgentStatus = useCallback(async (token) => {
    try {
      console.log('Checking agent status via HTTP...');
      const response = await fetch(`http://localhost:5000/api/agent-status?token=${token}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Agent status check result:', result);
      return result;
    } catch (error) {
      console.error('Error checking agent status:', error);
      return {
        status: 'error',
        message: 'Failed to check agent status: ' + error.message
      };
    }
  }, []);

  const isValidToken = useCallback((token) => {
    return token && token !== 'undefined' && token !== 'null' && token.length > 10;
  }, []);

  const getUsernameFromToken = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.username;
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (reconnectAttempts < maxReconnectAttempts && shouldAutoConnect) {
      const delay = Math.min(500 * Math.pow(2, reconnectAttempts), 10000);
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);

      reconnectTimeoutRef.current = setTimeout(() => {
        setReconnectAttempts(prev => prev + 1);
        connectWebSocket();
      }, delay);
    } else {
      console.log('Max reconnection attempts reached');
      setIsConnected(false);
    }
  }, [reconnectAttempts, shouldAutoConnect]);

  const connectWebSocket = useCallback(async () => {
    if (isConnectingRef.current) {
      console.log('Connection already in progress, skipping...');
      return;
    }

    if (!shouldAutoConnect) {
      console.log('Auto-connect disabled - skipping connection');
      return;
    }

    try {
      const token = localStorage.getItem('token');

      if (!isValidToken(token)) {
        console.log('No valid token - preventing WebSocket connection');
        setIsConnected(false);
        setAgentStatus('error');
        return;
      }

      if (reconnectAttempts >= maxReconnectAttempts) {
        console.log('Max reconnection attempts reached - stopping');
        setIsConnected(false);
        setAgentStatus('error');
        return;
      }

      console.log('Connecting WebSocket directly...');
      setAgentStatus('connecting');
      isConnectingRef.current = true;

      if (ws.current) {
        if (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING) {
          ws.current.close(1000, 'Reconnecting');
        }
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      const wsUrl = `wss://nsj6fzcr-8081.inc1.devtunnels.ms/socket?token=${encodeURIComponent(token)}`;
      console.log('Connecting to:', wsUrl);

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected successfully');
        setIsConnected(true);
        setAgentStatus('connected');
        setReconnectAttempts(0);
        isConnectingRef.current = false;
      };

      ws.current.onmessage = (event) => {
        console.log('RAW WebSocket message received:', event.data);
        setLastMessage(event.data);

        try {
          const data = JSON.parse(event.data);
          console.log('PARSED WebSocket message:', data);

          if (data.type === 'TOKEN_CONFIRMED') {
            console.log('WebSocket authentication confirmed');
            setIsConnected(true);
            setAgentStatus('connected');
            setUsername(data.username);
          }

          if (data.type === 'COMMAND_RESPONSE') {
            const command = data.command;
            console.log(`Received response for command: ${command}`, data.data);

            const responseWithTimestamp = {
              ...data.data,
              timestamp: Date.now(),
              rawResponse: data
            };

            setCommandResponses(prev => ({
              ...prev,
              [command]: responseWithTimestamp
            }));

            listeners.current.forEach(listener => {
              try {
                listener({
                  action: 'response',
                  command: command,
                  result: data.data
                });
              } catch (error) {
                console.error('Error in WebSocket listener:', error);
              }
            });
          }

          if (data.type === 'ERROR') {
            console.error('WebSocket error:', data.message);
            setCommandResponses(prev => ({
              ...prev,
              error: {
                message: data.message,
                command: data.command,
                timestamp: Date.now()
              }
            }));
          }

        } catch (parseError) {
          console.error('Error parsing WebSocket message:', parseError);
        }
      };

      ws.current.onclose = (event) => {
        console.log(`WebSocket disconnected: ${event.code} - ${event.reason}`);
        setIsConnected(false);
        isConnectingRef.current = false;

        if (event.code === 1000 || event.code === 1001) {
          console.log('Normal closure - not reconnecting');
          setAgentStatus('disconnected');
        } else if (shouldAutoConnect) {
          console.log('Abnormal closure - scheduling reconnect');
          scheduleReconnect();
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
        isConnectingRef.current = false;

        if (shouldAutoConnect) {
          scheduleReconnect();
        }
      };

    } catch (err) {
      console.error('WebSocket connection error:', err);
      isConnectingRef.current = false;
      setAgentStatus('error');
      if (shouldAutoConnect) {
        scheduleReconnect();
      }
    }
  }, [isValidToken, reconnectAttempts, scheduleReconnect, shouldAutoConnect]);

  const sendCommand = useCallback((command, payload = null) => {
    if (!isConnected || !ws.current) {
      console.error('WebSocket not connected, falling back to HTTP');
      return sendCommandViaHTTP(command, payload);
    }

    const commandData = {
      command: command
    };

    if (payload) {
      commandData.payload = payload;
    }

    console.log(`Sending command via WebSocket: ${command}`, payload ? `with payload: ${JSON.stringify(payload)}` : '');

    try {
      ws.current.send(JSON.stringify(commandData));
      return Date.now().toString();
    } catch (error) {
      console.error('Error sending command via WebSocket, falling back to HTTP:', error);
      return sendCommandViaHTTP(command, payload);
    }
  }, [isConnected]);

  const sendCommandViaHTTP = useCallback(async (command, payload = null) => {
    try {
      const username = getUsernameFromToken();
      if (!username) {
        console.error('No username found in token');
        return null;
      }
      console.log(`Sending command via HTTP: ${command} for user: ${username}`);

      const response = await fetch('http://localhost:5000/api/send-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          command: command,
          payload: payload
        })
      });

      console.log(`HTTP Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`HTTP Command response:`, result);

      if (result.success) {
        console.log(`Command sent successfully via HTTP: ${command}`);

        if (result.result) {
          setCommandResponses(prev => ({
            ...prev,
            [command]: {
              ...result.result,
              timestamp: Date.now(),
              viaHttp: true
            }
          }));
        }

        return 'http-fallback';
      } else {
        console.error('Failed to send command via HTTP:', result.error);
        return null;
      }
    } catch (error) {
      console.error('Error sending command via HTTP:', error);
      return null;
    }
  }, [getUsernameFromToken]);

  const startConnection = useCallback(() => {
    console.log('Manual WebSocket connection started');
    setShouldAutoConnect(true);
    setReconnectAttempts(0);
    connectWebSocket();
  }, [connectWebSocket]);

  const stopConnection = useCallback(() => {
    console.log('Manual WebSocket connection stopped');
    setShouldAutoConnect(false);
    setAgentStatus('disconnected');

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
      ws.current.close(1000, 'Manual disconnect');
    }

    setIsConnected(false);
  }, []);

  const getCommandResponse = useCallback((commandOrId) => {
    const response = commandResponses[commandOrId];
    console.log(`Getting response for ${commandOrId}:`, response);
    return response;
  }, [commandResponses]);

  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setCommandResponses(prev => {
        const newResponses = {};
        Object.entries(prev).forEach(([key, value]) => {
          if (value.timestamp && now - value.timestamp < 30000) {
            newResponses[key] = value;
          } else if (!value.timestamp) {
            newResponses[key] = value;
          }
        });
        console.log(`Cleaned responses. Keeping ${Object.keys(newResponses).length} responses`);
        return newResponses;
      });
    }, 10000);

    return () => clearInterval(cleanupInterval);
  }, []);

  const refreshAgentStatus = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setAgentStatus('error');
      return;
    }

    setAgentStatus('checking');
    const status = await checkAgentStatus(token);
    setAgentStatus(status.status || 'error');

    if (status.status === 'connected' && !isConnected) {
      console.log('Agent is connected but WebSocket is not - attempting reconnect...');
      connectWebSocket();
    }

    return status;
  }, [checkAgentStatus, isConnected, connectWebSocket]);

  const addListener = useCallback((listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const reconnect = useCallback(() => {
    console.log('Manual reconnect triggered');
    setReconnectAttempts(0);

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    connectWebSocket();
  }, [connectWebSocket]);

  const debugResponses = useCallback(() => {
    console.log('All stored command responses:', commandResponses);
    return commandResponses;
  }, [commandResponses]);

  const testWebSocketConnection = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('No token found for testing');
      return null;
    }

    console.log('Testing WebSocket connection manually...');
    const testWs = new WebSocket(`wss://nsj6fzcr-8081.inc1.devtunnels.ms/socket?token=${token}`);

    testWs.onopen = () => console.log('TEST: WebSocket connected');
    testWs.onmessage = (event) => console.log('TEST: Received message:', event.data);
    testWs.onclose = (event) => console.log('TEST: WebSocket closed:', event.code, event.reason);
    testWs.onerror = (error) => console.log('TEST: WebSocket error:', error);

    return testWs;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (shouldAutoConnect && isValidToken(token)) {
      console.log('Initializing WebSocket connection...');
      connectWebSocket();
    } else {
      console.log('No valid token or auto-connect disabled - skipping connection');
      setAgentStatus('error');
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close(1000, 'Component unmounted');
      }
    };
  }, [connectWebSocket, isValidToken, shouldAutoConnect]);

  const value = {
    sendCommand,
    lastMessage,
    isConnected,
    addListener,
    reconnect,
    reconnectAttempts,
    maxReconnectAttempts,
    getCommandResponse,
    commandResponses,
    startConnection,
    stopConnection,
    agentStatus,
    refreshAgentStatus,
    checkAgentStatus,
    debugResponses,
    testWebSocketConnection,
    username
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketProvider;