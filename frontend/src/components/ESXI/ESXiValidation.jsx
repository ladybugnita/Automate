// frontend/src/components/ESXI/ESXiValidation.jsx
import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../context/WebSocketContext'; // Adjust path as needed

function ESXiValidation({ onSuccess, initialData = {} }) {
    const context = useWebSocket();
    console.log('WebSocket Context in ESXiValidation:', context);
    console.log('Available functions:', Object.keys(context));

    const [esxiInfo, setEsxiInfo] = useState({
        ip: initialData.ip || '',
        username: initialData.username || 'root',
        password: '',
        name: initialData.name || ''
    });
    
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const { sendCommandAsync, isConnected, saveEsxiCredentials, getEsxiVmDetails } = useWebSocket(); // ADD getEsxiVmDetails here
    
    const handleEsxiValidation = async (e) => {
        if (e) e.preventDefault();

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
            console.log('Starting ESXi validation for:', esxiInfo.ip);

            // Step 1: Validate using WebSocket
            console.log('Sending validation command via WebSocket...');
            const validationResponse = await sendCommandAsync(
                "validate_esxi_connection_and_credentials",
                { esxi_info: esxiInfo }
            );
            
            console.log('WebSocket validation response:', validationResponse);

            // Check if validation is successful
            const isValid = validationResponse && 
                           (validationResponse.valid === true || 
                            validationResponse.valid === "true");
            
            console.log('Is validation valid?', isValid);
            
            if(isValid){
                console.log('WebSocket validation successful, saving to database...');

                // Step 2: Save using WebSocket context function
                if (!saveEsxiCredentials) {
                    throw new Error('saveEsxiCredentials is not available in WebSocket context');
                }
                
                console.log('Calling saveEsxiCredentials from WebSocket context...');
                
                const saveResult = await saveEsxiCredentials({
                    connection_name: esxiInfo.name || `ESXi-${esxiInfo.ip}`,
                    ip_address: esxiInfo.ip,
                    username: esxiInfo.username,
                    password: esxiInfo.password,
                    installation_type: 'existing',
                    status: 'connected'
                });
                
                console.log('Save result from WebSocket context:', saveResult);

                if(saveResult && saveResult.success) {
                    console.log('ESXi credentials saved to database successfully');
                    
                    // STEP 3: Get VM details after successful save
                    console.log('Now fetching VM details from ESXi host...');
                    
                    let vmDetails = null;
                    try {
                        // Get VM details using the saved credentials
                        vmDetails = await getEsxiVmDetails(esxiInfo.ip);
                        console.log('VM details fetched:', vmDetails);
                        
                        // Update the result with VM info
                        setResult({
                            validation: true,
                            savedToDb: true,
                            message: 'Validation successful and saved to database',
                            vmDetails: vmDetails // Add VM details to result
                        });
                        
                    } catch (vmError) {
                        console.warn('Could not fetch VM details:', vmError);
                        // Still show success even if VM details fail
                        setResult({
                            validation: true,
                            savedToDb: true,
                            message: 'Validation successful and saved to database (VM details could not be fetched)'
                        });
                    }
                    
                    // Call onSuccess with additional data
                    if (onSuccess) {
                        onSuccess({
                            ...esxiInfo,
                            id: saveResult.data?.id,
                            status: 'connected',
                            // Pass VM details if available
                            vmDetails: vmDetails
                        });
                    }

                    // Clear password only
                    setEsxiInfo(prev => ({ ...prev, password: '' }));
                } else {
                    console.error('Failed to save to database:', saveResult?.error);
                    setResult({
                        validation: true,
                        savedToDb: false,
                        message: saveResult?.error || 'Validation successful but failed to save to database'
                    });
                }
            } else {
                const errorMsg = validationResponse?.message || 'Validation failed';
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
                        placeholder="My ESXi Server"
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
                    <p><strong>WebSocket Validation:</strong> {result.validation ? '✅ Success' : '❌ Failed'}</p>
                    <p><strong>Database Save:</strong> {result.savedToDb ? '✅ Success' : '❌ Failed'}</p>
                    <p><strong>Message:</strong> {result.message}</p>
                    
                    {/* Show VM details if available */}
                    {result.vmDetails && result.vmDetails.vms && (
                        <div className="vm-details-summary">
                            <h5>Virtual Machines Found:</h5>
                            <div className="vm-list">
                                {result.vmDetails.vms.map((vm, index) => (
                                    <div key={index} className="vm-item">
                                        <span className="vm-name">{vm.name}</span>
                                        <span className={`vm-status ${vm.status}`}>
                                            {vm.status === 'poweredOn' ? '● Running' : '● Stopped'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {result.vmDetails.host_info && (
                                <div className="host-summary">
                                    <p>Total VMs: {result.vmDetails.host_info.total_vms}</p>
                                    <p>Memory: {result.vmDetails.host_info.total_memory}</p>
                                    <p>Storage: {result.vmDetails.host_info.total_storage}</p>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {result.validation && result.savedToDb && (
                        <div className="success-actions">
                            <button onClick={() => window.location.reload()}>
                                Refresh Connections List
                            </button>
                            <button onClick={() => setResult(null)}>
                                Add Another Connection
                            </button>
                        </div>
                    )}
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
                
                .validate-btn {
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 16px;
                    width: 100%;
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
                
                .vm-details-summary {
                    margin-top: 15px;
                    padding: 10px;
                    background: rgba(255, 255, 255, 0.7);
                    border-radius: 4px;
                }
                
                .vm-details-summary h5 {
                    margin-top: 0;
                    margin-bottom: 10px;
                    font-size: 16px;
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
                }
                
                .vm-status {
                    font-size: 12px;
                    padding: 2px 6px;
                    border-radius: 3px;
                }
                
                .vm-status.poweredOn {
                    color: #28a745;
                    background: rgba(40, 167, 69, 0.1);
                }
                
                .vm-status.poweredOff {
                    color: #dc3545;
                    background: rgba(220, 53, 69, 0.1);
                }
                
                .host-summary {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: #495057;
                    border-top: 1px solid #dee2e6;
                    padding-top: 8px;
                }
                
                .host-summary p {
                    margin: 0;
                }
                
                .success-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 10px;
                }
                
                .success-actions button {
                    padding: 5px 10px;
                    background: #28a745;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                
                .success-actions button:hover {
                    background: #218838;
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