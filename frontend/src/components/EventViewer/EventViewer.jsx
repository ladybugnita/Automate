import React, { useEffect, useState, useCallback, useRef } from 'react';
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
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('system');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [markedMachines, setMarkedMachines] = useState([]);
    const [machinesLoading, setMachinesLoading] = useState(true);
    const [showMarkModal, setShowMarkModal] = useState(false);
    const [selectedMachine, setSelectedMachine] = useState('');
    const [error, setError] = useState(null);
    
    const isFetchingRef = useRef(false);
    const timeoutRef = useRef(null);
    const machineInfoListenerRef = useRef(false);

    const navItems = [
        'Dashboard', 'DNS Configuration', 'Event Viewer', 'DHCP', 'Users', 
        'Resource Monitor', 'ESXi', 'Switch', 'Machine Management', 
        'Active Directory', 'Routing'
    ];

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
        console.log('Event Viewer: Fetching ALL machines from database...');
        setMachinesLoading(true);
        setError(null);
        
        sendCommand('get_machine_info', {});
    }, [sendCommand]);

    const processMachineInfo = useCallback((machines) => {
        console.log('Event Viewer: Processing ALL machines info:', machines);
        
        if (!machines || !Array.isArray(machines)) {
            console.error('Event Viewer: Invalid machine data received:', machines);
            setError('Invalid machine data received from server');
            setMachinesLoading(false);
            return;
        }

        const markedMachinesList = machines.filter(machine => {
            return machine.marked_as && 
                   Array.isArray(machine.marked_as) && 
                   machine.marked_as.length > 0;
        });

        console.log(`Event Viewer: Found ${markedMachinesList.length} marked machines:`, markedMachinesList);
        setMarkedMachines(markedMachinesList);
        
        setMachinesLoading(false);
        
        if (markedMachinesList.length > 0) {
            console.log('Event Viewer: Automatically fetching events for all marked machines');
            fetchEventDataForAllMachines(markedMachinesList);
        } else {
            setShowMarkModal(true);
        }
    }, []);

    const getWindowsInfoForMachine = (machine) => {
        if (!machine) {
            console.error('Event Viewer: No machine provided to getWindowsInfoForMachine');
            return null;
        }
        
        console.log(`Event Viewer: Getting Windows info for machine: ${machine.name} (${machine.ip})`);
        
        if (!machine.password) {
            console.error('Event Viewer: No password found for machine:', machine.name);
            setError(`No password found for machine: ${machine.name}`);
            return null;
        }
        
        return {
            ip: machine.ip,
            username: machine.username || 'admin',
            password: machine.password
        };
    };

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
        
        console.log(`Event Viewer: Creating payload for single machine: ${machine.name}`);
        
        // Send only credentials, not log_name
        return {
            windows_info: windowsInfo
        };
    }, []);

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
            }
        });
        
        if (windowsInfos.length === 0) {
            console.error('Event Viewer: Failed to get Windows info for any marked machine');
            setError('Failed to get credentials for marked machines');
            return null;
        }
        
        console.log(`Event Viewer: Creating payload for ${windowsInfos.length} machine(s)`);
        
        // Send only credentials, not log_name
        return {
            windows_infos: windowsInfos
        };
    }, []);

    const categorizeEvent = (event) => {
        // Try to get log name from various possible fields
        const logName = event.LogName || event.log_name || event.Log || '';
        const logNameLower = logName.toLowerCase();
        
        // Also check ProviderName or Source which might indicate the log type
        const provider = event.ProviderName || event.provider || '';
        const providerLower = provider.toLowerCase();
        
        // Check for security-related indicators
        const eventId = event.EventID || event.EventId || event.Id || '';
        
        // Security events often have specific Event IDs or providers
        if (logNameLower.includes('security') || 
            providerLower.includes('security') ||
            providerLower.includes('audit') ||
            (eventId >= 4600 && eventId <= 4699) || // Windows security event range
            providerLower.includes('microsoft-windows-security-auditing')) {
            return 'security';
        }
        
        // Application events
        if (logNameLower.includes('application') || 
            providerLower.includes('application') ||
            (!logNameLower.includes('system') && !logNameLower.includes('security'))) {
            return 'application';
        }
        
        // System events (default)
        if (logNameLower.includes('system') || 
            logName === '' || 
            providerLower.includes('system') ||
            providerLower.includes('microsoft-windows-kernel')) {
            return 'system';
        }
        
        // Default to system if can't determine
        return 'system';
    };

    const handleWebSocketMessage = useCallback((data) => {
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
                console.log('Event Viewer: Received machine info');
                if (responseData && responseData.machines) {
                    processMachineInfo(responseData.machines);
                } else if (responseData && responseData.success === false) {
                    setError(responseData.error || 'Failed to fetch machine info');
                    setMachinesLoading(false);
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
                    
                    // Initialize event arrays
                    const systemEvents = [];
                    const applicationEvents = [];
                    const securityEvents = [];
                    
                    // Process events based on data structure
                    if (Array.isArray(eventData)) {
                        // Direct array of events
                        eventData.forEach(event => {
                            const enhancedEvent = {
                                ...event,
                                machineName: event.machine_name || event.machineName || 'Unknown',
                                machineIp: event.machine_ip || event.machineIp || 'Unknown'
                            };
                            
                            // Categorize the event
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
                        // Could be object with categories or machine-based grouping
                        if (eventData.system || eventData.application || eventData.security) {
                            // Already categorized
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
                            // Might be grouped by machine IP or other keys
                            Object.keys(eventData).forEach(key => {
                                const eventsList = eventData[key];
                                if (Array.isArray(eventsList)) {
                                    eventsList.forEach(event => {
                                        const enhancedEvent = {
                                            ...event,
                                            machineName: event.machine_name || event.machineName || 'Unknown',
                                            machineIp: event.machine_ip || event.machineIp || 'Unknown'
                                        };
                                        
                                        // Categorize the event
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
    }, [processMachineInfo]);

    const fetchEventDataForSingleMachine = useCallback((machine) => {
        if (isFetchingRef.current) {
            console.log('Event Viewer: Already fetching event data, skipping...');
            return;
        }

        if (!isConnected) {
            console.log('Event Viewer: WebSocket not connected');
            setError('Not connected to backend system');
            setLoading(false);
            return;
        }

        console.log(`Event Viewer: Fetching events for single machine: ${machine.name} (${machine.ip})`);
        setLoading(true);
        setError(null);
        isFetchingRef.current = true;
        
        const payload = createEventViewerPayloadForSingleMachine(machine);
        if (!payload) {
            setLoading(false);
            isFetchingRef.current = false;
            return;
        }
        
        console.log('Event Viewer: Sending payload (credentials only, no log_name):', payload);
        sendCommand('get_event_viewer_data', payload);

        timeoutRef.current = setTimeout(() => {
            if (isFetchingRef.current) {
                console.log('Event Viewer: Timeout: No response from backend for event data');
                setError('Timeout: No response from server');
                setLoading(false);
                isFetchingRef.current = false;
                timeoutRef.current = null;
            }
        }, 30000);
    }, [isConnected, sendCommand, createEventViewerPayloadForSingleMachine]);

    const fetchEventDataForAllMachines = useCallback((machines = markedMachines) => {
        if (isFetchingRef.current) {
            console.log('Event Viewer: Already fetching event data, skipping...');
            return;
        }

        if (!isConnected) {
            console.log('Event Viewer: WebSocket not connected');
            setError('Not connected to backend system');
            setLoading(false);
            return;
        }

        if (!machines || machines.length === 0) {
            console.log('Event Viewer: No marked machines found');
            setError('No marked machines found. Please mark machines as DNS, DHCP, or AD in Machine Management first.');
            setLoading(false);
            return;
        }

        console.log(`Event Viewer: Fetching events for ${machines.length} marked machine(s)...`);
        setLoading(true);
        setError(null);
        isFetchingRef.current = true;
        
        const payload = createEventViewerPayloadForAllMachines(machines);
        if (!payload) {
            setLoading(false);
            isFetchingRef.current = false;
            return;
        }
        
        console.log('Event Viewer: Sending payload (credentials only, no log_name):', payload);
        sendCommand('get_event_viewer_data', payload);

        timeoutRef.current = setTimeout(() => {
            if (isFetchingRef.current) {
                console.log('Event Viewer: Timeout: No response from backend for event data');
                setError('Timeout: No response from server');
                setLoading(false);
                isFetchingRef.current = false;
                timeoutRef.current = null;
            }
        }, 30000);
    }, [isConnected, markedMachines, sendCommand, createEventViewerPayloadForAllMachines]);

    const handleMachineSelect = useCallback((machineIp) => {
        setSelectedMachine(machineIp);
        
        if (machineIp) {
            const machine = markedMachines.find(m => m.ip === machineIp);
            if (machine) {
                fetchEventDataForSingleMachine(machine);
            }
        } else {
            fetchEventDataForAllMachines();
        }
    }, [markedMachines, fetchEventDataForSingleMachine, fetchEventDataForAllMachines]);

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
    }, [isConnected, markedMachines.length, fetchEventDataForAllMachines, fetchEventDataForSingleMachine, isFetchingRef]);

    const handleRefreshMachines = () => {
        fetchMachineInfo();
    };

    useEffect(() => {
        if (autoRefresh && markedMachines.length > 0) {
            const interval = setInterval(() => {
                if (!isFetchingRef.current) {
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
        if (!machineInfoListenerRef.current) {
            console.log('Event Viewer Component Mounted - Setting up WebSocket listener');
            const removeListener = addListener(handleWebSocketMessage);
            machineInfoListenerRef.current = true;
            
            return () => {
                if (removeListener) removeListener();
                machineInfoListenerRef.current = false;
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
            };
        }
    }, [addListener, handleWebSocketMessage]);

    useEffect(() => {
        if (isConnected && markedMachines.length === 0) {
            console.log('Event Viewer: Connected, fetching machine info...');
            fetchMachineInfo();
        }
    }, [isConnected, fetchMachineInfo, markedMachines.length]);

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
        if (!showMarkModal) return null;

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
                                    disabled={loading || !isConnected || isFetchingRef.current || markedMachines.length === 0}
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
                                            <option key={machine.id} value={machine.ip}>
                                                {machine.name} ({machine.ip}) - {getMachineRoles(machine)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        {selectedMachine && (
                            <div className="selected-machine-info">
                                <div className="selected-machine-header">
                                    <div className="selected-machine-name">
                                        {markedMachines.find(m => m.ip === selectedMachine)?.name}
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
                                            {markedMachines.find(m => m.ip === selectedMachine)?.username}
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
                                disabled={markedMachines.length === 0 || isFetchingRef.current}
                            >
                                System Events ({events.system.length})
                            </button>
                            <button
                                className={`category-tab ${selectedCategory === 'application' ? 'active' : ''}`}
                                onClick={() => handleCategoryChange('application')}
                                disabled={markedMachines.length === 0 || isFetchingRef.current}
                            >
                                Application Events ({events.application.length})
                            </button>
                            <button
                                className={`category-tab ${selectedCategory === 'security' ? 'active' : ''}`}
                                onClick={() => handleCategoryChange('security')}
                                disabled={markedMachines.length === 0 || isFetchingRef.current}
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
                            ) : loading ? (
                                <div className="loading-message">
                                    <div className="loading-spinner"></div>
                                    Loading event data from {selectedMachine ? 
                                        `${markedMachines.find(m => m.ip === selectedMachine)?.name}` : 
                                        `${markedMachines.length} machine(s)`}...
                                </div>
                            ) : currentEvents.length === 0 ? (
                                <div className="no-events-message">
                                    No {selectedCategory} events found {selectedMachine ? 
                                        `on ${markedMachines.find(m => m.ip === selectedMachine)?.name}` : 
                                        'on marked machine(s)'}
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
                                            {markedMachines.find(m => m.ip === selectedMachine)?.name}
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
                                    disabled={!isConnected || isFetchingRef.current || markedMachines.length === 0}
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
                                        onClick={() => setSelectedMachine('')}
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
                                                {markedMachines.find(m => m.ip === selectedMachine)?.name}
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