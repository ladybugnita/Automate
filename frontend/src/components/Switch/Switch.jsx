import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useWebSocket } from '../../Context/WebSocketContext';
import { Eye, EyeOff, RefreshCw, Plus, Trash2, Wifi, WifiOff, AlertCircle, Shield, Zap, Lock } from 'lucide-react';
import './Switch.css';

const Switch = () => {
  const { isConnected, sendCommand, addListener } = useWebSocket();
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('vlan');
  const [showPassword, setShowPassword] = useState(false);
  
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
  
  const [vlans, setVlans] = useState([{ id: '', name: '' }]); 
  const [vlanDetails, setVlanDetails] = useState(null);
  const [vlanDetailsLoading, setVlanDetailsLoading] = useState(false);
  
  const [vtpConfig, setVtpConfig] = useState({
    domainName: '',
    password: '',
    mode: 'server'
  });

  const [ports, setPorts] = useState([{ interfaceName: '', mode: 'access', vlanId: '' }]);

  const [portSecurityPorts, setPortSecurityPorts] = useState([{ 
    interfaceName: '', 
    maximumNumberOfDevice: '', 
    violationType: 'protect', 
    macAddressType: 'sticky',
    macAddress: '' 
  }]);

  const [portFastConfig, setPortFastConfig] = useState({
    configLevel: 'interface',
    ports: [{ interfaceName: '' }]
  });

  const [bpduGuardConfig, setBpduGuardConfig] = useState({
    configLevel: 'interface',
    ports: [{ interfaceName: '' }]
  });

  const isFetchingRef = useRef(false);
  const webSocketListenerRef = useRef(false);
  const timeoutRef = useRef(null);
  const mountedRef = useRef(false);
  const fetchInProgressRef = useRef(false);
  
  const commandInProgressRef = useRef(false);
  const pendingCommandsRef = useRef([]);
  const lastDeviceFetchTimeRef = useRef(0);
  const lastVlanFetchTimeRef = useRef(0);
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
        console.log(`Switch: Skipping duplicate ${command} command (cooldown: ${commandCooldownTime - timeSinceLastFetch}ms remaining)`);
        return;
      }
      lastDeviceFetchTimeRef.current = now;
    }
    
    if (commandInProgressRef.current) {
      console.log(`Switch: Command ${command} is already in progress, queueing...`);
      pendingCommandsRef.current.push({ command, payload });
      return;
    }
    
    commandInProgressRef.current = true;
    
    console.log(`Switch: SENDING COMMAND: ${command}`, payload ? 'with payload' : 'no payload');
    
    sendCommand(command, payload);
    
    setTimeout(() => {
      commandInProgressRef.current = false;
      
      if (pendingCommandsRef.current.length > 0) {
        const nextCommand = pendingCommandsRef.current.shift();
        console.log(`Switch: Processing queued command: ${nextCommand.command}`);
        sendCommandWithFlow(nextCommand.command, nextCommand.payload);
      }
    }, 500); 
  }, [sendCommand]);

  const processNextCommand = useCallback(() => {
    if (pendingCommandsRef.current.length > 0 && !commandInProgressRef.current) {
      const nextCommand = pendingCommandsRef.current.shift();
      console.log(`Switch: Processing queued command: ${nextCommand.command}`);
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
      console.error('Switch: No device selected');
      return null;
    }
    
    console.log(`Switch: Getting device info: ${selectedDeviceData.name || 'Unknown'} (${selectedDeviceData.ip || selectedDeviceData.device_ip})`);
    
    const password = selectedDeviceData.ssh_password || selectedDeviceData.password || '';
    const username = selectedDeviceData.ssh_username || selectedDeviceData.username || '';
    const ip = selectedDeviceData.ip || selectedDeviceData.device_ip || '';
    const device_type = selectedDeviceData.device_type || selectedDeviceData.type || 'switch';
    const vendor = selectedDeviceData.vendor || '';
    
    console.log(`Switch: Credentials for selected device:`, {
      ip,
      username,
      password: password ? '***HIDDEN***' : 'NOT FOUND',
      device_type,
      vendor
    });
    
    if (!password) {
      console.error('Switch: No password found for selected device');
      setError(`No password found for device: ${selectedDeviceData.name || ip}. Please edit the device to add credentials.`);
      return null;
    }
    
    if (!username) {
      console.error('Switch: No username found for selected device');
      setError(`No username found for device: ${selectedDeviceData.name || ip}. Please edit the device to add credentials.`);
      return null;
    }
    
    if (!ip) {
      console.error('Switch: No IP found for selected device');
      setError(`No IP address found for device: ${selectedDeviceData.name || 'selected device'}.`);
      return null;
    }
    
    return {
      ip: ip,
      username: username,
      password: password,
      device_type: device_type,
      vendor: vendor
    };
  }, [selectedDeviceData]);

  const checkDeviceStatus = useCallback((deviceData = null) => {
    const deviceToCheck = deviceData || selectedDeviceData;
    
    if (!deviceToCheck) {
      console.error('Switch: No device selected for status check');
      return;
    }
    
    if (!isConnected) {
      console.error('Switch: Not connected to backend for status check');
      setDeviceStatus('error');
      return;
    }
    
    setDeviceStatusLoading(true);
    setDeviceStatus('checking');
    
    const password = deviceToCheck.ssh_password || deviceToCheck.password || '';
    const username = deviceToCheck.ssh_username || deviceToCheck.username || '';
    const ip = deviceToCheck.ip || deviceToCheck.device_ip || '';
    const device_type = deviceToCheck.device_type || deviceToCheck.type || 'switch';
    const vendor = deviceToCheck.vendor || '';
    
    if (!ip || !username || !password) {
      console.error('Switch: Incomplete device data for status check');
      setDeviceStatusLoading(false);
      setDeviceStatus('error');
      return;
    }
    
    const deviceInfo = {
      ip: ip,
      username: username,
      password: password,
      device_type: device_type,
      vendor: vendor
    };
    
    const payload = {
      network_device_info: deviceInfo
    };
    
    console.log('Switch: Checking device status with payload:', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    sendCommandWithFlow('check_network_device_validation', payload);
  }, [isConnected, selectedDeviceData, sendCommandWithFlow]);

  const addVlan = () => {
    if (vlans.length < 10) { 
      setVlans([...vlans, { id: '', name: '' }]);
    }
  };

  const removeVlan = (index) => {
    if (vlans.length > 1) {
      const newVlans = [...vlans];
      newVlans.splice(index, 1);
      setVlans(newVlans);
    }
  };

  const updateVlan = (index, field, value) => {
    const newVlans = [...vlans];
    newVlans[index][field] = value;
    setVlans(newVlans);
  };

  const validateVlans = () => {
    for (let i = 0; i < vlans.length; i++) {
      const vlan = vlans[i];
      
      if (!vlan.id.trim()) {
        setError(`VLAN ID is required for VLAN #${i + 1}`);
        return false;
      }
      
      if (!/^\d+$/.test(vlan.id.trim())) {
        setError(`VLAN ID must be a number for VLAN #${i + 1}`);
        return false;
      }
      
      const vlanIdNum = parseInt(vlan.id.trim());
      if (vlanIdNum < 1 || vlanIdNum > 4094) {
        setError(`VLAN ID must be between 1 and 4094 for VLAN #${i + 1}`);
        return false;
      }
      
      if (!vlan.name.trim()) {
        setError(`VLAN Name is required for VLAN #${i + 1}`);
        return false;
      }
      
      if (vlan.name.trim().length < 2) {
        setError(`VLAN Name must be at least 2 characters for VLAN #${i + 1}`);
        return false;
      }
    }
    
    const vlanIds = vlans.map(v => v.id.trim());
    const uniqueIds = new Set(vlanIds);
    if (uniqueIds.size !== vlanIds.length) {
      setError('Duplicate VLAN IDs are not allowed');
      return false;
    }
    
    return true;
  };

  const addPort = () => {
    if (ports.length < 10) { 
      setPorts([...ports, { interfaceName: '', mode: 'access', vlanId: '' }]);
    }
  };

  const removePort = (index) => {
    if (ports.length > 1) {
      const newPorts = [...ports];
      newPorts.splice(index, 1);
      setPorts(newPorts);
    }
  };

  const updatePort = (index, field, value) => {
    const newPorts = [...ports];
    newPorts[index][field] = value;
    
    if (field === 'mode' && value === 'trunk') {
      newPorts[index].vlanId = '';
    }
    
    setPorts(newPorts);
  };

  const validatePorts = () => {
    for (let i = 0; i < ports.length; i++) {
      const port = ports[i];
      
      if (!port.interfaceName.trim()) {
        setError(`Interface name is required for Port #${i + 1}`);
        return false;
      }
      
      if (!/^[a-zA-Z]+[0-9]+\/[0-9]+$/.test(port.interfaceName.trim())) {
        setError(`Invalid interface name format for Port #${i + 1}. Use format like: GigabitEthernet0/1`);
        return false;
      }
      
      if (!port.mode) {
        setError(`Mode is required for Port #${i + 1}`);
        return false;
      }
      
      if (port.mode === 'access') {
        if (!port.vlanId.trim()) {
          setError(`VLAN ID is required for access mode in Port #${i + 1}`);
          return false;
        }
        
        if (!/^\d+$/.test(port.vlanId.trim())) {
          setError(`VLAN ID must be a number for Port #${i + 1}`);
          return false;
        }
        
        const vlanIdNum = parseInt(port.vlanId.trim());
        if (vlanIdNum < 1 || vlanIdNum > 4094) {
          setError(`VLAN ID must be between 1 and 4094 for Port #${i + 1}`);
          return false;
        }
      }
    }
    
    return true;
  };

  const addPortSecurityPort = () => {
    if (portSecurityPorts.length < 10) {
      setPortSecurityPorts([...portSecurityPorts, { 
        interfaceName: '', 
        maximumNumberOfDevice: '', 
        violationType: 'protect', 
        macAddressType: 'sticky',
        macAddress: '' 
      }]);
    }
  };

  const removePortSecurityPort = (index) => {
    if (portSecurityPorts.length > 1) {
      const newPorts = [...portSecurityPorts];
      newPorts.splice(index, 1);
      setPortSecurityPorts(newPorts);
    }
  };

  const updatePortSecurityPort = (index, field, value) => {
    const newPorts = [...portSecurityPorts];
    newPorts[index][field] = value;
    
    if (field === 'macAddressType' && value === 'sticky') {
      newPorts[index].macAddress = '';
    }
    
    setPortSecurityPorts(newPorts);
  };

  const validatePortSecurityPorts = () => {
    for (let i = 0; i < portSecurityPorts.length; i++) {
      const port = portSecurityPorts[i];
      
      if (!port.interfaceName.trim()) {
        setError(`Interface name is required for Port #${i + 1}`);
        return false;
      }
      
      if (!/^[a-zA-Z]+[0-9]+\/[0-9]+$/.test(port.interfaceName.trim())) {
        setError(`Invalid interface name format for Port #${i + 1}. Use format like: GigabitEthernet0/1`);
        return false;
      }
      
      if (!port.maximumNumberOfDevice) {
        setError(`Maximum number of devices is required for Port #${i + 1}`);
        return false;
      }
      
      const maxDevices = parseInt(port.maximumNumberOfDevice);
      if (isNaN(maxDevices) || maxDevices < 1 || maxDevices > 100) {
        setError(`Maximum number of devices must be between 1 and 100 for Port #${i + 1}`);
        return false;
      }
      
      if (!port.violationType) {
        setError(`Violation type is required for Port #${i + 1}`);
        return false;
      }
      
      if (!port.macAddressType) {
        setError(`MAC address type is required for Port #${i + 1}`);
        return false;
      }
      
      if (port.macAddressType === 'static' && !port.macAddress.trim()) {
        setError(`MAC address is required for static MAC address type in Port #${i + 1}`);
        return false;
      }
      
      if (port.macAddressType === 'static' && port.macAddress.trim()) {
        const macRegex = /^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$/;
        if (!macRegex.test(port.macAddress.trim())) {
          setError(`Invalid MAC address format for Port #${i + 1}. Use format like: 0A-00-27-00-00-15`);
          return false;
        }
      }
    }
    
    return true;
  };

  const createPortSecurityPayload = useCallback(() => {
    const deviceInfo = getDeviceInfo();
    if (!deviceInfo) {
      return null;
    }
    
    const payload = {
      network_device_info: deviceInfo
    };
    
    portSecurityPorts.forEach((port, index) => {
      if (port.interfaceName.trim() && port.maximumNumberOfDevice && port.violationType && port.macAddressType) {
        const portConfig = {
          interface_name: port.interfaceName.trim(),
          maximum_number_of_device: parseInt(port.maximumNumberOfDevice),
          violation_type: port.violationType,
          mac_address_type: port.macAddressType
        };
        
        if (port.macAddressType === 'static' && port.macAddress.trim()) {
          portConfig.mac_address = port.macAddress.trim();
        }
        
        payload[`port${index + 1}`] = portConfig;
      }
    });
    
    return payload;
  }, [getDeviceInfo, portSecurityPorts]);

  const handleConfigurePortSecurity = () => {
    if (!validateDeviceSelection()) {
      return;
    }

    if (!validatePortSecurityPorts()) {
      return;
    }

    if (!isConnected) {
      setError('Cannot configure port security: Not connected to backend system');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    console.log('Switch: Configuring port security with network_device_info from database');
    
    const payload = createPortSecurityPayload();
    if (!payload) {
      setLoading(false);
      return;
    }
    
    console.log('Switch: Sending port security configuration payload:', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    sendCommandWithFlow('change_port_mode_switch_ansible', payload);
  };

  const addPortFastPort = () => {
    if (portFastConfig.ports.length < 10) {
      setPortFastConfig({
        ...portFastConfig,
        ports: [...portFastConfig.ports, { interfaceName: '' }]
      });
    }
  };

  const removePortFastPort = (index) => {
    if (portFastConfig.ports.length > 1) {
      const newPorts = [...portFastConfig.ports];
      newPorts.splice(index, 1);
      setPortFastConfig({
        ...portFastConfig,
        ports: newPorts
      });
    }
  };

  const updatePortFastPort = (index, value) => {
    const newPorts = [...portFastConfig.ports];
    newPorts[index].interfaceName = value;
    setPortFastConfig({
      ...portFastConfig,
      ports: newPorts
    });
  };

  const updatePortFastConfigLevel = (level) => {
    setPortFastConfig({
      configLevel: level,
      ports: [{ interfaceName: '' }]
    });
  };

  const validatePortFastConfig = () => {
    if (portFastConfig.configLevel === 'interface') {
      for (let i = 0; i < portFastConfig.ports.length; i++) {
        const port = portFastConfig.ports[i];
        
        if (!port.interfaceName.trim()) {
          setError(`Interface name is required for Port #${i + 1}`);
          return false;
        }
        
        if (!/^[a-zA-Z]+[0-9]+\/[0-9]+$/.test(port.interfaceName.trim())) {
          setError(`Invalid interface name format for Port #${i + 1}. Use format like: GigabitEthernet0/1`);
          return false;
        }
      }
    }
    
    return true;
  };

  const createPortFastPayload = useCallback(() => {
    const deviceInfo = getDeviceInfo();
    if (!deviceInfo) {
      return null;
    }
    
    const payload = {
      network_device_info: deviceInfo
    };
    
    if (portFastConfig.configLevel === 'interface') {
      portFastConfig.ports.forEach((port, index) => {
        if (port.interfaceName.trim()) {
          payload[`port${index + 1}`] = port.interfaceName.trim();
        }
      });
    }
    
    return payload;
  }, [getDeviceInfo, portFastConfig]);

  const handleConfigurePortFast = () => {
    if (!validateDeviceSelection()) {
      return;
    }

    if (!validatePortFastConfig()) {
      return;
    }

    if (!isConnected) {
      setError('Cannot configure Port Fast: Not connected to backend system');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    console.log(`Switch: Configuring Port Fast at ${portFastConfig.configLevel} level with network_device_info from database`);
    
    const payload = createPortFastPayload();
    if (!payload) {
      setLoading(false);
      return;
    }
    
    console.log('Switch: Sending Port Fast configuration payload:', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    const command = portFastConfig.configLevel === 'interface' 
      ? 'configure_port_fast_interface_level_switch_ansible' 
      : 'configure_port_fast_global_level_switch_ansible';
    
    console.log(`Switch: Sending command: ${command}`);
    sendCommandWithFlow(command, payload);
  };

  const addBpduGuardPort = () => {
    if (bpduGuardConfig.ports.length < 10) {
      setBpduGuardConfig({
        ...bpduGuardConfig,
        ports: [...bpduGuardConfig.ports, { interfaceName: '' }]
      });
    }
  };

  const removeBpduGuardPort = (index) => {
    if (bpduGuardConfig.ports.length > 1) {
      const newPorts = [...bpduGuardConfig.ports];
      newPorts.splice(index, 1);
      setBpduGuardConfig({
        ...bpduGuardConfig,
        ports: newPorts
      });
    }
  };

  const updateBpduGuardPort = (index, value) => {
    const newPorts = [...bpduGuardConfig.ports];
    newPorts[index].interfaceName = value;
    setBpduGuardConfig({
      ...bpduGuardConfig,
      ports: newPorts
    });
  };

  const updateBpduGuardConfigLevel = (level) => {
    setBpduGuardConfig({
      configLevel: level,
      ports: [{ interfaceName: '' }]
    });
  };

  const validateBpduGuardConfig = () => {
    if (bpduGuardConfig.configLevel === 'interface') {
      for (let i = 0; i < bpduGuardConfig.ports.length; i++) {
        const port = bpduGuardConfig.ports[i];
        
        if (!port.interfaceName.trim()) {
          setError(`Interface name is required for Port #${i + 1}`);
          return false;
        }
        
        if (!/^[a-zA-Z]+[0-9]+\/[0-9]+$/.test(port.interfaceName.trim())) {
          setError(`Invalid interface name format for Port #${i + 1}. Use format like: GigabitEthernet0/1`);
          return false;
        }
      }
    }
    
    return true;
  };

  const createBpduGuardPayload = useCallback(() => {
    const deviceInfo = getDeviceInfo();
    if (!deviceInfo) {
      return null;
    }
    
    const payload = {
      network_device_info: deviceInfo
    };
    
    if (bpduGuardConfig.configLevel === 'interface') {
      bpduGuardConfig.ports.forEach((port, index) => {
        if (port.interfaceName.trim()) {
          payload[`port${index + 1}`] = port.interfaceName.trim();
        }
      });
    }
    
    return payload;
  }, [getDeviceInfo, bpduGuardConfig]);

  const handleConfigureBpduGuard = () => {
    if (!validateDeviceSelection()) {
      return;
    }

    if (!validateBpduGuardConfig()) {
      return;
    }

    if (!isConnected) {
      setError('Cannot configure BPDU Guard: Not connected to backend system');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    console.log(`Switch: Configuring BPDU Guard at ${bpduGuardConfig.configLevel} level with network_device_info from database`);
    
    const payload = createBpduGuardPayload();
    if (!payload) {
      setLoading(false);
      return;
    }
    
    console.log('Switch: Sending BPDU Guard configuration payload:', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    const command = bpduGuardConfig.configLevel === 'interface' 
      ? 'configure_bpdu_guard_interface_level_switch_ansible' 
      : 'configure_bpdu_global_level_switch_ansible';
    
    console.log(`Switch: Sending command: ${command}`);
    sendCommandWithFlow(command, payload);
  };

  const fetchDevices = useCallback(async () => {
    if (fetchInProgressRef.current || !mountedRef.current) {
      console.log('Switch: Fetch already in progress or component unmounted');
      return;
    }
    
    fetchInProgressRef.current = true;
    console.log('Switch: Fetching devices from Node.js REST API...');
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
      
      console.log(`Switch: Found ${devices.length} devices`);
      
      setAllDevices(devices);
      setDevicesLoading(false);
      
      if (devices.length === 0) {
        console.log('Switch: No devices found in database');
        setShowNoDevicesModal(true);
      } else {
        console.log('Switch: Devices loaded successfully');
        setShowSelectMessage(true);
      }
      
    } catch (err) {
      console.error('Switch: REST API failed:', err);
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
    
    console.log(`Switch: Creating payload for device: ${selectedDeviceData.name || selectedDeviceData.device_name}`);
    
    return {
      network_device_info: deviceInfo
    };
  }, [getDeviceInfo, selectedDeviceData]);

  const createVlanPayload = useCallback(() => {
    const basePayload = createDevicePayload();
    if (!basePayload) {
      return null;
    }
    
    const payload = { ...basePayload };
    
    vlans.forEach((vlan, index) => {
      if (vlan.id.trim() && vlan.name.trim()) {
        payload[`vlan${index + 1}`] = {
          id: parseInt(vlan.id.trim()),
          name: vlan.name.trim()
        };
      }
    });
    
    return payload;
  }, [createDevicePayload, vlans]);

  const createPortPayload = useCallback(() => {
    const basePayload = createDevicePayload();
    if (!basePayload) {
      return null;
    }
    
    const payload = { ...basePayload };
    
    ports.forEach((port, index) => {
      if (port.interfaceName.trim() && port.mode) {
        const portConfig = {
          interface_name: port.interfaceName.trim(),
          mode: port.mode
        };
        
        if (port.mode === 'access' && port.vlanId.trim()) {
          portConfig.vlan_id = parseInt(port.vlanId.trim());
        }
        
        payload[`port${index + 1}`] = portConfig;
      }
    });
    
    return payload;
  }, [createDevicePayload, ports]);

  const fetchVlanDetailsForDevice = useCallback((device) => {
    if (!device) {
      console.error('Switch: No device provided to fetchVlanDetailsForDevice');
      return;
    }
    
    if (isFetchingRef.current) {
      console.log('Switch: Already fetching VLAN details, skipping...');
      return;
    }

    if (!isConnected) {
      console.error('Switch: Not connected to backend for VLAN details');
      setError('Not connected to backend system');
      return;
    }

    console.log(`Switch: Fetching VLAN details for device: ${device.name || 'Unknown'} (${device.ip || device.device_ip})`);
    setVlanDetailsLoading(true);
    setError(null);
    isFetchingRef.current = true;
    
    const password = device.ssh_password || device.password || '';
    const username = device.ssh_username || device.username || '';
    const ip = device.ip || device.device_ip || '';
    const device_type = device.device_type || device.type || 'switch';
    const vendor = device.vendor || '';
    
    if (!ip || !username || !password) {
      console.error('Switch: Incomplete device data for VLAN details fetch');
      setError(`Incomplete credentials for device: ${device.name || ip}. Please edit the device to add complete credentials.`);
      setVlanDetailsLoading(false);
      isFetchingRef.current = false;
      return;
    }
    
    const deviceInfo = {
      ip: ip,
      username: username,
      password: password,
      device_type: device_type,
      vendor: vendor
    };
    
    const payload = {
      network_device_info: deviceInfo
    };
    
    console.log('Switch: Sending get_vlan_details_switch command with payload:', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    sendCommandWithFlow('get_vlan_details_switch', payload);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      if (isFetchingRef.current && mountedRef.current) {
        console.log('Switch: Timeout: No response from backend for VLAN details');
        setError('Timeout: No response from server for VLAN details');
        setVlanDetailsLoading(false);
        isFetchingRef.current = false;
        timeoutRef.current = null;
      }
    }, 30000); 
    
  }, [isConnected, sendCommandWithFlow]);

  const handleWebSocketMessage = useCallback((data) => {
    if (!mountedRef.current) return;
    
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
      
      if (command === 'check_network_device_validation') {
        setDeviceStatus('down');
        setDeviceStatusLoading(false);
        setShowDeviceDownModal(true);
      } else if (command === 'get_vlan_details_switch') {
        setVlanDetailsLoading(false);
        isFetchingRef.current = false;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        console.log(`Switch: Error fetching VLAN details: ${error}`);
        setVlanDetails(null);
      } else {
        setError(`Error: ${error}`);
        setLoading(false);
        setDevicesLoading(false);
      }
      
      commandInProgressRef.current = false;
      processNextCommand();
      return;
    }
    
    const responseData = extractResult(result);
    console.log('Switch: Extracted response data:', responseData);
    
    switch(command) {
      case 'get_network_devices':
        console.log('Switch: Processing network devices response');
        if (responseData && responseData.success !== false) {
          let devices = [];
          if (responseData.devices && Array.isArray(responseData.devices)) {
            devices = responseData.devices;
          } else if (responseData.network_devices && Array.isArray(responseData.network_devices)) {
            devices = responseData.network_devices;
          } else if (Array.isArray(responseData)) {
            devices = responseData;
          }
          
          console.log('Switch: Loaded devices via WebSocket:', devices.length, 'devices');
          setAllDevices(devices);
          
          if (devices.length === 0) {
            setShowNoDevicesModal(true);
          } else {
            setShowSelectMessage(true);
          }
        } else {
          console.log('Switch: No valid device data in WebSocket response');
          setAllDevices([]);
          setShowNoDevicesModal(true);
        }
        setDevicesLoading(false);
        setLastRefresh(new Date());
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'check_network_device_validation':
        console.log('Switch: Processing device status response');
        setDeviceStatusLoading(false);
        
        if (responseData === true || responseData === 'true') {
          setDeviceStatus('up');
          console.log('Switch: Device is UP:', selectedDeviceData?.name || selectedDeviceData?.device_name);
        } else if (responseData === false || responseData === 'false') {
          setDeviceStatus('down');
          setShowDeviceDownModal(true);
          console.log('Switch: Device is DOWN:', selectedDeviceData?.name || selectedDeviceData?.device_name);
        } else if (responseData && typeof responseData === 'object') {
          if (responseData.status === true || responseData.status === 'true' || responseData.is_up === true) {
            setDeviceStatus('up');
            console.log('Switch: Device is UP:', selectedDeviceData?.name || selectedDeviceData?.device_name);
          } else if (responseData.status === false || responseData.status === 'false' || responseData.is_up === false) {
            setDeviceStatus('down');
            setShowDeviceDownModal(true);
            console.log('Switch: Device is DOWN:', selectedDeviceData?.name || selectedDeviceData?.device_name);
          } else {
            setDeviceStatus('error');
            console.log('Switch: Device status check failed or returned unexpected response');
          }
        } else {
          setDeviceStatus('error');
          console.log('Switch: Device status check failed or returned unexpected response');
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'create_vlan_switch_ansible':
        console.log('Switch: Processing create VLAN response');
        setLoading(false);
        
        if (responseData && responseData.success !== false) {
          setSuccessMessage('VLANs created successfully!');
          setVlans([{ id: '', name: '' }]); 
          
          if (selectedDeviceData) {
            fetchVlanDetailsForDevice(selectedDeviceData);
          }
          
          setTimeout(() => {
            setSuccessMessage(null);
          }, 5000);
        } else {
          const errorMsg = responseData?.error || 'Failed to create VLANs';
          setError(`Error: ${errorMsg}`);
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'get_vlan_details_switch':
        console.log('Switch: Processing VLAN details response');
        setVlanDetailsLoading(false);
        isFetchingRef.current = false;
        
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        if (responseData && responseData.success !== false) {
          let vlanDetailsData = null;
          
          if (responseData.vlan_details) {
            vlanDetailsData = responseData.vlan_details;
          } else if (responseData.data && responseData.data.vlan_details) {
            vlanDetailsData = responseData.data.vlan_details;
          } else if (responseData.data) {
            vlanDetailsData = responseData.data;
          }
          
          if (vlanDetailsData) {
            setVlanDetails(vlanDetailsData);
            console.log('Switch: VLAN details loaded:', vlanDetailsData);
          } else {
            setVlanDetails(null);
            console.log('Switch: No VLAN details found in response');
          }
        } else {
          setVlanDetails(null);
          console.log('Switch: No valid VLAN details in response');
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'configure_vtp_server_switch_ansible':
      case 'configure_vtp_client_switch_ansible':
        console.log(`Switch: Processing ${command} response`);
        setLoading(false);
        
        if (responseData && responseData.success !== false) {
          const mode = command === 'configure_vtp_server_switch_ansible' ? 'Server' : 'Client';
          setSuccessMessage(`VTP ${mode} configured successfully!`);
          setVtpConfig({
            domainName: '',
            password: '',
            mode: 'server'
          });
          
          setTimeout(() => {
            setSuccessMessage(null);
          }, 5000);
        } else {
          const errorMsg = responseData?.error || `Failed to configure VTP ${command === 'configure_vtp_server_switch_ansible' ? 'Server' : 'Client'}`;
          setError(`Error: ${errorMsg}`);
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'change_port_mode_switch_ansible':
        console.log('Switch: Processing port mode change response');
        setLoading(false);
        
        if (responseData && responseData.success !== false) {
          setSuccessMessage('Port configuration completed successfully!');
          setPorts([{ interfaceName: '', mode: 'access', vlanId: '' }]); 
          setPortSecurityPorts([{ 
            interfaceName: '', 
            maximumNumberOfDevice: '', 
            violationType: 'protect', 
            macAddressType: 'sticky',
            macAddress: '' 
          }]);
          
          setTimeout(() => {
            setSuccessMessage(null);
          }, 5000);
        } else {
          const errorMsg = responseData?.error || 'Failed to configure port';
          setError(`Error: ${errorMsg}`);
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'configure_port_fast_interface_level_switch_ansible':
        console.log('Switch: Processing Port Fast interface level response');
        setLoading(false);
        
        if (responseData && responseData.success !== false) {
          setSuccessMessage('Port fast configured successfully on interface level switch');
          setPortFastConfig({
            configLevel: 'interface',
            ports: [{ interfaceName: '' }]
          });
          
          setTimeout(() => {
            setSuccessMessage(null);
          }, 5000);
        } else {
          const errorMsg = responseData?.error || 'Failed to configure Port Fast at interface level';
          setError(`Error: ${errorMsg}`);
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'configure_port_fast_global_level_switch_ansible':
        console.log('Switch: Processing Port Fast global level response');
        setLoading(false);
        
        if (responseData && responseData.success !== false) {
          setSuccessMessage('Port fast configured successfully on global level switch');
          setPortFastConfig({
            configLevel: 'interface',
            ports: [{ interfaceName: '' }]
          });
          
          setTimeout(() => {
            setSuccessMessage(null);
          }, 5000);
        } else {
          const errorMsg = responseData?.error || 'Failed to configure Port Fast at global level';
          setError(`Error: ${errorMsg}`);
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'configure_bpdu_guard_interface_level_switch_ansible':
        console.log('Switch: Processing BPDU Guard interface level response');
        setLoading(false);
        
        if (responseData && responseData.success !== false) {
          setSuccessMessage('BPDU guard configured successfully on interface level switch');
          setBpduGuardConfig({
            configLevel: 'interface',
            ports: [{ interfaceName: '' }]
          });
          
          setTimeout(() => {
            setSuccessMessage(null);
          }, 5000);
        } else {
          const errorMsg = responseData?.error || 'Failed to configure BPDU Guard at interface level';
          setError(`Error: ${errorMsg}`);
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'configure_bpdu_global_level_switch_ansible':
        console.log('Switch: Processing BPDU Guard global level response');
        setLoading(false);
        
        if (responseData && responseData.success !== false) {
          setSuccessMessage('BPDU guard configured successfully on global level switch');
          setBpduGuardConfig({
            configLevel: 'interface',
            ports: [{ interfaceName: '' }]
          });
          
          setTimeout(() => {
            setSuccessMessage(null);
          }, 5000);
        } else {
          const errorMsg = responseData?.error || 'Failed to configure BPDU Guard at global level';
          setError(`Error: ${errorMsg}`);
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'is_device_up':
        console.log('Switch: Processing OLD is_device_up response (backward compatibility)');
        setDeviceStatusLoading(false);
        
        if (responseData && responseData.status === 'true') {
          setDeviceStatus('up');
          console.log('Switch: Device is UP (old format):', selectedDeviceData?.name || selectedDeviceData?.device_name);
        } else if (responseData && responseData.status === 'false') {
          setDeviceStatus('down');
          setShowDeviceDownModal(true);
          console.log('Switch: Device is DOWN (old format):', selectedDeviceData?.name || selectedDeviceData?.device_name);
        } else {
          setDeviceStatus('error');
          console.log('Switch: Device status check failed or returned unexpected response (old format)');
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      default:
        console.log(`Switch: Unhandled command: ${command}`);
        commandInProgressRef.current = false;
        processNextCommand();
    }
    
  }, [processNextCommand, selectedDeviceData, fetchVlanDetailsForDevice]);

  const handleDeviceSelect = useCallback((deviceIp) => {
    console.log('Switch: Device selection changed to:', deviceIp);
    
    if (!deviceIp) {
      setSelectedDevice('');
      setSelectedDeviceData(null);
      setShowSelectMessage(true);
      setVlanDetails(null);
      setDeviceStatus(null);
      setShowDeviceDownModal(false);
      return;
    }
    
    setSelectedDevice(deviceIp);
    setShowSelectMessage(false);
    setVlanDetails(null);
    setDeviceStatus(null);
    setShowDeviceDownModal(false);
    
    const device = allDevices.find(d => (d.ip || d.device_ip) === deviceIp);
    if (device) {
      console.log('Switch: Selected device found:', device);
      
      setSelectedDeviceData(device);
      
      checkDeviceStatus(device);
      
      console.log('Switch: Fetching VLAN details for selected device:', device.name || device.device_name);
      fetchVlanDetailsForDevice(device);
    } else {
      console.error('Switch: Selected device not found in allDevices');
      setSelectedDeviceData(null);
    }
  }, [allDevices, checkDeviceStatus, fetchVlanDetailsForDevice]);

  const handleCreateVlans = () => {
    if (!validateDeviceSelection()) {
      return;
    }

    if (!validateVlans()) {
      return;
    }

    if (!isConnected) {
      setError('Cannot create VLANs: Not connected to backend system');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    console.log('Switch: Creating VLANs with network_device_info from database');
    
    const payload = createVlanPayload();
    if (!payload) {
      setLoading(false);
      return;
    }
    
    console.log('Switch: Sending payload (NEW structure):', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    sendCommandWithFlow('create_vlan_switch_ansible', payload);
  };

  const handleConfigureVtp = () => {
    if (!validateDeviceSelection()) {
      return;
    }

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

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    console.log('Switch: Configuring VTP with network_device_info from database');
    
    const devicePayload = createDevicePayload();
    if (!devicePayload) {
      setLoading(false);
      return;
    }
    
    const payload = {
      ...devicePayload,
      vtp_domain: vtpConfig.domainName.trim(),
      vtp_password: vtpConfig.password.trim()
    };
    
    console.log('Switch: Sending VTP payload:', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    const command = vtpConfig.mode === 'server' 
      ? 'configure_vtp_server_switch_ansible' 
      : 'configure_vtp_client_switch_ansible';
    
    console.log(`Switch: Sending command: ${command} for mode: ${vtpConfig.mode}`);
    sendCommandWithFlow(command, payload);
  };

  const handleConfigurePorts = () => {
    if (!validateDeviceSelection()) {
      return;
    }

    if (!validatePorts()) {
      return;
    }

    if (!isConnected) {
      setError('Cannot configure port mode: Not connected to backend system');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    console.log('Switch: Configuring port mode with network_device_info from database');
    
    const payload = createPortPayload();
    if (!payload) {
      setLoading(false);
      return;
    }
    
    console.log('Switch: Sending port configuration payload:', {
      ...payload,
      network_device_info: { ...payload.network_device_info, password: '***HIDDEN***' }
    });
    
    sendCommandWithFlow('change_port_mode_switch_ansible', payload);
  };

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
    setVlanDetails(null);
    setShowSelectMessage(true);
  };

  const handleRefreshVlanDetails = useCallback(() => {
    if (selectedDeviceData) {
      fetchVlanDetailsForDevice(selectedDeviceData);
    }
  }, [selectedDeviceData, fetchVlanDetailsForDevice]);

  useEffect(() => {
    console.log('Switch Component Mounted');
    mountedRef.current = true;
    
    fetchDevices();
    
    return () => {
      console.log('Switch Component Unmounting');
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
      console.log('Switch: Setting up WebSocket listener');
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
                <p>To configure switch settings, you need to add at least one network device with SSH credentials in Network Device Management.</p>
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
                disabled={commandInProgressRef.current}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="switch-grid">
          <div className="switch-left-column">
            <div className="connection-card">
              <div className="connection-header">
                <h3 className="section-title">Switch Configuration</h3>
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
                          <p>Please select a device from the dropdown above to configure switch settings.</p>
                          <p>Once you select a device, credentials will be loaded automatically from the database and VLAN details will be fetched.</p>
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
                        {vlanDetailsLoading && (
                          <button
                            className="refresh-vlan-btn"
                            disabled={true}
                          >
                            <RefreshCw size={12} className="spinning" />
                            Loading VLANs...
                          </button>
                        )}
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
                            {selectedDeviceData.device_type || 'switch'}
                          </span>
                        </div>
                        <div className="device-detail-item">
                          <span className="detail-label">Vendor:</span>
                          <span className="detail-value">
                            {selectedDeviceData.vendor || 'Unknown'}
                          </span>
                        </div>
                        <div className="device-detail-item">
                          <span className="detail-label">Status:</span>
                          <span className="detail-value">{selectedDeviceData.status || 'active'}</span>
                        </div>
                      </div>
                      <div className="selected-device-note">
                        <p><strong>Note:</strong> Credentials are loaded from database. No manual input required.</p>
                        {deviceStatus === 'down' && (
                          <p className="device-down-note">
                            <AlertCircle size={12} />
                            <strong>Warning:</strong> Device is not reachable. Configuration commands may fail.
                          </p>
                        )}
                        {vlanDetails && (
                          <p className="vlan-details-note">
                            ✓ VLAN details loaded: {Object.keys(vlanDetails).length} VLAN(s) found
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {!selectedDevice && allDevices.length > 0 && (
                  <div className="device-selection-prompt">
                    <p>Please select a device from the dropdown above to configure switch settings.</p>
                    <p>Credentials will be automatically loaded from the database and VLAN details will be fetched.</p>
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

          <div className="switch-right-column">
            <div className="configuration-tabs">
              <button
                className={`config-tab ${activeTab === 'vlan' ? 'active' : ''}`}
                onClick={() => setActiveTab('vlan')}
                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
              >
                VLAN Configuration
              </button>
              <button
                className={`config-tab ${activeTab === 'vtp' ? 'active' : ''}`}
                onClick={() => setActiveTab('vtp')}
                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
              >
                VTP Configuration
              </button>
              <button
                className={`config-tab ${activeTab === 'port' ? 'active' : ''}`}
                onClick={() => setActiveTab('port')}
                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
              >
                Port Configuration
              </button>
              {/* NEW: Port Security Tab */}
              <button
                className={`config-tab ${activeTab === 'port-security' ? 'active' : ''}`}
                onClick={() => setActiveTab('port-security')}
                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
              >
                <Lock size={16} style={{ marginRight: '4px' }} />
                Port Security
              </button>
              {/* NEW: Port Fast Tab */}
              <button
                className={`config-tab ${activeTab === 'port-fast' ? 'active' : ''}`}
                onClick={() => setActiveTab('port-fast')}
                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
              >
                <Zap size={16} style={{ marginRight: '4px' }} />
                Port Fast
              </button>
              {/* NEW: BPDU Guard Tab */}
              <button
                className={`config-tab ${activeTab === 'bpdu-guard' ? 'active' : ''}`}
                onClick={() => setActiveTab('bpdu-guard')}
                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
              >
                <Shield size={16} style={{ marginRight: '4px' }} />
                BPDU Guard
              </button>
            </div>

            {activeTab === 'vlan' ? (
              <div className="vlan-config-card">
                <div className="vlan-header">
                  <h3 className="form-title">Create VLANs</h3>
                  <div className="vlan-subtitle">
                    <p>You can create multiple VLANs at once</p>
                    <button
                      onClick={handleRefreshVlanDetails}
                      className="btn-fetch-vlans"
                      disabled={vlanDetailsLoading || !isConnected || !selectedDevice || commandInProgressRef.current}
                    >
                      {vlanDetailsLoading ? (
                        <>
                          <RefreshCw size={16} className="spinning" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={16} />
                          Refresh VLANs
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                <div className="form-content">
                  {vlans.map((vlan, index) => (
                    <div key={index} className="vlan-input-group">
                      <div className="vlan-input-header">
                        <span className="vlan-number">VLAN #{index + 1}</span>
                        {vlans.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeVlan(index)}
                            className="btn-remove-vlan"
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className="vlan-input-row">
                        <div className="vlan-input-field">
                          <label className="form-label">
                            VLAN ID
                            <span className="form-hint">(1-4094)</span>
                          </label>
                          <input
                            type="number"
                            value={vlan.id}
                            onChange={(e) => updateVlan(index, 'id', e.target.value)}
                            className="form-input"
                            placeholder="Enter VLAN ID"
                            min="1"
                            max="4094"
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          />
                        </div>
                        <div className="vlan-input-field">
                          <label className="form-label">VLAN Name</label>
                          <input
                            type="text"
                            value={vlan.name}
                            onChange={(e) => updateVlan(index, 'name', e.target.value)}
                            className="form-input"
                            placeholder="Enter VLAN name"
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <div className="vlan-actions">
                    <button
                      onClick={addVlan}
                      className="btn-add-vlan"
                      disabled={loading || !isConnected || !selectedDevice || vlans.length >= 10 || commandInProgressRef.current}
                    >
                      <Plus size={16} />
                      Add Another VLAN
                    </button>
                    <span className="vlan-count">
                      {vlans.length} VLAN(s) configured
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
                        <span className="preview-label">Switch IP:</span>
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
                        <span className="preview-label">VLANs to Create:</span>
                        <span className="preview-value">
                          {vlans.filter(v => v.id && v.name).length > 0 
                            ? vlans.filter(v => v.id && v.name).map(v => `VLAN ${v.id}: ${v.name}`).join(', ')
                            : 'No VLANs configured'
                          }
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Operation:</span>
                        <span className="preview-value">Create VLANs using stored credentials</span>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleCreateVlans}
                    className="form-button"
                    disabled={loading || !isConnected || !selectedDevice || vlans.filter(v => v.id && v.name).length === 0 || commandInProgressRef.current}
                  >
                    {loading ? 'Creating VLANs...' : 'Create VLANs'}
                  </button>
                </div>
                
                {selectedDevice && (
                  <div className="vlan-details-section">
                    <div className="vlan-details-header">
                      <h4 className="vlan-details-title">
                        VLANs on {selectedDeviceData?.name || selectedDeviceData?.device_name || 'Selected Device'}
                        {vlanDetails && (
                          <span className="vlan-count-badge">
                            {Object.keys(vlanDetails).length} VLAN(s)
                          </span>
                        )}
                      </h4>
                      {vlanDetails && (
                        <button
                          onClick={handleRefreshVlanDetails}
                          className="btn-refresh-vlans-small"
                          disabled={vlanDetailsLoading || commandInProgressRef.current}
                        >
                          {vlanDetailsLoading ? (
                            <RefreshCw size={14} className="spinning" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                        </button>
                      )}
                    </div>
                    
                    {vlanDetailsLoading ? (
                      <div className="vlan-details-loading">
                        <div className="loading-spinner-small"></div>
                        Loading VLAN details from device...
                      </div>
                    ) : vlanDetails && Object.keys(vlanDetails).length > 0 ? (
                      <div className="vlan-details-table">
                        <div className="vlan-details-header-row">
                          <div className="vlan-header-cell">VLAN ID</div>
                          <div className="vlan-header-cell">Name</div>
                          <div className="vlan-header-cell">Status</div>
                          <div className="vlan-header-cell">Ports</div>
                        </div>
                        <div className="vlan-details-body">
                          {Object.entries(vlanDetails).map(([key, vlan]) => (
                            <div key={key} className="vlan-details-row">
                              <div className="vlan-details-cell">{vlan.id}</div>
                              <div className="vlan-details-cell">{vlan.name}</div>
                              <div className="vlan-details-cell">
                                <span className={`vlan-status ${vlan.status === 'active' ? 'active' : 'inactive'}`}>
                                  {vlan.status || 'N/A'}
                                </span>
                              </div>
                              <div className="vlan-details-cell">{vlan.ports || 'None'}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : selectedDevice && !vlanDetailsLoading ? (
                      <div className="no-vlans-message">
                        <p>No VLANs found on this device.</p>
                        <p>Create new VLANs using the form above.</p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : activeTab === 'vtp' ? (
              <div className="vtp-config-card">
                <h3 className="form-title">Configure VTP</h3>
                <div className="form-content">
                  <div className="form-group">
                    <label className="form-label">VTP Domain Name</label>
                    <input
                      type="text"
                      value={vtpConfig.domainName}
                      onChange={(e) => setVtpConfig({ ...vtpConfig, domainName: e.target.value })}
                      className="form-input"
                      placeholder="Enter VTP domain name"
                      disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
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
                      disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">VTP Mode</label>
                    <select
                      value={vtpConfig.mode}
                      onChange={(e) => setVtpConfig({ ...vtpConfig, mode: e.target.value })}
                      className="form-select"
                      disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                    >
                      <option value="server">Server</option>
                      <option value="client">Client</option>
                    </select>
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
                        <span className="preview-label">Switch IP:</span>
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
                        <span className="preview-label">Domain Name:</span>
                        <span className="preview-value">{vtpConfig.domainName || 'Not set'}</span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Mode:</span>
                        <span className="preview-value">
                          {vtpConfig.mode === 'server' ? 'VTP Server' : 'VTP Client'}
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Command to be sent:</span>
                        <span className="preview-value">
                          {vtpConfig.mode === 'server' ? 'configure_vtp_server_switch_ansible' : 'configure_vtp_client_switch_ansible'}
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Operation:</span>
                        <span className="preview-value">Configure VTP using stored credentials</span>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleConfigureVtp}
                    className="form-button"
                    disabled={loading || !isConnected || !selectedDevice || !vtpConfig.domainName || !vtpConfig.password || commandInProgressRef.current}
                  >
                    {loading ? 'Configuring VTP...' : 
                     vtpConfig.mode === 'server' ? 'Configure VTP Server' : 'Configure VTP Client'}
                  </button>
                </div>
              </div>
            ) : activeTab === 'port' ? (
              <div className="port-config-card">
                <div className="port-header">
                  <h3 className="form-title">Port Configuration</h3>
                  <div className="port-subtitle">
                    <p>Configure port mode (Access or Trunk)</p>
                    <div className="port-mode-info">
                      <span className="info-tag">Access:</span>
                      <span className="info-text">Carries traffic for a single VLAN (VLAN ID required)</span>
                      <span className="info-tag">Trunk:</span>
                    </div>
                  </div>
                </div>
                
                <div className="form-content">
                  {ports.map((port, index) => (
                    <div key={index} className="port-input-group">
                      <div className="port-input-header">
                        <span className="port-number">Port #{index + 1}</span>
                        {ports.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePort(index)}
                            className="btn-remove-port"
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className="port-input-row">
                        <div className="port-input-field">
                          <label className="form-label">
                            Interface Name
                            <span className="form-hint">(e.g., GigabitEthernet0/1)</span>
                          </label>
                          <input
                            type="text"
                            value={port.interfaceName}
                            onChange={(e) => updatePort(index, 'interfaceName', e.target.value)}
                            className="form-input"
                            placeholder="Enter interface name"
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          />
                        </div>
                        <div className="port-input-field">
                          <label className="form-label">Mode</label>
                          <select
                            value={port.mode}
                            onChange={(e) => updatePort(index, 'mode', e.target.value)}
                            className="form-select"
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          >
                            <option value="access">Access</option>
                            <option value="trunk">Trunk</option>
                          </select>
                        </div>
                      </div>
                      
                      {port.mode === 'access' && (
                        <div className="port-input-row">
                          <div className="port-input-field">
                            <label className="form-label">
                              VLAN ID
                              <span className="form-hint">(1-4094)</span>
                            </label>
                            <input
                              type="number"
                              value={port.vlanId}
                              onChange={(e) => updatePort(index, 'vlanId', e.target.value)}
                              className="form-input"
                              placeholder="Enter VLAN ID"
                              min="1"
                              max="4094"
                              disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  <div className="port-actions">
                    <button
                      onClick={addPort}
                      className="btn-add-port"
                      disabled={loading || !isConnected || !selectedDevice || ports.length >= 10 || commandInProgressRef.current}
                    >
                      <Plus size={16} />
                      Add Another Port
                    </button>
                    <span className="port-count">
                      {ports.length} port(s) configured
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
                        <span className="preview-label">Switch IP:</span>
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
                        <span className="preview-label">Ports to Configure:</span>
                        <span className="preview-value">
                          {ports.filter(p => p.interfaceName && p.mode).length > 0 
                            ? ports.filter(p => p.interfaceName && p.mode).map((p, i) => 
                                `${p.interfaceName} (${p.mode}${p.mode === 'access' && p.vlanId ? `, VLAN ${p.vlanId}` : ''})`
                              ).join(', ')
                            : 'No ports configured'
                          }
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Operation:</span>
                        <span className="preview-value">Configure port mode using stored credentials</span>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleConfigurePorts}
                    className="form-button"
                    disabled={loading || !isConnected || !selectedDevice || ports.filter(p => p.interfaceName && p.mode && (p.mode !== 'access' || p.vlanId)).length === 0 || commandInProgressRef.current}
                  >
                    {loading ? 'Configuring Ports...' : 'Configure Ports'}
                  </button>
                </div>
              </div>
            ) : activeTab === 'port-security' ? (
              <div className="port-security-config-card">
                <div className="port-security-header">
                  <h3 className="form-title">
                    <Lock size={18} style={{ marginRight: '8px' }} />
                    Port Security Configuration
                  </h3>
                  <div className="port-security-subtitle">
                    <p>Configure port security to limit and secure MAC addresses on switch ports</p>
                  </div>
                </div>
                
                <div className="form-content">
                  {portSecurityPorts.map((port, index) => (
                    <div key={index} className="port-security-input-group">
                      <div className="port-security-input-header">
                        <span className="port-security-number">Port #{index + 1}</span>
                        {portSecurityPorts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePortSecurityPort(index)}
                            className="btn-remove-port-security"
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      
                      <div className="port-security-input-row">
                        <div className="port-security-input-field">
                          <label className="form-label">
                            Interface Name
                            <span className="form-hint">(e.g., GigabitEthernet0/2)</span>
                          </label>
                          <input
                            type="text"
                            value={port.interfaceName}
                            onChange={(e) => updatePortSecurityPort(index, 'interfaceName', e.target.value)}
                            className="form-input"
                            placeholder="Enter interface name"
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          />
                        </div>
                        
                        <div className="port-security-input-field">
                          <label className="form-label">
                            Maximum Devices
                            <span className="form-hint">(1-100)</span>
                          </label>
                          <input
                            type="number"
                            value={port.maximumNumberOfDevice}
                            onChange={(e) => updatePortSecurityPort(index, 'maximumNumberOfDevice', e.target.value)}
                            className="form-input"
                            placeholder="Enter maximum devices"
                            min="1"
                            max="100"
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          />
                        </div>
                      </div>
                      
                      <div className="port-security-input-row">
                        <div className="port-security-input-field">
                          <label className="form-label">Violation Type</label>
                          <select
                            value={port.violationType}
                            onChange={(e) => updatePortSecurityPort(index, 'violationType', e.target.value)}
                            className="form-select"
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          >
                            <option value="protect">Protect</option>
                            <option value="restrict">Restrict</option>
                            <option value="shutdown">Shutdown</option>
                          </select>
                        </div>
                        
                        <div className="port-security-input-field">
                          <label className="form-label">MAC Address Type</label>
                          <select
                            value={port.macAddressType}
                            onChange={(e) => updatePortSecurityPort(index, 'macAddressType', e.target.value)}
                            className="form-select"
                            disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                          >
                            <option value="sticky">Sticky</option>
                            <option value="static">Static</option>
                          </select>
                        </div>
                      </div>
                      
                      {port.macAddressType === 'static' && (
                        <div className="port-security-input-row">
                          <div className="port-security-input-field">
                            <label className="form-label">
                              MAC Address
                              <span className="form-hint">(e.g., 0A-00-27-00-00-15)</span>
                            </label>
                            <input
                              type="text"
                              value={port.macAddress}
                              onChange={(e) => updatePortSecurityPort(index, 'macAddress', e.target.value)}
                              className="form-input"
                              placeholder="Enter MAC address"
                              disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  <div className="port-security-actions">
                    <button
                      onClick={addPortSecurityPort}
                      className="btn-add-port-security"
                      disabled={loading || !isConnected || !selectedDevice || portSecurityPorts.length >= 10 || commandInProgressRef.current}
                    >
                      <Plus size={16} />
                      Add Another Port
                    </button>
                    <span className="port-security-count">
                      {portSecurityPorts.length} port(s) configured
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
                        <span className="preview-label">Switch IP:</span>
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
                        <span className="preview-label">Ports to Secure:</span>
                        <span className="preview-value">
                          {portSecurityPorts.filter(p => p.interfaceName && p.maximumNumberOfDevice).length > 0 
                            ? portSecurityPorts.filter(p => p.interfaceName && p.maximumNumberOfDevice).map((p, i) => 
                                `${p.interfaceName} (max: ${p.maximumNumberOfDevice}, violation: ${p.violationType}, MAC type: ${p.macAddressType}${p.macAddressType === 'static' && p.macAddress ? `, MAC: ${p.macAddress}` : ''})`
                              ).join(', ')
                            : 'No ports configured'
                          }
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Operation:</span>
                        <span className="preview-value">Configure port security using stored credentials</span>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleConfigurePortSecurity}
                    className="form-button"
                    disabled={loading || !isConnected || !selectedDevice || portSecurityPorts.filter(p => p.interfaceName && p.maximumNumberOfDevice && p.violationType && p.macAddressType).length === 0 || commandInProgressRef.current}
                  >
                    {loading ? 'Configuring Port Security...' : 'Configure Port Security'}
                  </button>
                </div>
              </div>
            ) : activeTab === 'port-fast' ? (
              <div className="port-fast-config-card">
                <div className="port-fast-header">
                  <h3 className="form-title">
                    <Zap size={18} style={{ marginRight: '8px' }} />
                    Port Fast Configuration
                  </h3>
                  <div className="port-fast-subtitle">
                    <p>Configure Port Fast to immediately transition ports to forwarding state</p>
                  </div>
                </div>
                
                <div className="form-content">
                  <div className="form-group">
                    <label className="form-label">Configuration Level</label>
                    <div className="config-level-selector">
                      <button
                        className={`config-level-btn ${portFastConfig.configLevel === 'interface' ? 'active' : ''}`}
                        onClick={() => updatePortFastConfigLevel('interface')}
                        disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                      >
                        Interface Level
                      </button>
                      <button
                        className={`config-level-btn ${portFastConfig.configLevel === 'global' ? 'active' : ''}`}
                        onClick={() => updatePortFastConfigLevel('global')}
                        disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                      >
                        Global Level
                      </button>
                    </div>
                  </div>
                  
                  {portFastConfig.configLevel === 'interface' && (
                    <>
                      {portFastConfig.ports.map((port, index) => (
                        <div key={index} className="port-fast-input-group">
                          <div className="port-fast-input-header">
                            <span className="port-fast-number">Port #{index + 1}</span>
                            {portFastConfig.ports.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removePortFastPort(index)}
                                className="btn-remove-port-fast"
                                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                          
                          <div className="port-fast-input-row">
                            <div className="port-fast-input-field">
                              <label className="form-label">
                                Interface Name
                                <span className="form-hint">(e.g., GigabitEthernet0/1)</span>
                              </label>
                              <input
                                type="text"
                                value={port.interfaceName}
                                onChange={(e) => updatePortFastPort(index, e.target.value)}
                                className="form-input"
                                placeholder="Enter interface name"
                                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      <div className="port-fast-actions">
                        <button
                          onClick={addPortFastPort}
                          className="btn-add-port-fast"
                          disabled={loading || !isConnected || !selectedDevice || portFastConfig.ports.length >= 10 || commandInProgressRef.current}
                        >
                          <Plus size={16} />
                          Add Another Port
                        </button>
                        <span className="port-fast-count">
                          {portFastConfig.ports.length} port(s) configured
                        </span>
                      </div>
                    </>
                  )}
                  
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
                        <span className="preview-label">Switch IP:</span>
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
                        <span className="preview-label">Configuration Level:</span>
                        <span className="preview-value">
                          {portFastConfig.configLevel === 'interface' ? 'Interface Level' : 'Global Level'}
                        </span>
                      </div>
                      {portFastConfig.configLevel === 'interface' && (
                        <div className="preview-row">
                          <span className="preview-label">Ports to Configure:</span>
                          <span className="preview-value">
                            {portFastConfig.ports.filter(p => p.interfaceName).length > 0 
                              ? portFastConfig.ports.filter(p => p.interfaceName).map(p => p.interfaceName).join(', ')
                              : 'No ports configured'
                            }
                          </span>
                        </div>
                      )}
                      <div className="preview-row">
                        <span className="preview-label">Command to be sent:</span>
                        <span className="preview-value">
                          {portFastConfig.configLevel === 'interface' 
                            ? 'configure_port_fast_interface_level_switch_ansible' 
                            : 'configure_port_fast_global_level_switch_ansible'}
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Operation:</span>
                        <span className="preview-value">Configure Port Fast using stored credentials</span>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleConfigurePortFast}
                    className="form-button"
                    disabled={
                      loading || !isConnected || !selectedDevice || commandInProgressRef.current ||
                      (portFastConfig.configLevel === 'interface' && portFastConfig.ports.filter(p => p.interfaceName).length === 0)
                    }
                  >
                    {loading ? 'Configuring Port Fast...' : 'Configure Port Fast'}
                  </button>
                </div>
              </div>
            ) : activeTab === 'bpdu-guard' ? (
              <div className="bpdu-guard-config-card">
                <div className="bpdu-guard-header">
                  <h3 className="form-title">
                    <Shield size={18} style={{ marginRight: '8px' }} />
                    BPDU Guard Configuration
                  </h3>
                  <div className="bpdu-guard-subtitle">
                    <p>Configure BPDU Guard to protect spanning tree topology</p>
                  </div>
                </div>
                
                <div className="form-content">
                  <div className="form-group">
                    <label className="form-label">Configuration Level</label>
                    <div className="config-level-selector">
                      <button
                        className={`config-level-btn ${bpduGuardConfig.configLevel === 'interface' ? 'active' : ''}`}
                        onClick={() => updateBpduGuardConfigLevel('interface')}
                        disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                      >
                        Interface Level
                      </button>
                      <button
                        className={`config-level-btn ${bpduGuardConfig.configLevel === 'global' ? 'active' : ''}`}
                        onClick={() => updateBpduGuardConfigLevel('global')}
                        disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                      >
                        Global Level
                      </button>
                    </div>
                  </div>
                  
                  {bpduGuardConfig.configLevel === 'interface' && (
                    <>
                      {bpduGuardConfig.ports.map((port, index) => (
                        <div key={index} className="bpdu-guard-input-group">
                          <div className="bpdu-guard-input-header">
                            <span className="bpdu-guard-number">Port #{index + 1}</span>
                            {bpduGuardConfig.ports.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeBpduGuardPort(index)}
                                className="btn-remove-bpdu-guard"
                                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                          
                          <div className="bpdu-guard-input-row">
                            <div className="bpdu-guard-input-field">
                              <label className="form-label">
                                Interface Name
                                <span className="form-hint">(e.g., GigabitEthernet0/1)</span>
                              </label>
                              <input
                                type="text"
                                value={port.interfaceName}
                                onChange={(e) => updateBpduGuardPort(index, e.target.value)}
                                className="form-input"
                                placeholder="Enter interface name"
                                disabled={loading || !isConnected || !selectedDevice || commandInProgressRef.current}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      <div className="bpdu-guard-actions">
                        <button
                          onClick={addBpduGuardPort}
                          className="btn-add-bpdu-guard"
                          disabled={loading || !isConnected || !selectedDevice || bpduGuardConfig.ports.length >= 10 || commandInProgressRef.current}
                        >
                          <Plus size={16} />
                          Add Another Port
                        </button>
                        <span className="bpdu-guard-count">
                          {bpduGuardConfig.ports.length} port(s) configured
                        </span>
                      </div>
                    </>
                  )}
                  
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
                        <span className="preview-label">Switch IP:</span>
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
                        <span className="preview-label">Configuration Level:</span>
                        <span className="preview-value">
                          {bpduGuardConfig.configLevel === 'interface' ? 'Interface Level' : 'Global Level'}
                        </span>
                      </div>
                      {bpduGuardConfig.configLevel === 'interface' && (
                        <div className="preview-row">
                          <span className="preview-label">Ports to Configure:</span>
                          <span className="preview-value">
                            {bpduGuardConfig.ports.filter(p => p.interfaceName).length > 0 
                              ? bpduGuardConfig.ports.filter(p => p.interfaceName).map(p => p.interfaceName).join(', ')
                              : 'No ports configured'
                            }
                          </span>
                        </div>
                      )}
                      <div className="preview-row">
                        <span className="preview-label">Command to be sent:</span>
                        <span className="preview-value">
                          {bpduGuardConfig.configLevel === 'interface' 
                            ? 'configure_bpdu_guard_interface_level_switch_ansible' 
                            : 'configure_bpdu_global_level_switch_ansible'}
                        </span>
                      </div>
                      <div className="preview-row">
                        <span className="preview-label">Operation:</span>
                        <span className="preview-value">Configure BPDU Guard using stored credentials</span>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleConfigureBpduGuard}
                    className="form-button"
                    disabled={
                      loading || !isConnected || !selectedDevice || commandInProgressRef.current ||
                      (bpduGuardConfig.configLevel === 'interface' && bpduGuardConfig.ports.filter(p => p.interfaceName).length === 0)
                    }
                  >
                    {loading ? 'Configuring BPDU Guard...' : 'Configure BPDU Guard'}
                  </button>
                </div>
              </div>
            ) : null}
            
            {!isConnected && (
              <div className="no-connection-notice">
                Connect to backend to configure switch settings
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

export default Switch;