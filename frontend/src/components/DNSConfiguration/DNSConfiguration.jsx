import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import './DNSConfiguration.css';

function DNSConfiguration() {
  const { sendCommand, isConnected, addListener } = useWebSocket();
  
  const [dnsRoleInstalled, setDnsRoleInstalled] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dnsDetails, setDnsDetails] = useState(null);
  const [zones, setZones] = useState({ forward: [], reverse: [] });
  const [zonesLoading, setZonesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('forward-zones');
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showCreateZoneModal, setShowCreateZoneModal] = useState(false);
  const [showCreateRecordModal, setShowCreateRecordModal] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState('');
  const [installSuccess, setInstallSuccess] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [newZoneData, setNewZoneData] = useState({
    zoneName: '',
    zoneType: 'forward',
    dynamicUpdate: 'Secure'
  });
  
  const [newRecordData, setNewRecordData] = useState({
    recordType: 'A',
    recordValue: '',
    recordIp: '',
    ttl: 3600
  });

  const initialCommandsSent = useRef(false);
  const hasCheckedDNSRef = useRef(false);
  const hasLoadedZonesRef = useRef(false);
  const zoneCreationInProgressRef = useRef(false);
  const recordCreationInProgressRef = useRef(false);
  const installationInProgressRef = useRef(false);
  const lastRefreshTimeRef = useRef(null);

  const navItems = [
    'Dashboard', 'DNS Configuration', 'Event Viewer', 'DHCP', 'Users', 
    'Resource Monitor', 'WDS', 'Networking', 'Device Auto Config', 
    'Active Directory', 'Routing'
  ];

  const windowsInfo = {
    "ip": "192.168.2.15",
    "username": "Administrator",
    "password": "abc123$"
  };

  const createPayload = (additionalData = {}) => {
    return {
      "windows_info": windowsInfo,
      ...additionalData
    };
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

  const fetchDNSDetailsAfterInstallation = () => {
    console.log('Fetching DNS details after successful installation...');
    setZonesLoading(true);
    
    setTimeout(() => {
      sendCommand('get_dns_details_windows_ansible', {
        windows_info: windowsInfo
      });
    }, 2000);
  };

  const processDNSDetails = (responseData) => {
    console.log('Processing DNS details response:', responseData);
    
    if (!responseData) {
      console.log('No response data to process');
      return;
    }
    
    let details = responseData;
    
    if (responseData.dns_details) {
      console.log('Found nested dns_details structure');
      details = responseData.dns_details;
    }
    
    console.log('DNS details structure:', {
      hasForwardZones: !!details.forward_zones,
      hasReverseZones: !!details.reverse_zones,
      forwardKeys: details.forward_zones ? Object.keys(details.forward_zones) : [],
      reverseKeys: details.reverse_zones ? Object.keys(details.reverse_zones) : []
    });
    
    setDnsDetails(details);
    
    const forwardZones = [];
    const reverseZones = [];
    
    if (details.forward_zones) {
      console.log('Processing forward zones:', details.forward_zones);
      Object.entries(details.forward_zones).forEach(([zoneKey, zoneData]) => {
        console.log(`Forward zone ${zoneKey}:`, zoneData);
        const zoneName = zoneData.name || zoneKey;
        const zoneType = zoneData.zone_type || zoneData['zone-type'] || 'Primary';
        const dynamicUpdate = zoneData.dynamic_update || 'None';
        
        let recordCount = 0;
        if (zoneData.records) {
          Object.values(zoneData.records).forEach(recordTypeObj => {
            if (recordTypeObj) {
              recordCount += Object.keys(recordTypeObj).length;
            }
          });
        }
        
        forwardZones.push({
          id: zoneKey,
          name: zoneName,
          type: zoneType,
          dynamicUpdate: dynamicUpdate,
          recordCount: recordCount,
          rawData: zoneData
        });
      });
    }
    
    if (details.reverse_zones) {
      console.log('Processing reverse zones:', details.reverse_zones);
      Object.entries(details.reverse_zones).forEach(([zoneKey, zoneData]) => {
        console.log(`Reverse zone ${zoneKey}:`, zoneData);
        const zoneName = zoneData.name || zoneKey;
        const zoneType = 'Reverse';
        const dynamicUpdate = zoneData.dynamic_update || 'None';
        
        let recordCount = 0;
        if (zoneData.records) {
          Object.values(zoneData.records).forEach(recordTypeObj => {
            if (recordTypeObj) {
              recordCount += Object.keys(recordTypeObj).length;
            }
          });
        }
        
        reverseZones.push({
          id: zoneKey,
          name: zoneName,
          type: zoneType,
          dynamicUpdate: dynamicUpdate,
          recordCount: recordCount,
          rawData: zoneData
        });
      });
    }
    
    console.log('Processed zones:', {
      forward: forwardZones,
      reverse: reverseZones
    });
    
    setZones({ forward: forwardZones, reverse: reverseZones });
    hasLoadedZonesRef.current = true;
    setZonesLoading(false);
    setRefreshing(false);
    lastRefreshTimeRef.current = new Date();
  };

  const handleWebSocketMessage = (message) => {
    console.log('DNS received message:', message);
    
    let command, result, error;
    
    if (message.type === 'COMMAND_RESPONSE') {
      command = message.command;
      result = message.result || message.data;
      error = message.error;
    } else if (message.action === 'response') {
      command = message.command;
      result = message.result;
      error = message.error;
    } else if (message.response) {

      const responseObj = message.response;
      command = responseObj.command;
      result = responseObj.result;
      error = responseObj.error;
    }
    
    if (!command) return;
    
    console.log(`Processing response for command: ${command}`, { result, error });
    
    if (error) {
      console.log(`Error from backend for command ${command}:`, error);
      setError(`Error: ${error}`);
      return;
    }
    
    const responseData = extractResult(result);
    console.log('Extracted response data:', responseData);
    
    switch(command) {
      case 'check_dns_role_installed_windows_ansible':
        console.log('Received response for DNS check:', responseData);
        
        let isInstalled = false;
        
        if (typeof responseData === 'object' && responseData !== null) {
          if (responseData.installed !== undefined) {
            isInstalled = responseData.installed === true || 
                         responseData.installed === "true" ||
                         responseData.installed === "installed";
          }
        } else if (typeof responseData === 'string') {
          isInstalled = responseData.includes('true') || 
                       responseData.includes('installed') ||
                       !responseData.includes('false') && 
                       !responseData.includes('not installed');
        }
        
        console.log(`DNS installed status: ${isInstalled}`);
        setDnsRoleInstalled(isInstalled);
        setLoading(false);
        
        if (isInstalled) {
          fetchDNSDetails();
        } else {
          setShowInstallModal(true);
        }
        break;
        
      case 'get_dns_details_windows_ansible':
        console.log('Received DNS details response:', responseData);
        
        processDNSDetails(responseData);
        break;
        
      case 'install_dns_role_windows_ansible':
        console.log('DNS installation response:', responseData);
        
        let installationSuccess = false;
        
        if (typeof responseData === 'string') {
          const resultLower = responseData.toLowerCase();
          installationSuccess = resultLower.includes('dns role installation done') || 
                               resultLower.includes('installation done') || 
                               resultLower.includes('success');
          
          if (responseData[0] && typeof responseData === 'object') {
            let resultString = '';
            for (let i = 0; i < 100; i++) {
              if (responseData[i] !== undefined) {
                resultString += responseData[i];
              } else {
                break;
              }
            }
            const stringLower = resultString.toLowerCase();
            installationSuccess = stringLower.includes('dns role installation done');
          }
        } else if (typeof responseData === 'object') {
          const dataStr = JSON.stringify(responseData).toLowerCase();
          installationSuccess = dataStr.includes('dns role installation done') ||
                               responseData.success === true ||
                               responseData.message === 'dns role installation done';
        }
        
        if (installationSuccess) {
          console.log('DNS installation successful!');
          setInstallSuccess(true);
          setInstallProgress('Installation completed successfully!');
          setDnsRoleInstalled(true);
          hasCheckedDNSRef.current = true;
          
          setInstalling(false);
          
          setTimeout(() => {
            setShowInstallModal(false);
            setTimeout(() => {
              setInstallSuccess(false);
              setInstallProgress('');
              installationInProgressRef.current = false;
              
              fetchDNSDetailsAfterInstallation();
              
            }, 300);
          }, 2000);
        } else {
          setError(`Installation failed: Unexpected response: ${JSON.stringify(responseData)}`);
          setInstallProgress('Installation failed');
          setInstalling(false);
          installationInProgressRef.current = false;
        }
        break;
        
      case 'create_zone_forward_lookup_zone_dns_windows_ansible':
      case 'create_zone_reverse_lookup_zone_dns_windows_ansible':
        console.log('Zone creation response:', responseData);
        setActionLoading(false);
        zoneCreationInProgressRef.current = false;
        
        let zoneCreationSuccess = false;
        
        if (typeof responseData === 'string') {
          zoneCreationSuccess = responseData.toLowerCase().includes('created') || 
                               responseData.toLowerCase().includes('success');
        } else if (typeof responseData === 'object') {
          zoneCreationSuccess = responseData.success === true ||
                               (responseData.message && responseData.message.toLowerCase().includes('created'));
        }
        
        if (zoneCreationSuccess) {
          setSuccessMessage(`Zone "${newZoneData.zoneName}" created successfully!`);
          setShowCreateZoneModal(false);
          setNewZoneData({ zoneName: '', zoneType: 'forward', dynamicUpdate: 'Secure' });
          
          setTimeout(() => {
            console.log('Auto-refreshing DNS details after zone creation...');
            refreshDNSData();
          }, 2000);
        } else {
          setError(`Zone creation failed: ${JSON.stringify(responseData)}`);
        }
        break;
        
      case 'create_host_record_forward_lookup_zone_dns_windows_ansible':
      case 'create_pointer_record_reverse_lookup_zone_dns_windows_ansible':
        console.log('Record creation response:', responseData);
        setActionLoading(false);
        recordCreationInProgressRef.current = false;
        
        let recordCreationSuccess = false;
        
        if (typeof responseData === 'string') {
          recordCreationSuccess = responseData.toLowerCase().includes('created') || 
                                 responseData.toLowerCase().includes('success');
        } else if (typeof responseData === 'object') {
          recordCreationSuccess = responseData.success === true ||
                                 (responseData.message && responseData.message.toLowerCase().includes('created'));
        }
        
        if (recordCreationSuccess) {
          setSuccessMessage(`Record created successfully!`);
          setShowCreateRecordModal(false);
          setNewRecordData({
            recordType: 'A',
            recordValue: '',
            recordIp: '',
            ttl: 3600
          });
          
          setTimeout(() => {
            console.log('Auto-refreshing DNS details after record creation...');
            refreshDNSData();
          }, 2000);
        } else {
          setError(`Record creation failed: ${JSON.stringify(responseData)}`);
        }
        break;
        
      case 'delete_forward_zone_dns_windows_ansible':
      case 'delete_reverse_zone_dns_windows_ansible':
        console.log('Zone deletion response:', responseData);
        
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
          
          setTimeout(() => {
            console.log('Auto-refreshing DNS details after zone deletion...');
            refreshDNSData();
          }, 2000);
        } else {
          setError(`Zone deletion failed: ${JSON.stringify(responseData)}`);
        }
        break;
        
      default:
        console.log(`Unhandled command: ${command}`);
    }
  };

  useEffect(() => {
    console.log('DNS Component Mounted - Setting up WebSocket listener');
    
    const removeListener = addListener(handleWebSocketMessage);
    
    const timer = setTimeout(() => {
      if (!initialCommandsSent.current && isConnected) {
        console.log('SENDING INITIAL DNS CHECK COMMAND');
        console.log('Command: check_dns_role_installed_windows_ansible');
        
        setLoading(true);
        
        sendCommand('check_dns_role_installed_windows_ansible', { 
          windows_info: windowsInfo 
        });
        
        initialCommandsSent.current = true;
      } else if (!isConnected) {
        console.log('WebSocket not connected');
        setDnsRoleInstalled(false);
        setLoading(false);
        setShowInstallModal(true);
      }
    }, 1000);
    
    return () => {
      clearTimeout(timer);
      if (removeListener) removeListener();
    };
  }, [addListener, sendCommand, isConnected]);

  const fetchDNSDetails = () => {
    if (!isConnected || zonesLoading) {
      setError('Not connected or already loading');
      return;
    }

    setZonesLoading(true);
    setError(null);
    
    console.log('Sending get DNS details command');
    
    sendCommand('get_dns_details_windows_ansible', {
      windows_info: windowsInfo
    });
  };

  const installDNSRole = () => {
    if (installationInProgressRef.current) {
      console.log('Installation already in progress');
      return;
    }

    installationInProgressRef.current = true;
    setInstalling(true);
    setInstallSuccess(false);
    setInstallProgress('Starting DNS role installation...');
    setError(null);
    
    const progressTimeout = setTimeout(() => {
      if (installationInProgressRef.current) {
        setInstallProgress('Installing DNS server role...');
      }
    }, 2000);
    
    console.log('Sending install DNS role command');
    
    sendCommand('install_dns_role_windows_ansible', {
      windows_info: windowsInfo
    });
    
    return () => clearTimeout(progressTimeout);
  };

  const createZone = () => {
    if (!newZoneData.zoneName.trim() || zoneCreationInProgressRef.current) {
      setError('Zone name is required or creation in progress');
      return;
    }

    zoneCreationInProgressRef.current = true;
    setActionLoading(true);
    setError(null);
    
    let command, additionalData;
    
    if (newZoneData.zoneType === 'forward') {
      command = 'create_zone_forward_lookup_zone_dns_windows_ansible';
      additionalData = { zone_name: newZoneData.zoneName };
    } else {
      command = 'create_zone_reverse_lookup_zone_dns_windows_ansible';
      const ipParts = newZoneData.zoneName.split('.').reverse();
      additionalData = { zone_name: `${ipParts.slice(0, 3).join('.')}.in-addr.arpa` };
    }
    
    console.log(`Sending ${command} with payload:`, additionalData);
    
    sendCommand(command, {
      windows_info: windowsInfo,
      ...additionalData
    });
  };

  const createRecord = () => {
    if (!selectedZone || recordCreationInProgressRef.current) {
      setError('Zone not selected or record creation in progress');
      return;
    }

    // Validate required fields based on record type
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

    recordCreationInProgressRef.current = true;
    setActionLoading(true);
    setError(null);
    
    let command, additionalData;
    
    if (newRecordData.recordType === 'A' || newRecordData.recordType === 'CNAME') {
      command = 'create_host_record_forward_lookup_zone_dns_windows_ansible';
      additionalData = {
        zone_name: selectedZone,
        record_ip: newRecordData.recordValue
      };
    } else if (newRecordData.recordType === 'PTR') {
      command = 'create_pointer_record_reverse_lookup_zone_dns_windows_ansible';
      additionalData = {
        zone_name: selectedZone,
        host_ip: newRecordData.recordIp,
        host_name: newRecordData.recordValue
      };
    } else if (newRecordData.recordType === 'MX' || newRecordData.recordType === 'TXT') {
      command = 'create_host_record_forward_lookup_zone_dns_windows_ansible';
      additionalData = {
        zone_name: selectedZone,
        record_ip: newRecordData.recordValue
      };
    } else {
      setError('Unsupported record type');
      setActionLoading(false);
      recordCreationInProgressRef.current = false;
      return;
    }
    
    console.log(`Sending ${command} with payload:`, additionalData);
    
    sendCommand(command, {
      windows_info: windowsInfo,
      ...additionalData
    });
  };

  const deleteZone = (zoneName, zoneType) => {
    if (!window.confirm(`Are you sure you want to delete zone "${zoneName}"? This action cannot be undone.`)) {
      return;
    }

    console.log(`Deleting DNS zone: ${zoneName}`);
    setError(null);
    
    const command = zoneType === 'Reverse' ? 
      'delete_reverse_zone_dns_windows_ansible' : 
      'delete_forward_zone_dns_windows_ansible';
    
    const additionalData = { zone_name: zoneName };
    
    sendCommand(command, {
      windows_info: windowsInfo,
      ...additionalData
    });
  };

  const fetchZoneRecords = (zoneName) => {
    if (!zoneName || !dnsDetails || recordsLoading) return;
    
    setRecordsLoading(true);
    setSelectedZone(zoneName);
    
    console.log(`Fetching records for zone: ${zoneName}`, dnsDetails);
    
    let allRecords = [];
    
    if (dnsDetails.forward_zones) {
      Object.entries(dnsDetails.forward_zones).forEach(([zoneKey, zoneData]) => {
        if (zoneData.name === zoneName || zoneKey === zoneName) {
          console.log(`Found forward zone ${zoneKey}:`, zoneData);
          if (zoneData.records) {
            Object.entries(zoneData.records).forEach(([recordType, recordTypeObj]) => {
              if (recordTypeObj) {
                Object.entries(recordTypeObj).forEach(([recordKey, recordData]) => {
                  allRecords.push({
                    id: `${zoneKey}-${recordType}-${recordKey}`,
                    type: recordType,
                    data: recordData.value || recordData.data || '',
                    ttl: recordData.ttl || '01:00:00',
                    priority: '-'
                  });
                });
              }
            });
          }
        }
      });
    }
    
    if (dnsDetails.reverse_zones) {
      Object.entries(dnsDetails.reverse_zones).forEach(([zoneKey, zoneData]) => {
        if (zoneData.name === zoneName || zoneKey === zoneName) {
          console.log(`Found reverse zone ${zoneKey}:`, zoneData);
          if (zoneData.records) {
            Object.entries(zoneData.records).forEach(([recordType, recordTypeObj]) => {
              if (recordTypeObj) {
                Object.entries(recordTypeObj).forEach(([recordKey, recordData]) => {
                  allRecords.push({
                    id: `${zoneKey}-${recordType}-${recordKey}`,
                    type: recordType,
                    data: recordData.value || recordData.data || '',
                    ttl: recordData.ttl || '01:00:00',
                    priority: '-'
                  });
                });
              }
            });
          }
        }
      });
    }
    
    console.log(`Found ${allRecords.length} records for zone ${zoneName}:`, allRecords);
    setRecords(allRecords);
    setRecordsLoading(false);
  };

  const refreshDNSData = () => {
    if (!isConnected) {
      setError('WebSocket not connected. Cannot refresh.');
      return;
    }

    if (zonesLoading || refreshing) {
      console.log('Refresh already in progress');
      return;
    }

    console.log('Manually refreshing DNS data...');
    setRefreshing(true);
    setError(null);
    hasLoadedZonesRef.current = false;
    
    setZones({ forward: [], reverse: [] });
    setDnsDetails(null);
    setRecords([]);
    
    sendCommand('get_dns_details_windows_ansible', {
      windows_info: windowsInfo
    });
  };

  const formatLastRefreshTime = () => {
    if (!lastRefreshTimeRef.current) return 'Never';
    
    const now = new Date();
    const diffMs = now - lastRefreshTimeRef.current;
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 60) return `${diffSec} seconds ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`;
    return `${Math.floor(diffSec / 3600)} hours ago`;
  };

  useEffect(() => {
    if (selectedZone) {
      fetchZoneRecords(selectedZone);
    }
  }, [selectedZone]);

  const renderDNSRoleStatus = () => {
    if (loading) {
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

    if (dnsRoleInstalled === false) {
      return (
        <div className="dns-not-installed">
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <h3>DNS Server Role Not Installed</h3>
            <p>DNS server role is not installed on this system.</p>
            <p className="windows-info-note">
              Using Windows server: {windowsInfo.ip} with user: {windowsInfo.username}
            </p>
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

    if (dnsRoleInstalled === true && zones.forward.length === 0 && zones.reverse.length === 0) {
      return (
        <div className="dns-installed-no-zones">
          <div className="success-icon">✓</div>
          <div className="success-content">
            <h3>DNS Server Role Installed</h3>
            <p>DNS server is ready. Load zones to start managing.</p>
            <p className="windows-info-note">
              Connected to Windows server: {windowsInfo.ip}
            </p>
            <button 
              className="btn-fetch-details"
              onClick={fetchDNSDetails}
              disabled={zonesLoading}
            >
              {zonesLoading ? 'Loading Zones...' : 'Load DNS Zones'}
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderZoneList = (zoneList, zoneType) => {
    const zonesToShow = zoneType === 'forward' ? zones.forward : zones.reverse;
    const title = zoneType === 'forward' ? 'Forward Lookup Zones' : 'Reverse Lookup Zones';

    if (zonesLoading && zonesToShow.length === 0) {
      return (
        <div className="loading-container">
          <div className="spinner"></div>
          <span>Loading {title.toLowerCase()}... (Please wait)</span>
        </div>
      );
    }

    if (zonesToShow.length === 0 && dnsRoleInstalled === true) {
      return (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3>No {title}</h3>
          <p>There are no {title.toLowerCase()} configured yet.</p>
          <button 
            className="btn-create-zone"
            onClick={() => {
              setNewZoneData(prev => ({ ...prev, zoneType }));
              setShowCreateZoneModal(true);
            }}
            disabled={actionLoading || zonesLoading}
          >
            Create {zoneType === 'forward' ? 'Forward' : 'Reverse'} Zone
          </button>
        </div>
      );
    }

    return (
      <div className="zones-container">
        <div className="zones-header">
          <h3>{title} ({zonesToShow.length})</h3>
          <div className="header-actions">
            <button 
              className="btn-create-zone"
              onClick={() => {
                setNewZoneData(prev => ({ ...prev, zoneType }));
                setShowCreateZoneModal(true);
              }}
              disabled={actionLoading || zonesLoading}
            >
              + Create New {zoneType === 'forward' ? 'Forward' : 'Reverse'} Zone
            </button>
          </div>
        </div>
        
        <div className="zones-table-container">
          <table className="zones-table">
            <thead>
              <tr>
                <th>Zone Name</th>
                <th>Type</th>
                <th>Dynamic Update</th>
                <th>Records</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {zonesToShow.map((zone) => (
                <tr 
                  key={zone.id}
                  className={selectedZone === zone.name ? 'selected' : ''}
                  onClick={() => {
                    setSelectedZone(zone.name);
                    if (activeTab === 'records') {
                      fetchZoneRecords(zone.name);
                    }
                  }}
                >
                  <td className="zone-name">
                    <strong>{zone.name}</strong>
                  </td>
                  <td>
                    <span className={`zone-type ${zone.type?.toLowerCase()}`}>
                      {zone.type}
                    </span>
                  </td>
                  <td>
                    <span className="dynamic-update">
                      {zone.dynamicUpdate}
                    </span>
                  </td>
                  <td>{zone.recordCount || 0}</td>
                  <td className="actions">
                    <button 
                      className="btn-view"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedZone(zone.name);
                        setActiveTab('records');
                      }}
                      disabled={actionLoading}
                    >
                      View Records
                    </button>
                    <button 
                      className="btn-add-record"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedZone(zone.name);
                        setNewRecordData(prev => ({ 
                          ...prev, 
                          recordType: zoneType === 'forward' ? 'A' : 'PTR'
                        }));
                        setShowCreateRecordModal(true);
                      }}
                      disabled={actionLoading}
                    >
                      Add Record
                    </button>
                    <button 
                      className="btn-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteZone(zone.name, zone.type);
                      }}
                      disabled={actionLoading}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderDNSRecords = () => {
    if (!selectedZone) {
      return (
        <div className="no-zone-selected">
          <div className="info-icon">ℹ️</div>
          <h3>Select a DNS Zone</h3>
          <p>Select a zone from the list to view its DNS records.</p>
        </div>
      );
    }

    if (recordsLoading) {
      return (
        <div className="loading-container">
          <div className="spinner"></div>
          <span>Loading DNS records for {selectedZone}...</span>
        </div>
      );
    }

    if (records.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <h3>No DNS Records Found</h3>
          <p>No DNS records found for zone "{selectedZone}".</p>
          <button 
            className="btn-add-record"
            onClick={() => setShowCreateRecordModal(true)}
            disabled={actionLoading}
          >
            + Add DNS Record
          </button>
          <button 
            className="btn-back"
            onClick={() => setActiveTab('forward-zones')}
            disabled={actionLoading}
          >
            ← Back to Zones
          </button>
        </div>
      );
    }

    return (
      <div className="records-container">
        <div className="records-header">
          <h3>DNS Records for {selectedZone}</h3>
          <div className="header-actions">
            <button 
              className="btn-add-record"
              onClick={() => setShowCreateRecordModal(true)}
              disabled={actionLoading}
            >
              + Add Record
            </button>
            <button 
              className="btn-back"
              onClick={() => setActiveTab('forward-zones')}
              disabled={actionLoading}
            >
              ← Back to Zones
            </button>
          </div>
        </div>
        
        <div className="records-table-container">
          <table className="records-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Data/Value</th>
                <th>TTL</th>
                <th>Priority</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>
                    <span className={`record-type ${record.type}`}>
                      {record.type}
                    </span>
                  </td>
                  <td className="record-data">{record.data}</td>
                  <td>{record.ttl}</td>
                  <td>{record.priority || '-'}</td>
                  <td className="actions">
                    <button className="btn-edit" disabled={actionLoading}>Edit</button>
                    <button className="btn-delete" disabled={actionLoading}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
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
              disabled={actionLoading || installing}
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
              <button 
                className="btn-refresh-main"
                onClick={refreshDNSData}
                disabled={zonesLoading || refreshing || !dnsRoleInstalled || !isConnected}
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
              {lastRefreshTimeRef.current && (
                <div className="last-refresh-time">
                  Last refreshed: {formatLastRefreshTime()}
                </div>
              )}
            </div>
          </div>
          <div className="connection-status-small">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
            WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
            <span className="windows-info">
              | Windows Server: {windowsInfo.ip}
            </span>
          </div>
        </div>

        {renderDNSRoleStatus()}

        {dnsRoleInstalled === true && zones.forward.length + zones.reverse.length > 0 && (
          <div className="dns-content">
            <div className="tabs-navigation">
              <button
                className={`tab-btn ${activeTab === 'forward-zones' ? 'active' : ''}`}
                onClick={() => setActiveTab('forward-zones')}
                disabled={actionLoading}
              >
                Forward Lookup Zones
              </button>
              <button
                className={`tab-btn ${activeTab === 'reverse-zones' ? 'active' : ''}`}
                onClick={() => setActiveTab('reverse-zones')}
                disabled={actionLoading}
              >
                Reverse Lookup Zones
              </button>
              <button
                className={`tab-btn ${activeTab === 'records' ? 'active' : ''}`}
                onClick={() => setActiveTab('records')}
                disabled={!selectedZone || actionLoading}
              >
                DNS Records
              </button>
              <button
                className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
                disabled={actionLoading}
              >
                DNS Settings
              </button>
            </div>

            <div className="tab-content">
              {activeTab === 'forward-zones' && renderZoneList(zones.forward, 'forward')}
              {activeTab === 'reverse-zones' && renderZoneList(zones.reverse, 'reverse')}
              {activeTab === 'records' && renderDNSRecords()}
              {activeTab === 'settings' && (
                <div className="settings-container">
                  <h3>DNS Server Settings</h3>
                  <div className="windows-info-box">
                    <h4>Windows Server Connection</h4>
                    <div className="windows-info-details">
                      <p><strong>IP Address:</strong> {windowsInfo.ip}</p>
                      <p><strong>Username:</strong> {windowsInfo.username}</p>
                    </div>
                  </div>
                  {dnsDetails && (
                    <div className="dns-details">
                      <div className="detail-row">
                        <span className="detail-label">DNS Server Status:</span>
                        <span className="detail-value">Running</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Forward Zones:</span>
                        <span className="detail-value">{zones.forward.length}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Reverse Zones:</span>
                        <span className="detail-value">{zones.reverse.length}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Total Records:</span>
                        <span className="detail-value">
                          {zones.forward.reduce((sum, zone) => sum + (zone.recordCount || 0), 0) +
                           zones.reverse.reduce((sum, zone) => sum + (zone.recordCount || 0), 0)}
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
                      disabled={zonesLoading || actionLoading || refreshing}
                    >
                      {refreshing ? 'Refreshing...' : 'Refresh DNS Data'}
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
            <button className="btn-close-error" onClick={() => setError(null)} disabled={actionLoading}>
              ×
            </button>
          </div>
        )}

        {successMessage && (
          <div className="success-message">
            <div className="success-icon">✓</div>
            <div className="success-text">{successMessage}</div>
            <button className="btn-close-success" onClick={() => setSuccessMessage(null)} disabled={actionLoading}>
              ×
            </button>
          </div>
        )}
      </div>

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
                    <p>Installing on Windows server: <strong>{windowsInfo.ip}</strong></p>
                    <p>Using account: <strong>{windowsInfo.username}</strong></p>
                  </div>
                </div>
              ) : installSuccess ? (
                <div className="installation-success">
                  <div className="success-icon">✓</div>
                  <h3>Installation Complete!</h3>
                  <p>DNS server role has been successfully installed on {windowsInfo.ip}.</p>
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
                      <li>This will install Windows DNS Server role via Ansible</li>
                      <li>System restart may be required</li>
                      <li>Ensure you have administrator privileges</li>
                      <li>Installation may take several minutes (NO TIMEOUT)</li>
                      <li>The role will be permanently installed</li>
                      <li>DNS details will be loaded automatically after installation</li>
                    </ul>
                  </div>
                  
                  <div className="connection-info">
                    <h4>Connection Details</h4>
                    <div className="windows-connection-details">
                      <p><strong>Target Server:</strong> {windowsInfo.ip}</p>
                      <p><strong>Username:</strong> {windowsInfo.username}</p>
                      <p><strong>Authentication:</strong> Password-based</p>
                    </div>
                  </div>
                  
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
                      disabled={installing}
                    >
                      Begin Installation
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
                disabled={actionLoading}
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="form-group">
                <label>Zone Type</label>
                <div className="zone-type-selector">
                  <button
                    className={`zone-type-btn ${newZoneData.zoneType === 'forward' ? 'active' : ''}`}
                    onClick={() => setNewZoneData({...newZoneData, zoneType: 'forward'})}
                    disabled={actionLoading}
                  >
                    Forward Lookup Zone
                  </button>
                  <button
                    className={`zone-type-btn ${newZoneData.zoneType === 'reverse' ? 'active' : ''}`}
                    onClick={() => setNewZoneData({...newZoneData, zoneType: 'reverse'})}
                    disabled={actionLoading}
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
                  disabled={actionLoading}
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
                  disabled={actionLoading}
                >
                  <option value="Secure">Secure only</option>
                  <option value="NonSecure">Nonsecure and secure</option>
                  <option value="None">None</option>
                </select>
              </div>
              
              <div className="zone-preview">
                <h4>Zone Preview</h4>
                <div className="preview-content">
                  <p><strong>Type:</strong> {newZoneData.zoneType === 'forward' ? 'Forward Lookup' : 'Reverse Lookup'}</p>
                  <p><strong>Name:</strong> {newZoneData.zoneName || 'Not specified'}</p>
                  {newZoneData.zoneType === 'reverse' && newZoneData.zoneName && (
                    <p><strong>Reverse Format:</strong> {newZoneData.zoneName.split('.').reverse().slice(0, 3).join('.')}.in-addr.arpa</p>
                  )}
                  <p><strong>Dynamic Updates:</strong> {newZoneData.dynamicUpdate}</p>
                  <p><strong>Target Server:</strong> {windowsInfo.ip}</p>
                </div>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="btn-cancel"
                  onClick={() => setShowCreateZoneModal(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button 
                  className="btn-create"
                  onClick={createZone}
                  disabled={actionLoading || !newZoneData.zoneName}
                >
                  {actionLoading ? 'Creating Zone...' : 'Create Zone'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateRecordModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Create DNS Record in {selectedZone}</h2>
              <button 
                className="btn-close-modal"
                onClick={() => setShowCreateRecordModal(false)}
                disabled={actionLoading}
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="form-group">
                <label>Record Type</label>
                <select 
                  className="form-control"
                  value={newRecordData.recordType}
                  onChange={(e) => setNewRecordData({...newRecordData, recordType: e.target.value})}
                  disabled={actionLoading}
                >
                  <option value="A">A (Host) Record</option>
                  <option value="CNAME">CNAME (Alias) Record</option>
                  <option value="PTR">PTR (Pointer) Record</option>
                  <option value="MX">MX (Mail Exchange) Record</option>
                  <option value="TXT">TXT (Text) Record</option>
                </select>
              </div>
              
              {(newRecordData.recordType === 'A' || newRecordData.recordType === 'CNAME') && (
                <div className="form-group">
                  <label>
                    {newRecordData.recordType === 'A' ? 'IP Address *' : 'Target Host *'}
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={newRecordData.recordType === 'A' ? '192.168.1.10' : 'server1.example.com'}
                    value={newRecordData.recordValue}
                    onChange={(e) => setNewRecordData({...newRecordData, recordValue: e.target.value})}
                    disabled={actionLoading}
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
                      disabled={actionLoading}
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
                      disabled={actionLoading}
                    />
                  </div>
                </>
              )}
              
              {newRecordData.recordType === 'MX' && (
                <div className="form-group">
                  <label>Mail Server *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="10 mail.example.com"
                    value={newRecordData.recordValue}
                    onChange={(e) => setNewRecordData({...newRecordData, recordValue: e.target.value})}
                    disabled={actionLoading}
                  />
                </div>
              )}
              
              {newRecordData.recordType === 'TXT' && (
                <div className="form-group">
                  <label>Text Value *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="v=spf1 mx ~all"
                    value={newRecordData.recordValue}
                    onChange={(e) => setNewRecordData({...newRecordData, recordValue: e.target.value})}
                    disabled={actionLoading}
                  />
                </div>
              )}
              
              <div className="form-group">
                <label>TTL (Time To Live)</label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="3600"
                  value={newRecordData.ttl}
                  onChange={(e) => setNewRecordData({...newRecordData, ttl: parseInt(e.target.value) || 3600})}
                  disabled={actionLoading}
                />
              </div>
              
              <div className="server-info">
                <h4>Target Server</h4>
                <p>This record will be created on Windows server: <strong>{windowsInfo.ip}</strong></p>
                <p>Zone: <strong>{selectedZone}</strong></p>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="btn-cancel"
                  onClick={() => setShowCreateRecordModal(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button 
                  className="btn-create"
                  onClick={createRecord}
                  disabled={actionLoading || 
                    (newRecordData.recordType === 'PTR' ? (!newRecordData.recordIp || !newRecordData.recordValue) : !newRecordData.recordValue)}
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