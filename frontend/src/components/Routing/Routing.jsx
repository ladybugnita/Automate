import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import { Eye, EyeOff, RefreshCw, Plus, Trash2, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import './Routing.css';

const Routing = () => {
  const { isConnected, sendCommand, addListener } = useWebSocket();
  
  const [allDevices, setAllDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [selectedDeviceData, setSelectedDeviceData] = useState(null);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [showNoDevicesModal, setShowNoDevicesModal] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [showSelectMessage, setShowSelectMessage] = useState(true);
  
  const [deviceStatus, setDeviceStatus] = useState(null); 
  const [showDeviceDownModal, setShowDeviceDownModal] = useState(false);
  const [deviceStatusLoading, setDeviceStatusLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState('rip');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  const [ripNetworks, setRipNetworks] = useState(['']);
  
  const [ospfData, setOspfData] = useState({
    processId: '',
    networks: [{ network_id: '', wild_card_mask: '', area: '' }]
  });
  
  const [staticData, setStaticData] = useState({
    routes: [{ destination_network_id: '', subnet_mask: '', next_hop_ip: '' }]
  });
  
  const [validationErrors, setValidationErrors] = useState({
    ripNetworks: [],
    ospfProcessId: '',
    ospfNetworks: [],
    staticRoutes: []
  });

  const isFetchingRef = useRef(false);
  const webSocketListenerRef = useRef(false);
  const timeoutRef = useRef(null);
  const mountedRef = useRef(false);
  const fetchInProgressRef = useRef(false);
  
  const commandInProgressRef = useRef(false);
  const pendingCommandsRef = useRef([]);
  const lastDeviceFetchTimeRef = useRef(0);
  const commandCooldownTime = 1000; 

  const navItems = [
    'Dashboard', 'DNS Configuration', 'Event Viewer', 'DHCP', 'Users',
    'Resource Monitor', 'ESXi', 'Switch', 'Machine Management',
    'Active Directory', 'Routing'
  ];

  const API_BASE_URL = useMemo(() => {
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
  }, []);

  const sendCommandWithFlow = useCallback((command, payload = null) => {
    const now = Date.now();
    
    if (command === 'get_network_devices') {
      const timeSinceLastFetch = now - lastDeviceFetchTimeRef.current;
      if (timeSinceLastFetch < commandCooldownTime) {
        console.log(`Routing: Skipping duplicate ${command} command (cooldown: ${commandCooldownTime - timeSinceLastFetch}ms remaining)`);
        return;
      }
      lastDeviceFetchTimeRef.current = now;
    }
    
    if (commandInProgressRef.current) {
      console.log(`Routing: Command ${command} is already in progress, queueing...`);
      pendingCommandsRef.current.push({ command, payload });
      return;
    }
    
    commandInProgressRef.current = true;
    
    console.log(`Routing: SENDING COMMAND: ${command}`, payload ? 'with payload' : 'no payload');
    
    sendCommand(command, payload);
    
    setTimeout(() => {
      commandInProgressRef.current = false;
      
      if (pendingCommandsRef.current.length > 0) {
        const nextCommand = pendingCommandsRef.current.shift();
        console.log(`Routing: Processing queued command: ${nextCommand.command}`);
        sendCommandWithFlow(nextCommand.command, nextCommand.payload);
      }
    }, 500); 
  }, [sendCommand]);

  const processNextCommand = useCallback(() => {
    if (pendingCommandsRef.current.length > 0 && !commandInProgressRef.current) {
      const nextCommand = pendingCommandsRef.current.shift();
      console.log(`Routing: Processing queued command: ${nextCommand.command}`);
      sendCommandWithFlow(nextCommand.command, nextCommand.payload);
    }
  }, [sendCommandWithFlow]);

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

  const validateDeviceSelection = useCallback(() => {
    if (!selectedDeviceData) {
      setError('Please select a device first');
      return false;
    }

    const password = selectedDeviceData.ssh_password || selectedDeviceData.password || '';
    const username = selectedDeviceData.ssh_username || selectedDeviceData.username || '';
    const ip = selectedDeviceData.ip || selectedDeviceData.device_ip || '';

    if (!ip) {
      setError('Selected device has no IP address');
      return false;
    }

    if (!username) {
      setError('Selected device has no username. Please edit the device to add credentials.');
      return false;
    }

    if (!password) {
      setError('Selected device has no password. Please edit the device to add credentials.');
      return false;
    }

    return true;
  }, [selectedDeviceData]);

  const getDeviceInfo = useCallback(() => {
    if (!selectedDeviceData) {
      console.error('Routing: No device selected');
      return null;
    }
    
    console.log(`Routing: Getting device info: ${selectedDeviceData.name || 'Unknown'} (${selectedDeviceData.ip || selectedDeviceData.device_ip})`);
    
    const password = selectedDeviceData.ssh_password || selectedDeviceData.password || '';
    const username = selectedDeviceData.ssh_username || selectedDeviceData.username || '';
    const ip = selectedDeviceData.ip || selectedDeviceData.device_ip || '';
    
    console.log(`Routing: Credentials for selected device:`, {
      ip,
      username,
      password: password ? '***HIDDEN***' : 'NOT FOUND'
    });
    
    if (!password) {
      console.error('Routing: No password found for selected device');
      setError(`No password found for device: ${selectedDeviceData.name || ip}. Please edit the device to add credentials.`);
      return null;
    }
    
    if (!username) {
      console.error('Routing: No username found for selected device');
      setError(`No username found for device: ${selectedDeviceData.name || ip}. Please edit the device to add credentials.`);
      return null;
    }
    
    if (!ip) {
      console.error('Routing: No IP found for selected device');
      setError(`No IP address found for device: ${selectedDeviceData.name || 'selected device'}.`);
      return null;
    }
    
    return {
      ip: ip,
      username: username,
      password: password
    };
  }, [selectedDeviceData]);

  const checkDeviceStatus = useCallback((deviceData = null) => {
    const deviceToCheck = deviceData || selectedDeviceData;
    
    if (!deviceToCheck) {
      console.error('Routing: No device selected for status check');
      return;
    }
    
    if (!isConnected) {
      console.error('Routing: Not connected to backend for status check');
      setDeviceStatus('error');
      return;
    }
    
    setDeviceStatusLoading(true);
    setDeviceStatus('checking');
    
    const password = deviceToCheck.ssh_password || deviceToCheck.password || '';
    const username = deviceToCheck.ssh_username || deviceToCheck.username || '';
    const ip = deviceToCheck.ip || deviceToCheck.device_ip || '';
    
    if (!ip || !username || !password) {
      console.error('Routing: Incomplete device data for status check');
      setDeviceStatusLoading(false);
      setDeviceStatus('error');
      return;
    }
    
    const deviceInfo = {
      ip: ip,
      username: username,
      password: password
    };
    
    const payload = {
      network_device_info: deviceInfo
    };
    
    console.log('Routing: Checking device status with payload:', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    sendCommandWithFlow('check_network_device_validation', payload);
  }, [isConnected, selectedDeviceData, sendCommandWithFlow]);

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

  const fetchDevices = useCallback(async () => {
    if (fetchInProgressRef.current || !mountedRef.current) {
      console.log('Routing: Fetch already in progress or component unmounted');
      return;
    }
    
    fetchInProgressRef.current = true;
    console.log('Routing: Fetching devices from Node.js REST API...');
    setDevicesLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      const response = await fetch(`${API_BASE_URL}/api/network-devices/get-network-devices?include_password=true`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch devices: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      let devices = [];
      if (data.devices && Array.isArray(data.devices)) {
        devices = data.devices;
      } else if (data.network_devices && Array.isArray(data.network_devices)) {
        devices = data.network_devices;
      } else if (Array.isArray(data)) {
        devices = data;
      }
      
      console.log(`Routing: Found ${devices.length} devices`);
      
      setAllDevices(devices);
      setDevicesLoading(false);
      
      if (devices.length === 0) {
        console.log('Routing: No devices found in database');
        setShowNoDevicesModal(true);
      } else {
        console.log('Routing: Devices loaded successfully');
        setShowSelectMessage(true);
      }
      
    } catch (err) {
      console.error('Routing: REST API failed:', err);
      if (mountedRef.current) {
        setError(`Failed to fetch devices: ${err.message}`);
        setDevicesLoading(false);
      }
    } finally {
      fetchInProgressRef.current = false;
    }
  }, [API_BASE_URL]);

  const createDevicePayload = useCallback(() => {
    const deviceInfo = getDeviceInfo();
    if (!deviceInfo) {
      return null;
    }
    
    console.log(`Routing: Creating payload for device: ${selectedDeviceData.name || selectedDeviceData.device_name}`);
    
    return {
      network_device_info: deviceInfo
    };
  }, [getDeviceInfo, selectedDeviceData]);

  const createRipPayload = useCallback(() => {
    const basePayload = createDevicePayload();
    if (!basePayload) {
      return null;
    }
    
    const payload = { ...basePayload };
    
    const validNetworks = ripNetworks.filter(network => network && network.trim() !== '');
    
    validNetworks.forEach((network, index) => {
      payload[`network${index + 1}`] = network.trim();
    });
    
    console.log('Routing: Created RIP payload structure:', payload);
    return payload;
  }, [createDevicePayload, ripNetworks]);

  const createOspfPayload = useCallback(() => {
    const basePayload = createDevicePayload();
    if (!basePayload) {
      return null;
    }
    
    const payload = { ...basePayload };
    
    const validNetworks = ospfData.networks.filter(network => 
      network.network_id && network.wild_card_mask && network.area
    );
    
    validNetworks.forEach((network, index) => {
      payload[`network${index + 1}`] = {
        network_id: network.network_id.trim(),
        wild_card_mask: network.wild_card_mask.trim(),
        area: network.area.trim()
      };
    });
    
    console.log('Routing: Created OSPF payload structure:', payload);
    return payload;
  }, [createDevicePayload, ospfData]);

  const createStaticPayload = useCallback(() => {
    const basePayload = createDevicePayload();
    if (!basePayload) {
      return null;
    }
    
    const payload = { ...basePayload };
    
    const validRoutes = staticData.routes.filter(route => 
      route.destination_network_id && route.subnet_mask && route.next_hop_ip
    );
    
    validRoutes.forEach((route, index) => {
      payload[`network${index + 1}`] = {
        destination_network_id: route.destination_network_id.trim(),
        subnet_mask: route.subnet_mask.trim(),
        next_hop_ip: route.next_hop_ip.trim()
      };
    });
    
    console.log('Routing: Created Static payload structure:', payload);
    return payload;
  }, [createDevicePayload, staticData]);

  const handleWebSocketMessage = useCallback((data) => {
    if (!mountedRef.current) return;
    
    console.log('Routing WebSocket message:', data);
    
    let command, result, errorMsg, payload;
    
    if (data.response) {
      const responseObj = data.response;
      command = responseObj.command;
      result = responseObj.result;
      errorMsg = responseObj.error;
      payload = responseObj.payload;
    } else if (data.type === 'COMMAND_RESPONSE') {
      command = data.command;
      result = data.result || data.data;
      errorMsg = data.error;
      payload = data.payload;
    } else if (data.action === 'response') {
      command = data.command;
      result = data.result;
      errorMsg = data.error;
      payload = data.payload;
    } else if (data.command) {
      command = data.command;
      result = data.result || data.data;
      errorMsg = data.error;
      payload = data.payload;
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
      setDeviceStatusLoading(false);
      commandInProgressRef.current = false;
      processNextCommand();
      return;
    }
    
    const responseData = extractResult(result);
    console.log('Routing: Extracted response data:', responseData);
    
    switch(command) {
      case 'get_network_devices':
        console.log('Routing: Processing network devices response');
        if (responseData && responseData.success !== false) {
          let devices = [];
          if (responseData.devices && Array.isArray(responseData.devices)) {
            devices = responseData.devices;
          } else if (responseData.network_devices && Array.isArray(responseData.network_devices)) {
            devices = responseData.network_devices;
          } else if (Array.isArray(responseData)) {
            devices = responseData;
          }
          
          console.log('Routing: Loaded devices via WebSocket:', devices.length, 'devices');
          setAllDevices(devices);
          
          if (devices.length === 0) {
            setShowNoDevicesModal(true);
          } else {
            setShowSelectMessage(true);
          }
        } else {
          console.log('Routing: No valid device data in WebSocket response');
          setAllDevices([]);
          setShowNoDevicesModal(true);
        }
        setDevicesLoading(false);
        setLastRefresh(new Date());
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'check_network_device_validation':
        console.log('Routing: Processing device status response');
        setDeviceStatusLoading(false);
        
        if (responseData === true || responseData === 'true' || 
            (responseData && responseData.success === true)) {
          setDeviceStatus('up');
          console.log('Routing: Device is UP:', selectedDeviceData?.name || selectedDeviceData?.device_name);
        } else {
          setDeviceStatus('down');
          setShowDeviceDownModal(true);
          console.log('Routing: Device is DOWN:', selectedDeviceData?.name || selectedDeviceData?.device_name);
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'configure_rip_router_ansible':
        console.log('Routing: Processing RIP configuration response');
        setLoading(false);
        
        if (responseData) {
          if (typeof responseData === 'string' && responseData.toLowerCase().includes('rip configured successfully')) {
            setSuccessMessage('RIP configuration successful!');
            resetRIPForm();
          } else if (responseData.success === true || responseData.result === 'rip configured successfully') {
            setSuccessMessage('RIP configuration successful!');
            resetRIPForm();
          } else {
            setError(`RIP configuration failed: ${JSON.stringify(responseData)}`);
          }
        } else {
          setError('RIP configuration failed: No response from backend');
        }
        
        setTimeout(() => {
          setSuccessMessage(null);
        }, 5000);
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'configure_ospf_router_ansible':
        console.log('Routing: Processing OSPF configuration response');
        setLoading(false);
        
        if (responseData) {
          if (typeof responseData === 'string' && responseData.toLowerCase().includes('ospf configured successfully')) {
            setSuccessMessage('OSPF configuration successful!');
            resetOSPFForm();
          } else if (responseData.success === true || responseData.result === 'ospf configured successfully') {
            setSuccessMessage('OSPF configuration successful!');
            resetOSPFForm();
          } else {
            setError(`OSPF configuration failed: ${JSON.stringify(responseData)}`);
          }
        } else {
          setError('OSPF configuration failed: No response from backend');
        }
        
        setTimeout(() => {
          setSuccessMessage(null);
        }, 5000);
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'configure_static_routing_router_ansible':
        console.log('Routing: Processing Static Route configuration response');
        setLoading(false);
        
        if (responseData) {
          if (typeof responseData === 'string' && responseData.toLowerCase().includes('static routing configured successfully')) {
            setSuccessMessage('Static route configuration successful!');
            resetStaticForm();
          } else if (responseData.success === true || responseData.result === 'static routing configured successfully') {
            setSuccessMessage('Static route configuration successful!');
            resetStaticForm();
          } else {
            setError(`Static route configuration failed: ${JSON.stringify(responseData)}`);
          }
        } else {
          setError('Static route configuration failed: No response from backend');
        }
        
        setTimeout(() => {
          setSuccessMessage(null);
        }, 5000);
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      default:
        console.log(`Routing: Unhandled command: ${command}`);
        commandInProgressRef.current = false;
        processNextCommand();
    }
  }, [processNextCommand, selectedDeviceData]);

  const handleDeviceSelect = useCallback((deviceIp) => {
    console.log('Routing: Device selection changed to:', deviceIp);
    
    if (!deviceIp) {
      setSelectedDevice('');
      setSelectedDeviceData(null);
      setShowSelectMessage(true);
      setDeviceStatus(null);
      setShowDeviceDownModal(false);
      return;
    }
    
    setSelectedDevice(deviceIp);
    setShowSelectMessage(false);
    setDeviceStatus(null);
    setShowDeviceDownModal(false);
    
    const device = allDevices.find(d => (d.ip || d.device_ip) === deviceIp);
    if (device) {
      console.log('Routing: Selected device found:', device);
      
      setSelectedDeviceData(device);
      
      checkDeviceStatus(device);
    } else {
      console.error('Routing: Selected device not found in allDevices');
      setSelectedDeviceData(null);
    }
  }, [allDevices, checkDeviceStatus]);

  const handleRefreshDevices = useCallback(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleRetryDeviceCheck = () => {
    setShowDeviceDownModal(false);
    checkDeviceStatus();
  };

  const handleSelectDifferentDevice = () => {
    setShowDeviceDownModal(false);
    setSelectedDevice('');
    setSelectedDeviceData(null);
    setDeviceStatus(null);
    setShowSelectMessage(true);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
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
      networks: [{ network_id: '', wild_card_mask: '', area: '' }]
    });
    setValidationErrors(prev => ({
      ...prev,
      ospfProcessId: '',
      ospfNetworks: []
    }));
  };

  const resetStaticForm = () => {
    setStaticData({
      routes: [{ destination_network_id: '', subnet_mask: '', next_hop_ip: '' }]
    });
    setValidationErrors(prev => ({
      ...prev,
      staticRoutes: []
    }));
  };

  const addRipNetwork = () => {
    if (ripNetworks.length < 10) {
      setRipNetworks([...ripNetworks, '']);
    }
  };

  const removeRipNetwork = (index) => {
    if (ripNetworks.length > 1) {
      const newNetworks = [...ripNetworks];
      newNetworks.splice(index, 1);
      setRipNetworks(newNetworks);
      
      const newErrors = [...validationErrors.ripNetworks];
      newErrors.splice(index, 1);
      setValidationErrors(prev => ({
        ...prev,
        ripNetworks: newErrors
      }));
    }
  };

  const updateRipNetwork = (index, value) => {
    const newNetworks = [...ripNetworks];
    newNetworks[index] = value;
    setRipNetworks(newNetworks);
  };

  const addOspfNetwork = () => {
    if (ospfData.networks.length < 10) {
      setOspfData({
        ...ospfData,
        networks: [...ospfData.networks, { network_id: '', wild_card_mask: '', area: '' }]
      });
    }
  };

  const removeOspfNetwork = (index) => {
    if (ospfData.networks.length > 1) {
      const newNetworks = [...ospfData.networks];
      newNetworks.splice(index, 1);
      setOspfData({
        ...ospfData,
        networks: newNetworks
      });
      
      const newErrors = [...validationErrors.ospfNetworks];
      newErrors.splice(index, 1);
      setValidationErrors(prev => ({
        ...prev,
        ospfNetworks: newErrors
      }));
    }
  };

  const updateOspfNetwork = (index, field, value) => {
    const newNetworks = [...ospfData.networks];
    newNetworks[index] = { ...newNetworks[index], [field]: value };
    setOspfData({
      ...ospfData,
      networks: newNetworks
    });
  };

  const addStaticRoute = () => {
    if (staticData.routes.length < 10) {
      setStaticData({
        ...staticData,
        routes: [...staticData.routes, { destination_network_id: '', subnet_mask: '', next_hop_ip: '' }]
      });
    }
  };

  const removeStaticRoute = (index) => {
    if (staticData.routes.length > 1) {
      const newRoutes = [...staticData.routes];
      newRoutes.splice(index, 1);
      setStaticData({
        ...staticData,
        routes: newRoutes
      });
      
      const newErrors = [...validationErrors.staticRoutes];
      newErrors.splice(index, 1);
      setValidationErrors(prev => ({
        ...prev,
        staticRoutes: newErrors
      }));
    }
  };

  const updateStaticRoute = (index, field, value) => {
    const newRoutes = [...staticData.routes];
    newRoutes[index] = { ...newRoutes[index], [field]: value };
    setStaticData({
      ...staticData,
      routes: newRoutes
    });
  };

  const validateRIPConfiguration = () => {
    if (!validateDeviceSelection()) {
      return false;
    }

    const validNetworks = ripNetworks.filter(network => 
      network && network.trim() !== ''
    );
    
    if (validNetworks.length === 0) {
      setError('Please add at least one network');
      return false;
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
    
    return !hasError;
  };

  const validateOSPFConfiguration = () => {
    if (!validateDeviceSelection()) {
      return false;
    }
    
    const validNetworks = ospfData.networks.filter(network => 
      network.network_id && network.wild_card_mask && network.area
    );
    
    if (validNetworks.length === 0) {
      setError('Please add at least one network with all fields filled');
      return false;
    }
    
    let hasError = false;
    const newErrors = { 
      ...validationErrors,
      ospfNetworks: []
    };
    
    ospfData.networks.forEach((network, index) => {
      const networkErrors = {};
      
      if (network.network_id && !isValidNetwork(network.network_id)) {
        networkErrors.network_id = 'Invalid network format';
        hasError = true;
      }
      
      if (network.wild_card_mask && !isValidIPAddress(network.wild_card_mask)) {
        networkErrors.wild_card_mask = 'Invalid wild card mask';
        hasError = true;
      }
      
      if (network.area && !isValidOSPFArea(network.area)) {
        networkErrors.area = 'Invalid area format';
        hasError = true;
      }
      
      newErrors.ospfNetworks[index] = networkErrors;
    });
    
    setValidationErrors(newErrors);
    
    return !hasError;
  };

  const validateStaticConfiguration = () => {
    if (!validateDeviceSelection()) {
      return false;
    }

    const validRoutes = staticData.routes.filter(route => 
      route.destination_network_id && route.subnet_mask && route.next_hop_ip
    );
    
    if (validRoutes.length === 0) {
      setError('Please add at least one route with all fields filled');
      return false;
    }
    
    let hasError = false;
    const newErrors = { 
      ...validationErrors,
      staticRoutes: []
    };
    
    staticData.routes.forEach((route, index) => {
      const routeErrors = {};
      
      if (route.destination_network_id && !isValidNetwork(route.destination_network_id)) {
        routeErrors.destination_network_id = 'Invalid network format';
        hasError = true;
      }
      
      if (route.subnet_mask && !isValidSubnetMask(route.subnet_mask)) {
        routeErrors.subnet_mask = 'Invalid subnet mask';
        hasError = true;
      }
      
      if (route.next_hop_ip && !isValidIPAddress(route.next_hop_ip)) {
        routeErrors.next_hop_ip = 'Invalid next hop IP';
        hasError = true;
      }
      
      newErrors.staticRoutes[index] = routeErrors;
    });
    
    setValidationErrors(newErrors);
    
    return !hasError;
  };

  const handleRipSubmit = () => {
    if (!validateRIPConfiguration()) {
      return;
    }

    if (!isConnected) {
      setError('Cannot configure RIP: Not connected to backend system');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    console.log('Routing: Configuring RIP with device info from database');
    
    const payload = createRipPayload();
    if (!payload) {
      setLoading(false);
      return;
    }
    
    console.log('Routing: Sending RIP payload:', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    sendCommandWithFlow('configure_rip_router_ansible', payload);
  };

  const handleOspfSubmit = () => {
    if (!validateOSPFConfiguration()) {
      return;
    }

    if (!isConnected) {
      setError('Cannot configure OSPF: Not connected to backend system');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    console.log('Routing: Configuring OSPF with device info from database');
    
    const payload = createOspfPayload();
    if (!payload) {
      setLoading(false);
      return;
    }
    
    console.log('Routing: Sending OSPF payload:', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    sendCommandWithFlow('configure_ospf_router_ansible', payload);
  };

  const handleStaticSubmit = () => {
    if (!validateStaticConfiguration()) {
      return;
    }

    if (!isConnected) {
      setError('Cannot configure static route: Not connected to backend system');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    console.log('Routing: Configuring static route with device info from database');
    
    const payload = createStaticPayload();
    if (!payload) {
      setLoading(false);
      return;
    }
    
    console.log('Routing: Sending static route payload:', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    sendCommandWithFlow('configure_static_routing_router_ansible', payload);
  };

  useEffect(() => {
    console.log('Routing Component Mounted');
    mountedRef.current = true;
    
    fetchDevices();
    
    return () => {
      console.log('Routing Component Unmounting');
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      isFetchingRef.current = false;
      fetchInProgressRef.current = false;
      commandInProgressRef.current = false;
      pendingCommandsRef.current = [];
    };
  }, [fetchDevices]);

  useEffect(() => {
    if (!webSocketListenerRef.current && mountedRef.current) {
      console.log('Routing: Setting up WebSocket listener');
      const removeListener = addListener(handleWebSocketMessage);
      webSocketListenerRef.current = true;
      
      return () => {
        if (removeListener) {
          removeListener();
        }
        webSocketListenerRef.current = false;
      };
    }
  }, [addListener, handleWebSocketMessage]);

  useEffect(() => {
    setValidationErrors(prev => ({
      ...prev,
      ripNetworks: [],
      ospfProcessId: '',
      ospfNetworks: [],
      staticRoutes: []
    }));
    setError(null);
  }, [activeTab]);


  const NoDevicesModal = () => {
    if (!showNoDevicesModal || devicesLoading) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">No Network Devices Found</h3>
            </div>
            <div className="modal-body">
              <div className="modal-message">
                <p>No network devices are currently configured in the database.</p>
                <p>To configure routing settings, you need to add at least one network device with SSH credentials in Network Device Management.</p>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="modal-btn-primary"
                  onClick={() => {
                    setShowNoDevicesModal(false);
                    window.location.href = '/network-management';
                  }}
                  disabled={commandInProgressRef.current}
                >
                  Go to Network Device Management
                </button>
                <button 
                  className="modal-btn-secondary"
                  onClick={() => {
                    setShowNoDevicesModal(false);
                    handleRefreshDevices();
                  }}
                  disabled={loading || commandInProgressRef.current}
                >
                  Refresh Device List
                </button>
                <button 
                  className="modal-btn-tertiary"
                  onClick={() => setShowNoDevicesModal(false)}
                  disabled={loading || commandInProgressRef.current}
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

  const DeviceDownModal = () => {
    if (!showDeviceDownModal || !selectedDeviceData) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                <AlertCircle size={24} className="modal-title-icon" />
                Device Not Reachable
              </h3>
            </div>
            <div className="modal-body">
              <div className="modal-message">
                <div className="device-down-alert">
                  <WifiOff size={48} className="device-down-icon" />
                  <h4>Device Connectivity Issue</h4>
                  <p>The selected device <strong>{selectedDeviceData.name || selectedDeviceData.device_name}</strong> ({selectedDeviceData.ip || selectedDeviceData.device_ip}) is not reachable.</p>
                  
                  <div className="device-down-reasons">
                    <p>Possible reasons:</p>
                    <ul>
                      <li>Device is powered off</li>
                      <li>Network connectivity issues</li>
                      <li>Firewall blocking ICMP/ping requests</li>
                      <li>Device is in a different network</li>
                    </ul>
                  </div>
                  
                  <p>Please ensure the device is powered on and connected to the network before proceeding.</p>
                </div>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="modal-btn-primary"
                  onClick={handleRetryDeviceCheck}
                  disabled={deviceStatusLoading || commandInProgressRef.current}
                >
                  {deviceStatusLoading ? (
                    <>
                      <RefreshCw size={16} className="spinning" />
                      Checking Again...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      Check Again
                    </>
                  )}
                </button>
                <button 
                  className="modal-btn-secondary"
                  onClick={handleSelectDifferentDevice}
                  disabled={commandInProgressRef.current}
                >
                  Select Different Device
                </button>
                <button 
                  className="modal-btn-tertiary"
                  onClick={() => setShowDeviceDownModal(false)}
                  disabled={commandInProgressRef.current}
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
    <div className="routing-container">
      <div className="routing-content">
        <div className="routing-header">
          <h1 className="routing-title">Automation</h1>
          <div className="nav-buttons">
            {navItems.map((item) => (
              <button
                key={item}
                className={`nav-button ${item === 'Routing'
                    ? 'nav-button-active'
                    : 'nav-button-inactive'
                  }`}
                disabled={commandInProgressRef.current}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="routing-grid">
          <div className="routing-left-column">
            <div className="connection-card">
              <div className="connection-header">
                <h3 className="section-title">Routing Configuration</h3>
                <div className={`device-list-status ${isConnected ? 'connected' : 'disconnected'}`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                  {commandInProgressRef.current && ' | Busy'}
                </div>
              </div>
              
              <div className="connection-form">
                <div className="form-group">
                  <label className="form-label">
                    Select Device <span className="required">*</span>
                  </label>
                  <div className="select-wrapper">
                    <select
                      value={selectedDevice}
                      onChange={(e) => handleDeviceSelect(e.target.value)}
                      className="device-select"
                      disabled={devicesLoading || loading || !isConnected || commandInProgressRef.current}
                    >
                      <option value="">Select a network device...</option>
                      {allDevices.map(device => {
                        const ip = device.ip || device.device_ip;
                        const name = device.name || device.device_name || 'Unnamed Device';
                        const hasPassword = !!(device.ssh_password || device.password);
                        const hasUsername = !!(device.ssh_username || device.username);
                        const hasCredentials = hasPassword && hasUsername;
                        
                        return (
                          <option key={device.id || device.device_id} value={ip}>
                            {name} ({ip}) {hasCredentials ? '✓' : '✗'}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  
                  <div className="device-controls">
                    <button
                      onClick={handleRefreshDevices}
                      className="refresh-devices-btn"
                      disabled={devicesLoading || loading || !isConnected || commandInProgressRef.current}
                    >
                      <RefreshCw size={16} />
                      {devicesLoading ? ' Loading...' : ' Refresh Devices'}
                    </button>
                  </div>
                  
                  {showSelectMessage && !selectedDevice && allDevices.length > 0 && (
                    <div className="select-device-message">
                      <div className="select-message-content">
                        <div className="select-message-icon">ℹ️</div>
                        <div className="select-message-text">
                          <h3>Select a Device to Configure</h3>
                          <p>Please select a device from the dropdown above to configure routing settings.</p>
                          <p>Once you select a device, credentials will be loaded automatically from the database.</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {selectedDeviceData && (
                    <div className="selected-device-info">
                      <div className="selected-device-header">
                        <div className="selected-device-name">
                          {selectedDeviceData.name || selectedDeviceData.device_name}
                          <div className="device-status-indicator">
                            {deviceStatus === 'checking' && (
                              <span className="device-status checking">
                                <RefreshCw size={12} className="spinning" />
                                Checking connectivity...
                              </span>
                            )}
                            {deviceStatus === 'up' && (
                              <span className="device-status up">
                                <Wifi size={12} />
                                Device is reachable
                              </span>
                            )}
                            {deviceStatus === 'down' && (
                              <span className="device-status down">
                                <WifiOff size={12} />
                                Device not reachable
                              </span>
                            )}
                            {deviceStatus === 'error' && (
                              <span className="device-status error">
                                <AlertCircle size={12} />
                                Status check failed
                              </span>
                            )}
                          </div>
                          <span className={`credential-status ${(selectedDeviceData.ssh_password || selectedDeviceData.password) && (selectedDeviceData.ssh_username || selectedDeviceData.username) ? 'good' : 'bad'}`}>
                            {(selectedDeviceData.ssh_password || selectedDeviceData.password) && (selectedDeviceData.ssh_username || selectedDeviceData.username) ? '✓ Credentials OK' : '✗ Missing Credentials'}
                          </span>
                        </div>
                      </div>
                      <div className="selected-device-details">
                        <div className="device-detail-item">
                          <span className="detail-label">IP Address:</span>
                          <span className="detail-value">{selectedDeviceData.ip || selectedDeviceData.device_ip}</span>
                        </div>
                        <div className="device-detail-item">
                          <span className="detail-label">Username:</span>
                          <span className="detail-value">{selectedDeviceData.ssh_username || selectedDeviceData.username || 'Not set'}</span>
                        </div>
                        <div className="device-detail-item">
                          <span className="detail-label">Device Type:</span>
                          <span className="detail-value">
                            {selectedDeviceData.device_type || 'router'}
                          </span>
                        </div>
                        <div className="device-detail-item">
                          <span className="detail-label">Status:</span>
                          <span className="detail-value">{selectedDeviceData.status || 'active'}</span>
                        </div>
                      </div>
                      <div className="selected-device-note">
                        {deviceStatus === 'down' && (
                          <p className="device-down-note">
                            <AlertCircle size={12} />
                            <strong>Warning:</strong> Device is not reachable. Configuration commands may fail.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {!selectedDevice && allDevices.length > 0 && (
                  <div className="device-selection-prompt">
                    <p>Please select a device from the dropdown above to configure routing settings.</p>
                  </div>
                )}
                
                {allDevices.length === 0 && !devicesLoading && (
                  <div className="no-devices-configured">
                    <p>No network devices found in database.</p>
                    <button
                      onClick={() => window.location.href = '/network-management'}
                      className="btn-add-device"
                      disabled={commandInProgressRef.current}
                    >
                      Go to Network Device Management
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="routing-right-column">
            <div className="configuration-tabs">
              <button
                className={`config-tab ${activeTab === 'rip' ? 'active' : ''}`}
                onClick={() => setActiveTab('rip')}
                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
              >
                RIP Configuration
              </button>
              <button
                className={`config-tab ${activeTab === 'ospf' ? 'active' : ''}`}
                onClick={() => setActiveTab('ospf')}
                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
              >
                OSPF Configuration
              </button>
              <button
                className={`config-tab ${activeTab === 'static' ? 'active' : ''}`}
                onClick={() => setActiveTab('static')}
                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
              >
                Static Routing
              </button>
            </div>

            {activeTab === 'rip' ? (
              <div className="rip-config-card">
                <h3 className="form-title">RIP Configuration</h3>
                <p className="form-description">Add networks for RIP routing protocol</p>
                
                <div className="form-content">
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
                            onChange={(e) => updateRipNetwork(index, e.target.value)}
                            placeholder={`e.g., 192.168.${index + 1}.0`}
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                            required={index === 0}
                            className={validationErrors.ripNetworks[index] ? 'input-error' : ''}
                          />
                          {validationErrors.ripNetworks[index] && (
                            <div className="error-message-small">{validationErrors.ripNetworks[index]}</div>
                          )}
                        </div>
                        {ripNetworks.length > 1 && (
                          <button
                            className="btn-remove-network"
                            onClick={() => removeRipNetwork(index)}
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <div className="rip-actions">
                    <button
                      onClick={addRipNetwork}
                      className="btn-add-network"
                      disabled={loading || !isConnected || !selectedDevice || ripNetworks.length >= 10 || commandInProgressRef.current}
                    >
                      <Plus size={16} />
                      Add Another Network
                    </button>
                    <span className="network-count">
                      {ripNetworks.filter(v => v.trim()).length} network(s) configured
                    </span>
                  </div>
                  
                  <div className="config-preview">
                    <h4>Configuration Preview</h4>
                    <div className="preview-content">
                      <div className="preview-row">
                        <span className="preview-label">Device:</span>
                        <span className="preview-value">
                          {selectedDeviceData?.name || selectedDeviceData?.device_name || 'Not selected'}
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Router IP:</span>
                        <span className="preview-value">{selectedDeviceData?.ip || selectedDeviceData?.device_ip || 'Not selected'}</span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Device Status:</span>
                        <span className="preview-value">
                          {deviceStatus === 'up' ? (
                            <span className="status-up">✓ Reachable</span>
                          ) : deviceStatus === 'down' ? (
                            <span className="status-down">✗ Not Reachable</span>
                          ) : deviceStatus === 'checking' ? (
                            <span className="status-checking">Checking...</span>
                          ) : (
                            <span className="status-unknown">Unknown</span>
                          )}
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Networks to Advertise:</span>
                        <span className="preview-value">
                          {ripNetworks.filter(v => v.trim()).length > 0 
                            ? ripNetworks.filter(v => v.trim()).map(v => v).join(', ')
                            : 'No networks configured'
                          }
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Command:</span>
                        <span className="preview-value">configure_rip_router_ansible</span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Operation:</span>
                        <span className="preview-value">Configure RIP using stored credentials</span>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleRipSubmit}
                    className="form-button"
                    disabled={loading || !isConnected || !selectedDevice || ripNetworks.filter(v => v.trim()).length === 0 || commandInProgressRef.current}
                  >
                    {loading ? 'Configuring RIP...' : 'Configure RIP'}
                  </button>
                </div>
              </div>
            ) : activeTab === 'ospf' ? (
              <div className="ospf-config-card">
                <h3 className="form-title">OSPF Configuration</h3>
                <p className="form-description">Configure OSPF routing protocol with multiple networks</p>
                
                <div className="form-content">
                  {ospfData.networks.map((network, index) => (
                    <div key={index} className="ospf-network-item">
                      <div className="network-header">
                        <h4>Network {index + 1}</h4>
                        {ospfData.networks.length > 1 && (
                          <button
                            className="btn-remove-network"
                            onClick={() => removeOspfNetwork(index)}
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      
                      <div className="form-group">
                        <label htmlFor={`ospf-network-id-${index}`}>
                          Network ID: <span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          id={`ospf-network-id-${index}`}
                          value={network.network_id}
                          onChange={(e) => updateOspfNetwork(index, 'network_id', e.target.value)}
                          placeholder="e.g., 192.168.1.0"
                          disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          className={validationErrors.ospfNetworks[index]?.network_id ? 'input-error' : ''}
                        />
                        {validationErrors.ospfNetworks[index]?.network_id && (
                          <div className="error-message-small">{validationErrors.ospfNetworks[index].network_id}</div>
                        )}
                      </div>
                      
                      <div className="form-group">
                        <label htmlFor={`ospf-wildcard-${index}`}>
                          Wild Card Mask: <span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          id={`ospf-wildcard-${index}`}
                          value={network.wild_card_mask}
                          onChange={(e) => updateOspfNetwork(index, 'wild_card_mask', e.target.value)}
                          placeholder="e.g., 0.0.0.255"
                          disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          className={validationErrors.ospfNetworks[index]?.wild_card_mask ? 'input-error' : ''}
                        />
                        {validationErrors.ospfNetworks[index]?.wild_card_mask && (
                          <div className="error-message-small">{validationErrors.ospfNetworks[index].wild_card_mask}</div>
                        )}
                      </div>
                      
                      <div className="form-group">
                        <label htmlFor={`ospf-area-${index}`}>
                          Area: <span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          id={`ospf-area-${index}`}
                          value={network.area}
                          onChange={(e) => updateOspfNetwork(index, 'area', e.target.value)}
                          placeholder="e.g., 1 or 0.0.0.1"
                          disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          className={validationErrors.ospfNetworks[index]?.area ? 'input-error' : ''}
                        />
                        {validationErrors.ospfNetworks[index]?.area && (
                          <div className="error-message-small">{validationErrors.ospfNetworks[index].area}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <div className="ospf-actions">
                    <button
                      onClick={addOspfNetwork}
                      className="btn-add-network"
                      disabled={loading || !isConnected || !selectedDevice || ospfData.networks.length >= 10 || commandInProgressRef.current}
                    >
                      <Plus size={16} />
                      Add Another Network
                    </button>
                    <span className="network-count">
                      {ospfData.networks.filter(n => n.network_id && n.wild_card_mask && n.area).length} network(s) configured
                    </span>
                  </div>
                  
                  <div className="config-preview">
                    <h4>Configuration Preview</h4>
                    <div className="preview-content">
                      <div className="preview-row">
                        <span className="preview-label">Device:</span>
                        <span className="preview-value">
                          {selectedDeviceData?.name || selectedDeviceData?.device_name || 'Not selected'}
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Router IP:</span>
                        <span className="preview-value">{selectedDeviceData?.ip || selectedDeviceData?.device_ip || 'Not selected'}</span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Device Status:</span>
                        <span className="preview-value">
                          {deviceStatus === 'up' ? (
                            <span className="status-up">Reachable</span>
                          ) : deviceStatus === 'down' ? (
                            <span className="status-down">Not Reachable</span>
                          ) : deviceStatus === 'checking' ? (
                            <span className="status-checking">Checking...</span>
                          ) : (
                            <span className="status-unknown">Unknown</span>
                          )}
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Command:</span>
                        <span className="preview-value">configure_ospf_router_ansible</span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Operation:</span>
                        <span className="preview-value">Configure OSPF using stored credentials</span>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleOspfSubmit}
                    className="form-button"
                    disabled={loading || !isConnected || !selectedDevice || ospfData.networks.filter(n => n.network_id && n.wild_card_mask && n.area).length === 0 || commandInProgressRef.current}
                  >
                    {loading ? 'Configuring OSPF...' : 'Configure OSPF'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="static-config-card">
                <h3 className="form-title">Static Routing Configuration</h3>
                <p className="form-description">Configure static routing entries with multiple routes</p>
                
                <div className="form-content">
                  {staticData.routes.map((route, index) => (
                    <div key={index} className="static-route-item">
                      <div className="route-header">
                        <h4>Route {index + 1}</h4>
                        {staticData.routes.length > 1 && (
                          <button
                            className="btn-remove-network"
                            onClick={() => removeStaticRoute(index)}
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      
                      <div className="form-group">
                        <label htmlFor={`static-network-${index}`}>
                          Destination Network: <span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          id={`static-network-${index}`}
                          value={route.destination_network_id}
                          onChange={(e) => updateStaticRoute(index, 'destination_network_id', e.target.value)}
                          placeholder="e.g., 192.168.2.0"
                          disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          className={validationErrors.staticRoutes[index]?.destination_network_id ? 'input-error' : ''}
                        />
                        {validationErrors.staticRoutes[index]?.destination_network_id && (
                          <div className="error-message-small">{validationErrors.staticRoutes[index].destination_network_id}</div>
                        )}
                      </div>
                      
                      <div className="form-group">
                        <label htmlFor={`static-mask-${index}`}>
                          Subnet Mask: <span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          id={`static-mask-${index}`}
                          value={route.subnet_mask}
                          onChange={(e) => updateStaticRoute(index, 'subnet_mask', e.target.value)}
                          placeholder="e.g., 255.255.255.0"
                          disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          className={validationErrors.staticRoutes[index]?.subnet_mask ? 'input-error' : ''}
                        />
                        {validationErrors.staticRoutes[index]?.subnet_mask && (
                          <div className="error-message-small">{validationErrors.staticRoutes[index].subnet_mask}</div>
                        )}
                      </div>
                      
                      <div className="form-group">
                        <label htmlFor={`static-nexthop-${index}`}>
                          Next Hop IP: <span className="required">*</span>
                        </label>
                        <input
                          type="text"
                          id={`static-nexthop-${index}`}
                          value={route.next_hop_ip}
                          onChange={(e) => updateStaticRoute(index, 'next_hop_ip', e.target.value)}
                          placeholder="e.g., 192.168.3.1"
                          disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          className={validationErrors.staticRoutes[index]?.next_hop_ip ? 'input-error' : ''}
                        />
                        {validationErrors.staticRoutes[index]?.next_hop_ip && (
                          <div className="error-message-small">{validationErrors.staticRoutes[index].next_hop_ip}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <div className="static-actions">
                    <button
                      onClick={addStaticRoute}
                      className="btn-add-network"
                      disabled={loading || !isConnected || !selectedDevice || staticData.routes.length >= 10 || commandInProgressRef.current}
                    >
                      <Plus size={16} />
                      Add Another Route
                    </button>
                    <span className="route-count">
                      {staticData.routes.filter(r => r.destination_network_id && r.subnet_mask && r.next_hop_ip).length} route(s) configured
                    </span>
                  </div>
                  
                  <div className="config-preview">
                    <h4>Configuration Preview</h4>
                    <div className="preview-content">
                      <div className="preview-row">
                        <span className="preview-label">Device:</span>
                        <span className="preview-value">
                          {selectedDeviceData?.name || selectedDeviceData?.device_name || 'Not selected'}
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Router IP:</span>
                        <span className="preview-value">{selectedDeviceData?.ip || selectedDeviceData?.device_ip || 'Not selected'}</span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Device Status:</span>
                        <span className="preview-value">
                          {deviceStatus === 'up' ? (
                            <span className="status-up">Reachable</span>
                          ) : deviceStatus === 'down' ? (
                            <span className="status-down">Not Reachable</span>
                          ) : deviceStatus === 'checking' ? (
                            <span className="status-checking">Checking...</span>
                          ) : (
                            <span className="status-unknown">Unknown</span>
                          )}
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Command:</span>
                        <span className="preview-value">configure_static_routing_router_ansible</span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Operation:</span>
                        <span className="preview-value">Configure static routes using stored credentials</span>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleStaticSubmit}
                    className="form-button"
                    disabled={loading || !isConnected || !selectedDevice || staticData.routes.filter(r => r.destination_network_id && r.subnet_mask && r.next_hop_ip).length === 0 || commandInProgressRef.current}
                  >
                    {loading ? 'Configuring Static Routes...' : 'Configure Static Routes'}
                  </button>
                </div>
              </div>
            )}
            
            {!isConnected && (
              <div className="no-connection-notice">
                Connect to backend to configure routing settings
              </div>
            )}
            
            {isConnected && selectedDevice && deviceStatus === 'down' && (
              <div className="device-down-warning">
                <div className="warning-content">
                  <AlertCircle size={20} />
                  <div className="warning-text">
                    <h4>Device Not Reachable</h4>
                    <p>The selected device is not reachable. Configuration commands may fail.</p>
                    <button 
                      onClick={checkDeviceStatus}
                      className="btn-check-again"
                      disabled={deviceStatusLoading || commandInProgressRef.current}
                    >
                      {deviceStatusLoading ? 'Checking...' : 'Check Again'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <NoDevicesModal />
      <DeviceDownModal />

      {error && (
        <div className="error-message-global">
          <div className="error-text">
            {error}
            {error.includes('No password found') && (
              <div style={{ marginTop: '8px', fontSize: '14px' }}>
                <button 
                  className="btn-add-device"
                  onClick={() => window.location.href = '/network-management'}
                  style={{ padding: '4px 8px', marginRight: '8px' }}
                  disabled={commandInProgressRef.current}
                >
                  Go to Network Management
                </button>
                <button 
                  className="btn-refresh"
                  onClick={handleRefreshDevices}
                  style={{ padding: '4px 8px' }}
                  disabled={commandInProgressRef.current}
                >
                  Refresh Devices
                </button>
              </div>
            )}
          </div>
          <button 
            className="btn-close-error" 
            onClick={() => setError(null)}
            disabled={commandInProgressRef.current}
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
            disabled={commandInProgressRef.current}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default Routing;