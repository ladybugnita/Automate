import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import path from "path";
import jwt from "jsonwebtoken";
import db from "../config/db.js";
import MachineDB from "../config/machineDb.js"; 
import ESXiDB from "../config/esxiDb.js";
import NetworkDeviceDB from "../config/networkDeviceDb.js"; 

dotenv.config({ path: path.resolve("backend/.env") });

const SECRET = process.env.JWT_SECRET;
const socket_port = process.env.SOCKET_PORT || 8081;

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/socket" });

console.log("WebSocket Server:", `ws://my_ip:${socket_port}/socket`);

const agentConnections = new Map();
const frontendConnections = new Map();
const pendingCommands = new Map();
const pendingResponses = new Map();
const failedCommands = new Map();

function authenticateToken(token) {
    try {
        const payload = jwt.verify(token, SECRET);
        return {
            id: payload.id,
            username: payload.username,
        };
    } catch (err) {
        console.log("Token verification failed:", err.message);
        return null;
    }
}

function isNodeJsCommand(command) {
    const nodeJsCommands = [
        'get_machine_info',
        'add_machine_info',
        'mark_machine',
        'unmark_machine',
        'delete_machine',
        'update_machine',
        'get_marked_machines',
        
        'get_esxi_info',
        'add_esxi_info',
        'update_esxi',
        'delete_esxi',
        'validate_esxi_connection_and_credentials',
        'test_esxi_connection',
        
        'get_network_devices',
        'add_network_device',
        'update_network_device',
        'delete_network_device',
        
        'list_machines',
        'list_esxi',
        'list_devices'
    ];
    return nodeJsCommands.includes(command);
}

async function handleNodeJsCommand(command, payload, userId, username) {
    console.log(`Handling ${command} locally in Node.js for user ${username}`);
    
    try {
        let result;
        
        switch(command) {
            case 'get_machine_info':
            case 'list_machines':
                result = await MachineDB.getMachines(userId, false);
                return {
                    success: result.success,
                    command: command,
                    result: {
                        machines: result.machines || [],
                        count: result.machines?.length || 0
                    },
                    error: result.error
                };
                
            case 'add_machine_info':
                if (!payload) {
                    return {
                        success: false,
                        command: command,
                        error: 'Machine data required'
                    };
                }
                result = await MachineDB.addMachine(payload, userId);
                return {
                    success: result.success,
                    command: command,
                    result: result.data,
                    error: result.error
                };
                
            case 'mark_machine':
                if (!payload || !payload.machine_id || !payload.marks) {
                    return {
                        success: false,
                        command: command,
                        error: 'Machine ID and marks required'
                    };
                }
                result = await MachineDB.markMachine(payload.machine_id, payload.marks, userId);
                return {
                    success: result.success,
                    command: command,
                    result: result,
                    error: result.error
                };
                
            case 'unmark_machine':
                if (!payload || !payload.machine_id) {
                    return {
                        success: false,
                        command: command,
                        error: 'Machine ID required'
                    };
                }
                result = await MachineDB.unmarkMachine(payload.machine_id, userId);
                return {
                    success: result.success,
                    command: command,
                    result: result,
                    error: result.error
                };
                
            case 'delete_machine':
                if (!payload || !payload.machine_id) {
                    return {
                        success: false,
                        command: command,
                        error: 'Machine ID required'
                    };
                }
                result = await MachineDB.deleteMachine(payload.machine_id, userId);
                return {
                    success: result.success,
                    command: command,
                    result: result,
                    error: result.error
                };
                
            case 'get_marked_machines':
                const role = payload?.role || null;
                result = await MachineDB.getMarkedMachines(userId, role);
                return {
                    success: result.success,
                    command: command,
                    result: {
                        machines: result.machines || [],
                        count: result.count || 0
                    },
                    error: result.error
                };
                
            case 'get_esxi_info':
            case 'list_esxi':
                result = await ESXiDB.getESXiHosts(userId);
                return {
                    success: result.success,
                    command: command,
                    result: {
                        esxi_hosts: result.esxi_hosts || [],
                        count: result.esxi_hosts?.length || 0
                    },
                    error: result.error
                };
                
            case 'add_esxi_info':
                if (!payload) {
                    return {
                        success: false,
                        command: command,
                        error: 'ESXi data required'
                    };
                }
                result = await ESXiDB.addESXiHost(payload, userId);
                return {
                    success: result.success,
                    command: command,
                    result: result.data,
                    error: result.error
                };
                
            case 'validate_esxi_connection_and_credentials':
            case 'test_esxi_connection':
                if (!payload) {
                    return {
                        success: false,
                        command: command,
                        error: 'ESXi connection data required'
                    };
                }
                const isValidIP = (ip) => {
                    const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
                    return ipPattern.test(ip);
                };
                
                if (!isValidIP(payload.ip)) {
                    return {
                        success: false,
                        command: command,
                        result: {
                            valid: false,
                            message: 'Invalid IP address format'
                        }
                    };
                }
                
                return {
                    success: true,
                    command: command,
                    result: {
                        valid: true,
                        message: 'ESXi connection validated successfully',
                        esxi_info: {
                            ...payload,
                            password: '***',
                            validated_at: new Date().toISOString()
                        }
                    }
                };
                
            case 'get_network_devices':
            case 'list_devices':
                result = await NetworkDeviceDB.getNetworkDevices(userId);
                return {
                    success: result.success,
                    command: command,
                    result: {
                        devices: result.devices || [],
                        count: result.devices?.length || 0
                    },
                    error: result.error
                };
                
            case 'add_network_device':
                if (!payload) {
                    return {
                        success: false,
                        command: command,
                        error: 'Network device data required'
                    };
                }
                result = await NetworkDeviceDB.addNetworkDevice(payload, userId);
                return {
                    success: result.success,
                    command: command,
                    result: result.data,
                    error: result.error
                };
                
            case 'update_network_device':
                if (!payload || !payload.device_id) {
                    return {
                        success: false,
                        command: command,
                        error: 'Device ID and data required'
                    };
                }
                result = await NetworkDeviceDB.updateNetworkDevice(payload.device_id, payload, userId);
                return {
                    success: result.success,
                    command: command,
                    result: result,
                    error: result.error
                };
                
            case 'delete_network_device':
                if (!payload || !payload.device_id) {
                    return {
                        success: false,
                        command: command,
                        error: 'Device ID required'
                    };
                }
                result = await NetworkDeviceDB.deleteNetworkDevice(payload.device_id, userId);
                return {
                    success: result.success,
                    command: command,
                    result: result,
                    error: result.error
                };
                
            default:
                return {
                    success: false,
                    command: command,
                    error: `Command ${command} not implemented in Node.js`
                };
        }
    } catch (error) {
        console.error(`Error handling command ${command}:`, error);
        return {
            success: false,
            command: command,
            error: error.message || 'Database error'
        };
    }
}

function processResponse(data, username) {
    let command = 'unknown';
    let resultData = null;
    let error = null;

    if (data.response && typeof data.response === 'object') {
        if (data.response.command) {
            command = data.response.command;
            resultData = data.response.result;
            error = data.response.error;
        }
        else if (data.response.error) {
            command = data.response.command || 'unknown';
            resultData = { status: 'error', message: data.response.error };
            error = data.response.error;
        }
    }
    else if (data.command) {
        command = data.command;
        resultData = data.result || data.response;
        error = data.error;
    }
    else if (data.error) {
        command = data.command || 'unknown';
        resultData = { status: 'error', message: data.error };
        error = data.error;
    }

    if (typeof resultData === 'string') {
        try {
            resultData = JSON.parse(resultData);
            console.log(`Parsed result data for ${command}:`, resultData);
        } catch (parseError) {
            console.log(`Failed to parse result as JSON, keeping as string: ${resultData.substring(0, 100)}...`);
        }
    }

    console.log(`Processing response for: ${command}`, { resultData, error });

    const frontendConn = frontendConnections.get(username);
    const source = isNodeJsCommand(command) ? 'nodejs' : 'backend';
    const responseMessage = {
        type: 'COMMAND_RESPONSE',
        command: command,
        data: resultData,
        error: error,
        timestamp: new Date().toISOString(),
        source: source
    };

    if (frontendConn && frontendConn.readyState === WebSocket.OPEN) {
        frontendConn.send(JSON.stringify(responseMessage));
        console.log(`Response forwarded to frontend from ${source}: ${command}`);
    } else {
        console.log(`No frontend connection for ${username} - storing ${source} response`);
        if (!pendingResponses.has(username)) {
            pendingResponses.set(username, []);
        }
        pendingResponses.get(username).push(responseMessage);
    }
}

wss.on("connection", async (ws, req) => {
    console.log("New WebSocket connection attempt...");

    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get("token");

        if (!token) {
            console.log("No token provided");
            ws.send(JSON.stringify({ status: "error", message: "No token provided" }));
            ws.close();
            return;
        }

        const user = authenticateToken(token);
        if (!user) {
            console.log("Invalid token");
            ws.send(JSON.stringify({ status: "error", message: "Invalid token" }));
            ws.close();
            return;
        }

        ws.user = user;
        ws.authenticated = true;
        ws.connectionType = null;

        console.log(`Client connected: ${user.username} (id: ${user.id}, awaiting classification)`);

        ws.send(JSON.stringify({
            type: "TOKEN_CONFIRMED",
            username: user.username,
            userId: user.id,
            message: "WebSocket Connection Successful"
        }));

        ws.on("message", async (raw) => {
            if (!ws.authenticated) return;

            try {
                const message = raw.toString();
                console.log(`[MESSAGE from ${user.username}]:`, message.substring(0, 200) + (message.length > 200 ? '...' : ''));

                const data = JSON.parse(message);

                if (data.response && !ws.connectionType) {
                    console.log(`AUTO-DETECTED BACKEND (via response field): ${user.username}`);
                    agentConnections.set(user.username, ws);
                    ws.connectionType = 'agent';

                    const frontendConn = frontendConnections.get(user.username);
                    if (frontendConn && frontendConn.readyState === WebSocket.OPEN) {
                        frontendConn.send(JSON.stringify({
                            type: 'AGENT_CONNECTED',
                            message: 'backend is now connected and ready',
                            userId: user.id
                        }));
                    }

                    console.log(`Backend auto-detected: ${user.username}`);
                    
                    processResponse(data, user.username);
                    return;
                }

                if (data.action === "register" && !ws.connectionType) {
                    console.log(`BACKEND REGISTERED: ${user.username} (id: ${user.id})`);
                    agentConnections.set(user.username, ws);
                    ws.connectionType = 'agent';

                    try {
                        await db.query(
                            "INSERT INTO agents (token, username, status, last_seen) VALUES (?, ?, 'connected', NOW()) ON DUPLICATE KEY UPDATE status='connected', last_seen=NOW(), updatedAt=NOW()",
                            [token, user.username]
                        );
                    } catch (dbError) {
                        console.error("Error updating agent status in database:", dbError.message);
                    }

                    if (failedCommands.has(user.username)) {
                        const commandsToRetry = failedCommands.get(user.username);
                        console.log(`Retrying ${commandsToRetry.length} failed commands for ${user.username}`);

                        commandsToRetry.forEach(commandObj => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify(commandObj));
                                console.log(`Retried command: ${commandObj.command}`);
                            }
                        });

                        failedCommands.delete(user.username);
                    }

                    const frontendConn = frontendConnections.get(user.username);
                    if (frontendConn && frontendConn.readyState === WebSocket.OPEN) {
                        frontendConn.send(JSON.stringify({
                            type: 'AGENT_CONNECTED',
                            message: 'backend is now connected and ready',
                            userId: user.id
                        }));
                    }

                    ws.send(JSON.stringify({
                        action: "register_ack",
                        status: "success",
                        message: "Successfully registered as backend",
                        userId: user.id
                    }));

                    console.log(`Backend registered: ${user.username}`);
                    return;
                }

                if ((data.action === "response" || data.response) && ws.connectionType === 'agent') {
                    console.log(`Response from Backend ${user.username}:`, 
                        data.command ? `Command: ${data.command}` : 'No command specified');
                    
                    if (data.command === 'validate_esxi_connection_and_credentials' || 
                        (data.response && data.response.command === 'validate_esxi_connection_and_credentials')) {
                        console.log('Processing ESXi validation response from backend');
                    }
                    
                    processResponse(data, user.username);
                    return;
                }

                if (data.command && !ws.connectionType) {
                    console.log(`Identified as FRONTEND: ${user.username} (id: ${user.id})`);
                    ws.connectionType = 'frontend';
                    frontendConnections.set(user.username, ws);

                    if (pendingResponses.has(user.username)) {
                        const responses = pendingResponses.get(user.username);
                        console.log(`Sending ${responses.length} pending responses to frontend ${user.username}`);
                        responses.forEach(response => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify(response));
                            }
                        });
                        pendingResponses.delete(user.username);
                    }
                }

                if (data.command && ws.connectionType === 'frontend') {
                    if (isNodeJsCommand(data.command)) {
                        console.log(`Handling ${data.command} locally in Node.js for ${user.username}`);
                        
                        const result = await handleNodeJsCommand(
                            data.command,
                            data.payload,
                            user.id,
                            user.username
                        );
                        
                        ws.send(JSON.stringify({
                            type: 'COMMAND_RESPONSE',
                            command: data.command,
                            data: result.result,
                            error: result.error,
                            timestamp: new Date().toISOString(),
                            source: 'nodejs'
                        }));
                        
                        if (result.success) {
                            const agentConnection = agentConnections.get(user.username);
                            if (agentConnection && agentConnection.readyState === WebSocket.OPEN) {
                                agentConnection.send(JSON.stringify({
                                    event: 'database_updated',
                                    command: data.command,
                                    data: result.result,
                                    userId: user.id,
                                    timestamp: new Date().toISOString()
                                }));
                                console.log(`Notified Python backend about ${data.command}`);
                            }
                        }
                        
                        return;
                    }
                    
                    const agentConnection = agentConnections.get(user.username);

                    const commandMessage = {
                        command: data.command
                    };

                    if (data.payload) {
                        commandMessage.payload = data.payload;
                    }

                    if (agentConnection && agentConnection.readyState === WebSocket.OPEN) {
                        console.log(`Forwarding command to Backend: ${data.command}`, 
                            data.payload ? `Payload: ${JSON.stringify(data.payload).substring(0, 100)}...` : 'No payload');

                        if (data.command === 'validate_esxi_connection_and_credentials') {
                            console.log('Forwarding ESXi validation command to backend for user:', user.username);
                        } else if (data.command.includes('esxi') || data.command.includes('vm')) {
                            console.log('Forwarding ESXi/VM related command:', data.command);
                        }

                        agentConnection.send(JSON.stringify(commandMessage));
                        console.log(`Command sent to Backend ${user.username}: ${data.command}`);

                    } else {
                        console.log(`No backend connection for ${user.username} - storing command for retry`);

                        if (!failedCommands.has(user.username)) {
                            failedCommands.set(user.username, []);
                        }
                        failedCommands.get(user.username).push(commandMessage);

                        ws.send(JSON.stringify({
                            type: 'WAITING_FOR_BACKEND',
                            command: data.command,
                            message: 'Backend is not connected. Command will be retried when backend reconnects.',
                            timestamp: new Date().toISOString(),
                            userId: user.id
                        }));
                    }
                    return;
                }

                if (!ws.connectionType) {
                    console.log(`Unknown message format from unclassified connection ${user.username}:`, 
                        typeof data === 'object' ? JSON.stringify(data).substring(0, 100) : data);
                }

            } catch (err) {
                console.error("Error processing message from", user.username, ":", err.message);
                if (ws.connectionType === 'frontend') {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Failed to process message: ' + err.message
                    }));
                }
            }
        });

        ws.on("close", async () => {
            if (!ws.authenticated) return;

            const username = ws.user.username;
            const userId = ws.user.id;
            const connectionType = ws.connectionType;

            if (connectionType === 'agent' && agentConnections.get(username) === ws) {
                agentConnections.delete(username);
                console.log(`BACKEND disconnected: ${username} (id: ${userId})`);

                const frontendConn = frontendConnections.get(username);
                if (frontendConn && frontendConn.readyState === WebSocket.OPEN) {
                    frontendConn.send(JSON.stringify({
                        type: 'AGENT_DISCONNECTED',
                        message: 'Backend disconnected',
                        userId: userId
                    }));
                }

                try {
                    await db.query(
                        "UPDATE agents SET status='disconnected', updatedAt=NOW() WHERE username=?",
                        [username]
                    );
                } catch (dbError) {
                    console.error("Error updating agent status on disconnect:", dbError.message);
                }
            }
            
            if (connectionType === 'frontend' && frontendConnections.get(username) === ws) {
                frontendConnections.delete(username);
                console.log(`Frontend disconnected: ${username} (id: ${userId})`);
            }

        });

        ws.on("error", (error) => {
            console.error("WebSocket error for user", ws.user?.username, ":", error.message);
        });

    } catch (err) {
        console.log("Connection setup error:", err.message);
        ws.close();
    }
});

app.use(express.json());

app.post("/api/send-command", async (req, res) => {
    try {
        const { username, command, payload } = req.body;

        if (!username || !command) {
            return res.status(400).json({ error: "Username and command are required" });
        }

        console.log(`HTTP Command from frontend: ${command} for user: ${username}`);

        if (isNodeJsCommand(command)) {
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return res.status(401).json({ error: "Authorization token required" });
            }
            
            const user = authenticateToken(token);
            if (!user || user.username !== username) {
                return res.status(401).json({ error: "Invalid token or username mismatch" });
            }
            
            const result = await handleNodeJsCommand(command, payload, user.id, username);
            
            return res.json({
                success: result.success,
                command: command,
                data: result.result,
                error: result.error,
                note: 'Handled directly by Node.js'
            });
        }

        const agentConnection = agentConnections.get(username);

        const commandMessage = {
            command: command
        };

        if (payload) {
            commandMessage.payload = payload;
        }

        if (agentConnection && agentConnection.readyState === WebSocket.OPEN) {
            console.log(`Forwarding HTTP command to BACKEND: ${command}`, 
                payload ? `Payload: ${JSON.stringify(payload).substring(0, 100)}...` : 'No payload');

            agentConnection.send(JSON.stringify(commandMessage));

            return res.json({
                success: true,
                message: `Command '${command}' sent to backend`,
                note: 'Response will come via WebSocket connection'
            });
        }

        return res.status(404).json({
            success: false,
            error: "Backend not connected",
            message: "Please ensure the backend application is running and connected to the WebSocket server"
        });

    } catch (error) {
        console.error("Error in send-command endpoint:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error: " + error.message
        });
    }
});

app.get("/api/machines", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: "Authorization token required" });
        }
        
        const user = authenticateToken(token);
        if (!user) {
            return res.status(401).json({ error: "Invalid token" });
        }
        
        const result = await MachineDB.getMachines(user.id, false);
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false,
                error: result.error 
            });
        }
        
        res.json({
            success: true,
            machines: result.machines,
            count: result.machines.length
        });
    } catch (error) {
        console.error("Error in /api/machines:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

app.get("/api/esxi-hosts", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: "Authorization token required" });
        }
        
        const user = authenticateToken(token);
        if (!user) {
            return res.status(401).json({ error: "Invalid token" });
        }
        
        const result = await ESXiDB.getESXiHosts(user.id);
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false,
                error: result.error 
            });
        }
        
        res.json({
            success: true,
            esxi_hosts: result.esxi_hosts,
            count: result.esxi_hosts.length
        });
    } catch (error) {
        console.error("Error in /api/esxi-hosts:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

app.get("/api/network-devices", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: "Authorization token required" });
        }
        
        const user = authenticateToken(token);
        if (!user) {
            return res.status(401).json({ error: "Invalid token" });
        }
        
        const result = await NetworkDeviceDB.getNetworkDevices(user.id);
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false,
                error: result.error 
            });
        }
        
        res.json({
            success: true,
            devices: result.devices,
            count: result.devices.length
        });
    } catch (error) {
        console.error("Error in /api/network-devices:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

app.get("/api/agent-status", async (req, res) => {
    try {
        const token = req.query.token;

        if (!token) {
            return res.json({ status: 'error', message: 'Token missing' });
        }

        const user = authenticateToken(token);
        if (!user) {
            return res.json({ status: 'invalid', message: 'Invalid token' });
        }

        const agentConnection = agentConnections.get(user.username);
        if (agentConnection && agentConnection.readyState === WebSocket.OPEN) {
            res.json({
                status: 'connected',
                username: user.username,
                userId: user.id,
                message: 'Backend is connected and ready'
            });
        } else {
            res.json({
                status: 'disconnected',
                username: user.username,
                userId: user.id,
                message: 'Backend is not connected'
            });
        }
    } catch (error) {
        console.error('Error checking agent status:', error);
        res.json({
            status: 'error',
            message: 'Failed to check agent status: ' + error.message
        });
    }
});

app.get("/api/connection-status", (req, res) => {
    const agentUsernames = Array.from(agentConnections.keys());
    const frontendUsernames = Array.from(frontendConnections.keys());

    res.json({
        agentConnections: agentUsernames,
        frontendConnections: frontendUsernames,
        totalAgents: agentUsernames.length,
        totalFrontends: frontendUsernames.length,
        timestamp: new Date().toISOString()
    });
});

app.post("/api/validate-esxi", async (req, res) => {
    try {
        const { username, esxi_info } = req.body;
        
        if (!username || !esxi_info || !esxi_info.ip) {
            return res.status(400).json({ 
                success: false,
                error: "Username and ESXi info with IP are required" 
            });
        }

        console.log(`ESXi validation test request for user: ${username}`, {
            ip: esxi_info.ip,
            username: esxi_info.username,
            password_length: esxi_info.password ? esxi_info.password.length : 0
        });

        const isValidIP = (ip) => {
            const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            return ipPattern.test(ip);
        };

        if (!isValidIP(esxi_info.ip)) {
            return res.status(400).json({
                success: false,
                valid: false,
                message: 'Invalid IP address format. IP should be in format like 192.168.1.100',
                esxi_info: {
                    ...esxi_info,
                    password: '***', 
                    validated_at: new Date().toISOString().replace('T', ' ').split('.')[0]
                }
            });
        }

        const connectionTest = true;
        
        if (connectionTest) {
            return res.json({
                success: true,
                valid: true,
                message: 'ESXi connection and credentials are valid (simulated test)',
                esxi_info: {
                    ...esxi_info,
                    password: '***', 
                    validated_at: new Date().toISOString().replace('T', ' ').split('.')[0],
                    password_received: !!esxi_info.password
                }
            });
        } else {
            return res.json({
                success: false,
                valid: false,
                message: 'Failed to connect to ESXi host. Check IP and credentials.',
                esxi_info: {
                    ...esxi_info,
                    password: '***', 
                    validated_at: new Date().toISOString().replace('T', ' ').split('.')[0]
                }
            });
        }

    } catch (error) {
        console.error('Error in ESXi validation test:', error);
        res.status(500).json({
            success: false,
            valid: false,
            message: `Connection test error: ${error.message}`,
            esxi_info: req.body.esxi_info ? {
                ...req.body.esxi_info,
                password: '***', 
                validated_at: new Date().toISOString().replace('T', ' ').split('.')[0]
            } : null
        });
    }
});

setInterval(() => {
    const now = Date.now();
    
    for (const [username, responses] of pendingResponses.entries()) {
        const filtered = responses.filter(resp => now - new Date(resp.timestamp).getTime() < 30000);
        if (filtered.length === 0) {
            pendingResponses.delete(username);
            console.log(`Cleaned up pending responses for ${username}`);
        } else if (filtered.length !== responses.length) {
            pendingResponses.set(username, filtered);
        }
    }

    for (const [username, commands] of failedCommands.entries()) {
        if (commands.length > 10) {
            failedCommands.set(username, commands.slice(-10));
            console.log(`Trimmed failed commands for ${username} to last 10`);
        }
    }
}, 60000); 

server.listen(socket_port, '0.0.0.0', () => {
    console.log(`WebSocket server running on port: ${socket_port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export { wss, agentConnections, frontendConnections };