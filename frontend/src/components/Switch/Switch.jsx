import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import './Switch.css';

const Switch = () => {
  const { isConnected, sendCommand, addListener } = useWebSocket();
  const [markedMachines, setMarkedMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('vlan'); 

  const [vlanConfig, setVlanConfig] = useState({
    vlanId: '',
    vlanName: ''
  });

  const [vtpConfig, setVtpConfig] = useState({
    domainName: '',
    password: '',
    mode: 'server'
  });

  const isFetchingRef = useRef(false);
  const machineInfoListenerRef = useRef(false);

  const navItems = [
    'Dashboard', 'DNS Configuration','Event Viewer', 'DHCP', 'Users',
    'Resource Monitor', 'Switch', 'Machine Management',
    'Active Directory', 'Routing'
  ];

  const extractResult = (responseData) => {
    if (!responseData) return null;
    
    if (typeof responseData === 'string') {
      try {
        return JSON.parse(responseData);
      } catch (e) {
        return responseData;
      }
    }
    
    return responseData;
  };

  const fetchMachineInfo = useCallback(() => {
    console.log('Switch: Fetching ALL machines from database...');
    setMachinesLoading(true);
    setError(null);
    
    sendCommand('get_machine_info', {});
  }, [sendCommand]);

  const processMachineInfo = useCallback((machines) => {
    console.log('Switch: Processing ALL machines info:', machines);
    
    if (!machines || !Array.isArray(machines)) {
      console.error('Switch: Invalid machine data received:', machines);
      setError('Invalid machine data received from server');
      setMachinesLoading(false);
      return;
    }

    const markedMachinesList = machines.filter(machine => {
      return machine.marked_as && 
             Array.isArray(machine.marked_as) && 
             machine.marked_as.length > 0;
    });

    console.log(`Switch: Found ${markedMachinesList.length} marked machines:`, markedMachinesList);
    setMarkedMachines(markedMachinesList);
    
    setMachinesLoading(false);
    
    if (markedMachinesList.length === 0) {
      setShowMarkModal(true);
    }
  }, []);

  const handleWebSocketMessage = useCallback((data) => {
    console.log('Switch WebSocket message:', data);
    
    let command, result, error, payload;
    
    if (data.response) {
      const responseObj = data.response;
      command = responseObj.command;
      result = responseObj.result;
      error = responseObj.error;
      payload = responseObj.payload;
    } else if (data.type === 'COMMAND_RESPONSE') {
      command = data.command;
      result = data.result || data.data;
      error = data.error;
      payload = data.payload;
    } else if (data.action === 'response') {
      command = data.command;
      result = data.result;
      error = data.error;
      payload = data.payload;
    } else if (data.command) {
      command = data.command;
      result = data.result || data.data;
      error = data.error;
      payload = data.payload;
    } else if (data.message) {
      console.log('Backend log:', data.message);
      return;
    }
    
    if (!command) {
      console.log('No command found in message:', data);
      return;
    }
    
    console.log(`Switch: Processing response for command: ${command}`, { result, error });
    
    if (error) {
      console.log(`Switch: Error from backend for command ${command}:`, error);
      setError(`Error: ${error}`);
      setLoading(false);
      setMachinesLoading(false);
      return;
    }
    
    const responseData = extractResult(result);
    console.log('Switch: Extracted response data:', responseData);
    
    switch(command) {
      case 'get_machine_info':
        console.log('Switch: Received machine info');
        if (responseData && responseData.machines) {
          processMachineInfo(responseData.machines);
        } else if (responseData && responseData.success === false) {
          setError(responseData.error || 'Failed to fetch machine info');
          setMachinesLoading(false);
        }
        break;
        
      case 'create_vlan':
        console.log('Switch: Processing create VLAN response');
        setLoading(false);
        
        if (responseData && responseData.success !== false) {
          setSuccessMessage('VLAN created successfully on all marked machines!');
          setVlanConfig({
            vlanId: '',
            vlanName: ''
          });
          
          setTimeout(() => {
            setSuccessMessage(null);
          }, 5000);
        } else {
          const errorMsg = responseData?.error || 'Failed to create VLAN';
          setError(`Error: ${errorMsg}`);
        }
        break;
        
      case 'configure_vtp':
        console.log('Switch: Processing configure VTP response');
        setLoading(false);
        
        if (responseData && responseData.success !== false) {
          setSuccessMessage('VTP configured successfully on all marked machines!');
          setVtpConfig({
            domainName: '',
            password: '',
            mode: 'server'
          });
          
          setTimeout(() => {
            setSuccessMessage(null);
          }, 5000);
        } else {
          const errorMsg = responseData?.error || 'Failed to configure VTP';
          setError(`Error: ${errorMsg}`);
        }
        break;
        
      default:
        console.log(`Switch: Unhandled command: ${command}`);
    }
    
  }, [processMachineInfo]);

  const handleCreateVlan = () => {
    if (!vlanConfig.vlanId.trim()) {
      setError('Please enter VLAN ID');
      return;
    }
    
    if (!/^\d+$/.test(vlanConfig.vlanId.trim())) {
      setError('VLAN ID must be a number');
      return;
    }
    
    const vlanIdNum = parseInt(vlanConfig.vlanId.trim());
    if (vlanIdNum < 1 || vlanIdNum > 4094) {
      setError('VLAN ID must be between 1 and 4094');
      return;
    }
    
    if (!vlanConfig.vlanName.trim()) {
      setError('Please enter VLAN Name');
      return;
    }
    
    if (vlanConfig.vlanName.trim().length < 2) {
      setError('VLAN Name must be at least 2 characters long');
      return;
    }

    if (!isConnected) {
      setError('Cannot create VLAN: Not connected to backend system');
      return;
    }

    if (markedMachines.length === 0) {
      setError('No marked machines found');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    console.log('Switch: Creating VLAN on all marked machines:', {
      markedMachinesCount: markedMachines.length,
      vlanId: vlanConfig.vlanId,
      vlanName: vlanConfig.vlanName
    });

    const windowsInfos = markedMachines.map(machine => ({
      ip: machine.ip,
      username: machine.username || 'admin',
      password: machine.password
    }));

    const payload = {
      windows_infos: windowsInfos,
      vlan_id: parseInt(vlanConfig.vlanId.trim()),
      vlan_name: vlanConfig.vlanName.trim()
    };
    
    sendCommand('create_vlan', payload);
  };

  const handleConfigureVtp = () => {
    if (!vtpConfig.domainName.trim()) {
      setError('Please enter VTP Domain Name');
      return;
    }
    
    if (vtpConfig.domainName.trim().length < 2) {
      setError('VTP Domain Name must be at least 2 characters long');
      return;
    }
    
    if (!vtpConfig.password.trim()) {
      setError('Please enter VTP Password');
      return;
    }
    
    if (vtpConfig.password.trim().length < 4) {
      setError('VTP Password must be at least 4 characters long');
      return;
    }

    if (!isConnected) {
      setError('Cannot configure VTP: Not connected to backend system');
      return;
    }

    if (markedMachines.length === 0) {
      setError('No marked machines found');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    console.log('Switch: Configuring VTP on all marked machines:', {
      markedMachinesCount: markedMachines.length,
      domainName: vtpConfig.domainName,
      mode: vtpConfig.mode
    });

    const windowsInfos = markedMachines.map(machine => ({
      ip: machine.ip,
      username: machine.username || 'admin',
      password: machine.password
    }));

    const payload = {
      windows_infos: windowsInfos,
      domain_name: vtpConfig.domainName.trim(),
      password: vtpConfig.password.trim(),
      mode: vtpConfig.mode
    };
    
    sendCommand('configure_vtp', payload);
  };

  const handleRefreshMachines = () => {
    console.log('Switch: Refreshing machine list');
    fetchMachineInfo();
  };

  const getMachineRoles = (machine) => {
    if (!machine.marked_as || !Array.isArray(machine.marked_as)) return [];
    return machine.marked_as.map(mark => `${mark.role} ${mark.type}`).join(', ');
  };

  useEffect(() => {
    if (!machineInfoListenerRef.current) {
      console.log('Switch Component Mounted - Setting up WebSocket listener');
      const removeListener = addListener(handleWebSocketMessage);
      machineInfoListenerRef.current = true;
      
      return () => {
        if (removeListener) removeListener();
        machineInfoListenerRef.current = false;
      };
    }
  }, [addListener, handleWebSocketMessage]);

  useEffect(() => {
    if (isConnected && markedMachines.length === 0) {
      console.log('Switch: Connected, fetching machine info...');
      fetchMachineInfo();
    }
  }, [isConnected, fetchMachineInfo, markedMachines.length]);

  const MarkMachineModal = () => {
    if (!showMarkModal) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">No Marked Machines Found</h3>
            </div>
            <div className="modal-body">
              <div className="modal-message">
                <p>No machines are currently marked as DNS, DHCP, or AD roles.</p>
                <p>To configure switch settings, you need to mark at least one machine in Machine Management first.</p>
              </div>
              
              <div className="modal-stats-grid">
                <div className="modal-stat-item">
                  <div className="modal-stat-label">MARKED MACHINES</div>
                  <div className="modal-stat-value">{markedMachines.length}</div>
                </div>
                <div className="modal-stat-item">
                  <div className="modal-stat-label">CONNECTION</div>
                  <div className="modal-stat-value">
                    {isConnected ? 'Online' : 'Offline'}
                  </div>
                </div>
                <div className="modal-stat-item">
                  <div className="modal-stat-label">ACTIVE TAB</div>
                  <div className="modal-stat-value">
                    {activeTab === 'vlan' ? 'VLAN' : 'VTP'}
                  </div>
                </div>
                <div className="modal-stat-item">
                  <button 
                    className="modal-refresh-btn"
                    onClick={handleRefreshMachines}
                  >
                    Refresh Machines
                  </button>
                </div>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="modal-btn-primary"
                  onClick={() => {
                    setShowMarkModal(false);
                    window.location.href = '/machine-management';
                  }}
                >
                  Go to Machine Management
                </button>
                <button 
                  className="modal-btn-secondary"
                  onClick={() => {
                    setShowMarkModal(false);
                    handleRefreshMachines();
                  }}
                >
                  Refresh Machine List
                </button>
                <button 
                  className="modal-btn-tertiary"
                  onClick={() => setShowMarkModal(false)}
                >
                  Continue Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="switch-container">
      <div className="switch-content">
        <div className="switch-header">
          <h1 className="switch-title">Automation</h1>
          <div className="nav-buttons">
            {navItems.map((item) => (
              <button
                key={item}
                className={`nav-button ${item === 'Switch'
                    ? 'nav-button-active'
                    : 'nav-button-inactive'
                  }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="switch-grid">
          <div className="switch-left-column">
            <div className="stats-controls-card">
              <div className="stats-controls-header">
                <h3 className="section-title">Switch Configuration</h3>
                <div className="controls-actions">
                  <button
                    onClick={handleRefreshMachines}
                    className="refresh-machines-btn"
                    disabled={machinesLoading}
                  >
                    {machinesLoading ? 'Loading...' : 'Refresh Machines'}
                  </button>
                </div>
              </div>
              
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-count">{markedMachines.length}</div>
                  <div className="stat-label">Marked Machines</div>
                </div>
                <div className="stat-item">
                  <div className="stat-count">
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </div>
                </div>
                <div className="stat-item">
                  <div className="stat-count">{activeTab === 'vlan' ? 'VLAN' : 'VTP'}</div>
                </div>
              </div>
            </div>

            <div className="machine-list-card">
              <div className="machine-list-header">
                <h3 className="section-title">
                  Available Machines ({markedMachines.length})
                </h3>
                <div className="machine-list-status">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              
              {machinesLoading ? (
                <div className="loading-message">
                  <div className="loading-spinner"></div>
                  Loading machine information...
                </div>
              ) : markedMachines.length === 0 ? (
                <div className="no-machines-configured">
                  <div className="configure-machines-prompt">
                    <p>No marked machines found in database.</p>
                    <p>Please mark machines in Machine Management first.</p>
                  </div>
                </div>
              ) : (
                <div className="machine-list">
                  {markedMachines.map(machine => (
                    <div 
                      key={machine.id}
                      className="machine-item"
                    >
                      <div className="machine-item-header">
                        <div className="machine-item-name">{machine.name}</div>
                        <div className="machine-item-status">
                          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
                          {isConnected ? 'Online' : 'Offline'}
                        </div>
                      </div>
                      <div className="machine-item-ip">{machine.ip}</div>
                      <div className="machine-item-user">{machine.username}</div>
                      {machine.marked_as && Array.isArray(machine.marked_as) && machine.marked_as.length > 0 && (
                        <div className="machine-item-roles">
                          {machine.marked_as.map((mark, idx) => (
                            <span key={idx} className={`role-badge ${mark.role}`}>
                              {mark.role} {mark.type}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="switch-right-column">
            <div className="configuration-tabs">
              <button
                className={`config-tab ${activeTab === 'vlan' ? 'active' : ''}`}
                onClick={() => setActiveTab('vlan')}
                disabled={loading}
              >
                VLAN Configuration
              </button>
              <button
                className={`config-tab ${activeTab === 'vtp' ? 'active' : ''}`}
                onClick={() => setActiveTab('vtp')}
                disabled={loading}
              >
                VTP Configuration
              </button>
            </div>

            {activeTab === 'vlan' ? (
              <div className="vlan-config-card">
                <h3 className="form-title">Create VLAN</h3>
                <div className="form-content">
                  {markedMachines.length === 0 ? (
                    <div className="no-machines-notice">
                      <div className="notice-icon">⚠️</div>
                      <p>No marked machines available.</p>
                      <p>Please mark machines in Machine Management first.</p>
                      <button
                        onClick={handleRefreshMachines}
                        className="btn-refresh-machines"
                      >
                        Refresh Machines
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="form-group">
                        <label className="form-label">
                          VLAN ID
                          <span className="form-hint">(1-4094)</span>
                        </label>
                        <input
                          type="number"
                          value={vlanConfig.vlanId}
                          onChange={(e) => setVlanConfig({ ...vlanConfig, vlanId: e.target.value })}
                          className="form-input"
                          placeholder="Enter VLAN ID"
                          min="1"
                          max="4094"
                          disabled={loading || !isConnected}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">VLAN Name</label>
                        <input
                          type="text"
                          value={vlanConfig.vlanName}
                          onChange={(e) => setVlanConfig({ ...vlanConfig, vlanName: e.target.value })}
                          className="form-input"
                          placeholder="Enter VLAN name"
                          disabled={loading || !isConnected}
                        />
                      </div>
                      
                      <div className="config-preview">
                        <h4>Configuration Preview</h4>
                        <div className="preview-content">
                          <div className="preview-row">
                            <span className="preview-label">Target Machines:</span>
                            <span className="preview-value">{markedMachines.length} machines</span>
                          </div>
                          <div className="preview-row">
                            <span className="preview-label">VLAN ID:</span>
                            <span className="preview-value">{vlanConfig.vlanId || 'Not set'}</span>
                          </div>
                          <div className="preview-row">
                            <span className="preview-label">VLAN Name:</span>
                            <span className="preview-value">{vlanConfig.vlanName || 'Not set'}</span>
                          </div>
                          <div className="preview-row">
                            <span className="preview-label">Operation:</span>
                            <span className="preview-value">Create VLAN on all marked machines</span>
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={handleCreateVlan}
                        className="form-button"
                        disabled={loading || !isConnected || !vlanConfig.vlanId || !vlanConfig.vlanName}
                      >
                        {loading ? 'Creating VLAN...' : 'Create VLAN on All Machines'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="vtp-config-card">
                <h3 className="form-title">Configure VTP</h3>
                <div className="form-content">
                  {markedMachines.length === 0 ? (
                    <div className="no-machines-notice">
                      <div className="notice-icon">⚠️</div>
                      <p>No marked machines available.</p>
                      <p>Please mark machines in Machine Management first.</p>
                      <button
                        onClick={handleRefreshMachines}
                        className="btn-refresh-machines"
                      >
                        Refresh Machines
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="form-group">
                        <label className="form-label">VTP Domain Name</label>
                        <input
                          type="text"
                          value={vtpConfig.domainName}
                          onChange={(e) => setVtpConfig({ ...vtpConfig, domainName: e.target.value })}
                          className="form-input"
                          placeholder="Enter VTP domain name"
                          disabled={loading || !isConnected}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">VTP Password</label>
                        <input
                          type="password"
                          value={vtpConfig.password}
                          onChange={(e) => setVtpConfig({ ...vtpConfig, password: e.target.value })}
                          className="form-input"
                          placeholder="Enter VTP password"
                          disabled={loading || !isConnected}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">VTP Mode</label>
                        <select
                          value={vtpConfig.mode}
                          onChange={(e) => setVtpConfig({ ...vtpConfig, mode: e.target.value })}
                          className="form-select"
                          disabled={loading || !isConnected}
                        >
                          <option value="server">Server</option>
                          <option value="client">Client</option>
                          <option value="transparent">Transparent</option>
                        </select>
                      </div>
                      
                      <div className="config-preview">
                        <h4>Configuration Preview</h4>
                        <div className="preview-content">
                          <div className="preview-row">
                            <span className="preview-label">Target Machines:</span>
                            <span className="preview-value">{markedMachines.length} machines</span>
                          </div>
                          <div className="preview-row">
                            <span className="preview-label">Domain Name:</span>
                            <span className="preview-value">{vtpConfig.domainName || 'Not set'}</span>
                          </div>
                          <div className="preview-row">
                            <span className="preview-label">Mode:</span>
                            <span className="preview-value">{vtpConfig.mode || 'Not set'}</span>
                          </div>
                          <div className="preview-row">
                            <span className="preview-label">Operation:</span>
                            <span className="preview-value">Configure VTP on all marked machines</span>
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={handleConfigureVtp}
                        className="form-button"
                        disabled={loading || !isConnected || !vtpConfig.domainName || !vtpConfig.password}
                      >
                        {loading ? 'Configuring VTP...' : 'Configure VTP on All Machines'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {!isConnected && (
              <div className="no-connection-notice">
                Connect to backend to configure switch settings
              </div>
            )}
          </div>
        </div>
      </div>

      <MarkMachineModal />

      {error && (
        <div className="error-message-global">
          <div className="error-text">{error}</div>
          <button 
            className="btn-close-error" 
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {successMessage && (
        <div className="success-message-global">
          <div className="success-text">{successMessage}</div>
          <button 
            className="btn-close-success" 
            onClick={() => setSuccessMessage(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default Switch;