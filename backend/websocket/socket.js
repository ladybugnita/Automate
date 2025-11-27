import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import path from "path";
import jwt from "jsonwebtoken";
import db from "../config/db.js";

dotenv.config({ path: path.resolve("backend/.env") });

const SECRET = process.env.JWT_SECRET;
const PORT = 8081;

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/socket" });

console.log("WebSocket Server:", `ws://localhost:${PORT}/socket`);

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

function processResponse(data, username) {
    let command = 'unknown';
    let resultData = null;

    if (data.response && typeof data.response === 'object') {
        if (data.response.command) {
            command = data.response.command;
            resultData = data.response.result;
        }
        else if (data.response.error) {
            command = 'unknown';
            resultData = { status: 'error', message: data.response.error };
        }
    }
    else if (data.command) {
        command = data.command;
        resultData = data.result || data.response;
    }
    else if (data.error) {
        command = 'unknown';
        resultData = { status: 'error', message: data.error };
    }

    if (typeof resultData === 'string') {
        try {
            resultData = JSON.parse(resultData);
            console.log(`Parsed result data for ${command}:`, resultData);
        } catch (parseError) {
            console.log(`Failed to parse result as JSON, keeping as string`);
        }
    }

    console.log(`Processing response for: ${command}`, resultData);

    const frontendConn = frontendConnections.get(username);
    const responseMessage = {
        type: 'COMMAND_RESPONSE',
        command: command,
        data: resultData,
        timestamp: new Date().toISOString(),
        source: 'backend'
    };

    if (frontendConn && frontendConn.readyState === WebSocket.OPEN) {
        frontendConn.send(JSON.stringify(responseMessage));
        console.log(`Response forwarded to frontend from backend: ${command}`);
    } else {
        console.log(`No frontend connection - storing backend response`);
        if (!pendingResponses.has(username)) {
            pendingResponses.set(username, []);
        }
        pendingResponses.get(username).push(responseMessage);
    }
}

wss.on("connection", async (ws, req) => {
    console.log("New connection attempt...");

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

        console.log(`Client connected: ${user.username} (awaiting classification)`);

        ws.send(JSON.stringify({
            type: "TOKEN_CONFIRMED",
            username: user.username,
            message: "WebSocket Connection Successful"
        }));

        ws.on("message", async (raw) => {
            if (!ws.authenticated) return;

            try {
                const message = raw.toString();
                console.log(`[MESSAGE from ${user.username}]: ${message}`);

                const data = JSON.parse(message);

                if (data.response && !ws.connectionType) {
                    console.log(`AUTO-DETECTED BACKEND (via response field): ${user.username}`);
                    agentConnections.set(user.username, ws);
                    ws.connectionType = 'agent';

                    const frontendConn = frontendConnections.get(user.username);
                    if (frontendConn && frontendConn.readyState === WebSocket.OPEN) {
                        frontendConn.send(JSON.stringify({
                            type: 'AGENT_CONNECTED',
                            message: 'backend is now connected and ready'
                        }));
                    }

                    console.log(`backend auto-detected: ${user.username}`);

                    console.log(`Processing initial response:`, data.response);

                    processResponse(data, user.username);
                    return;
                }

                if (data.action === "register" && !ws.connectionType) {
                    console.log(`BACKEND REGISTERED: ${user.username}`);
                    agentConnections.set(user.username, ws);
                    ws.connectionType = 'agent';

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
                            message: 'backend is now connected and ready'
                        }));
                    }

                    ws.send(JSON.stringify({
                        action: "register_ack",
                        status: "success",
                        message: "Successfully registered as backend"
                    }));

                    console.log(`backend registered: ${user.username}`);
                    return;
                }

                if ((data.action === "response" || data.response) && ws.connectionType === 'agent') {
                    console.log(`Response from Backend:`, data);
                    processResponse(data, user.username);
                    return;
                }

                if (data.command && !ws.connectionType) {
                    console.log(`Identified as FRONTEND: ${user.username}`);
                    ws.connectionType = 'frontend';
                    frontendConnections.set(user.username, ws);

                    if (pendingResponses.has(user.username)) {
                        const responses = pendingResponses.get(user.username);
                        console.log(`Sending ${responses.length} pending responses to frontend`);
                        responses.forEach(response => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify(response));
                            }
                        });
                        pendingResponses.delete(user.username);
                    }
                }

                if (data.command && ws.connectionType === 'frontend') {
                    const agentConnection = agentConnections.get(user.username);

                    const commandMessage = {
                        command: data.command
                    };

                    if (data.payload) {
                        commandMessage.payload = data.payload;
                    }

                    if (agentConnection && agentConnection.readyState === WebSocket.OPEN) {
                        console.log(`Forwarding command to Backend: ${data.command}`, data.payload ? `with payload: ${JSON.stringify(data.payload)}` : '');

                        agentConnection.send(JSON.stringify(commandMessage));
                        console.log(`Command sent to Backend: ${data.command}`);

                    } else {
                        console.log(`No backend connection - storing command for retry`);

                        if (!failedCommands.has(user.username)) {
                            failedCommands.set(user.username, []);
                        }
                        failedCommands.get(user.username).push(commandMessage);

                        ws.send(JSON.stringify({
                            type: 'WAITING_FOR_BACKEND',
                            command: data.command,
                            message: 'backend is not connected. Command will be retried when backend reconnects.',
                            timestamp: new Date().toISOString()
                        }));
                    }
                    return;
                }

                if (!ws.connectionType) {
                    console.log(`Unknown message format from unclassified connection:`, data);
                }

            } catch (err) {
                console.error("Error processing message:", err);
                if (ws.connectionType === 'frontend') {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        message: 'Failed to process message'
                    }));
                }
            }
        });

        ws.on("close", async () => {
            if (!ws.authenticated) return;

            const username = ws.user.username;
            const connectionType = ws.connectionType;

            if (connectionType === 'agent' && agentConnections.get(username) === ws) {
                agentConnections.delete(username);
                console.log(`BACKEND disconnected: ${username}`);

                const frontendConn = frontendConnections.get(username);
                if (frontendConn && frontendConn.readyState === WebSocket.OPEN) {
                    frontendConn.send(JSON.stringify({
                        type: 'AGENT_DISCONNECTED',
                        message: 'backend disconnected'
                    }));
                }
            }
            if (connectionType === 'frontend' && frontendConnections.get(username) === ws) {
                frontendConnections.delete(username);
                console.log(`Frontend disconnected: ${username}`);
            }

            try {
                await db.query(
                    "UPDATE agents SET status='disconnected', updatedAt=NOW() WHERE username=?",
                    [username]
                );
            } catch (err) {
                console.error("Error updating agent status:", err);
            }
        });

        ws.on("error", (error) => {
            console.error("WebSocket error:", error);
        });

    } catch (err) {
        console.log("Connection error:", err.message);
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

        const agentConnection = agentConnections.get(username);

        const commandMessage = {
            command: command
        };

        if (payload) {
            commandMessage.payload = payload;
        }

        if (agentConnection && agentConnection.readyState === WebSocket.OPEN) {
            console.log(`Forwarding HTTP command to BACKEND: ${command}`, payload ? `with payload: ${JSON.stringify(payload)}` : '');

            agentConnection.send(JSON.stringify(commandMessage));

            return res.json({
                success: true,
                message: `Command '${command}' sent to backend`,
                note: 'Response will come via WebSocket connection'
            });
        }

        return res.status(404).json({
            success: false,
            error: "backend not connected",
            message: "Please ensure the backend application is running and connected to the WebSocket server"
        });

    } catch (error) {
        console.error("Error in send-command endpoint:", error);
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
                message: 'backend is connected and ready'
            });
        } else {
            res.json({
                status: 'disconnected',
                username: user.username,
                message: 'backend is not connected'
            });
        }
    } catch (error) {
        console.error('Error checking agent status:', error);
        res.json({
            status: 'error',
            message: 'Failed to check agent status'
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
        totalFrontends: frontendUsernames.length
    });
});

setInterval(() => {
    const now = Date.now();
    for (const [username, responses] of pendingResponses.entries()) {
        const filtered = responses.filter(resp => now - new Date(resp.timestamp).getTime() < 30000);
        if (filtered.length === 0) {
            pendingResponses.delete(username);
        } else if (filtered.length !== responses.length) {
            pendingResponses.set(username, filtered);
        }
    }

    for (const [username, commands] of failedCommands.entries()) {
        if (commands.length > 10) {
            failedCommands.set(username, commands.slice(-10));
        }
    }
}, 60000);

server.listen(PORT, () => {
    console.log(`WebSocket server running on port: ${PORT}`);
});