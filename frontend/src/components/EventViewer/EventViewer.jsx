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
            fetchEventData(markedMachinesList);
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

    const createEventViewerPayload = (machines) => {
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
        
        return {
            windows_infos: windowsInfos,
            log_name: selectedCategory 
        };
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
                console.log('Event Viewer: Processing event viewer data for all marked machines');
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
                    console.log('Event Viewer: Loaded aggregated event viewer data:', eventData);
                    
                    if (Array.isArray(eventData)) {
                        const systemEvents = [];
                        const applicationEvents = [];
                        const securityEvents = [];
                        
                        eventData.forEach(event => {
                            const enhancedEvent = {
                                ...event,
                                machineName: event.machine_name || 'Unknown',
                                machineIp: event.machine_ip || 'Unknown'
                            };
                            
                            const logName = event.LogName || event.log_name || '';
                            if (logName.toLowerCase().includes('system')) {
                                systemEvents.push(enhancedEvent);
                            } else if (logName.toLowerCase().includes('application')) {
                                applicationEvents.push(enhancedEvent);
                            } else if (logName.toLowerCase().includes('security')) {
                                securityEvents.push(enhancedEvent);
                            } else {
                                systemEvents.push(enhancedEvent);
                            }
                        });
                        
                        setEvents({
                            system: systemEvents,
                            application: applicationEvents,
                            security: securityEvents
                        });
                    } else if (eventData.system || eventData.application || eventData.security) {
                        setEvents({
                            system: eventData.system || [],
                            application: eventData.application || [],
                            security: eventData.security || []
                        });
                    } else if (eventData.events) {
                        setEvents({
                            system: eventData.events.system || [],
                            application: eventData.events.application || [],
                            security: eventData.events.security || []
                        });
                    } else {
                        const allEvents = Object.values(eventData).flat().filter(Boolean);
                        setEvents({
                            system: allEvents || [],
                            application: [],
                            security: []
                        });
                    }
                    
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

    const fetchEventData = useCallback((machines = markedMachines) => {
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

        console.log(`Event Viewer: Fetching event viewer data for ${machines.length} marked machine(s)...`);
        setLoading(true);
        setError(null);
        isFetchingRef.current = true;
        
        const payload = createEventViewerPayload(machines);
        if (!payload) {
            setLoading(false);
            isFetchingRef.current = false;
            return;
        }
        
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
    }, [isConnected, markedMachines, sendCommand, selectedCategory]);

    const getEventStats = () => {
        return {
            system: events.system.length,
            application: events.application.length,
            security: events.security.length,
            total: events.system.length + events.application.length + events.security.length
        };
    };

    const handleManualRefresh = useCallback(() => {
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
        
        fetchEventData();
    }, [isConnected, markedMachines.length, fetchEventData, isFetchingRef]);

    useEffect(() => {
        if (autoRefresh && markedMachines.length > 0) {
            const interval = setInterval(() => {
                if (!isFetchingRef.current) {
                    fetchEventData();
                }
            }, 30000);

            return () => clearInterval(interval);
        }
    }, [autoRefresh, fetchEventData, markedMachines]);

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

    useEffect(() => {
        if (markedMachines.length > 0 && isConnected) {
            console.log('Event Viewer: Category changed, fetching events for all marked machines...');
            fetchEventData();
        }
    }, [selectedCategory, fetchEventData, isConnected]);

    const handleCategoryChange = (category) => {
        setSelectedCategory(category);
    };

    const handleRefreshMachines = () => {
        fetchMachineInfo();
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
                                {markedMachines.length > 0 && (
                                    <div className="selected-machines-info">
                                        <span className="machines-count">
                                            Monitoring {markedMachines.length} marked machine(s)
                                        </span>
                                        <span className="machines-list">
                                            {markedMachines.map(m => m.name).join(', ')}
                                        </span>
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
                                    onClick={handleManualRefresh} 
                                    className="refresh-button"
                                    disabled={loading || !isConnected || isFetchingRef.current || markedMachines.length === 0}
                                >
                                    {loading ? 'Refreshing...' : 'Refresh Events'}
                                </button>

                                <label className="auto-refresh-toggle">
                                    <input
                                        type="checkbox"
                                        checked={autoRefresh}
                                        onChange={(e) => setAutoRefresh(e.target.checked)}
                                        disabled={!isConnected || markedMachines.length === 0}
                                    />
                                    Auto Refresh 
                                </label>
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
                                    Loading event data from {markedMachines.length} machine(s)...
                                </div>
                            ) : currentEvents.length === 0 ? (
                                <div className="no-events-message">
                                    No {selectedCategory} events found on marked machine(s)
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
                            </div>
                        </div>

                        <div className="quick-actions-card">
                            <h3 className="actions-title">Quick Actions</h3>
                            <div className="action-buttons">
                                <button
                                    className="action-button"
                                    onClick={handleManualRefresh}
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
                                    <div className="status-detail">
                                        <span className="detail-label">Last Refresh:</span>
                                        <span className="detail-value">
                                            {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
                                        </span>
                                    </div>
                                    <div className="status-detail">
                                        <span className="detail-label">Auto Refresh:</span>
                                        <span className="detail-value">
                                            {autoRefresh ? 'Enabled' : 'Disabled'}
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

                        <div className="machine-list-card">
                            <div className="machine-list-header">
                                <h3 className="machine-list-title">Marked Machines</h3>
                                <div className="machine-list-actions">
                                    <span className="selection-count">
                                        {markedMachines.length} total
                                    </span>
                                </div>
                            </div>
                            <div className="machine-list">
                                {markedMachines.length === 0 ? (
                                    <div className="no-machines">
                                        <p>No marked machines found</p>
                                        <button 
                                            onClick={handleRefreshMachines}
                                            className="btn-refresh-machines-small"
                                        >
                                            Refresh List
                                        </button>
                                    </div>
                                ) : (
                                    <div className="machine-items">
                                        {markedMachines.map(machine => (
                                            <div 
                                                key={machine.id}
                                                className="machine-item"
                                            >
                                                <div className="machine-item-header">
                                                    <div className="machine-item-name">{machine.name}</div>
                                                </div>
                                                <div className="machine-item-ip">{machine.ip}</div>
                                                <div className="machine-item-user">{machine.username}</div>
                                                {machine.marked_as && Array.isArray(machine.marked_as) && machine.marked_as.length > 0 && (
                                                    <div className="machine-item-roles">
                                                        {machine.marked_as.map((mark, idx) => (
                                                            <span key={idx} className={`role-badge ${mark.role}`}>
                                                                {mark.role} {mark.type}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
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