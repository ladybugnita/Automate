import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import './DNSConfiguration.css';

function DNSConfiguration() {
  const { 
    sendCommand, 
    isConnected, 
    addListener, 
    installations, 
    INSTALLATION_STATUS,
    updateInstallationStatus 
  } = useWebSocket();
  
  const [dnsRoleInstalled, setDnsRoleInstalled] = useState({ primary: null, secondary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dnsDetails, setDnsDetails] = useState({ primary: null, secondary: null });
  const [zones, setZones] = useState({ primary: { forward: [], reverse: [] }, secondary: { forward: [], reverse: [] } });
  const [zonesLoading, setZonesLoading] = useState({ primary: false, secondary: false });
  const [activeTab, setActiveTab] = useState('forward-zones');
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showCreateZoneModal, setShowCreateZoneModal] = useState(false);
  const [showCreateRecordModal, setShowCreateRecordModal] = useState(false);
  const [selectedZone, setSelectedZone] = useState({ machine: null, zone: null, zoneType: null });
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState('');
  const [installSuccess, setInstallSuccess] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true); 
  const [dnsMachines, setDnsMachines] = useState([]);
  const [noDnsConfigured, setNoDnsConfigured] = useState(false);
  const [showNoDnsModal, setShowNoDnsModal] = useState(false);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [newlyCreatedZones, setNewlyCreatedZones] = useState([]);
  const [newlyCreatedRecords, setNewlyCreatedRecords] = useState([]);
  
  const [newZoneData, setNewZoneData] = useState({
    zoneName: '',
    zoneType: 'forward',
    dynamicUpdate: 'Secure',
    targetMachine: 'primary'
  });
  
  const [newRecordData, setNewRecordData] = useState({
    recordType: 'A',
    recordName: '',
    recordValue: '',
    recordIp: '',
    ttl: 3600,
    targetMachine: 'primary'
  });

  const initialCheckDone = useRef(false);
  const listenerAdded = useRef(false);
  const dnsMachinesRef = useRef([]);
  const pendingRefreshRef = useRef(false);
  const lastCommandTimeRef = useRef(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const hasFetchedInitialDetails = useRef(false);
  const zonesDataRef = useRef(zones);
  const dnsDetailsRef = useRef(dnsDetails);
  const refreshTimeoutRef = useRef(null);
  const lastRefreshAttemptRef = useRef(0);
  const pendingActionsRef = useRef(new Set());
  const actionInProgressRef = useRef(false);
  const zoneCreationRetryCount = useRef(0);
  const maxZoneRetries = 5;
  const autoRefreshTimeoutRef = useRef(null);
  const recordRefreshAttemptsRef = useRef(0);
  const maxRecordRefreshAttempts = 3;
  const recentlyCreatedRecordIds = useRef(new Set());
  const pendingRecordCreations = useRef(new Set());
  const isFetchingRef = useRef(false);
  const fetchInProgressRef = useRef(false);
  const mountedRef = useRef(false);
  const machineInfoListenerRef = useRef(false);
  
  const commandInProgressRef = useRef(false);
  const pendingCommandsRef = useRef([]);
  const lastDNSCheckTimeRef = useRef(0);
  const lastDNSInstallTimeRef = useRef(0);
  const commandCooldownTime = 1000; 

  const navItems = [
    'Dashboard', 'DNS Configuration', 'Event Viewer', 'DHCP', 'Users', 
    'Resource Monitor', 'ESXi','Switch', 'Machine Management', 
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
    
    if (command === 'check_dns_role_installed_server_ansible') {
      const timeSinceLastCheck = now - lastDNSCheckTimeRef.current;
      if (timeSinceLastCheck < commandCooldownTime) {
        console.log(`DNS Configuration: Skipping duplicate ${command} command (cooldown: ${commandCooldownTime - timeSinceLastCheck}ms remaining)`);
        return;
      }
      lastDNSCheckTimeRef.current = now;
    }
    
    if (command === 'install_dns_role_server_ansible') {
      const timeSinceLastInstall = now - lastDNSInstallTimeRef.current;
      if (timeSinceLastInstall < commandCooldownTime) {
        console.log(`DNS Configuration: Skipping duplicate ${command} command (cooldown: ${commandCooldownTime - timeSinceLastInstall}ms remaining)`);
        return;
      }
      lastDNSInstallTimeRef.current = now;
    }
    
    if (commandInProgressRef.current) {
      console.log(`DNS Configuration: Command ${command} is already in progress, queueing...`);
      pendingCommandsRef.current.push({ command, payload });
      return;
    }
    
    commandInProgressRef.current = true;
    
    console.log(`DNS Configuration: SENDING COMMAND: ${command}`, payload ? 'with payload' : 'no payload');
    
    sendCommand(command, payload);
    
    setTimeout(() => {
      commandInProgressRef.current = false;
      
      if (pendingCommandsRef.current.length > 0) {
        const nextCommand = pendingCommandsRef.current.shift();
        console.log(`DNS Configuration: Processing queued command: ${nextCommand.command}`);
        sendCommandWithFlow(nextCommand.command, nextCommand.payload);
      }
    }, 500); 
  }, [sendCommand]);

  const processNextCommand = useCallback(() => {
    if (pendingCommandsRef.current.length > 0 && !commandInProgressRef.current) {
      const nextCommand = pendingCommandsRef.current.shift();
      console.log(`DNS Configuration: Processing queued command: ${nextCommand.command}`);
      sendCommandWithFlow(nextCommand.command, nextCommand.payload);
    }
  }, [sendCommandWithFlow]);

  const getTotalZonesCount = () => {
    return (zones.primary.forward.length + zones.primary.reverse.length + 
            zones.secondary.forward.length + zones.secondary.reverse.length);
  };

  const getTotalRecordsCount = () => {
    let total = 0;
    const allZones = [
      ...zones.primary.forward,
      ...zones.primary.reverse,
      ...zones.secondary.forward,
      ...zones.secondary.reverse
    ];
    allZones.forEach(zone => {
      total += zone.recordCount || 0;
    });
    return total;
  };

  const formatLastRefreshTime = () => {
    if (!lastCommandTimeRef.current) return 'Never';
    
    const now = new Date();
    const diffMs = now - lastCommandTimeRef.current;
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 60) return `${diffSec} seconds ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`;
    return `${Math.floor(diffSec / 3600)} hours ago`;
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

  const getServerInfoForMachine = (machine) => {
    if (!machine) {
      console.error('DNS Configuration: No machine provided to getServerInfoForMachine');
      return null;
    }
    
    console.log(`DNS Configuration: Getting server info for machine: ${machine.name || 'Unknown'} (${machine.ip})`);
    
    const password = machine.password || machine.password_provided || '';
    
    console.log(`DNS Configuration: Password for machine ${machine.name || machine.ip}:`, password ? '***HIDDEN***' : 'NOT FOUND');
    
    if (!password) {
      console.error('DNS Configuration: No password found for machine:', machine.name || machine.ip);
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
    if (fetchInProgressRef.current || !mountedRef.current) {
      console.log('DNS Configuration: Fetch already in progress or component unmounted');
      return;
    }
    
    fetchInProgressRef.current = true;
    console.log('DNS Configuration: Fetching machines from Node.js REST API...');
    setMachinesLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      console.log('DNS Configuration: Trying to fetch machines WITH passwords...');
      
      const response = await fetch(`${API_BASE_URL}/api/machines/get-machines?include_password=true`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.log('DNS Configuration: Endpoint with password parameter failed, trying without parameter...');
        
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
        console.log('DNS Configuration: Received machines from /api/machines/get-machines:', data);
        await processMachineData(data);
        return;
      }
      
      const data = await response.json();
      console.log('DNS Configuration: Received machines from /api/machines/get-machines?include_password=true:', data);
      await processMachineData(data);
      
    } catch (err) {
      console.error('DNS Configuration: REST API failed:', err);
      if (mountedRef.current) {
        setError(`Failed to fetch machines: ${err.message}. Please check if machines are properly configured.`);
        setMachinesLoading(false);
      }
      
      if (mountedRef.current && isConnected) {
        console.log('DNS Configuration: Falling back to WebSocket for get_machine_info');
        sendCommandWithFlow('get_machine_info', {});
      }
    } finally {
      fetchInProgressRef.current = false;
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
      
      console.log('DNS Configuration: Total machines found:', machines.length);
      
      const dnsMachinesList = machines.filter(machine => {
        const hasMarks = machine.marked_as && 
                       Array.isArray(machine.marked_as) && 
                       machine.marked_as.some(mark => mark.role === 'dns');
        
        if (hasMarks) {
          console.log(`DNS Configuration: Found DNS machine: ${machine.name || 'Unknown'} (${machine.ip})`, {
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
      
      console.log(`DNS Configuration: Found ${dnsMachinesList.length} DNS machines:`, dnsMachinesList);
      
      if (dnsMachinesList.length === 0) {
        console.log('DNS Configuration: No DNS machines found');
        setNoDnsConfigured(true);
        setShowNoDnsModal(true);
        setMachinesLoading(false);
        setLoading(false);
        setCheckingStatus(false);
        return;
      }
      
      const machinesWithPasswords = dnsMachinesList.filter(machine => {
        const hasPassword = machine.password || machine.password_provided;
        if (!hasPassword) {
          console.warn(`DNS Configuration: Machine ${machine.name || 'Unknown'} (${machine.ip}) has no password`);
        }
        return hasPassword;
      });
      
      if (machinesWithPasswords.length === 0) {
        console.error('DNS Configuration: No DNS machines have passwords');
        setError('DNS machines found but no passwords available. Please check machine credentials in Machine Management.');
        setNoDnsConfigured(true);
        setShowNoDnsModal(true);
      } else {
        setNoDnsConfigured(false);
        setShowNoDnsModal(false);
      }
      
      setDnsMachines(dnsMachinesList);
      dnsMachinesRef.current = dnsMachinesList;
      setMachinesLoading(false);
      
      checkDNSOnMachines(dnsMachinesList);
    }
  }, [API_BASE_URL, isConnected, sendCommandWithFlow]);

  const getMachineByType = (type) => {
    return dnsMachinesRef.current.find(machine => {
      const dnsRole = machine.marked_as?.find(mark => mark.role === 'dns');
      return dnsRole?.type === type;
    });
  };

  const createPayload = (additionalData = {}, targetMachine = 'primary') => {
    const machine = getMachineByType(targetMachine);
    
    if (!machine) {
      console.error(`DNS Configuration: No ${targetMachine} DNS machine found`);
      return null;
    }
    
    const serverInfo = getServerInfoForMachine(machine);
    if (!serverInfo) {
      console.error(`DNS Configuration: Failed to get server info for ${targetMachine} machine:`, machine.name);
      return null;
    }
    
    console.log(`DNS Configuration: Creating payload for ${targetMachine} machine:`, machine.name);
    
    return {
      server_info: serverInfo,
      ...additionalData
    };
  };

  const normalizeZoneName = (zoneName) => {
    if (!zoneName) return '';
    return zoneName.endsWith('.') ? zoneName.slice(0, -1) : zoneName;
  };

  const processZonesFromDetails = useCallback((details, machineType) => {
    console.log(`DNS Configuration: Processing zones for ${machineType}:`, details);
    
    const forwardZones = [];
    const reverseZones = [];
    
    if (details.forward_zones) {
      console.log(`DNS Configuration: Found forward zones for ${machineType}:`, Object.keys(details.forward_zones));
      
      Object.entries(details.forward_zones).forEach(([zoneKey, zoneData]) => {
        try {
          const rawZoneName = zoneData.name || zoneData.zone_name || zoneKey;
          const zoneName = normalizeZoneName(rawZoneName);
          const zoneType = zoneData.zone_type || zoneData.type || zoneData['zone-type'] || 'Primary';
          const dynamicUpdate = zoneData.dynamic_update || zoneData.dynamic_update_type || 'None';
          
          let recordCount = 0;
          if (zoneData.records) {
            Object.values(zoneData.records).forEach(recordTypeObj => {
              if (recordTypeObj && typeof recordTypeObj === 'object') {
                recordCount += Object.keys(recordTypeObj).length;
              }
            });
          }
          
          forwardZones.push({
            id: `${machineType}-${zoneName}-${Date.now()}`,
            name: zoneName,
            type: zoneType,
            dynamicUpdate: dynamicUpdate,
            recordCount: recordCount,
            rawData: zoneData,
            machine: machineType
          });
          
          console.log(`DNS Configuration: Added forward zone: ${zoneName} (${recordCount} records)`);
        } catch (err) {
          console.error(`DNS Configuration: Error processing forward zone ${zoneKey}:`, err);
        }
      });
    }
    
    if (details.reverse_zones) {
      console.log(`DNS Configuration: Found reverse zones for ${machineType}:`, Object.keys(details.reverse_zones));
      
      Object.entries(details.reverse_zones).forEach(([zoneKey, zoneData]) => {
        try {
          const rawZoneName = zoneData.name || zoneData.zone_name || zoneKey;
          const zoneName = normalizeZoneName(rawZoneName);
          const zoneType = 'Reverse';
          const dynamicUpdate = zoneData.dynamic_update || zoneData.dynamic_update_type || 'None';
          
          let recordCount = 0;
          if (zoneData.records) {
            Object.values(zoneData.records).forEach(recordTypeObj => {
              if (recordTypeObj && typeof recordTypeObj === 'object') {
                recordCount += Object.keys(recordTypeObj).length;
              }
            });
          }
          
          reverseZones.push({
            id: `${machineType}-${zoneName}-${Date.now()}`,
            name: zoneName,
            type: zoneType,
            dynamicUpdate: dynamicUpdate,
            recordCount: recordCount,
            rawData: zoneData,
            machine: machineType
          });
          
          console.log(`DNS Configuration: Added reverse zone: ${zoneName} (${recordCount} records)`);
        } catch (err) {
          console.error(`DNS Configuration: Error processing reverse zone ${zoneKey}:`, err);
        }
      });
    }
    
    console.log(`DNS Configuration: Processed ${machineType} zones - Forward: ${forwardZones.length}, Reverse: ${reverseZones.length}`);
    
    return {
      forward: forwardZones,
      reverse: reverseZones
    };
  }, []);

  const forceRefreshDNSData = useCallback(() => {
    return new Promise((resolve) => {
      if (pendingRefreshRef.current) {
        console.log('DNS Configuration: Refresh already in progress, skipping');
        resolve(false);
        return;
      }
      
      pendingRefreshRef.current = true;
      retryCountRef.current = 0;
      
      console.log('DNS Configuration: Starting forced DNS data refresh...');
      performDNSRefresh(resolve);
    });
  }, []);

  const fetchZoneRecords = useCallback((zoneName, machineType, zoneType = null, forceRefresh = false, keepNewRecords = true) => {
    console.log(`DNS Configuration: Fetching records for zone: ${zoneName} (${machineType})`);
    
    if (!zoneName || !machineType) {
      console.error('DNS Configuration: Missing zone name or machine type');
      return;
    }
    
    const detectedZoneType = zoneType || (zoneName.includes('in-addr.arpa') ? 'reverse' : 'forward');
    setSelectedZone({ 
      machine: machineType, 
      zone: zoneName,
      zoneType: detectedZoneType
    });
    
    setRecordsLoading(true);
    
    const details = dnsDetailsRef.current[machineType];
    if (!details) {
      console.log(`DNS Configuration: No DNS details available for ${machineType}, fetching fresh data...`);
      forceRefreshDNSData().then(() => {
        setTimeout(() => {
          fetchZoneRecords(zoneName, machineType, zoneType, true, keepNewRecords);
        }, 1000);
      });
      return;
    }
    
    let allRecords = [];
    let foundZone = false;
    const normalizedZoneName = normalizeZoneName(zoneName);
    
    const searchInZones = (zonesDict) => {
      if (!zonesDict) return;
      
      Object.entries(zonesDict).forEach(([zoneKey, zoneData]) => {
        const currentZoneName = zoneData.name || zoneData.zone_name || zoneKey;
        const normalizedCurrentZoneName = normalizeZoneName(currentZoneName);
        
        if (normalizedCurrentZoneName === normalizedZoneName || zoneKey === zoneName) {
          foundZone = true;
          console.log(`DNS Configuration: Found zone: ${currentZoneName}`, zoneData);
          
          if (zoneData.records) {
            Object.entries(zoneData.records).forEach(([recordType, recordTypeObj]) => {
              if (recordTypeObj && typeof recordTypeObj === 'object') {
                Object.entries(recordTypeObj).forEach(([recordKey, recordData]) => {
                  const recordValue = recordData.value || recordData.data || 
                                    recordData.host_name || recordData.host_name || 
                                    recordData.name || '';
                  
                  const recordId = `${machineType}-${zoneKey}-${recordType}-${recordKey}-${Date.now()}`;
                  allRecords.push({
                    id: recordId,
                    name: recordKey,
                    type: recordType,
                    data: recordValue,
                    ttl: recordData.ttl || '01:00:00',
                    priority: recordData.priority || '-',
                    machine: machineType,
                    zone: zoneName,
                    isFromBackend: true
                  });
                });
              }
            });
          }
        }
      });
    };
    
    searchInZones(details.forward_zones);
    
    searchInZones(details.reverse_zones);
    
    if (keepNewRecords) {
      newlyCreatedRecords.forEach(newRecord => {
        const normalizedNewRecordZone = normalizeZoneName(newRecord.zone);
        if (normalizedNewRecordZone === normalizedZoneName && newRecord.machine === machineType) {
          const alreadyInBackend = allRecords.some(record => 
            normalizeZoneName(record.name) === normalizeZoneName(newRecord.name) &&
            record.machine === newRecord.machine &&
            record.type === newRecord.type &&
            record.data === newRecord.data
          );
          
          if (!alreadyInBackend) {
            const newRecordId = `new-${machineType}-${normalizedZoneName}-${newRecord.name}-${newRecord.type}-${newRecord.timestamp}`;
            
            if (!recentlyCreatedRecordIds.current.has(newRecordId)) {
              allRecords.push({
                id: newRecordId,
                name: newRecord.name,
                type: newRecord.type,
                data: newRecord.data,
                ttl: newRecord.ttl || '01:00:00',
                priority: '-',
                machine: machineType,
                zone: zoneName,
                isNewlyCreated: true
              });
              
              recentlyCreatedRecordIds.current.add(newRecordId);
              
              setTimeout(() => {
                recentlyCreatedRecordIds.current.delete(newRecordId);
              }, 30000);
            }
          }
        }
      });
    }
    
    if (!foundZone && allRecords.length === 0) {
      console.warn(`DNS Configuration: Zone ${zoneName} not found in ${machineType} details.`);
      console.log('DNS Configuration: Available zones:', {
        forward: details.forward_zones ? Object.keys(details.forward_zones) : [],
        reverse: details.reverse_zones ? Object.keys(details.reverse_zones) : []
      });
    } else {
      console.log(`DNS Configuration: Found ${allRecords.length} records for zone ${zoneName}`);
      
      const uniqueRecords = [];
      const seen = new Set();
      
      allRecords.forEach(record => {
        const key = `${record.name}|${record.type}|${record.data}|${record.machine}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueRecords.push(record);
        }
      });
      
      console.log(`DNS Configuration: After deduplication: ${uniqueRecords.length} unique records`);
      setRecords(uniqueRecords);
    }
    
    setRecordsLoading(false);
    
    recordRefreshAttemptsRef.current = 0;
    
  }, [newlyCreatedRecords, forceRefreshDNSData]);

  const performDNSRefresh = useCallback((resolve) => {
    if (!isConnected) {
      console.error('DNS Configuration: WebSocket not connected');
      setError('WebSocket not connected.');
      pendingRefreshRef.current = false;
      if (resolve) resolve(false);
      return;
    }

    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
    if (!primaryMachine && !secondaryMachine) {
      console.error('DNS Configuration: No DNS machines available');
      setError('No DNS machines available.');
      pendingRefreshRef.current = false;
      if (resolve) resolve(false);
      return;
    }

    console.log(`DNS Configuration: Refreshing DNS data (attempt ${retryCountRef.current + 1}/${maxRetries})...`);
    
    setRefreshing(true);
    setError(null);
    setZonesLoading({ primary: !!primaryMachine, secondary: !!secondaryMachine });
    
    const sendCommandForMachine = (machine, machineType) => {
      const payload = {
        server_info: getServerInfoForMachine(machine)
      };
      
      if (!payload.server_info) {
        console.error(`DNS Configuration: Failed to create payload for ${machineType}`);
        return;
      }
      
      console.log(`DNS Configuration: Sending get_dns_details_server_ansible for ${machineType}: ${machine.ip}`);
      sendCommandWithFlow('get_dns_details_server_ansible', payload);
    };
    
    if (primaryMachine) {
      sendCommandForMachine(primaryMachine, 'primary');
    }
    
    if (secondaryMachine) {
      setTimeout(() => {
        sendCommandForMachine(secondaryMachine, 'secondary');
      }, 1000);
    }
    
    lastCommandTimeRef.current = new Date();
    
    setTimeout(() => {
      if (pendingRefreshRef.current && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        console.log(`DNS Configuration: No response, retrying (${retryCountRef.current}/${maxRetries})...`);
        performDNSRefresh(resolve);
      } else if (pendingRefreshRef.current) {
        console.error('DNS Configuration: Max retries reached, giving up');
        setError('Failed to refresh DNS data after multiple attempts. Please try again.');
        setRefreshing(false);
        pendingRefreshRef.current = false;
        if (resolve) resolve(false);
      }
    }, 10000); 
  }, [isConnected, sendCommandWithFlow]);

  const refreshDNSData = () => {
    forceRefreshDNSData();
  };

  const processDNSDetails = useCallback((responseData, machineType = null) => {
    console.log('DNS Configuration: Processing DNS details response:', responseData);
    
    if (!responseData) {
      console.log('DNS Configuration: No response data to process');
      return;
    }
    
    retryCountRef.current = 0;
    
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    
    let targetMachineType = machineType;
    
    if (!targetMachineType) {
      const primaryMachine = getMachineByType('primary');
      const secondaryMachine = getMachineByType('secondary');
      
      if (primaryMachine && !secondaryMachine) {
        targetMachineType = 'primary';
      } else if (!primaryMachine && secondaryMachine) {
        targetMachineType = 'secondary';
      } else {
        targetMachineType = 'primary';
        console.log('DNS Configuration: Could not determine machine type, defaulting to primary');
      }
    }
    
    console.log(`DNS Configuration: Processing DNS details for machine: ${targetMachineType}`);
    
    const details = responseData.dns_details || responseData;
    const processedZones = processZonesFromDetails(details, targetMachineType);
    
    setDnsDetails(prev => {
      const newDetails = {
        ...prev,
        [targetMachineType]: details
      };
      dnsDetailsRef.current = newDetails;
      return newDetails;
    });
    
    setZones(prev => {
      const newZones = {
        ...prev,
        [targetMachineType]: processedZones
      };
      zonesDataRef.current = newZones;
      console.log(`DNS Configuration: Updated ${targetMachineType} zones:`, newZones[targetMachineType]);
      
      if (newlyCreatedZones.length > 0) {
        const remainingZones = newlyCreatedZones.filter(
          zone => !(zone.machineType === targetMachineType && 
                   processedZones.forward.some(z => normalizeZoneName(z.name) === normalizeZoneName(zone.name)))
        );
        if (remainingZones.length !== newlyCreatedZones.length) {
          setNewlyCreatedZones(remainingZones);
        }
      }
      
      return newZones;
    });
    
    setZonesLoading(prev => ({ ...prev, [targetMachineType]: false }));
    setRefreshing(false);
    setError(null);
    lastCommandTimeRef.current = new Date();
    pendingRefreshRef.current = false;
    hasFetchedInitialDetails.current = true;
    actionInProgressRef.current = false;
    
    if (selectedZone.zone && selectedZone.machine === targetMachineType) {
      console.log(`DNS Configuration: Auto-refreshing records for selected zone: ${selectedZone.zone}`);
      setTimeout(() => {
        fetchZoneRecords(selectedZone.zone, targetMachineType, selectedZone.zoneType, true);
      }, 300);
    }
    
    const updateData = {
      [targetMachineType]: { details: details, zones: processedZones }
    };
    checkNewlyCreatedRecordsAgainstResponse(updateData);
    
  }, [selectedZone, processZonesFromDetails, newlyCreatedZones, fetchZoneRecords]);

  const checkNewlyCreatedZonesAgainstResponse = useCallback((newZones, updates) => {
    if (newlyCreatedZones.length === 0) return;
    
    console.log('DNS Configuration: Checking newly created zones against response...');
    
    const remainingZones = [];
    
    newlyCreatedZones.forEach(newZone => {
      const { name, machineType } = newZone;
      const normalizedZoneName = normalizeZoneName(name);
      let found = false;
      
      if (updates && updates[machineType]) {
        const machineUpdates = updates[machineType];
        if (machineUpdates.zones) {
          found = machineUpdates.zones.forward.some(z => normalizeZoneName(z.name) === normalizedZoneName);
          if (!found) {
            found = machineUpdates.zones.reverse.some(z => normalizeZoneName(z.name) === normalizedZoneName);
          }
        }
      }
      
      if (found) {
        console.log(`DNS Configuration: New zone "${name}" found in response! Removing from pending list.`);
      } else {
        console.log(`DNS Configuration: New zone "${name}" NOT found in response, keeping in pending list.`);
        remainingZones.push(newZone);
      }
    });
    
    if (remainingZones.length !== newlyCreatedZones.length) {
      setNewlyCreatedZones(remainingZones);
      console.log(`DNS Configuration: Updated newlyCreatedZones: ${remainingZones.length} zones pending`);
    }
  }, [newlyCreatedZones]);

  const checkNewlyCreatedRecordsAgainstResponse = useCallback((updates) => {
    if (newlyCreatedRecords.length === 0) return;
    
    console.log('DNS Configuration: Checking newly created records against response...');
    
    const remainingRecords = [];
    
    newlyCreatedRecords.forEach(newRecord => {
      const { name, machine, zone, type } = newRecord;
      const normalizedZoneName = normalizeZoneName(zone);
      const normalizedRecordName = normalizeZoneName(name);
      let found = false;
      
      const targetMachine = updates[machine];
      
      if (targetMachine && targetMachine.details) {
        const details = targetMachine.details;
        
        if (details.forward_zones) {
          Object.entries(details.forward_zones).forEach(([zoneKey, zoneData]) => {
            const currentZoneName = zoneData.name || zoneData.zone_name || zoneKey;
            const normalizedCurrentZoneName = normalizeZoneName(currentZoneName);
            
            if (normalizedCurrentZoneName === normalizedZoneName) {
              if (zoneData.records && zoneData.records[type]) {
                const recordTypeObj = zoneData.records[type];
                if (recordTypeObj && typeof recordTypeObj === 'object') {
                  found = Object.keys(recordTypeObj).some(recordKey => 
                    normalizeZoneName(recordKey) === normalizedRecordName
                  );
                  
                  if (found && recordTypeObj[name]) {
                    const recordData = recordTypeObj[name];
                    const recordValue = recordData.value || recordData.data || '';
                    if (recordValue !== newRecord.data) {
                      console.log(`DNS Configuration: Record "${name}" found but data doesn't match: ${recordValue} vs ${newRecord.data}`);
                    }
                  }
                }
              }
            }
          });
        }
        
        if (!found && details.reverse_zones) {
          Object.entries(details.reverse_zones).forEach(([zoneKey, zoneData]) => {
            const currentZoneName = zoneData.name || zoneData.zone_name || zoneKey;
            const normalizedCurrentZoneName = normalizeZoneName(currentZoneName);
            
            if (normalizedCurrentZoneName === normalizedZoneName) {
              if (zoneData.records && zoneData.records[type]) {
                const recordTypeObj = zoneData.records[type];
                if (recordTypeObj && typeof recordTypeObj === 'object') {
                  found = Object.keys(recordTypeObj).some(recordKey => 
                    normalizeZoneName(recordKey) === normalizedRecordName
                  );
                }
              }
            }
          });
        }
      }
      
      if (found) {
        console.log(`DNS Configuration: New record "${name}" (${type}) found in response!`);
      } else {
        console.log(`DNS Configuration: New record "${name}" (${type}) NOT found in response, keeping in pending list.`);
        remainingRecords.push(newRecord);
      }
    });
    
    if (remainingRecords.length !== newlyCreatedRecords.length) {
      setNewlyCreatedRecords(remainingRecords);
      console.log(`DNS Configuration: Updated newlyCreatedRecords: ${remainingRecords.length} records pending`);
    }
  }, [newlyCreatedRecords]);

  const handleWebSocketMessage = useCallback((message) => {
    console.log('DNS Configuration: received WebSocket message:', message);
    
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
      console.log('DNS Configuration: No command found in message:', message);
      return;
    }
    
    console.log(`DNS Configuration: Processing response for command: ${command}`, { result, error, payload });
    
    if (error) {
      console.log(`DNS Configuration: Error from backend for command ${command}:`, error);
      setError(`Error: ${error}`);
      setLoading(false);
      setCheckingStatus(false);
      setActionLoading(false);
      actionInProgressRef.current = false;
      commandInProgressRef.current = false;
      processNextCommand();
      return;
    }
    
    const responseData = extractResult(result);
    console.log('DNS Configuration: Extracted response data:', responseData);
    
    switch(command) {
      case 'get_machine_info':
        console.log('DNS Configuration: Received machine info via WebSocket fallback');
        if (responseData && responseData.machines && Array.isArray(responseData.machines)) {
          const dnsMachinesList = responseData.machines.filter(machine => {
            return machine.marked_as && Array.isArray(machine.marked_as) && 
                   machine.marked_as.some(mark => mark.role === 'dns');
          });
          
          console.log(`DNS Configuration: Found ${dnsMachinesList.length} DNS machines via WebSocket:`, dnsMachinesList);
          
          if (dnsMachinesList.length === 0) {
            setNoDnsConfigured(true);
            setShowNoDnsModal(true);
            setMachinesLoading(false);
            setLoading(false);
            setCheckingStatus(false);
          } else {
            setDnsMachines(dnsMachinesList);
            dnsMachinesRef.current = dnsMachinesList;
            setNoDnsConfigured(false);
            setShowNoDnsModal(false);
            setMachinesLoading(false);
            checkDNSOnMachines(dnsMachinesList);
          }
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'check_dns_role_installed_server_ansible':
        console.log('DNS Configuration: Received DNS check response');
        handleDNSCheckResponse(responseData);
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'get_dns_details_server_ansible':
        console.log('DNS Configuration: Received DNS details response');
        if (responseData) {
          let machineType = null;
          if (payload && payload.server_info) {
            const primaryMachine = getMachineByType('primary');
            const secondaryMachine = getMachineByType('secondary');
            
            if (primaryMachine && payload.server_info.ip === primaryMachine.ip) {
              machineType = 'primary';
            } else if (secondaryMachine && payload.server_info.ip === secondaryMachine.ip) {
              machineType = 'secondary';
            }
          }
          
          processDNSDetails(responseData, machineType);
        } else {
          console.error('DNS Configuration: Empty response for DNS details');
          setError('Received empty response from server');
          setZonesLoading({ primary: false, secondary: false });
          setRefreshing(false);
          actionInProgressRef.current = false;
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'install_dns_role_server_ansible':
        console.log('DNS Configuration: Received DNS installation response');
        handleDNSInstallResponse(responseData);
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'create_zone_forward_lookup_zone_dns_server_ansible':
      case 'create_zone_reverse_lookup_zone_dns_server_ansible':
        console.log('DNS Configuration: Received zone creation response');
        handleZoneCreationResponse(responseData);
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'create_host_record_forward_lookup_zone_dns_server_ansible':
      case 'create_pointer_record_reverse_lookup_zone_dns_server_ansible':
        console.log('DNS Configuration: Received record creation response');
        handleRecordCreationResponse(responseData);
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'delete_forward_zone_dns_windows_ansible':
      case 'delete_reverse_zone_dns_windows_ansible':
        console.log('DNS Configuration: Received zone deletion response');
        handleZoneDeletionResponse(responseData);
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      default:
        console.log(`DNS Configuration: Unhandled command: ${command}`);
        commandInProgressRef.current = false;
        processNextCommand();
    }
  }, [processDNSDetails, processNextCommand]);

  const handleDNSCheckResponse = (responseData) => {
    console.log('DNS Configuration: Processing DNS check response:', responseData);
    
    if (!responseData) {
      console.log('DNS Configuration: No response data in DNS check');
      setLoading(false);
      setCheckingStatus(false);
      return;
    }
    
    const newDnsRoleInstalled = { ...dnsRoleInstalled };
    
    let isInstalled = false;

    if (responseData.requires_installation === false){
      isInstalled = true;
      console.log('DNS Configuration: requires_installation is false. DNS is installed');
    } else if (responseData.dns_installed === true) {
      isInstalled = true;
      console.log('DNS Configuration: dns_installed is true. DNS is installed.');
    } else if (responseData.success === true && responseData.message && responseData.message.includes('installed')){
      isInstalled = true;
      console.log('DNS Configuration: success and message indicate DNS is installed');
    } else if (typeof responseData === 'string' && responseData.toLowerCase().includes('installed')) {
      isInstalled = true;
      console.log('DNS Configuration: string response contains "installed"');
    }

    console.log('DNS Configuration: DNS installed status:', isInstalled);
    
    if (typeof responseData === 'string') {
      const lowerResponse = responseData.toLowerCase();
      isInstalled = lowerResponse.includes('true') || 
                   lowerResponse.includes('installed') ||
                   lowerResponse.includes('dns installed') ||
                   lowerResponse.includes('dns role installation done');
    } else if (typeof responseData === 'object') {
      isInstalled = responseData.installed === true || 
                   responseData.installed === "true" ||
                   responseData.installed === "installed" ||
                   responseData.success === true;
    }
    
    const primaryMachine = getMachineByType('primary');
    if (primaryMachine) {
      newDnsRoleInstalled.primary = isInstalled;
    }
    
    const secondaryMachine = getMachineByType('secondary');
    if (secondaryMachine && responseData.secondary_installed !== undefined) {
      newDnsRoleInstalled.secondary = responseData.secondary_installed === true || 
                                      responseData.secondary_installed === "true";
    }
    
    console.log('DNS Configuration: Updated DNS role installed status:', newDnsRoleInstalled);
    
    setDnsRoleInstalled(newDnsRoleInstalled);
    setLoading(false);
    setCheckingStatus(false);
    
    const requiresInstallation = responseData.requires_installation === true || 
                                 responseData.requires_installation === "true";
    
    console.log('DNS Configuration: Requires installation:', requiresInstallation);
    
    const hasInstalledPrimary = newDnsRoleInstalled.primary === true;
    const hasInstalledSecondary = newDnsRoleInstalled.secondary === true;
    const hasInstalledAny = hasInstalledPrimary || hasInstalledSecondary;
    
    console.log('DNS Configuration: Has installed any:', hasInstalledAny);
    
    if (requiresInstallation && !hasInstalledAny) {
      console.log('DNS Configuration: Showing install modal (requires installation and no DNS installed)');
      setShowInstallModal(true);
    } else if (hasInstalledAny) {
      console.log('DNS Configuration: DNS is installed, updating status and fetching details');
      updateInstallationStatus('dns', INSTALLATION_STATUS.INSTALLED, 100, 'DNS server is installed');
      setShowInstallModal(false);
      
      const hasZonesPrimary = zones.primary.forward.length > 0 || zones.primary.reverse.length > 0;
      const hasZonesSecondary = zones.secondary.forward.length > 0 || zones.secondary.reverse.length > 0;
      const hasZonesAny = hasZonesPrimary || hasZonesSecondary;
      
      console.log('DNS Configuration: Has zones any:', hasZonesAny);
      console.log('DNS Configuration: Has fetched initial details:', hasFetchedInitialDetails.current);
      
      if (!hasZonesAny && !hasFetchedInitialDetails.current) {
        console.log('DNS Configuration: Fetching DNS details...');
        setTimeout(() => {
          fetchDNSDetails();
        }, 1000);
      }
    } else {
      console.log('DNS Configuration: No DNS installed and no installation required - showing DNS not installed UI');
    }
  };

  const handleDNSInstallResponse = (responseData) => {
    console.log('DNS Configuration: Processing DNS installation response:', responseData);
    
    console.log('DNS Configuration: Full installation response:', JSON.stringify(responseData));
    
    let isSuccessful = false;
    
    if (!responseData) {
      console.log('DNS Configuration: No response data');
      isSuccessful = false;
    } else if (typeof responseData === 'string') {
      const lowerResponse = responseData.toLowerCase();
      if (lowerResponse.includes('dns role installation done') ||
          lowerResponse.includes('installation completed') ||
          lowerResponse.includes('success') ||
          lowerResponse.includes('installed')) {
        console.log('DNS Configuration: String response indicates success');
        isSuccessful = true;
      }
    } else if (responseData.success === true) {
      console.log('DNS Configuration: Success flag is true');
      isSuccessful = true;
    } else if (responseData.requires_installation === false) {
      console.log('DNS Configuration: requires_installation is false (installation done)');
      isSuccessful = true;
    } else if (responseData.message && responseData.message.toLowerCase().includes('dns installation completed')) {
      console.log('DNS Configuration: Message indicates DNS installation completed');
      isSuccessful = true;
    }
    
    console.log('DNS Configuration: Installation successful?', isSuccessful);
    
    if (isSuccessful) {
      console.log('DNS Configuration: Installation SUCCESSFUL!');
      
      const primaryMachine = getMachineByType('primary');
      const secondaryMachine = getMachineByType('secondary');
      
      const newDnsRoleInstalled = { ...dnsRoleInstalled };
      
      if (primaryMachine) {
        newDnsRoleInstalled.primary = true;
        console.log('DNS Configuration: Marking primary as installed');
      }
      
      if (secondaryMachine) {
        newDnsRoleInstalled.secondary = true;
        console.log('DNS Configuration: Marking secondary as installed');
      }
      
      console.log('DNS Configuration: Updated DNS role state:', newDnsRoleInstalled);
      setDnsRoleInstalled(newDnsRoleInstalled);
      
      updateInstallationStatus('dns', INSTALLATION_STATUS.INSTALLED, 100, 'DNS server installed successfully');
      
      setInstallSuccess(true);
      setInstallProgress('Installation completed successfully!');
      setInstalling(false);
      setError(null); 
      
      setTimeout(() => {
        setShowInstallModal(false);
        setInstallSuccess(false);
        setInstallProgress('');
        
        setTimeout(() => {
          console.log('DNS Configuration: Now fetching DNS details...');
          fetchDNSDetails();
        }, 800);
      }, 1200);
      
    } else {
      console.log('DNS Configuration: Installation FAILED or response not recognized');
      
      if (responseData && (responseData.success === true || responseData.requires_installation === false)) {
        console.log('DNS Configuration: Actually, re-checking shows it IS a success!');
        
        const primaryMachine = getMachineByType('primary');
        const newDnsRoleInstalled = { ...dnsRoleInstalled };
        if (primaryMachine) newDnsRoleInstalled.primary = true;
        setDnsRoleInstalled(newDnsRoleInstalled);
        
        updateInstallationStatus('dns', INSTALLATION_STATUS.INSTALLED, 100, 'DNS server installed');
        setInstallSuccess(true);
        setInstallProgress('Installation completed!');
        setInstalling(false);
        setError(null);
        
        setTimeout(() => {
          setShowInstallModal(false);
          setInstallSuccess(false);
          setInstallProgress('');
          
          setTimeout(() => {
            fetchDNSDetails();
          }, 800);
        }, 1200);
        
      } else {
        console.log('DNS Configuration: Setting error message');
        const errorMsg = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
        setError(`Installation failed: ${errorMsg}`);
        setInstallProgress('Installation failed');
        setInstalling(false);
        updateInstallationStatus('dns', INSTALLATION_STATUS.FAILED, 0, 'Installation failed');
      }
    }
    
    actionInProgressRef.current = false;
  };

  const handleZoneCreationResponse = useCallback((responseData) => {
    setActionLoading(false);
    
    let zoneCreationSuccess = false;
    let zoneName = '';
    
    if (typeof responseData === 'string') {
      const lowerResponse = responseData.toLowerCase();
      zoneCreationSuccess = lowerResponse.includes('created') || 
                           lowerResponse.includes('success');
      const match = responseData.match(/Zone\s+['"](.+?)['"]\s+created/) || 
                   responseData.match(/zone\s+['"](.+?)['"]\s+created/i) ||
                   responseData.match(/['"](.+?)['"]\s+created/i);
      zoneName = match ? match[1] : newZoneData.zoneName;
      console.log('DNS Configuration: Extracted zone name from string:', zoneName);
    } else if (typeof responseData === 'object') {
      zoneCreationSuccess = responseData.success === true ||
                           (responseData.message && responseData.message.toLowerCase().includes('created'));
      zoneName = responseData.zone_name || responseData.zoneName || newZoneData.zoneName;
      console.log('DNS Configuration: Extracted zone name from object:', zoneName);
    }
    
    if (zoneCreationSuccess) {
      const normalizedZoneName = normalizeZoneName(zoneName);
      setSuccessMessage(`Zone "${normalizedZoneName}" created successfully!`);
      setShowCreateZoneModal(false);
      
      const newZoneEntry = {
        name: normalizedZoneName,
        machineType: newZoneData.targetMachine,
        zoneType: newZoneData.zoneType,
        timestamp: Date.now()
      };
      setNewlyCreatedZones(prev => [...prev, newZoneEntry]);
      
      setNewZoneData({ 
        zoneName: '', 
        zoneType: 'forward', 
        dynamicUpdate: 'Secure',
        targetMachine: 'primary'
      });
      
      console.log(`DNS Configuration: Zone created successfully, refreshing DNS data in 3 seconds...`);
      setTimeout(() => {
        refreshDNSData();
      }, 3000);
      
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      
    } else {
      setError(`Zone creation failed: ${JSON.stringify(responseData)}`);
      actionInProgressRef.current = false;
    }
  }, [newZoneData]);

  const handleRecordCreationResponse = useCallback((responseData) => {
    setActionLoading(false);
    
    let recordCreationSuccess = false;
    let recordName = '';
    let recordData = '';
    let recordType = '';
    
    if (typeof responseData === 'string') {
      const lowerResponse = responseData.toLowerCase();
      recordCreationSuccess = lowerResponse.includes('created') || 
                             lowerResponse.includes('success');
      const match = responseData.match(/record\s+['"](.+?)['"]\s+created/) || 
                   responseData.match(/Record\s+['"](.+?)['"]\s+created/i);
      recordName = match ? match[1] : newRecordData.recordName;
      recordData = newRecordData.recordValue || newRecordData.recordIp;
      recordType = newRecordData.recordType;
    } else if (typeof responseData === 'object') {
      recordCreationSuccess = responseData.success === true ||
                             (responseData.message && responseData.message.toLowerCase().includes('created'));
      recordName = responseData.record_name || newRecordData.recordName;
      recordData = responseData.record_value || newRecordData.recordValue || newRecordData.recordIp;
      recordType = responseData.record_type || newRecordData.recordType;
    }
    
    if (recordCreationSuccess) {
      const successMsg = `Record "${recordName}" created successfully!`;
      setSuccessMessage(successMsg);
      setShowCreateRecordModal(false);
      
      const newRecordEntry = {
        name: recordName,
        type: recordType,
        data: recordData,
        zone: selectedZone.zone,
        machine: selectedZone.machine || newRecordData.targetMachine,
        ttl: newRecordData.ttl || 3600,
        timestamp: Date.now()
      };
      
      console.log('DNS Configuration: Adding new record to pending list:', newRecordEntry);
      setNewlyCreatedRecords(prev => [...prev, newRecordEntry]);
      
      if (selectedZone.zone && (selectedZone.machine || newRecordData.targetMachine)) {
        const machineType = selectedZone.machine || newRecordData.targetMachine;
        const newRecordId = `new-${machineType}-${normalizeZoneName(selectedZone.zone)}-${recordName}-${recordType}`;
        
        recentlyCreatedRecordIds.current.add(newRecordId);
        
        setTimeout(() => {
          recentlyCreatedRecordIds.current.delete(newRecordId);
        }, 30000);
        
        const newRecord = {
          id: newRecordId,
          name: recordName,
          type: recordType,
          data: recordData,
          ttl: newRecordData.ttl || '01:00:00',
          priority: '-',
          machine: machineType,
          zone: selectedZone.zone,
          isNewlyCreated: true
        };
        
        console.log('DNS Configuration: Immediately adding record to UI:', newRecord);
        setRecords(prev => {
          const exists = prev.some(r => 
            r.name === newRecord.name && 
            r.type === newRecord.type && 
            r.data === newRecord.data &&
            r.machine === newRecord.machine
          );
          
          if (!exists) {
            return [...prev, newRecord];
          }
          return prev;
        });
      }
      
      setNewRecordData({
        recordType: 'A',
        recordName: '',
        recordValue: '',
        recordIp: '',
        ttl: 3600,
        targetMachine: selectedZone.machine || 'primary'
      });
      
      console.log(`DNS Configuration: Record created successfully, refreshing DNS data in 2 seconds...`);
      setTimeout(() => {
        refreshDNSData();
      }, 2000);
      
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      
      actionInProgressRef.current = false;
    } else {
      setError(`Record creation failed: ${JSON.stringify(responseData)}`);
      actionInProgressRef.current = false;
    }
  }, [newRecordData, selectedZone]);

  const handleZoneDeletionResponse = (responseData) => {
    let deletionSuccess = false;
    
    if (typeof responseData === 'string') {
      const lowerResponse = responseData.toLowerCase();
      deletionSuccess = lowerResponse.includes('deleted') || 
                       lowerResponse.includes('success');
    } else if (typeof responseData === 'object') {
      deletionSuccess = responseData.success === true ||
                       (responseData.message && responseData.message.toLowerCase().includes('deleted'));
    }
    
    if (deletionSuccess) {
      setSuccessMessage(`Zone deleted successfully!`);
      setSelectedZone({ machine: null, zone: null, zoneType: null });
      setRecords([]);
      
      setTimeout(() => {
        refreshDNSData();
      }, 500);
      
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } else {
      setError(`Zone deletion failed: ${JSON.stringify(responseData)}`);
    }
  };

  const fetchDNSDetails = () => {
    if (!isConnected) {
      setError('WebSocket not connected');
      return;
    }

    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
    if (!primaryMachine && !secondaryMachine) {
      setError('No DNS machines available');
      return;
    }

    setZonesLoading({ primary: !!primaryMachine, secondary: !!secondaryMachine });
    setError(null);
    
    const sendCommandForMachine = (machine, machineType) => {
      const payload = {
        server_info: getServerInfoForMachine(machine)
      };
      
      if (!payload.server_info) {
        console.error(`DNS Configuration: Failed to create payload for ${machineType}`);
        return;
      }
      
      console.log(`DNS Configuration: SENDING COMMAND: get_dns_details_server_ansible for ${machineType}`);
      sendCommandWithFlow('get_dns_details_server_ansible', payload);
    };
    
    if (primaryMachine) {
      sendCommandForMachine(primaryMachine, 'primary');
    }
    
    if (secondaryMachine) {
      setTimeout(() => {
        sendCommandForMachine(secondaryMachine, 'secondary');
      }, 1000);
    }
  };

  const installDNSRole = () => {
    if (installations.dns?.status === INSTALLATION_STATUS.INSTALLING) {
      console.log('DNS Configuration: Installation already in progress');
      return;
    }

    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
    if (!primaryMachine && !secondaryMachine) {
      setError('No DNS machines available for installation');
      return;
    }

    setInstalling(true);
    setInstallSuccess(false);
    setInstallProgress('Starting DNS role installation...');
    setError(null);
    
    updateInstallationStatus('dns', INSTALLATION_STATUS.INSTALLING, 0, 'Starting DNS installation...');
    
    const sendInstallCommandForMachine = (machine, machineType) => {
      const payload = {
        server_info: getServerInfoForMachine(machine)
      };
      
      if (!payload.server_info) {
        console.error(`DNS Configuration: Failed to create payload for ${machineType} installation`);
        return;
      }
      
      console.log(`DNS Configuration: SENDING COMMAND: install_dns_role_server_ansible for ${machineType}`);
      sendCommandWithFlow('install_dns_role_server_ansible', payload);
    };
    
    if (primaryMachine) {
      sendInstallCommandForMachine(primaryMachine, 'primary');
    }
    
    if (secondaryMachine) {
      setTimeout(() => {
        sendInstallCommandForMachine(secondaryMachine, 'secondary');
      }, 2000);
    }
  };

  const createZone = () => {
    if (!newZoneData.zoneName.trim()) {
      setError('Zone name is required');
      return;
    }

    const targetMachine = getMachineByType(newZoneData.targetMachine);
    if (!targetMachine) {
      setError(`No ${newZoneData.targetMachine} DNS machine found`);
      return;
    }

    setActionLoading(true);
    setError(null);
    actionInProgressRef.current = true;
    
    let command, additionalData;
    
    if (newZoneData.zoneType === 'forward') {
      command = 'create_zone_forward_lookup_zone_dns_server_ansible';
      additionalData = { zone_name: newZoneData.zoneName };
    } else {
      command = 'create_zone_reverse_lookup_zone_dns_server_ansible';
      const ipParts = newZoneData.zoneName.split('.').reverse();
      additionalData = { zone_name: `${ipParts.slice(0, 3).join('.')}.in-addr.arpa` };
    }
    
    console.log(`DNS Configuration: SENDING COMMAND: ${command} for ${newZoneData.targetMachine}`);
    
    const payload = createPayload(additionalData, newZoneData.targetMachine);
    if (!payload) {
      setError('Failed to create payload');
      setActionLoading(false);
      actionInProgressRef.current = false;
      return;
    }
    
    sendCommandWithFlow(command, payload);
  };

  const createRecord = () => {
    if (!selectedZone.zone) {
      setError('Zone not selected');
      return;
    }

    if ((newRecordData.recordType === 'A' || newRecordData.recordType === 'CNAME') && !newRecordData.recordName) {
      setError('Record name is required for A and CNAME records');
      return;
    }

    if ((newRecordData.recordType === 'A' || newRecordData.recordType === 'CNAME') && !newRecordData.recordValue) {
      setError('Record value is required for this record type');
      return;
    }

    if (newRecordData.recordType === 'PTR' && (!newRecordData.recordIp || !newRecordData.recordValue)) {
      setError('Both IP address and host name are required for PTR records');
      return;
    }

    if ((newRecordData.recordType === 'MX' || newRecordData.recordType === 'TXT') && !newRecordData.recordValue) {
      setError('Record value is required for this record type');
      return;
    }

    const targetMachine = getMachineByType(newRecordData.targetMachine);
    if (!targetMachine) {
      setError(`No ${newRecordData.targetMachine} DNS machine found`);
      return;
    }

    setActionLoading(true);
    setError(null);
    actionInProgressRef.current = true;
    
    let command, additionalData;
    
    if (newRecordData.recordType === 'A' || newRecordData.recordType === 'CNAME') {
      command = 'create_host_record_forward_lookup_zone_dns_server_ansible';
      additionalData = {
        zone_name: selectedZone.zone,
        record_name: newRecordData.recordName,
        record_ip: newRecordData.recordValue
      };
    } else if (newRecordData.recordType === 'PTR') {
      command = 'create_pointer_record_reverse_lookup_zone_dns_server_ansible';
      additionalData = {
        zone_name: selectedZone.zone,
        host_ip: newRecordData.recordIp,
        host_name: newRecordData.recordValue
      };
    } else if (newRecordData.recordType === 'MX' || newRecordData.recordType === 'TXT') {
      command = 'create_host_record_forward_lookup_zone_dns_server_ansible';
      additionalData = {
        zone_name: selectedZone.zone,
        record_name: newRecordData.recordName || 'default',
        record_ip: newRecordData.recordValue
      };
    } else {
      setError('Unsupported record type');
      setActionLoading(false);
      actionInProgressRef.current = false;
      return;
    }
    
    console.log(`DNS Configuration: SENDING COMMAND: ${command} for ${newRecordData.targetMachine}`);
    
    const payload = createPayload(additionalData, newRecordData.targetMachine);
    if (!payload) {
      setError('Failed to create payload');
      setActionLoading(false);
      actionInProgressRef.current = false;
      return;
    }
    
    sendCommandWithFlow(command, payload);
  };

  const deleteZone = (zoneName, zoneType, machineType) => {
    if (!window.confirm(`Are you sure you want to delete zone "${zoneName}" from ${machineType}? This action cannot be undone.`)) {
      return;
    }

    console.log(`DNS Configuration: Deleting DNS zone: ${zoneName} from ${machineType}`);
    setError(null);
    
    const command = zoneType === 'Reverse' ? 
      'delete_reverse_zone_dns_windows_ansible' : 
      'delete_forward_zone_dns_windows_ansible';
    
    const additionalData = { zone_name: zoneName };
    
    const payload = createPayload(additionalData, machineType);
    if (!payload) {
      setError('Failed to create payload');
      return;
    }
    
    console.log(`DNS Configuration: SENDING COMMAND: ${command}`);
    sendCommandWithFlow(command, payload);
  };

  const checkDNSOnMachines = (machinesList = dnsMachinesRef.current) => {
    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
    if (!primaryMachine && !secondaryMachine) {
      setError('No DNS machines found');
      setLoading(false);
      setCheckingStatus(false);
      return;
    }
    
    const sendCheckCommandForMachine = (machine, machineType) => {
      const payload = {
        server_info: getServerInfoForMachine(machine)
      };
      
      if (!payload.server_info) {
        console.error(`DNS Configuration: Failed to create payload for ${machineType} check`);
        return;
      }
      
      console.log(`DNS Configuration: SENDING COMMAND: check_dns_role_installed_server_ansible for ${machineType}`);
      sendCommandWithFlow('check_dns_role_installed_server_ansible', payload);
    };
    
    if (primaryMachine) {
      sendCheckCommandForMachine(primaryMachine, 'primary');
    }
    
    if (secondaryMachine) {
      setTimeout(() => {
        sendCheckCommandForMachine(secondaryMachine, 'secondary');
      }, 1000);
    }
  };

  const getAllZones = useCallback(() => {
    const allZones = [];
    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
    const currentZones = zonesDataRef.current;
    
    if (primaryMachine) {
      allZones.push(...currentZones.primary.forward.map(z => ({ ...z, machineType: 'primary', machineName: primaryMachine.name })));
      allZones.push(...currentZones.primary.reverse.map(z => ({ ...z, machineType: 'primary', machineName: primaryMachine.name })));
    }
    
    if (secondaryMachine) {
      allZones.push(...currentZones.secondary.forward.map(z => ({ ...z, machineType: 'secondary', machineName: secondaryMachine.name })));
      allZones.push(...currentZones.secondary.reverse.map(z => ({ ...z, machineType: 'secondary', machineName: secondaryMachine.name })));
    }
    
    newlyCreatedZones.forEach(newZone => {
      const normalizedNewZoneName = normalizeZoneName(newZone.name);
      const alreadyExists = allZones.some(z => normalizeZoneName(z.name) === normalizedNewZoneName && z.machineType === newZone.machineType);
      
      if (!alreadyExists) {
        allZones.push({
          id: `new-${newZone.timestamp}`,
          name: newZone.name,
          type: newZone.zoneType === 'forward' ? 'Primary' : 'Reverse',
          dynamicUpdate: 'Secure',
          recordCount: 0,
          machine: newZone.machineType,
          machineType: newZone.machineType,
          machineName: getMachineByType(newZone.machineType)?.name || 'Unknown'
        });
      }
    });
    
    return allZones;
  }, [newlyCreatedZones]);

  const renderZoneList = useCallback((zonesList, zoneType) => {
    const allZones = getAllZones();
    const filteredZones = allZones.filter(zone => 
      (zoneType === 'forward' && !zone.name.includes('in-addr.arpa')) ||
      (zoneType === 'reverse' && zone.name.includes('in-addr.arpa'))
    );
    
    const sortedZones = [...filteredZones].sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`DNS Configuration: RENDERING ${zoneType} zones:`, sortedZones.length, 'zones');
    
    return (
      <div className="zone-list-container">
        <div className="zone-list-header">
          <h3>{zoneType === 'forward' ? 'Forward Lookup Zones' : 'Reverse Lookup Zones'}</h3>
          <div className="zone-stats">
            <span className="zone-count">Total: {sortedZones.length} zones</span>
            <span className="record-count">
              Total Records: {sortedZones.reduce((sum, zone) => sum + (zone.recordCount || 0), 0)}
            </span>
          </div>
          <div className="zone-actions">
            <button 
              className="btn-create-zone"
              onClick={() => {
                setNewZoneData({ 
                  zoneName: '', 
                  zoneType: zoneType === 'forward' ? 'forward' : 'reverse', 
                  dynamicUpdate: 'Secure',
                  targetMachine: 'primary'
                });
                setShowCreateZoneModal(true);
              }}
              disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
            >
              Create New Zone
            </button>
            <button 
              className="btn-refresh-zones"
              onClick={() => {
                console.log('DNS Configuration: Manual refresh triggered');
                refreshDNSData();
              }}
              disabled={zonesLoading.primary || zonesLoading.secondary || actionLoading || refreshing || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
            >
              {refreshing ? (
                <>
                  <span className="refresh-spinner"></span>
                  Refreshing...
                </>
              ) : 'Refresh Zones'}
            </button>
            <button 
              className="btn-refresh-machines"
              onClick={fetchMachineInfo}
              disabled={machinesLoading || actionLoading || actionInProgressRef.current || commandInProgressRef.current}
            >
              {machinesLoading ? 'Loading Machines...' : 'Refresh Machines'}
            </button>
          </div>
        </div>
        
        {machinesLoading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading machine information...</p>
          </div>
        ) : (zonesLoading.primary || zonesLoading.secondary) ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading zones...</p>
          </div>
        ) : sortedZones.length === 0 ? (
          <div className="no-zones-message">
            <p>No {zoneType} lookup zones found. Create a new zone to get started.</p>
            {refreshing && <p className="small-text">Refreshing data...</p>}
            {actionInProgressRef.current && <p className="small-text">Action in progress...</p>}
            {commandInProgressRef.current && <p className="small-text">Command in progress...</p>}
          </div>
        ) : (
          <div className="zone-table-container">
            <div className="zone-table-info">
              Showing {sortedZones.length} zone{sortedZones.length !== 1 ? 's' : ''}
              {lastCommandTimeRef.current && (
                <span className="last-updated">
                  Last updated: {formatLastRefreshTime()}
                </span>
              )}
              {actionInProgressRef.current && (
                <span className="action-in-progress">Action in progress...</span>
              )}
              {commandInProgressRef.current && (
                <span className="command-in-progress">Command in progress...</span>
              )}
              {newlyCreatedZones.length > 0 && (
                <span className="new-zones-pending">
                  {newlyCreatedZones.length} new zone(s) pending confirmation
                </span>
              )}
            </div>
            <table className="zone-table">
              <thead>
                <tr>
                  <th>Zone Name</th>
                  <th>Type</th>
                  <th>Machine</th>
                  <th>Records</th>
                  <th>Dynamic Updates</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedZones.map((zone) => (
                  <tr key={zone.id}>
                    <td>
                      <span 
                        className="zone-name-link"
                        onClick={() => {
                          const zoneType = zone.name.includes('in-addr.arpa') ? 'reverse' : 'forward';
                          fetchZoneRecords(zone.name, zone.machineType, zoneType);
                        }}
                        title="Click to view records"
                        style={{ 
                          cursor: 'pointer', 
                          color: '#007bff', 
                          textDecoration: 'underline'
                        }}
                      >
                        {zone.name}
                      </span>
                    </td>
                    <td>{zone.type}</td>
                    <td>
                      <span className="machine-badge">
                        {zone.machineType} - {zone.machineName}
                      </span>
                    </td>
                    <td>{zone.recordCount || 0}</td>
                    <td>{zone.dynamicUpdate}</td>
                    <td>
                      <div className="zone-actions-cell">
                        <button 
                          className="btn-view-records"
                          onClick={() => {
                            const zoneType = zone.name.includes('in-addr.arpa') ? 'reverse' : 'forward';
                            fetchZoneRecords(zone.name, zone.machineType, zoneType);
                            setActiveTab('records');
                          }}
                          disabled={actionLoading || actionInProgressRef.current || commandInProgressRef.current}
                        >
                          View Records
                        </button>
                        <button 
                          className="btn-delete-zone"
                          onClick={() => deleteZone(zone.name, zone.type, zone.machineType)}
                          disabled={actionLoading || actionInProgressRef.current || commandInProgressRef.current}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }, [getAllZones, zonesLoading, actionLoading, refreshing, fetchZoneRecords, newlyCreatedZones, machinesLoading, fetchMachineInfo, commandInProgressRef.current]);

  const renderDNSRecords = useCallback(() => {
    if (!selectedZone.zone) {
      return (
        <div className="no-zone-selected">
          <p>Select a zone to view its DNS records.</p>
          <p>Click on any zone name in the Forward or Reverse Lookup Zones tabs.</p>
        </div>
      );
    }
    
    return (
      <div className="records-container">
        <div className="records-header">
          <h3>DNS Records for: {selectedZone.zone}</h3>
          <div className="records-subheader">
            <span className="machine-badge">
              Machine: {selectedZone.machine} ({getMachineByType(selectedZone.machine)?.name || 'Unknown'})
            </span>
            <span className="zone-type-badge">
              Type: {selectedZone.zoneType || (selectedZone.zone.includes('in-addr.arpa') ? 'reverse' : 'forward')}
            </span>
            <span className="records-count">
              {records.length} record{records.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="records-actions">
            <button 
              className="btn-create-record"
              onClick={() => {
                setNewRecordData({
                  recordType: 'A',
                  recordName: '',
                  recordValue: '',
                  recordIp: '',
                  ttl: 3600,
                  targetMachine: selectedZone.machine || 'primary'
                });
                setShowCreateRecordModal(true);
              }}
              disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
            >
              Create New Record
            </button>
            <button 
              className="btn-refresh-records"
              onClick={() => fetchZoneRecords(selectedZone.zone, selectedZone.machine, selectedZone.zoneType, true, true)}
              disabled={recordsLoading || actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
            >
              {recordsLoading ? (
                <>
                  <span className="refresh-spinner"></span>
                  Loading...
                </>
              ) : 'Refresh Records'}
            </button>
            <button 
              className="btn-back-to-zones"
              onClick={() => setActiveTab('forward-zones')}
            >
              Back to Zones
            </button>
          </div>
        </div>
        
        {recordsLoading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading records...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="no-records-message">
            <p>No records found in this zone. Create a new record to get started.</p>
            <p className="small-text">If you just created a record, it should appear automatically within a few seconds.</p>
            {actionInProgressRef.current && <p className="small-text">Action in progress...</p>}
            {commandInProgressRef.current && <p className="small-text">Command in progress...</p>}
            {newlyCreatedRecords.length > 0 && (
              <p className="small-text">
                {newlyCreatedRecords.length} new record(s) pending confirmation
              </p>
            )}
          </div>
        ) : (
          <div className="records-table-container">
            <div className="records-table-info">
              Showing {records.length} record{records.length !== 1 ? 's' : ''}
              {lastCommandTimeRef.current && (
                <span className="last-updated">
                  Last updated: {formatLastRefreshTime()}
                </span>
              )}
              {newlyCreatedRecords.length > 0 && (
                <span className="new-records-pending">
                  {newlyCreatedRecords.length} new record(s) pending confirmation
                </span>
              )}
            </div>
            <table className="records-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Data</th>
                  <th>TTL</th>
                  <th>Priority</th>
                  <th>Machine</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.name}</td>
                    <td>
                      <span className={`record-type-badge ${record.type}`}>
                        {record.type}
                      </span>
                    </td>
                    <td>{record.data}</td>
                    <td>{record.ttl}</td>
                    <td>{record.priority}</td>
                    <td>
                      <span className="machine-badge">
                        {record.machine}
                      </span>
                    </td>
                    <td>
                      {record.isNewlyCreated ? (
                        <span className="new-record-badge">New</span>
                      ) : (
                        <span className="confirmed-record-badge">Confirmed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }, [selectedZone, records, recordsLoading, actionLoading, fetchZoneRecords, newlyCreatedRecords, machinesLoading, commandInProgressRef.current]);

  const renderDNSRoleStatus = () => {
    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
    if (machinesLoading) {
      return (
        <div className="status-checking">
          <div className="spinner"></div>
          <span>Loading machine information...</span>
          <div className="connection-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
            WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      );
    }

    if (loading && (primaryMachine || secondaryMachine)) {
      return (
        <div className="status-checking">
          <div className="spinner"></div>
          <span>Checking DNS role status... (Please wait)</span>
          <div className="connection-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
            WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      );
    }

    const hasInstalledPrimary = dnsRoleInstalled.primary === true;
    const hasInstalledSecondary = dnsRoleInstalled.secondary === true;
    const hasInstalledAny = hasInstalledPrimary || hasInstalledSecondary;
    
    const hasZonesPrimary = zones.primary.forward.length > 0 || zones.primary.reverse.length > 0;
    const hasZonesSecondary = zones.secondary.forward.length > 0 || zones.secondary.reverse.length > 0;
    const hasZonesAny = hasZonesPrimary || hasZonesSecondary;
    
    console.log('DNS Configuration: Render DNS role status check:');
    console.log('  - hasInstalledPrimary:', hasInstalledPrimary);
    console.log('  - hasInstalledSecondary:', hasInstalledSecondary);
    console.log('  - hasInstalledAny:', hasInstalledAny);
    console.log('  - hasZonesAny:', hasZonesAny);
    console.log('  - hasFetchedInitialDetails:', hasFetchedInitialDetails.current);
    
    if (!hasInstalledAny && (primaryMachine || secondaryMachine)) {
      return (
        <div className="dns-not-installed">
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <h3>DNS Server Role Not Installed</h3>
            <p>DNS server role is not installed on configured machines.</p>
            <div className="windows-info-details">
              {primaryMachine && (
                <p><strong>Primary:</strong> {primaryMachine.name || 'Unknown'} ({primaryMachine.ip}) - Status: {dnsRoleInstalled.primary === null ? 'Checking...' : dnsRoleInstalled.primary === true ? 'Installed' : 'Not installed'}</p>
              )}
              {secondaryMachine && (
                <p><strong>Secondary:</strong> {secondaryMachine.name || 'Unknown'} ({secondaryMachine.ip}) - Status: {dnsRoleInstalled.secondary === null ? 'Checking...' : dnsRoleInstalled.secondary === true ? 'Installed' : 'Not installed'}</p>
              )}
            </div>
            <button 
              className="btn-install-dns"
              onClick={() => setShowInstallModal(true)}
              disabled={installing || machinesLoading || commandInProgressRef.current}
            >
              Install DNS Server Role
            </button>
            <button 
              className="btn-refresh-machines-small"
              onClick={fetchMachineInfo}
              disabled={machinesLoading || commandInProgressRef.current}
            >
              {machinesLoading ? 'Loading...' : 'Refresh Machines'}
            </button>
          </div>
        </div>
      );
    }

    if (hasInstalledAny && !hasZonesAny && !hasFetchedInitialDetails.current) {
      return (
        <div className="dns-installed-no-zones">
          <div className="success-icon">✓</div>
          <div className="success-content">
            <h3>DNS Server Role Installed</h3>
            <p>DNS server is ready. Load zones to start managing.</p>
            <div className="windows-info-details">
              {primaryMachine && hasInstalledPrimary && (
                <p><strong>Primary:</strong> {primaryMachine.name || 'Unknown'} ({primaryMachine.ip}) - Status: Installed</p>
              )}
              {secondaryMachine && hasInstalledSecondary && (
                <p><strong>Secondary:</strong> {secondaryMachine.name || 'Unknown'} ({secondaryMachine.ip}) - Status: Installed</p>
              )}
            </div>
            <button 
              className="btn-fetch-details"
              onClick={fetchDNSDetails}
              disabled={zonesLoading.primary || zonesLoading.secondary || machinesLoading || commandInProgressRef.current}
            >
              {(zonesLoading.primary || zonesLoading.secondary) ? 'Loading Zones...' : 'Load DNS Zones'}
            </button>
            <button 
              className="btn-refresh-machines-small"
              onClick={fetchMachineInfo}
              disabled={machinesLoading || commandInProgressRef.current}
            >
              {machinesLoading ? 'Loading...' : 'Refresh Machines'}
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderMachineInfo = () => {
    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
    if (!primaryMachine && !secondaryMachine) {
      return null;
    }
    
    return (
      <div className="machine-info-panel">
        <h4>Configured DNS Machines</h4>
        {primaryMachine && (
          <div className="machine-info-item">
            <div className="machine-status">
              <span className={`status-dot ${dnsRoleInstalled.primary === true ? 'installed' : 'not-installed'}`}></span>
              <span className="machine-name">Primary: {primaryMachine.name || 'Unknown'}</span>
            </div>
            <div className="machine-details">
              <span className="machine-ip">IP: {primaryMachine.ip}</span>
              <span className="machine-status-text">
                Status: {dnsRoleInstalled.primary === null ? 'Checking...' : dnsRoleInstalled.primary === true ? 'Installed' : 'Not installed'}
              </span>
            </div>
          </div>
        )}
        {secondaryMachine && (
          <div className="machine-info-item">
            <div className="machine-status">
              <span className={`status-dot ${dnsRoleInstalled.secondary === true ? 'installed' : 'not-installed'}`}></span>
              <span className="machine-name">Secondary: {secondaryMachine.name || 'Unknown'}</span>
            </div>
            <div className="machine-details">
              <span className="machine-ip">IP: {secondaryMachine.ip}</span>
              <span className="machine-status-text">
                Status: {dnsRoleInstalled.secondary === null ? 'Checking...' : dnsRoleInstalled.secondary === true ? 'Installed' : 'Not installed'}
              </span>
            </div>
          </div>
        )}
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

  const NoDnsModal = () => {
    if (!showNoDnsModal) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">No DNS Machines Configured</h3>
            </div>
            <div className="modal-body">
              <div className="modal-message">
                <p>No machines are currently marked as DNS primary or secondary roles.</p>
                <p>To manage DNS configuration, you need to mark at least one machine as DNS in Machine Management.</p>
              </div>
              
              <div className="modal-stats-grid">
                <div className="modal-stat-item">
                  <div className="modal-stat-label">TOTAL ZONES</div>
                  <div className="modal-stat-value">{getTotalZonesCount()}</div>
                </div>
                <div className="modal-stat-item">
                  <div className="modal-stat-label">TOTAL RECORDS</div>
                  <div className="modal-stat-value">{getTotalRecordsCount()}</div>
                </div>
                <div className="modal-stat-item">
                  <div className="modal-stat-label">LAST REFRESH</div>
                  <div className="modal-stat-value">{formatLastRefreshTime()}</div>
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
                    setShowNoDnsModal(false);
                    window.location.href = '/machine-management';
                  }}
                >
                  Go to Machine Management
                </button>
                <button 
                  className="modal-btn-secondary"
                  onClick={() => {
                    setShowNoDnsModal(false);
                    fetchMachineInfo();
                  }}
                  disabled={machinesLoading || commandInProgressRef.current}
                >
                  {machinesLoading ? 'Loading...' : 'Refresh Machine List'}
                </button>
                <button 
                  className="modal-btn-tertiary"
                  onClick={() => setShowNoDnsModal(false)}
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

  useEffect(() => {
    console.log('DNS Configuration Component Mounted');
    mountedRef.current = true;
    
    fetchMachineInfo();
    
    return () => {
      console.log('DNS Configuration Component Unmounting');
      mountedRef.current = false;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current);
        autoRefreshTimeoutRef.current = null;
      }
      isFetchingRef.current = false;
      fetchInProgressRef.current = false;
      commandInProgressRef.current = false;
      pendingCommandsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!machineInfoListenerRef.current && mountedRef.current) {
      console.log('DNS Configuration: Setting up WebSocket listener');
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
    if (dnsMachines.length > 0 && !machinesLoading) {
      console.log('DNS Configuration: DNS machines loaded, checking DNS status...');
      checkDNSOnMachines();
    }
  }, [dnsMachines, machinesLoading]);

  return (
    <div className="dns-configuration">
      <div className="event-viewer-header">
        <h1 className="event-viewer-title">Automation</h1>
        <div className="nav-buttons">
          {navItems.map((item) => (
            <button
              key={item}
              className={`nav-button ${item === 'DNS Configuration' ? 'nav-button-active' : 'nav-button-inactive'}`}
              disabled={actionLoading || installing || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="main-container">
        <div className="page-header">
          <div className="header-top-row">
            <div className="header-title-section">
              <h1>DNS Configuration</h1>
              <p>Manage DNS server roles, zones, and records</p>
            </div>
            <div className="header-actions-section">
              {renderMachineInfo()}
              <button 
                className="btn-refresh-main"
                onClick={refreshDNSData}
                disabled={zonesLoading.primary || zonesLoading.secondary || refreshing || !isConnected || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
              >
                {refreshing ? (
                  <>
                    <span className="refresh-spinner"></span>
                    Refreshing...
                  </>
                ) : 'Refresh DNS Data'}
              </button>
              <button 
                className="btn-refresh-machines-main"
                onClick={fetchMachineInfo}
                disabled={machinesLoading || actionInProgressRef.current || commandInProgressRef.current}
              >
                {machinesLoading ? 'Loading Machines...' : 'Refresh Machines'}
              </button>
              {lastCommandTimeRef.current && (
                <div className="last-refresh-time">
                  Last refreshed: {formatLastRefreshTime()}
                </div>
              )}
              {commandInProgressRef.current && (
                <div className="command-progress-indicator">
                  <span className="command-spinner"></span>
                  Command in progress...
                </div>
              )}
            </div>
          </div>
          <div className="connection-status-small">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
            WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
            {machinesLoading && <span className="machines-loading"> | Loading machines...</span>}
            {commandInProgressRef.current && <span className="command-loading"> | Command in progress...</span>}
          </div>
        </div>

        {renderDNSRoleStatus()}

        {((dnsRoleInstalled.primary === true && (zones.primary.forward.length + zones.primary.reverse.length > 0)) ||
          (dnsRoleInstalled.secondary === true && (zones.secondary.forward.length + zones.secondary.reverse.length > 0))) && (
          <div className="dns-content">
            <div className="tabs-navigation">
              <button
                className={`tab-btn ${activeTab === 'forward-zones' ? 'active' : ''}`}
                onClick={() => setActiveTab('forward-zones')}
                disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
              >
                Forward Lookup Zones
              </button>
              <button
                className={`tab-btn ${activeTab === 'reverse-zones' ? 'active' : ''}`}
                onClick={() => setActiveTab('reverse-zones')}
                disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
              >
                Reverse Lookup Zones
              </button>
              <button
                className={`tab-btn ${activeTab === 'records' ? 'active' : ''}`}
                onClick={() => setActiveTab('records')}
                disabled={!selectedZone.zone || actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
              >
                DNS Records
              </button>
              <button
                className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
                disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
              >
                DNS Settings
              </button>
            </div>

            <div className="tab-content">
              {activeTab === 'forward-zones' && renderZoneList(zones.primary.forward, 'forward')}
              {activeTab === 'reverse-zones' && renderZoneList(zones.primary.reverse, 'reverse')}
              {activeTab === 'records' && renderDNSRecords()}
              {activeTab === 'settings' && (
                <div className="settings-container">
                  <h3>DNS Server Settings</h3>
                  {renderMachineInfo()}
                  {((dnsDetails.primary && (zones.primary.forward.length > 0 || zones.primary.reverse.length > 0)) ||
                    (dnsDetails.secondary && (zones.secondary.forward.length > 0 || zones.secondary.reverse.length > 0))) && (
                    <div className="dns-details">
                      <div className="detail-row">
                        <span className="detail-label">Total Forward Zones:</span>
                        <span className="detail-value">{zones.primary.forward.length + zones.secondary.forward.length}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Total Reverse Zones:</span>
                        <span className="detail-value">{zones.primary.reverse.length + zones.secondary.reverse.length}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Total Records:</span>
                        <span className="detail-value">
                          {zones.primary.forward.reduce((sum, zone) => sum + (zone.recordCount || 0), 0) +
                           zones.primary.reverse.reduce((sum, zone) => sum + (zone.recordCount || 0), 0) +
                           zones.secondary.forward.reduce((sum, zone) => sum + (zone.recordCount || 0), 0) +
                           zones.secondary.reverse.reduce((sum, zone) => sum + (zone.recordCount || 0), 0)}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Last Updated:</span>
                        <span className="detail-value">{formatLastRefreshTime()}</span>
                      </div>
                    </div>
                  )}
                  <div className="settings-actions">
                    <button 
                      className="btn-refresh"
                      onClick={refreshDNSData}
                      disabled={zonesLoading.primary || zonesLoading.secondary || actionLoading || refreshing || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                    >
                      {refreshing ? 'Refreshing...' : 'Refresh DNS Data'}
                    </button>
                    <button 
                      className="btn-refresh-machines"
                      onClick={fetchMachineInfo}
                      disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                    >
                      {machinesLoading ? 'Loading...' : 'Refresh Machine List'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            <div className="error-icon">⚠️</div>
            <div className="error-text">{error}</div>
            <button className="btn-close-error" onClick={() => setError(null)} disabled={actionLoading || actionInProgressRef.current}>
              ×
            </button>
          </div>
        )}

        {successMessage && (
          <div className="success-message">
            <div className="success-icon">✓</div>
            <div className="success-text">{successMessage}</div>
            <button className="btn-close-success" onClick={() => setSuccessMessage(null)} disabled={actionLoading || actionInProgressRef.current}>
              ×
            </button>
          </div>
        )}
      </div>

      <NoDnsModal />

      {showInstallModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Install DNS Server Role</h2>
              <button 
                className="btn-close-modal"
                onClick={() => {
                  if (!installing || installSuccess) {
                    setShowInstallModal(false);
                    setInstallSuccess(false);
                    setInstallProgress('');
                  }
                }}
                disabled={installing && !installSuccess}
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              {installing && !installSuccess ? (
                <div className="installation-progress">
                  <div className="spinner large"></div>
                  <h3>Installing DNS Server Role</h3>
                  <p className="progress-text">{installProgress}</p>
                  <p className="progress-note">Installation in progress...</p>
                  <div className="windows-info-install">
                    <p>Installing on all configured DNS machines...</p>
                  </div>
                </div>
              ) : installSuccess ? (
                <div className="installation-success">
                  <div className="success-icon">✓</div>
                  <h3>Installation Complete!</h3>
                  <p>DNS server role has been successfully installed.</p>
                  <p className="small-text">Loading DNS details automatically...</p>
                  <div className="success-actions">
                    <button 
                      className="btn-ok"
                      onClick={() => {
                        setShowInstallModal(false);
                        setInstallSuccess(false);
                        setInstallProgress('');
                      }}
                    >
                      OK
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="warning-box">
                    <h4>⚠️ Important Information</h4>
                    <ul>
                      <li>This will install DNS Server role via Ansible on all configured DNS machines</li>
                      <li>System restart may be required</li>
                      <li>Ensure you have administrator privileges</li>
                      <li>Installation may take several minutes (NO TIMEOUT)</li>
                      <li>The role will be permanently installed</li>
                      <li>DNS details will be loaded automatically after installation</li>
                      <li>Using credentials from database for all machines</li>
                    </ul>
                  </div>
                  
                  {renderMachineInfo()}
                  
                  <div className="modal-actions">
                    <button 
                      className="btn-cancel"
                      onClick={() => setShowInstallModal(false)}
                      disabled={installing || commandInProgressRef.current}
                    >
                      Cancel
                    </button>
                    <button 
                      className="btn-install"
                      onClick={installDNSRole}
                      disabled={installing || installations.dns?.status === INSTALLATION_STATUS.INSTALLING || machinesLoading || commandInProgressRef.current}
                    >
                      {installations.dns?.status === INSTALLATION_STATUS.INSTALLING ? 'Installing...' : 'Begin Installation on All Machines'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreateZoneModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Create {newZoneData.zoneType === 'forward' ? 'Forward' : 'Reverse'} Lookup Zone</h2>
              <button 
                className="btn-close-modal"
                onClick={() => setShowCreateZoneModal(false)}
                disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="form-group">
                <label>Target Machine</label>
                <select 
                  className="form-control"
                  value={newZoneData.targetMachine}
                  onChange={(e) => setNewZoneData({...newZoneData, targetMachine: e.target.value})}
                  disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                >
                  {getMachineByType('primary') && <option value="primary">Primary DNS Server</option>}
                  {getMachineByType('secondary') && <option value="secondary">Secondary DNS Server</option>}
                </select>
              </div>
              
              <div className="form-group">
                <label>Zone Type</label>
                <div className="zone-type-selector">
                  <button
                    className={`zone-type-btn ${newZoneData.zoneType === 'forward' ? 'active' : ''}`}
                    onClick={() => setNewZoneData({...newZoneData, zoneType: 'forward'})}
                    disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                  >
                    Forward Lookup Zone
                  </button>
                  <button
                    className={`zone-type-btn ${newZoneData.zoneType === 'reverse' ? 'active' : ''}`}
                    onClick={() => setNewZoneData({...newZoneData, zoneType: 'reverse'})}
                    disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                  >
                    Reverse Lookup Zone
                  </button>
                </div>
              </div>
              
              <div className="form-group">
                <label>
                  {newZoneData.zoneType === 'forward' ? 'Zone Name *' : 'Network Address *'}
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={newZoneData.zoneType === 'forward' ? 'example.com' : '192.168.1.0'}
                  value={newZoneData.zoneName}
                  onChange={(e) => setNewZoneData({...newZoneData, zoneName: e.target.value})}
                  disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                />
                {newZoneData.zoneType === 'reverse' && (
                  <p className="help-text">
                    Will be converted to reverse zone format (e.g., 192.168.1.0 → 1.168.192.in-addr.arpa)
                  </p>
                )}
              </div>
              
              <div className="form-group">
                <label>Dynamic Updates</label>
                <select 
                  className="form-control"
                  value={newZoneData.dynamicUpdate}
                  onChange={(e) => setNewZoneData({...newZoneData, dynamicUpdate: e.target.value})}
                  disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                >
                  <option value="Secure">Secure only</option>
                  <option value="NonSecure">Nonsecure and secure</option>
                  <option value="None">None</option>
                </select>
              </div>
              
              <div className="zone-preview">
                <h4>Zone Preview</h4>
                <div className="preview-content">
                  <p><strong>Target Machine:</strong> {newZoneData.targetMachine === 'primary' ? 'Primary DNS Server' : 'Secondary DNS Server'}</p>
                  <p><strong>Type:</strong> {newZoneData.zoneType === 'forward' ? 'Forward Lookup' : 'Reverse Lookup'}</p>
                  <p><strong>Name:</strong> {newZoneData.zoneName || 'Not specified'}</p>
                  {newZoneData.zoneType === 'reverse' && newZoneData.zoneName && (
                    <p><strong>Reverse Format:</strong> {newZoneData.zoneName.split('.').reverse().slice(0, 3).join('.')}.in-addr.arpa</p>
                  )}
                  <p><strong>Dynamic Updates:</strong> {newZoneData.dynamicUpdate}</p>
                </div>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="btn-cancel"
                  onClick={() => setShowCreateZoneModal(false)}
                  disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                >
                  Cancel
                </button>
                <button 
                  className="btn-create"
                  onClick={createZone}
                  disabled={actionLoading || !newZoneData.zoneName || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                >
                  {actionLoading ? 'Creating Zone...' : 'Create Zone'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateRecordModal && selectedZone.machine && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Create DNS Record in {selectedZone.zone}</h2>
              <button 
                className="btn-close-modal"
                onClick={() => setShowCreateRecordModal(false)}
                disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="form-group">
                <label>Target Machine</label>
                <select 
                  className="form-control"
                  value={newRecordData.targetMachine}
                  onChange={(e) => setNewRecordData({...newRecordData, targetMachine: e.target.value})}
                  disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                >
                  {getMachineByType('primary') && <option value="primary">Primary DNS Server</option>}
                  {getMachineByType('secondary') && <option value="secondary">Secondary DNS Server</option>}
                </select>
              </div>
              
              <div className="form-group">
                <label>Record Type</label>
                <select 
                  className="form-control"
                  value={newRecordData.recordType}
                  onChange={(e) => setNewRecordData({...newRecordData, recordType: e.target.value})}
                  disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                >
                  <option value="A">A (Host) Record</option>
                  <option value="CNAME">CNAME (Alias) Record</option>
                  <option value="PTR">PTR (Pointer) Record</option>
                  <option value="MX">MX (Mail Exchange) Record</option>
                  <option value="TXT">TXT (Text) Record</option>
                </select>
              </div>
              
              {(newRecordData.recordType === 'A' || newRecordData.recordType === 'CNAME' || newRecordData.recordType === 'MX' || newRecordData.recordType === 'TXT') && (
                <div className="form-group">
                  <label>Record Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={newRecordData.recordType === 'A' ? 'server1' : 'mail'}
                    value={newRecordData.recordName}
                    onChange={(e) => setNewRecordData({...newRecordData, recordName: e.target.value})}
                    disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                  />
                </div>
              )}
              
              {(newRecordData.recordType === 'A' || newRecordData.recordType === 'CNAME') && (
                <div className="form-group">
                  <label>Record Value *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={newRecordData.recordType === 'A' ? '192.168.1.10' : 'server1.example.com'}
                    value={newRecordData.recordValue}
                    onChange={(e) => setNewRecordData({...newRecordData, recordValue: e.target.value})}
                    disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                  />
                </div>
              )}
              
              {newRecordData.recordType === 'PTR' && (
                <>
                  <div className="form-group">
                    <label>IP Address *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="192.168.1.10"
                      value={newRecordData.recordIp}
                      onChange={(e) => setNewRecordData({...newRecordData, recordIp: e.target.value})}
                      disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                    />
                  </div>
                  <div className="form-group">
                    <label>Host Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="server1.example.com"
                      value={newRecordData.recordValue}
                      onChange={(e) => setNewRecordData({...newRecordData, recordValue: e.target.value})}
                      disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                    />
                  </div>
                </>
              )}
              
              {(newRecordData.recordType === 'MX' || newRecordData.recordType === 'TXT') && (
                <div className="form-group">
                  <label>Record Value *</label>
                  <textarea
                    className="form-control"
                    placeholder={newRecordData.recordType === 'MX' ? '10 mail.example.com' : 'v=spf1 mx ~all'}
                    value={newRecordData.recordValue}
                    onChange={(e) => setNewRecordData({...newRecordData, recordValue: e.target.value})}
                    disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                    rows={3}
                  />
                </div>
              )}
              
              <div className="form-group">
                <label>TTL (Time to Live) in seconds</label>
                <input
                  type="number"
                  className="form-control"
                  value={newRecordData.ttl}
                  onChange={(e) => setNewRecordData({...newRecordData, ttl: parseInt(e.target.value) || 3600})}
                  disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                />
              </div>
              
              <div className="server-info">
                <h4>Target Machine</h4>
                <p>This record will be created on machine: <strong>{getMachineByType(newRecordData.targetMachine)?.name || 'Unknown'}</strong> ({getMachineByType(newRecordData.targetMachine)?.ip || 'Unknown'})</p>
                <p>Zone: <strong>{selectedZone.zone}</strong></p>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="btn-cancel"
                  onClick={() => setShowCreateRecordModal(false)}
                  disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current}
                >
                  Cancel
                </button>
                <button 
                  className="btn-create"
                  onClick={createRecord}
                  disabled={actionLoading || actionInProgressRef.current || machinesLoading || commandInProgressRef.current || 
                    ((newRecordData.recordType === 'A' || newRecordData.recordType === 'CNAME') ? (!newRecordData.recordName || !newRecordData.recordValue) :
                     newRecordData.recordType === 'PTR' ? (!newRecordData.recordIp || !newRecordData.recordValue) :
                     (newRecordData.recordType === 'MX' || newRecordData.recordType === 'TXT') ? !newRecordData.recordValue : false)}
                >
                  {actionLoading ? 'Creating Record...' : 'Create Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DNSConfiguration;