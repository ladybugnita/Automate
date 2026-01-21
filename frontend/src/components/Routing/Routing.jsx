import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import { Eye, EyeOff } from 'lucide-react';
import './Routing.css';

const Routing = () => {
  const { sendCommand, addListener } = useWebSocket();
  
  const navButtons = [
    'Dashboard', 'DNS Configuration', 'Event Viewer', 'DHCP', 'Users',
    'Resource Monitor', 'WDS', 'Networking', 'Machine Management',
    'Active Directory', 'Routing'
  ];
  
  const [activeTab, setActiveTab] = useState('rip');
  
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
    const validMasks = [
      '255.0.0.0', '255.128.0.0', '255.192.0.0', '255.224.0.0', '255.240.0.0',
      '255.248.0.0', '255.252.0.0', '255.254.0.0', '255.255.0.0', '255.255.128.0',
      '255.255.192.0', '255.255.224.0', '255.255.240.0', '255.255.248.0',
      '255.255.252.0', '255.255.254.0', '255.255.255.0', '255.255.255.128',
      '255.255.255.192', '255.255.255.224', '255.255.255.240', '255.255.255.248',
      '255.255.255.252', '255.255.255.254', '255.255.255.255'
    ];
    
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

  const validateConnectionData = () => {
    const newErrors = {...validationErrors };
    let hasError = false;

    if(!connectionData.routerIp) {
      newErrors.routerIp = 'Router IP is required';
      hasError = true;
    } else if (!isValidIPAddress(connectionData.routerIp)){
      newErrors.routerIp = 'Invalid IP address format. Use format: 192.168.1.1';
      hasError = true;
    } else {
      newErrors.routerIp = '';
    }

    if(!connectionData.sshUsername){
      newErrors.sshUsername = 'SSH Username is required';
      hasError = true;
    } else {
      newErrors.sshUsername = '';
    }

    if(!connectionData.sshPassword){
      newErrors.sshPassword = 'SSH Password is required';
      hasError = true;
    } else {
      newErrors.sshPassword ='';
    }
    setValidationErrors(newErrors);
    return !hasError;
  };

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

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };
  
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
  
  useEffect(() => {
    if (!addListener) return;

    const handleWebSocketResponse = (event) => {
      if (event.action === 'response') {
        setLoading(false);
        
        const response = event.result;
        const command = event.command;
        
        let responseMessage = '';
        if (typeof response === 'string') {
          responseMessage = response;
        } else if (response && response.message) {
          responseMessage = response.message;
        } else if (response && response.data) {
          responseMessage = JSON.stringify(response.data);
        }
        
        const lowerResponse = responseMessage.toLowerCase();
        if (command === 'configure_RIP') {
          if (lowerResponse.includes('rip done')) {
            alert('RIP configuration successful!');
            resetRIPForm();
            resetConnectionData();
          } else {
            alert('Error occurred. Try again');
          }
        }
        else if (command === 'configure_OSPF') {
          if (lowerResponse.includes('ospf done')) {
            alert('OSPF configuration successful!');
            resetOSPFForm(); 
            resetConnectionData();
          } else {
            alert('Error occurred. Try again');
          }
        }
        else if (command === 'Configure_Static') {
          if (lowerResponse.includes('static done')) {
            alert('Static route configuration successful!');
            resetStaticForm();
            resetConnectionData();
          } else {
            alert('Error occurred. Try again');
          }
        }
      }
    };

    const cleanup = addListener(handleWebSocketResponse);
    return () => {
      if (cleanup) cleanup();
    };
  }, [addListener]);

  const handleConnectionChange = (e) => {
    const { name, value } = e.target;
    setConnectionData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (name === 'routerIp') {
      if (value && !isValidIPAddress(value)) {
        setValidationErrors(prev => ({
          ...prev,
          routerIp: 'Invalid IP address format. Use format: 192.168.1.1'
        }));
      } else {
        setValidationErrors(prev => ({
          ...prev,
          routerIp: ''
        }));
      }
    }
  };

  const handleRipNetworkChange = (index, value) => {
    const newNetworks = [...ripNetworks];
    newNetworks[index] = value;
    setRipNetworks(newNetworks);
    
    const newRipErrors = [...validationErrors.ripNetworks];
    if (value && !isValidNetwork(value)) {
      newRipErrors[index] = 'Invalid network format. Use format: 192.168.1.0 or 192.168.1.0/24';
    } else {
      newRipErrors[index] = '';
    }
    
    setValidationErrors(prev => ({
      ...prev,
      ripNetworks: newRipErrors
    }));
  };

  const addRipNetwork = () => {
    setRipNetworks([...ripNetworks, '']);
    setValidationErrors(prev => ({
      ...prev,
      ripNetworks: [...prev.ripNetworks, '']
    }));
  };

  const removeRipNetwork = (index) => {
    if (ripNetworks.length > 1) {
      const newNetworks = ripNetworks.filter((_, i) => i !== index);
      setRipNetworks(newNetworks);
      
      const newRipErrors = validationErrors.ripNetworks.filter((_, i) => i !== index);
      setValidationErrors(prev => ({
        ...prev,
        ripNetworks: newRipErrors
      }));
    }
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
      const payload = {
        router_ip: connectionData.routerIp,
        ssh_username: connectionData.sshUsername,
        ssh_password: connectionData.sshPassword
      };
      validNetworks.forEach((network, index) => {
        payload[`network${index + 1}`] = network.trim();
      });

      console.log('Sending RIP command with payload:', payload);
      const commandId = sendCommand('configure_RIP', payload);
      
      if (!commandId) {
        throw new Error('Failed to send command');
      }

    } catch (error) {
      console.error('Error sending RIP command:', error);
      alert('Error occurred. Try again');
      setLoading(false);
    }
  };

  const handleOspfChange = (e) => {
    const { name, value } = e.target;
    setOspfData(prev => ({
      ...prev,
      [name]: value
    }));
    
    const newErrors = { ...validationErrors };
    
    if (name === 'processId') {
      if (value && !isValidNumeric(value)) {
        newErrors.ospfProcessId = 'Process ID must be a number';
      } else {
        newErrors.ospfProcessId = '';
      }
    } else if (name === 'network') {
      if (value && !isValidNetwork(value)) {
        newErrors.ospfNetwork = 'Invalid network format. Use format: 192.168.1.0/24';
      } else {
        newErrors.ospfNetwork = '';
      }
    } else if (name === 'area') {
      if (value && !isValidOSPFArea(value)) {
        newErrors.ospfArea = 'Invalid area. Use number (0-4294967295) or IP address format';
      } else {
        newErrors.ospfArea = '';
      }
    }
    
    setValidationErrors(newErrors);
  };

  const handleOspfSubmit = async () => {
    if (!validateConnectionData()){
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
      const payload = {
        router_ip: connectionData.routerIp,
        ssh_username: connectionData.sshUsername,
        ssh_password: connectionData.sshPassword,
        process_id: ospfData.processId,
        network: ospfData.network,
        area: ospfData.area
      };

      console.log('Sending OSPF command with payload:', payload);
      const commandId = sendCommand('configure_OSPF', payload);
      
      if (!commandId) {
        throw new Error('Failed to send command');
      }

    } catch (error) {
      console.error('Error sending OSPF command:', error);
      alert('Error occurred. Try again');
      setLoading(false);
    }
  };

  const handleStaticChange = (e) => {
    const { name, value } = e.target;
    setStaticData(prev => ({
      ...prev,
      [name]: value
    }));
    
    const newErrors = { ...validationErrors };
    
    if (name === 'network') {
      if (value && !isValidNetwork(value)) {
        newErrors.staticNetwork = 'Invalid network format. Use format: 192.168.1.0';
      } else {
        newErrors.staticNetwork = '';
      }
    } else if (name === 'mask') {
      if (value && !isValidSubnetMask(value)) {
        newErrors.staticMask = 'Invalid subnet mask. Common masks: 255.255.255.0, 255.255.0.0, etc.';
      } else {
        newErrors.staticMask = '';
      }
    } else if (name === 'nextHop') {
      if (value && !isValidIPAddress(value)) {
        newErrors.staticNextHop = 'Invalid IP address format. Use format: 192.168.1.1';
      } else {
        newErrors.staticNextHop = '';
      }
    }
    
    setValidationErrors(newErrors);
  };

  const handleStaticSubmit = async () => {
    if(!validateConnectionData()){
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
      const payload = {
        router_ip: connectionData.routerIp,
        ssh_username: connectionData.sshUsername,
        ssh_password: connectionData.sshPassword,
        network: staticData.network,
        mask: staticData.mask,
        next_hop: staticData.nextHop
      };

      console.log('Sending Static command with payload:', payload);
      const commandId = sendCommand('Configure_Static', payload);
      
      if (!commandId) {
        throw new Error('Failed to send command');
      }

    } catch (error) {
      console.error('Error sending Static command:', error);
      alert('Error occurred. Try again');
      setLoading(false);
    }
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
          <div className="connection-details-section">
            <h2 className="form-title">Connection Details</h2>
            <p className="form-description">Enter router SSH credentials for configuration</p>
            
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
                  onChange={handleConnectionChange}
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
                  onChange={handleConnectionChange}
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
                    onChange={handleConnectionChange}
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
                <p>Sending command to device...</p>
              </div>
            )}
            
            {error && (
              <div className="error-message">
                <p>Error: {error}</p>
                <button onClick={() => setError(null)}>Dismiss</button>
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
                          onChange={(e) => handleRipNetworkChange(index, e.target.value)}
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
                          onClick={() => removeRipNetwork(index)}
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
                    onClick={addRipNetwork}
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
                    disabled={loading || validationErrors.ripNetworks.some(error => error)}
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
                    onChange={handleOspfChange}
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
                    onChange={handleOspfChange}
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
                    onChange={handleOspfChange}
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
                  disabled={loading || validationErrors.ospfProcessId || validationErrors.ospfNetwork || validationErrors.ospfArea}
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
                    onChange={handleStaticChange}
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
                    onChange={handleStaticChange}
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
                    onChange={handleStaticChange}
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
                  disabled={loading || validationErrors.staticNetwork || validationErrors.staticMask || validationErrors.staticNextHop}
                >
                  {loading ? 'Sending...' : 'Configure Static Route'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Routing;