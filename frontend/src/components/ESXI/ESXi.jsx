import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '../../Context/WebSocketContext';
import ESXiValidation from './ESXiValidation';
import './ESXi.css';

const ESXI = () => {
  const { 
    sendCommand, 
    isConnected, 
    addListener, 
    installations, 
    INSTALLATION_STATUS,
    updateInstallationStatus,
    saveEsxiCredentials,
    getSavedEsxiConnections
  } = useWebSocket();
  
  const [esxiInstalled, setEsxiInstalled] = useState(null);
  const [showInstallModal, setShowInstallModal] = useState(true);
  const [showInstallStepsModal, setShowInstallStepsModal] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [connectionDetails, setConnectionDetails] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  const [showDatastoreModal, setShowDatastoreModal] = useState(false);
  const [selectedDatastore, setSelectedDatastore] = useState(null);
  const [datastores, setDatastores] = useState([]);
  const [showCreateDatastoreModal, setShowCreateDatastoreModal] = useState(false);
  const [datastoreFormData, setDatastoreFormData] = useState({
    name: '',
    size: '50GB'
  });
  
  const installFormRef = useRef({
    ip: '',
    username: 'root',
    password: '',
    connectionName: ''
  });
  
  const connectionFormRef = useRef({
    ip: '',
    username: 'root',
    password: '',
    connectionName: ''
  });

  const [validationStep, setValidationStep] = useState('initial');
  const [validationMessage, setValidationMessage] = useState('');

  const [showCreateVMModal, setShowCreateVMModal] = useState(false);
  const [vmFormData, setVmFormData] = useState({
    vm_name: '',
    vm_size: 'small',
    vm_ip: '',
    vm_username: 'root',
    vm_password: '',
    confirm_password: '',
    datastore: ''
  });

  const listenerAdded = useRef(false);
  const installationStarted = useRef(false);
  const [showInstallationProgressModal, setShowInstallationProgressModal] = useState(false);

  const connectionsWithPasswords = useRef({});
  const pendingVMCreations = useRef({});

  const isLoadingConnections = useRef(false);
  const isMounted = useRef(true);

  const installFormStateRef = useRef({
    ip: '',
    username: 'root',
    password: '',
    connectionName: ''
  });

  const connectionFormStateRef = useRef({
    ip: '',
    username: 'root',
    password: '',
    connectionName: ''
  });

  const hasCompleteCredentials = (connection) => {
    if (!connection) return false;
    
    const connectionId = connection.id || connection.connection_id;
    const cachedConnection = connectionsWithPasswords.current[connectionId];
    
    if (cachedConnection && cachedConnection.password && cachedConnection.password.trim() !== '') {
      return true;
    }
    
    const ip = connection.host_ip || connection.ip;
    const username = connection.username || 'root';
    const password = connection.password;
    
    const hasPassword = !!password && password.trim() !== '';
    const looksLikeHash = password && password.length >= 60; 
    
    const hasValidCredentials = !!(ip && username && (hasPassword || looksLikeHash));
    
    return hasValidCredentials;
  };

  const fetchConnectionWithPassword = async (connectionId) => {
    try {
      if (connectionsWithPasswords.current[connectionId]) {
        console.log(`Found connection ${connectionId} in cache`);
        return connectionsWithPasswords.current[connectionId];
      }
      
      console.log(`Fetching connection ${connectionId} from database...`);
      
      const allConnections = await getSavedEsxiConnections();
      
      const connection = allConnections.find(c => 
        String(c.id) === String(connectionId) || 
        String(c.connection_id) === String(connectionId)
      );
      
      if (!connection) {
        console.error(`Connection ${connectionId} not found in database`);
        return null;
      }
      
      const formattedConnection = {
        id: connection.id || connection.connection_id,
        connection_id: connection.id || connection.connection_id,
        connection_name: connection.connection_name || connection.name || `ESXi-${connection.host_ip || connection.ip}`,
        host_ip: connection.host_ip || connection.ip,
        ip: connection.host_ip || connection.ip,
        username: connection.username || 'root',
        password: connection.password || '', 
        vms: connection.vms || [],
        datastores: connection.datastores || [],
        host_info: connection.host_info,
        lastSeen: connection.lastSeen || new Date().toISOString(),
        status: 'connected',
        hasCompleteCredentials: hasCompleteCredentials(connection)
      };
      
      connectionsWithPasswords.current[connectionId] = formattedConnection;
      
      return formattedConnection;
    } catch (error) {
      console.error('Error fetching connection with password:', error);
      return null;
    }
  };

  const handleWebSocketMessage = useCallback((message) => {
    if (!isMounted.current) return;
    
    console.log('ESXI received WebSocket message:', message);
    
    let command, result, error;
    
    if (message.action === 'response') {
      command = message.command;
      result = message.result;
      error = message.error;
    } else if (message.type === 'COMMAND_RESPONSE') {
      command = message.command;
      result = message.result || message.data;
      error = message.error;
    } else {
      console.log('Unknown message format:', message);
      return;
    }
    
    if (!command) {
      console.log('No command found in message:', message);
      return;
    }
    
    console.log(`Processing response for command: ${command}`, { result, error });
    
    if (error) {
      console.log(`Error from backend for command ${command}:`, error);
      setValidationMessage(`Error: ${error}`);
      setValidationStep('initial');
      setLoading(false);
      return;
    }
    
    switch(command) {
      case 'install_esxi':
        console.log('ESXi installation response:', result);
        
        let installationSuccess = false;
        let installationMessage = '';
        
        if (typeof result === 'string') {
          const resultLower = result.toLowerCase();
          installationSuccess = resultLower.includes('esxi installation done') ||
                               resultLower.includes('installation successful');
          installationMessage = result;
        } else if (typeof result === 'object') {
          installationSuccess = result.success === true ||
                               result.message?.toLowerCase().includes('esxi installation done') ||
                               result.result?.toLowerCase().includes('esxi installation done');
          installationMessage = result.message || result.result || 'ESXi installation complete';
        }
        
        if (installationSuccess) {
          console.log('ESXi installation successful!');
          
          updateInstallationStatus('esxi', INSTALLATION_STATUS.INSTALLED, 100, 'ESXi installed successfully');
          
          setShowInstallationProgressModal(false);
          setShowInstallStepsModal(false);
          setEsxiInstalled(true);
          setShowInstallModal(false);
          installationStarted.current = false;
          setLoading(false);
          
          installFormRef.current = {
            ip: '',
            username: 'root',
            password: '',
            connectionName: ''
          };
          installFormStateRef.current = {
            ip: '',
            username: 'root',
            password: '',
            connectionName: ''
          };
          
          setTimeout(() => {
            loadConnections();
          }, 1500);
          
          alert(`ESXi installation successful! ${installationMessage}`);
        } else {
          console.log('ESXi installation failed:', result);
          updateInstallationStatus('esxi', INSTALLATION_STATUS.FAILED, 0, 'Installation failed');
          setShowInstallationProgressModal(false);
          setLoading(false);
          installationStarted.current = false;
          alert(`ESXi installation failed: ${result?.error || result?.message || 'Unknown error'}`);
        }
        break;
        
      case 'validate_esxi_connection_and_credentials':
        console.log('ESXi validation response:', result);
        
        let isValid = false;
        let validationMsg = '';
        
        if (typeof result === 'object') {
          if (result.valid !== undefined) {
            isValid = result.valid === true || result.valid === "true";
          } else if (result.status) {
            isValid = result.status === 'valid' || 
                     result.status === 'connected' ||
                     result.status === 'success';
          }
          
          validationMsg = result.message || 
                         result.result || 
                         JSON.stringify(result);
        } else if (typeof result === 'string') {
          const resultLower = result.toLowerCase();
          isValid = resultLower.includes('valid') || 
                   resultLower.includes('success') || 
                   resultLower.includes('connected') ||
                   resultLower.includes('esxi connection and credentials are valid');
          
          validationMsg = result;
        }
        
        if (isValid) {
          console.log('ESXi validation successful!');
          setValidationMessage('✓ ESXi connection and credentials are valid');
          setValidationStep('complete');
          
          if (showConnectionModal) {
            setTimeout(() => {
              setShowConnectionModal(false);
              setLoading(false);
              
              loadConnections();
            }, 1000);
          } else {
            setTimeout(() => {
              setLoading(false);
            }, 1500);
          }
        } else {
          console.log('ESXi validation failed:', result);
          setValidationMessage('✗ ESXi connection and credentials are not valid');
          setValidationStep('initial');
          setLoading(false);
          
          alert('ESXi connection validation failed. Please check your credentials and try again.');
        }
        break;
        
      case 'get_vm_details':
        console.log('VM details response:', result);
        
        if (result && result.success && result.vms) {
          const hostIp = result.esxi_host || result.host_info?.ip;
          let finalVMs = [...result.vms];
          
          if (hostIp && pendingVMCreations.current[hostIp]) {
            pendingVMCreations.current[hostIp].forEach(pendingVM => {
              const vmExists = finalVMs.some(vm => vm.name === pendingVM.name || vm.id === pendingVM.id);
              if (!vmExists) {
                console.log('Adding pending VM to list:', pendingVM.name);
                finalVMs.push(pendingVM);
              }
            });
          }
          
          setConnections(prev => prev.map(conn => {
            if (conn.ip === hostIp || conn.host_ip === hostIp) {
              const updatedConnection = {
                ...conn,
                vms: finalVMs,
                host_info: result.host_info,
                lastSeen: new Date().toISOString()
              };
              
              if (connectionsWithPasswords.current[conn.id]) {
                connectionsWithPasswords.current[conn.id] = {
                  ...connectionsWithPasswords.current[conn.id],
                  vms: finalVMs,
                  host_info: result.host_info,
                  lastSeen: new Date().toISOString()
                };
              }
              
              return updatedConnection;
            }
            return conn;
          }));
          
          if (connectionDetails && (connectionDetails.ip === hostIp || connectionDetails.host_ip === hostIp)) {
            setConnectionDetails(prev => ({
              ...prev,
              vms: finalVMs,
              host_info: result.host_info,
              lastSeen: new Date().toISOString()
            }));
          }
        } else if (result && !result.success) {
          console.error('Error getting VM details:', result.error);
          alert(`Error getting VM details: ${result.error}`);
        }
        break;
        
      case 'get_datastores':
        console.log('Datastores response:', result);
        
        if (result && result.success) {
          const datastoreList = result.datastores || result.data || [];
          
          setDatastores(datastoreList);
          setLoading(false);

          if (selectedConnection && connectionDetails) {
            const hostIp = connectionDetails.ip || connectionDetails.host_ip;
            if (result.esxi_host === hostIp || result.host_info?.ip === hostIp) {
              setConnectionDetails(prev => ({
                ...prev,
                datastores: datastoreList
              }));
              
              setConnections(prev => prev.map(conn => {
                if (conn.id === selectedConnection) {
                  return { ...conn, datastores: datastoreList };
                }
                return conn;
              }));
            }
          }
        } else {
          setDatastores([]);
          setLoading(false);
        }
        break;
        
      case 'create_datastore':
        console.log('Create datastore response:', result);
        
        if (result && result.success) {
          alert(`Datastore ${result.datastore_name} created successfully!`);
          setShowCreateDatastoreModal(false);
          
          if (selectedConnection) {
            setTimeout(() => {
              loadDatastores(selectedConnection);
            }, 1000);
          }
          
          setDatastoreFormData({
            name: '',
            size: '50GB'
          });
          
          setLoading(false);
        } else if (result && result.error) {
          alert(`Failed to create datastore: ${result.error}`);
          setLoading(false);
        }
        break;
        
      case 'create_vm':
        console.log('Create VM response:', result);
        
        if (result && result.success) {
          alert(`VM ${result.vm_name} created successfully!`);
          
          let hostIp = null;
          if (connectionDetails && connectionDetails.id === selectedConnection) {
            hostIp = connectionDetails.ip || connectionDetails.host_ip;
          } else {
            const conn = connections.find(c => c.id === selectedConnection);
            if (conn) {
              hostIp = conn.ip || conn.host_ip;
            }
          }
          
          const newVM = {
            id: result.vm_id || `vm-${Date.now()}`,
            name: result.vm_name,
            status: 'creating',
            cpu: `${result.config?.cpu || 1} vCPU`,
            memory: `${result.config?.memory || 1024} MB`,
            storage: `${result.config?.disk || 20} GB`,
            ip_address: vmFormData.vm_ip || 'Not assigned',
            os: 'Ubuntu/Linux',
            datastore: result.datastore || vmFormData.datastore,
            uptime: 'Just created',
            vm_size: result.vm_size || vmFormData.vm_size,
            vm_username: vmFormData.vm_username || 'root',
            esxi_host: result.esxi_host || hostIp
          };
          
          if (hostIp) {
            if (!pendingVMCreations.current[hostIp]) {
              pendingVMCreations.current[hostIp] = [];
            }
            pendingVMCreations.current[hostIp].push(newVM);
            
            setTimeout(() => {
              if (pendingVMCreations.current[hostIp]) {
                pendingVMCreations.current[hostIp] = pendingVMCreations.current[hostIp].filter(
                  vm => vm.id !== newVM.id
                );
              }
            }, 300000);
          }
          
          setConnections(prev => prev.map(conn => {
            if (conn.id === selectedConnection) {
              const vmExists = conn.vms?.some(vm => vm.name === newVM.name || vm.id === newVM.id);
              if (!vmExists) {
                const updatedVMs = [...(conn.vms || []), newVM];
                return {
                  ...conn,
                  vms: updatedVMs,
                  lastSeen: new Date().toISOString()
                };
              }
            }
            return conn;
          }));
          
          if (connectionDetails && connectionDetails.id === selectedConnection) {
            const vmExists = connectionDetails.vms?.some(vm => vm.name === newVM.name || vm.id === newVM.id);
            if (!vmExists) {
              const updatedVMs = [...(connectionDetails.vms || []), newVM];
              setConnectionDetails(prev => ({
                ...prev,
                vms: updatedVMs,
                lastSeen: new Date().toISOString()
              }));
            }
          }
          
          if (connectionDetails && connectionDetails.host_info) {
            setConnectionDetails(prev => ({
              ...prev,
              host_info: {
                ...prev.host_info,
                total_vms: (prev.host_info.total_vms || 0) + 1
              }
            }));
          }
          
          if (selectedConnection) {
            setTimeout(() => {
              loadVMDetails(selectedConnection);
            }, 3000);
          }
          
          setShowCreateVMModal(false);
          setSelectedDatastore(null);
          setVmFormData({
            vm_name: '',
            vm_size: 'small',
            vm_ip: '',
            vm_username: 'root',
            vm_password: '',
            confirm_password: '',
            datastore: ''
          });
        } else if (result && result.error) {
          alert(`Failed to create VM: ${result.error}`);
        }
        
        setLoading(false);
        break;
        
      default:
        console.log(`Unhandled command: ${command}`);
    }
    
  }, [updateInstallationStatus, INSTALLATION_STATUS, connectionDetails, selectedConnection]);

  const saveCredentialsToDatabase = useCallback(async (credentials) => {
    try {
      console.log('Saving credentials to database...', {
        ...credentials,
        password: credentials.password ? '***' : 'MISSING'
      });
      
      if (!credentials.ip) {
        throw new Error('IP address is required');
      }
      
      if (!credentials.password) {
        throw new Error('Password is required');
      }
      
      const result = await saveEsxiCredentials({
        connection_name: credentials.connectionName || `ESXi-${credentials.ip}`,
        host_ip: credentials.ip,
        username: credentials.username || 'root',
        password: credentials.password, 
        installation_type: credentials.installation_type || 'new_install',
        status: 'connected'
      });
      
      if (result && result.success && result.data) {
        const connectionId = result.data.id || result.data.connection_id;
        
        connectionsWithPasswords.current[connectionId] = {
          id: connectionId,
          connection_id: connectionId,
          connection_name: result.data.connection_name || `ESXi-${credentials.ip}`,
          host_ip: credentials.ip,
          ip: credentials.ip,
          username: credentials.username || 'root',
          password: credentials.password, 
          vms: result.data.vms || [],
          datastores: result.data.datastores || [],
          host_info: result.data.host_info,
          lastSeen: new Date().toISOString(),
          status: 'connected',
          hasCompleteCredentials: true
        };
        
        setTimeout(() => {
          if (connectionsWithPasswords.current[connectionId]) {
            const cachedPassword = connectionsWithPasswords.current[connectionId].password;
            if (cachedPassword && cachedPassword.length < 60) {
              connectionsWithPasswords.current[connectionId].password = '';
            }
          }
        }, 5000);
      }
      
      return result;
      
    } catch (error) {
      console.error('Error saving credentials to database:', error);
      throw error;
    }
  }, [saveEsxiCredentials]);

  useEffect(() => {
    if (!listenerAdded.current) {
      console.log('ESXI Component Mounted - Setting up WebSocket listener');
      const removeListener = addListener(handleWebSocketMessage);
      listenerAdded.current = true;
      
      return () => {
        if (removeListener) removeListener();
        listenerAdded.current = false;
      };
    }
  }, [addListener, handleWebSocketMessage]);

  useEffect(() => {
    if (esxiInstalled === true && !isLoadingConnections.current) {
      console.log('ESXi installed, loading connections...');
      loadConnections();
    }
  }, [esxiInstalled]);

  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      connectionsWithPasswords.current = {};
      pendingVMCreations.current = {};
      isLoadingConnections.current = false;
    };
  }, []);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* CRITICAL FIX: Ensure input stability */
      .form-control, .form-input-stable {
        background: white !important;
        border: 2px solid #d1d5db !important;
        border-radius: 8px !important;
        padding: 12px 16px !important;
        font-size: 14px !important;
        width: 100% !important;
        box-sizing: border-box !important;
        transition: border-color 0.2s ease !important;
        outline: none !important;
        position: relative !important;
        z-index: 1 !important;
        color: #1f2937 !important;
      }
      
      .form-control:focus, .form-input-stable:focus {
        border-color: #166534 !important;
        box-shadow: 0 0 0 3px rgba(22, 101, 52, 0.1) !important;
        outline: none !important;
      }
      
      /* Ensure cursor doesn't disappear */
      input, textarea, select {
        caret-color: #166534 !important;
      }
      
      /* Fix for Chrome autofill */
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus,
      input:-webkit-autofill:active {
        -webkit-box-shadow: 0 0 0 30px white inset !important;
        box-shadow: 0 0 0 30px white inset !important;
        -webkit-text-fill-color: #1f2937 !important;
        transition: background-color 5000s ease-in-out 0s !important;
      }
    `;
    
    const existingStyle = document.getElementById('esxi-input-fix-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    style.id = 'esxi-input-fix-styles';
    document.head.appendChild(style);
    
    return () => {
      if (style.parentNode) {
        document.head.removeChild(style);
      }
    };
  }, []);

  const loadConnections = async () => {
    if (isLoadingConnections.current) {
      console.log('Connections already loading, skipping...');
      return;
    }
    
    try {
      console.log('Loading ESXi hosts from database...');
      isLoadingConnections.current = true;
      setLoading(true);
      
      connectionsWithPasswords.current = {};
      
      const dbConnections = await getSavedEsxiConnections();
      
      if (!dbConnections || dbConnections.length === 0) {
        console.log('No connections found in database');
        setConnections([]);
        setSelectedConnection(null);
        setConnectionDetails(null);
        setLoading(false);
        isLoadingConnections.current = false;
        return;
      }
      
      const enrichedConnections = [];
      
      for (const dbConn of dbConnections) {
        const connectionId = dbConn.id || dbConn.connection_id;
        const ip = dbConn.host_ip || dbConn.ip;
        const name = dbConn.connection_name || dbConn.name || `ESXi-${ip}`;
        const password = dbConn.password || '';
        const hasPassword = password.trim() !== '';
        
        if (!ip) {
          console.warn(`Skipping connection ${connectionId}: No IP address`);
          continue;
        }
        
        const displayConnection = {
          id: connectionId,
          name: name,
          ip: ip,
          host_ip: ip,
          username: dbConn.username || 'root',
          vms: dbConn.vms || [],
          datastores: dbConn.datastores || [],
          host_info: dbConn.host_info,
          lastSeen: dbConn.lastSeen || new Date().toISOString(),
          status: 'connected',
          hasCompleteCredentials: hasCompleteCredentials(dbConn),
          needsPassword: !hasPassword
        };
        
        enrichedConnections.push(displayConnection);
        
        connectionsWithPasswords.current[connectionId] = {
          id: connectionId,
          connection_id: connectionId,
          connection_name: name,
          host_ip: ip,
          ip: ip,
          username: dbConn.username || 'root',
          password: password, 
          vms: dbConn.vms || [],
          datastores: dbConn.datastores || [],
          host_info: dbConn.host_info,
          lastSeen: dbConn.lastSeen || new Date().toISOString(),
          status: 'connected',
          hasCompleteCredentials: hasCompleteCredentials(dbConn)
        };
      }
      
      setConnections(enrichedConnections);
      
      if (enrichedConnections.length > 0) {
        const connectionWithCredentials = enrichedConnections.find(c => c.hasCompleteCredentials);
        
        if (connectionWithCredentials) {
          console.log(`Selecting connection ${connectionWithCredentials.id} with complete credentials`);
          setSelectedConnection(connectionWithCredentials.id);
          
          setTimeout(() => {
            selectConnection(connectionWithCredentials.id);
          }, 100);
        } else {
          const firstConnection = enrichedConnections[0];
          setSelectedConnection(firstConnection.id);
          setConnectionDetails(firstConnection);
        }
      }
      
      setLoading(false);
      isLoadingConnections.current = false;
      
    } catch (error) {
      console.error('Error loading connections:', error);
      setLoading(false);
      isLoadingConnections.current = false;
    }
  };

  const selectConnection = async (connectionId) => {
    console.log('Selecting connection:', connectionId);
    
    setSelectedConnection(connectionId);
    
    const connectionInList = connections.find(c => c.id === connectionId);
    
    if (!connectionInList) {
      console.error('Connection not found in connections list for ID:', connectionId);
      setConnectionDetails(null);
      return;
    }

    setConnectionDetails(connectionInList);

    if (!connectionInList.hasCompleteCredentials) {
      console.warn(`Connection ${connectionId} has incomplete credentials, skipping VM details load`);
      
      try {
        const connectionWithPassword = await fetchConnectionWithPassword(connectionId);
        
        if (connectionWithPassword && connectionWithPassword.hasCompleteCredentials) {
          console.log('Found complete credentials in database, updating connection...');
          
          const updatedConnection = {
            ...connectionInList,
            hasCompleteCredentials: true,
            needsPassword: false
          };
          
          setConnections(prev => prev.map(c => 
            c.id === connectionId ? updatedConnection : c
          ));
          
          setConnectionDetails(updatedConnection);
          
          loadVMDetails(connectionId);
        } else {
          console.warn(`Still missing credentials for connection ${connectionId}`);
          return;
        }
        
      } catch (error) {
        console.error('Error fetching connection credentials:', error);
        return;
      }
    } else {
      console.log('Connection has complete credentials, loading VM details...');
      loadVMDetails(connectionId);
    }
  };

  const loadVMDetails = async (host_id) => {
    try {
      console.log('Loading VM details for host ID:', host_id);
      
      let connectionWithPassword = connectionsWithPasswords.current[host_id];
      
      if (!connectionWithPassword) {
        console.log('Connection not in cache, fetching from database...');
        connectionWithPassword = await fetchConnectionWithPassword(host_id);
      }
      
      if (!connectionWithPassword) {
        console.error('Connection not found for ID:', host_id);
        return;
      }
      
      if (!connectionWithPassword.hasCompleteCredentials) {
        console.error('Incomplete credentials for connection:', {
          id: connectionWithPassword.id,
          ip: connectionWithPassword.host_ip || connectionWithPassword.ip,
          username: connectionWithPassword.username,
          hasPassword: !!connectionWithPassword.password
        });
        
        setConnections(prev => prev.map(c => 
          c.id === host_id ? { ...c, needsPassword: true, hasCompleteCredentials: false } : c
        ));
        
        setConnectionDetails(prev => prev ? {
          ...prev,
          needsPassword: true,
          hasCompleteCredentials: false
        } : prev);
        
        return;
      }
      
      const ip = connectionWithPassword.host_ip || connectionWithPassword.ip;
      const username = connectionWithPassword.username || 'root';
      const password = connectionWithPassword.password || '';
      
      sendCommand('get_vm_details', {
        esxi_info: {
          ip: ip,
          username: username,
          password: password 
        }
      });
      
    } catch (error) {
      console.error('Error loading VM details:', error);
    }
  };

  const loadDatastores = async (connectionId) => {
    try {
      console.log('Loading datastores for connection:', connectionId);
      setLoading(true);
      
      let connectionWithPassword = connectionsWithPasswords.current[connectionId];
      
      if (!connectionWithPassword) {
        connectionWithPassword = await fetchConnectionWithPassword(connectionId);
      }
      
      if (!connectionWithPassword) {
        throw new Error('Connection not found in database');
      }
      
      if (!connectionWithPassword.hasCompleteCredentials) {
        throw new Error('Missing credentials for connection. Please check connection details or re-add the connection.');
      }
      
      const ip = connectionWithPassword.host_ip || connectionWithPassword.ip;
      const username = connectionWithPassword.username || 'root';
      const password = connectionWithPassword.password || '';
      
      sendCommand('get_datastores', {
        esxi_info: {
          ip: ip,
          username: username,
          password: password
        }
      });
      
    } catch (error) {
      console.error('Error loading datastores:', error);
      setLoading(false);
      alert('Error loading datastores: ' + error.message);
    }
  };

  const createDatastore = async () => {
    if (!datastoreFormData.name) {
      alert('Please enter datastore name');
      return;
    }
    
    if (!selectedConnection) {
      alert('No connection selected');
      return;
    }
    
    setLoading(true);
    
    try {
      let connectionWithPassword = connectionsWithPasswords.current[selectedConnection];
      
      if (!connectionWithPassword) {
        connectionWithPassword = await fetchConnectionWithPassword(selectedConnection);
      }
      
      if (!connectionWithPassword) {
        throw new Error('Connection not found in database');
      }
      
      if (!connectionWithPassword.hasCompleteCredentials) {
        throw new Error('Missing credentials for connection. Please check connection details or re-add the connection.');
      }
      
      const ip = connectionWithPassword.host_ip || connectionWithPassword.ip;
      const username = connectionWithPassword.username || 'root';
      const password = connectionWithPassword.password || '';
      
      const payload = {
        esxi_info: {
          ip: ip,
          username: username,
          password: password
        },
        datastore_name: datastoreFormData.name,
        datastore_size: datastoreFormData.size
      };
      
      sendCommand('create_datastore', payload);
      
    } catch (error) {
      console.error('Error creating datastore:', error);
      setLoading(false);
      alert('Error creating datastore: ' + error.message);
    }
  };

  const createVM = async () => {
    if (!vmFormData.vm_name) {
      alert('Please enter VM name');
      return;
    }
    
    if (vmFormData.vm_password !== vmFormData.confirm_password) {
      alert('Passwords do not match');
      return;
    }
    
    if (!vmFormData.datastore) {
      alert('Please select a datastore');
      return;
    }
    
    if (!selectedConnection) {
      alert('No connection selected');
      return;
    }
    
    setLoading(true);
    
    try {
      let connectionWithPassword = connectionsWithPasswords.current[selectedConnection];
      
      if (!connectionWithPassword) {
        console.log('Connection not in cache, fetching from database...');
        connectionWithPassword = await fetchConnectionWithPassword(selectedConnection);
      }
      
      if (!connectionWithPassword) {
        throw new Error('Connection not found in database');
      }
      
      if (!connectionWithPassword.hasCompleteCredentials) {
        throw new Error('Missing credentials for connection. Please check connection details or re-add the connection.');
      }
      
      const ip = connectionWithPassword.host_ip || connectionWithPassword.ip;
      const username = connectionWithPassword.username || 'root';
      const password = connectionWithPassword.password || '';
      
      const payload = {
        esxi_info: {
          ip: ip,
          username: username,
          password: password
        },
        vm_config: {
          vm_name: vmFormData.vm_name,
          vm_size: vmFormData.vm_size,
          vm_ip: vmFormData.vm_ip,
          vm_username: vmFormData.vm_username,
          vm_password: vmFormData.vm_password,
          datastore: vmFormData.datastore
        }
      };
      
      sendCommand('create_vm', payload);
      
    } catch (error) {
      console.error('Error creating VM:', error);
      setLoading(false);
      alert('Error creating VM: ' + error.message);
    }
  };

  const fixIncompleteConnection = async (connectionId) => {
    const connection = connections.find(c => c.id === connectionId);
    if (!connection) return;
    
    try {
      console.log(`Attempting to fix connection ${connectionId}...`);
      
      const connectionWithPassword = await fetchConnectionWithPassword(connectionId);
      
      if (connectionWithPassword && connectionWithPassword.password) {
        console.log(`Found password for connection ${connectionId} in database`);
        
        const updatedConnection = {
          ...connection,
          hasCompleteCredentials: true,
          needsPassword: false
        };
        
        setConnections(prev => prev.map(c => 
          c.id === connectionId ? updatedConnection : c
        ));
        
        if (selectedConnection === connectionId) {
          setConnectionDetails(updatedConnection);
        }
        
        connectionsWithPasswords.current[connectionId] = connectionWithPassword;
        
        await loadVMDetails(connectionId);
        
        return; 
      }
      
      console.log(`No password found for connection ${connectionId} in database`);
      
      connectionFormRef.current = {
        ip: connection.ip,
        username: connection.username || 'root',
        password: '',
        connectionName: connection.name
      };
      
      connectionFormStateRef.current = {
        ip: connection.ip,
        username: connection.username || 'root',
        password: '',
        connectionName: connection.name
      };
      
      setShowConnectionModal(true);
      
    } catch (error) {
      console.error('Error fixing connection:', error);
      
      alert(`Connection "${connection.name}" (${connection.ip}) is missing password. Please re-enter the credentials.`);
      
      connectionFormRef.current = {
        ip: connection.ip,
        username: connection.username || 'root',
        password: '',
        connectionName: connection.name
      };
      
      connectionFormStateRef.current = {
        ip: connection.ip,
        username: connection.username || 'root',
        password: '',
        connectionName: connection.name
      };
      
      setShowConnectionModal(true);
    }
  };

  const refreshConnectionsFromDatabase = async () => {
    try {
      console.log('Refreshing connections from database...');
      setLoading(true);
      
      await loadConnections();
      
      setLoading(false);
      
    } catch (error) {
      console.error('Error refreshing connections from database:', error);
      setLoading(false);
      alert('Error refreshing connections: ' + error.message);
    }
  };

  const handleCreateVMBtnClick = async () => {
    if (!selectedConnection) {
      alert('Please select an ESXi connection first');
      return;
    }
    
    await loadDatastores(selectedConnection);
    
    setShowDatastoreModal(true);
  };

  const handleDatastoreSelect = (datastore) => {
    console.log('Selected datastore:', datastore);
    setSelectedDatastore(datastore);
    setShowDatastoreModal(false);
    
    setVmFormData(prev => ({
      ...prev,
      datastore: datastore.name
    }));
    
    setShowCreateVMModal(true);
  };

  const handleCreateDatastoreClick = () => {
    setShowDatastoreModal(false);
    setShowCreateDatastoreModal(true);
  };

  const handleDatastoreFormChange = useCallback((e) => {
    const { id, value } = e.target;
    setDatastoreFormData(prev => ({ ...prev, [id]: value }));
  }, []);

  const handleVmFormChange = useCallback((e) => {
    const { id, value } = e.target;
    setVmFormData(prev => ({ ...prev, [id]: value }));
  }, []);

  const handleInstallClick = () => {
    console.log('Starting ESXi installation flow...');
    setShowInstallModal(false);
    setShowInstallStepsModal(true);
  };

  const handleAlreadyHaveClick = () => {
    console.log('Adding existing ESXi connection...');
    setShowInstallModal(false);
    setShowConnectionModal(true);
    setValidationStep('initial');
    setValidationMessage('');
  };

  const handleInstallFormChange = (e) => {
    const { name, value } = e.target;
    installFormRef.current[name] = value;
    installFormStateRef.current[name] = value;
  };

  const handleConnectionFormChange = (e) => {
    const { id, value } = e.target;
    const fieldName = id === 'install-ip' || id === 'ip' ? 'ip' : 
                     id === 'install-username' || id === 'username' ? 'username' :
                     id === 'install-password' || id === 'password' ? 'password' :
                     id === 'install-connectionName' || id === 'connectionName' ? 'connectionName' : id;
    
    connectionFormRef.current[fieldName] = value;
    connectionFormStateRef.current[fieldName] = value;
  };

  const beginInstallation = async () => {
    const formData = installFormRef.current;
    
    if (!formData.ip || !formData.password) {
      alert('Please enter IP address and password');
      return;
    }

    console.log('Beginning ESXi installation...');
    
    setLoading(true);
    installationStarted.current = true;
    
    try {
      console.log('Checking for existing connections with same IP...');
      try {
        const existingConnections = await getSavedEsxiConnections();
        
        if (existingConnections && Array.isArray(existingConnections)) {
          const duplicateConnection = existingConnections.find(
            conn => conn.host_ip === formData.ip || conn.ip === formData.ip
          );
          
          if (duplicateConnection) {
            setLoading(false);
            setShowInstallationProgressModal(false);
            installationStarted.current = false;
            alert(`This IP address (${formData.ip}) is already added for your account. Please use a different IP or manage existing connection.`);
            return;
          }
        }
      } catch (checkError) {
        console.warn('Could not check existing connections:', checkError);
      }

      console.log('Saving credentials to database...');
      const saveResult = await saveCredentialsToDatabase({
        ...formData,
        installation_type: 'new_install'
      });
      
      if (!saveResult || !saveResult.success) {
        throw new Error('Failed to save credentials to database');
      }
      
      setShowInstallationProgressModal(true);
      setShowInstallStepsModal(false);
      
      updateInstallationStatus('esxi', INSTALLATION_STATUS.INSTALLING, 0, 'Starting ESXi installation...');
      
      sendCommand('install_esxi', {
        esxi_info: {
          ip: formData.ip,
          username: formData.username,
          password: formData.password
        },
        connection_name: formData.connectionName || `ESXi-${formData.ip}`
      });
      
    } catch (error) {
      console.error('Error beginning installation:', error);
      setLoading(false);
      setShowInstallationProgressModal(false);
      installationStarted.current = false;
      alert(`Failed to start installation: ${error.message}`);
    }
  };

  const addConnection = async () => {
    const formData = connectionFormRef.current;
    
    if (!formData.ip || !formData.password) {
      alert('Please enter IP address and password');
      return;
    }

    console.log('Starting ESXi connection validation process...');
    
    setLoading(true);
    setValidationStep('validating');
    setValidationMessage('Validating ESXi connection...');
    
    try {
      console.log('Saving credentials to database...');
      const saveResult = await saveCredentialsToDatabase({
        ip: formData.ip,
        username: formData.username,
        password: formData.password,
        connectionName: formData.connectionName || `ESXi-${formData.ip}`,
        installation_type: 'existing'
      });
      
      if (!saveResult || !saveResult.success) {
        throw new Error('Failed to save credentials to database');
      }
      
      sendCommand('validate_esxi_connection_and_credentials', {
        esxi_info: {
          ip: formData.ip,
          username: formData.username,
          password: formData.password
        }
      });
      
      setTimeout(() => {
        if (validationStep === 'validating') {
          setValidationStep('complete');
          setValidationMessage('✓ Connection validated and saved successfully!');
          
          setShowConnectionModal(false);
          
          const newConnectionId = saveResult.data?.id || Date.now().toString();
          const newConnection = {
            id: newConnectionId,
            name: formData.connectionName || `ESXi-${formData.ip}`,
            ip: formData.ip,
            host_ip: formData.ip,
            username: formData.username,
            vms: [],
            datastores: [],
            lastSeen: new Date().toISOString(),
            status: 'connected',
            hasCompleteCredentials: true,
            needsPassword: false
          };
          
          connectionsWithPasswords.current[newConnectionId] = {
            ...newConnection,
            host_ip: formData.ip,
            connection_name: formData.connectionName || `ESXi-${formData.ip}`,
            password: formData.password
          };
          
          setConnections(prev => [...prev, newConnection]);
          
          setSelectedConnection(newConnectionId);
          setConnectionDetails(newConnection);
          
          setTimeout(() => {
            if (newConnectionId) {
              loadVMDetails(newConnectionId);
            }
          }, 500);
          
          setLoading(false);
        }
      }, 2000);
      
    } catch (error) {
      console.error('Error adding connection:', error);
      setValidationStep('initial');
      setValidationMessage(`✗ Error: ${error.message}`);
      setLoading(false);
    }
  };

  const deleteConnection = async (connectionId, e) => {
    e.stopPropagation();
    
    if (window.confirm('Are you sure you want to delete this connection?')) {
      console.log('Deleting connection:', connectionId);
      
      delete connectionsWithPasswords.current[connectionId];
      
      setConnections(prev => prev.filter(c => c.id !== connectionId));
      
      if (selectedConnection === connectionId) {
        setSelectedConnection(null);
        setConnectionDetails(null);
      }
      
      alert('Connection deleted successfully!');
    }
  };

  const refreshConnection = async (connectionId, e) => {
    e.stopPropagation();
    
    console.log('Refreshing connection:', connectionId);
    
    try {
      setLoading(true);
      await loadVMDetails(connectionId);
      
      setLoading(false);
      alert('Connection refreshed successfully!');
    } catch (error) {
      console.error('Error refreshing connection:', error);
      setLoading(false);
      alert('Error refreshing connection');
    }
  };

  const GreenInstallModal = () => (
    <div className="esxi-install-modal-overlay">
      <div className="green-install-modal">
        <div className="modal-header">
          <div className="modal-icon-container">
            <i className="fas fa-server"></i>
          </div>
          <h3>ESXi Hypervisor Setup</h3>
          <p className="modal-subtitle">Get started with ESXi hypervisor management. You can either install ESXi on this machine or connect to an existing ESXi server.</p>
        </div>
        
        <div className="modal-body">
          <div className="green-alert">
            <div className="alert-title">
              <i className="fas fa-exclamation-triangle"></i>
              <span>IMPORTANT</span>
            </div>
            <p>Installing ESXi will format the target machine and install VMware ESXi hypervisor. Ensure you have backed up all data before proceeding.</p>
          </div>

          <div className="section-separator">
            <span>Choose Your Setup Option</span>
          </div>

          <div className="green-options-grid">
            <div className="green-option-card selected">
              <div className="option-icon">
                <i className="fas fa-download"></i>
              </div>
              <h3>Option 1: Install ESXi</h3>
              <p className="option-description">Install VMware ESXi hypervisor on the local machine. This requires a restart and will format the target machine.</p>
              <div className="option-features">
                <div className="feature-item">
                  <i className="fas fa-check-circle"></i>
                  <span>Complete ESXi installation</span>
                </div>
                <div className="feature-item">
                  <i className="fas fa-check-circle"></i>
                  <span>Automatic configuration</span>
                </div>
                <div className="feature-item">
                  <i className="fas fa-check-circle"></i>
                  <span>Ready-to-use hypervisor</span>
                </div>
              </div>
              <button 
                className="green-btn green-btn-secondary"
                onClick={handleInstallClick}
                disabled={!isConnected || installations.esxi?.status === INSTALLATION_STATUS.INSTALLING || loading}
              >
                {installations.esxi?.status === INSTALLATION_STATUS.INSTALLING || loading ? (
                  <>
                    <div className="green-spinner mini"></div>
                    Installing...
                  </>
                ) : (
                  'Install ESXi'
                )}
              </button>
            </div>

            <div className="green-option-card">
              <div className="option-icon">
                <i className="fas fa-plug"></i>
              </div>
              <h3>Already Have ESXi</h3>
              <p className="option-description">Connect to an existing ESXi server using the connection form above.</p>
              <div className="option-features">
                <div className="feature-item">
                  <i className="fas fa-check-circle"></i>
                  <span>Connect existing ESXi host</span>
                </div>
                <div className="feature-item">
                  <i className="fas fa-check-circle"></i>
                  <span>Manage virtual machines</span>
                </div>
                <div className="feature-item">
                  <i className="fas fa-check-circle"></i>
                  <span>Configure datastores</span>
                </div>
              </div>
              <div className="form-hint">Use the connection details form at the top of this page</div>
              <button 
                className="green-btn green-btn-primary"
                onClick={handleAlreadyHaveClick}
                disabled={!isConnected || loading}
              >
                Connect to ESXi Server
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <div className="websocket-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
            WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
          </div>
          <div className="modal-actions">
            <button 
              className="green-btn green-btn-secondary"
              onClick={handleAlreadyHaveClick}
              disabled={!isConnected || loading}
            >
              Already Have ESXi
            </button>
            <button 
              className="green-btn green-btn-primary"
              onClick={handleInstallClick}
              disabled={!isConnected || installations.esxi?.status === INSTALLATION_STATUS.INSTALLING || loading}
            >
              {installations.esxi?.status === INSTALLATION_STATUS.INSTALLING || loading ? (
                <>
                  <div className="green-spinner mini"></div>
                  Installing...
                </>
              ) : (
                'Install ESXi'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const GreenConnectionModal = () => (
    <div className="esxi-install-modal-overlay">
      <div className="green-install-modal">
        <div className="modal-header">
          <div className="modal-icon-container">
            <i className="fas fa-plug"></i>
          </div>
          <h3>Connect to ESXi Server</h3>
          <p>Enter your ESXi server connection details</p>
        </div>
        
        <div className="modal-body">
          <form id="connectionForm" onSubmit={(e) => { e.preventDefault(); addConnection(); }}>
            <div className="form-group">
              <label htmlFor="ip" className="required">IP Address</label>
              <input
                type="text"
                id="ip"
                name="ip"
                className="form-control form-input-stable"
                placeholder="192.168.1.100"
                defaultValue={connectionFormStateRef.current.ip}
                onChange={handleConnectionFormChange}
                required
              />
              <div className="form-hint">Format: 192.168.1.100</div>
            </div>

            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                className="form-control form-input-stable"
                placeholder="root"
                defaultValue={connectionFormStateRef.current.username}
                onChange={handleConnectionFormChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="required">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                className="form-control form-input-stable"
                placeholder="ESXi password"
                defaultValue={connectionFormStateRef.current.password}
                onChange={handleConnectionFormChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="connectionName">Connection Name (Optional)</label>
              <input
                type="text"
                id="connectionName"
                name="connectionName"
                className="form-control form-input-stable"
                placeholder="ESXi-Server"
                defaultValue={connectionFormStateRef.current.connectionName}
                onChange={handleConnectionFormChange}
              />
            </div>

            <div className="checkbox-group">
              <input
                type="checkbox"
                id="saveCredentials"
                checked={true}
                readOnly
              />
              <label htmlFor="saveCredentials">Save credentials securely</label>
            </div>

            {validationStep !== 'initial' && (
              <div className="connection-status">
                <div className={`status-indicator ${validationMessage.startsWith('✓') ? 'connected' : 'validating'}`}></div>
                <span>{validationMessage}</span>
              </div>
            )}

            <button 
              type="submit" 
              className="green-btn green-btn-primary btn-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="green-spinner mini"></div>
                  Validating & Saving Connection...
                </>
              ) : (
                'Validate & Save Connection'
              )}
            </button>
          </form>
        </div>

        <div className="modal-footer">
          <button 
            className="green-btn green-btn-secondary"
            onClick={() => {
              setShowConnectionModal(false);
              setShowInstallModal(true);
            }}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  const GreenInstallStepsModal = () => (
    <div className="esxi-install-modal-overlay">
      <div className="green-install-modal">
        <button 
          className="modal-close-btn" 
          onClick={() => { 
            setShowInstallStepsModal(false); 
            setShowInstallModal(true);
            installFormRef.current = {
              ip: '',
              username: 'root',
              password: '',
              connectionName: ''
            };
            installFormStateRef.current = {
              ip: '',
              username: 'root',
              password: '',
              connectionName: ''
            };
          }}
        >
          <i className="fas fa-times"></i>
        </button>
        
        <div className="modal-header">
          <div className="modal-icon-container">
            <i className="fas fa-download"></i>
          </div>
          <h3>Install ESXi Hypervisor</h3>
          <p>Enter ESXi host credentials for installation</p>
        </div>
        
        <div className="modal-body">
          <div className="step-content">
            <div className="form-group">
              <label htmlFor="install-ip">
                ESXi Host IP Address <span className="required">*</span>
              </label>
              <input
                type="text"
                id="install-ip"
                name="ip"
                className="form-control form-input-stable"
                defaultValue={installFormStateRef.current.ip}
                onChange={handleInstallFormChange}
                placeholder="192.168.1.100"
                required
                disabled={loading}
              />
              <p className="form-hint">IP address of the machine where ESXi will be installed</p>
            </div>
            
            <div className="form-group">
              <label htmlFor="install-username">
                Username <span className="required">*</span>
              </label>
              <input
                type="text"
                id="install-username"
                name="username"
                className="form-control form-input-stable"
                defaultValue={installFormStateRef.current.username}
                onChange={handleInstallFormChange}
                placeholder="root"
                required
                disabled={loading}
              />
              <p className="form-hint">ESXi administrative username (usually "root")</p>
            </div>
            
            <div className="form-group">
              <label htmlFor="install-password">
                Password <span className="required">*</span>
              </label>
              <input
                type="password"
                id="install-password"
                name="password"
                className="form-control form-input-stable"
                defaultValue={installFormStateRef.current.password}
                onChange={handleInstallFormChange}
                placeholder="ESXi password"
                required
                disabled={loading}
              />
              <p className="form-hint">ESXi administrative password</p>
            </div>
            
            <div className="form-group">
              <label htmlFor="install-connectionName">
                Connection Name (Optional)
              </label>
              <input
                type="text"
                id="install-connectionName"
                name="connectionName"
                className="form-control form-input-stable"
                defaultValue={installFormStateRef.current.connectionName}
                onChange={handleInstallFormChange}
                placeholder="My ESXi Server"
                disabled={loading}
              />
              <p className="form-hint">A friendly name for this ESXi connection</p>
            </div>
            
            <div className="green-alert warning">
              <div className="alert-title">
                <i className="fas fa-exclamation-triangle"></i>
                <span>Warning:</span>
              </div>
              <p>Installing ESXi will erase all data on the target machine. Ensure you have backups of important data.</p>
            </div>
            
            <div className="range-summary">
              <h4>Installation Summary</h4>
              <div className="summary-grid">
                <div>
                  <div className="summary-label">Target Host</div>
                  <div className="summary-value">{installFormStateRef.current.ip || 'Not set'}</div>
                </div>
                <div>
                  <div className="summary-label">Username</div>
                  <div className="summary-value">{installFormStateRef.current.username}</div>
                </div>
                <div>
                  <div className="summary-label">Connection Name</div>
                  <div className="summary-value">{installFormStateRef.current.connectionName || `ESXi-${installFormStateRef.current.ip || ''}`}</div>
                </div>
              </div>
              <div className="summary-note">
                Note: Installation may take 15-30 minutes. Do not interrupt the process.
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <div className="modal-actions">
            <button 
              className="green-btn green-btn-secondary" 
              onClick={() => { 
                setShowInstallStepsModal(false); 
                setShowInstallModal(true);
                installFormRef.current = {
                  ip: '',
                  username: 'root',
                  password: '',
                  connectionName: ''
                };
                installFormStateRef.current = {
                  ip: '',
                  username: 'root',
                  password: '',
                  connectionName: ''
                };
              }}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              className="green-btn green-btn-success" 
              onClick={beginInstallation}
              disabled={loading || !installFormStateRef.current.ip || !installFormStateRef.current.password}
            >
              {loading ? (
                <>
                  <div className="green-spinner mini"></div>
                  Starting Installation...
                </>
              ) : (
                <>
                  <i className="fas fa-play"></i>
                  Begin Installation
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderConnectionItem = (connection) => {
    const isSelected = selectedConnection === connection.id;
    const hasWarning = connection.needsPassword || !connection.hasCompleteCredentials;
    
    return (
      <div
        key={connection.id}
        className={`connection-item ${isSelected ? 'active' : ''} ${hasWarning ? 'warning' : ''}`}
        onClick={() => selectConnection(connection.id)}
      >
        <div className="connection-info">
          <div>
            <div className="connection-name">
              {connection.name}
              {hasWarning && (
                <i className="fas fa-exclamation-triangle warning-icon" 
                   title="Connection needs password"
                   style={{ marginLeft: '5px', color: 'var(--warning-color)' }}></i>
              )}
            </div>
            <div className="connection-ip">{connection.ip}</div>
            {connection.vms && connection.vms.length > 0 && (
              <div style={{ fontSize: '10px', color: 'var(--gray-500)', marginTop: '3px' }}>
                <i className="fas fa-tv" style={{ marginRight: '3px' }}></i>
                {connection.vms.length} VM{connection.vms.length !== 1 ? 's' : ''}
              </div>
            )}
            {hasWarning && (
              <div style={{ fontSize: '10px', color: 'var(--warning-color)', marginTop: '3px' }}>
                <i className="fas fa-exclamation-circle" style={{ marginRight: '3px' }}></i>
                Needs password
              </div>
            )}
          </div>
          <div className={`status-dot ${connection.hasCompleteCredentials ? 'active' : 'inactive'}`}></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', gap: '5px' }}>
          {hasWarning && (
            <button 
              className="btn-warning btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                fixIncompleteConnection(connection.id);
              }}
              style={{ padding: '2px 8px', fontSize: '11px' }}
              title="Fix connection"
            >
              <i className="fas fa-wrench"></i>
            </button>
          )}
          <button 
            className="btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              refreshConnection(connection.id, e);
            }}
            style={{ padding: '2px 8px', fontSize: '11px' }}
            title="Refresh VM details"
            disabled={hasWarning}
          >
            <i className="fas fa-sync-alt"></i>
          </button>
          <button 
            className="btn-danger btn-sm"
            onClick={(e) => deleteConnection(connection.id, e)}
            style={{ padding: '2px 8px', fontSize: '11px' }}
            title="Delete connection"
          >
            <i className="fas fa-trash"></i>
          </button>
        </div>
      </div>
    );
  };

  const renderConnectionDetails = () => {
    if (!connectionDetails) return null;
    
    const hasWarning = connectionDetails.needsPassword || !connectionDetails.hasCompleteCredentials;
    
    return (
      <div className="connection-details">
        <div className="connection-header">
          <div>
            <div className="connection-title">
              <h2>{connectionDetails.name || 'ESXi Connection'}</h2>
              <span className={`status-badge ${hasWarning ? 'warning' : 'active'}`}>
                {hasWarning ? 'Needs Password' : 'Connected'}
              </span>
            </div>
            <p className="scope-description">{connectionDetails.ip || 'No IP address'}</p>
            {hasWarning && (
              <div style={{ 
                marginTop: '10px', 
                padding: '8px', 
                background: 'rgba(245, 158, 11, 0.1)', 
                border: '1px solid var(--warning-color)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--warning-color)'
              }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: '5px' }}></i>
                This connection is missing password. Some features may not work.
                <button 
                  className="btn-warning btn-sm"
                  onClick={() => fixIncompleteConnection(connectionDetails.id)}
                  style={{ marginLeft: '10px', padding: '2px 8px' }}
                >
                  <i className="fas fa-wrench"></i> Fix Connection
                </button>
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '5px' }}>
              <i className="fas fa-clock"></i> 
              Last seen: {connectionDetails.lastSeen ? new Date(connectionDetails.lastSeen).toLocaleString() : 'Never'}
            </div>
          </div>
          <div className="connection-actions">
            <button className="btn-secondary">
              <i className="fas fa-edit"></i>
              Edit
            </button>
            <button 
              className="btn-danger" 
              onClick={(e) => deleteConnection(selectedConnection, e)}
            >
              <i className="fas fa-trash"></i>
              Delete
            </button>
          </div>
        </div>
        
        <div className="info-grid">
          <div className="info-card">
            <div className="info-label">Connection ID</div>
            <div className="info-value">{selectedConnection}</div>
          </div>
          <div className="info-card">
            <div className="info-label">IP Address</div>
            <div className="info-value">{connectionDetails?.ip || 'N/A'}</div>
          </div>
          <div className="info-card">
            <div className="info-label">Username</div>
            <div className="info-value">{connectionDetails?.username || 'root'}</div>
          </div>
          <div className="info-card">
            <div className="info-label">Status</div>
            <div className="info-value">
              <span style={{ color: hasWarning ? 'var(--warning-color)' : 'var(--success-color)' }}>
                ● {hasWarning ? 'Needs Password' : 'Connected'}
              </span>
            </div>
          </div>
        </div>
        
        {connectionDetails?.host_info && (
          <div className="info-grid" style={{ marginTop: '20px' }}>
            <div className="info-card">
              <div className="info-label">Hostname</div>
              <div className="info-value">{connectionDetails.host_info.hostname}</div>
            </div>
            <div className="info-card">
              <div className="info-label">ESXi Version</div>
              <div className="info-value">{connectionDetails.host_info.esxi_version}</div>
            </div>
            <div className="info-card">
              <div className="info-label">Total VMs</div>
              <div className="info-value">{connectionDetails.host_info.total_vms}</div>
            </div>
            <div className="info-card">
              <div className="info-label">Running VMs</div>
              <div className="info-value">{connectionDetails.host_info.powered_on_vms}</div>
            </div>
          </div>
        )}
        
        <div className="tabs">
          <button 
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`tab-btn ${activeTab === 'vms' ? 'active' : ''}`}
            onClick={() => setActiveTab('vms')}
            disabled={hasWarning}
          >
            Virtual Machines 
          </button>
          <button 
            className={`tab-btn ${activeTab === 'datastores' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('datastores');
              if (!hasWarning && selectedConnection) {
                loadDatastores(selectedConnection);
              }
            }}
            disabled={hasWarning}
          >
            Datastores
          </button>
          <button 
            className={`tab-btn ${activeTab === 'resources' ? 'active' : ''}`}
            onClick={() => setActiveTab('resources')}
            disabled={hasWarning}
          >
            Resources
          </button>
        </div>
        
        <div className="tab-content">
          {activeTab === 'overview' && (
            <div className="tab-pane active">
              <div className="content-card">
                <div className="card-header">
                  <div className="card-header-content">
                    <h3>ESXi Host Overview</h3>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '5px' }}>
                    Connected to: {connectionDetails?.ip}
                  </div>
                </div>
                <div className="card-body">
                  {loading ? (
                    <div className="loading-state">
                      <div className="spinner"></div>
                      <p>Loading host information...</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '20px' }}>
                      <div style={{ background: 'var(--gray-100)', padding: '15px', borderRadius: '6px' }}>
                        <h4 style={{ marginTop: '0', color: 'var(--gray-700)' }}>Quick Actions</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <button 
                            className="btn-primary" 
                            style={{ width: '100%' }}
                            onClick={handleCreateVMBtnClick}
                            disabled={hasWarning}
                          >
                            <i className="fas fa-plus"></i> Create New VM
                          </button>
                          <button 
                            className="btn-secondary" 
                            style={{ width: '100%' }}
                            onClick={() => {
                              loadVMDetails(connectionDetails.id);
                            }}
                            disabled={hasWarning}
                          >
                            <i className="fas fa-sync-alt"></i> Refresh VM Details
                          </button>
                          <button 
                            className="btn-secondary" 
                            style={{ width: '100%' }}
                            onClick={() => {
                              setActiveTab('datastores');
                              loadDatastores(selectedConnection);
                            }}
                            disabled={hasWarning}
                          >
                            <i className="fas fa-database"></i> Manage Datastores
                          </button>
                        </div>
                      </div>
                      {connectionDetails?.host_info && (
                        <div style={{ background: 'var(--gray-100)', padding: '15px', borderRadius: '6px' }}>
                          <h4 style={{ marginTop: '0', color: 'var(--gray-700)' }}>Host Information</h4>
                          <div style={{ fontSize: '14px', color: 'var(--gray-700)' }}>
                            <p><strong>Version:</strong> {connectionDetails.host_info.esxi_version}</p>
                            <p><strong>Model:</strong> {connectionDetails.host_info.model}</p>
                            <p><strong>Total CPU:</strong> {connectionDetails.host_info.total_cpu}</p>
                            <p><strong>Total Memory:</strong> {connectionDetails.host_info.total_memory}</p>
                            <p><strong>Total Storage:</strong> {connectionDetails.host_info.total_storage}</p>
                            <p><strong>Uptime:</strong> {connectionDetails.host_info.uptime}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'vms' && (
            <div className="tab-pane active">
              <div className="content-card">
                <div className="card-header">
                  <div className="card-header-content">
                    <h3>Virtual Machines</h3>
                    {connectionDetails?.vms && (
                      <span style={{ fontSize: '12px', color: 'var(--gray-600)', marginLeft: '10px' }}>
                        Total: {connectionDetails.vms.length} VM{connectionDetails.vms.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <button 
                    className="btn-primary" 
                    style={{ marginLeft: 'auto' }}
                    onClick={handleCreateVMBtnClick}
                    disabled={hasWarning}
                  >
                    <i className="fas fa-plus"></i> New VM
                  </button>
                </div>
                <div className="card-body">
                  {loading ? (
                    <div className="loading-state">
                      <div className="spinner"></div>
                      <p>Loading virtual machines...</p>
                    </div>
                  ) : connectionDetails?.vms && connectionDetails.vms.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--gray-200)' }}>
                          <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: 'var(--gray-700)' }}>Name</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: 'var(--gray-700)' }}>Status</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: 'var(--gray-700)' }}>CPU</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: 'var(--gray-700)' }}>Memory</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: 'var(--gray-700)' }}>Storage</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: 'var(--gray-700)' }}>Datastore</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: 'var(--gray-700)' }}>OS</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: 'var(--gray-700)' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {connectionDetails.vms.map((vm, index) => (
                          <tr key={index} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                            <td style={{ padding: '12px' }}>{vm.name}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ 
                                color: vm.status === 'poweredOn' ? 'var(--success-color)' : 
                                       vm.status === 'creating' ? 'var(--warning-color)' :
                                       vm.status === 'poweredOff' ? 'var(--error-color)' : 'var(--warning-color)',
                                fontWeight: '500'
                              }}>
                                {vm.status === 'poweredOn' ? '● Running' : 
                                 vm.status === 'creating' ? '● Creating' :
                                 vm.status === 'poweredOff' ? '● Stopped' : '● Suspended'}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>{vm.cpu}</td>
                            <td style={{ padding: '12px' }}>{vm.memory}</td>
                            <td style={{ padding: '12px' }}>{vm.storage}</td>
                            <td style={{ padding: '12px' }}>{vm.datastore || 'N/A'}</td>
                            <td style={{ padding: '12px' }}>{vm.os}</td>
                            <td style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', gap: '5px' }}>
                                <button 
                                  className="btn-secondary btn-sm" 
                                  title="Start VM" 
                                  disabled={hasWarning || vm.status === 'creating'}
                                  style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                                >
                                  <i className="fas fa-play"></i>
                                  <span>Start</span>
                                </button>
                                <button 
                                  className="btn-secondary btn-sm" 
                                  title="Stop VM" 
                                  disabled={hasWarning || vm.status === 'creating'}
                                  style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                                >
                                  <i className="fas fa-stop"></i>
                                  <span>Stop</span>
                                </button>
                                <button 
                                  className="btn-secondary btn-sm" 
                                  title="Configure VM" 
                                  disabled={hasWarning || vm.status === 'creating'}
                                  style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                                >
                                  <i className="fas fa-cog"></i>
                                  <span>Config</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-600)' }}>
                      <i className="fas fa-tv" style={{ fontSize: '48px', color: 'var(--gray-200)', marginBottom: '15px' }}></i>
                      <p>No virtual machines found on this host</p>
                      <button 
                        className="btn-primary" 
                        style={{ marginTop: '15px' }}
                        onClick={handleCreateVMBtnClick}
                        disabled={hasWarning}
                      >
                        <i className="fas fa-plus"></i> Create First VM
                      </button>
                      <button 
                        className="btn-secondary" 
                        style={{ marginTop: '15px', marginLeft: '10px' }}
                        onClick={() => {
                          loadVMDetails(connectionDetails.id);
                        }}
                        disabled={hasWarning}
                      >
                        <i className="fas fa-sync-alt"></i> Refresh
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'datastores' && (
            <div className="tab-pane active">
              <div className="content-card">
                <div className="card-header">
                  <div className="card-header-content">
                    <h3>Datastores</h3>
                    <span style={{ fontSize: '12px', color: 'var(--gray-600)', marginLeft: '10px' }}>
                      Total: {datastores.length} Datastore{datastores.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
                    <button 
                      className="btn-primary" 
                      onClick={() => setShowCreateDatastoreModal(true)}
                      disabled={hasWarning}
                    >
                      <i className="fas fa-plus"></i> Create Datastore
                    </button>
                    <button 
                      className="btn-secondary" 
                      onClick={() => loadDatastores(selectedConnection)}
                      disabled={hasWarning || loading}
                    >
                      <i className="fas fa-sync-alt"></i> Refresh
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  {loading ? (
                    <div className="loading-state">
                      <div className="spinner"></div>
                      <p>Loading datastores...</p>
                    </div>
                  ) : datastores.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                      {datastores.map((datastore, index) => (
                        <div key={index} className="datastore-card" style={{
                          background: 'var(--gray-100)',
                          padding: '20px',
                          borderRadius: '8px',
                          border: '1px solid var(--gray-200)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h4 style={{ margin: '0', color: 'var(--gray-800)' }}>
                              <i className="fas fa-database" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
                              {datastore.name}
                            </h4>
                            <span style={{
                              fontSize: '12px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              background: datastore.status === 'online' || datastore.accessible === true ? 'var(--success-light)' : 'var(--error-light)',
                              color: datastore.status === 'online' || datastore.accessible === true ? 'var(--success-color)' : 'var(--error-color)'
                            }}>
                              {datastore.status || (datastore.accessible ? 'accessible' : 'inaccessible')}
                            </span>
                          </div>
                          <div style={{ fontSize: '14px', color: 'var(--gray-600)' }}>
                            <p><strong>Type:</strong> {datastore.type || 'Unknown'}</p>
                            <p><strong>Capacity:</strong> {datastore.capacity || 'Unknown'}</p>
                            {datastore.free_space && (
                              <p><strong>Free Space:</strong> {datastore.free_space}</p>
                            )}
                            {datastore.url && (
                              <p><strong>Path:</strong> <small>{datastore.url}</small></p>
                            )}
                          </div>
                          <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                            <button 
                              className="btn-primary btn-sm"
                              onClick={() => {
                                setSelectedDatastore(datastore);
                                setVmFormData(prev => ({ ...prev, datastore: datastore.name }));
                                setShowCreateVMModal(true);
                              }}
                              disabled={hasWarning}
                              style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                            >
                              <i className="fas fa-plus"></i>
                              <span>Create VM</span>
                            </button>
                            <button 
                              className="btn-secondary btn-sm" 
                              disabled={hasWarning}
                              style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                            >
                              <i className="fas fa-info-circle"></i>
                              <span>Details</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-600)' }}>
                      <i className="fas fa-database" style={{ fontSize: '48px', color: 'var(--gray-200)', marginBottom: '15px' }}></i>
                      <p>No datastores found on this host</p>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '15px' }}>
                        <button 
                          className="btn-primary" 
                          onClick={() => setShowCreateDatastoreModal(true)}
                          disabled={hasWarning}
                        >
                          <i className="fas fa-plus"></i> Create Datastore
                        </button>
                        <button 
                          className="btn-secondary" 
                          onClick={() => loadDatastores(selectedConnection)}
                          disabled={hasWarning}
                        >
                          <i className="fas fa-sync-alt"></i> Refresh
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'resources' && (
            <div className="tab-pane active">
              <div className="content-card">
                <div className="card-header">
                  <div className="card-header-content">
                    <h3>Resource Utilization</h3>
                  </div>
                </div>
                <div className="card-body">
                  {connectionDetails?.host_info ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                      <div>
                        <h4 style={{ color: 'var(--gray-700)', marginBottom: '15px' }}>Resource Summary</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
                          <div style={{ background: 'var(--gray-100)', padding: '15px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--gray-600)' }}>Total CPU</div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--gray-900)' }}>{connectionDetails.host_info.total_cpu}</div>
                          </div>
                          <div style={{ background: 'var(--gray-100)', padding: '15px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--gray-600)' }}>Total Memory</div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--gray-900)' }}>{connectionDetails.host_info.total_memory}</div>
                          </div>
                          <div style={{ background: 'var(--gray-100)', padding: '15px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--gray-600)' }}>Total Storage</div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--gray-900)' }}>{connectionDetails.host_info.total_storage}</div>
                          </div>
                          <div style={{ background: 'var(--gray-100)', padding: '15px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--gray-600)' }}>Uptime</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--gray-900)' }}>{connectionDetails.host_info.uptime}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-600)' }}>
                      <i className="fas fa-chart-bar" style={{ fontSize: '48px', color: 'var(--gray-200)', marginBottom: '15px' }}></i>
                      <p>No resource information available</p>
                      <button 
                        className="btn-secondary" 
                        style={{ marginTop: '15px' }}
                        onClick={() => {
                          loadVMDetails(connectionDetails.id);
                        }}
                        disabled={hasWarning}
                      >
                        <i className="fas fa-sync-alt"></i> Load Resource Info
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (installations.esxi?.status === INSTALLATION_STATUS.INSTALLING && !showInstallationProgressModal) {
    return (
      <div className="esxi-installation-progress">
        <div className="installation-container">
          <div className="installation-icon">
            <i className="fas fa-download fa-3x"></i>
          </div>
          <h2>Installing ESXi...</h2>
          <div className="progress-section">
            <p className="progress-message">{installations.esxi.message || 'Installing ESXi hypervisor...'}</p>
            <div className="progress-bar-container">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${installations.esxi.progress || 0}%` }}></div>
              </div>
              <div className="progress-text">{installations.esxi.progress || 0}%</div>
            </div>
          </div>
          <div className="installation-info">
            <p><i className="fas fa-info-circle"></i> Installation is in progress</p>
            <p><i className="fas fa-clock"></i> This may take several minutes. Please wait...</p>
          </div>
        </div>
      </div>
    );
  }

  if (showInstallationProgressModal) {
    return (
      <div className="esxi-install-modal-overlay">
        <div className="green-install-modal">
          <div className="modal-content" style={{ maxHeight: 'calc(90vh - 150px)', overflowY: 'auto', paddingTop: '25px' }}>
            <div className="modal-icon-container">
              <i className="fas fa-server"></i>
            </div>
            <h3>ESXi Installation In Progress</h3>
            <p>Your system is ready to install. Please power on the machine. It may take 30 minutes to get installed.</p>
            
            <div className="green-alert warning">
              <div className="alert-title">
                <i className="fas fa-exclamation-triangle"></i>
                <span>Important:</span>
              </div>
              <p>Do not turn off the machine or interrupt the installation process. The system will automatically reboot several times during installation.</p>
            </div>
            
            <div className="connection-info">
              <h4>Installation Details</h4>
              <div className="info-grid">
                <div className="info-card">
                  <div className="info-label">Target IP</div>
                  <div className="info-value">{installFormStateRef.current.ip}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Username</div>
                  <div className="info-value">{installFormStateRef.current.username}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Connection Name</div>
                  <div className="summary-value">{installFormStateRef.current.connectionName || `ESXi-${installFormStateRef.current.ip}`}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Status</div>
                  <div className="info-value">
                    <span className="status-badge active">Installing...</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="installation-info">
              <div className="progress-section">
                <p className="progress-message">
                  <i className="fas fa-info-circle"></i> Waiting for backend response...
                </p>
                <p className="progress-message">
                  <i className="fas fa-clock"></i> This may take several minutes. Please wait...
                </p>
                {loading && (
                  <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <div className="green-spinner"></div>
                    <p>Processing installation...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="modal-footer">
            <div className="modal-actions">
              <button 
                className="green-btn green-btn-secondary"
                onClick={() => {
                  setShowInstallationProgressModal(false);
                  installationStarted.current = false;
                }}
                disabled={loading}
              >
                Cancel Installation
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showInstallModal) {
    return <GreenInstallModal />;
  }

  if (showInstallStepsModal) {
    return <GreenInstallStepsModal />;
  }

  if (showConnectionModal) {
    return (
      <div className="esxi-install-modal-overlay">
        <div className="green-install-modal">
          <button 
            className="modal-close-btn" 
            onClick={() => { 
              setShowConnectionModal(false); 
              setShowInstallModal(true);
            }}
          >
            <i className="fas fa-times"></i>
          </button>
          
          <div className="modal-body">
            <ESXiValidation 
              onSuccess={(newConnection) => {
                console.log('Connection successful:', newConnection);
                
                setShowConnectionModal(false);
                setShowInstallModal(false);
                setEsxiInstalled(true);
                
                const connectionToAdd = {
                  id: newConnection.id || Date.now().toString(),
                  name: newConnection.name || `ESXi-${newConnection.ip}`,
                  ip: newConnection.ip,
                  host_ip: newConnection.ip,
                  username: newConnection.username,
                  status: 'connected',
                  lastSeen: new Date().toISOString(),
                  hasCompleteCredentials: true,
                  needsPassword: false
                };
                
                if (newConnection.password && connectionToAdd.id) {
                  connectionsWithPasswords.current[connectionToAdd.id] = {
                    ...connectionToAdd,
                    host_ip: newConnection.ip,
                    connection_name: newConnection.name || `ESXi-${newConnection.ip}`,
                    password: newConnection.password 
                  };
                }
                
                setConnections(prev => [...prev, connectionToAdd]);
                setSelectedConnection(connectionToAdd.id);
                setConnectionDetails(connectionToAdd);
                
                setTimeout(() => {
                  if (connectionToAdd.id) {
                    loadVMDetails(connectionToAdd.id);
                  }
                }, 1500);
              }}
            />
          </div>
        </div>
      </div>
    ); 
  }

  if (esxiInstalled === true && !showInstallModal && !showInstallStepsModal && !showConnectionModal) {
    return (
      <div className="esxi-container">
        <div className="esxi-layout">
          <div className="esxi-sidebar">
            <div className="sidebar-header">
              <div className="esxi-icon">
                <i className="fas fa-server"></i>
              </div>
              <div>
                <h2>ESXi Management</h2>
                <p>VMware Hypervisor</p>
                <div style={{ fontSize: '11px', color: 'var(--gray-600)', marginTop: '5px' }}>
                  ESXi Ready
                </div>
              </div>
            </div>
            
            <div className="sidebar-section">
              <div className="section-header">
                <div className="section-title">
                  <div className="vmware-dot"></div>
                  <h3>ESXi Connections</h3>
                </div>
                <div className="status-badge active">Active</div>
              </div>
              
              <div className="connections-list">
                {connections.length === 0 ? (
                  <div className="no-connections-message">
                    <i className="fas fa-plug"></i>
                    <p>No ESXi connections</p>
                    <button 
                      className="btn-primary btn-sm"
                      onClick={() => setShowConnectionModal(true)}
                      style={{ marginTop: '10px', padding: '5px 10px', fontSize: '12px' }}
                    >
                      <i className="fas fa-plus"></i> Add Connection
                    </button>
                  </div>
                ) : (
                  connections.map(renderConnectionItem)
                )}
              </div>
              
              <button 
                className="add-connection-btn"
                onClick={() => setShowConnectionModal(true)}
              >
                <i className="fas fa-plus-circle"></i>
                Add ESXi Connection
              </button>
            </div>
            
            <div className="sidebar-section">
              <h3>Statistics</h3>
              <div className="statistics">
                <div className="stat-item">
                  <span className="stat-label">Total Connections</span>
                  <span className="stat-value">{connections.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total VMs</span>
                  <span className="stat-value">
                    {connections.reduce((total, conn) => total + (conn.vms ? conn.vms.length : 0), 0)}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Datastores</span>
                  <span className="stat-value">
                    {connections.reduce((total, conn) => total + (conn.datastores ? conn.datastores.length : 0), 0)}
                  </span>
                </div>
                {connectionDetails?.host_info && (
                  <>
                    <div className="stat-item">
                      <span className="stat-label">Total CPU</span>
                      <span className="stat-value">{connectionDetails.host_info.total_cpu}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Total Memory</span>
                      <span className="stat-value">{connectionDetails.host_info.total_memory}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="esxi-main">
            <div className="top-bar">
              <div>
                <h1>ESXi Management</h1>
                <p className="scope-path">
                  {selectedConnection 
                    ? `ESXi > ${connections.find(c => c.id === selectedConnection)?.name || selectedConnection}` 
                    : 'Select a connection to view details'
                  }
                </p>
                <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '5px' }}>
                  <span>Status: {esxiInstalled ? 'Installed' : 'Not Installed'}</span>
                  {loading && (
                    <span style={{ marginLeft: '15px', color: 'var(--secondary-blue)' }}>
                      <i className="fas fa-spinner fa-spin" style={{ marginRight: '5px' }}></i>
                      Loading...
                    </span>
                  )}
                </div>
              </div>
              <div className="top-bar-actions">
                <button 
                  className="btn-secondary"
                  onClick={refreshConnectionsFromDatabase}
                  disabled={loading}
                >
                  <i className="fas fa-sync-alt"></i>
                  Refresh
                </button>
                <button 
                  className="btn-primary"
                  onClick={() => setShowConnectionModal(true)}
                >
                  <i className="fas fa-plus"></i>
                  Add Connection
                </button>
              </div>
            </div>
            
            <div className="main-content">
              {connections.length === 0 ? (
                <div className="empty-state no-connections">
                  <div className="empty-icon">
                    <i className="fas fa-server"></i>
                  </div>
                  <h2>No ESXi Connections</h2>
                  <p>You haven't added any ESXi connections yet. Add your first connection to start managing virtual machines.</p>
                  <button 
                    className="btn-primary"
                    onClick={() => setShowConnectionModal(true)}
                  >
                    <i className="fas fa-plus"></i>
                    Add First Connection
                  </button>
                </div>
              ) : !selectedConnection ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <i className="fas fa-plug"></i>
                  </div>
                  <h2>No Connection Selected</h2>
                  <p>Select an ESXi connection from the sidebar to view its details.</p>
                </div>
              ) : (
                renderConnectionDetails()
              )}
            </div>
          </div>
        </div>

        {showDatastoreModal && (
          <div className="esxi-install-modal-overlay">
            <div className="green-install-modal" style={{ maxWidth: '500px' }}>
              <button 
                className="modal-close-btn" 
                onClick={() => setShowDatastoreModal(false)}
              >
                <i className="fas fa-times"></i>
              </button>
              
              <div className="modal-header">
                <div className="modal-icon-container">
                  <i className="fas fa-database"></i>
                </div>
                <p>Choose a datastore to create your virtual machine on {connectionDetails?.name || connectionDetails?.ip}</p>
              </div>
              
              <div className="modal-body">
                <div className="step-content">
                  {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      <div className="green-spinner"></div>
                      <p>Loading datastores...</p>
                    </div>
                  ) : datastores.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {datastores.map((datastore, index) => (
                        <div
                          key={index}
                          className="datastore-item"
                          onClick={() => handleDatastoreSelect(datastore)}
                          style={{
                            padding: '15px',
                            border: '1px solid var(--gray-300)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            background: 'var(--white)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <h4 style={{ margin: '0 0 5px 0', color: 'var(--gray-800)' }}>
                                <i className="fas fa-database" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
                                {datastore.name}
                              </h4>
                              <div style={{ fontSize: '14px', color: 'var(--gray-600)' }}>
                                <div>Type: {datastore.type || 'Unknown'}</div>
                                <div>Capacity: {datastore.capacity || 'Unknown'}</div>
                              </div>
                            </div>
                            <div style={{
                              fontSize: '12px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              background: 'var(--success-light)',
                              color: 'var(--success-color)'
                            }}>
                              Available
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                      <i className="fas fa-database" style={{ fontSize: '48px', color: 'var(--gray-200)', marginBottom: '15px' }}></i>
                      <h4>No Datastores Available</h4>
                      <p style={{ color: 'var(--gray-600)', marginBottom: '20px' }}>
                        You need to create a datastore before creating a virtual machine.
                      </p>
                      <button 
                        className="green-btn green-btn-primary"
                        onClick={handleCreateDatastoreClick}
                        style={{ minHeight: '44px' }}
                      >
                        <i className="fas fa-plus"></i> Create Datastore
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="modal-footer">
                <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'space-between' }}>
                  <button 
                    className="green-btn green-btn-secondary" 
                    onClick={() => setShowDatastoreModal(false)}
                    disabled={loading}
                    style={{ minHeight: '44px' }}
                  >
                    Cancel
                  </button>
                  {datastores.length === 0 ? (
                    <div></div> 
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        {showCreateDatastoreModal && (
          <div className="esxi-install-modal-overlay">
            <div className="green-install-modal" style={{ maxWidth: '500px' }}>
              <button 
                className="modal-close-btn" 
                onClick={() => setShowCreateDatastoreModal(false)}
              >
                <i className="fas fa-times"></i>
              </button>
              
              <div className="modal-header">
                <div className="modal-icon-container">
                </div>
                <p>Create a new datastore on {connectionDetails?.name || connectionDetails?.ip}</p>
              </div>
              
              <div className="modal-body">
                <div className="step-content">
                  <div className="form-group">
                    <label htmlFor="name">
                      Datastore Name <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      className="form-control form-input-stable"
                      value={datastoreFormData.name}
                      onChange={handleDatastoreFormChange}
                      placeholder="datastore1"
                      required
                      disabled={loading}
                    />
                    <p className="form-hint">Unique name for the datastore</p>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="size">
                      Datastore Size <span className="required">*</span>
                    </label>
                    <select
                      id="size"
                      name="size"
                      className="form-control form-input-stable"
                      value={datastoreFormData.size}
                      onChange={handleDatastoreFormChange}
                      disabled={loading}
                    >
                      <option value="50GB">50 GB</option>
                      <option value="100GB">100 GB</option>
                      <option value="200GB">200 GB</option>
                      <option value="500GB">500 GB</option>
                      <option value="1TB">1 TB</option>
                    </select>
                  </div>
                  
                  <div className="green-alert warning">
                    <div className="alert-title">
                      <i className="fas fa-exclamation-triangle"></i>
                      <span>Note:</span>
                    </div>
                    <p>Datastore creation may take several minutes. Ensure you have sufficient storage available on the host.</p>
                  </div>
                  
                  <div className="range-summary">
                    <h4>Datastore Summary</h4>
                    <div className="summary-grid">
                      <div>
                        <div className="summary-label">ESXi Host</div>
                        <div className="summary-value">{connectionDetails?.name || connectionDetails?.ip}</div>
                      </div>
                      <div>
                        <div className="summary-label">Datastore Size</div>
                        <div className="summary-value">{datastoreFormData.size}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="modal-footer">
                <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'space-between' }}>
                  <button 
                    className="green-btn green-btn-secondary" 
                    onClick={() => setShowCreateDatastoreModal(false)}
                    disabled={loading}
                    style={{ minHeight: '44px' }}
                  >
                    Cancel
                  </button>
                  <button 
                    className="green-btn green-btn-success" 
                    onClick={createDatastore}
                    disabled={loading || !datastoreFormData.name}
                    style={{ minHeight: '44px' }}
                  >
                    {loading ? (
                      <>
                        <div className="green-spinner mini"></div> Creating Datastore...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-database"></i> Create Datastore
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showCreateVMModal && (
          <div className="esxi-install-modal-overlay">
            <div className="green-install-modal" style={{ maxWidth: '500px' }}>
              <button 
                className="modal-close-btn" 
                onClick={() => setShowCreateVMModal(false)}
              >
                <i className="fas fa-times"></i>
              </button>
              
              <div className="modal-header">
                <div className="modal-icon-container">
                  <i className="fas fa-server"></i>
                </div>
                <h3>Create New Virtual Machine</h3>
                <p>Configure a new VM on {connectionDetails?.name || connectionDetails?.ip}</p>
                {selectedDatastore && (
                  <div style={{ 
                    marginTop: '10px', 
                    padding: '8px 12px', 
                    background: 'var(--success-light)', 
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: 'var(--success-color)'
                  }}>
                    <i className="fas fa-database" style={{ marginRight: '5px' }}></i>
                    Selected Datastore: <strong>{selectedDatastore.name}</strong>
                  </div>
                )}
              </div>
              
              <div className="modal-body">
                <div className="step-content">
                  <div className="form-group">
                    <label htmlFor="vm_name">
                      VM Name <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="vm_name"
                      name="vm_name"
                      className="form-control form-input-stable"
                      value={vmFormData.vm_name}
                      onChange={handleVmFormChange}
                      placeholder="my-new-vm"
                      required
                      disabled={loading}
                    />
                    <p className="form-hint">Unique name for the virtual machine</p>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="vm_size">
                      VM Size <span className="required">*</span>
                    </label>
                    <select
                      id="vm_size"
                      name="vm_size"
                      className="form-control form-input-stable"
                      value={vmFormData.vm_size}
                      onChange={handleVmFormChange}
                      disabled={loading}
                    >
                      <option value="small">Small (1 CPU, 1GB RAM, 20GB Disk)</option>
                      <option value="medium">Medium (2 CPU, 2GB RAM, 40GB Disk)</option>
                      <option value="large">Large (4 CPU, 4GB RAM, 80GB Disk)</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="vm_ip">
                      IP Address (Optional)
                    </label>
                    <input
                      type="text"
                      id="vm_ip"
                      name="vm_ip"
                      className="form-control form-input-stable"
                      value={vmFormData.vm_ip}
                      onChange={handleVmFormChange}
                      placeholder="192.168.1.100"
                      disabled={loading}
                    />
                    <p className="form-hint">Static IP address for the VM</p>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="vm_username">
                      Username
                    </label>
                    <input
                      type="text"
                      id="vm_username"
                      name="vm_username"
                      className="form-control form-input-stable"
                      value={vmFormData.vm_username}
                      onChange={handleVmFormChange}
                      placeholder="root"
                      disabled={loading}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="vm_password">
                      Password
                    </label>
                    <input
                      type="password"
                      id="vm_password"
                      name="vm_password"
                      className="form-control form-input-stable"
                      value={vmFormData.vm_password}
                      onChange={handleVmFormChange}
                      placeholder="Password for VM access"
                      disabled={loading}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="confirm_password">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      id="confirm_password"
                      name="confirm_password"
                      className="form-control form-input-stable"
                      value={vmFormData.confirm_password}
                      onChange={handleVmFormChange}
                      placeholder="Confirm password"
                      disabled={loading}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="datastore">
                      Datastore <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="datastore"
                      name="datastore"
                      className="form-control form-input-stable"
                      value={vmFormData.datastore}
                      onChange={handleVmFormChange}
                      disabled
                      style={{ background: 'var(--gray-100)' }}
                    />
                    <p className="form-hint">Datastore where the VM will be created</p>
                    <button 
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        setShowCreateVMModal(false);
                        setShowDatastoreModal(true);
                      }}
                      style={{ marginTop: '5px' }}
                    >
                      <i className="fas fa-exchange-alt"></i> Change Datastore
                    </button>
                  </div>
                  
                  <div className="green-alert warning">
                    <div className="alert-title">
                      <i className="fas fa-exclamation-triangle"></i>
                      <span>Note:</span>
                    </div>
                    <p>VM creation may take several minutes. Do not close this window until the process is complete.</p>
                  </div>
                  
                  <div className="range-summary">
                    <h4>VM Summary</h4>
                    <div className="summary-grid">
                      <div>
                        <div className="summary-label">Connection</div>
                        <div className="summary-value">{connectionDetails?.name || connectionDetails?.ip}</div>
                      </div>
                      <div>
                        <div className="summary-label">VM Size</div>
                        <div className="summary-value">{vmFormData.vm_size}</div>
                      </div>
                      <div>
                        <div className="summary-label">Datastore</div>
                        <div className="summary-value">{vmFormData.datastore || 'Not selected'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="modal-footer">
                <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'space-between' }}>
                  <button 
                    className="green-btn green-btn-secondary" 
                    onClick={() => setShowCreateVMModal(false)}
                    disabled={loading}
                    style={{ minHeight: '44px' }}
                  >
                    Cancel
                  </button>
                  <button 
                    className="green-btn green-btn-success" 
                    onClick={createVM}
                    disabled={loading || !vmFormData.vm_name || !vmFormData.datastore}
                    style={{ minHeight: '44px' }}
                  >
                    {loading ? (
                      <>
                        <div className="green-spinner mini"></div> Creating VM...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-server"></i> Create Virtual Machine
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="esxi-loading">
      <div className="spinner"></div>
      <p>Loading ESXI...</p>
    </div>
  );
};

export default ESXI;