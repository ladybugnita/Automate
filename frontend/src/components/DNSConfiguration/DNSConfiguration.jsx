import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  // Refs for tracking state
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

  const navItems = [
    'Dashboard', 'DNS Configuration', 'Event Viewer', 'DHCP', 'Users', 
    'Resource Monitor', 'WDS', 'Networking', 'Machine Management', 
    'Active Directory', 'Routing'
  ];

  // Update refs when state changes
  useEffect(() => {
    zonesDataRef.current = zones;
  }, [zones]);

  useEffect(() => {
    dnsDetailsRef.current = dnsDetails;
  }, [dnsDetails]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current);
      }
      pendingActionsRef.current.clear();
    };
  }, []);

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

  const getDnsMachinesFromDatabase = () => {
    console.log('📡 Fetching DNS machines from database...');
    sendCommand('get_machine_info', {});
  };

  const processDnsMachines = (machines) => {
    console.log('🖥️ Processing DNS machines:', machines);
    
    if (!machines || !Array.isArray(machines)) {
      console.error('❌ Invalid machines data received:', machines);
      setNoDnsConfigured(true);
      setShowNoDnsModal(true);
      return;
    }

    const dnsMachinesList = machines.filter(machine => {
      return machine.marked_as && Array.isArray(machine.marked_as) && 
             machine.marked_as.some(mark => mark.role === 'dns');
    });

    console.log('✅ DNS machines found:', dnsMachinesList);

    if (dnsMachinesList.length === 0) {
      setNoDnsConfigured(true);
      setShowNoDnsModal(true);
      setError('No DNS machine configured. Please mark a machine as DNS primary or secondary in Machine Management.');
      setCheckingStatus(false);
      setLoading(false);
      return;
    }

    setDnsMachines(dnsMachinesList);
    dnsMachinesRef.current = dnsMachinesList;
    setNoDnsConfigured(false);
    setShowNoDnsModal(false);

    const newDnsRoleInstalled = { primary: null, secondary: null };
    dnsMachinesList.forEach(machine => {
      const dnsRole = machine.marked_as?.find(mark => mark.role === 'dns');
      if (dnsRole?.type === 'primary') {
        newDnsRoleInstalled.primary = null;
      } else if (dnsRole?.type === 'secondary') {
        newDnsRoleInstalled.secondary = null;
      }
    });
    setDnsRoleInstalled(newDnsRoleInstalled);
  };

  const getWindowsInfoForMachine = (machine) => {
    if (!machine) {
      console.error('❌ No machine provided to getWindowsInfoForMachine');
      return null;
    }
    
    console.log(`🖥️ Getting Windows info for machine: ${machine.name} (${machine.ip})`);
    
    if (!machine.password) {
      console.error('❌ No password found for machine:', machine.name);
      return null;
    }
    
    return {
      ip: machine.ip,
      username: machine.username || 'admin',
      password: machine.password
    };
  };

  const getMachineByType = (type) => {
    return dnsMachinesRef.current.find(machine => {
      const dnsRole = machine.marked_as?.find(mark => mark.role === 'dns');
      return dnsRole?.type === type;
    });
  };

  const createPayload = (additionalData = {}, targetMachine = 'primary') => {
    const machine = getMachineByType(targetMachine);
    
    if (!machine) {
      console.error(`❌ No ${targetMachine} DNS machine found`);
      return null;
    }
    
    const windowsInfo = getWindowsInfoForMachine(machine);
    if (!windowsInfo) {
      console.error(`❌ Failed to get Windows info for ${targetMachine} machine:`, machine.name);
      return null;
    }
    
    console.log(`📦 Creating payload for ${targetMachine} machine:`, machine.name);
    
    return {
      windows_info: windowsInfo,
      ...additionalData
    };
  };

  const createDualPayload = (additionalData = {}) => {
    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
    if (!primaryMachine && !secondaryMachine) {
      console.error('❌ No DNS machines found');
      return null;
    }
    
    const payload = {
      primary_windows_info: primaryMachine ? getWindowsInfoForMachine(primaryMachine) : null,
      secondary_windows_info: secondaryMachine ? getWindowsInfoForMachine(secondaryMachine) : null,
      ...additionalData
    };
    
    console.log('📦 Creating dual payload:', {
      hasPrimary: !!primaryMachine,
      hasSecondary: !!secondaryMachine
    });
    
    return payload;
  };

  // Helper function to normalize zone names (remove trailing dots)
  const normalizeZoneName = (zoneName) => {
    if (!zoneName) return '';
    // Remove trailing dot if present
    return zoneName.endsWith('.') ? zoneName.slice(0, -1) : zoneName;
  };

  const processZonesFromDetails = useCallback((details, machineType) => {
    console.log(`🔄 Processing zones for ${machineType}:`, details);
    
    const forwardZones = [];
    const reverseZones = [];
    
    // Extract forward zones
    if (details.forward_zones) {
      console.log(`📂 Found forward zones for ${machineType}:`, Object.keys(details.forward_zones));
      
      Object.entries(details.forward_zones).forEach(([zoneKey, zoneData]) => {
        try {
          // Zone name could be in different properties
          const rawZoneName = zoneData.name || zoneData.zone_name || zoneKey;
          const zoneName = normalizeZoneName(rawZoneName);
          const zoneType = zoneData.zone_type || zoneData.type || zoneData['zone-type'] || 'Primary';
          const dynamicUpdate = zoneData.dynamic_update || zoneData.dynamic_update_type || 'None';
          
          // Calculate record count
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
          
          console.log(`➕ Added forward zone: ${zoneName} (${recordCount} records)`);
        } catch (err) {
          console.error(`❌ Error processing forward zone ${zoneKey}:`, err);
        }
      });
    }
    
    // Extract reverse zones
    if (details.reverse_zones) {
      console.log(`📂 Found reverse zones for ${machineType}:`, Object.keys(details.reverse_zones));
      
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
          
          console.log(`➕ Added reverse zone: ${zoneName} (${recordCount} records)`);
        } catch (err) {
          console.error(`❌ Error processing reverse zone ${zoneKey}:`, err);
        }
      });
    }
    
    console.log(`✅ Processed ${machineType} zones - Forward: ${forwardZones.length}, Reverse: ${reverseZones.length}`);
    
    return {
      forward: forwardZones,
      reverse: reverseZones
    };
  }, []);

  // FIX: Define forceRefreshDNSData before fetchZoneRecords to avoid circular dependency
  const forceRefreshDNSData = useCallback(() => {
    return new Promise((resolve) => {
      if (pendingRefreshRef.current) {
        console.log('⚠️ Refresh already in progress, skipping');
        resolve(false);
        return;
      }
      
      pendingRefreshRef.current = true;
      retryCountRef.current = 0;
      
      console.log('🔄 Starting forced DNS data refresh...');
      performDNSRefresh(resolve);
    });
  }, []);

  // FIX: Move fetchZoneRecords after forceRefreshDNSData definition
  const fetchZoneRecords = useCallback((zoneName, machineType, zoneType = null, forceRefresh = false, keepNewRecords = true) => {
    console.log(`🔍 Fetching records for zone: ${zoneName} (${machineType})`);
    
    if (!zoneName || !machineType) {
      console.error('❌ Missing zone name or machine type');
      return;
    }
    
    // Update selected zone with zone type
    const detectedZoneType = zoneType || (zoneName.includes('in-addr.arpa') ? 'reverse' : 'forward');
    setSelectedZone({ 
      machine: machineType, 
      zone: zoneName,
      zoneType: detectedZoneType
    });
    
    setRecordsLoading(true);
    
    // Use the current DNS details from ref
    const details = dnsDetailsRef.current[machineType];
    if (!details) {
      console.log(`⚠️ No DNS details available for ${machineType}, fetching fresh data...`);
      forceRefreshDNSData().then(() => {
        // Try again after refresh
        setTimeout(() => {
          fetchZoneRecords(zoneName, machineType, zoneType, true, keepNewRecords);
        }, 1000);
      });
      return;
    }
    
    let allRecords = [];
    let foundZone = false;
    const normalizedZoneName = normalizeZoneName(zoneName);
    
    // FIXED: Improved record extraction logic
    const searchInZones = (zonesDict) => {
      if (!zonesDict) return;
      
      Object.entries(zonesDict).forEach(([zoneKey, zoneData]) => {
        const currentZoneName = zoneData.name || zoneData.zone_name || zoneKey;
        const normalizedCurrentZoneName = normalizeZoneName(currentZoneName);
        
        if (normalizedCurrentZoneName === normalizedZoneName || zoneKey === zoneName) {
          foundZone = true;
          console.log(`✅ Found zone: ${currentZoneName}`, zoneData);
          
          if (zoneData.records) {
            Object.entries(zoneData.records).forEach(([recordType, recordTypeObj]) => {
              if (recordTypeObj && typeof recordTypeObj === 'object') {
                Object.entries(recordTypeObj).forEach(([recordKey, recordData]) => {
                  // Handle different record data structures
                  const recordValue = recordData.value || recordData.data || 
                                    recordData.host_name || recordData.host_name || 
                                    recordData.name || '';
                  
                  // Generate a stable ID for the record
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
    
    // Search in forward zones
    searchInZones(details.forward_zones);
    
    // Search in reverse zones
    searchInZones(details.reverse_zones);
    
    // FIXED: Add pending/newly created records for this zone
    if (keepNewRecords) {
      newlyCreatedRecords.forEach(newRecord => {
        const normalizedNewRecordZone = normalizeZoneName(newRecord.zone);
        if (normalizedNewRecordZone === normalizedZoneName && newRecord.machine === machineType) {
          // Check if this record is already in the list from backend
          const alreadyInBackend = allRecords.some(record => 
            normalizeZoneName(record.name) === normalizeZoneName(newRecord.name) &&
            record.machine === newRecord.machine &&
            record.type === newRecord.type &&
            record.data === newRecord.data
          );
          
          if (!alreadyInBackend) {
            const newRecordId = `new-${machineType}-${normalizedZoneName}-${newRecord.name}-${newRecord.type}-${newRecord.timestamp}`;
            
            // Check if we've recently added this record
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
              
              // Track this ID
              recentlyCreatedRecordIds.current.add(newRecordId);
              
              // Clean up after 30 seconds
              setTimeout(() => {
                recentlyCreatedRecordIds.current.delete(newRecordId);
              }, 30000);
            }
          }
        }
      });
    }
    
    if (!foundZone && allRecords.length === 0) {
      console.warn(`⚠️ Zone ${zoneName} not found in ${machineType} details.`);
      console.log('Available zones:', {
        forward: details.forward_zones ? Object.keys(details.forward_zones) : [],
        reverse: details.reverse_zones ? Object.keys(details.reverse_zones) : []
      });
    } else {
      console.log(`📊 Found ${allRecords.length} records for zone ${zoneName}`);
      
      // Remove duplicates based on name, type, data, and machine
      const uniqueRecords = [];
      const seen = new Set();
      
      allRecords.forEach(record => {
        const key = `${record.name}|${record.type}|${record.data}|${record.machine}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueRecords.push(record);
        }
      });
      
      console.log(`📊 After deduplication: ${uniqueRecords.length} unique records`);
      setRecords(uniqueRecords);
    }
    
    setRecordsLoading(false);
    
    // Reset record refresh attempts
    recordRefreshAttemptsRef.current = 0;
    
  }, [newlyCreatedRecords, forceRefreshDNSData]);

  const performDNSRefresh = useCallback((resolve) => {
    if (!isConnected) {
      console.error('❌ WebSocket not connected');
      setError('WebSocket not connected.');
      pendingRefreshRef.current = false;
      if (resolve) resolve(false);
      return;
    }

    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
    if (!primaryMachine && !secondaryMachine) {
      console.error('❌ No DNS machines available');
      setError('No DNS machines available.');
      pendingRefreshRef.current = false;
      if (resolve) resolve(false);
      return;
    }

    console.log(`🔄 Refreshing DNS data (attempt ${retryCountRef.current + 1}/${maxRetries})...`);
    
    setRefreshing(true);
    setError(null);
    setZonesLoading({ primary: !!primaryMachine, secondary: !!secondaryMachine });
    
    const payload = createDualPayload();
    if (!payload) {
      console.error('❌ Failed to create payload');
      setError('Failed to create payload');
      setRefreshing(false);
      pendingRefreshRef.current = false;
      if (resolve) resolve(false);
      return;
    }
    
    console.log('📤 SENDING COMMAND: get_dns_details_windows_ansible');
    
    sendCommand('get_dns_details_windows_ansible', payload);
    lastCommandTimeRef.current = new Date();
    
    // Set timeout to retry if no response
    setTimeout(() => {
      if (pendingRefreshRef.current && retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        console.log(`⏳ No response, retrying (${retryCountRef.current}/${maxRetries})...`);
        performDNSRefresh(resolve);
      } else if (pendingRefreshRef.current) {
        console.error('❌ Max retries reached, giving up');
        setError('Failed to refresh DNS data after multiple attempts. Please try again.');
        setRefreshing(false);
        pendingRefreshRef.current = false;
        if (resolve) resolve(false);
      }
    }, 5000);
  }, [isConnected, sendCommand]);

  // FIX: Define refreshDNSData after forceRefreshDNSData
  const refreshDNSData = () => {
    forceRefreshDNSData();
  };

  // FIXED: Enhanced processDNSDetails function
  const processDNSDetails = useCallback((responseData, machineType = null) => {
    console.log('🔄 Processing DNS details response:', responseData);
    
    if (!responseData) {
      console.log('⚠️ No response data to process');
      return;
    }
    
    // Reset retry count on successful response
    retryCountRef.current = 0;
    
    // Clear any pending refresh timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    
    // Handle dual machine response (this is what we get from backend)
    if (responseData.primary_dns_details || responseData.secondary_dns_details) {
      console.log('📊 Found dual machine DNS details structure');
      
      const updates = {};
      
      if (responseData.primary_dns_details) {
        console.log('🔍 Processing primary DNS details...');
        console.log('Primary forward zones keys:', Object.keys(responseData.primary_dns_details.forward_zones || {}));
        console.log('Primary reverse zones keys:', Object.keys(responseData.primary_dns_details.reverse_zones || {}));
        
        const primaryZones = processZonesFromDetails(responseData.primary_dns_details, 'primary');
        updates.primary = {
          details: responseData.primary_dns_details,
          zones: primaryZones
        };
        console.log('📋 Primary zones processed - Forward:', primaryZones.forward.length, 'Reverse:', primaryZones.reverse.length);
      }
      
      if (responseData.secondary_dns_details) {
        console.log('🔍 Processing secondary DNS details...');
        console.log('Secondary forward zones keys:', Object.keys(responseData.secondary_dns_details.forward_zones || {}));
        console.log('Secondary reverse zones keys:', Object.keys(responseData.secondary_dns_details.reverse_zones || {}));
        
        const secondaryZones = processZonesFromDetails(responseData.secondary_dns_details, 'secondary');
        updates.secondary = {
          details: responseData.secondary_dns_details,
          zones: secondaryZones
        };
        console.log('📋 Secondary zones processed - Forward:', secondaryZones.forward.length, 'Reverse:', secondaryZones.reverse.length);
      }
      
      // Update state with functional updates
      setDnsDetails(prev => {
        const newDetails = {
          primary: updates.primary?.details || prev.primary,
          secondary: updates.secondary?.details || prev.secondary
        };
        dnsDetailsRef.current = newDetails;
        return newDetails;
      });
      
      setZones(prev => {
        const newZones = { ...prev };
        if (updates.primary) {
          newZones.primary = updates.primary.zones;
        }
        if (updates.secondary) {
          newZones.secondary = updates.secondary.zones;
        }
        zonesDataRef.current = newZones;
        
        console.log('✅ UPDATED ZONES STATE:');
        console.log('Primary forward:', newZones.primary.forward.map(z => z.name));
        console.log('Primary reverse:', newZones.primary.reverse.map(z => z.name));
        console.log('Secondary forward:', newZones.secondary.forward.map(z => z.name));
        console.log('Secondary reverse:', newZones.secondary.reverse.map(z => z.name));
        
        // Check if newly created zones are now in the response
        checkNewlyCreatedZonesAgainstResponse(newZones, updates);
        
        return newZones;
      });
      
      setZonesLoading({ primary: false, secondary: false });
      setRefreshing(false);
      setError(null);
      lastCommandTimeRef.current = new Date();
      pendingRefreshRef.current = false;
      hasFetchedInitialDetails.current = true;
      actionInProgressRef.current = false;
      
      // FIXED: Improved record refresh logic
      if (selectedZone.zone && selectedZone.machine) {
        console.log(`🔄 Auto-refreshing records for selected zone: ${selectedZone.zone} (${selectedZone.machine})`);
        // Use a small delay to ensure state is updated
        setTimeout(() => {
          fetchZoneRecords(selectedZone.zone, selectedZone.machine, selectedZone.zoneType, true);
        }, 300);
      }
      
      // Check if newly created records are now in the response
      checkNewlyCreatedRecordsAgainstResponse(updates);
      
      return;
    }
    
    // Handle single machine response (fallback)
    if (machineType || responseData.dns_details) {
      const targetMachineType = machineType || 'primary';
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
        console.log(`✅ Updated ${targetMachineType} zones:`, newZones[targetMachineType]);
        
        // Check for newly created zones
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
      
      // Refresh records if this machine's zone is selected
      if (selectedZone.zone && selectedZone.machine === targetMachineType) {
        console.log(`🔄 Auto-refreshing records for selected zone: ${selectedZone.zone}`);
        setTimeout(() => {
          fetchZoneRecords(selectedZone.zone, targetMachineType, selectedZone.zoneType, true);
        }, 300);
      }
      
      // Check for newly created records for this machine
      checkNewlyCreatedRecordsAgainstResponse({
        [targetMachineType]: { details: details, zones: processedZones }
      });
    }
  }, [selectedZone, processZonesFromDetails, newlyCreatedZones, fetchZoneRecords]);

  // Function to check newly created zones against the response
  const checkNewlyCreatedZonesAgainstResponse = useCallback((newZones, updates) => {
    if (newlyCreatedZones.length === 0) return;
    
    console.log('🔍 Checking newly created zones against response...');
    
    const remainingZones = [];
    
    newlyCreatedZones.forEach(newZone => {
      const { name, machineType } = newZone;
      const normalizedZoneName = normalizeZoneName(name);
      let found = false;
      
      if (machineType === 'primary' && updates.primary) {
        // Check in primary forward zones
        found = updates.primary.zones.forward.some(z => normalizeZoneName(z.name) === normalizedZoneName);
        // Check in primary reverse zones
        if (!found) {
          found = updates.primary.zones.reverse.some(z => normalizeZoneName(z.name) === normalizedZoneName);
        }
      } else if (machineType === 'secondary' && updates.secondary) {
        // Check in secondary forward zones
        found = updates.secondary.zones.forward.some(z => normalizeZoneName(z.name) === normalizedZoneName);
        // Check in secondary reverse zones
        if (!found) {
          found = updates.secondary.zones.reverse.some(z => normalizeZoneName(z.name) === normalizedZoneName);
        }
      }
      
      if (found) {
        console.log(`✅ New zone "${name}" found in response! Removing from pending list.`);
      } else {
        console.log(`❌ New zone "${name}" NOT found in response, keeping in pending list.`);
        remainingZones.push(newZone);
      }
    });
    
    if (remainingZones.length !== newlyCreatedZones.length) {
      setNewlyCreatedZones(remainingZones);
      console.log(`📊 Updated newlyCreatedZones: ${remainingZones.length} zones pending`);
    }
  }, [newlyCreatedZones]);

  // FIXED: Enhanced function to check newly created records against the response
  const checkNewlyCreatedRecordsAgainstResponse = useCallback((updates) => {
    if (newlyCreatedRecords.length === 0) return;
    
    console.log('🔍 Checking newly created records against response...');
    
    const remainingRecords = [];
    
    newlyCreatedRecords.forEach(newRecord => {
      const { name, machine, zone, type } = newRecord;
      const normalizedZoneName = normalizeZoneName(zone);
      const normalizedRecordName = normalizeZoneName(name);
      let found = false;
      
      // Check in the appropriate machine's details
      const targetMachine = machine === 'primary' ? updates.primary : updates.secondary;
      
      if (targetMachine && targetMachine.details) {
        const details = targetMachine.details;
        
        // Check forward zones
        if (details.forward_zones) {
          Object.entries(details.forward_zones).forEach(([zoneKey, zoneData]) => {
            const currentZoneName = zoneData.name || zoneData.zone_name || zoneKey;
            const normalizedCurrentZoneName = normalizeZoneName(currentZoneName);
            
            if (normalizedCurrentZoneName === normalizedZoneName) {
              if (zoneData.records && zoneData.records[type]) {
                const recordTypeObj = zoneData.records[type];
                if (recordTypeObj && typeof recordTypeObj === 'object') {
                  // Check if record exists by name
                  found = Object.keys(recordTypeObj).some(recordKey => 
                    normalizeZoneName(recordKey) === normalizedRecordName
                  );
                  
                  // Also check if the data matches
                  if (found && recordTypeObj[name]) {
                    const recordData = recordTypeObj[name];
                    const recordValue = recordData.value || recordData.data || '';
                    if (recordValue !== newRecord.data) {
                      console.log(`⚠️ Record "${name}" found but data doesn't match: ${recordValue} vs ${newRecord.data}`);
                    }
                  }
                }
              }
            }
          });
        }
        
        // Check reverse zones
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
        console.log(`✅ New record "${name}" (${type}) found in response!`);
      } else {
        console.log(`❌ New record "${name}" (${type}) NOT found in response, keeping in pending list.`);
        remainingRecords.push(newRecord);
      }
    });
    
    if (remainingRecords.length !== newlyCreatedRecords.length) {
      setNewlyCreatedRecords(remainingRecords);
      console.log(`📊 Updated newlyCreatedRecords: ${remainingRecords.length} records pending`);
    }
  }, [newlyCreatedRecords]);

  const handleWebSocketMessage = useCallback((message) => {
    console.log('📨 DNS received WebSocket message:', message);
    
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
      console.log('📝 Backend log:', message.message);
      return;
    }
    
    if (!command) {
      console.log('⚠️ No command found in message:', message);
      return;
    }
    
    console.log(`🔄 Processing response for command: ${command}`, { result, error, payload });
    
    if (error) {
      console.log(`❌ Error from backend for command ${command}:`, error);
      setError(`Error: ${error}`);
      setLoading(false);
      setCheckingStatus(false);
      setActionLoading(false);
      actionInProgressRef.current = false;
      return;
    }
    
    const responseData = extractResult(result);
    console.log('📊 Extracted response data:', responseData);
    
    switch(command) {
      case 'get_machine_info':
        console.log('✅ Received machine info');
        if (responseData && responseData.machines) {
          processDnsMachines(responseData.machines);
        }
        break;
        
      case 'check_dns_role_installed_windows_ansible':
        console.log('✅ Received DNS check response');
        handleDNSCheckResponse(responseData);
        break;
        
      case 'get_dns_details_windows_ansible':
        console.log('✅ Received DNS details response');
        if (responseData) {
          processDNSDetails(responseData);
        } else {
          console.error('❌ Empty response for DNS details');
          setError('Received empty response from server');
          setZonesLoading({ primary: false, secondary: false });
          setRefreshing(false);
          actionInProgressRef.current = false;
        }
        break;
        
      case 'install_dns_role_windows_ansible':
        console.log('✅ Received DNS installation response');
        handleDNSInstallResponse(responseData);
        break;
        
      case 'create_zone_forward_lookup_zone_dns_windows_ansible':
      case 'create_zone_reverse_lookup_zone_dns_windows_ansible':
        console.log('✅ Received zone creation response');
        handleZoneCreationResponse(responseData);
        break;
        
      case 'create_host_record_forward_lookup_zone_dns_windows_ansible':
      case 'create_pointer_record_reverse_lookup_zone_dns_windows_ansible':
        console.log('✅ Received record creation response');
        handleRecordCreationResponse(responseData);
        break;
        
      case 'delete_forward_zone_dns_windows_ansible':
      case 'delete_reverse_zone_dns_windows_ansible':
        console.log('✅ Received zone deletion response');
        handleZoneDeletionResponse(responseData);
        break;
        
      default:
        console.log(`⚠️ Unhandled command: ${command}`);
    }
  }, [processDNSDetails, processDnsMachines]);

  const handleDNSCheckResponse = (responseData) => {
    if (responseData && (responseData.primary_installed !== undefined || responseData.secondary_installed !== undefined)) {
      const newDnsRoleInstalled = { ...dnsRoleInstalled };
      
      if (responseData.primary_installed !== undefined) {
        newDnsRoleInstalled.primary = responseData.primary_installed === true || 
                                      responseData.primary_installed === "true" ||
                                      responseData.primary_installed === "installed";
      }
      
      if (responseData.secondary_installed !== undefined) {
        newDnsRoleInstalled.secondary = responseData.secondary_installed === true || 
                                        responseData.secondary_installed === "true" ||
                                        responseData.secondary_installed === "installed";
      }
      
      setDnsRoleInstalled(newDnsRoleInstalled);
      setLoading(false);
      setCheckingStatus(false);
      
      const requiresInstallation = responseData.requires_installation === true;
      const hasPrimary = getMachineByType('primary') && newDnsRoleInstalled.primary === true;
      const hasSecondary = getMachineByType('secondary') && newDnsRoleInstalled.secondary === true;
      
      if (requiresInstallation) {
        setShowInstallModal(true);
      } else if (hasPrimary || hasSecondary) {
        updateInstallationStatus('dns', INSTALLATION_STATUS.INSTALLED, 100, 'DNS server is installed');
        setShowInstallModal(false);
        
        // Auto-fetch DNS details after confirming installation
        setTimeout(() => {
          fetchDNSDetails();
        }, 1000);
      }
    }
  };

  const handleDNSInstallResponse = (responseData) => {
    let installationSuccess = false;
    
    if (responseData && (responseData.primary_result || responseData.secondary_result)) {
      const primarySuccess = responseData.primary_success === true || 
                            (responseData.primary_result && 
                             (typeof responseData.primary_result === 'string' ? 
                              responseData.primary_result.toLowerCase().includes('dns role installation done') :
                              false));
      
      const secondarySuccess = responseData.secondary_success === true ||
                              (responseData.secondary_result && 
                               (typeof responseData.secondary_result === 'string' ? 
                                responseData.secondary_result.toLowerCase().includes('dns role installation done') :
                                false));
      
      installationSuccess = primarySuccess || secondarySuccess;
      
      if (installationSuccess) {
        const newDnsRoleInstalled = { ...dnsRoleInstalled };
        if (primarySuccess) newDnsRoleInstalled.primary = true;
        if (secondarySuccess) newDnsRoleInstalled.secondary = true;
        setDnsRoleInstalled(newDnsRoleInstalled);
      }
    } else if (typeof responseData === 'string' || (responseData && responseData.result)) {
      let resultStr = typeof responseData === 'string' ? responseData : responseData.result;
      
      if (typeof resultStr === 'string') {
        installationSuccess = resultStr.toLowerCase().includes('dns role installation done');
      } else if (typeof resultStr === 'object') {
        const dataStr = JSON.stringify(resultStr).toLowerCase();
        installationSuccess = dataStr.includes('dns role installation done') ||
                             resultStr.message === 'dns role installation done' ||
                             resultStr.result === 'dns role installation done';
      }
      
      if (installationSuccess) {
        setDnsRoleInstalled(prev => ({ ...prev, primary: true }));
      }
    }
    
    if (installationSuccess) {
      updateInstallationStatus('dns', INSTALLATION_STATUS.INSTALLED, 100, 'DNS server installed successfully');
      setInstallSuccess(true);
      setInstallProgress('Installation completed successfully!');
      setInstalling(false);
      
      setTimeout(() => {
        setShowInstallModal(false);
        setInstallSuccess(false);
        setInstallProgress('');
        
        // Auto-fetch DNS details after installation
        setTimeout(() => {
          fetchDNSDetails();
        }, 500);
      }, 1200);
    } else {
      setError(`Installation failed: ${JSON.stringify(responseData)}`);
      setInstallProgress('Installation failed');
      setInstalling(false);
      updateInstallationStatus('dns', INSTALLATION_STATUS.FAILED, 0, 'Installation failed');
    }
  };

  // FIXED: Enhanced zone creation response handler
  const handleZoneCreationResponse = useCallback((responseData) => {
    setActionLoading(false);
    
    let zoneCreationSuccess = false;
    let zoneName = '';
    
    if (typeof responseData === 'string') {
      zoneCreationSuccess = responseData.toLowerCase().includes('created') || 
                           responseData.toLowerCase().includes('success');
      // Extract zone name from response
      const match = responseData.match(/Zone\s+['"](.+?)['"]\s+created/) || 
                   responseData.match(/zone\s+['"](.+?)['"]\s+created/i) ||
                   responseData.match(/['"](.+?)['"]\s+created/i);
      zoneName = match ? match[1] : newZoneData.zoneName;
      console.log('Extracted zone name from string:', zoneName);
    } else if (typeof responseData === 'object') {
      zoneCreationSuccess = responseData.success === true ||
                           (responseData.message && responseData.message.toLowerCase().includes('created'));
      zoneName = responseData.zone_name || responseData.zoneName || newZoneData.zoneName;
      console.log('Extracted zone name from object:', zoneName);
    }
    
    if (zoneCreationSuccess) {
      const normalizedZoneName = normalizeZoneName(zoneName);
      setSuccessMessage(`Zone "${normalizedZoneName}" created successfully!`);
      setShowCreateZoneModal(false);
      
      // Add to newly created zones list
      const newZoneEntry = {
        name: normalizedZoneName,
        machineType: newZoneData.targetMachine,
        zoneType: newZoneData.zoneType,
        timestamp: Date.now()
      };
      setNewlyCreatedZones(prev => [...prev, newZoneEntry]);
      
      // Reset form
      setNewZoneData({ 
        zoneName: '', 
        zoneType: 'forward', 
        dynamicUpdate: 'Secure',
        targetMachine: 'primary'
      });
      
      // Force refresh after delay to ensure backend is ready
      console.log(`🔄 Zone created successfully, refreshing DNS data in 3 seconds...`);
      setTimeout(() => {
        refreshDNSData();
      }, 3000);
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      
    } else {
      setError(`Zone creation failed: ${JSON.stringify(responseData)}`);
      actionInProgressRef.current = false;
    }
  }, [newZoneData]);

  // FIXED: Enhanced record creation response handler with immediate UI update
  const handleRecordCreationResponse = useCallback((responseData) => {
    setActionLoading(false);
    
    let recordCreationSuccess = false;
    let recordName = '';
    let recordData = '';
    let recordType = '';
    
    if (typeof responseData === 'string') {
      recordCreationSuccess = responseData.toLowerCase().includes('created') || 
                             responseData.toLowerCase().includes('success');
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
      
      // Add to newly created records list
      const newRecordEntry = {
        name: recordName,
        type: recordType,
        data: recordData,
        zone: selectedZone.zone,
        machine: selectedZone.machine || newRecordData.targetMachine,
        ttl: newRecordData.ttl || 3600,
        timestamp: Date.now()
      };
      
      console.log('📝 Adding new record to pending list:', newRecordEntry);
      setNewlyCreatedRecords(prev => [...prev, newRecordEntry]);
      
      // Immediately update the UI with the new record
      if (selectedZone.zone && (selectedZone.machine || newRecordData.targetMachine)) {
        const machineType = selectedZone.machine || newRecordData.targetMachine;
        const newRecordId = `new-${machineType}-${normalizeZoneName(selectedZone.zone)}-${recordName}-${recordType}`;
        
        // Track this ID
        recentlyCreatedRecordIds.current.add(newRecordId);
        
        // Clean up after 30 seconds
        setTimeout(() => {
          recentlyCreatedRecordIds.current.delete(newRecordId);
        }, 30000);
        
        // Immediately add the record to the current view
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
        
        console.log('📝 Immediately adding record to UI:', newRecord);
        setRecords(prev => {
          // Check if record already exists
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
      
      // Reset form
      setNewRecordData({
        recordType: 'A',
        recordName: '',
        recordValue: '',
        recordIp: '',
        ttl: 3600,
        targetMachine: selectedZone.machine || 'primary'
      });
      
      // Force refresh DNS data to get the latest from backend
      console.log(`🔄 Record created successfully, refreshing DNS data in 2 seconds...`);
      setTimeout(() => {
        refreshDNSData();
      }, 2000);
      
      // Clear success message after 5 seconds
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
      deletionSuccess = responseData.toLowerCase().includes('deleted') || 
                       responseData.toLowerCase().includes('success');
    } else if (typeof responseData === 'object') {
      deletionSuccess = responseData.success === true ||
                       (responseData.message && responseData.message.toLowerCase().includes('deleted'));
    }
    
    if (deletionSuccess) {
      setSuccessMessage(`Zone deleted successfully!`);
      setSelectedZone({ machine: null, zone: null, zoneType: null });
      setRecords([]);
      
      // Force refresh
      setTimeout(() => {
        refreshDNSData();
      }, 500);
      
      // Clear success message after 3 seconds
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
    
    const payload = createDualPayload();
    if (!payload) {
      setError('Failed to create payload - check machine credentials');
      setZonesLoading({ primary: false, secondary: false });
      return;
    }
    
    console.log('📤 SENDING COMMAND: get_dns_details_windows_ansible (initial)');
    sendCommand('get_dns_details_windows_ansible', payload);
  };

  const installDNSRole = () => {
    if (installations.dns?.status === INSTALLATION_STATUS.INSTALLING) {
      console.log('⏳ Installation already in progress');
      return;
    }

    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
    if (!primaryMachine && !secondaryMachine) {
      setError('No DNS machines available for installation');
      return;
    }

    const payload = createDualPayload();
    if (!payload) {
      setError('Failed to create payload for installation');
      return;
    }
    
    console.log('📤 SENDING COMMAND: install_dns_role_windows_ansible');
    
    setInstalling(true);
    setInstallSuccess(false);
    setInstallProgress('Starting DNS role installation...');
    setError(null);
    
    updateInstallationStatus('dns', INSTALLATION_STATUS.INSTALLING, 0, 'Starting DNS installation...');
    
    sendCommand('install_dns_role_windows_ansible', payload);
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
      command = 'create_zone_forward_lookup_zone_dns_windows_ansible';
      additionalData = { zone_name: newZoneData.zoneName };
    } else {
      command = 'create_zone_reverse_lookup_zone_dns_windows_ansible';
      const ipParts = newZoneData.zoneName.split('.').reverse();
      additionalData = { zone_name: `${ipParts.slice(0, 3).join('.')}.in-addr.arpa` };
    }
    
    console.log(`📤 SENDING COMMAND: ${command} for ${newZoneData.targetMachine}`);
    
    const payload = createPayload(additionalData, newZoneData.targetMachine);
    if (!payload) {
      setError('Failed to create payload');
      setActionLoading(false);
      actionInProgressRef.current = false;
      return;
    }
    
    sendCommand(command, payload);
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
      command = 'create_host_record_forward_lookup_zone_dns_windows_ansible';
      additionalData = {
        zone_name: selectedZone.zone,
        record_name: newRecordData.recordName,
        record_ip: newRecordData.recordValue
      };
    } else if (newRecordData.recordType === 'PTR') {
      command = 'create_pointer_record_reverse_lookup_zone_dns_windows_ansible';
      additionalData = {
        zone_name: selectedZone.zone,
        host_ip: newRecordData.recordIp,
        host_name: newRecordData.recordValue
      };
    } else if (newRecordData.recordType === 'MX' || newRecordData.recordType === 'TXT') {
      command = 'create_host_record_forward_lookup_zone_dns_windows_ansible';
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
    
    console.log(`📤 SENDING COMMAND: ${command} for ${newRecordData.targetMachine}`);
    
    const payload = createPayload(additionalData, newRecordData.targetMachine);
    if (!payload) {
      setError('Failed to create payload');
      setActionLoading(false);
      actionInProgressRef.current = false;
      return;
    }
    
    sendCommand(command, payload);
  };

  const deleteZone = (zoneName, zoneType, machineType) => {
    if (!window.confirm(`Are you sure you want to delete zone "${zoneName}" from ${machineType}? This action cannot be undone.`)) {
      return;
    }

    console.log(`🗑️ Deleting DNS zone: ${zoneName} from ${machineType}`);
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
    
    console.log(`📤 SENDING COMMAND: ${command}`);
    sendCommand(command, payload);
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
    
    // Add newly created zones that haven't been confirmed yet
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
    
    // Sort zones alphabetically
    const sortedZones = [...filteredZones].sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`📊 RENDERING ${zoneType} zones:`, sortedZones.length, 'zones');
    
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
              disabled={actionLoading || actionInProgressRef.current}
            >
              Create New Zone
            </button>
            <button 
              className="btn-refresh-zones"
              onClick={() => {
                console.log('🔄 Manual refresh triggered');
                refreshDNSData();
              }}
              disabled={zonesLoading.primary || zonesLoading.secondary || actionLoading || refreshing || actionInProgressRef.current}
            >
              {refreshing ? (
                <>
                  <span className="refresh-spinner"></span>
                  Refreshing...
                </>
              ) : 'Refresh Zones'}
            </button>
          </div>
        </div>
        
        {(zonesLoading.primary || zonesLoading.secondary) ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading zones...</p>
          </div>
        ) : sortedZones.length === 0 ? (
          <div className="no-zones-message">
            <p>No {zoneType} lookup zones found. Create a new zone to get started.</p>
            {refreshing && <p className="small-text">Refreshing data...</p>}
            {actionInProgressRef.current && <p className="small-text">Action in progress...</p>}
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
                          disabled={actionLoading || actionInProgressRef.current}
                        >
                          View Records
                        </button>
                        <button 
                          className="btn-delete-zone"
                          onClick={() => deleteZone(zone.name, zone.type, zone.machineType)}
                          disabled={actionLoading || actionInProgressRef.current}
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
  }, [getAllZones, zonesLoading, actionLoading, refreshing, fetchZoneRecords, newlyCreatedZones]);

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
              disabled={actionLoading || actionInProgressRef.current}
            >
              Create New Record
            </button>
            <button 
              className="btn-refresh-records"
              onClick={() => fetchZoneRecords(selectedZone.zone, selectedZone.machine, selectedZone.zoneType, true, true)}
              disabled={recordsLoading || actionLoading || actionInProgressRef.current}
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
  }, [selectedZone, records, recordsLoading, actionLoading, fetchZoneRecords, newlyCreatedRecords]);

  const renderDNSRoleStatus = () => {
    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
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
    
    if (!hasInstalledAny && (primaryMachine || secondaryMachine)) {
      return (
        <div className="dns-not-installed">
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <h3>DNS Server Role Not Installed</h3>
            <p>DNS server role is not installed on configured machines.</p>
            <div className="windows-info-details">
              {primaryMachine && (
                <p><strong>Primary:</strong> {primaryMachine.name} ({primaryMachine.ip}) - Status: {dnsRoleInstalled.primary === null ? 'Checking...' : dnsRoleInstalled.primary === true ? 'Installed' : 'Not installed'}</p>
              )}
              {secondaryMachine && (
                <p><strong>Secondary:</strong> {secondaryMachine.name} ({secondaryMachine.ip}) - Status: {dnsRoleInstalled.secondary === null ? 'Checking...' : dnsRoleInstalled.secondary === true ? 'Installed' : 'Not installed'}</p>
              )}
            </div>
            <button 
              className="btn-install-dns"
              onClick={() => setShowInstallModal(true)}
              disabled={installing}
            >
              Install DNS Server Role
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
                <p><strong>Primary:</strong> {primaryMachine.name} ({primaryMachine.ip}) - Status: Installed</p>
              )}
              {secondaryMachine && hasInstalledSecondary && (
                <p><strong>Secondary:</strong> {secondaryMachine.name} ({secondaryMachine.ip}) - Status: Installed</p>
              )}
            </div>
            <button 
              className="btn-fetch-details"
              onClick={fetchDNSDetails}
              disabled={zonesLoading.primary || zonesLoading.secondary}
            >
              {(zonesLoading.primary || zonesLoading.secondary) ? 'Loading Zones...' : 'Load DNS Zones'}
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
              <span className="machine-name">Primary: {primaryMachine.name}</span>
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
              <span className="machine-name">Secondary: {secondaryMachine.name}</span>
            </div>
            <div className="machine-details">
              <span className="machine-ip">IP: {secondaryMachine.ip}</span>
              <span className="machine-status-text">
                Status: {dnsRoleInstalled.secondary === null ? 'Checking...' : dnsRoleInstalled.secondary === true ? 'Installed' : 'Not installed'}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (!listenerAdded.current) {
      console.log('🚀 DNS Component Mounted - Setting up WebSocket listener');
      const removeListener = addListener(handleWebSocketMessage);
      listenerAdded.current = true;
      
      return () => {
        if (removeListener) removeListener();
        listenerAdded.current = false;
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
        if (autoRefreshTimeoutRef.current) {
          clearTimeout(autoRefreshTimeoutRef.current);
        }
      };
    }
  }, [addListener, handleWebSocketMessage]);

  useEffect(() => {
    if (initialCheckDone.current) {
      return;
    }
    
    const performInitialCheck = () => {
      console.log('🔍 Performing initial DNS check...');
      
      setCheckingStatus(true);
      setLoading(true);
      
      if (installations.dns?.status === INSTALLATION_STATUS.INSTALLING) {
        console.log('⏳ DNS is installing globally');
        setCheckingStatus(false);
        setLoading(false);
        initialCheckDone.current = true;
        return;
      }
      
      if (isConnected) {
        console.log('✅ WebSocket connected, fetching machine info...');
        getDnsMachinesFromDatabase();
        initialCheckDone.current = true;
      } else {
        console.log('⚠️ WebSocket not connected, retrying...');
        setTimeout(performInitialCheck, 1000);
      }
    };
    
    performInitialCheck();
    
  }, [isConnected, installations.dns]);

  useEffect(() => {
    if (dnsMachines.length > 0) {
      console.log('🔍 DNS machines loaded, checking DNS status...');
      checkDNSOnMachines();
    }
  }, [dnsMachines]);

  const checkDNSOnMachines = () => {
    const primaryMachine = getMachineByType('primary');
    const secondaryMachine = getMachineByType('secondary');
    
    if (!primaryMachine && !secondaryMachine) {
      setError('No DNS machines found');
      return;
    }
    
    const payload = createDualPayload();
    
    if (!payload) {
      setError('Failed to create payload for DNS check');
      return;
    }
    
    console.log('📤 SENDING COMMAND: check_dns_role_installed_windows_ansible');
    sendCommand('check_dns_role_installed_windows_ansible', payload);
  };

  return (
    <div className="dns-configuration">
      <div className="event-viewer-header">
        <h1 className="event-viewer-title">Automation</h1>
        <div className="nav-buttons">
          {navItems.map((item) => (
            <button
              key={item}
              className={`nav-button ${item === 'DNS Configuration' ? 'nav-button-active' : 'nav-button-inactive'}`}
              disabled={actionLoading || installing || actionInProgressRef.current}
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
                disabled={zonesLoading.primary || zonesLoading.secondary || refreshing || !isConnected || actionInProgressRef.current}
              >
                {refreshing ? (
                  <>
                    <span className="refresh-spinner"></span>
                    Refreshing...
                  </>
                ) : (
                  <>
                    Refresh DNS Data
                  </>
                )}
              </button>
              {lastCommandTimeRef.current && (
                <div className="last-refresh-time">
                  Last refreshed: {formatLastRefreshTime()}
                </div>
              )}
            </div>
          </div>
          <div className="connection-status-small">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
            WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
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
                disabled={actionLoading || actionInProgressRef.current}
              >
                Forward Lookup Zones
              </button>
              <button
                className={`tab-btn ${activeTab === 'reverse-zones' ? 'active' : ''}`}
                onClick={() => setActiveTab('reverse-zones')}
                disabled={actionLoading || actionInProgressRef.current}
              >
                Reverse Lookup Zones
              </button>
              <button
                className={`tab-btn ${activeTab === 'records' ? 'active' : ''}`}
                onClick={() => setActiveTab('records')}
                disabled={!selectedZone.zone || actionLoading || actionInProgressRef.current}
              >
                DNS Records
              </button>
              <button
                className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
                disabled={actionLoading || actionInProgressRef.current}
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
                      disabled={zonesLoading.primary || zonesLoading.secondary || actionLoading || refreshing || actionInProgressRef.current}
                    >
                      {refreshing ? 'Refreshing...' : 'Refresh DNS Data'}
                    </button>
                    <button 
                      className="btn-refresh-machines"
                      onClick={() => {
                        getDnsMachinesFromDatabase();
                        setCheckingStatus(true);
                      }}
                      disabled={actionLoading || actionInProgressRef.current}
                    >
                      Refresh Machine List
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

      {/* Install Modal */}
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
                      <li>This will install Windows DNS Server role via Ansible on all configured DNS machines</li>
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
                      disabled={installing}
                    >
                      Cancel
                    </button>
                    <button 
                      className="btn-install"
                      onClick={installDNSRole}
                      disabled={installing || installations.dns?.status === INSTALLATION_STATUS.INSTALLING}
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

      {/* Create Zone Modal */}
      {showCreateZoneModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Create {newZoneData.zoneType === 'forward' ? 'Forward' : 'Reverse'} Lookup Zone</h2>
              <button 
                className="btn-close-modal"
                onClick={() => setShowCreateZoneModal(false)}
                disabled={actionLoading || actionInProgressRef.current}
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
                  disabled={actionLoading || actionInProgressRef.current}
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
                    disabled={actionLoading || actionInProgressRef.current}
                  >
                    Forward Lookup Zone
                  </button>
                  <button
                    className={`zone-type-btn ${newZoneData.zoneType === 'reverse' ? 'active' : ''}`}
                    onClick={() => setNewZoneData({...newZoneData, zoneType: 'reverse'})}
                    disabled={actionLoading || actionInProgressRef.current}
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
                  disabled={actionLoading || actionInProgressRef.current}
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
                  disabled={actionLoading || actionInProgressRef.current}
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
                  disabled={actionLoading || actionInProgressRef.current}
                >
                  Cancel
                </button>
                <button 
                  className="btn-create"
                  onClick={createZone}
                  disabled={actionLoading || !newZoneData.zoneName || actionInProgressRef.current}
                >
                  {actionLoading ? 'Creating Zone...' : 'Create Zone'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Record Modal */}
      {showCreateRecordModal && selectedZone.machine && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Create DNS Record in {selectedZone.zone}</h2>
              <button 
                className="btn-close-modal"
                onClick={() => setShowCreateRecordModal(false)}
                disabled={actionLoading || actionInProgressRef.current}
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
                  disabled={actionLoading || actionInProgressRef.current}
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
                  disabled={actionLoading || actionInProgressRef.current}
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
                    disabled={actionLoading || actionInProgressRef.current}
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
                    disabled={actionLoading || actionInProgressRef.current}
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
                      disabled={actionLoading || actionInProgressRef.current}
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
                      disabled={actionLoading || actionInProgressRef.current}
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
                    disabled={actionLoading || actionInProgressRef.current}
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
                  disabled={actionLoading || actionInProgressRef.current}
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
                  disabled={actionLoading || actionInProgressRef.current}
                >
                  Cancel
                </button>
                <button 
                  className="btn-create"
                  onClick={createRecord}
                  disabled={actionLoading || actionInProgressRef.current || 
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