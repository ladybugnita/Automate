import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import './EventViewer.css';

const getEventLevelColor = (level) => {
  switch (level?.toLowerCase()) {
    case 'error':
    case 'critical':
      return '#f56565'; 
    case 'warning':
      return '#ed8936'; 
    case 'information':
    case 'info':
      return '#4299e1'; 
    case 'success':
      return '#48bb78'; 
    default:
      return '#a0aec0'; 
  }
};

const getEventLevelIcon = (level) => {
  switch (level?.toLowerCase()) {
    case 'error':
    case 'critical':
      return '⚠️'; 
    case 'warning':
      return '🔶'; 
    case 'information':
    case 'info':
      return 'ℹ️'; 
    case 'success':
      return '✅'; 
    default:
      return '🔷'; 
  }
};

const EventViewer = () => {
    const { isConnected, sendCommand, addListener } = useWebSocket();
    const [events, setEvents] = useState({
        system: [],
        application: [],
        security: []
    });
    const [loading, setLoading] = useState(false); // Changed to false initially
    const [selectedCategory, setSelectedCategory] = useState('system');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [markedMachines, setMarkedMachines] = useState([]);
    const [machinesLoading, setMachinesLoading] = useState(true);
    const [showMarkModal, setShowMarkModal] = useState(false);
    const [selectedMachine, setSelectedMachine] = useState(''); // Empty by default
    const [error, setError] = useState(null);
    const [showSelectMessage, setShowSelectMessage] = useState(true); // New state for showing select message
    
    const isFetchingRef = useRef(false);
    const timeoutRef = useRef(null);
    const machineInfoListenerRef = useRef(false);
    const fetchInProgressRef = useRef(false);
    const mountedRef = useRef(false);

    const navItems = [
        'Dashboard', 'DNS Configuration', 'Event Viewer', 'DHCP', 'Users', 
        'Resource Monitor', 'ESXi', 'Switch', 'Machine Management', 
        'Active Directory', 'Routing'
    ];

    // Get the API base URL dynamically - memoized to prevent recreation
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
            console.error('Event Viewer: No machine provided to getWindowsInfoForMachine');
            return null;
        }
        
        console.log(`Event Viewer: Getting Windows info for machine: ${machine.name || 'Unknown'} (${machine.ip})`);
        
        // Check for password in different possible fields
        const password = machine.password || machine.password_provided || '';
        
        console.log(`Event Viewer: Password for machine ${machine.name || machine.ip}:`, password ? '***HIDDEN***' : 'NOT FOUND');
        console.log('Event Viewer: Machine object keys:', Object.keys(machine));
        
        if (!password) {
            console.error('Event Viewer: No password found for machine:', machine.name || machine.ip);
            console.error('Event Viewer: Full machine object:', machine);
            setError(`No password found for machine: ${machine.name || machine.ip}. Please check machine credentials in Machine Management.`);
            return null;
        }
        
        return {
            ip: machine.ip,
            username: machine.username || machine.username_provided || 'admin',
            password: password
        };
    }, []);

    const createEventViewerPayloadForSingleMachine = useCallback((machine) => {
        if (!machine) {
            console.error('Event Viewer: No machine selected');
            setError('No machine selected');
            return null;
        }
        
        const windowsInfo = getWindowsInfoForMachine(machine);
        if (!windowsInfo) {
            return null;
        }
        
        console.log(`Event Viewer: Creating payload for single machine: ${machine.name || 'Unknown'} (${machine.ip})`);
        
        return {
            windows_info: windowsInfo
        };
    }, [getWindowsInfoForMachine]);

    const createEventViewerPayloadForAllMachines = useCallback((machines) => {
        if (!machines || machines.length === 0) {
            console.error('Event Viewer: No marked machines found');
            setError('No marked machines found. Please mark machines as DNS, DHCP, or AD in Machine Management first.');
            return null;
        }
        
        const windowsInfos = [];
        
        machines.forEach(machine => {
            const windowsInfo = getWindowsInfoForMachine(machine);
            if (windowsInfo) {
                windowsInfos.push(windowsInfo);
            } else {
                console.error(`Event Viewer: Failed to get Windows info for machine: ${machine.name || 'Unknown'} (${machine.ip})`);
            }
        });
        
        if (windowsInfos.length === 0) {
            console.error('Event Viewer: Failed to get Windows info for any marked machine');
            setError('Failed to get credentials for marked machines. Please check that all marked machines have valid credentials in Machine Management.');
            return null;
        }
        
        console.log(`Event Viewer: Creating payload for ${windowsInfos.length} machine(s)`);
        
        return {
            windows_infos: windowsInfos
        };
    }, [getWindowsInfoForMachine]);

    const categorizeEvent = useCallback((event) => {
        const logName = event.LogName || event.log_name || event.Log || '';
        const logNameLower = logName.toLowerCase();
        
        const provider = event.ProviderName || event.provider || '';
        const providerLower = provider.toLowerCase();
        
        const eventId = event.EventID || event.EventId || event.Id || '';
        
        if (logNameLower.includes('security') || 
            providerLower.includes('security') ||
            providerLower.includes('audit') ||
            (eventId >= 4600 && eventId <= 4699) ||
            providerLower.includes('microsoft-windows-security-auditing')) {
            return 'security';
        }
        
        if (logNameLower.includes('application') || 
            providerLower.includes('application') ||
            (!logNameLower.includes('system') && !logNameLower.includes('security'))) {
            return 'application';
        }
        
        if (logNameLower.includes('system') || 
            logName === '' || 
            providerLower.includes('system') ||
            providerLower.includes('microsoft-windows-kernel')) {
            return 'system';
        }
        
        return 'system';
    }, []);

    const fetchEventDataForSingleMachine = useCallback((machine) => {
        if (isFetchingRef.current || !mountedRef.current) {
            console.log('Event Viewer: Already fetching event data or component unmounted, skipping...');
            return;
        }

        if (!isConnected) {
            console.log('Event Viewer: WebSocket not connected');
            setError('Not connected to backend system');
            setLoading(false);
            return;
        }

        console.log(`Event Viewer: Fetching events for single machine: ${machine.name || 'Unknown'} (${machine.ip})`);
        setLoading(true);
        setError(null);
        setShowSelectMessage(false); // Hide select message when fetching
        isFetchingRef.current = true;
        
        const payload = createEventViewerPayloadForSingleMachine(machine);
        if (!payload) {
            setLoading(false);
            isFetchingRef.current = false;
            return;
        }
        
        console.log('Event Viewer: Sending payload (credentials only, no log_name):', {
            ...payload,
            windows_info: { ...payload.windows_info, password: '***HIDDEN***' }
        });
        sendCommand('get_event_viewer_data', payload);

        // Clear any existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = setTimeout(() => {
            if (isFetchingRef.current && mountedRef.current) {
                console.log('Event Viewer: Timeout: No response from backend for event data');
                setError('Timeout: No response from server');
                setLoading(false);
                isFetchingRef.current = false;
                timeoutRef.current = null;
            }
        }, 30000);
    }, [isConnected, sendCommand, createEventViewerPayloadForSingleMachine]);

    const fetchEventDataForAllMachines = useCallback((machines) => {
        if (isFetchingRef.current || !mountedRef.current) {
            console.log('Event Viewer: Already fetching event data or component unmounted, skipping...');
            return;
        }

        if (!isConnected) {
            console.log('Event Viewer: WebSocket not connected');
            setError('Not connected to backend system');
            setLoading(false);
            return;
        }

        const machinesToUse = machines || markedMachines;
        
        if (!machinesToUse || machinesToUse.length === 0) {
            console.log('Event Viewer: No marked machines found');
            setError('No marked machines found. Please mark machines as DNS, DHCP, or AD in Machine Management first.');
            setLoading(false);
            return;
        }

        console.log(`Event Viewer: Fetching events for ${machinesToUse.length} marked machine(s)...`);
        setLoading(true);
        setError(null);
        setShowSelectMessage(false); // Hide select message when fetching
        isFetchingRef.current = true;
        
        const payload = createEventViewerPayloadForAllMachines(machinesToUse);
        if (!payload) {
            setLoading(false);
            isFetchingRef.current = false;
            return;
        }
        
        console.log('Event Viewer: Sending payload (credentials only, no log_name):', {
            ...payload,
            windows_infos: payload.windows_infos.map(info => ({ ...info, password: '***HIDDEN***' }))
        });
        sendCommand('get_event_viewer_data', payload);

        // Clear any existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = setTimeout(() => {
            if (isFetchingRef.current && mountedRef.current) {
                console.log('Event Viewer: Timeout: No response from backend for event data');
                setError('Timeout: No response from server');
                setLoading(false);
                isFetchingRef.current = false;
                timeoutRef.current = null;
            }
        }, 30000);
    }, [isConnected, markedMachines, sendCommand, createEventViewerPayloadForAllMachines]);

    const processMachineInfo = useCallback((machines) => {
        if (!mountedRef.current) return;
        
        console.log('Event Viewer: Processing ALL machines info via WebSocket:', machines);
        
        if (!machines) {
            console.error('Event Viewer: No machine data received');
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
        
        console.log('Event Viewer: Processed machines array:', machinesArray);

        const markedMachinesList = machinesArray.filter(machine => {
            return machine.marked_as && 
                   Array.isArray(machine.marked_as) && 
                   machine.marked_as.length > 0;
        });

        console.log(`Event Viewer: Found ${markedMachinesList.length} marked machines via WebSocket:`, markedMachinesList);
        setMarkedMachines(markedMachinesList);
        
        setMachinesLoading(false);
        
        // Don't automatically fetch events anymore - wait for user selection
        // Show select message if there are marked machines
        if (markedMachinesList.length > 0) {
            setShowSelectMessage(true);
        } else {
            setShowMarkModal(true);
        }
        
        // Reset fetch in progress
        fetchInProgressRef.current = false;
    }, []);

    const fetchMachineInfo = useCallback(async () => {
        if (fetchInProgressRef.current || !mountedRef.current) {
            console.log('Event Viewer: Fetch already in progress or component unmounted');
            return;
        }
        
        fetchInProgressRef.current = true;
        console.log('Event Viewer: Fetching machines from Node.js REST API...');
        console.log('API Base URL:', API_BASE_URL);
        setMachinesLoading(true);
        setError(null);
        
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No authentication token found');
            }
            
            // FIX: We need to get machines WITH passwords
            // Try different endpoints that might include passwords
            
            // Option 1: Try with include_password=true parameter
            console.log('Event Viewer: Trying to fetch machines WITH passwords...');
            
            // First, let's try the standard endpoint but we need to see what endpoints are available
            // Based on your logs, try /api/machines/get-machines first
            const response = await fetch(`${API_BASE_URL}/api/machines/get-machines?include_password=true`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                console.log('Event Viewer: Endpoint with password parameter failed, trying without parameter...');
                
                // Try without parameter
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
                console.log('Event Viewer: Received machines from /api/machines/get-machines:', data);
                await processMachineData(data);
                return;
            }
            
            const data = await response.json();
            console.log('Event Viewer: Received machines from /api/machines/get-machines?include_password=true:', data);
            await processMachineData(data);
            
        } catch (err) {
            console.error('Event Viewer: REST API failed:', err);
            if (mountedRef.current) {
                setError(`Failed to fetch machines: ${err.message}. Please check if machines are properly configured.`);
                setMachinesLoading(false);
            }
            
            // Fallback to WebSocket only if component is still mounted
            if (mountedRef.current && isConnected) {
                console.log('Event Viewer: Falling back to WebSocket for get_machine_info');
                sendCommand('get_machine_info', {});
            }
        } finally {
            fetchInProgressRef.current = false;
        }
        
        async function processMachineData(data) {
            // Process the data - adjust based on your API response structure
            let machines = [];
            if (data.machines && Array.isArray(data.machines)) {
                machines = data.machines;
            } else if (data.data && Array.isArray(data.data)) {
                machines = data.data;
            } else if (Array.isArray(data)) {
                machines = data;
            }
            
            console.log('Event Viewer: Total machines found:', machines.length);
            
            if (machines.length > 0) {
                console.log('Event Viewer: First machine sample:', {
                    id: machines[0].id,
                    name: machines[0].name,
                    ip: machines[0].ip,
                    hasPassword: !!(machines[0].password || machines[0].password_provided),
                    hasUsername: !!(machines[0].username || machines[0].username_provided),
                    marked_as: machines[0].marked_as
                });
            }
            
            // Filter for marked machines
            const markedMachinesList = machines.filter(machine => {
                const hasMarks = machine.marked_as && 
                               Array.isArray(machine.marked_as) && 
                               machine.marked_as.length > 0;
                
                if (hasMarks) {
                    console.log(`Event Viewer: Found marked machine: ${machine.name || 'Unknown'} (${machine.ip})`, {
                        id: machine.id,
                        hasPassword: !!(machine.password || machine.password_provided),
                        hasUsername: !!(machine.username || machine.username_provided),
                        marks: machine.marked_as
                    });
                }
                
                return hasMarks;
            });
            
            console.log(`Event Viewer: Found ${markedMachinesList.length} marked machines:`, markedMachinesList);
            
            // Check if passwords are available
            const machinesWithPasswords = markedMachinesList.filter(machine => {
                const hasPassword = machine.password || machine.password_provided;
                if (!hasPassword) {
                    console.warn(`Event Viewer: Machine ${machine.name || 'Unknown'} (${machine.ip}) has no password`);
                    console.warn('Event Viewer: Machine object:', machine);
                }
                return hasPassword;
            });
            
            if (markedMachinesList.length === 0) {
                console.log('Event Viewer: No marked machines found');
                setShowMarkModal(true);
            } else if (machinesWithPasswords.length === 0) {
                console.error('Event Viewer: No marked machines have passwords');
                setError('Marked machines found but no passwords available. Please check machine credentials in Machine Management.');
                setShowMarkModal(true);
            } else {
                // Show select message when machines are loaded
                setShowSelectMessage(true);
            }
            
            setMarkedMachines(markedMachinesList);
            setMachinesLoading(false);
            
            // Don't automatically fetch events - wait for user selection
        }
    }, [API_BASE_URL, isConnected, sendCommand]);

    const handleWebSocketMessage = useCallback((data) => {
        if (!mountedRef.current) return;
        
        console.log('Event Viewer WebSocket message:', data);
        
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
        
        console.log(`Event Viewer: Processing response for command: ${command}`, { result, error });
        
        if (error) {
            console.log(`Event Viewer: Error from backend for command ${command}:`, error);
            setError(`Error: ${error}`);
            setLoading(false);
            setMachinesLoading(false);
            isFetchingRef.current = false;
            return;
        }
        
        const responseData = extractResult(result);
        console.log('Event Viewer: Extracted response data:', responseData);
        
        switch(command) {
            case 'get_machine_info':
                console.log('Event Viewer: Received machine info via WebSocket fallback');
                if (responseData && responseData.machines && responseData.machines.length > 0) {
                    processMachineInfo(responseData);
                } else {
                    console.log('Event Viewer: No machines found via WebSocket');
                    setMarkedMachines([]);
                    setMachinesLoading(false);
                    setShowMarkModal(true);
                }
                break;
                
            case 'get_event_viewer_data':
                console.log('Event Viewer: Processing event viewer data');
                isFetchingRef.current = false;
                
                let eventData = null;
                
                if (responseData && responseData.result && responseData.result.data) {
                    eventData = responseData.result.data;
                } else if (responseData && responseData.data) {
                    eventData = responseData.data;
                } else if (responseData) {
                    eventData = responseData;
                }
                
                if (eventData) {
                    console.log('Event Viewer: Loaded event viewer data:', eventData);
                    
                    const systemEvents = [];
                    const applicationEvents = [];
                    const securityEvents = [];
                    
                    if (Array.isArray(eventData)) {
                        eventData.forEach(event => {
                            const enhancedEvent = {
                                ...event,
                                machineName: event.machine_name || event.machineName || 'Unknown',
                                machineIp: event.machine_ip || event.machineIp || 'Unknown'
                            };
                            
                            const category = categorizeEvent(event);
                            
                            if (category === 'system') {
                                systemEvents.push(enhancedEvent);
                            } else if (category === 'application') {
                                applicationEvents.push(enhancedEvent);
                            } else if (category === 'security') {
                                securityEvents.push(enhancedEvent);
                            }
                        });
                    } else if (typeof eventData === 'object') {
                        if (eventData.system || eventData.application || eventData.security) {
                            if (eventData.system && Array.isArray(eventData.system)) {
                                eventData.system.forEach(event => {
                                    const enhancedEvent = {
                                        ...event,
                                        machineName: event.machine_name || event.machineName || 'Unknown',
                                        machineIp: event.machine_ip || event.machineIp || 'Unknown'
                                    };
                                    systemEvents.push(enhancedEvent);
                                });
                            }
                            if (eventData.application && Array.isArray(eventData.application)) {
                                eventData.application.forEach(event => {
                                    const enhancedEvent = {
                                        ...event,
                                        machineName: event.machine_name || event.machineName || 'Unknown',
                                        machineIp: event.machine_ip || event.machineIp || 'Unknown'
                                    };
                                    applicationEvents.push(enhancedEvent);
                                });
                            }
                            if (eventData.security && Array.isArray(eventData.security)) {
                                eventData.security.forEach(event => {
                                    const enhancedEvent = {
                                        ...event,
                                        machineName: event.machine_name || event.machineName || 'Unknown',
                                        machineIp: event.machine_ip || event.machineIp || 'Unknown'
                                    };
                                    securityEvents.push(enhancedEvent);
                                });
                            }
                        } else {
                            Object.keys(eventData).forEach(key => {
                                const eventsList = eventData[key];
                                if (Array.isArray(eventsList)) {
                                    eventsList.forEach(event => {
                                        const enhancedEvent = {
                                            ...event,
                                            machineName: event.machine_name || event.machineName || 'Unknown',
                                            machineIp: event.machine_ip || event.machineIp || 'Unknown'
                                        };
                                        
                                        const category = categorizeEvent(event);
                                        
                                        if (category === 'system') {
                                            systemEvents.push(enhancedEvent);
                                        } else if (category === 'application') {
                                            applicationEvents.push(enhancedEvent);
                                        } else if (category === 'security') {
                                            securityEvents.push(enhancedEvent);
                                        }
                                    });
                                }
                            });
                        }
                    }
                    
                    console.log(`Event Viewer: Categorized events - System: ${systemEvents.length}, Application: ${applicationEvents.length}, Security: ${securityEvents.length}`);
                    
                    setEvents({
                        system: systemEvents,
                        application: applicationEvents,
                        security: securityEvents
                    });
                    
                    setLoading(false);
                    setLastUpdated(new Date());
                } else {
                    console.log('Event Viewer: No event data found in response');
                    setEvents({
                        system: [],
                        application: [],
                        security: []
                    });
                    setLoading(false);
                }
                
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
                break;
                
            default:
                console.log(`Event Viewer: Unhandled command: ${command}`);
        }
    }, [processMachineInfo, categorizeEvent]);

    const handleMachineSelect = useCallback((machineIp) => {
        setSelectedMachine(machineIp);
        
        if (machineIp) {
            const machine = markedMachines.find(m => m.ip === machineIp);
            if (machine) {
                fetchEventDataForSingleMachine(machine);
            }
        } else {
            // When user selects "Select a machine" option, show the message again
            setShowSelectMessage(true);
            setEvents({
                system: [],
                application: [],
                security: []
            });
            setLoading(false);
        }
    }, [markedMachines, fetchEventDataForSingleMachine]);

    const getEventStats = () => {
        return {
            system: events.system.length,
            application: events.application.length,
            security: events.security.length,
            total: events.system.length + events.application.length + events.security.length
        };
    };

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
                fetchEventDataForSingleMachine(machine);
            }
        } else {
            fetchEventDataForAllMachines();
        }
    }, [isConnected, markedMachines, fetchEventDataForAllMachines, fetchEventDataForSingleMachine]);

    const handleRefreshMachines = useCallback(() => {
        fetchMachineInfo();
    }, [fetchMachineInfo]);

    // Initialize on component mount
    useEffect(() => {
        console.log('Event Viewer Component Mounted');
        mountedRef.current = true;
        
        // Fetch machines immediately on mount
        fetchMachineInfo();
        
        return () => {
            console.log('Event Viewer Component Unmounting');
            mountedRef.current = false;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            isFetchingRef.current = false;
            fetchInProgressRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (autoRefresh && markedMachines.length > 0 && mountedRef.current) {
            const interval = setInterval(() => {
                if (!isFetchingRef.current && mountedRef.current) {
                    if (selectedMachine) {
                        const machine = markedMachines.find(m => m.ip === selectedMachine);
                        if (machine) {
                            fetchEventDataForSingleMachine(machine);
                        }
                    } else {
                        fetchEventDataForAllMachines();
                    }
                }
            }, 30000);

            return () => clearInterval(interval);
        }
    }, [autoRefresh, fetchEventDataForSingleMachine, fetchEventDataForAllMachines, markedMachines, selectedMachine]);

    useEffect(() => {
        if (!machineInfoListenerRef.current && mountedRef.current) {
            console.log('Event Viewer: Setting up WebSocket listener');
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

    const handleCategoryChange = (category) => {
        setSelectedCategory(category);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'Unknown';
        try {
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
        } catch {
            return 'Unknown';
        }
    };

    const truncateMessage = (message, maxLength = 150) => {
        if (!message) return '';
        return message.length > maxLength ? message.substring(0, maxLength) + '...' : message;
    };

    const currentEvents = events[selectedCategory] || [];

    const getMachineRoles = (machine) => {
        if (!machine.marked_as || !Array.isArray(machine.marked_as)) return [];
        return machine.marked_as.map(mark => `${mark.role} ${mark.type}`).join(', ');
    };

    const formatLastRefresh = () => {
        return lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never';
    };

    const MarkMachineModal = () => {
        if (!showMarkModal || machinesLoading) return null;

        const eventStats = getEventStats();

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
                                <p>To view events, you need to mark at least one machine in Machine Management.</p>
                            </div>
                            
                            <div className="modal-stats-grid">
                                <div className="modal-stat-item">
                                    <div className="modal-stat-label">SYSTEM EVENTS</div>
                                    <div className="modal-stat-value">{eventStats.system}</div>
                                </div>
                                <div className="modal-stat-item">
                                    <div className="modal-stat-label">APPLICATION EVENTS</div>
                                    <div className="modal-stat-value">{eventStats.application}</div>
                                </div>
                                <div className="modal-stat-item">
                                    <div className="modal-stat-label">SECURITY EVENTS</div>
                                    <div className="modal-stat-value">{eventStats.security}</div>
                                </div>
                                <div className="modal-stat-item">
                                    <div className="modal-stat-label">MARKED MACHINES</div>
                                    <div className="modal-stat-value">{markedMachines.length}</div>
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
        <div className="event-viewer-container">
            <div className="event-viewer-content">
                <div className="event-viewer-header">
                    <h1 className="event-viewer-title">Automation</h1> 
                    <div className="nav-buttons">
                        {navItems.map((item) => (
                            <button
                                key={item}
                                className={`nav-button ${
                                    item === 'Event Viewer' 
                                        ? 'nav-button-active' 
                                        : 'nav-button-inactive'
                                }`}
                                disabled={isFetchingRef.current || loading}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="event-viewer-grid">
                    <div className="events-main-card">
                        <div className="events-header">
                            <div className="events-title-section">
                                <h2 className="events-title">
                                    Windows Event Viewer
                                    {isConnected && <span className="real-data-badge">Live System</span>}
                                </h2>
                                {lastUpdated && (
                                    <div className="last-updated">
                                        Last updated: {lastUpdated.toLocaleTimeString()}
                                    </div>
                                )}
                            </div>

                            <div className="events-controls">
                                <button
                                    onClick={handleRefreshMachines}
                                    className="refresh-machines-btn"
                                    disabled={machinesLoading || isFetchingRef.current}
                                >
                                    {machinesLoading ? 'Loading...' : 'Refresh Machines'}
                                </button>

                                <button
                                    onClick={() => handleManualRefresh(selectedMachine)}
                                    className="refresh-button"
                                    disabled={loading || !isConnected || isFetchingRef.current || markedMachines.length === 0 || !selectedMachine}
                                >
                                    {loading ? 'Refreshing...' : 'Refresh Events'}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="error-message">
                                <div className="error-icon">⚠️</div>
                                <div className="error-text">{error}</div>
                                <button 
                                    className="btn-close-error" 
                                    onClick={() => setError(null)}
                                    disabled={isFetchingRef.current}
                                >
                                    ×
                                </button>
                            </div>
                        )}

                        <div className="machine-select-container">
                            {machinesLoading ? (
                                <div className="loading-message">
                                    <div className="loading-spinner"></div>
                                    Loading machine information...
                                </div>
                            ) : markedMachines.length === 0 ? (
                                <div className="no-machines-configured">
                                    <div className="configure-machines-prompt">
                                        <p>No marked machines found in database.</p>
                                        <p>Please mark machines as DNS, DHCP, or AD in Machine Management first.</p>
                                        <button 
                                            onClick={handleRefreshMachines}
                                            className="btn-refresh-machines-large"
                                        >
                                            Refresh Machine List
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="select-wrapper">
                                    <select
                                        value={selectedMachine}
                                        onChange={(e) => handleMachineSelect(e.target.value)}
                                        className="machine-select"
                                    >
                                        <option value="">Select a machine to view events...</option>
                                        {markedMachines.map(machine => (
                                            <option key={machine.id || machine.ip} value={machine.ip}>
                                                {machine.name || 'Unknown'} ({machine.ip}) - {getMachineRoles(machine)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {showSelectMessage && !selectedMachine && markedMachines.length > 0 && (
                            <div className="select-machine-message">
                                <div className="select-message-content">
                                    <div className="select-message-icon">ℹ️</div>
                                    <div className="select-message-text">
                                        <h3>Select a Machine to View Events</h3>
                                        <p>Please select a machine from the dropdown above to view its Windows Event Viewer logs.</p>
                                        <p>Once you select a machine, events will be fetched automatically.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedMachine && (
                            <div className="selected-machine-info">
                                <div className="selected-machine-header">
                                    <div className="selected-machine-name">
                                        {markedMachines.find(m => m.ip === selectedMachine)?.name || 'Unknown'}
                                    </div>
                                    <button
                                        onClick={() => handleManualRefresh(selectedMachine)}
                                        className="refresh-single-btn"
                                        disabled={loading}
                                    >
                                        {loading ? 'Refreshing...' : '⟳ Refresh'}
                                    </button>
                                </div>
                                <div className="selected-machine-details">
                                    <div className="machine-detail-item">
                                        <span className="detail-label">IP Address:</span>
                                        <span className="detail-value">{selectedMachine}</span>
                                    </div>
                                    <div className="machine-detail-item">
                                        <span className="detail-label">Username:</span>
                                        <span className="detail-value">
                                            {markedMachines.find(m => m.ip === selectedMachine)?.username || 'Unknown'}
                                        </span>
                                    </div>
                                    <div className="machine-detail-item">
                                        <span className="detail-label">Roles:</span>
                                        <span className="detail-value">
                                            {getMachineRoles(markedMachines.find(m => m.ip === selectedMachine))}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="category-tabs">
                            <button
                                className={`category-tab ${selectedCategory === 'system' ? 'active' : ''}`}
                                onClick={() => handleCategoryChange('system')}
                                disabled={markedMachines.length === 0 || isFetchingRef.current || !selectedMachine}
                            >
                                System Events ({events.system.length})
                            </button>
                            <button
                                className={`category-tab ${selectedCategory === 'application' ? 'active' : ''}`}
                                onClick={() => handleCategoryChange('application')}
                                disabled={markedMachines.length === 0 || isFetchingRef.current || !selectedMachine}
                            >
                                Application Events ({events.application.length})
                            </button>
                            <button
                                className={`category-tab ${selectedCategory === 'security' ? 'active' : ''}`}
                                onClick={() => handleCategoryChange('security')}
                                disabled={markedMachines.length === 0 || isFetchingRef.current || !selectedMachine}
                            >
                                Security Events ({events.security.length})
                            </button>
                        </div>

                        <div className="events-table-container">
                            {!isConnected ? (
                                <div className="no-connection-message">
                                    Not connected to backend system. Please check your connection.
                                </div>
                            ) : machinesLoading ? (
                                <div className="loading-message">
                                    <div className="loading-spinner"></div>
                                    Loading machine information...
                                </div>
                            ) : markedMachines.length === 0 ? (
                                <div className="no-machines-configured">
                                    <div className="configure-machines-prompt">
                                        <p>No marked machines found in database.</p>
                                        <p>Please mark machines as DNS, DHCP, or AD in Machine Management first.</p>
                                        <button 
                                            onClick={handleRefreshMachines}
                                            className="btn-refresh-machines-large"
                                        >
                                            Refresh Machine List
                                        </button>
                                    </div>
                                </div>
                            ) : !selectedMachine ? (
                                <div className="select-machine-prompt">
                                    <div className="prompt-content">
                                        <div className="prompt-text">
                                            <h3>No Machine Selected</h3>
                                            <p>Please select a machine from the dropdown above to view its event logs.</p>
                                            <p>Available machines: {markedMachines.length}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : loading ? (
                                <div className="loading-message">
                                    <div className="loading-spinner"></div>
                                    Loading event data from {markedMachines.find(m => m.ip === selectedMachine)?.name || 'Unknown'}...
                                </div>
                            ) : currentEvents.length === 0 ? (
                                <div className="no-events-message">
                                    No {selectedCategory} events found on {markedMachines.find(m => m.ip === selectedMachine)?.name || 'Unknown'}
                                </div>
                            ) : (
                                <table className="events-table">
                                    <thead>
                                        <tr>
                                            <th>Machine</th>
                                            <th>Level</th>
                                            <th>Date & Time</th>
                                            <th>Source</th>
                                            <th>Message</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {currentEvents.map((event, index) => (
                                            <tr key={index} className="event-row">
                                                <td className="event-machine-cell">
                                                    <div className="machine-info-small">
                                                        <span className="machine-name-small">{event.machineName || 'Unknown'}</span>
                                                        <span className="machine-ip-small">{event.machineIp || 'Unknown'}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="event-level-cell">
                                                        <span 
                                                            className="level-icon"
                                                            style={{ color: getEventLevelColor(event.LevelDisplayName) }}
                                                        >
                                                            {getEventLevelIcon(event.LevelDisplayName)}
                                                        </span>
                                                        <span className="level-text">
                                                            {event.LevelDisplayName || 'Information'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="event-time-cell">
                                                    {formatDate(event.TimeCreated)}
                                                </td>
                                                <td className="event-source-cell">
                                                    {event.ProviderName || 'Unknown'}
                                                </td>
                                                <td className="event-message-cell">
                                                    <div className="message-content">
                                                        {truncateMessage(event.Message, 100)}
                                                        {event.Message && event.Message.length > 100 && (
                                                            <button 
                                                                className="view-full-message"
                                                                onClick={() => alert(`Full Message:\n\n${event.Message}\n\nMachine: ${event.machineName || 'Unknown'} (${event.machineIp || 'Unknown'})`)}
                                                            >
                                                                View Full
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    <div className="events-sidebar">
                        <div className="stats-card"> 
                            <h3 className="stats-title">Event Summary</h3>
                            <div className="stats-grid">
                                <div className="stat-item system-stat">
                                    <div className="stat-info">
                                        <div className="stat-count">{events.system.length}</div>
                                        <div className="stat-label">System Events</div> 
                                    </div>
                                </div>
                                <div className="stat-item application-stat">
                                    <div className="stat-info">
                                        <div className="stat-count">{events.application.length}</div>
                                        <div className="stat-label">Application Events</div>
                                    </div>
                                </div>
                                <div className="stat-item security-stat">
                                    <div className="stat-info">
                                        <div className="stat-count">{events.security.length}</div>
                                        <div className="stat-label">Security Events</div>
                                    </div>
                                </div>
                                <div className="stat-item total-stat">
                                    <div className="stat-info">
                                        <div className="stat-count">
                                            {events.system.length + events.application.length + events.security.length}
                                        </div>
                                        <div className="stat-label">Total Events</div>
                                    </div>
                                </div>
                            </div>
                            <div className="machine-stats">
                                <div className="machine-stat">
                                    <span className="machine-stat-label">Marked Machines:</span>
                                    <span className="machine-stat-value">{markedMachines.length}</span>
                                </div>
                                {selectedMachine && (
                                    <div className="machine-stat">
                                        <span className="machine-stat-label">Selected Machine:</span>
                                        <span className="machine-stat-value">
                                            {markedMachines.find(m => m.ip === selectedMachine)?.name || 'Unknown'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="quick-actions-card">
                            <h3 className="actions-title">Quick Actions</h3>
                            <div className="action-buttons">
                                <button
                                    className="action-button"
                                    onClick={() => handleManualRefresh(selectedMachine)}
                                    disabled={!isConnected || isFetchingRef.current || markedMachines.length === 0 || !selectedMachine}
                                >
                                    Refresh Events
                                </button>
                                <button
                                    className="action-button"
                                    onClick={() => {
                                        const eventText = JSON.stringify(events, null, 2); 
                                        navigator.clipboard.writeText(eventText);
                                        alert('Event data copied to clipboard!');
                                    }}
                                    disabled={!isConnected || events.system.length + events.application.length + events.security.length === 0}
                                >
                                    Copy All Data
                                </button>
                                <button
                                    className="action-button"
                                    onClick={() => {
                                        if (currentEvents.length > 0) {
                                            const eventText = currentEvents.map(event => 
                                                `Machine: ${event.machineName || 'Unknown'} (${event.machineIp || 'Unknown'})\nTime: ${formatDate(event.TimeCreated)}\nLevel: ${event.LevelDisplayName}\nProvider: ${event.ProviderName}\nMessage: ${event.Message}\n${'-'.repeat(50)}`
                                            ).join('\n');
                                            navigator.clipboard.writeText(eventText);
                                            alert('Current category events copied to clipboard!');
                                        }
                                    }}
                                    disabled={currentEvents.length === 0}
                                >
                                    Copy Current Category
                                </button>
                                {selectedMachine && (
                                    <button
                                        className="action-button"
                                        onClick={() => {
                                            setSelectedMachine('');
                                            setShowSelectMessage(true);
                                            setEvents({
                                                system: [],
                                                application: [],
                                                security: []
                                            });
                                        }}
                                        disabled={!isConnected || isFetchingRef.current}
                                    >
                                        View All Machines
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="connection-status-card">
                            <h3 className="status-title">Connection Status</h3>
                                <div className="status-text">
                                    {isConnected ? 'Connected to System' : 'Disconnected'}
                                </div>
                            {isConnected && (
                                <div className="status-details">
                                    <div className="status-detail">
                                        <span className="detail-label">Marked Machines:</span>
                                        <span className="detail-value">
                                            {markedMachines.length}
                                        </span>
                                    </div>
                                    {selectedMachine && (
                                        <div className="status-detail">
                                            <span className="detail-label">Viewing:</span>
                                            <span className="detail-value">
                                                {markedMachines.find(m => m.ip === selectedMachine)?.name || 'Unknown'}
                                            </span>
                                        </div>
                                    )}
                                    <div className="status-detail">
                                        <span className="detail-label">Last Refresh:</span>
                                        <span className="detail-value">
                                            {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
                                        </span>
                                    </div>
                                    
                                    <div className="status-detail">
                                        <span className="detail-label">Status:</span>
                                        <span className="detail-value">
                                            {isFetchingRef.current ? 'Fetching...' : 'Ready'}
                                        </span>
                                    </div>
                                </div>
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
};

export default EventViewer;