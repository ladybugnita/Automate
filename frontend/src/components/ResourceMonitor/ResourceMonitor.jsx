import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './ResourceMonitor.css';
import { useWebSocket } from '../../context/WebSocketContext';

function ResourceMonitor() {
  const { sendCommand, isConnected, addListener } = useWebSocket();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false); 
  const [activeSection, setActiveSection] = useState('overview');
  
  const [markedMachines, setMarkedMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [showMarkModal, setShowMarkModal] = useState(false);
  
  const [resourceData, setResourceData] = useState({});
  const [summaryData, setSummaryData] = useState({});
  const [selectedMachine, setSelectedMachine] = useState('');
  const [showSelectMessage, setShowSelectMessage] = useState(true);
  
  const autoRefreshInterval = useRef(null);
  const mountedRef = useRef(true);
  const isFetchingRef = useRef(false);
  const timeoutRef = useRef(null);
  const machineInfoListenerRef = useRef(false);
  const fetchInProgressRef = useRef(false);

  const topNavSections = [
    { id: 'overview', label: 'Overview' },
    { id: 'cpu', label: 'CPU' },
    { id: 'memory', label: 'Memory' },
    { id: 'disk', label: 'Disk' },
    { id: 'network', label: 'Network' }
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

  const getWindowsInfoForMachine = useCallback((machine) => {
    if (!machine) {
      console.error('ResourceMonitor: No machine provided to getWindowsInfoForMachine');
      return null;
    }
    
    console.log(`ResourceMonitor: Getting Windows info for machine: ${machine.name || 'Unknown'} (${machine.ip})`);
    
    const password = machine.password || machine.password_provided || '';
    
    console.log(`ResourceMonitor: Password for machine ${machine.name || machine.ip}:`, password ? '***HIDDEN***' : 'NOT FOUND');
    
    if (!password) {
      console.error('ResourceMonitor: No password found for machine:', machine.name || machine.ip);
      setError(`No password found for machine: ${machine.name || machine.ip}. Please check machine credentials in Machine Management.`);
      return null;
    }
    
    return {
      ip: machine.ip,
      username: machine.username || machine.username_provided || 'admin',
      password: password
    };
  }, []);

  const createResourcePayloadForSingleMachine = useCallback((machine) => {
    if (!machine) {
      console.error('ResourceMonitor: No machine selected');
      setError('No machine selected');
      return null;
    }
    
    const windowsInfo = getWindowsInfoForMachine(machine);
    if (!windowsInfo) {
      return null;
    }
    
    console.log(`ResourceMonitor: Creating payload for single machine: ${machine.name || 'Unknown'} (${machine.ip})`);
    
    return {
      windows_info: windowsInfo
    };
  }, [getWindowsInfoForMachine]);

  const createResourcePayloadForAllMachines = useCallback((machines) => {
    if (!machines || machines.length === 0) {
      console.error('ResourceMonitor: No marked machines found');
      setError('No marked machines found. Please mark machines as DNS, DHCP, or AD in Machine Management first.');
      return null;
    }
    
    const windowsInfos = [];
    
    machines.forEach(machine => {
      const windowsInfo = getWindowsInfoForMachine(machine);
      if (windowsInfo) {
        windowsInfos.push(windowsInfo);
      } else {
        console.error(`ResourceMonitor: Failed to get Windows info for machine: ${machine.name || 'Unknown'} (${machine.ip})`);
      }
    });
    
    if (windowsInfos.length === 0) {
      console.error('ResourceMonitor: Failed to get Windows info for any marked machine');
      setError('Failed to get credentials for marked machines. Please check that all marked machines have valid credentials in Machine Management.');
      return null;
    }
    
    console.log(`ResourceMonitor: Creating payload for ${windowsInfos.length} machine(s)`);
    
    return {
      windows_infos: windowsInfos
    };
  }, [getWindowsInfoForMachine]);

  const parseAndSummarizeResourceData = useCallback((resourceData, machineIp) => {
    console.log('ResourceMonitor: Parsing and summarizing resource data:', resourceData);
    
    try {
      if (!resourceData || typeof resourceData !== 'object') {
        console.error('ResourceMonitor: Invalid resource data format');
        return { summary: null, raw: null };
      }
      
      const rawData = resourceData;
      
      let summary = {
        cpu: { percent: 0, cores: 0, processors: 0 },
        memory: { used_gb: 0, total_gb: 0, percent: 0, free_gb: 0 },
        disk: { used_gb: 0, total_gb: 0, percent: 0, free_gb: 0 },
        network: { upload: 0, download: 0, connections: 0 },
        processes: []
      };
      
      if (resourceData.cpu && resourceData.cpu.summary) {
        const cpuSummary = resourceData.cpu.summary;
        const cpuKeys = Object.keys(cpuSummary);
        
        if (cpuKeys.length > 0) {
          const totalLoad = cpuKeys.reduce((sum, key) => sum + (cpuSummary[key].load_percentage || 0), 0);
          const avgLoad = totalLoad / cpuKeys.length;
          
          const totalCores = cpuKeys.reduce((sum, key) => sum + (cpuSummary[key].cores || 0), 0);
          const totalProcessors = cpuKeys.reduce((sum, key) => sum + (cpuSummary[key].logical_processors || 0), 0);
          
          summary.cpu = {
            percent: avgLoad,
            cores: totalCores,
            processors: totalProcessors,
            details: cpuSummary
          };
        }
      }
      
      if (resourceData.memory && resourceData.memory.summary) {
        const memorySummary = resourceData.memory.summary;
        summary.memory = {
          used_gb: memorySummary.used_gb || 0,
          total_gb: memorySummary.total_gb || 0,
          percent: memorySummary.usage_percent || 0,
          free_gb: memorySummary.free_gb || 0
        };
      }
      
      if (resourceData.disks && resourceData.disks.summary) {
        const disks = resourceData.disks.summary;
        const diskKeys = Object.keys(disks);
        
        if (diskKeys.length > 0) {
          let totalUsed = 0;
          let totalTotal = 0;
          
          diskKeys.forEach(key => {
            const disk = disks[key];
            totalUsed += disk.used_gb || 0;
            totalTotal += disk.total_gb || 0;
          });
          
          const totalFree = totalTotal - totalUsed;
          const percent = totalTotal > 0 ? (totalUsed / totalTotal) * 100 : 0;
          
          summary.disk = {
            used_gb: totalUsed,
            total_gb: totalTotal,
            percent: percent,
            free_gb: totalFree,
            details: disks
          };
        }
      }
      
      if (resourceData.network && resourceData.network.summary) {
        const networkSummary = resourceData.network.summary;
        const networkKeys = Object.keys(networkSummary);
        
        if (networkKeys.length > 0) {
          let totalUpload = 0;
          let totalDownload = 0;
          
          networkKeys.forEach(key => {
            const adapter = networkSummary[key];
            totalUpload += adapter.bytes_sent || 0;
            totalDownload += adapter.bytes_received || 0;
          });
          
          summary.network = {
            upload: totalUpload,
            download: totalDownload,
            connections: networkKeys.length,
            details: networkSummary
          };
        }
      }
      
      let allProcesses = [];
      
      if (resourceData.cpu && resourceData.cpu.processes) {
        const cpuProcesses = Object.values(resourceData.cpu.processes);
        cpuProcesses.forEach(proc => {
          const existing = allProcesses.find(p => p.pid === proc.pid);
          if (existing) {
            existing.cpu_percent = proc.cpu_percent || 0;
            existing.thread_count = proc.thread_count || 0;
          } else {
            allProcesses.push({
              name: proc.name || 'Unknown',
              pid: proc.pid || 0,
              cpu_percent: proc.cpu_percent || 0,
              thread_count: proc.thread_count || 0,
              memory_mb: 0,
              private_memory_mb: 0,
              working_set_mb: 0
            });
          }
        });
      }
      
      if (resourceData.memory && resourceData.memory.processes) {
        const memoryProcesses = Object.values(resourceData.memory.processes);
        memoryProcesses.forEach(proc => {
          const existing = allProcesses.find(p => p.pid === proc.pid);
          if (existing) {
            existing.memory_mb = proc.working_set_mb || proc.private_memory_mb || 0;
            existing.private_memory_mb = proc.private_memory_mb || 0;
            existing.working_set_mb = proc.working_set_mb || 0;
          } else {
            allProcesses.push({
              name: proc.name || 'Unknown',
              pid: proc.pid || 0,
              cpu_percent: 0,
              thread_count: 0,
              memory_mb: proc.working_set_mb || proc.private_memory_mb || 0,
              private_memory_mb: proc.private_memory_mb || 0,
              working_set_mb: proc.working_set_mb || 0
            });
          }
        });
      }
      
      allProcesses.sort((a, b) => {
        if (b.cpu_percent !== a.cpu_percent) {
          return b.cpu_percent - a.cpu_percent;
        }
        return (b.memory_mb || 0) - (a.memory_mb || 0);
      });
      
      summary.processes = allProcesses.slice(0, 20);
      
      if (resourceData.metadata) {
        summary.metadata = resourceData.metadata;
      }
      
      return {
        summary: summary,
        raw: rawData
      };
      
    } catch (err) {
      console.error('ResourceMonitor: Error parsing resource data:', err);
      return { summary: null, raw: null };
    }
  }, []);

  const fetchResourceDataForSingleMachine = useCallback((machine) => {
    if (isFetchingRef.current || !mountedRef.current) {
      console.log('ResourceMonitor: Already fetching resource data or component unmounted, skipping...');
      return;
    }

    if (!isConnected) {
      console.log('ResourceMonitor: WebSocket not connected');
      setError('Not connected to backend system');
      setLoading(false);
      return;
    }

    console.log(`ResourceMonitor: Fetching resource data for single machine: ${machine.name || 'Unknown'} (${machine.ip})`);
    setLoading(true);
    setError(null);
    setShowSelectMessage(false);
    isFetchingRef.current = true;
    
    const payload = createResourcePayloadForSingleMachine(machine);
    if (!payload) {
      setLoading(false);
      isFetchingRef.current = false;
      return;
    }
    
    console.log('ResourceMonitor: Sending payload (credentials only):', {
      ...payload,
      windows_info: { ...payload.windows_info, password: '***HIDDEN***' }
    });
    
    sendCommand('get_resource_monitor_data_windows_ansible', payload);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      if (isFetchingRef.current && mountedRef.current) {
        console.log('ResourceMonitor: Timeout: No response from backend for resource data');
        setError('Timeout: No response from server');
        setLoading(false);
        isFetchingRef.current = false;
        timeoutRef.current = null;
      }
    }, 30000);
  }, [isConnected, sendCommand, createResourcePayloadForSingleMachine]);

  const fetchResourceDataForAllMachines = useCallback((machines) => {
    if (isFetchingRef.current || !mountedRef.current) {
      console.log('ResourceMonitor: Already fetching resource data or component unmounted, skipping...');
      return;
    }

    if (!isConnected) {
      console.log('ResourceMonitor: WebSocket not connected');
      setError('Not connected to backend system');
      setLoading(false);
      return;
    }

    const machinesToUse = machines || markedMachines;
    
    if (!machinesToUse || machinesToUse.length === 0) {
      console.log('ResourceMonitor: No marked machines found');
      setError('No marked machines found. Please mark machines as DNS, DHCP, or AD in Machine Management first.');
      setLoading(false);
      return;
    }

    console.log(`ResourceMonitor: Fetching resource data for ${machinesToUse.length} marked machine(s)...`);
    setLoading(true);
    setError(null);
    setShowSelectMessage(false);
    isFetchingRef.current = true;
    
    const payload = createResourcePayloadForAllMachines(machinesToUse);
    if (!payload) {
      setLoading(false);
      isFetchingRef.current = false;
      return;
    }
    
    console.log('ResourceMonitor: Sending payload (credentials only):', {
      ...payload,
      windows_infos: payload.windows_infos.map(info => ({ ...info, password: '***HIDDEN***' }))
    });
    
    sendCommand('get_resource_monitor_data_windows_ansible', payload);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      if (isFetchingRef.current && mountedRef.current) {
        console.log('ResourceMonitor: Timeout: No response from backend for resource data');
        setError('Timeout: No response from server');
        setLoading(false);
        isFetchingRef.current = false;
        timeoutRef.current = null;
      }
    }, 30000);
  }, [isConnected, markedMachines, sendCommand, createResourcePayloadForAllMachines]);

  const processMachineInfo = useCallback((machines) => {
    if (!mountedRef.current) return;
    
    console.log('ResourceMonitor: Processing ALL machines info via WebSocket:', machines);
    
    if (!machines) {
      console.error('ResourceMonitor: No machine data received');
      setError('No machine data received from server');
      setMachinesLoading(false);
      return;
    }
    
    let machinesArray = [];
    if (Array.isArray(machines)) {
      machinesArray = machines;
    } else if (machines.machines && Array.isArray(machines.machines)) {
      machinesArray = machines.machines;
    } else if (machines.data && Array.isArray(machines.data)) {
      machinesArray = machines.data;
    } else if (typeof machines === 'object') {
      machinesArray = Object.values(machines).filter(item => 
        item && typeof item === 'object' && item.ip
      );
    }
    
    console.log('ResourceMonitor: Processed machines array:', machinesArray);

    const markedMachinesList = machinesArray.filter(machine => {
      return machine.marked_as && 
             Array.isArray(machine.marked_as) && 
             machine.marked_as.length > 0;
    });

    console.log(`ResourceMonitor: Found ${markedMachinesList.length} marked machines via WebSocket:`, markedMachinesList);
    setMarkedMachines(markedMachinesList);
    
    setMachinesLoading(false);
    
    if (markedMachinesList.length > 0) {
      setShowSelectMessage(true);
    } else {
      setShowMarkModal(true);
    }
    
    fetchInProgressRef.current = false;
  }, []);

  const fetchMachineInfo = useCallback(async () => {
    if (fetchInProgressRef.current || !mountedRef.current) {
      console.log('ResourceMonitor: Fetch already in progress or component unmounted');
      return;
    }
    
    fetchInProgressRef.current = true;
    console.log('ResourceMonitor: Fetching machines from Node.js REST API...');
    console.log('API Base URL:', API_BASE_URL);
    setMachinesLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      console.log('ResourceMonitor: Trying to fetch machines WITH passwords...');
      
      const response = await fetch(`${API_BASE_URL}/api/machines/get-machines?include_password=true`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.log('ResourceMonitor: Endpoint with password parameter failed, trying without parameter...');
        
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
        console.log('ResourceMonitor: Received machines from /api/machines/get-machines:', data);
        await processMachineData(data);
        return;
      }
      
      const data = await response.json();
      console.log('ResourceMonitor: Received machines from /api/machines/get-machines?include_password=true:', data);
      await processMachineData(data);
      
    } catch (err) {
      console.error('ResourceMonitor: REST API failed:', err);
      if (mountedRef.current) {
        setError(`Failed to fetch machines: ${err.message}. Please check if machines are properly configured.`);
        setMachinesLoading(false);
      }
      
      if (mountedRef.current && isConnected) {
        console.log('ResourceMonitor: Falling back to WebSocket for get_machine_info');
        sendCommand('get_machine_info', {});
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
      
      console.log('ResourceMonitor: Total machines found:', machines.length);
      
      if (machines.length > 0) {
        console.log('ResourceMonitor: First machine sample:', {
          id: machines[0].id,
          name: machines[0].name,
          ip: machines[0].ip,
          hasPassword: !!(machines[0].password || machines[0].password_provided),
          hasUsername: !!(machines[0].username || machines[0].username_provided),
          marked_as: machines[0].marked_as
        });
      }
      
      const markedMachinesList = machines.filter(machine => {
        const hasMarks = machine.marked_as && 
                       Array.isArray(machine.marked_as) && 
                       machine.marked_as.length > 0;
        
        if (hasMarks) {
          console.log(`ResourceMonitor: Found marked machine: ${machine.name || 'Unknown'} (${machine.ip})`, {
            id: machine.id,
            hasPassword: !!(machine.password || machine.password_provided),
            hasUsername: !!(machine.username || machine.username_provided),
            marks: machine.marked_as
          });
        }
        
        return hasMarks;
      });
      
      console.log(`ResourceMonitor: Found ${markedMachinesList.length} marked machines:`, markedMachinesList);
      
      const machinesWithPasswords = markedMachinesList.filter(machine => {
        const hasPassword = machine.password || machine.password_provided;
        if (!hasPassword) {
          console.warn(`ResourceMonitor: Machine ${machine.name || 'Unknown'} (${machine.ip}) has no password`);
        }
        return hasPassword;
      });
      
      if (markedMachinesList.length === 0) {
        console.log('ResourceMonitor: No marked machines found');
        setShowMarkModal(true);
      } else if (machinesWithPasswords.length === 0) {
        console.error('ResourceMonitor: No marked machines have passwords');
        setError('Marked machines found but no passwords available. Please check machine credentials in Machine Management.');
        setShowMarkModal(true);
      } else {
        setShowSelectMessage(true);
      }
      
      setMarkedMachines(markedMachinesList);
      setMachinesLoading(false);
    }
  }, [API_BASE_URL, isConnected, sendCommand]);

  const handleWebSocketMessage = useCallback((data) => {
    if (!mountedRef.current) return;
    
    console.log('ResourceMonitor WebSocket message:', data);
    
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
    
    console.log(`ResourceMonitor: Processing response for command: ${command}`, { result, error });
    
    if (error) {
      console.log(`ResourceMonitor: Error from backend for command ${command}:`, error);
      setError(`Error: ${error}`);
      setLoading(false);
      setMachinesLoading(false);
      isFetchingRef.current = false;
      return;
    }
    
    const responseData = extractResult(result);
    console.log('ResourceMonitor: Extracted response data:', responseData);
    
    switch(command) {
      case 'get_machine_info':
        console.log('ResourceMonitor: Received machine info via WebSocket fallback');
        if (responseData && responseData.machines && responseData.machines.length > 0) {
          processMachineInfo(responseData);
        } else {
          console.log('ResourceMonitor: No machines found via WebSocket');
          setMarkedMachines([]);
          setMachinesLoading(false);
          setShowMarkModal(true);
        }
        break;
        
      case 'get_resource_monitor_data_windows_ansible':
        console.log('ResourceMonitor: Processing resource monitor data (new format)');
        isFetchingRef.current = false;
        
        let resourceDataResult = null;
        
        if (responseData && responseData.result) {
          resourceDataResult = responseData.result;
        } else if (responseData) {
          resourceDataResult = responseData;
        }
        
        if (resourceDataResult) {
          console.log('ResourceMonitor: Loaded resource monitor data (new format):', resourceDataResult);
          
          try {
            if (resourceDataResult.cpu || resourceDataResult.memory || resourceDataResult.disks) {
              const machineIp = selectedMachine || (markedMachines.length > 0 ? markedMachines[0].ip : '');
              
              if (machineIp) {
                const parsedData = parseAndSummarizeResourceData(resourceDataResult, machineIp);
                
                if (parsedData.summary && parsedData.raw) {
                  setResourceData(prev => ({
                    ...prev,
                    [machineIp]: parsedData.raw
                  }));
                  
                  setSummaryData(prev => ({
                    ...prev,
                    [machineIp]: parsedData.summary
                  }));
                  
                  console.log('ResourceMonitor: Updated resource data for machine:', machineIp);
                  console.log('ResourceMonitor: Summary data:', parsedData.summary);
                  
                  setLoading(false);
                  setLastUpdated(new Date());
                } else {
                  console.log('ResourceMonitor: Failed to parse resource data');
                  setError('Failed to parse resource data from backend');
                  setLoading(false);
                }
              }
            } else {
              console.log('ResourceMonitor: No valid resource data structure found in response');
              setError('Received response but no valid resource data found');
              setLoading(false);
            }
            
          } catch (err) {
            console.error('ResourceMonitor: Error processing resource data:', err);
            setError('Failed to process backend response');
            setLoading(false);
          }
        } else {
          console.log('ResourceMonitor: No resource data found in response');
          setResourceData({});
          setSummaryData({});
          setLoading(false);
        }
        
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        break;
        
      default:
        console.log(`ResourceMonitor: Unhandled command: ${command}`);
    }
  }, [processMachineInfo, parseAndSummarizeResourceData, selectedMachine, markedMachines]);

  const handleMachineSelect = useCallback((machineIp) => {
    setSelectedMachine(machineIp);
    
    if (machineIp) {
      const machine = markedMachines.find(m => m.ip === machineIp);
      if (machine) {
        fetchResourceDataForSingleMachine(machine);
      }
    } else {
      setShowSelectMessage(true);
      setResourceData({});
      setSummaryData({});
      setLoading(false);
    }
  }, [markedMachines, fetchResourceDataForSingleMachine]);

  const handleManualRefresh = useCallback((machineIp = null) => {
    if (!isConnected) {
      alert('Cannot refresh: Not connected to backend system');
      return;
    }
    
    if (markedMachines.length === 0) {
      alert('No marked machines found. Please mark machines first.');
      return;
    }
    
    if (isFetchingRef.current) {
      console.log('Already refreshing, please wait...');
      return;
    }
    
    if (machineIp) {
      const machine = markedMachines.find(m => m.ip === machineIp);
      if (machine) {
        fetchResourceDataForSingleMachine(machine);
      }
    } else {
      fetchResourceDataForAllMachines();
    }
  }, [isConnected, markedMachines, fetchResourceDataForAllMachines, fetchResourceDataForSingleMachine]);

  const handleRefreshMachines = useCallback(() => {
    fetchMachineInfo();
  }, [fetchMachineInfo]);

  const handleAutoRefreshToggle = () => {
    const newAutoRefresh = !autoRefresh;
    setAutoRefresh(newAutoRefresh);
    
    if (newAutoRefresh && isConnected && markedMachines.length > 0 && selectedMachine) {
      const machine = markedMachines.find(m => m.ip === selectedMachine);
      if (machine) {
        fetchResourceDataForSingleMachine(machine);
      }
    }
  };

  useEffect(() => {
    console.log('ResourceMonitor Component Mounted');
    mountedRef.current = true;
    
    fetchMachineInfo();
    
    return () => {
      console.log('ResourceMonitor Component Unmounting');
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (autoRefreshInterval.current) {
        clearInterval(autoRefreshInterval.current);
        autoRefreshInterval.current = null;
      }
      isFetchingRef.current = false;
      fetchInProgressRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (autoRefresh && selectedMachine && mountedRef.current) {
      autoRefreshInterval.current = setInterval(() => {
        if (!isFetchingRef.current && mountedRef.current && selectedMachine) {
          const machine = markedMachines.find(m => m.ip === selectedMachine);
          if (machine) {
            fetchResourceDataForSingleMachine(machine);
          }
        }
      }, 5000);
    } else if (autoRefreshInterval.current) {
      clearInterval(autoRefreshInterval.current);
      autoRefreshInterval.current = null;
    }
    
    return () => {
      if (autoRefreshInterval.current) {
        clearInterval(autoRefreshInterval.current);
        autoRefreshInterval.current = null;
      }
    };
  }, [autoRefresh, selectedMachine, markedMachines, fetchResourceDataForSingleMachine]);

  useEffect(() => {
    if (!machineInfoListenerRef.current && mountedRef.current) {
      console.log('ResourceMonitor: Setting up WebSocket listener');
      const removeListener = addListener(handleWebSocketMessage);
      machineInfoListenerRef.current = true;
      
      return () => {
        if (removeListener) {
          removeListener();
        }
        machineInfoListenerRef.current = false;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }
  }, [addListener, handleWebSocketMessage]);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatMemoryMB = (mb) => {
    if (mb < 1024) {
      return mb.toFixed(2) + ' MB';
    } else {
      return (mb / 1024).toFixed(2) + ' GB';
    }
  };

  const getUsageColor = (percent, type = 'cpu') => {
    if (percent < 50) return 'var(--success-color)';
    if (percent < 80) return 'var(--warning-color)';
    return 'var(--error-color)';
  };

  const getMachineRoles = (machine) => {
    if (!machine.marked_as || !Array.isArray(machine.marked_as)) return [];
    return machine.marked_as.map(mark => `${mark.role} ${mark.type}`).join(', ');
  };

  const formatLastRefresh = () => {
    return lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never';
  };

  const getCurrentSummaryData = () => {
    if (selectedMachine && summaryData[selectedMachine]) {
      return summaryData[selectedMachine];
    }
    
    return {
      cpu: { percent: 0, cores: 0, processors: 0, details: {} },
      memory: { used_gb: 0, total_gb: 0, percent: 0, free_gb: 0 },
      disk: { used_gb: 0, total_gb: 0, percent: 0, free_gb: 0, details: {} },
      network: { upload: 0, download: 0, connections: 0, details: {} },
      processes: [],
      metadata: {}
    };
  };

  const getCurrentRawData = () => {
    if (selectedMachine && resourceData[selectedMachine]) {
      return resourceData[selectedMachine];
    }
    
    return {
      cpu: { summary: {}, processes: {} },
      memory: { summary: {}, processes: {} },
      disks: { summary: {}, processes: {} },
      network: { summary: {}, processes: {} },
      metadata: {}
    };
  };

  const currentSummary = getCurrentSummaryData();
  const currentRaw = getCurrentRawData();

  const getMachineName = () => {
    if (selectedMachine) {
      const machine = markedMachines.find(m => m.ip === selectedMachine);
      return machine?.name || currentRaw.metadata?.machine_name || selectedMachine;
    }
    return 'No Machine Selected';
  };

  const getSelectedMachine = () => {
    if (selectedMachine) {
      return markedMachines.find(m => m.ip === selectedMachine);
    }
    return null;
  };

  const MarkMachineModal = () => {
    if (!showMarkModal || machinesLoading) return null;

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
                <p>To monitor resources, you need to mark at least one machine in Machine Management.</p>
              </div>
              
              <div className="modal-stats-grid">
                <div className="modal-stat-item">
                  <div className="modal-stat-label">TOTAL MACHINES</div>
                  <div className="modal-stat-value">{markedMachines.length}</div>
                </div>
                <div className="modal-stat-item">
                  <div className="modal-stat-label">LAST REFRESH</div>
                  <div className="modal-stat-value">{formatLastRefresh()}</div>
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

  const MachineSelector = () => {
    if (machinesLoading) {
      return (
        <div className="loading-message">
          <div className="loading-spinner"></div>
          Loading machine information...
        </div>
      );
    }

    if (markedMachines.length === 0) {
      return null;
    }

    return (
      <div className="machine-selector-full-width">
        <div className="selector-left-section">
          <div className="select-wrapper">
            <select
              value={selectedMachine}
              onChange={(e) => handleMachineSelect(e.target.value)}
              className="machine-select"
              disabled={loading || !isConnected || isFetchingRef.current}
            >
              <option value="">Select a machine to monitor...</option>
              {markedMachines.map(machine => (
                <option key={machine.id || machine.ip} value={machine.ip}>
                  {machine.name || 'Unknown'} ({machine.ip}) - {getMachineRoles(machine)}
                </option>
              ))}
            </select>
          </div>
          
          {showSelectMessage && !selectedMachine && markedMachines.length > 0 && (
            <div className="select-machine-message">
              <div className="select-message-content">
                <div className="select-message-icon">ℹ️</div>
                <div className="select-message-text">
                  <h3>Select a Machine to Monitor Resources</h3>
                  <p>Please select a machine from the dropdown above to view its resource usage.</p>
                  <p>Once you select a machine, resource data will be fetched automatically.</p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {selectedMachine && (
          <div className="selector-right-section">
            <div className="selected-machine-info-card">
            </div>
          </div>
        )}
      </div>
    );
  };

   return (
    <div className="resource-monitor">
      <div className="users-content">
        <div className="users-header">
          <div className="users-title-container">
            <h1 className="users-title">Resource Monitor</h1>
            <div className="header-controls">
              {lastUpdated && (
                <div className="last-updated">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </div>
              )}
              <div className="refresh-buttons-group">
                {selectedMachine && (
                  <button
                    onClick={() => handleManualRefresh(selectedMachine)}
                    className="refresh-single-btn"
                    disabled={loading}
                  >
                    {loading ? '⟳ Refreshing...' : '⟳ Refresh Current'}
                  </button>
                )}
                <button
                  onClick={handleRefreshMachines}
                  className="refresh-machines-btn"
                  disabled={machinesLoading || isFetchingRef.current}
                >
                  {machinesLoading ? 'Loading...' : 'Refresh All'}
                </button>
              </div>
            </div>
          </div>
        </div> 

        <div className="users-full-width">
          <div className="machine-list-card-full">
            <div className="machine-list-header">
              <h3 className="section-title">
                Select Machine ({markedMachines.length})
              </h3>
            </div>
            
            <MachineSelector />
          </div>

          <div className="monitor-content-area-full">
            <div className="monitor-tabs">
              <div className="tabs-container">
                {topNavSections.map(section => (
                  <button
                    key={section.id}
                    className={`tab-item ${activeSection === section.id ? 'active' : ''}`}
                    onClick={() => setActiveSection(section.id)}
                    disabled={!selectedMachine}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="monitor-detail-content-full">
              {error && (
                <div className="error-message" style={{
                  background: 'var(--error-color)',
                  color: 'white',
                  padding: 'var(--spacing-3)',
                  borderRadius: 'var(--border-radius)',
                  marginBottom: 'var(--spacing-4)',
                  textAlign: 'center'
                }}>
                  Error: {error}
                </div>
              )}

              {markedMachines.length === 0 ? (
                <div className="no-machines-message">
                  <div className="no-machines-icon">⚠️</div>
                  <h3>No machines available for monitoring</h3>
                  <p>Please mark machines in Machine Management first to monitor their resources.</p>
                  <button
                    onClick={handleRefreshMachines}
                    className="btn-refresh-machines"
                  >
                    Refresh Machine List
                  </button>
                </div>
              ) : !selectedMachine ? (
                <div className="select-machine-prompt">
                  <div className="prompt-content">
                    <div className="prompt-text">
                      <h3>No Machine Selected</h3>
                      <p>Please select a machine from the dropdown to view its resource usage.</p>
                      <p>Available machines: {markedMachines.length}</p>
                    </div>
                  </div>
                </div>
              ) : loading ? (
                <div className="loading-message">
                  <div className="loading-spinner"></div>
                  Loading resource data from {getMachineName()}...
                </div>
              ) : (
                <>
                  <div className="machine-info-card">
                    <div className="card-header">
                      <h2 className="card-title">
                        {getMachineName()}
                      </h2>
                    </div>
                    
                    <div className="machine-info-grid">
                      <div className="info-item">
                        <span className="info-label">IP Address</span>
                        <span className="info-value">{selectedMachine}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Username</span>
                        <span className="info-value">{getSelectedMachine()?.username || 'Unknown'}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Roles</span>
                        <span className="info-value roles-badge">
                          {getMachineRoles(getSelectedMachine()) || 'None'}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Status</span>
                        <span className={`info-value status-${isConnected ? 'connected' : 'disconnected'}`}>
                          {isConnected ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {activeSection === 'overview' && (
                    <div className="section-content overview-section">
                      <h2 className="section-heading">Performance Overview</h2>
                      
                      <div className="summary-cards-grid">
                        <div className="summary-card">
                          <div className="summary-card-header">
                            <h3>CPU</h3>
                            <div className="summary-card-value">{currentSummary.cpu.percent.toFixed(1)}%</div>
                          </div>
                          <div className="summary-progress-bar">
                            <div 
                              className="progress-fill"
                              style={{ 
                                width: `${Math.min(currentSummary.cpu.percent, 100)}%`,
                                backgroundColor: getUsageColor(currentSummary.cpu.percent)
                              }}
                            ></div>
                          </div>
                          <div className="summary-card-details">
                            <div className="detail-row">
                              <span className="detail-label">Cores:</span>
                              <span className="detail-value">{currentSummary.cpu.cores}</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">Logical:</span>
                              <span className="detail-value">{currentSummary.cpu.processors}</span>
                            </div>
                          </div>
                        </div>

                        <div className="summary-card">
                          <div className="summary-card-header">
                            <h3>Memory</h3>
                            <div className="summary-card-value">{currentSummary.memory.percent.toFixed(1)}%</div>
                          </div>
                          <div className="summary-progress-bar">
                            <div 
                              className="progress-fill"
                              style={{ 
                                width: `${Math.min(currentSummary.memory.percent, 100)}%`,
                                backgroundColor: getUsageColor(currentSummary.memory.percent, 'memory')
                              }}
                            ></div>
                          </div>
                          <div className="summary-card-details">
                            <div className="detail-row">
                              <span className="detail-label">In use:</span>
                              <span className="detail-value">{currentSummary.memory.used_gb.toFixed(2)} GB</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">Available:</span>
                              <span className="detail-value">{currentSummary.memory.free_gb.toFixed(2)} GB</span>
                            </div>
                          </div>
                        </div>

                        <div className="summary-card">
                          <div className="summary-card-header">
                            <h3>Disk</h3>
                            <div className="summary-card-value">{currentSummary.disk.percent.toFixed(1)}%</div>
                          </div>
                          <div className="summary-progress-bar">
                            <div 
                              className="progress-fill"
                              style={{ 
                                width: `${Math.min(currentSummary.disk.percent, 100)}%`,
                                backgroundColor: getUsageColor(currentSummary.disk.percent, 'disk')
                              }}
                            ></div>
                          </div>
                          <div className="summary-card-details">
                            <div className="detail-row">
                              <span className="detail-label">Used:</span>
                              <span className="detail-value">{currentSummary.disk.used_gb.toFixed(2)} GB</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">Free:</span>
                              <span className="detail-value">{currentSummary.disk.free_gb.toFixed(2)} GB</span>
                            </div>
                          </div>
                        </div>

                        <div className="summary-card">
                          <div className="summary-card-header">
                            <h3>Network</h3>
                            <div className="summary-card-value">{currentSummary.network.connections}</div>
                          </div>
                          <div className="network-stats">
                            <div className="network-stat">
                              <div className="stat-label">Upload</div>
                              <div className="stat-value">{formatBytes(currentSummary.network.upload)}</div>
                            </div>
                            <div className="network-stat">
                              <div className="stat-label">Download</div>
                              <div className="stat-value">{formatBytes(currentSummary.network.download)}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="processes-section">
                        <h3 className="table-title">Top Processes</h3>
                        <div className="table-container">
                          <table className="processes-table">
                            <thead>
                              <tr>
                                <th>Process Name</th>
                                <th>PID</th>
                                <th>Memory Usage</th>
                                <th>Thread Count</th>
                                <th>CPU Usage</th>
                              </tr>
                            </thead>
                            <tbody>
                              {currentSummary.processes.slice(0, 5).map((process, index) => (
                                <tr key={`${process.pid}-${index}`}>
                                  <td className="process-name-cell">{process.name || 'Unknown'}</td>
                                  <td className="process-pid-cell">{process.pid || 'N/A'}</td>
                                  <td className="process-memory-cell">{formatMemoryMB(process.memory_mb || 0)}</td>
                                  <td className="process-threads-cell">{process.thread_count || 0}</td>
                                  <td className="process-cpu-cell">
                                    <div className="cpu-usage-cell">
                                      <span>{process.cpu_percent?.toFixed(2) || '0.00'}%</span>
                                      <div className="cpu-bar" style={{
                                        width: `${Math.min(process.cpu_percent || 0, 100)}%`,
                                        backgroundColor: getUsageColor(process.cpu_percent || 0)
                                      }}></div>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {currentSummary.processes.length === 0 && (
                                <tr>
                                  <td colSpan="5" className="no-data-cell">
                                    No process data available
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSection === 'cpu' && (
                    <div className="section-content cpu-section">
                      <div className="section-header">
                        <h2 className="section-heading">CPU Performance</h2>
                        <div className="section-stats">
                          <div className="main-stat">
                            <span className="stat-value">{currentSummary.cpu.percent.toFixed(1)}%</span>
                            <span className="stat-label">Utilization</span>
                          </div>
                        </div>
                      </div>

                      <div className="content-grid">
                        <div className="details-card">
                          <h3 className="card-title">CPU Details</h3>
                          <div className="details-list">
                            {currentRaw.cpu?.summary ? (
                              Object.entries(currentRaw.cpu.summary).map(([cpuKey, cpu]) => (
                                <div key={cpuKey} className="detail-item-card">
                                  <div className="detail-item-header">
                                    <span className="item-name">{cpu.name || `CPU ${cpuKey}`}</span>
                                    <span className="item-value">{cpu.load_percentage?.toFixed(1) || 0}%</span>
                                  </div>
                                  <div className="detail-item-progress">
                                    <div 
                                      className="progress-bar"
                                      style={{
                                        width: `${Math.min(cpu.load_percentage || 0, 100)}%`,
                                        backgroundColor: getUsageColor(cpu.load_percentage || 0)
                                      }}
                                    ></div>
                                  </div>
                                  <div className="detail-item-specs">
                                    <span className="spec-item">Cores: {cpu.cores || 0}</span>
                                    <span className="spec-item">Logical: {cpu.logical_processors || 0}</span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="no-data-message">No CPU details available</div>
                            )}
                          </div>
                        </div>

                        <div className="table-card">
                          <h3 className="card-title">CPU Processes</h3>
                          <div className="table-container">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Process Name</th>
                                  <th>PID</th>
                                  <th>CPU Usage</th>
                                  <th>Memory Usage</th>
                                  <th>Thread Count</th>
                                </tr>
                              </thead>
                              <tbody>
                                {currentRaw.cpu?.processes ? (
                                  Object.values(currentRaw.cpu.processes)
                                    .sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0))
                                    .slice(0, 10)
                                    .map((process, index) => (
                                      <tr key={`${process.pid}-${index}`}>
                                        <td>{process.name || 'Unknown'}</td>
                                        <td>{process.pid || 'N/A'}</td>
                                        <td>
                                          <div className="usage-cell">
                                            <span>{process.cpu_percent?.toFixed(2) || '0.00'}%</span>
                                            <div className="usage-bar" style={{
                                              width: `${Math.min(process.cpu_percent || 0, 100)}%`,
                                              backgroundColor: getUsageColor(process.cpu_percent || 0)
                                            }}></div>
                                          </div>
                                        </td>
                                        <td>
                                          {(() => {
                                            const memProcess = currentRaw.memory?.processes ? 
                                              Object.values(currentRaw.memory.processes).find(p => p.pid === process.pid) : null;
                                            return formatMemoryMB(memProcess?.working_set_mb || 0);
                                          })()}
                                        </td>
                                        <td>{process.thread_count || 0}</td>
                                      </tr>
                                    ))
                                ) : (
                                  <tr>
                                    <td colSpan="5" className="no-data-cell">
                                      No CPU process data available
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSection === 'memory' && (
                    <div className="section-content memory-section">
                      <div className="section-header">
                        <h2 className="section-heading">Memory Usage</h2>
                        <div className="section-stats">
                          <div className="main-stat">
                            <span className="stat-value">{currentSummary.memory.percent.toFixed(1)}%</span>
                            <span className="stat-label">In Use</span>
                          </div>
                        </div>
                      </div>

                      <div className="content-grid">
                        <div className="details-card">
                          <h3 className="card-title">Memory Details</h3>
                          <div className="memory-stats-grid">
                            <div className="memory-stat-item">
                              <span className="stat-label">Total Memory</span>
                              <span className="stat-value">{currentSummary.memory.total_gb.toFixed(2)} GB</span>
                            </div>
                            <div className="memory-stat-item">
                              <span className="stat-label">Used Memory</span>
                              <span className="stat-value">{currentSummary.memory.used_gb.toFixed(2)} GB</span>
                            </div>
                            <div className="memory-stat-item">
                              <span className="stat-label">Available Memory</span>
                              <span className="stat-value">{currentSummary.memory.free_gb.toFixed(2)} GB</span>
                            </div>
                            <div className="memory-stat-item">
                              <span className="stat-label">Usage</span>
                              <span className="stat-value">{currentSummary.memory.percent.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>

                        <div className="table-card">
                          <h3 className="card-title">Memory Processes</h3>
                          <div className="table-container">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Process Name</th>
                                  <th>PID</th>
                                  <th>Working Set</th>
                                  <th>Private Memory</th>
                                </tr>
                              </thead>
                              <tbody>
                                {currentRaw.memory?.processes ? (
                                  Object.values(currentRaw.memory.processes)
                                    .sort((a, b) => (b.working_set_mb || 0) - (a.working_set_mb || 0))
                                    .slice(0, 10)
                                    .map((process, index) => (
                                      <tr key={`${process.pid}-${index}`}>
                                        <td>{process.name || 'Unknown'}</td>
                                        <td>{process.pid || 'N/A'}</td>
                                        <td>{formatMemoryMB(process.working_set_mb || 0)}</td>
                                        <td>{formatMemoryMB(process.private_memory_mb || 0)}</td>
                                      </tr>
                                    ))
                                ) : (
                                  <tr>
                                    <td colSpan="4" className="no-data-cell">
                                      No memory process data available
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSection === 'disk' && (
                    <div className="section-content disk-section">
                      <div className="section-header">
                        <h2 className="section-heading">Disk Usage</h2>
                        <div className="section-stats">
                          <div className="main-stat">
                            <span className="stat-value">{currentSummary.disk.percent.toFixed(1)}%</span>
                            <span className="stat-label">Used</span>
                          </div>
                        </div>
                      </div>

                      <div className="content-grid">
                        <div className="details-card">
                          <h3 className="card-title">Disk Details</h3>
                          <div className="details-list">
                            {currentRaw.disks?.summary ? (
                              Object.entries(currentRaw.disks.summary).map(([diskKey, disk]) => (
                                <div key={diskKey} className="detail-item-card">
                                  <div className="detail-item-header">
                                    <span className="item-name">{disk.name || `Disk ${diskKey}`}</span>
                                    <span className="item-value">
                                      {disk.total_gb > 0 ? 
                                        `${((disk.used_gb || 0) / disk.total_gb * 100).toFixed(1)}%` : 
                                        '0%'}
                                    </span>
                                  </div>
                                  <div className="detail-item-progress">
                                    <div 
                                      className="progress-bar"
                                      style={{
                                        width: `${disk.total_gb > 0 ? Math.min((disk.used_gb || 0) / disk.total_gb * 100, 100) : 0}%`,
                                        backgroundColor: getUsageColor(
                                          disk.total_gb > 0 ? (disk.used_gb || 0) / disk.total_gb * 100 : 0, 
                                          'disk'
                                        )
                                      }}
                                    ></div>
                                  </div>
                                  <div className="detail-item-specs">
                                    <span className="spec-item">Used: {disk.used_gb?.toFixed(2) || 0} GB</span>
                                    <span className="spec-item">Free: {disk.free_gb?.toFixed(2) || 0} GB</span>
                                    <span className="spec-item">Total: {disk.total_gb?.toFixed(2) || 0} GB</span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="no-data-message">No disk details available</div>
                            )}
                          </div>
                        </div>

                        <div className="table-card">
                          <h3 className="card-title">Disk Processes</h3>
                          <div className="table-container">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Process Name</th>
                                  <th>PID</th>
                                  <th>Disk Read</th>
                                  <th>Disk Write</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td colSpan="4" className="no-data-cell">
                                    Disk process monitoring not available in current implementation
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSection === 'network' && (
                    <div className="section-content network-section">
                      <div className="section-header">
                        <h2 className="section-heading">Network Activity</h2>
                        <div className="section-stats">
                          <div className="main-stat">
                            <span className="stat-value">{currentSummary.network.connections}</span>
                            <span className="stat-label">Active Adapters</span>
                          </div>
                        </div>
                      </div>

                      <div className="content-grid">
                        <div className="details-card">
                          <h3 className="card-title">Network Adapters</h3>
                          <div className="details-list">
                            {currentRaw.network?.summary ? (
                              Object.entries(currentRaw.network.summary).map(([adapterKey, adapter]) => (
                                <div key={adapterKey} className="detail-item-card">
                                  <div className="detail-item-header">
                                    <span className="item-name">{adapter.name || `Adapter ${adapterKey}`}</span>
                                  </div>
                                  <div className="adapter-stats-grid">
                                    <div className="adapter-stat">
                                      <span className="stat-label">Sent:</span>
                                      <span className="stat-value">{formatBytes(adapter.bytes_sent || 0)}</span>
                                    </div>
                                    <div className="adapter-stat">
                                      <span className="stat-label">Received:</span>
                                      <span className="stat-value">{formatBytes(adapter.bytes_received || 0)}</span>
                                    </div>
                                    <div className="adapter-stat">
                                      <span className="stat-label">Packets Sent:</span>
                                      <span className="stat-value">{adapter.packets_sent || 0}</span>
                                    </div>
                                    <div className="adapter-stat">
                                      <span className="stat-label">Packets Received:</span>
                                      <span className="stat-value">{adapter.packets_received || 0}</span>
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="no-data-message">No network adapter data available</div>
                            )}
                          </div>
                        </div>

                        <div className="table-card">
                          <h3 className="card-title">Network Processes</h3>
                          <div className="table-container">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Process Name</th>
                                  <th>PID</th>
                                  <th>Connections</th>
                                  <th>Bandwidth</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td colSpan="4" className="no-data-cell">
                                    Network process monitoring not available in current implementation
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <MarkMachineModal />

      {error && (
        <div className="error-message-global">
          <div className="error-icon">⚠️</div>
          <div className="error-text">{error}</div>
          <button 
            className="btn-close-error" 
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default ResourceMonitor;