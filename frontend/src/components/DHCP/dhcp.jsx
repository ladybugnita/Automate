import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import './DHCP.css';

const AddressLeasesTable = ({ leases }) => {
  if (!leases || Object.keys(leases).length === 0) {
    return (
      <div className="empty-data">
        <i className="fas fa-network-wired"></i>
        <h4>No Active Leases Found</h4>
        <p>No address leases data available.</p>
      </div>
    );
  }

  return (
    <div className="leases-table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>IP Address</th>
            <th>Device Name</th>
            <th>MAC Address</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(leases).map(([leaseId, leaseData]) => (
            <tr key={leaseId} className={leaseData.state === 'Active' ? 'lease-active' : 'lease-inactive'}>
              <td className="ip-address">
                <code>{leaseData.ip || 'N/A'}</code>
              </td>
              <td className="device-name">
                {leaseData.name || 'Unknown Device'}
              </td>
              <td className="mac-address">
                <code>{leaseData.mac || 'N/A'}</code>
              </td>
              <td>
                <span className={`status-badge ${leaseData.state === 'Active' ? 'active' : 'inactive'}`}>
                  {leaseData.state || 'Unknown'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-footer">
        <div className="summary-info">
          Showing {Object.keys(leases).length} leases
        </div>
      </div>
    </div>
  );
};

const ScopeOptionsTable = ({ options }) => {
  if (!options || Object.keys(options).length === 0) {
    return (
      <div className="empty-data">
        <i className="fas fa-cogs"></i>
        <h4>No Scope Options Configured</h4>
        <p>No scope options data available.</p>
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Option</th>
          <th>Name</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(options).map(([optionId, optionData]) => (
          <tr key={optionId}>
            <td>{optionId}</td>
            <td>
              <div className="option-name">{optionData.name || `Option ${optionId}`}</div>
            </td>
            <td className="option-value">
              {Array.isArray(optionData.value) 
                ? optionData.value.join(', ') 
                : optionData.value || 'N/A'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const DHCP = () => {
  const { 
    sendCommand, 
    isConnected, 
    addListener, 
    installations, 
    INSTALLATION_STATUS,
    updateInstallationStatus
  } = useWebSocket();
  
  const [dhcpInstalled, setDhcpInstalled] = useState(null);
  const [scopes, setScopes] = useState({});
  const [selectedScope, setSelectedScope] = useState(null);
  const [scopeDetails, setScopeDetails] = useState(null);
  const [activeTab, setActiveTab] = useState('address-pool');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [dhcpMachines, setDhcpMachines] = useState([]);
  const [noDhcpConfigured, setNoDhcpConfigured] = useState(false);
  const [showNoDhcpModal, setShowNoDhcpModal] = useState(false);
  const [error, setError] = useState(null);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subnet_mask: '255.255.255.0',
    start_range: '',
    end_range: ''
  });

  const initialCheckDone = useRef(false);
  const refreshIntervalRef = useRef(null);
  const lastRefreshTimeRef = useRef(null);
  const dhcpDetailsCache = useRef({}); 
  const selectedScopeRef = useRef(null);
  const listenerAdded = useRef(false);
  const installationStarted = useRef(false);
  const dhcpMachinesRef = useRef([]);
  const dhcpMachineRef = useRef(null);
  const modalClosedRef = useRef(false);
  const mountedRef = useRef(false);
  const machineInfoListenerRef = useRef(false);
  
  const commandInProgressRef = useRef(false);
  const pendingCommandsRef = useRef([]);
  const lastDHCPCheckTimeRef = useRef(0);
  const lastDHCPInstallTimeRef = useRef(0);
  const commandCooldownTime = 1000; 

  const API_BASE_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:5000'
    : `http://${window.location.hostname}:5000`;

  const sendCommandWithFlow = useCallback((command, payload = null) => {
    const now = Date.now();
    
    if (command === 'check_dhcp_role_installed_server_ansible') {
      const timeSinceLastCheck = now - lastDHCPCheckTimeRef.current;
      if (timeSinceLastCheck < commandCooldownTime) {
        console.log(`DHCP: Skipping duplicate ${command} command (cooldown: ${commandCooldownTime - timeSinceLastCheck}ms remaining)`);
        return;
      }
      lastDHCPCheckTimeRef.current = now;
    }
    
    if (command === 'install_dhcp_role_server_ansible') {
      const timeSinceLastInstall = now - lastDHCPInstallTimeRef.current;
      if (timeSinceLastInstall < commandCooldownTime) {
        console.log(`DHCP: Skipping duplicate ${command} command (cooldown: ${commandCooldownTime - timeSinceLastInstall}ms remaining)`);
        return;
      }
      lastDHCPInstallTimeRef.current = now;
    }
    
    if (commandInProgressRef.current) {
      console.log(`DHCP: Command ${command} is already in progress, queueing...`);
      pendingCommandsRef.current.push({ command, payload });
      return;
    }
    
    commandInProgressRef.current = true;
    
    console.log(`DHCP: SENDING COMMAND: ${command}`, payload ? 'with payload' : 'no payload');
    
    sendCommand(command, payload);
    
    setTimeout(() => {
      commandInProgressRef.current = false;
      
      if (pendingCommandsRef.current.length > 0) {
        const nextCommand = pendingCommandsRef.current.shift();
        console.log(`DHCP: Processing queued command: ${nextCommand.command}`);
        sendCommandWithFlow(nextCommand.command, nextCommand.payload);
      }
    }, 500); 
  }, [sendCommand]);

  const processNextCommand = useCallback(() => {
    if (pendingCommandsRef.current.length > 0 && !commandInProgressRef.current) {
      const nextCommand = pendingCommandsRef.current.shift();
      console.log(`DHCP: Processing queued command: ${nextCommand.command}`);
      sendCommandWithFlow(nextCommand.command, nextCommand.payload);
    }
  }, [sendCommandWithFlow]);

  const getTotalScopesCount = () => {
    return Object.keys(scopes).length;
  };

  const getTotalLeasesCount = () => {
    let total = 0;
    if (scopeDetails?.addressleases) {
      total = Object.keys(scopeDetails.addressleases).length;
    }
    return total;
  };

  const getActiveLeasesCount = () => {
    let active = 0;
    if (scopeDetails?.addressleases) {
      active = Object.values(scopeDetails.addressleases).filter(lease => lease.state === 'Active').length;
    }
    return active;
  };

  const formatTimeSinceLastRefresh = () => {
    if (!lastRefreshTimeRef.current) return 'Never';
    
    const now = new Date();
    const diffInSeconds = Math.floor((now - lastRefreshTimeRef.current) / 1000);
    
    if (diffInSeconds < 60) {
      return `${diffInSeconds} seconds ago`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
  };

  const extractResult = (responseData) => {
    if (!responseData) return null;
    
    if (typeof responseData === 'string') {
      try {
        const parsed = JSON.parse(responseData);
        return parsed;
      } catch (e) {
        return responseData;
      }
    }
    
    return responseData;
  };

  const getServerInfoForMachine = (machine) => {
    if (!machine) {
      console.error('DHCP: No machine provided to getServerInfoForMachine');
      return null;
    }
    
    console.log(`DHCP: Getting server info for machine: ${machine.name || 'Unknown'} (${machine.ip})`);
    
    const password = machine.password || machine.password_provided || '';
    
    console.log(`DHCP: Password for machine ${machine.name || machine.ip}:`, password ? '***HIDDEN***' : 'NOT FOUND');
    
    if (!password) {
      console.error('DHCP: No password found for machine:', machine.name || machine.ip);
      setError(`No password found for machine: ${machine.name || machine.ip}. Please check machine credentials in Machine Management.`);
      return null;
    }
    
    return {
      ip: machine.ip,
      username: machine.username || machine.username_provided || 'admin',
      password: password,
      os_type: machine.os_type || '',
      sub_os_type: machine.sub_os_type || ''
    };
  };

  const fetchMachineInfo = useCallback(async () => {
    if (!mountedRef.current) {
      console.log('DHCP: Component not mounted, skipping machine fetch');
      return;
    }
    
    console.log('DHCP: Fetching machines from Node.js REST API...');
    setMachinesLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      console.log('DHCP: Trying to fetch machines WITH passwords...');
      
      const response = await fetch(`${API_BASE_URL}/api/machines/get-machines?include_password=true`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.log('DHCP: Endpoint with password parameter failed, trying without parameter...');
        
        const response2 = await fetch(`${API_BASE_URL}/api/machines/get-machines`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response2.ok) {
          throw new Error(`Failed to fetch machines: ${response2.status} ${response2.statusText}`);
        }
        
        const data = await response2.json();
        console.log('DHCP: Received machines from /api/machines/get-machines:', data);
        await processMachineData(data);
        return;
      }
      
      const data = await response.json();
      console.log('DHCP: Received machines from /api/machines/get-machines?include_password=true:', data);
      await processMachineData(data);
      
    } catch (err) {
      console.error('DHCP: REST API failed:', err);
      if (mountedRef.current) {
        setError(`Failed to fetch machines: ${err.message}. Please check if machines are properly configured.`);
        setMachinesLoading(false);
      }
      
      if (mountedRef.current && isConnected) {
        console.log('DHCP: Falling back to WebSocket for get_machine_info');
        sendCommandWithFlow('get_machine_info', {});
      }
    }
    
    async function processMachineData(data) {
      let machines = [];
      if (data.machines && Array.isArray(data.machines)) {
        machines = data.machines;
      } else if (data.data && Array.isArray(data.data)) {
        machines = data.data;
      } else if (Array.isArray(data)) {
        machines = data;
      }
      
      console.log('DHCP: Total machines found:', machines.length);
      
      const dhcpMachinesList = machines.filter(machine => {
        const hasMarks = machine.marked_as && 
                       Array.isArray(machine.marked_as) && 
                       machine.marked_as.some(mark => mark.role === 'dhcp');
        
        if (hasMarks) {
          console.log(`DHCP: Found DHCP machine: ${machine.name || 'Unknown'} (${machine.ip})`, {
            id: machine.id,
            hasPassword: !!(machine.password || machine.password_provided),
            hasUsername: !!(machine.username || machine.username_provided),
            os_type: machine.os_type,
            sub_os_type: machine.sub_os_type,
            marks: machine.marked_as
          });
        }
        
        return hasMarks;
      });
      
      console.log(`DHCP: Found ${dhcpMachinesList.length} DHCP machines:`, dhcpMachinesList);
      
      if (dhcpMachinesList.length === 0) {
        console.log('DHCP: No DHCP machines found');
        setNoDhcpConfigured(true);
        setShowNoDhcpModal(true);
        setMachinesLoading(false);
        setLoading(false);
        setCheckingStatus(false);
        return;
      }
      
      const machinesWithPasswords = dhcpMachinesList.filter(machine => {
        const hasPassword = machine.password || machine.password_provided;
        if (!hasPassword) {
          console.warn(`DHCP: Machine ${machine.name || 'Unknown'} (${machine.ip}) has no password`);
        }
        return hasPassword;
      });
      
      if (machinesWithPasswords.length === 0) {
        console.error('DHCP: No DHCP machines have passwords');
        setError('DHCP machines found but no passwords available. Please check machine credentials in Machine Management.');
        setNoDhcpConfigured(true);
        setShowNoDhcpModal(true);
      } else {
        setNoDhcpConfigured(false);
        setShowNoDhcpModal(false);
      }
      
      setDhcpMachines(dhcpMachinesList);
      dhcpMachinesRef.current = dhcpMachinesList;
      setMachinesLoading(false);
      
      checkDHCPOnMachine();
    }
  }, [API_BASE_URL, isConnected, sendCommandWithFlow]);

  const getMachineByType = () => {
    if (dhcpMachinesRef.current.length > 0) {
      return dhcpMachinesRef.current[0];
    }
    return null;
  };

  const createPayload = (additionalData = {}) => {
    const machine = getMachineByType();
    
    if (!machine) {
      console.error('DHCP: No DHCP machine found');
      return null;
    }
    
    const serverInfo = getServerInfoForMachine(machine);
    if (!serverInfo) {
      console.error('DHCP: Failed to get server info for DHCP machine:', machine.name);
      return null;
    }
    
    console.log(`DHCP: Creating payload for DHCP machine:`, machine.name);
    
    return {
      server_info: serverInfo,
      ...additionalData
    };
  };

  const handleWebSocketMessage = useCallback((message) => {
    console.log('DHCP received WebSocket message:', message);
    
    let command, result, error, payload;
    
    if (message.response) {
      const responseObj = message.response;
      command = responseObj.command;
      result = responseObj.result;
      error = responseObj.error;
      payload = responseObj.payload;
    } else if (message.type === 'COMMAND_RESPONSE') {
      command = message.command;
      result = message.result || message.data;
      error = message.error;
      payload = message.payload;
    } else if (message.action === 'response') {
      command = message.command;
      result = message.result;
      error = message.error;
      payload = message.payload;
    } else if (message.command) {
      command = message.command;
      result = message.result || message.data;
      error = message.error;
      payload = message.payload;
    } else if (message.message) {
      console.log('Backend log:', message.message);
      return;
    }
    
    if (!command) {
      console.log('No command found in message:', message);
      return;
    }
    
    console.log(`Processing response for command: ${command}`, { result, error, payload });
    
    if (error) {
      console.log(`Error from backend for command ${command}:`, error);
      setError(`Error: ${error}`);
      setLoading(false);
      setCheckingStatus(false);
      setMachinesLoading(false);
      commandInProgressRef.current = false;
      processNextCommand();
      return;
    }
    
    const responseData = extractResult(result);
    console.log('Extracted response data:', responseData);
    
    switch(command) {
      case 'get_machine_info':
        console.log('DHCP: Received machine info via WebSocket fallback');
        if (responseData && responseData.machines && Array.isArray(responseData.machines)) {
          const dhcpMachinesList = responseData.machines.filter(machine => {
            return machine.marked_as && Array.isArray(machine.marked_as) && 
                   machine.marked_as.some(mark => mark.role === 'dhcp');
          });
          
          console.log(`DHCP: Found ${dhcpMachinesList.length} DHCP machines via WebSocket:`, dhcpMachinesList);
          
          if (dhcpMachinesList.length === 0) {
            setNoDhcpConfigured(true);
            setShowNoDhcpModal(true);
            setMachinesLoading(false);
            setLoading(false);
            setCheckingStatus(false);
          } else {
            setDhcpMachines(dhcpMachinesList);
            dhcpMachinesRef.current = dhcpMachinesList;
            setNoDhcpConfigured(false);
            setShowNoDhcpModal(false);
            setMachinesLoading(false);
            checkDHCPOnMachine();
          }
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'check_dhcp_role_installed_server_ansible':
        console.log('Received response for DHCP check:', responseData);
        
        let isInstalled = false;
        
        if (typeof responseData === 'object' && responseData !== null) {
          if (responseData.installed === "true") {
            isInstalled = true;
          } else if (responseData.installed === "false") {
            isInstalled = false;
          } else if (responseData.installed !== undefined) {
            isInstalled = responseData.installed === true || 
                         responseData.installed === "true" ||
                         responseData.installed === "installed";
          }
        } else if (typeof responseData === 'string') {
          try {
            const parsed = JSON.parse(responseData);
            if (parsed.installed === "true") {
              isInstalled = true;
            } else if (parsed.installed === "false") {
              isInstalled = false;
            }
          } catch (e) {
            const resultLower = responseData.toLowerCase();
            isInstalled = resultLower.includes('true') || resultLower.includes('installed');
          }
        }
        
        console.log(`DHCP installed status: ${isInstalled}`);
        setDhcpInstalled(isInstalled);
        setCheckingStatus(false);
        setMachinesLoading(false);
        
        updateInstallationStatus('dhcp', 
          isInstalled ? INSTALLATION_STATUS.INSTALLED : INSTALLATION_STATUS.NOT_INSTALLED,
          isInstalled ? 100 : 0,
          isInstalled ? 'DHCP server is installed' : 'DHCP server is not installed'
        );
        
        if (isInstalled) {
          console.log('DHCP is installed, loading scopes...');
          setShowInstallModal(false);
          const payload = createPayload();
          if (payload) {
            sendCommandWithFlow('get_dhcp_details_server_ansible', payload);
            startAutoRefresh();
          }
        } else {
          console.log('DHCP not installed, showing install modal');
          setShowInstallModal(true);
        }
        
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'get_dhcp_details_server_ansible':
        console.log('Received DHCP details response:', responseData);
        
        let dhcpDetails = responseData;
        
        if (responseData && typeof responseData === 'object') {
          if (responseData.dhcp_details) {
            dhcpDetails = responseData.dhcp_details;
          } else if (responseData.result && responseData.result.dhcp_details) {
            dhcpDetails = responseData.result.dhcp_details;
          }
        } else if (typeof responseData === 'string') {
          try {
            const parsed = JSON.parse(responseData);
            if (parsed.dhcp_details) {
              dhcpDetails = parsed.dhcp_details;
            } else if (parsed.result && parsed.result.dhcp_details) {
              dhcpDetails = parsed.result.dhcp_details;
            }
          } catch (e) {
            console.log('Could not parse DHCP details as JSON');
          }
        }
        
        console.log('Processed DHCP details:', dhcpDetails);
        processDHCPDetails(dhcpDetails);
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'install_dhcp_role_server_ansible':
        console.log('DHCP installation response:', responseData);
        
        let installationSuccess = false;
        
        if (typeof responseData === 'string') {
          const resultLower = responseData.toLowerCase();
          installationSuccess = resultLower.includes('dhcp role installation done');
        } else if (typeof responseData === 'object') {
          const dataStr = JSON.stringify(responseData).toLowerCase();
          installationSuccess = dataStr.includes('dhcp role installation done') ||
                               responseData.message === 'dhcp role installation done' ||
                               responseData.result === 'dhcp role installation done';
        }
        
        if (installationSuccess) {
          console.log('DHCP installation successful!');
          
          updateInstallationStatus('dhcp', INSTALLATION_STATUS.INSTALLED, 100, 'DHCP server installed successfully');
          
          setShowInstallModal(false);
          setDhcpInstalled(true);
          installationStarted.current = false;
          setLoading(false);
          
          console.log('Installation done, checking status in 2 seconds...');
          setTimeout(() => {
            console.log('Sending check command after installation...');
            const payload = createPayload();
            if (payload) {
              sendCommandWithFlow('check_dhcp_role_installed_server_ansible', payload);
            }
          }, 2000);
        } else {
          console.log('DHCP installation failed:', responseData);
          setError(`Installation failed: ${JSON.stringify(responseData)}`);
          updateInstallationStatus('dhcp', INSTALLATION_STATUS.FAILED, 0, 'Installation failed');
          setLoading(false);
          installationStarted.current = false;
        }
        
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'configure_dhcp_scope_server_ansible':
        console.log('DHCP scope configuration response:', responseData);
        
        let scopeConfigured = false;
        
        if (typeof responseData === 'string') {
          console.log('String response from backend:', responseData);
          const resultLower = responseData.toLowerCase();
          scopeConfigured = resultLower.includes('dhcp scope configured');
        }

        else if (typeof responseData === 'object' && responseData !== null) {
          const dataStr = JSON.stringify(responseData).toLowerCase();
          scopeConfigured = dataStr.includes('dhcp scope configured') ||
                           responseData.message === 'dhcp scope configured' ||
                           responseData.result === 'dhcp scope configured' ||
                           responseData.success === true;
        }
        
        if (scopeConfigured) {
          console.log('DHCP scope configured successfully!');
          
          setShowCreateModal(false);
          resetForm();
          setLoading(false);
          
          setTimeout(() => {
            const successMessage = 'DHCP scope created successfully!';
            console.log(successMessage);

            alert(successMessage);
            setTimeout(() => {
            const payload = createPayload();
            if (payload) {
              sendCommandWithFlow('get_dhcp_details_server_ansible', payload);
            }
          }, 1000);
        }, 500);
        } else {
          console.log('DHCP scope configuration failed:', responseData);
          let errorMessage = 'Failed to create DHCP scope';
          if (typeof responseData === 'string') {
            errorMessage = responseData;
          } else if (typeof responseData === 'object'){
            errorMessage = responseData.error || responseData.message || JSON.stringify(responseData);
          }
          setError(errorMessage);
          setLoading(false);
        }
        
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      default:
        console.log(`Unhandled command: ${command}`);
        commandInProgressRef.current = false;
        processNextCommand();
    }
    
  }, [updateInstallationStatus, INSTALLATION_STATUS, sendCommandWithFlow, processNextCommand]);

  useEffect(() => {
    console.log('DHCP Component Mounted');
    mountedRef.current = true;
    
    fetchMachineInfo();
    
    return () => {
      console.log('DHCP Component Unmounting');
      mountedRef.current = false;
      stopAutoRefresh();
      modalClosedRef.current = false;
      commandInProgressRef.current = false;
      pendingCommandsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!machineInfoListenerRef.current && mountedRef.current) {
      console.log('DHCP: Setting up WebSocket listener');
      const removeListener = addListener(handleWebSocketMessage);
      machineInfoListenerRef.current = true;
      
      return () => {
        if (removeListener) {
          removeListener();
        }
        machineInfoListenerRef.current = false;
      };
    }
  }, [addListener, handleWebSocketMessage]);

  useEffect(() => {
    selectedScopeRef.current = selectedScope;
  }, [selectedScope]);

  useEffect(() => {
    if (dhcpMachines.length > 0 && !machinesLoading) {
      console.log('DHCP: DHCP machines loaded, checking DHCP status...');
      checkDHCPOnMachine();
    }
  }, [dhcpMachines, machinesLoading]);

  const checkDHCPOnMachine = () => {
    const machine = getMachineByType();
    if (!machine) {
      console.error('No DHCP machine found');
      setError('No DHCP machine configured');
      setDhcpInstalled(false); 
      setCheckingStatus(false);
      setMachinesLoading(false);
      return;
    }
    
    const payload = createPayload();
    
    if (!payload) {
      console.error('Failed to create payload for DHCP check');
      setError('Failed to create payload');
      setDhcpInstalled(false); 
      setCheckingStatus(false);
      setMachinesLoading(false);
      return;
    }
    
    console.log('SENDING COMMAND: check_dhcp_role_installed_server_ansible');
    sendCommandWithFlow('check_dhcp_role_installed_server_ansible', payload);
  };

  const startAutoRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    refreshIntervalRef.current = setInterval(() => {
      if (dhcpInstalled && isConnected) {
        console.log('Auto-refreshing DHCP data...');
        lastRefreshTimeRef.current = new Date();
        const payload = createPayload();
        if (payload) {
          sendCommandWithFlow('get_dhcp_details_server_ansible', payload);
        }
      }
    }, 30000);

    lastRefreshTimeRef.current = new Date();
  };

  const stopAutoRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  };

  const loadScopes = () => {
    if (!dhcpInstalled) {
      console.log('DHCP not installed, skipping loadScopes');
      return;
    }
    
    console.log('Loading DHCP scopes...');
    
    setLoading(true);
    lastRefreshTimeRef.current = new Date();
    
    const payload = createPayload();
    if (payload) {
      console.log('SENDING COMMAND: get_dhcp_details_server_ansible');
      sendCommandWithFlow('get_dhcp_details_server_ansible', payload);
    }
  };

  const processDHCPDetails = (dhcpDetails) => {
    console.log('Processing DHCP details:', dhcpDetails);
    
    const currentSelectedScope = selectedScopeRef.current;
    console.log('Current selected scope (from ref):', currentSelectedScope);
    
    if (!dhcpDetails) {
      console.log('No DHCP details to process');
      setScopes({});
      setScopeDetails(null);
      setLoading(false);
      return;
    }
    
    console.log('DHCP details to process:', dhcpDetails);
    
    dhcpDetailsCache.current = dhcpDetails;
    
    if (typeof dhcpDetails === 'object' && dhcpDetails !== null) {
      const scopesMap = {};
      
      Object.entries(dhcpDetails).forEach(([scopeId, scopeData]) => {
        console.log(`Processing scope ${scopeId}:`, scopeData);
        
        if (scopeData && typeof scopeData === 'object') {
          scopesMap[scopeId] = {
            name: scopeData.name || scopeId,
            subnet: '255.255.255.0',
            description: scopeData.description || ''
          };
        }
      });
      
      console.log('Setting scopes:', scopesMap);
      setScopes(scopesMap);
      
      if (currentSelectedScope && dhcpDetails[currentSelectedScope]) {
        const scopeData = dhcpDetails[currentSelectedScope];
        const updatedScopeDetails = {
          scopename: scopeData.name || currentSelectedScope,
          description: scopeData.description || '',
          subnetmask: '255.255.255.0',
          addresspool: scopeData.address_pool || {},
          addressleases: scopeData.address_leases || {},
          scopeoptions: scopeData.scope_options || {}
        };
        console.log('Setting scope details for', currentSelectedScope, ':', updatedScopeDetails);
        setScopeDetails(updatedScopeDetails);
      } 
      else if (!currentSelectedScope && Object.keys(scopesMap).length > 0) {
        const firstScopeId = Object.keys(scopesMap)[0];
        console.log('Auto-selecting first scope:', firstScopeId);
        setSelectedScope(firstScopeId);
        selectedScopeRef.current = firstScopeId;
        
        const scopeData = dhcpDetails[firstScopeId];
        const firstScopeDetails = {
          scopename: scopeData.name || firstScopeId,
          description: scopeData.description || '',
          subnetmask: '255.255.255.0',
          addresspool: scopeData.address_pool || {},
          addressleases: scopeData.address_leases || {},
          scopeoptions: scopeData.scope_options || {}
        };
        setScopeDetails(firstScopeDetails);
      }
      else if (currentSelectedScope && !dhcpDetails[currentSelectedScope] && Object.keys(scopesMap).length > 0) {
        const firstScopeId = Object.keys(scopesMap)[0];
        console.log('Selected scope not found, selecting first available:', firstScopeId);
        setSelectedScope(firstScopeId);
        selectedScopeRef.current = firstScopeId;
        
        const scopeData = dhcpDetails[firstScopeId];
        const firstScopeDetails = {
          scopename: scopeData.name || firstScopeId,
          description: scopeData.description || '',
          subnetmask: '255.255.255.0',
          addresspool: scopeData.address_pool || {},
          addressleases: scopeData.address_leases || {},
          scopeoptions: scopeData.scope_options || {}
        };
        setScopeDetails(firstScopeDetails);
      }
    } else {
      console.log('No valid scope data found in response');
      setScopes({});
      setScopeDetails(null);
    }
    
    setLoading(false);
  };

  const handleTabChange = (tab) => {
    console.log(`Tab changed to: ${tab}`);
    setActiveTab(tab);
  };

  useEffect(() => {
    if (selectedScope && dhcpInstalled) {
      console.log(`Scope changed to: ${selectedScope}, fetching details...`);
      
      setLoading(true);
      loadScopes();
    }
  }, [selectedScope, dhcpInstalled]);

  const selectScope = (scopeId) => {
    console.log(`Selecting scope: ${scopeId}`);
    
    setSelectedScope(scopeId);
    setActiveTab('address-pool');
    
    if (dhcpDetailsCache.current[scopeId]) {
      console.log('Using cached data for scope:', scopeId);
      const scopeData = dhcpDetailsCache.current[scopeId];
      const updatedScopeDetails = {
        scopename: scopeData.name || scopeId,
        description: scopeData.description || '',
        subnetmask: '255.255.255.0',
        addresspool: scopeData.address_pool || {},
        addressleases: scopeData.address_leases || {},
        scopeoptions: scopeData.scope_options || {}
      };
      console.log('Setting scope details from cache:', updatedScopeDetails);
      setScopeDetails(updatedScopeDetails);
    }
    
    if (dhcpInstalled) {
      setLoading(true);
      loadScopes();
    }
  };

  const createScope = () => {
    if (currentStep < 2) {
      setCurrentStep(2);
      return;
    }
    
    if (!formData.start_range || !formData.end_range) {
      setError('Please enter start and end IP addresses');
      return;
    }
    
    if (!formData.name) {
      setError('Please enter a scope name');
      return;
    }
    
    console.log('Creating DHCP scope...');
    
    const payload = createPayload({
      scope_name: formData.name,
      start_range: formData.start_range,
      end_range: formData.end_range,
      subnet_mask: formData.subnet_mask,
      description: formData.description || ''
    });
    
    if (!payload) {
      setError('Failed to create payload. Check machine configuration.');
      return;
    }
    
    console.log('Payload:', payload);
    
    setLoading(true);
    setError(null);
    
    sendCommandWithFlow('configure_dhcp_scope_server_ansible', payload);
  };

  const checkDHCPInstallation = () => {
    if (!isConnected) {
      console.log('WebSocket not connected, skipping DHCP check');
      return;
    }
    
    console.log('Checking DHCP installation...');
    const payload = createPayload();
    if (payload) {
      console.log('SENDING COMMAND: check_dhcp_role_installed_server_ansible');
      sendCommandWithFlow('check_dhcp_role_installed_server_ansible', payload);
    }
  };

  const installDHCP = () => {
    if (installations.dhcp?.status === INSTALLATION_STATUS.INSTALLING) {
      console.log('Installation already in progress');
      return;
    }

    console.log('Starting DHCP installation...');
    
    const payload = createPayload();
    if (!payload) {
      setError('Failed to create payload. Check machine configuration.');
      return;
    }
    
    setLoading(true);
    setError(null);
    installationStarted.current = true;
    
    updateInstallationStatus('dhcp', INSTALLATION_STATUS.INSTALLING, 0, 'Starting DHCP installation...');
    
    sendCommandWithFlow('install_dhcp_role_server_ansible', payload);
  };

  const checkDHCPAgain = () => {
    console.log('Checking DHCP status again...');
    setCheckingStatus(true);
    setError(null);
    
    setTimeout(() => {
      checkDHCPInstallation();
    }, 500);
  };

  const deleteScope = () => {
    if (!selectedScope) {
      setError('No scope selected');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete scope "${selectedScope}"?`)) {
      console.log(`Delete scope functionality needs to be implemented with backend`);
      setError('Delete functionality requires backend implementation');
    }
  };

  const calculateAddressCount = (startIP, endIP) => {
    if (!startIP || !endIP) return 0;
    
    const ipToInt = (ip) => {
      const parts = ip.split('.').map(Number);
      return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
    };
    
    const start = ipToInt(startIP);
    const end = ipToInt(endIP);
    
    return Math.abs(end - start) + 1;
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      subnet_mask: '255.255.255.0',
      start_range: '',
      end_range: ''
    });
    setCurrentStep(1);
    setError(null);
  };

  const handleFormChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const getTotalAddresses = () => {
    if (!formData.start_range || !formData.end_range) return 0;
    return calculateAddressCount(formData.start_range, formData.end_range);
  };

  // ============ RENDER FUNCTIONS ============

  const renderMachineInfo = () => {
    const machine = getMachineByType();
    if (!machine) {
      return null;
    }
    
    return (
      <div className="machine-info-panel">
        <h4>Configured DHCP Machine</h4>
        <div className="machine-info-item">
          <div className="machine-status">
            <span className={`status-dot ${dhcpInstalled === true ? 'installed' : 'not-installed'}`}></span>
            <span className="machine-name">Server: {machine.name}</span>
          </div>
          <div className="machine-details">
            <span className="machine-ip">IP: {machine.ip}</span>
            <span className="machine-status-text">
              Status: {dhcpInstalled === null ? 'Checking...' : dhcpInstalled === true ? 'Installed' : 'Not installed'}
            </span>
          </div>
        </div>
        <div className="machine-actions">
          <button 
            className="btn-refresh-machines-small"
            onClick={fetchMachineInfo}
            disabled={machinesLoading || commandInProgressRef.current}
          >
            {machinesLoading ? 'Refreshing...' : 'Refresh Machines'}
          </button>
        </div>
      </div>
    );
  };

  const handleCloseNoDhcpModal = () => {
    console.log('Closing No DHCP modal');
    setShowNoDhcpModal(false);
    setDhcpInstalled(false); 
    modalClosedRef.current = true;
  };

  const handleCloseInstallModal = () => {
    console.log('Closing Install modal');
    setShowInstallModal(false);
    setDhcpInstalled(false); 
    modalClosedRef.current = true;
  };

  const NoDhcpModal = () => {
    if (!showNoDhcpModal) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">No DHCP Machines Found</h3>
            </div>
            <div className="modal-body">
              <div className="modal-message">
                <p>No machines are currently marked as DHCP role.</p>
                <p>To manage DHCP configuration, you need to mark at least one machine in Machine Management.</p>
              </div>
              
              <div className="modal-stats-grid">
                <div className="modal-stat-item">
                  <div className="modal-stat-label">TOTAL SCOPES</div>
                  <div className="modal-stat-value">{getTotalScopesCount()}</div>
                </div>
                <div className="modal-stat-item">
                  <div className="modal-stat-label">TOTAL LEASES</div>
                  <div className="modal-stat-value">{getTotalLeasesCount()}</div>
                </div>
                <div className="modal-stat-item">
                  <div className="modal-stat-label">ACTIVE LEASES</div>
                  <div className="modal-stat-value">{getActiveLeasesCount()}</div>
                </div>
                <div className="modal-stat-item">
                  <button 
                    className="modal-refresh-btn"
                    onClick={fetchMachineInfo}
                    disabled={machinesLoading || commandInProgressRef.current}
                  >
                    {machinesLoading ? 'Loading...' : 'Refresh Machines'}
                  </button>
                </div>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="modal-btn-primary"
                  onClick={() => {
                    setShowNoDhcpModal(false);
                    window.location.href = '/machine-management';
                  }}
                >
                  Go to Machine Management
                </button>
                <button 
                  className="modal-btn-secondary"
                  onClick={() => {
                    setShowNoDhcpModal(false);
                    fetchMachineInfo();
                  }}
                  disabled={machinesLoading || commandInProgressRef.current}
                >
                  {machinesLoading ? 'Loading...' : 'Refresh Machine List'}
                </button>
                <button 
                  className="modal-btn-tertiary"
                  onClick={() => setShowNoDhcpModal(false)}
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

  const renderInstallModal = () => {
    if (!showInstallModal || showNoDhcpModal) return null;
    
    const machine = getMachineByType();
    
    if (!machine) {
      return null;
    }

    return (
      <div className="dhcp-install-modal-overlay">
        <div className="dhcp-install-modal">
          <div className="modal-header">
            <h2><div style={{ color: 'red', fontSize: '17px' }}>DHCP Server Required!</div></h2>
            <button 
              className="btn-close-modal"
              onClick={handleCloseInstallModal}
              disabled={installations.dhcp?.status === INSTALLATION_STATUS.INSTALLING || loading || commandInProgressRef.current}
            >
              ×
            </button>
          </div>
          <div className="modal-content">
            <div className="warning-icon">
              <i className="fas fa-exclamation-triangle fa-3x" style={{ color: '#ff9800' }}></i>
            </div>
            <h3>DHCP Server Not Installed</h3>
            <p>The DHCP server role is not installed on this system. You need to install it to manage DHCP scopes.</p>
            
            <div className="warning-note">
              <i className="fas fa-info-circle"></i>
              <div>
                <p className="note-title">Important Information:</p>
                <ul>
                  <li>This will install DHCP Server role via Ansible</li>
                  <li>System restart may be required</li>
                  <li>Ensure you have administrator privileges</li>
                  <li>Installation may take several minutes</li>
                  <li>The role will be permanently installed</li>
                  <li>Using credentials from database for the machine</li>
                </ul>
              </div>
            </div>
            
            {renderMachineInfo()}
            
            <div className="connection-status-small">
              <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
              WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
              {machinesLoading && <span className="machines-loading"> | Loading machines...</span>}
              {commandInProgressRef.current && <span className="command-loading"> | Command in progress...</span>}
            </div>
            
          </div>
          <div className="modal-footer">
            <button 
              className="btn-primary" 
              onClick={installDHCP}
              disabled={!isConnected || installations.dhcp?.status === INSTALLATION_STATUS.INSTALLING || checkingStatus || loading || machinesLoading || commandInProgressRef.current}
            >
              {installations.dhcp?.status === INSTALLATION_STATUS.INSTALLING || loading ? (
                <>
                  <div className="mini-spinner"></div> Installing...
                </>
              ) : (
                <>
                  <i className="fas fa-download"></i> Install DHCP Server
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const shouldShowLoading = () => {
    if (modalClosedRef.current) return false;
    if (machinesLoading) return true;
    if (checkingStatus && dhcpMachines.length > 0) return true;
    if (dhcpInstalled === null && !showNoDhcpModal && !showInstallModal && dhcpMachines.length > 0) return true;
    return false;
  };

  if (shouldShowLoading()) {
    return (
      <div className="dhcp-loading">
        <div className="spinner"></div>
        <p>{machinesLoading ? 'Loading Machine Information...' : 'Checking DHCP Server Status...'}</p>
        <p className="loading-subtext">
          {machinesLoading ? 'Fetching machine data from API...' : 'Please wait while we check if DHCP is installed...'}
        </p>
        {commandInProgressRef.current && (
          <p className="command-progress-text">Command in progress...</p>
        )}
      </div>
    );
  }

  if (installations.dhcp?.status === INSTALLATION_STATUS.INSTALLING) {
    const machine = getMachineByType();
    return (
      <div className="dhcp-installation-progress">
        <div className="installation-container">
          <div className="installation-icon">
            <i className="fas fa-download fa-3x"></i>
          </div>
          <h2>Installing DHCP Server...</h2>
          <div className="progress-section">
            <p className="progress-message">{installations.dhcp.message || 'Installing DHCP server role...'}</p>
            <div className="progress-bar-container">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${installations.dhcp.progress || 0}%` }}></div>
              </div>
              <div className="progress-text">{installations.dhcp.progress || 0}%</div>
            </div>
          </div>
          <div className="installation-info">
            <p><i className="fas fa-info-circle"></i> Installation is in progress on server: {machine ? machine.ip : 'Unknown'}</p>
            <p><i className="fas fa-clock"></i> This may take several minutes. Please wait...</p>
            <div className="navigation-note">
              <i className="fas fa-external-link-alt"></i> 
              <div>
                <p className="note-title">You can navigate away</p>
                <p>Installation continues in background. You can visit other pages and come back later.</p>
              </div>
            </div>
          </div>
          <button 
            className="btn-secondary"
            onClick={checkDHCPAgain}
            style={{ marginTop: '20px' }}
            disabled={commandInProgressRef.current}
          >
            <i className="fas fa-sync-alt"></i> Check Installation Status
          </button>
        </div>
      </div>
    );
  }

  if (noDhcpConfigured && showNoDhcpModal) {
    return <NoDhcpModal />;
  }

  if (showInstallModal && !dhcpInstalled) {
    return renderInstallModal();
  }

  if (dhcpInstalled === null && !checkingStatus && dhcpMachines.length > 0) {
    return (
      <div className="dhcp-empty-state">
        <div className="empty-icon">
          <i className="fas fa-dhcp fa-4x"></i>
        </div>
        <h2>DHCP Configuration</h2>
        <p>Unable to determine DHCP status. Please check the connection.</p>
        <button 
          className="btn-primary"
          onClick={() => {
            modalClosedRef.current = false;
            setCheckingStatus(true);
            setDhcpInstalled(null);
            fetchMachineInfo();
          }}
          disabled={machinesLoading || commandInProgressRef.current}
        >
          <i className="fas fa-sync-alt"></i> Check Again
        </button>
      </div>
    );
  }

  const machine = getMachineByType();

  return (
    <div className="dhcp-container">
      <NoDhcpModal />
      {renderInstallModal()}
      
      {error && (
        <div className="error-message" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }}>
          <div className="error-icon">⚠️</div>
          <div className="error-text">{error}</div>
          <button className="btn-close-error" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-scope-modal">
            <div className="modal-header">
              <h2>Create New DHCP Scope</h2>
              <button className="close-btn" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="step-indicator-container">
              <div className="step-indicators">
                <div className={`step-indicator ${currentStep >= 1 ? 'active' : ''}`}>1</div>
                <div className="step-line"></div>
                <div className={`step-indicator ${currentStep >= 2 ? 'active' : ''}`}>2</div>
              </div>
              <div className="step-labels">
                <span className={currentStep === 1 ? 'active' : ''}>Basic Information</span>
                <span className={currentStep === 2 ? 'active' : ''}>Address Range</span>
              </div>
            </div>
            
            <div className="modal-content">
              {currentStep === 1 ? (
                <div className="step-content">
                  <div className="form-group">
                    <label htmlFor="name">
                      Scope Name <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      value={formData.name}
                      onChange={handleFormChange}
                      placeholder="e.g., Corporate Network"
                      required
                    />
                    <p className="help-text">A descriptive name for the scope</p>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="description">Description</label>
                    <textarea
                      id="description"
                      value={formData.description}
                      onChange={handleFormChange}
                      rows="3"
                      placeholder="Describe the purpose of this scope..."
                    />
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="subnet_mask">
                        Subnet Mask <span className="required">*</span>
                      </label>
                      <input
                        type="text"
                        id="subnet_mask"
                        value={formData.subnet_mask}
                        onChange={handleFormChange}
                        placeholder="255.255.255.0"
                        required
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="step-content">
                  <div className="form-group">
                    <label htmlFor="start_range">
                      Start IP Address <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="start_range"
                      value={formData.start_range}
                      onChange={handleFormChange}
                      placeholder="192.168.1.100"
                      required
                    />
                    <p className="help-text">The first IP address in the pool</p>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="end_range">
                      End IP Address <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="end_range"
                      value={formData.end_range}
                      onChange={handleFormChange}
                      placeholder="192.168.1.200"
                      required
                    />
                    <p className="help-text">The last IP address in the pool</p>
                  </div>
                  
                  <div className="range-summary">
                    <h4>Address Range Summary</h4>
                    <div className="summary-grid">
                      <div>
                        <div className="summary-label">Total Addresses</div>
                        <div className="summary-value">{getTotalAddresses()}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                      Note: Scope creation may take a few moments
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <div>
                {currentStep > 1 && (
                  <button className="btn-secondary" onClick={() => setCurrentStep(1)}>
                    <i className="fas fa-arrow-left"></i> Back
                  </button>
                )}
              </div>
              <div className="footer-right">
                <button className="btn-secondary" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                  Cancel
                </button>
                {currentStep < 2 ? (
                  <button className="btn-primary" onClick={() => setCurrentStep(2)}>
                    Next <i className="fas fa-arrow-right"></i>
                  </button>
                ) : (
                  <button 
                    className="btn-success" 
                    onClick={createScope}
                    disabled={loading || machinesLoading || commandInProgressRef.current}
                  >
                    {loading ? (
                      <>
                        <div className="mini-spinner"></div> Creating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-check"></i> Create Scope
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="dhcp-layout">
        <div className="dhcp-sidebar">
          <div className="sidebar-header">
            <div className="dhcp-icon">
              <i className="fas fa-dhcp"></i>
            </div>
            <div>
              <h2>DHCP Server</h2>
              <p>Dynamic Host Configuration</p>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>
                <i className="fas fa-sync-alt"></i> Auto-refresh
                <div>Server: {machine ? machine.ip : 'Not configured'}</div>
              </div>
            </div>
          </div>
          
          {renderMachineInfo()}
          
          <div className="sidebar-section">
            <div className="section-header">
              <div className="section-title">
                <div className="ipv4-dot"></div>
                <h3>IPv4</h3>
              </div>
              <div className="status-badge active">Active</div>
            </div>
            
            <div className="scopes-list">
              {Object.keys(scopes).length === 0 ? (
                <div className="no-scopes-message">
                  <i className="fas fa-inbox"></i>
                  <p>No scopes configured</p>
                  <button 
                    className="btn-primary btn-sm"
                    onClick={() => setShowCreateModal(true)}
                    style={{ marginTop: '10px', padding: '5px 10px', fontSize: '12px' }}
                    disabled={machinesLoading || commandInProgressRef.current}
                  >
                    <i className="fas fa-plus"></i> Create Scope
                  </button>
                </div>
              ) : (
                Object.entries(scopes).map(([scopeId, scopeData]) => (
                  <div
                    key={scopeId}
                    className={`scope-item ${selectedScope === scopeId ? 'active' : ''}`}
                    onClick={() => selectScope(scopeId)}
                  >
                    <div className="scope-info">
                      <div className="scope-name">{scopeData.name || scopeId}</div>
                      <div className="scope-subnet">{scopeData.subnet || '255.255.255.0'}</div>
                    </div>
                    <div className="status-dot active"></div>
                  </div>
                ))
              )}
            </div>
            
            <button 
              className="add-scope-btn"
              onClick={() => setShowCreateModal(true)}
              disabled={machinesLoading || commandInProgressRef.current}
            >
              <i className="fas fa-plus-circle"></i>
              Add Scope
            </button>
          </div>
          
          <div className="sidebar-section">
            <div className="section-header">
              <div className="section-title">
                <div className="ipv6-dot"></div>
                <h3>IPv6</h3>
              </div>
              <div className="status-badge inactive">Inactive</div>
            </div>
            <p className="section-description">No IPv6 scopes configured</p>
          </div>
          
          <div className="sidebar-section">
            <h3>Statistics</h3>
            <div className="statistics">
              <div className="stat-item">
                <span className="stat-label">Total Scopes</span>
                <span className="stat-value">{Object.keys(scopes).length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Active Leases</span>
                <span className="stat-value">
                  {scopeDetails?.addressleases ? 
                    Object.values(scopeDetails.addressleases).filter(lease => lease.state === 'Active').length 
                    : 0
                  }
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Available IPs</span>
                <span className="stat-value">
                  {scopeDetails?.addresspool?.start_range && scopeDetails?.addresspool?.end_range
                    ? calculateAddressCount(scopeDetails.addresspool.start_range, scopeDetails.addresspool.end_range)
                    : 0
                  }
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Last Updated</span>
                <span className="stat-value" style={{ fontSize: '12px' }}>
                  {formatTimeSinceLastRefresh()}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="dhcp-main">
          <div className="top-bar">
            <div>
              <h1>DHCP Management</h1>
              <p className="scope-path">
                {selectedScope 
                  ? `IPv4 > ${scopes[selectedScope]?.name || selectedScope}` 
                  : 'Select a scope to view details'
                }
              </p>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                <span>Server: {machine ? machine.ip : 'Not configured'}</span>
                <span style={{ marginLeft: '15px' }}>
                  <i className="fas fa-sync-alt" style={{ marginRight: '5px' }}></i>
                </span>
                <span style={{ marginLeft: '15px', color: '#28a745' }}>
                  Last refresh: {formatTimeSinceLastRefresh()}
                </span>
                {loading && (
                  <span style={{ marginLeft: '15px', color: '#007bff' }}>
                    <i className="fas fa-spinner fa-spin" style={{ marginRight: '5px' }}></i>
                    Loading...
                  </span>
                )}
                {machinesLoading && (
                  <span style={{ marginLeft: '15px', color: '#ff9800' }}>
                    <i className="fas fa-spinner fa-spin" style={{ marginRight: '5px' }}></i>
                    Loading machines...
                  </span>
                )}
                {commandInProgressRef.current && (
                  <span style={{ marginLeft: '15px', color: '#9c27b0' }}>
                    <i className="fas fa-spinner fa-spin" style={{ marginRight: '5px' }}></i>
                    Command in progress...
                  </span>
                )}
              </div>
            </div>
            <div className="top-bar-actions">
              <button 
                className="btn-secondary"
                onClick={loadScopes}
                disabled={loading || !dhcpInstalled || machinesLoading || commandInProgressRef.current}
              >
                <i className="fas fa-sync-alt"></i>
                Refresh Now
              </button>
              <button 
                className="btn-primary"
                onClick={() => setShowCreateModal(true)}
                disabled={machinesLoading || commandInProgressRef.current}
              >
                <i className="fas fa-plus"></i>
                Add Scope
              </button>
              <button 
                className="btn-refresh-machines-small"
                onClick={fetchMachineInfo}
                disabled={machinesLoading || commandInProgressRef.current}
                style={{ marginLeft: '10px' }}
              >
                {machinesLoading ? 'Refreshing...' : 'Refresh Machines'}
              </button>
            </div>
          </div>
          
          <div className="main-content">
            {Object.keys(scopes).length === 0 ? (
              <div className="empty-state no-scopes">
                <div className="empty-icon">
                  <i className="fas fa-database"></i>
                </div>
                <h2>No DHCP Scopes Found</h2>
                <p>You haven't created any DHCP scopes yet. Create your first scope to start managing IP addresses.</p>
                <button 
                  className="btn-primary"
                  onClick={() => setShowCreateModal(true)}
                  disabled={machinesLoading || commandInProgressRef.current}
                >
                  <i className="fas fa-plus"></i>
                  Create First Scope
                </button>
              </div>
            ) : !selectedScope ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <i className="fas fa-dhcp"></i>
                </div>
                <h2>No Scope Selected</h2>
                <p>Select a DHCP scope from the sidebar to view its details, or create a new scope to get started.</p>
                <button 
                  className="btn-primary"
                  onClick={() => setShowCreateModal(true)}
                  disabled={machinesLoading || commandInProgressRef.current}
                >
                  <i className="fas fa-plus"></i>
                  Create New Scope
                </button>
              </div>
            ) : (
              <div className="scope-details">
                <div className="scope-header">
                  <div>
                    <div className="scope-title">
                      <h2>{scopeDetails?.scopename || selectedScope}</h2>
                      <span className="status-badge active">Active</span>
                    </div>
                    <p className="scope-description">{scopeDetails?.description || 'No description provided'}</p>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                      <i className="fas fa-clock"></i> 
                      {loading && (
                        <span style={{ marginLeft: '15px', color: '#007bff' }}>
                          <i className="fas fa-spinner fa-spin" style={{ marginRight: '5px' }}></i>
                          Loading data...
                        </span>
                      )}
                      {machinesLoading && (
                        <span style={{ marginLeft: '15px', color: '#ff9800' }}>
                          <i className="fas fa-spinner fa-spin" style={{ marginRight: '5px' }}></i>
                          Loading machines...
                        </span>
                      )}
                      {commandInProgressRef.current && (
                        <span style={{ marginLeft: '15px', color: '#9c27b0' }}>
                          <i className="fas fa-spinner fa-spin" style={{ marginRight: '5px' }}></i>
                          Command in progress...
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="scope-actions">
                    <button className="btn-secondary" disabled={machinesLoading || commandInProgressRef.current}>
                      <i className="fas fa-edit"></i>
                      Edit
                    </button>
                    <button 
                      className="btn-danger" 
                      onClick={deleteScope}
                      disabled={machinesLoading || commandInProgressRef.current}
                    >
                      <i className="fas fa-trash"></i>
                      Delete
                    </button>
                  </div>
                </div>
                
                <div className="info-grid">
                  <div className="info-card">
                    <div className="info-label">Scope ID</div>
                    <div className="info-value">{selectedScope}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Subnet Mask</div>
                    <div className="info-value">{scopeDetails?.subnetmask || '255.255.255.0'}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Address Pool</div>
                    <div className="info-value">
                      {scopeDetails?.addresspool?.start_range && scopeDetails?.addresspool?.end_range
                        ? `${scopeDetails.addresspool.start_range} - ${scopeDetails.addresspool.end_range}`
                        : 'N/A'
                      }
                    </div>
                  </div>
                </div>
                
                <div className="tabs">
                  <button 
                    className={`tab-btn ${activeTab === 'address-pool' ? 'active' : ''}`}
                    onClick={() => handleTabChange('address-pool')}
                    disabled={machinesLoading || commandInProgressRef.current}
                  >
                    Address Pool
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'address-leases' ? 'active' : ''}`}
                    onClick={() => handleTabChange('address-leases')}
                    disabled={machinesLoading || commandInProgressRef.current}
                  >
                    Address Leases 
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'scope-options' ? 'active' : ''}`}
                    onClick={() => handleTabChange('scope-options')}
                    disabled={machinesLoading || commandInProgressRef.current}
                  >
                    Scope Options
                  </button>
                </div>
                
                <div className="tab-content">
                  {activeTab === 'address-pool' && (
                    <div className="tab-pane active">
                      <div className="content-card">
                        <div className="card-header">
                          <div className="card-header-content">
                            <h3>Address Pool Configuration</h3>
                          </div>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Auto-refreshed • Last update: {formatTimeSinceLastRefresh()}
                          </div>
                        </div>
                        <div className="card-body">
                          {loading ? (
                            <div className="loading-state">
                              <div className="spinner"></div>
                              <p>Loading address pool...</p>
                            </div>
                          ) : (
                            <>
                              <div className="address-range">
                                <div className="range-input">
                                  <h4>Start Address</h4>
                                  <div className="ip-display">
                                    {scopeDetails?.addresspool?.start_range || 'N/A'}
                                  </div>
                                </div>
                                <div className="range-input">
                                  <h4>End Address</h4>
                                  <div className="ip-display">
                                    {scopeDetails?.addresspool?.end_range || 'N/A'}
                                  </div>
                                </div>
                              </div>
                              <div className="range-info">
                                <div className="range-stat">
                                  <span className="stat-label">Total Addresses</span>
                                  <span className="stat-value">
                                    {scopeDetails?.addresspool?.start_range && scopeDetails?.addresspool?.end_range
                                      ? calculateAddressCount(
                                          scopeDetails.addresspool.start_range, 
                                          scopeDetails.addresspool.end_range
                                        )
                                      : 0
                                    }
                                  </span>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'address-leases' && (
                    <div className="tab-pane active">
                      <div className="content-card">
                        <div className="card-header">
                          <div className="card-header-content">
                            <h3>Active Leases</h3>
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#666',
                            marginTop: '5px'
                          }}>
                            Auto-refreshed • Last update: {formatTimeSinceLastRefresh()}
                          </div>
                        </div>
                        <div className="card-body">
                          {loading ? (
                            <div className="loading-state">
                              <div className="spinner"></div>
                              <p>Loading address leases...</p>
                            </div>
                          ) : (
                            <AddressLeasesTable leases={scopeDetails?.addressleases} />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'scope-options' && (
                    <div className="tab-pane active">
                      <div className="content-card">
                        <div className="card-header">
                          <div className="card-header-content">
                            <h3>Scope Options</h3>
                          </div>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Auto-refreshed • Last update: {formatTimeSinceLastRefresh()}
                          </div>
                        </div>
                        <div className="card-body">
                          {loading ? (
                            <div className="loading-state">
                              <div className="spinner"></div>
                              <p>Loading scope options...</p>
                            </div>
                          ) : (
                            <ScopeOptionsTable options={scopeDetails?.scopeoptions} />
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
    </div>
  );
};

export default DHCP;