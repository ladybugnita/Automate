import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../Context/WebSocketContext'; 
import { useNavigate } from 'react-router-dom';

function ESXiValidation({ onSuccess, initialData = {} }) {
    const context = useWebSocket();
    const navigate = useNavigate();
    console.log('WebSocket Context in ESXiValidation:', context);

    const [esxiInfo, setEsxiInfo] = useState({
        ip: initialData.ip || '',
        username: initialData.username || 'root',
        password: '',
        name: initialData.name || ''
    });
    
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [vmDetails, setVmDetails] = useState(null); 
    
    const { 
        sendCommandAsync, 
        isConnected, 
        saveEsxiCredentials 
    } = useWebSocket();
    
    const isValidIP = (ip) => {
        const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipPattern.test(ip);
    };

    useEffect(() => {
        if (!isConnected) {
            console.warn('WebSocket is not connected. Some features may not work.');
        }
    }, [isConnected]);
    
    const fetchVMDetailsFromESXi = async (ip, username, password) => {
        try {
            console.log('Fetching VM details directly from ESXi host:', ip);
            
            const vmDetailsResponse = await sendCommandAsync(
                "get_vm_details",
                { 
                    esxi_info: {
                        ip: ip,
                        username: username,
                        password: password
                    }
                }
            );
            
            console.log('Direct ESXi VM details response:', vmDetailsResponse);
            
            const result = vmDetailsResponse?.result || vmDetailsResponse;
            
            if (result && result.success) {
                return result;
            } else {
                console.warn('Failed to get VM details from ESXi:', result?.error);
                return null;
            }
        } catch (error) {
            console.error('Error fetching VM details from ESXi:', error);
            return null;
        }
    };
    
    const handleEsxiValidation = async (e) => {
        if (e) e.preventDefault();

        if (!isConnected) {
            setResult({
                validation: false,
                savedToDb: false,
                message: 'WebSocket connection is not established. Please check your connection.'
            });
            return;
        }

        if (!isValidIP(esxiInfo.ip)) {
            setResult({
                validation: false,
                savedToDb: false,
                message: 'Invalid IP address format. Please use format like 192.168.1.100'
            });
            return;
        }

        if(!esxiInfo.ip || !esxiInfo.password){
            setResult({
                validation: false,
                savedToDb: false,
                message: 'IP address and password are required'
            });
            return;
        }
        
        try {
            setLoading(true);
            setResult(null);
            setVmDetails(null); 
            console.log('Starting ESXi validation for:', esxiInfo.ip);

            console.log('Sending validation command via WebSocket...');
            const validationResponse = await sendCommandAsync(
                "validate_esxi_connection_and_credentials",
                { 
                    esxi_info: {
                        ip: esxiInfo.ip,
                        username: esxiInfo.username,
                        password: esxiInfo.password
                    }
                }
            );
            
            console.log('WebSocket validation response:', validationResponse);

            const result = validationResponse?.result || validationResponse;
            
            const isValid = result && 
                           (result.valid === true || 
                            result.valid === "true" ||
                            (typeof result === 'string' && result.toLowerCase().includes('valid')));
            
            console.log('Is validation valid?', isValid);
            
            if(isValid){
                console.log('WebSocket validation successful, saving to database...');

                if (!saveEsxiCredentials) {
                    throw new Error('saveEsxiCredentials is not available in WebSocket context');
                }
                
                console.log('Calling saveEsxiCredentials...');
                
                const saveResult = await saveEsxiCredentials({
                    connection_name: esxiInfo.name || `ESXi-${esxiInfo.ip}`,
                    host_ip: esxiInfo.ip, 
                    username: esxiInfo.username,
                    password: esxiInfo.password,
                    installation_type: 'existing', 
                    status: 'connected'
                });
                
                console.log('Save result:', saveResult);

                if(saveResult && saveResult.success) {
                    console.log('ESXi credentials saved to database successfully');
                    const hostId = saveResult.data?.id || saveResult.data?.host_id;
                    
                    const successData = {
                        ...esxiInfo,
                        id: hostId,
                        host_id: hostId,
                        status: 'connected',
                        installation_type: 'existing'
                    };
                    
                    const initialResult = {
                        validation: true,
                        savedToDb: true,
                        message: 'Validation successful and saved to database',
                        hostId: hostId,
                        installation_type: 'existing'
                    };
                    
                    setResult(initialResult);
                    
                    try {
                        console.log('Fetching VM details directly from ESXi host...');
                        const vmDetailsResponse = await fetchVMDetailsFromESXi(
                            esxiInfo.ip,
                            esxiInfo.username,
                            esxiInfo.password
                        );
                        
                        if (vmDetailsResponse) {
                            console.log('VM details fetched successfully from ESXi:', vmDetailsResponse);
                            setVmDetails(vmDetailsResponse);
                            
                            const updatedResult = {
                                ...initialResult,
                                vmDetails: vmDetailsResponse,
                                hasVmDetails: true,
                                message: 'Validation successful, saved to database, and VM details loaded'
                            };
                            
                            setResult(updatedResult);
                            
                            successData.vmDetails = vmDetailsResponse;
                            successData.hasVmDetails = true;
                            successData.host_info = vmDetailsResponse.host_info;
                        } else {
                            console.log('Could not fetch VM details from ESXi, but validation was successful');
                            successData.vmDetails = null;
                            successData.hasVmDetails = false;
                        }
                    } catch (vmError) {
                        console.warn('Could not fetch VM details from ESXi:', vmError);
                        successData.vmDetails = null;
                        successData.hasVmDetails = false;
                        
                        setResult({
                            ...initialResult,
                            message: 'Validation successful and saved to database, but could not load VM details'
                        });
                    }
                    
                    setEsxiInfo(prev => ({ ...prev, password: '' }));
                    
                    if (onSuccess) {
                        console.log('Calling onSuccess callback with data:', successData);
                        onSuccess(successData);
                    } else {
                        console.log('No onSuccess callback provided. Would navigate to ESXi details page.');
                        if (hostId) {
                            navigate(`/esxi/${hostId}`);
                        }
                    }

                } else {
                    console.error('Failed to save to database:', saveResult?.error);
                    setResult({
                        validation: true,
                        savedToDb: false,
                        message: saveResult?.error || 'Validation successful but failed to save to database'
                    });
                }
            } else {
                const errorMsg = result?.message || 'Validation failed';
                console.log('Validation failed with message:', errorMsg);
                setResult({
                    validation: false,
                    savedToDb: false,
                    message: errorMsg
                });
            }
        } catch (error) {
            console.error('Error in ESXi validation:', error);
            
            let errorMessage = error.message;
            if (error.message.includes('saveEsxiCredentials is not available')) {
                errorMessage = 'WebSocket context error: saveEsxiCredentials function is not available.';
            } else if (error.message.includes('Host IP and password are required')) {
                errorMessage = 'Host IP and password are required for saving to database';
            }
            
            setResult({
                validation: false,
                savedToDb: false,
                message: errorMessage
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="esxi-validation">
            <h3>Validate ESXi Connection</h3>
            
            {!isConnected && (
                <div className="connection-warning">
                    <i className="fas fa-exclamation-triangle"></i> 
                    WebSocket is not connected. Validation may not work.
                </div>
            )}
            
            <form onSubmit={handleEsxiValidation}>
                <div className="form-group">
                    <label>IP Address *</label>
                    <input 
                        value={esxiInfo.ip}
                        onChange={(e) => setEsxiInfo({...esxiInfo, ip: e.target.value})}
                        placeholder="192.168.1.100"
                        required
                        disabled={loading}
                    />
                    <small style={{color: '#666', fontSize: '12px'}}>Format: 192.168.1.100</small>
                </div>
                
                <div className="form-group">
                    <label>Username</label>
                    <input 
                        value={esxiInfo.username}
                        onChange={(e) => setEsxiInfo({...esxiInfo, username: e.target.value})}
                        placeholder="root"
                        disabled={loading}
                    />
                </div>
                
                <div className="form-group">
                    <label>Password *</label>
                    <input 
                        type="password"
                        value={esxiInfo.password}
                        onChange={(e) => setEsxiInfo({...esxiInfo, password: e.target.value})}
                        placeholder="ESXi password"
                        required
                        disabled={loading}
                    />
                </div>
                
                <div className="form-group">
                    <label>Connection Name (Optional)</label>
                    <input 
                        value={esxiInfo.name}
                        onChange={(e) => setEsxiInfo({...esxiInfo, name: e.target.value})}
                        placeholder={`ESXi-${esxiInfo.ip || 'Server'}`}
                        disabled={loading}
                    />
                </div>
                
                <button 
                    type="submit" 
                    disabled={loading || !esxiInfo.ip || !esxiInfo.password}
                    className="validate-btn"
                >
                    {loading ? (
                        <>
                            <span className="spinner"></span>
                            Validating & Saving...
                        </>
                    ) : (
                        'Validate & Save Connection'
                    )}
                </button>
            </form>
            
            {result && (
                <div className={`result-message ${result.validation ? 'success' : 'error'}`}>
                    <h4>Result:</h4>
                    <p><strong>WebSocket Validation:</strong> {result.validation ? '✓ Success' : '✗ Failed'}</p>
                    {result.validation && (
                        <>
                            <p><strong>Database Save:</strong> {result.savedToDb ? '✓ Success' : '✗ Failed'}</p>
                            <p><strong>Installation Type:</strong> {result.installation_type || 'existing'}</p>
                        </>
                    )}
                    <p><strong>Message:</strong> {result.message}</p>
                    
                    {result.savedToDb && (
                        <div className="success-note">
                            <p><i className="fas fa-check-circle"></i> Connection saved successfully!</p>
                            <p><i className="fas fa-spinner fa-spin"></i> Loading VM details directly from ESXi...</p>
                        </div>
                    )}
                    
                    {result.vmDetails && result.vmDetails.vms && result.vmDetails.vms.length > 0 ? (
                        <div className="vm-details-summary">
                            <h5>Virtual Machines Found (Real-time from ESXi):</h5>
                            <div className="vm-list">
                                {result.vmDetails.vms.map((vm, index) => (
                                    <div key={index} className="vm-item">
                                        <span className="vm-name">{vm.name}</span>
                                        <span className={`vm-status ${(vm.status || vm.power_state || 'unknown').toLowerCase()}`}>
                                            {(vm.status || vm.power_state) === 'poweredOn' ? '● Running' : 
                                             (vm.status || vm.power_state) === 'poweredOff' ? '● Stopped' : '● Unknown'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {result.vmDetails.host_info && (
                                <div className="host-info-summary">
                                    <h6>ESXi Host Information:</h6>
                                    <p><strong>Hostname:</strong> {result.vmDetails.host_info.hostname}</p>
                                    <p><strong>Version:</strong> {result.vmDetails.host_info.esxi_version}</p>
                                    <p><strong>Total VMs:</strong> {result.vmDetails.host_info.total_vms} (Running: {result.vmDetails.host_info.powered_on_vms})</p>
                                </div>
                            )}
                        </div>
                    ) : result.savedToDb && (!result.vmDetails || result.vmDetails.vms?.length === 0) ? (
                        <div className="vm-details-summary">
                            <h5>Virtual Machines:</h5>
                            <p>No VMs found on this ESXi host</p>
                        </div>
                    ) : null}
                </div>
            )}
            
            <style jsx>{`
                .esxi-validation {
                    max-width: 500px;
                    margin: 0 auto;
                    padding: 20px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    background: #f9f9f9;
                }
                
                .connection-warning {
                    background-color: #fff3cd;
                    border: 1px solid #ffeaa7;
                    color: #856404;
                    padding: 10px;
                    border-radius: 4px;
                    margin-bottom: 15px;
                    font-size: 14px;
                }
                
                .connection-warning i {
                    margin-right: 8px;
                    color: #f39c12;
                }
                
                .form-group {
                    margin-bottom: 15px;
                }
                
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                
                input {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    font-size: 14px;
                }
                
                input:disabled {
                    background-color: #e9ecef;
                    cursor: not-allowed;
                }
                
                .validate-btn {
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 16px;
                    width: 100%;
                    transition: background-color 0.2s;
                }
                
                .validate-btn:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                
                .validate-btn:hover:not(:disabled) {
                    background: #0056b3;
                }
                
                .result-message {
                    margin-top: 20px;
                    padding: 15px;
                    border-radius: 4px;
                    transition: all 0.3s ease;
                }
                
                .result-message.success {
                    background: #d4edda;
                    border: 1px solid #c3e6cb;
                    color: #155724;
                }
                
                .result-message.error {
                    background: #f8d7da;
                    border: 1px solid #f5c6cb;
                    color: #721c24;
                }
                
                .success-note {
                    margin-top: 15px;
                    padding: 10px;
                    background: rgba(255, 255, 255, 0.7);
                    border-radius: 4px;
                    border-left: 3px solid #28a745;
                }
                
                .success-note i {
                    margin-right: 8px;
                }
                
                .success-note .fa-check-circle {
                    color: #28a745;
                }
                
                .success-note .fa-spinner {
                    color: #007bff;
                }
                
                .vm-details-summary {
                    margin-top: 15px;
                    padding: 10px;
                    background: rgba(255, 255, 255, 0.7);
                    border-radius: 4px;
                    border-left: 3px solid #17a2b8;
                }
                
                .vm-details-summary h5 {
                    margin-top: 0;
                    margin-bottom: 10px;
                    font-size: 16px;
                    color: #17a2b8;
                }
                
                .vm-details-summary h6 {
                    margin-top: 15px;
                    margin-bottom: 8px;
                    font-size: 14px;
                    color: #495057;
                }
                
                .host-info-summary {
                    margin-top: 10px;
                    padding: 8px;
                    background: #f8f9fa;
                    border-radius: 4px;
                    border: 1px solid #e9ecef;
                }
                
                .host-info-summary p {
                    margin: 5px 0;
                    font-size: 13px;
                }
                
                .vm-list {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    margin-bottom: 10px;
                }
                
                .vm-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 5px 8px;
                    background: #f8f9fa;
                    border-radius: 3px;
                    border-left: 3px solid #6c757d;
                }
                
                .vm-name {
                    font-weight: 500;
                    max-width: 70%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                
                .vm-status {
                    font-size: 11px;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-weight: 600;
                }
                
                .vm-status.poweredon {
                    color: #28a745;
                    background: rgba(40, 167, 69, 0.1);
                }
                
                .vm-status.poweredoff, .vm-status.poweredOff {
                    color: #dc3545;
                    background: rgba(220, 53, 69, 0.1);
                }
                
                .vm-status.unknown {
                    color: #6c757d;
                    background: rgba(108, 117, 125, 0.1);
                }
                
                .spinner {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid #fff;
                    border-top-color: transparent;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-right: 8px;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

export default ESXiValidation;