import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import ESXiValidation from './ESXiValidation';
import './ESXI.css';

const ESXI = () => {
  const { 
    sendCommand, 
    sendCommandAsync,
    isConnected, 
    addListener, 
    installations, 
    INSTALLATION_STATUS,
    updateInstallationStatus,
    saveEsxiCredentials,
    getSavedEsxiConnections,
    getEsxiVmDetails
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
  
  const [installFormData, setInstallFormData] = useState({
    gateway: '',
    subnetMask: '255.255.255.0'
  });
  
  const [connectionFormData, setConnectionFormData] = useState({
    ip: '',
    username: 'root',
    password: '',
    connectionName: ''
  });

  const [validationStep, setValidationStep] = useState('initial');
  const [validationMessage, setValidationMessage] = useState('');

  // Add Create VM state variables
  const [showCreateVMModal, setShowCreateVMModal] = useState(false);
  const [vmFormData, setVmFormData] = useState({
    vm_name: '',
    vm_size: 'small',
    vm_ip: '',
    vm_username: 'root',
    vm_password: '',
    confirm_password: ''
  });

  const listenerAdded = useRef(false);
  const installationStarted = useRef(false);

  const handleWebSocketMessage = useCallback((message) => {
    console.log('ESXI received WebSocket message:', message);
    
    // Check different response formats
    let command, result, error;
    
    // Format 1: Direct response from backend
    if (message.response) {
      const responseObj = message.response;
      command = responseObj.command;
      result = responseObj.result;
      error = responseObj.error;
    } 
    // Format 2: WebSocket server format
    else if (message.type === 'COMMAND_RESPONSE') {
      command = message.command;
      result = message.result || message.data;
      error = message.error;
    }
    // Format 3: Action-based format (from WebSocketContext)
    else if (message.action === 'response') {
      command = message.command;
      result = message.result;
      error = message.error;
    }
    // Format 4: Direct command format
    else if (message.command) {
      command = message.command;
      result = message.result || message.data;
      error = message.error;
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
    
    // Extract result data
    const extractResult = (responseData) => {
      if (!responseData) return null;
      
      // If it's a string, try to parse it
      if (typeof responseData === 'string') {
        try {
          const parsed = JSON.parse(responseData);
          console.log('Parsed string response:', parsed);
          return parsed;
        } catch (e) {
          console.log('Could not parse as JSON, returning as string:', responseData);
          return responseData;
        }
      }
      
      // If it's already an object
      return responseData;
    };
    
    const responseData = extractResult(result);
    console.log('Extracted response data:', responseData);
    
    switch(command) {
      case 'install_esxi':
        console.log('ESXi installation response:', responseData);
        
        let installationSuccess = false;
        
        if (typeof responseData === 'string') {
          const resultLower = responseData.toLowerCase();
          installationSuccess = resultLower.includes('esxi installation done') ||
                               resultLower.includes('installation successful');
        } else if (typeof responseData === 'object') {
          const dataStr = JSON.stringify(responseData).toLowerCase();
          installationSuccess = dataStr.includes('esxi installation done') ||
                               responseData.message === 'ESXi installation done' ||
                               responseData.result === 'ESXi installation done';
        }
        
        if (installationSuccess) {
          console.log('ESXi installation successful!');
          
          updateInstallationStatus('esxi', INSTALLATION_STATUS.INSTALLED, 100, 'ESXi installed successfully');
          
          setShowInstallStepsModal(false);
          setEsxiInstalled(true);
          setShowInstallModal(false);
          installationStarted.current = false;
          setLoading(false);
          
          setInstallFormData({
            gateway: '',
            subnetMask: '255.255.255.0'
          });
          
          setTimeout(() => {
            loadConnections();
          }, 1000);
        } else {
          console.log('ESXi installation failed:', responseData);
          updateInstallationStatus('esxi', INSTALLATION_STATUS.FAILED, 0, 'Installation failed');
          setLoading(false);
          installationStarted.current = false;
        }
        break;
        
      case 'validate_esxi_connection_and_credentials':
        console.log('ESXi validation response:', responseData);
        
        let isValid = false;
        let validationMessage = '';
        
        if (typeof responseData === 'object') {
          if (responseData.valid !== undefined) {
            isValid = responseData.valid === true || responseData.valid === "true";
          } else if (responseData.status) {
            isValid = responseData.status === 'valid' || 
                     responseData.status === 'connected' ||
                     responseData.status === 'success';
          }
          
          validationMessage = responseData.message || 
                            responseData.result || 
                            JSON.stringify(responseData);
        } else if (typeof responseData === 'string') {
          const resultLower = responseData.toLowerCase();
          isValid = resultLower.includes('valid') || 
                   resultLower.includes('success') || 
                   resultLower.includes('connected') ||
                   resultLower.includes('esxi connection and credentials are valid');
          
          validationMessage = responseData;
        }
        
        if (isValid) {
          console.log('ESXi validation successful!');
          setValidationMessage('✓ ESXi connection and credentials are valid');
          setValidationStep('complete');
          
          setTimeout(() => {
            setLoading(false);
          }, 1500);
        } else {
          console.log('ESXi validation failed:', responseData);
          setValidationMessage('✗ ESXi connection and credentials are not valid');
          setValidationStep('initial');
          setLoading(false);
          
          alert('ESXi connection validation failed. Please check your credentials and try again.');
        }
        break;
        
      case 'get_esxi_connections':
        console.log('ESXi connections response:', responseData);
        
        if (responseData && Array.isArray(responseData.connections)) {
          setConnections(responseData.connections);
          if (responseData.connections.length > 0 && !selectedConnection) {
            setSelectedConnection(responseData.connections[0].id);
            setConnectionDetails(responseData.connections[0]);
          }
        }
        break;
        
      case 'get_esxi_vms':
        console.log('ESXi VMs response:', responseData);
        
        if (connectionDetails && responseData && Array.isArray(responseData.vms)) {
          setConnectionDetails(prev => ({
            ...prev,
            vms: responseData.vms
          }));
        }
        break;

      case 'get_vm_details':
        console.log('VM details response:', responseData);
        
        if (responseData && responseData.vms) {
          console.log('Processing VM details for IP:', responseData.host_info?.ip);
          console.log('VMs found:', responseData.vms);
          
          // Update connections list with VM details
          setConnections(prev => prev.map(conn => {
            if (conn.ip === responseData.host_info?.ip) {
              console.log(`Updating connection ${conn.ip} with VM details`);
              return {
                ...conn,
                vms: responseData.vms,
                host_info: responseData.host_info,
                lastSeen: new Date().toISOString()
              };
            }
            return conn;
          }));
          
          // Update connection details if this is the selected connection
          if (connectionDetails && connectionDetails.ip === responseData.host_info?.ip) {
            console.log('Updating selected connection details with VM info');
            setConnectionDetails(prev => ({
              ...prev,
              vms: responseData.vms,
              host_info: responseData.host_info,
              lastSeen: new Date().toISOString()
            }));
          }
        }
        break;
        
      // Add WebSocket handler for create_vm response
      case 'create_vm':
        console.log('Create VM response:', responseData);
        
        if (responseData && responseData.success) {
          alert(`VM ${responseData.vm_name} created successfully!`);
          
          // Refresh VM details
          if (connectionDetails && connectionDetails.ip) {
            loadVMDetails(connectionDetails.ip);
          }
        } else if (responseData && responseData.error) {
          alert(`Failed to create VM: ${responseData.error}`);
        }
        
        setLoading(false);
        break;
        
      default:
        console.log(`Unhandled command: ${command}`);
    }
    
  }, [updateInstallationStatus, INSTALLATION_STATUS, connectionDetails, selectedConnection]);

  const saveCredentialsToDatabase = useCallback(async () => {
    try {
      console.log('Saving credentials to database...');
      
      const result = await saveEsxiCredentials({
        connection_name: connectionFormData.connectionName || `ESXi-${connectionFormData.ip}`,
        ip_address: connectionFormData.ip,
        username: connectionFormData.username,
        password: connectionFormData.password,
        installation_type: 'existing',
        status: 'connected'
      });
      
      console.log('Credentials saved to database:', result);
      
      setValidationMessage('✓ Credentials saved to database successfully!');
      setValidationStep('complete');
      
      // Add to local connections list
      const newConnection = {
        id: Date.now().toString(),
        name: connectionFormData.connectionName || `ESXi-${connectionFormData.ip}`,
        ip: connectionFormData.ip,
        username: connectionFormData.username,
        status: 'connected',
        lastSeen: new Date().toISOString()
      };
      
      setConnections(prev => [...prev, newConnection]);
      setSelectedConnection(newConnection.id);
      setConnectionDetails(newConnection);
      
      // Reset form and close modal after delay
      setTimeout(() => {
        setShowConnectionModal(false);
        setShowInstallModal(false);
        setEsxiInstalled(true);
        setConnectionFormData({
          ip: '',
          username: 'root',
          password: '',
          connectionName: ''
        });
        setValidationStep('initial');
        setValidationMessage('');
        setLoading(false);
      }, 1500);
      
    } catch (error) {
      console.error('Error saving credentials to database:', error);
      setValidationMessage(`✗ Error saving to database: ${error.message}`);
      setValidationStep('initial');
      setLoading(false);
      alert('Failed to save credentials to database. Please try again.');
    }
  }, [connectionFormData, saveEsxiCredentials]);

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
    if (esxiInstalled === true) {
      loadConnections();
    }
  }, [esxiInstalled]);

  const loadConnections = async () => {
    try {
      console.log('Loading ESXi connections from database...');
      setLoading(true);
      
      const connections = await getSavedEsxiConnections();
      console.log('Loaded connections:', connections);
      setConnections(connections);
      
      if (connections.length > 0 && !selectedConnection) {
        setSelectedConnection(connections[0].id);
        setConnectionDetails(connections[0]);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading connections:', error);
      setLoading(false);
    }
  };

  const selectConnection = (connectionId) => {
    console.log('Selecting connection:', connectionId);
    setSelectedConnection(connectionId);
    
    const connection = connections.find(c => c.id === connectionId);
    if (connection) {
      console.log('Found connection:', connection);
      setConnectionDetails(connection);
      
      // Load VM details for this connection if not already loaded
      if (!connection.vms) {
        loadVMDetails(connection.ip);
      }
    }
  };

  const loadVMDetails = async (ip_address) => {
    try {
      console.log('Loading VM details for IP:', ip_address);
      
      const vmDetails = await getEsxiVmDetails(ip_address);
      console.log('VM details received:', vmDetails);
      
      if (vmDetails && vmDetails.vms) {
        // Update the connection with VM details
        setConnections(prev => prev.map(conn => 
          conn.ip === ip_address 
            ? { 
                ...conn, 
                vms: vmDetails.vms, 
                host_info: vmDetails.host_info,
                lastSeen: new Date().toISOString()
              }
            : conn
        ));
        
        // Update connection details if this is selected
        if (connectionDetails && connectionDetails.ip === ip_address) {
          console.log('Updating connection details with VM info');
          setConnectionDetails(prev => ({
            ...prev,
            vms: vmDetails.vms,
            host_info: vmDetails.host_info,
            lastSeen: new Date().toISOString()
          }));
        }
      }
    } catch (error) {
      console.error('Error loading VM details:', error);
    }
  };

  // Add function to handle Create VM button click
  const handleCreateVMBtnClick = () => {
    if (!selectedConnection) {
      alert('Please select an ESXi connection first');
      return;
    }
    setShowCreateVMModal(true);
    setVmFormData({
      vm_name: '',
      vm_size: 'small',
      vm_ip: '',
      vm_username: 'root',
      vm_password: '',
      confirm_password: ''
    });
  };

  // Add function to handle VM form changes
  const handleVmFormChange = (e) => {
    const { id, value } = e.target;
    setVmFormData(prev => ({ ...prev, [id]: value }));
  };

  // Add function to create the VM
  const createVM = async () => {
    // Validate form
    if (!vmFormData.vm_name) {
      alert('Please enter VM name');
      return;
    }
    
    if (vmFormData.vm_password !== vmFormData.confirm_password) {
      alert('Passwords do not match');
      return;
    }
    
    if (!connectionDetails) {
      alert('No connection selected');
      return;
    }
    
    setLoading(true);
    
    try {
      const payload = {
        esxi_info: {
          ip: connectionDetails.ip,
          username: connectionDetails.username,
          password: connectionDetails.password
        },
        vm_config: {
          vm_name: vmFormData.vm_name,
          vm_size: vmFormData.vm_size,
          vm_ip: vmFormData.vm_ip,
          vm_username: vmFormData.vm_username,
          vm_password: vmFormData.vm_password
        },
        connection_id: selectedConnection
      };
      
      console.log('Sending create_vm command with payload:', {
        ...payload,
        esxi_info: { ...payload.esxi_info, password: '***' },
        vm_config: { ...payload.vm_config, vm_password: '***' }
      });
      
      // Send command via WebSocket
      sendCommand('create_vm', payload);
      
      // Set a timeout to handle response
      setTimeout(() => {
        setLoading(false);
        setShowCreateVMModal(false);
        
        // Refresh VM details after creation
        if (connectionDetails.ip) {
          loadVMDetails(connectionDetails.ip);
        }
      }, 3000);
      
    } catch (error) {
      console.error('Error creating VM:', error);
      setLoading(false);
      alert('Error creating VM: ' + error.message);
    }
  };

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
    const { id, value } = e.target;
    setInstallFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleConnectionFormChange = (e) => {
    const { id, value } = e.target;
    setConnectionFormData(prev => ({ ...prev, [id]: value }));
  };

  const beginInstallation = () => {
    if (!installFormData.gateway) {
      alert('Please enter a gateway IP address');
      return;
    }

    console.log('Beginning ESXi installation...');
    console.log('Installation data:', installFormData);
    
    setLoading(true);
    installationStarted.current = true;
    
    updateInstallationStatus('esxi', INSTALLATION_STATUS.INSTALLING, 0, 'Starting ESXi installation...');
    
    sendCommand('install_esxi', {
      gateway: installFormData.gateway,
      subnet_mask: installFormData.subnetMask
    });
  };

  const addConnection = () => {
    if (!connectionFormData.ip || !connectionFormData.password) {
      alert('Please enter IP address and password');
      return;
    }

    console.log('Starting ESXi connection validation process...');
    
    setLoading(true);
    setValidationStep('validating');
    setValidationMessage('Validating ESXi connection...');
    
    sendCommand('add_esxi_connection', {
      ip: connectionFormData.ip,
      username: connectionFormData.username,
      password: connectionFormData.password
    });
    
    setTimeout(() => {
      sendCommand('validate_esxi_connection_and_credentials', {
        esxi_info: {
          ip: connectionFormData.ip,
          username: connectionFormData.username,
          password: connectionFormData.password
        }
      });
    }, 1000);
  };

  const deleteConnection = async (connectionId, e) => {
    e.stopPropagation();
    
    if (window.confirm('Are you sure you want to delete this connection?')) {
      console.log('Deleting connection:', connectionId);
      
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
    const connection = connections.find(c => c.id === connectionId);
    
    if (connection) {
      try {
        setLoading(true);
        await loadVMDetails(connection.ip);
        setLoading(false);
        alert('Connection refreshed successfully!');
      } catch (error) {
        console.error('Error refreshing connection:', error);
        setLoading(false);
        alert('Error refreshing connection');
      }
    }
  };

  const renderValidationStatus = () => {
    if (validationStep === 'initial') return null;
    
    const statusClass = validationMessage.startsWith('✓') ? 'success' : 
                       validationMessage.startsWith('✗') ? 'error' : 'info';
    
    return (
      <div className={`validation-status ${statusClass}`}>
        <div className="validation-icon">
          {validationStep === 'validating' && <div className="mini-spinner"></div>}
          {validationStep === 'saving' && <i className="fas fa-database"></i>}
          {validationStep === 'complete' && <i className="fas fa-check-circle"></i>}
        </div>
        <div className="validation-content">
          <div className="validation-step">
            {validationStep === 'validating' && 'Validating connection...'}
            {validationStep === 'saving' && 'Saving to database...'}
            {validationStep === 'complete' && 'Complete!'}
          </div>
          <div className="validation-message">{validationMessage}</div>
        </div>
      </div>
    );
  };

  if (installations.esxi?.status === INSTALLATION_STATUS.INSTALLING) {
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
                  <i className="fas fa-check-circle"></i> ESXi Ready
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
                  connections.map((connection) => (
                    <div
                      key={connection.id}
                      className={`connection-item ${selectedConnection === connection.id ? 'active' : ''}`}
                      onClick={() => selectConnection(connection.id)}
                    >
                      <div className="connection-info">
                        <div>
                          <div className="connection-name">{connection.name}</div>
                          <div className="connection-ip">{connection.ip}</div>
                          {connection.vms && (
                            <div style={{ fontSize: '10px', color: 'var(--gray-500)', marginTop: '3px' }}>
                              <i className="fas fa-tv" style={{ marginRight: '3px' }}></i>
                              {connection.vms.length} VM{connection.vms.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                        <div className="status-dot active"></div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', gap: '5px' }}>
                        <button 
                          className="btn-secondary btn-sm"
                          onClick={(e) => refreshConnection(connection.id, e)}
                          style={{ padding: '2px 8px', fontSize: '11px' }}
                          title="Refresh VM details"
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
                  ))
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
                  onClick={loadConnections}
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
                <div className="connection-details">
                  <div className="connection-header">
                    <div>
                      <div className="connection-title">
                        <h2>{connectionDetails?.name || 'ESXi Connection'}</h2>
                        <span className="status-badge active">Connected</span>
                      </div>
                      <p className="scope-description">{connectionDetails?.ip || 'No IP address'}</p>
                      <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '5px' }}>
                        <i className="fas fa-clock"></i> 
                        Last seen: {connectionDetails?.lastSeen ? new Date(connectionDetails.lastSeen).toLocaleString() : 'Never'}
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
                        <span style={{ color: 'var(--success-color)' }}>● Connected</span>
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
                    >
                      Virtual Machines 
                    </button>
                    <button 
                      className={`tab-btn ${activeTab === 'resources' ? 'active' : ''}`}
                      onClick={() => setActiveTab('resources')}
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
                                    >
                                      <i className="fas fa-plus"></i> Create New VM
                                    </button>
                                    <button 
                                      className="btn-secondary" 
                                      style={{ width: '100%' }}
                                      onClick={() => loadVMDetails(connectionDetails.ip)}
                                    >
                                      <i className="fas fa-sync-alt"></i> Refresh VM Details
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
                                                 vm.status === 'poweredOff' ? 'var(--error-color)' : 'var(--warning-color)',
                                          fontWeight: '500'
                                        }}>
                                          {vm.status === 'poweredOn' ? '● Running' : 
                                           vm.status === 'poweredOff' ? '● Stopped' : '● Suspended'}
                                        </span>
                                      </td>
                                      <td style={{ padding: '12px' }}>{vm.cpu}</td>
                                      <td style={{ padding: '12px' }}>{vm.memory}</td>
                                      <td style={{ padding: '12px' }}>{vm.storage}</td>
                                      <td style={{ padding: '12px' }}>{vm.os}</td>
                                      <td style={{ padding: '12px' }}>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                          <button className="btn-secondary btn-sm" title="Start VM">
                                            <i className="fas fa-play"></i>
                                          </button>
                                          <button className="btn-secondary btn-sm" title="Stop VM">
                                            <i className="fas fa-stop"></i>
                                          </button>
                                          <button className="btn-secondary btn-sm" title="Configure VM">
                                            <i className="fas fa-cog"></i>
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
                                >
                                  <i className="fas fa-plus"></i> Create First VM
                                </button>
                                <button 
                                  className="btn-secondary" 
                                  style={{ marginTop: '15px', marginLeft: '10px' }}
                                  onClick={() => loadVMDetails(connectionDetails.ip)}
                                >
                                  <i className="fas fa-sync-alt"></i> Refresh
                                </button>
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
                                  onClick={() => loadVMDetails(connectionDetails.ip)}
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
              )}
            </div>
          </div>
        </div>

        {/* Add the Create VM Modal component */}
        {showCreateVMModal && (
          <div className="esxi-install-modal-overlay">
            <div className="enhanced-installation-modal" style={{ maxWidth: '500px' }}>
              <button 
                className="modal-close-btn" 
                onClick={() => setShowCreateVMModal(false)}
              >
                <i className="fas fa-times"></i>
              </button>
              
              <div className="modal-content" style={{ maxHeight: 'calc(90vh - 150px)', overflowY: 'auto' }}>
                <div className="modal-title-section">
                  <h3>Create New Virtual Machine</h3>
                  <p>Configure a new VM on {connectionDetails?.name || connectionDetails?.ip}</p>
                </div>
                
                <div className="step-content">
                  <div className="enhanced-form-group">
                    <label htmlFor="vm_name">
                      VM Name <span className="enhanced-required">*</span>
                    </label>
                    <input
                      type="text"
                      id="vm_name"
                      value={vmFormData.vm_name}
                      onChange={handleVmFormChange}
                      placeholder="my-new-vm"
                      required
                      disabled={loading}
                    />
                    <p className="enhanced-help-text">Unique name for the virtual machine</p>
                  </div>
                  
                  <div className="enhanced-form-group">
                    <label htmlFor="vm_size">
                      VM Size <span className="enhanced-required">*</span>
                    </label>
                    <select
                      id="vm_size"
                      value={vmFormData.vm_size}
                      onChange={handleVmFormChange}
                      disabled={loading}
                      style={{ width: '100%', padding: 'var(--spacing-4)', borderRadius: '12px', border: '2px solid var(--gray-300)' }}
                    >
                      <option value="small">Small (1 CPU, 1GB RAM, 20GB Disk)</option>
                      <option value="medium">Medium (2 CPU, 2GB RAM, 40GB Disk)</option>
                      <option value="large">Large (4 CPU, 4GB RAM, 80GB Disk)</option>
                    </select>
                  </div>
                  
                  <div className="enhanced-form-group">
                    <label htmlFor="vm_ip">
                      IP Address (Optional)
                    </label>
                    <input
                      type="text"
                      id="vm_ip"
                      value={vmFormData.vm_ip}
                      onChange={handleVmFormChange}
                      placeholder="192.168.1.100"
                      disabled={loading}
                    />
                    <p className="enhanced-help-text">Static IP address for the VM</p>
                  </div>
                  
                  <div className="enhanced-form-group">
                    <label htmlFor="vm_username">
                      Username
                    </label>
                    <input
                      type="text"
                      id="vm_username"
                      value={vmFormData.vm_username}
                      onChange={handleVmFormChange}
                      placeholder="root"
                      disabled={loading}
                    />
                  </div>
                  
                  <div className="enhanced-form-group">
                    <label htmlFor="vm_password">
                      Password
                    </label>
                    <input
                      type="password"
                      id="vm_password"
                      value={vmFormData.vm_password}
                      onChange={handleVmFormChange}
                      placeholder="Password for VM access"
                      disabled={loading}
                    />
                  </div>
                  
                  <div className="enhanced-form-group">
                    <label htmlFor="confirm_password">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      id="confirm_password"
                      value={vmFormData.confirm_password}
                      onChange={handleVmFormChange}
                      placeholder="Confirm password"
                      disabled={loading}
                    />
                  </div>
                  
                  <div className="enhanced-warning-note">
                    <i className="fas fa-exclamation-triangle"></i>
                    <div>
                      <p className="enhanced-note-title">Note:</p>
                      <p>VM creation may take several minutes. Do not close this window until the process is complete.</p>
                    </div>
                  </div>
                  
                  <div className="enhanced-range-summary">
                    <h4>VM Summary</h4>
                    <div className="enhanced-summary-grid">
                      <div>
                        <div className="enhanced-summary-label">Connection</div>
                        <div className="enhanced-summary-value">{connectionDetails?.name || connectionDetails?.ip}</div>
                      </div>
                      <div>
                        <div className="enhanced-summary-label">VM Size</div>
                        <div className="enhanced-summary-value">{vmFormData.vm_size}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="enhanced-modal-footer">
                <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'space-between' }}>
                  <button 
                    className="enhanced-btn-secondary" 
                    onClick={() => setShowCreateVMModal(false)}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button 
                    className="enhanced-btn-success" 
                    onClick={createVM}
                    disabled={loading || !vmFormData.vm_name}
                  >
                    {loading ? (
                      <>
                        <div className="mini-spinner"></div> Creating VM...
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

  if (showInstallModal) {
    return (
      <div className="esxi-install-modal-overlay">
        <div className="esxi-install-modal" style={{ maxHeight: '90vh', height: 'auto' }}>
          <div className="modal-content" style={{ maxHeight: 'calc(90vh - 150px)', overflowY: 'auto', paddingTop: '25px' }}>
            <div className="modal-icon-container">
              <i className="fas fa-server"></i>
            </div>
            <h3>ESXi Hypervisor Setup</h3>
            <p>Get started with ESXi hypervisor management. You can either install ESXi on this machine or connect to an existing ESXi server.</p>
            
            <div className="enhanced-warning-note">
              <i className="fas fa-info-circle"></i>
              <div>
                <p className="enhanced-note-title">Important:</p>
                <p>Installing ESXi will format the target machine and install VMware ESXi hypervisor. Ensure you have backed up all data before proceeding.</p>
              </div>
            </div>
            
            <div className="enhanced-connection-info">
              <h4>Options</h4>
              <div className="windows-connection-details">
                <p><strong>Option 1:</strong> Install ESXi on this machine (requires hardware virtualization support)</p>
                <p><strong>Option 2:</strong> Connect to an existing ESXi server (requires IP address and credentials)</p>
                <p>
                  <strong>WebSocket Status:</strong> 
                  <span className={`websocket-indicator ${isConnected ? 'connected' : 'disconnected'}`} style={{ marginLeft: '8px' }}>
                    <i className={`fas fa-${isConnected ? 'check-circle' : 'times-circle'}`} style={{ marginRight: '4px' }}></i>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </p>
              </div>
            </div>
            
          </div>
          <div className="enhanced-modal-footer">
            <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'flex-end' }}>
              <button 
                className="enhanced-btn-secondary" 
                onClick={handleAlreadyHaveClick}
                disabled={!isConnected || loading}
              >
                <i className="fas fa-plug"></i> Already Have ESXi
              </button>
              <button 
                className="enhanced-btn-primary" 
                onClick={handleInstallClick}
                disabled={!isConnected || installations.esxi?.status === INSTALLATION_STATUS.INSTALLING || loading}
              >
                {installations.esxi?.status === INSTALLATION_STATUS.INSTALLING || loading ? (
                  <>
                    <div className="mini-spinner"></div> Installing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-download"></i> Install ESXi
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showInstallStepsModal) {
    return (
      <div className="esxi-install-modal-overlay">
        <div className="enhanced-installation-modal" style={{ maxHeight: '90vh', height: 'auto' }}>
          <button 
            className="modal-close-btn" 
            onClick={() => { 
              setShowInstallStepsModal(false); 
              setShowInstallModal(true);
              setInstallFormData({
                gateway: '',
                subnetMask: '255.255.255.0'
              });
            }}
          >
            <i className="fas fa-times"></i>
          </button>
          
          <div className="modal-content" style={{ maxHeight: 'calc(90vh - 150px)', overflowY: 'auto' }}>
            <div className="modal-title-section">
              <h3>Install ESXi Hypervisor</h3>
              <p>Configure the network settings for your ESXi host installation</p>
            </div>
            
            <div className="step-content">
              <div className="enhanced-form-group">
                <label htmlFor="gateway">
                  Default Gateway <span className="enhanced-required">*</span>
                </label>
                <input
                  type="text"
                  id="gateway"
                  value={installFormData.gateway}
                  onChange={handleInstallFormChange}
                  placeholder="192.168.1.1"
                  required
                />
                <p className="enhanced-help-text">The default gateway for the ESXi management network</p>
              </div>
              
              <div className="enhanced-form-group">
                <label htmlFor="subnetMask">
                  Subnet Mask <span className="enhanced-required">*</span>
                </label>
                <input
                  type="text"
                  id="subnetMask"
                  value={installFormData.subnetMask}
                  onChange={handleInstallFormChange}
                  placeholder="255.255.255.0"
                  required
                />
                <p className="enhanced-help-text">The subnet mask for the ESXi management network</p>
              </div>
              
              <div className="enhanced-warning-note">
                <i className="fas fa-exclamation-triangle"></i>
                <div>
                  <p className="enhanced-note-title">Warning:</p>
                  <p>Installing ESXi will erase all data on the target machine. Ensure you have backups of important data.</p>
                </div>
              </div>
              
              <div className="enhanced-range-summary">
                <h4>Installation Summary</h4>
                <div className="enhanced-summary-grid">
                  <div>
                    <div className="enhanced-summary-label">Gateway</div>
                    <div className="enhanced-summary-value">{installFormData.gateway || 'Not set'}</div>
                  </div>
                  <div>
                    <div className="enhanced-summary-label">Subnet Mask</div>
                    <div className="enhanced-summary-value">{installFormData.subnetMask}</div>
                  </div>
                </div>
                <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--gray-600)' }}>
                  Note: Installation may take 15-30 minutes. Do not interrupt the process.
                </div>
              </div>
            </div>
          </div>
          
          <div className="enhanced-modal-footer">
            <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'space-between' }}>
              <button 
                className="enhanced-btn-secondary" 
                onClick={() => { 
                  setShowInstallStepsModal(false); 
                  setShowInstallModal(true);
                  setInstallFormData({
                    gateway: '',
                    subnetMask: '255.255.255.0'
                  });
                }}
              >
                Cancel
              </button>
              <button 
                className="enhanced-btn-success" 
                onClick={beginInstallation}
                disabled={loading || !installFormData.gateway}
              >
                {loading ? (
                  <>
                    <div className="mini-spinner"></div> Installing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-play"></i> Begin Installation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showConnectionModal) {
    return (
      <div className="esxi-install-modal-overlay">
        <div className="enhanced-installation-modal" style={{ maxHeight: '90vh', height: 'auto' }}>
          <button 
            className="modal-close-btn" 
            onClick={() => { 
              setShowConnectionModal(false); 
              setShowInstallModal(true);
            }}
          >
            <i className="fas fa-times"></i>
          </button>
          
          <div className="modal-content" style={{ maxHeight: 'calc(90vh - 150px)', overflowY: 'auto' }}>
            <ESXiValidation 
              onSuccess={(newConnection) => {
                console.log('Connection successful:', newConnection);
                setShowConnectionModal(false);
                setShowInstallModal(false);
                setEsxiInstalled(true);
                
                const connectionToAdd = {
                  id: Date.now().toString(),
                  name: newConnection.name || `ESXi-${newConnection.ip}`,
                  ip: newConnection.ip,
                  username: newConnection.username,
                  status: 'connected',
                  lastSeen: new Date().toISOString()
                };
                
                setConnections(prev => [...prev, connectionToAdd]);
                setSelectedConnection(connectionToAdd.id);
                setConnectionDetails(connectionToAdd);
              }}
            />
          </div>
        </div>
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