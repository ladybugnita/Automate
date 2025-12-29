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
    const { isConnected, sendCommand, getCommandResponse, addListener } = useWebSocket();
    const [events, setEvents] = useState({
        system: [],
        application: [],
        security: []
    });
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('system');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    
    const isFetchingRef = useRef(false);
    const timeoutRef = useRef(null);

    const navItems = [
        'Dashboard', 'DNS Configuration', 'Event Viewer', 'DHCP', 'Users', 
        'Resource Monitor', 'WDS', 'Networking', 'Device Auto Config', 
        'Active Directory', 'Routing'
    ];

    useEffect(() => {
        const removeListener = addListener((data) => {
            console.log('Event Viewer WebSocket message:', data);

            if ((data.action === 'response' && data.command === 'get_event_viewer_data' && data.result) ||
                (data.type === 'COMMAND_RESPONSE' && data.command === 'get_event_viewer_data' && data.data)) {
                
                console.log('Processing event viewer data');
                isFetchingRef.current = false;

                let resultData = data.result || data.data;
                let parsedResult = resultData;

                if (typeof parsedResult === 'string') {
                    try {
                        parsedResult = JSON.parse(parsedResult);
                    } catch (e) {
                        console.log('Event viewer result is not JSON, keeping as string');
                    }
                }

                let eventData = null;
                
                if (parsedResult && parsedResult.result && parsedResult.result.data) {
                    eventData = parsedResult.result.data;
                } else if (parsedResult && parsedResult.data) {
                    eventData = parsedResult.data;
                } else if (parsedResult) {
                    eventData = parsedResult;
                }

                if (eventData) {
                    console.log('Loaded event viewer data:', eventData);
                    
                    setEvents({
                        system: eventData.system || [],
                        application: eventData.application || [],
                        security: eventData.security || []
                    });
                    
                    setLoading(false);
                    setLastUpdated(new Date());
                } else {
                    console.log('No event data found in response');
                    setLoading(false);
                }
                
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
            }
        });

        return () => {
            removeListener();
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [addListener]);

    const fetchEventData = useCallback(() => {
        if (isFetchingRef.current) {
            console.log('Already fetching event data, skipping...');
            return;
        }

        if (isConnected) {
            console.log('Fetching event viewer data...');
            setLoading(true);
            isFetchingRef.current = true;
            
            sendCommand('get_event_viewer_data');

            timeoutRef.current = setTimeout(() => {
                if (isFetchingRef.current) {
                    console.log('Timeout: No response from backend for event data');
                    setLoading(false);
                    isFetchingRef.current = false;
                }
            }, 15000); 
        } else {
            console.log('WebSocket not connected, cannot fetch event data');
            setLoading(false);
            isFetchingRef.current = false;
        }
    }, [isConnected, sendCommand]);

    useEffect(() => {
        if (autoRefresh) {
            const interval = setInterval(() => {
                if (!isFetchingRef.current) {
                    fetchEventData();
                }
            }, 30000); 

            return () => clearInterval(interval);
        }
    }, [autoRefresh, fetchEventData]);

    useEffect(() => {
        fetchEventData();
        
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            isFetchingRef.current = false;
        };
    }, [fetchEventData]);

    const handleCategoryChange = (category) => {
        setSelectedCategory(category);
    };

    const handleManualRefresh = () => {
        if (!isConnected) {
            alert('Cannot refresh: Not connected to backend system');
            return;
        }
        if (isFetchingRef.current) {
            console.log('Already refreshing, please wait...');
            return;
        }
        fetchEventData();
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
                                    onClick={handleManualRefresh} 
                                    className="refresh-button"
                                    disabled={loading || !isConnected || isFetchingRef.current}
                                >
                                    {loading ? 'Refreshing...' : 'Refresh'}
                                </button>

                                <label className="auto-refresh-toggle">
                                    <input
                                        type="checkbox"
                                        checked={autoRefresh}
                                        onChange={(e) => setAutoRefresh(e.target.checked)}
                                        disabled={!isConnected}
                                    />
                                    Auto Refresh 
                                </label>
                            </div>
                        </div>

                        <div className="category-tabs">
                            <button
                                className={`category-tab ${selectedCategory === 'system' ? 'active' : ''}`}
                                onClick={() => handleCategoryChange('system')}
                            >
                                System Events ({events.system.length})
                            </button>
                            <button
                                className={`category-tab ${selectedCategory === 'application' ? 'active' : ''}`}
                                onClick={() => handleCategoryChange('application')}
                            >
                                Application Events ({events.application.length})
                            </button>
                            <button
                                className={`category-tab ${selectedCategory === 'security' ? 'active' : ''}`}
                                onClick={() => handleCategoryChange('security')}
                            >
                                Security Events ({events.security.length})
                            </button>
                        </div>

                        <div className="events-table-container">
                            {!isConnected ? (
                                <div className="no-connection-message">
                                    Not connected to backend system. Please check your connection.
                                </div>
                            ) : loading ? (
                                <div className="loading-message">
                                    <div className="loading-spinner"></div>
                                    Loading event data from system...
                                </div>
                            ) : currentEvents.length === 0 ? (
                                <div className="no-events-message">
                                    No {selectedCategory} events found in the system
                                </div>
                            ) : (
                                <table className="events-table">
                                    <thead>
                                        <tr>
                                            <th>Level</th>
                                            <th>Date & Time</th>
                                            <th>Source</th>
                                            <th>Message</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {currentEvents.map((event, index) => (
                                            <tr key={index} className="event-row">
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
                                                                onClick={() => alert(`Full Message:\n\n${event.Message}`)}
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
                        </div>

                        <div className="quick-actions-card">
                            <h3 className="actions-title">Quick Actions</h3>
                            <div className="action-buttons">
                                <button
                                    className="action-button"
                                    onClick={handleManualRefresh}
                                    disabled={!isConnected || isFetchingRef.current}
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
                                    disabled={!isConnected}
                                >
                                    Copy All Data
                                </button>
                                <button
                                    className="action-button"
                                    onClick={() => {
                                        if (currentEvents.length > 0) {
                                            const eventText = currentEvents.map(event => 
                                                `Time: ${formatDate(event.TimeCreated)}\nLevel: ${event.LevelDisplayName}\nProvider: ${event.ProviderName}\nMessage: ${event.Message}\n${'-'.repeat(50)}`
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
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EventViewer;