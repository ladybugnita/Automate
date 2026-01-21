import React, { createContext, useContext, useRef, useEffect, useState, useCallback } from 'react';

const WebSocketContext = createContext();

export const INSTALLATION_STATUS = {
  NOT_INSTALLED: 'not_installed',
  CHECKING: 'checking',
  INSTALLING: 'installing',
  INSTALLED: 'installed',
  FAILED: 'failed'
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    
    if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
      return `http://${currentHost}:5000`;
    } else {
      return `http://${currentHost}:5000`;
    }
  }
  
  return 'http://localhost:5000';
};

const API_BASE_URL = getApiBaseUrl();
console.log('API Base URL:', API_BASE_URL);

const WebSocketProvider = ({ children }) => {
  const ws = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [commandResponses, setCommandResponses] = useState({});
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [shouldAutoConnect, setShouldAutoConnect] = useState(true);
  const [agentStatus, setAgentStatus] = useState('checking');
  const [username, setUsername] = useState(null);
  
  const [installations, setInstallations] = useState({
    dhcp: { status: INSTALLATION_STATUS.NOT_INSTALLED, progress: 0, message: '' },
    dns: { status: INSTALLATION_STATUS.NOT_INSTALLED, progress: 0, message: '' },
    ad: { status: INSTALLATION_STATUS.NOT_INSTALLED, progress: 0, message: '' },
    wds: { status: INSTALLATION_STATUS.NOT_INSTALLED, progress: 0, message: '' },
    esxi: { status: INSTALLATION_STATUS.NOT_INSTALLED, progress: 0, message: '' }
  });

  const listeners = useRef(new Set());
  const reconnectTimeoutRef = useRef(null);
  const isConnectingRef = useRef(false);
  const messageQueue = useRef([]); 
  const pendingRequests = useRef(new Map()); 
  const requestCounter = useRef(0); 

  const maxReconnectAttempts = 10;

  const checkAgentStatus = useCallback(async (token) => {
    try {
      console.log('Checking agent status via HTTP...');
      const response = await fetch(`${API_BASE_URL}/api/agent-status?token=${token}`);

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

  const getToken = useCallback(() => {
    return localStorage.getItem('token');
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

  const flushMessageQueue = useCallback(() => {
    if (messageQueue.current.length > 0 && ws.current && ws.current.readyState === WebSocket.OPEN) {
      console.log(`Flushing ${messageQueue.current.length} queued messages`);
      
      const queueCopy = [...messageQueue.current];
      messageQueue.current = [];
      
      queueCopy.forEach(item => {
        try {
          ws.current.send(JSON.stringify(item.commandData));
          console.log('Sent queued message:', item.commandData.command);
          
          if (item.resolve || item.reject) {
            const requestId = item.requestId || `${item.commandData.command}_${Date.now()}`;
            pendingRequests.current.set(requestId, {
              command: item.commandData.command,
              resolve: item.resolve,
              reject: item.reject,
              timestamp: Date.now(),
              sentViaQueue: true
            });
          }
        } catch (error) {
          console.error('Error sending queued message:', error);
          messageQueue.current.push(item);
        }
      });
    }
  }, []);

  const updateInstallationStatus = useCallback((service, status, progress = 0, message = '') => {
    setInstallations(prev => ({
      ...prev,
      [service]: {
        ...prev[service],
        status,
        progress,
        message
      }
    }));
  }, []);

  const simulateInstallationProgress = useCallback((service) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      
      if (progress >= 100) {
        progress = 100;
        updateInstallationStatus(service, INSTALLATION_STATUS.INSTALLED, progress, 'Installation completed successfully!');
        clearInterval(interval);
      } else {
        updateInstallationStatus(service, INSTALLATION_STATUS.INSTALLING, progress, `Installing... ${progress}%`);
      }
    }, 2000);

    const intervalId = interval;
    return () => clearInterval(intervalId);
  }, [updateInstallationStatus]);

  const sendCommandAsync = useCallback((command, payload = null, options = {}) => {
    return new Promise((resolve, reject) => {
      const requestId = `${command}_${requestCounter.current++}_${Date.now()}`;
      const timeout = options.timeout || 30000; 
      
      const timeoutId = setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error(`Command timeout: ${command}`));
        }
      }, timeout);

      let finalPayload = payload;
      if (command === 'create_datastore' && payload) {
        finalPayload = {
          esxi_info: payload.esxi_info,
          datastore_name: payload.datastore_name,
          datastore_size: payload.datastore_size || payload.capacity || '50GB' 
        };
        console.log('Modified create_datastore payload:', finalPayload);
      }

      const commandData = {
        command: command,
        ...(finalPayload && { payload: finalPayload })
      };

      console.log(`Sending command: ${command}`, payload ? `with payload: ${JSON.stringify(payload)}` : '');

      pendingRequests.current.set(requestId, {
        command: command,
        resolve: (data) => {
          clearTimeout(timeoutId);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timestamp: Date.now()
      });

      if (isConnected && ws.current && ws.current.readyState === WebSocket.OPEN) {
        try {
          ws.current.send(JSON.stringify(commandData));
          console.log(`Command sent via WebSocket: ${command}`);
        } catch (error) {
          console.error('Error sending via WebSocket:', error);
          pendingRequests.current.delete(requestId);
          clearTimeout(timeoutId);
          
          sendCommandViaHTTP(command, finalPayload)
            .then(httpResult => {
              if (httpResult) {
                resolve({
                  ...httpResult,
                  viaHttp: true
                });
              } else {
                reject(error);
              }
            })
            .catch(httpError => {
              reject(new Error(`WebSocket and HTTP both failed: ${httpError.message}`));
            });
        }
      } else {
        console.log('WebSocket not connected, queuing command');
        messageQueue.current.push({
          commandData,
          requestId,
          resolve: (data) => {
            clearTimeout(timeoutId);
            resolve(data);
          },
          reject: (error) => {
            clearTimeout(timeoutId);
            reject(error);
          }
        });
        
        sendCommandViaHTTP(command, finalPayload)
          .then(httpResult => {
            if (httpResult && httpResult !== 'http-fallback') {
              clearTimeout(timeoutId);
              resolve({
                ...httpResult,
                viaHttp: true
              });
              messageQueue.current = messageQueue.current.filter(item => item.requestId !== requestId);
              pendingRequests.current.delete(requestId);
            }
          })
          .catch(httpError => {
            console.log('HTTP fallback failed, keeping in WebSocket queue');
          });
      }
    });
  }, [isConnected]);

  const sendCommand = useCallback((command, payload = null) => {
    if (!isConnected || !ws.current) {
      console.error('WebSocket not connected, falling back to HTTP');
      sendCommandViaHTTP(command, payload);
      return Date.now().toString();
    }

    let finalPayload = payload;
    if (command === 'create_datastore' && payload) {
      finalPayload = {
        esxi_info: payload.esxi_info,
        datastore_name: payload.datastore_name,
        datastore_size: payload.datastore_size || payload.capacity || '50GB'
      };
    }

    const commandData = {
      command: command
    };

    if (finalPayload) {
      commandData.payload = finalPayload;
    }

    console.log(`Sending command via WebSocket: ${command}`, finalPayload ? `with payload: ${JSON.stringify(finalPayload)}` : '');

    try {
      ws.current.send(JSON.stringify(commandData));
      return Date.now().toString();
    } catch (error) {
      console.error('Error sending command via WebSocket, falling back to HTTP:', error);
      sendCommandViaHTTP(command, finalPayload);
      return Date.now().toString();
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

      const response = await fetch(`${API_BASE_URL}/api/send-command`, {
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
          const responseKey = `${command}_${Date.now()}`;
          const httpResponse = {
            ...result.result,
            timestamp: Date.now(),
            viaHttp: true
          };

          setCommandResponses(prev => ({
            ...prev,
            [responseKey]: httpResponse,
            [command]: httpResponse
          }));

          return httpResponse;
        }

        return 'http-fallback';
      } else {
        console.error('Failed to send command via HTTP:', result.error);
        throw new Error(result.error || 'HTTP command failed');
      }
    } catch (error) {
      console.error('Error sending command via HTTP:', error);
      throw error;
    }
  }, [getUsernameFromToken]);

  const saveEsxiCredentials = useCallback(async (connectionData) => {
    try {
      const token = getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log('Saving ESXi host to database:', {
        ...connectionData,
        password: connectionData.password ? '***' : 'MISSING'
      });

      const response = await fetch(`${API_BASE_URL}/api/esxi/save-esxi-host`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          connection_name: connectionData.connection_name || connectionData.connectionName,
          host_ip: connectionData.host_ip || connectionData.ip,
          username: connectionData.username || 'root',
          password: connectionData.password,
          installation_type: connectionData.installation_type || 'existing',
          status: connectionData.status || 'pending'
        })
      });

      console.log('Save ESXi host response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('ESXi host saved successfully:', {
        success: result.success,
        data: result.data ? {
          id: result.data.id,
          connection_name: result.data.connection_name,
          hasPassword: !!result.data.password
        } : 'No data'
      });
      
      return result;
    } catch (error) {
      console.error('Error saving ESXi credentials:', error);
      throw error;
    }
  }, [getToken]);

  const getSavedEsxiConnections = useCallback(async (includePassword = true) => {
    try {
      const token = getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log('Fetching ESXi hosts from database...');

      const url = `${API_BASE_URL}/api/esxi/get-esxi-connections${includePassword ? '?include_password=true' : ''}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Retrieved ESXi connections:', result.connections ? result.connections.length : 0, 'connections');
      
      const connections = result.connections || []; 
      return connections.map(conn => ({
        id: conn.id?.toString() || `host_${Date.now()}`,
        connection_id: conn.id,
        name: conn.connection_name || `ESXi-${conn.host_ip || conn.ip_address}`,
        connection_name: conn.connection_name,
        ip: conn.host_ip || conn.ip_address,
        host_ip: conn.host_ip || conn.ip_address,
        username: conn.username || 'root',
        password: conn.password || '', 
        status: conn.status || 'pending',
        installation_type: conn.installation_type,
        vms: conn.vms || [],
        datastores: conn.datastores || [],
        host_info: conn.host_info,
        lastSeen: conn.last_seen || conn.updated_at,
        created_at: conn.created_at,
        updated_at: conn.updated_at,
        hasCompleteCredentials: !!(conn.host_ip || conn.ip_address) && !!(conn.username) && !!(conn.password)
      }));
    } catch (error) {
      console.error('Error fetching ESXi connections:', error);
      return [];
    }
  }, [getToken]);

  const getEsxiConnectionWithCredentials = useCallback(async (host_id) => {
    try {
      const token = getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log(`Fetching ESXi host with credentials for ID: ${host_id}`);

      const response = await fetch(`${API_BASE_URL}/api/esxi/get-esxi-host-with-password/${host_id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Retrieved ESXi host with credentials:', {
        id: result.host?.id,
        ip: result.host?.host_ip,
        hasPassword: !!result.host?.password
      });
      
      return result.host; 
    } catch (error) {
      console.error('Error fetching ESXi host with credentials:', error);
      throw error;
    }
  }, [getToken]);

  const getEsxiHostById = useCallback(async (host_id, include_password = false) => {
    try {
      const token = getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log(`Fetching ESXi host by ID: ${host_id}, include_password: ${include_password}`);

      const url = `${API_BASE_URL}/api/esxi/get-esxi-host/${host_id}${include_password ? '?include_password=true' : ''}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.host;
    } catch (error) {
      console.error('Error fetching ESXi host by ID:', error);
      throw error;
    }
  }, [getToken]);

  const updateEsxiConnectionStatus = useCallback(async (host_id, status) => {
    try {
      const token = getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log(`Updating ESXi host status for ID ${host_id} to ${status}`);

      const response = await fetch(`${API_BASE_URL}/api/esxi/update-host-status/${host_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error updating ESXi host status:', error);
      throw error;
    }
  }, [getToken]);

  const deleteEsxiConnection = useCallback(async (host_id) => {
    try {
      const token = getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log(`Deleting ESXi host with ID: ${host_id}`);

      const response = await fetch(`${API_BASE_URL}/api/esxi/delete-esxi-host/${host_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error deleting ESXi host:', error);
      throw error;
    }
  }, [getToken]);

  const markEsxiAsInstalled = useCallback(async (host_id) => {
    try {
      const token = getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log(`Marking ESXi host as installed for ID: ${host_id}`);

      const response = await fetch(`${API_BASE_URL}/api/esxi/mark-host-installed/${host_id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error marking ESXi as installed:', error);
      throw error;
    }
  }, [getToken]);

  const installEsxiWithSavedCredentials = useCallback(async (host_id) => {
    try {
      const token = getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log(`Installing ESXi using saved credentials for host ID: ${host_id}`);

      const host = await getEsxiConnectionWithCredentials(host_id);
      
      if (!host) {
        throw new Error('No saved credentials found for this ESXi host');
      }

      console.log(`Found saved credentials for ${host.host_ip}, sending install command...`);

      await updateEsxiConnectionStatus(host_id, 'installing');

      const installResult = await sendCommandAsync('install_esxi', {
        esxi_info: {
          ip: host.host_ip, 
          username: host.username, 
          password: host.password 
        },
        connection_name: host.connection_name || `ESXi-${host.host_ip}`
      });

      if (installResult && installResult.success !== false) {
        await markEsxiAsInstalled(host_id);
      }

      return {
        ...installResult,
        connection_name: host.connection_name,
        host_ip: host.host_ip 
      };
    } catch (error) {
      console.error('Error installing ESXi with saved credentials:', error);
      await updateEsxiConnectionStatus(host_id, 'failed').catch(() => {});
      throw error;
    }
  }, [sendCommandAsync, updateEsxiConnectionStatus, markEsxiAsInstalled, getEsxiConnectionWithCredentials, getToken]);

  const getEsxiVmDetails = useCallback(async (host_id) => {
    try {
      console.log(`Fetching VM details for ESXi host ID: ${host_id}`);
      
      const token = getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      const host = await getEsxiConnectionWithCredentials(host_id);
      
      if (!host) {
        throw new Error(`No ESXi host found for ID: ${host_id}`);
      }
      
      if (!host.password) {
        throw new Error(`No password found for ESXi host: ${host.host_ip}`);
      }
      
      console.log('Found ESXi host:', {
        host_ip: host.host_ip,
        username: host.username,
        password: '***' 
      });
      
      const vmDetailsResponse = await sendCommandAsync('get_vm_details', {
        esxi_info: {
          ip: host.host_ip, 
          username: host.username, 
          password: host.password
        }
      });
      
      console.log('VM details response received');
      return vmDetailsResponse;
      
    } catch (error) {
      console.error('Error fetching VM details:', error);
      throw error;
    }
  }, [sendCommandAsync, getEsxiConnectionWithCredentials, getToken]);

  const checkServiceInstalled = useCallback(async (service) => {
    console.log(`Checking if ${service} is installed...`);
    
    updateInstallationStatus(service, INSTALLATION_STATUS.CHECKING, 0, 'Checking installation status...');
    
    try {
      let command;
      switch(service) {
        case 'dhcp':
          command = 'check_dhcp_role_installed_windows_ansible';
          break;
        case 'dns':
          command = 'check_dns_role_installed_windows_ansible';
          break;
        case 'ad':
          command = 'check_ad_role_installed_windows_ansible';
          break;
        case 'wds':
          command = 'check_wds_role_installed_windows_ansible';
          break;
        default:
          throw new Error(`Unknown service: ${service}`);
      }

      const result = await sendCommandAsync(command, {
        windows_info: {
          ip: "192.168.2.15",
          username: "Administrator",
          password: "abc123$"
        }
      });

      console.log(`Service ${service} check result:`, result);
      
      let isInstalled = false;
      
      if (typeof result === 'object' && result !== null) {
        if (result.installed !== undefined) {
          isInstalled = result.installed === true || 
                       result.installed === "true" ||
                       result.installed === "installed";
        }
      } else if (typeof result === 'string') {
        const resultLower = result.toLowerCase();
        isInstalled = resultLower.includes('true') || 
                     resultLower.includes('installed') ||
                     (!resultLower.includes('false') && 
                      !resultLower.includes('not installed'));
      }
      
      const newStatus = isInstalled ? INSTALLATION_STATUS.INSTALLED : INSTALLATION_STATUS.NOT_INSTALLED;
      updateInstallationStatus(service, newStatus, isInstalled ? 100 : 0, isInstalled ? 'Installed' : 'Not installed');
      
      return isInstalled;
      
    } catch (error) {
      console.error(`Error checking ${service} installation:`, error);
      updateInstallationStatus(service, INSTALLATION_STATUS.FAILED, 0, error.message);
      return false;
    }
  }, [sendCommandAsync, updateInstallationStatus]);

  const startServiceInstallation = useCallback(async (service) => {
    console.log(`Starting ${service} installation...`);
    
    updateInstallationStatus(service, INSTALLATION_STATUS.INSTALLING, 0, 'Starting installation...');
    
    try {
      let command;
      switch(service) {
        case 'dhcp':
          command = 'install_dhcp_role_windows_ansible';
          break;
        case 'dns':
          command = 'install_dns_role_windows_ansible';
          break;
        case 'ad':
          command = 'install_ad_role_windows_ansible';
          break;
        case 'wds':
          command = 'install_wds_role_windows_ansible';
          break;
        default:
          throw new Error(`Unknown service: ${service}`);
      }

      await sendCommandAsync(command, {
        windows_info: {
          ip: "192.168.2.15",
          username: "Administrator",
          password: "abc123$"
        }
      });

      simulateInstallationProgress(service);
      
    } catch (error) {
      console.error(`Error starting ${service} installation:`, error);
      updateInstallationStatus(service, INSTALLATION_STATUS.FAILED, 0, error.message);
    }
  }, [sendCommandAsync, updateInstallationStatus, simulateInstallationProgress]);

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
      const token = getToken();

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
        
        flushMessageQueue();
      };

      ws.current.onmessage = (event) => {
        console.log('RAW WebSocket message received:', event.data);
        setLastMessage(event.data);

        try {
          const data = JSON.parse(event.data);
          console.log('PARSED WebSocket message:', data);

          if (data.action === 'response') {
            const command = data.command;
            const result = data.result;
            console.log(`Received response for command: ${command}`, result);

            if (command === 'install_esxi') {
              const success = result && (
                (typeof result === 'string' && result.toLowerCase().includes('esxi installation done')) ||
                (typeof result === 'object' && result.success === true)
              );
              
              if (success) {
                updateInstallationStatus(
                  'esxi',
                  INSTALLATION_STATUS.INSTALLED,
                  100,
                  'ESXi installed successfully!'
                );
              } else {
                updateInstallationStatus(
                  'esxi',
                  INSTALLATION_STATUS.FAILED,
                  0,
                  'ESXi installation failed'
                );
              }
            }

            if (command === 'validate_esxi_connection_and_credentials') {
              console.log('ESXi validation response:', result);
            }

            if (command === 'get_vm_details') {
              console.log('VM details response:', result);
            }

            if (command === 'get_datastores' || command === 'create_datastore') {
              console.log('Datastore response:', result);
            }

            const responseWithTimestamp = {
              ...result,
              timestamp: Date.now(),
              rawResponse: data,
              command: command
            };

            const responseKey = `${command}_${Date.now()}`;
            
            setCommandResponses(prev => ({
              ...prev,
              [responseKey]: responseWithTimestamp,
              [command]: responseWithTimestamp
            }));

            const now = Date.now();
            pendingRequests.current.forEach((request, requestId) => {
              if (request.command === command) {
                if (now - request.timestamp < 30000) {
                  if (request.resolve) {
                    request.resolve(responseWithTimestamp);
                  }
                  pendingRequests.current.delete(requestId);
                }
              }
            });

            listeners.current.forEach(listener => {
              try {
                listener({
                  action: 'response',
                  command: command,
                  result: result,
                  responseKey: responseKey,
                  rawResponse: data
                });
              } catch (error) {
                console.error('Error in WebSocket listener:', error);
              }
            });
          }

          if (data.type === 'COMMAND_RESPONSE') {
            const command = data.command;
            const result = data.data || data.result;
            console.log(`Received COMMAND_RESPONSE for command: ${command}`, result);

            const responseWithTimestamp = {
              ...result,
              timestamp: Date.now(),
              rawResponse: data,
              command: command
            };

            const responseKey = `${command}_${Date.now()}`;
            
            setCommandResponses(prev => ({
              ...prev,
              [responseKey]: responseWithTimestamp,
              [command]: responseWithTimestamp
            }));

            const now = Date.now();
            pendingRequests.current.forEach((request, requestId) => {
              if (request.command === command) {
                if (now - request.timestamp < 30000) {
                  if (request.resolve) {
                    request.resolve(responseWithTimestamp);
                  }
                  pendingRequests.current.delete(requestId);
                }
              }
            });

            listeners.current.forEach(listener => {
              try {
                listener({
                  action: 'response',
                  command: command,
                  result: result,
                  responseKey: responseKey,
                  rawResponse: data
                });
              } catch (error) {
                console.error('Error in WebSocket listener:', error);
              }
            });
          }

          if (data.type === 'TOKEN_CONFIRMED') {
            console.log('WebSocket authentication confirmed');
            setIsConnected(true);
            setAgentStatus('connected');
            setUsername(data.username);
          }

          if (data.type === 'INSTALLATION_PROGRESS') {
            const { service, progress, message } = data.data || {};
            if (service) {
              updateInstallationStatus(
                service, 
                INSTALLATION_STATUS.INSTALLING, 
                progress || 0, 
                message || 'Installing...'
              );
            }
            return;
          }

          if (data.type === 'INSTALLATION_COMPLETE') {
            const { service } = data.data || {};
            if (service) {
              updateInstallationStatus(
                service, 
                INSTALLATION_STATUS.INSTALLED, 
                100, 
                'Installation completed successfully!'
              );
            }
            return;
          }

          if (data.type === 'ERROR') {
            console.error('WebSocket error:', data.message);
            const command = data.command || 'unknown';
            const errorKey = `error_${Date.now()}`;
            
            const errorResponse = {
              message: data.message,
              command: command,
              timestamp: Date.now(),
              error: true
            };

            setCommandResponses(prev => ({
              ...prev,
              [errorKey]: errorResponse,
              error: errorResponse
            }));

            pendingRequests.current.forEach((request, requestId) => {
              if (request.command === command) {
                if (request.reject) {
                  request.reject(new Error(data.message));
                }
                pendingRequests.current.delete(requestId);
              }
            });
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
  }, [isValidToken, reconnectAttempts, scheduleReconnect, shouldAutoConnect, flushMessageQueue, updateInstallationStatus, getToken]);

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
    
    pendingRequests.current.forEach((request) => {
      if (request.reject) {
        request.reject(new Error('Connection stopped'));
      }
    });
    pendingRequests.current.clear();
    
    messageQueue.current = [];
  }, []);

  const getCommandResponse = useCallback((commandOrId) => {
    if (commandResponses[commandOrId]) {
      return commandResponses[commandOrId];
    }
    
    const commandResponsesArray = Object.entries(commandResponses);
    const matchingResponses = commandResponsesArray
      .filter(([key, value]) => 
        key.startsWith(`${commandOrId}_`) || 
        (value.command === commandOrId)
      )
      .sort((a, b) => b[1].timestamp - a[1].timestamp); 
    
    return matchingResponses.length > 0 ? matchingResponses[0][1] : null;
  }, [commandResponses]);

  const refreshAgentStatus = useCallback(async () => {
    const token = getToken();
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
  }, [checkAgentStatus, isConnected, connectWebSocket, getToken]);

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
    console.log('Pending requests:', pendingRequests.current.size);
    console.log('Queued messages:', messageQueue.current.length);
    return {
      commandResponses,
      pendingRequests: pendingRequests.current.size,
      queuedMessages: messageQueue.current.length
    };
  }, [commandResponses]);

  const testWebSocketConnection = useCallback(() => {
    const token = getToken();
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
  }, [getToken]);

  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      
      setCommandResponses(prev => {
        const newResponses = {};
        Object.entries(prev).forEach(([key, value]) => {
          if (value.timestamp && now - value.timestamp < 300000) { 
            newResponses[key] = value;
          } else if (!value.timestamp) {
            newResponses[key] = value;
          }
        });
        console.log(`Cleaned responses. Keeping ${Object.keys(newResponses).length} responses`);
        return newResponses;
      });
      
      pendingRequests.current.forEach((request, requestId) => {
        if (now - request.timestamp > 35000) {
          if (request.reject) {
            request.reject(new Error(`Request timeout: ${request.command}`));
          }
          pendingRequests.current.delete(requestId);
        }
      });
      
      messageQueue.current = messageQueue.current.filter(item => {
        const timestampMatch = item.requestId.match(/_(\d+)$/);
        if (timestampMatch) {
          const itemTime = parseInt(timestampMatch[1]);
          return now - itemTime < 60000;
        }
        return true; 
      });
      
    }, 10000);

    return () => clearInterval(cleanupInterval);
  }, []);

  useEffect(() => {
    const token = getToken();

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
      
      pendingRequests.current.forEach((request) => {
        if (request.reject) {
          request.reject(new Error('Component unmounted'));
        }
      });
      pendingRequests.current.clear();
    };
  }, [connectWebSocket, isValidToken, shouldAutoConnect, getToken]);

  const value = {
    sendCommand, 
    sendCommandAsync, 
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
    username,
    messageQueueSize: messageQueue.current.length,
    pendingRequestsCount: pendingRequests.current.size,
    installations,
    INSTALLATION_STATUS,
    checkServiceInstalled,
    startServiceInstallation,
    updateInstallationStatus,
    saveEsxiCredentials,
    getSavedEsxiConnections,
    getEsxiConnectionWithCredentials,
    getEsxiHostById,
    updateEsxiConnectionStatus,
    deleteEsxiConnection,
    markEsxiAsInstalled,
    installEsxiWithSavedCredentials,
    getEsxiVmDetails
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketProvider;