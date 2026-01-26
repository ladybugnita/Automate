import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import { Eye, EyeOff, Server, AlertCircle } from 'lucide-react';
import './Routing.css';

const Routing = () => {
  const { sendCommand, addListener, isConnected } = useWebSocket();
  
  const navButtons = [
    'Dashboard', 'DNS Configuration', 'Event Viewer', 'DHCP', 'Users',
    'Resource Monitor', 'Switch', 'Machine Management',
    'Active Directory', 'Routing'
  ];
  
  const [activeTab, setActiveTab] = useState('rip');
  
  const [markedMachines, setMarkedMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [showMachineInfo, setShowMachineInfo] = useState(false);
  
  const [connectionData, setConnectionData] = useState({
    routerIp: '',
    sshUsername: '',
    sshPassword: ''
  });
  
  const [ripNetworks, setRipNetworks] = useState(['']);
  const [ospfData, setOspfData] = useState({
    processId: '',
    network: '',
    area: ''
  });
  
  const [staticData, setStaticData] = useState({
    network: '',
    mask: '',
    nextHop: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState({
    routerIp: '',
    sshUsername: '',
    sshPassword: '',
    ripNetworks: [],
    ospfProcessId: '',
    ospfNetwork: '',
    ospfArea: '',
    staticNetwork: '',
    staticMask: '',
    staticNextHop: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [globalError, setGlobalError] = useState(null);
  const [infoMessage, setInfoMessage] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  
  const isFetchingRef = useRef(false);
  const machineInfoListenerRef = useRef(false);
  
  const isValidIPAddress = (ip) => {
    const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  };
  
  const isValidNetwork = (network) => {
    const cidrRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
    const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return cidrRegex.test(network) || ipRegex.test(network);
  };
  
  const isValidSubnetMask = (mask) => {
    if (isValidIPAddress(mask)) {
      const parts = mask.split('.');
      const binary = parts.map(part => parseInt(part).toString(2).padStart(8, '0')).join('');
      let foundZero = false;
      for (let i = 0; i < binary.length; i++) {
        if (binary[i] === '0') {
          foundZero = true;
        } else if (foundZero && binary[i] === '1') {
          return false;
        }
      }
      return true;
    }
    return false;
  };
  
  const isValidNumeric = (value) => {
    return /^\d+$/.test(value);
  };
  
  const isValidOSPFArea = (area) => {
    if (/^\d+$/.test(area)) {
      const num = parseInt(area);
      return num >= 0 && num <= 4294967295;
    }
    const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(area);
  };

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
    console.log('Routing: Fetching ALL machines from database...');
    setMachinesLoading(true);
    setGlobalError(null);
    setInfoMessage('');
    
    sendCommand('get_machine_info', {});
  }, [sendCommand]);

  const processMachineInfo = useCallback((machines) => {
    console.log('Routing: Processing ALL machines info:', machines);
    
    if (!machines || !Array.isArray(machines)) {
      console.error('Routing: Invalid machine data received:', machines);
      setGlobalError('Invalid machine data received from server');
      setMachinesLoading(false);
      return;
    }

    const markedMachinesList = machines.filter(machine => {
      return machine.marked_as && 
             Array.isArray(machine.marked_as) && 
             machine.marked_as.length > 0;
    });

    console.log(`Routing: Found ${markedMachinesList.length} marked machines:`, markedMachinesList);
    setMarkedMachines(markedMachinesList);
    setMachinesLoading(false);
    
    if (markedMachinesList.length > 0) {
      const routerMachines = markedMachinesList.filter(m => 
        m.marked_as.some(mark => mark.role === 'router')
      );
      setInfoMessage(`Found ${markedMachinesList.length} marked machine(s). ${routerMachines.length} marked as router(s). All marked machines will be included in configuration.`);
      setShowMarkModal(false);
    } else {
      setInfoMessage('No marked machines found. Mark machines in Machine Management first.');
      setShowMarkModal(true);
    }
    
    setLastRefresh(new Date());
  }, []);

  const getWindowsInfoForMachine = (machine) => {
    if (!machine) {
      console.error('Routing: No machine provided to getWindowsInfoForMachine');
      return null;
    }
    
    console.log(`Routing: Getting Windows info for machine: ${machine.name} (${machine.ip})`);
    
    if (!machine.password) {
      console.error('Routing: No password found for machine:', machine.name);
      return null;
    }
    
    return {
      ip: machine.ip,
      username: machine.username || 'admin',
      password: machine.password
    };
  };

  const createPayloadForAllMachines = useCallback(() => {
    if (!markedMachines || markedMachines.length === 0) {
      console.error('Routing: No marked machines found');
      return null;
    }
    
    const windowsInfos = [];
    
    markedMachines.forEach(machine => {
      const windowsInfo = getWindowsInfoForMachine(machine);
      if (windowsInfo) {
        windowsInfos.push(windowsInfo);
      }
    });
    
    if (windowsInfos.length === 0) {
      console.error('Routing: Failed to get Windows info for any marked machine');
      return null;
    }
    
    console.log(`Routing: Creating payload for ${windowsInfos.length} machine(s)`);
    
    return {
      windows_infos: windowsInfos
    };
  }, [markedMachines]);

  const handleWebSocketMessage = useCallback((data) => {
    console.log('Routing WebSocket message:', data);
    
    let command, result, errorMsg;
    
    if (data.response) {
      const responseObj = data.response;
      command = responseObj.command;
      result = responseObj.result;
      errorMsg = responseObj.error;
    } else if (data.type === 'COMMAND_RESPONSE') {
      command = data.command;
      result = data.result || data.data;
      errorMsg = data.error;
    } else if (data.action === 'response') {
      command = data.command;
      result = data.result;
      errorMsg = data.error;
    } else if (data.command) {
      command = data.command;
      result = data.result || data.data;
      errorMsg = data.error;
    } else if (data.message) {
      console.log('Backend log:', data.message);
      return;
    }
    
    if (!command) {
      console.log('No command found in message:', data);
      return;
    }
    
    console.log(`Routing: Processing response for command: ${command}`, { result, errorMsg });
    
    if (errorMsg) {
      console.log(`Routing: Error from backend for command ${command}:`, errorMsg);
      setError(`Error: ${errorMsg}`);
      setLoading(false);
      return;
    }
    
    const responseData = extractResult(result);
    console.log('Routing: Extracted response data:', responseData);
    
    switch(command) {
      case 'get_machine_info':
        console.log('Routing: Received machine info');
        if (responseData && responseData.machines) {
          processMachineInfo(responseData.machines);
        } else if (responseData && responseData.success === false) {
          setGlobalError(responseData.error || 'Failed to fetch machine info');
          setMachinesLoading(false);
        }
        break;
        
      case 'configure_RIP':
        setLoading(false);
        if (responseData && responseData.success !== false) {
          alert('RIP configuration successful!');
          resetRIPForm();
          resetConnectionData();
        } else {
          alert('Error occurred. Try again');
        }
        break;
        
      case 'configure_OSPF':
        setLoading(false);
        if (responseData && responseData.success !== false) {
          alert('OSPF configuration successful!');
          resetOSPFForm();
          resetConnectionData();
        } else {
          alert('Error occurred. Try again');
        }
        break;
        
      case 'Configure_Static':
        setLoading(false);
        if (responseData && responseData.success !== false) {
          alert('Static route configuration successful!');
          resetStaticForm();
          resetConnectionData();
        } else {
          alert('Error occurred. Try again');
        }
        break;
        
      default:
        console.log(`Routing: Unhandled command: ${command}`);
    }
  }, [processMachineInfo]);

  const resetRIPForm = () => {
    setRipNetworks(['']);
    setValidationErrors(prev => ({
      ...prev,
      ripNetworks: []
    }));
  };

  const resetOSPFForm = () => {
    setOspfData({
      processId: '',
      network: '',
      area: ''
    });
    setValidationErrors(prev => ({
      ...prev,
      ospfProcessId: '',
      ospfNetwork: '',
      ospfArea: ''
    }));
  };

  const resetStaticForm = () => {
    setStaticData({
      network: '',
      mask: '',
      nextHop: ''
    });
    setValidationErrors(prev => ({
      ...prev,
      staticNetwork: '',
      staticMask: '',
      staticNextHop: ''
    }));
  };

  const resetConnectionData = () => {
    setConnectionData({
      routerIp: '',
      sshUsername: '',
      sshPassword: ''
    });
    setValidationErrors(prev => ({
      ...prev,
      routerIp: '',
      sshUsername: '',
      sshPassword: ''
    }));
  };

  const validateConnectionData = () => {
    const newErrors = {...validationErrors};
    let hasError = false;

    if (!connectionData.routerIp) {
      newErrors.routerIp = 'Router IP is required';
      hasError = true;
    } else if (!isValidIPAddress(connectionData.routerIp)) {
      newErrors.routerIp = 'Invalid IP address format. Use format: 192.168.1.1';
      hasError = true;
    } else {
      newErrors.routerIp = '';
    }

    if (!connectionData.sshUsername) {
      newErrors.sshUsername = 'SSH Username is required';
      hasError = true;
    } else {
      newErrors.sshUsername = '';
    }

    if (!connectionData.sshPassword) {
      newErrors.sshPassword = 'SSH Password is required';
      hasError = true;
    } else {
      newErrors.sshPassword = '';
    }

    setValidationErrors(newErrors);
    return !hasError;
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const buildPayloadWithMachines = (basePayload) => {
    const machinesPayload = createPayloadForAllMachines();
    
    if (!machinesPayload || !machinesPayload.windows_infos) {
      return basePayload;
    }
    
    return {
      ...basePayload,
      windows_infos: machinesPayload.windows_infos
    };
  };

  const handleRipSubmit = async () => {
    if (!validateConnectionData()) {
      return;
    }

    const validNetworks = ripNetworks.filter(network => 
      network && network.trim() !== ''
    );
    
    if (validNetworks.length === 0) {
      alert('Please add at least one network');
      return;
    }
    
    let hasError = false;
    const newRipErrors = [...validationErrors.ripNetworks];
    
    ripNetworks.forEach((network, index) => {
      if (network && !isValidNetwork(network)) {
        newRipErrors[index] = 'Invalid network format. Use format: 192.168.1.0 or 192.168.1.0/24';
        hasError = true;
      }
    });
    
    setValidationErrors(prev => ({
      ...prev,
      ripNetworks: newRipErrors
    }));
    
    if (hasError) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const basePayload = {
        router_ip: connectionData.routerIp,
        ssh_username: connectionData.sshUsername,
        ssh_password: connectionData.sshPassword
      };
      
      validNetworks.forEach((network, index) => {
        basePayload[`network${index + 1}`] = network.trim();
      });

      const finalPayload = buildPayloadWithMachines(basePayload);
      
      const commandId = sendCommand('configure_RIP', finalPayload);
      
      if (!commandId) {
        throw new Error('Failed to send command');
      }

    } catch (error) {
      console.error('Error sending RIP command:', error);
      alert('Error occurred. Try again');
      setLoading(false);
    }
  };

  const handleOspfSubmit = async () => {
    if (!validateConnectionData()) {
      return;
    }
    let hasError = false;
    const newErrors = { ...validationErrors };
    
    if (!ospfData.processId) {
      newErrors.ospfProcessId = 'Process ID is required';
      hasError = true;
    } else if (!isValidNumeric(ospfData.processId)) {
      newErrors.ospfProcessId = 'Process ID must be a number';
      hasError = true;
    }
    
    if (!ospfData.network) {
      newErrors.ospfNetwork = 'Network is required';
      hasError = true;
    } else if (!isValidNetwork(ospfData.network)) {
      newErrors.ospfNetwork = 'Invalid network format. Use format: 192.168.1.0/24';
      hasError = true;
    }
    
    if (!ospfData.area) {
      newErrors.ospfArea = 'Area is required';
      hasError = true;
    } else if (!isValidOSPFArea(ospfData.area)) {
      newErrors.ospfArea = 'Invalid area. Use number (0-4294967295) or IP address format';
      hasError = true;
    }
    
    setValidationErrors(newErrors);
    
    if (hasError) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const basePayload = {
        router_ip: connectionData.routerIp,
        ssh_username: connectionData.sshUsername,
        ssh_password: connectionData.sshPassword,
        process_id: ospfData.processId,
        network: ospfData.network,
        area: ospfData.area
      };

      const finalPayload = buildPayloadWithMachines(basePayload);
      
      const commandId = sendCommand('configure_OSPF', finalPayload);
      
      if (!commandId) {
        throw new Error('Failed to send command');
      }

    } catch (error) {
      console.error('Error sending OSPF command:', error);
      alert('Error occurred. Try again');
      setLoading(false);
    }
  };

  const handleStaticSubmit = async () => {
    if (!validateConnectionData()) {
      return;
    }

    let hasError = false;
    const newErrors = { ...validationErrors };
    
    if (!staticData.network) {
      newErrors.staticNetwork = 'Network is required';
      hasError = true;
    } else if (!isValidNetwork(staticData.network)) {
      newErrors.staticNetwork = 'Invalid network format. Use format: 192.168.1.0';
      hasError = true;
    }
    
    if (!staticData.mask) {
      newErrors.staticMask = 'Subnet mask is required';
      hasError = true;
    } else if (!isValidSubnetMask(staticData.mask)) {
      newErrors.staticMask = 'Invalid subnet mask. Common masks: 255.255.255.0, 255.255.0.0, etc.';
      hasError = true;
    }
    
    if (!staticData.nextHop) {
      newErrors.staticNextHop = 'Next hop is required';
      hasError = true;
    } else if (!isValidIPAddress(staticData.nextHop)) {
      newErrors.staticNextHop = 'Invalid IP address format. Use format: 192.168.1.1';
      hasError = true;
    }
    
    setValidationErrors(newErrors);
    
    if (hasError) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const basePayload = {
        router_ip: connectionData.routerIp,
        ssh_username: connectionData.sshUsername,
        ssh_password: connectionData.sshPassword,
        network: staticData.network,
        mask: staticData.mask,
        next_hop: staticData.nextHop
      };

      const finalPayload = buildPayloadWithMachines(basePayload);
      
      const commandId = sendCommand('Configure_Static', finalPayload);
      
      if (!commandId) {
        throw new Error('Failed to send command');
      }

    } catch (error) {
      console.error('Error sending Static command:', error);
      alert('Error occurred. Try again');
      setLoading(false);
    }
  };

  const handleRefreshMachines = () => {
    console.log('Routing: Refreshing machine list');
    fetchMachineInfo();
  };

  const formatLastRefresh = () => {
    return lastRefresh ? lastRefresh.toLocaleTimeString() : 'Never';
  };

  useEffect(() => {
    if (!machineInfoListenerRef.current) {
      console.log('Routing Component Mounted - Setting up WebSocket listener');
      const removeListener = addListener(handleWebSocketMessage);
      machineInfoListenerRef.current = true;
      
      return () => {
        if (removeListener) removeListener();
        machineInfoListenerRef.current = false;
      };
    }
  }, [addListener, handleWebSocketMessage]);

  useEffect(() => {
    if (isConnected) {
      console.log('Routing: Connected, fetching machine info...');
      fetchMachineInfo();
    }
  }, [isConnected, fetchMachineInfo]);

  useEffect(() => {
    setValidationErrors(prev => ({
      ...prev,
      ripNetworks: [],
      ospfProcessId: '',
      ospfNetwork: '',
      ospfArea: '',
      staticNetwork: '',
      staticMask: '',
      staticNextHop: ''
    }));
    setError(null);
  }, [activeTab]);

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
                <p>No machines are currently marked with any roles.</p>
                <p>To configure routing, you need to mark at least one machine in Machine Management.</p>
              </div>
              
              <div className="modal-stats-grid">
                <div className="modal-stat-item">
                  <div className="modal-stat-label">MARKED MACHINES</div>
                  <div className="modal-stat-value">{markedMachines.length}</div>
                </div>
                <div className="modal-stat-item">
                  <div className="modal-stat-label">LAST REFRESH</div>
                  <div className="modal-stat-value">{formatLastRefresh()}</div>
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

  const MachineInfoPanel = () => {
    if (!showMachineInfo) return null;

    return (
      <div className="machine-info-panel">
        <div className="machine-info-header">
          <h3 className="machine-info-title">
            <Server size={20} />
            <span>Marked Machines ({markedMachines.length})</span>
          </h3>
          <button 
            className="close-panel-btn"
            onClick={() => setShowMachineInfo(false)}
            aria-label="Close machine info panel"
          >
            ×
          </button>
        </div>
        
        <div className="machine-info-content">
          {machinesLoading ? (
            <div className="loading-message">
              <div className="loading-spinner"></div>
              <p>Loading machines...</p>
            </div>
          ) : markedMachines.length === 0 ? (
            <div className="no-machines-info">
              <AlertCircle size={24} />
              <p>No marked machines found.</p>
              <button 
                className="btn-primary small"
                onClick={() => window.location.href = '/machine-management'}
              >
                Go to Machine Management
              </button>
            </div>
          ) : (
            <div className="machines-list-compact">
              {markedMachines.map(machine => (
                <div key={machine.id} className="machine-item-compact">
                  <div className="machine-item-header">
                    <span className="machine-name">{machine.name}</span>
                    <span className="machine-ip">{machine.ip}</span>
                  </div>
                  <div className="machine-item-details">
                    <span className="machine-user">User: {machine.username}</span>
                    {machine.marked_as && machine.marked_as.length > 0 && (
                      <div className="machine-roles-compact">
                        {machine.marked_as.map((mark, idx) => (
                          <span key={idx} className={`role-badge ${mark.role}`}>
                            {mark.role}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="routing-container">
      <div className="routing-content">
        <div className="routing-header">
          <h1 className="routing-title">Automation</h1>
          
          <div className="nav-buttons">
            {navButtons.map((button, index) => (
              <button
                key={index}
                className={`nav-button ${
                  button === 'Routing' ? 'nav-button-active' : 'nav-button-inactive'
                }`}
              >
                {button}
              </button>
            ))}
          </div>
        </div>
       
        <div className="routing-main-card">
          <div className="connection-header">
            <h2 className="form-title">Connection Details</h2>
          </div>
          
          <div className="connection-details-section">
            <div className="connection-grid">
              <div className="form-group">
                <label htmlFor="routerIp">
                  Router IP: <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="routerIp"
                  name="routerIp"
                  value={connectionData.routerIp}
                  onChange={(e) => setConnectionData({...connectionData, routerIp: e.target.value})}
                  placeholder="Enter Router IP (e.g., 192.168.1.1)"
                  disabled={loading}
                  required
                  className={validationErrors.routerIp ? 'input-error' : ''}
                />
                {validationErrors.routerIp && (
                  <div className="error-message-small">{validationErrors.routerIp}</div>
                )}
              </div>
              
              <div className="form-group">
                <label htmlFor="sshUsername">
                  SSH Username: <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="sshUsername"
                  name="sshUsername"
                  value={connectionData.sshUsername}
                  onChange={(e) => setConnectionData({...connectionData, sshUsername: e.target.value})}
                  placeholder="Enter SSH Username"
                  disabled={loading}
                  required
                  className={validationErrors.sshUsername ? 'input-error' : ''}
                />
                {validationErrors.sshUsername && (
                  <div className="error-message-small">{validationErrors.sshUsername}</div>
                )}
              </div>
              
              <div className="form-group">
                <label htmlFor="sshPassword">
                  SSH Password: <span className="required">*</span>
                </label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="sshPassword"
                    name="sshPassword"
                    value={connectionData.sshPassword}
                    onChange={(e) => setConnectionData({...connectionData, sshPassword: e.target.value})}
                    placeholder="Enter SSH Password"
                    disabled={loading}
                    required
                    className={validationErrors.sshPassword ? 'input-error' : ''}
                  />
                  <button 
                    type="button"
                    className="password-toggle-btn"
                    onClick={togglePasswordVisibility}
                    disabled={loading}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {validationErrors.sshPassword && (
                  <div className="error-message-small">{validationErrors.sshPassword}</div>
                )}
              </div>
            </div>
          </div>
          
          <div className="configuration-tabs">
            <button
              className={`configuration-tab ${activeTab === 'rip' ? 'active' : ''}`}
              onClick={() => setActiveTab('rip')}
              disabled={loading}
            >
              RIP
            </button>
            <button
              className={`configuration-tab ${activeTab === 'ospf' ? 'active' : ''}`}
              onClick={() => setActiveTab('ospf')}
              disabled={loading}
            >
              OSPF
            </button>
            <button
              className={`configuration-tab ${activeTab === 'static' ? 'active' : ''}`}
              onClick={() => setActiveTab('static')}
              disabled={loading}
            >
              Static
            </button>
          </div>
          
          <div className="configuration-form-container">
            {loading && (
              <div className="loading-message">
                <div className="loading-spinner"></div>
              </div>
            )}
            
            {error && (
              <div className="error-message">
                <p>Error: {error}</p>
                <button onClick={() => setError(null)}>Dismiss</button>
              </div>
            )}
            
            {!isConnected && (
              <div className="warning-message">
                <p>⚠️ Not connected to backend system. Please connect first.</p>
              </div>
            )}
            
            {activeTab === 'rip' && (
              <div className="configuration-form">
                <h2 className="form-title">RIP Configuration</h2>
                <p className="form-description">Add networks for RIP routing protocol</p>
                
                <div className="networks-list">
                  {ripNetworks.map((network, index) => (
                    <div key={index} className="network-item">
                      <div className="form-group">
                        <label htmlFor={`rip-network-${index}`}>
                          Network {index + 1}: <span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          id={`rip-network-${index}`}
                          value={network}
                          onChange={(e) => {
                            const newNetworks = [...ripNetworks];
                            newNetworks[index] = e.target.value;
                            setRipNetworks(newNetworks);
                          }}
                          placeholder={`e.g., 192.168.${index + 1}.0/24`}
                          disabled={loading}
                          required={index === 0}
                          className={validationErrors.ripNetworks[index] ? 'input-error' : ''}
                        />
                        {validationErrors.ripNetworks[index] && (
                          <div className="error-message-small">{validationErrors.ripNetworks[index]}</div>
                        )}
                      </div>
                      {ripNetworks.length > 1 && (
                        <button
                          className="config-button remove-button"
                          onClick={() => {
                            const newNetworks = ripNetworks.filter((_, i) => i !== index);
                            setRipNetworks(newNetworks);
                          }}
                          disabled={loading}
                        >
                          <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style={{marginRight: '8px'}}>
                            <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
                          </svg>
                          Remove Network
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                
                <div className="form-actions">
                  <button 
                    className="config-button add-button"
                    onClick={() => setRipNetworks([...ripNetworks, ''])}
                    disabled={loading}
                  >
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style={{marginRight: '8px'}}>
                      <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                    </svg>
                    Add Network
                  </button>
                  
                  <button 
                    className="config-button primary"
                    onClick={handleRipSubmit}
                    disabled={loading || validationErrors.ripNetworks.some(error => error) || !isConnected || markedMachines.length === 0}
                    title={markedMachines.length === 0 ? "No marked machines found. Please mark machines in Machine Management first." : ""}
                  >
                    {loading ? 'Sending...' : 'Configure RIP'}
                  </button>
                </div>
              </div>
            )}
            
            {activeTab === 'ospf' && (
              <div className="configuration-form">
                <h2 className="form-title">OSPF Configuration</h2>
                <p className="form-description">Configure OSPF routing protocol</p>
                
                <div className="form-group">
                  <label htmlFor="processId">
                    Process ID: <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="processId"
                    name="processId"
                    value={ospfData.processId}
                    onChange={(e) => setOspfData({...ospfData, processId: e.target.value})}
                    placeholder="Enter Process ID (e.g., 1)"
                    disabled={loading}
                    required
                    className={validationErrors.ospfProcessId ? 'input-error' : ''}
                  />
                  {validationErrors.ospfProcessId && (
                    <div className="error-message-small">{validationErrors.ospfProcessId}</div>
                  )}
                </div>
                
                <div className="form-group">
                  <label htmlFor="network">
                    Network: <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="network"
                    name="network"
                    value={ospfData.network}
                    onChange={(e) => setOspfData({...ospfData, network: e.target.value})}
                    placeholder="Enter Network (e.g., 192.168.1.0/24)"
                    disabled={loading}
                    required
                    className={validationErrors.ospfNetwork ? 'input-error' : ''}
                  />
                  {validationErrors.ospfNetwork && (
                    <div className="error-message-small">{validationErrors.ospfNetwork}</div>
                  )}
                </div>
                
                <div className="form-group">
                  <label htmlFor="area">
                    Area: <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="area"
                    name="area"
                    value={ospfData.area}
                    onChange={(e) => setOspfData({...ospfData, area: e.target.value})}
                    placeholder="Enter Area (e.g., 0 or 0.0.0.0)"
                    disabled={loading}
                    required
                    className={validationErrors.ospfArea ? 'input-error' : ''}
                  />
                  {validationErrors.ospfArea && (
                    <div className="error-message-small">{validationErrors.ospfArea}</div>
                  )}
                </div>
                
                <button 
                  className="config-button primary"
                  onClick={handleOspfSubmit}
                  disabled={loading || validationErrors.ospfProcessId || validationErrors.ospfNetwork || validationErrors.ospfArea || !isConnected || markedMachines.length === 0}
                  title={markedMachines.length === 0 ? "No marked machines found. Please mark machines in Machine Management first." : ""}
                >
                  {loading ? 'Sending...' : 'Configure OSPF'}
                </button>
              </div>
            )}
            
            {activeTab === 'static' && (
              <div className="configuration-form">
                <h2 className="form-title">Static Routing Configuration</h2>
                <p className="form-description">Configure static routing entries</p>
                
                <div className="form-group">
                  <label htmlFor="staticNetwork">
                    Network: <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="staticNetwork"
                    name="network"
                    value={staticData.network}
                    onChange={(e) => setStaticData({...staticData, network: e.target.value})}
                    placeholder="Enter Network (e.g., 192.168.1.0)"
                    disabled={loading}
                    required
                    className={validationErrors.staticNetwork ? 'input-error' : ''}
                  />
                  {validationErrors.staticNetwork && (
                    <div className="error-message-small">{validationErrors.staticNetwork}</div>
                  )}
                </div>
                
                <div className="form-group">
                  <label htmlFor="mask">
                    Mask: <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="mask"
                    name="mask"
                    value={staticData.mask}
                    onChange={(e) => setStaticData({...staticData, mask: e.target.value})}
                    placeholder="Enter Mask (e.g., 255.255.255.0)"
                    disabled={loading}
                    required
                    className={validationErrors.staticMask ? 'input-error' : ''}
                  />
                  {validationErrors.staticMask && (
                    <div className="error-message-small">{validationErrors.staticMask}</div>
                  )}
                </div>
                
                <div className="form-group">
                  <label htmlFor="nextHop">
                    Next Hop: <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="nextHop"
                    name="nextHop"
                    value={staticData.nextHop}
                    onChange={(e) => setStaticData({...staticData, nextHop: e.target.value})}
                    placeholder="Enter Next Hop (e.g., 192.168.1.1)"
                    disabled={loading}
                    required
                    className={validationErrors.staticNextHop ? 'input-error' : ''}
                  />
                  {validationErrors.staticNextHop && (
                    <div className="error-message-small">{validationErrors.staticNextHop}</div>
                  )}
                </div>
                
                <button 
                  className="config-button primary"
                  onClick={handleStaticSubmit}
                  disabled={loading || validationErrors.staticNetwork || validationErrors.staticMask || validationErrors.staticNextHop || !isConnected || markedMachines.length === 0}
                  title={markedMachines.length === 0 ? "No marked machines found. Please mark machines in Machine Management first." : ""}
                >
                  {loading ? 'Sending...' : 'Configure Static Route'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <MarkMachineModal />
      <MachineInfoPanel />

      {globalError && (
        <div className="error-message-global">
          <div className="error-icon">⚠️</div>
          <div className="error-text">{globalError}</div>
          <button 
            className="btn-close-error" 
            onClick={() => setGlobalError(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default Routing;