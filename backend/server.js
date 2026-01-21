import express from "express";
import cors from "cors";
import WebSocket from "ws";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

console.log("Server starting...");
console.log("Environment variables loaded from:", path.join(__dirname, ".env"));

const app = express();
const server_port = process.env.SERVER_PORT || 5000;
const socket_port = process.env.SOCKET_PORT || 8081;
const my_ip = process.env.MY_IP || 'localhost';
const JWT_SECRET = process.env.JWT_SECRET || "secretkey123";

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

console.log("Importing authRoutes...");
let authRoutes;
try {
    const authModule = await import("./routes/auth.js");
    authRoutes = authModule.default;
    console.log("✓ authRoutes imported successfully");
} catch (error) {
    console.error("Error importing authRoutes:", error);
    console.error("Error stack:", error.stack);
    authRoutes = express.Router();
    authRoutes.post("/login", (req, res) => {
        res.status(500).json({ error: "Auth module failed to load" });
    });
    authRoutes.post("/signup", (req, res) => {
        res.status(500).json({ error: "Auth module failed to load" });
    });
}

console.log("Importing esxiRoutes...");
let esxiRoutes;
try {
    const esxiModule = await import("./routes/esxiRoutes.js");
    esxiRoutes = esxiModule.default;
    console.log("✓ esxiRoutes imported successfully");
} catch (error) {
    console.error("Error importing esxiRoutes:", error);
    console.error("Error stack:", error.stack);
    esxiRoutes = express.Router();
    esxiRoutes.post("/save-esxi-host", (req, res) => {
        res.status(500).json({ 
            success: false,
            error: "ESXi module failed to load: " + error.message 
        });
    });
    esxiRoutes.get("/get-esxi-connections", (req, res) => {
        res.status(500).json({ 
            success: false,
            error: "ESXi module failed to load: " + error.message 
        });
    });
    esxiRoutes.get("/get-esxi-host/:id", (req, res) => {
        res.status(500).json({ 
            success: false,
            error: "ESXi module failed to load: " + error.message 
        });
    });
    esxiRoutes.get("/get-esxi-host-with-password/:id", (req, res) => {
        res.status(500).json({ 
            success: false,
            error: "ESXi module failed to load: " + error.message 
        });
    });
}

console.log("Importing db...");
let db;
try {
    const dbModule = await import("./config/db.js");
    db = dbModule.default;
    console.log("✓ db imported successfully");
} catch (error) {
    console.error("Error importing db:", error);
    console.error("Error stack:", error.stack);
    db = {
        query: async () => {
            console.warn("Using mock database - db import failed");
            return [[]];
        },
        execute: async () => {
            console.warn("Using mock execute - db import failed");
            return [[]];
        }
    };
}

app.use("/api", authRoutes);
app.use("/api/esxi", esxiRoutes); 

const persistentConnections = new Map();

const isValidIP = (ip) => {
    const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipPattern.test(ip);
};

app.post("/api/validate-esxi-connection", async (req, res) => {
    try {
        const { esxi_info } = req.body;
        
        if (!esxi_info || !esxi_info.ip) {
            return res.status(400).json({ 
                success: false,
                valid: false, 
                message: "ESXi information with IP is required" 
            });
        }
        
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
        
        console.log(`Validating ESXi connection to ${esxi_info.ip}...`);
        
        try {
            const connectionTest = true; 
            
            if (connectionTest) {
                return res.json({
                    success: true,
                    valid: true,
                    message: 'ESXi connection and credentials are valid (simulated)',
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
            console.error("ESXi connection test error:", error);
            return res.status(500).json({
                success: false,
                valid: false,
                message: `Connection test error: ${error.message}`,
                esxi_info: {
                    ...esxi_info,
                    password: '***', 
                    validated_at: new Date().toISOString().replace('T', ' ').split('.')[0]
                }
            });
        }
        
    } catch (error) {
        console.error("Error validating ESXi connection:", error);
        return res.status(500).json({ 
            success: false,
            valid: false, 
            message: "Internal server error",
            error: error.message 
        });
    }
});

app.post("/api/send-command", async (req, res) => {
    try {
        const { username, command, payload } = req.body;

        if (!username || !command) {
            return res.status(400).json({ 
                success: false,
                error: "Username and command are required" 
            });
        }

        console.log(`Forwarding command to WebSocket server: ${command} for user: ${username}`);

        const response = await fetch(`http://${my_ip}:${socket_port}/api/send-command`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                command: command,
                payload: payload
            })
        });

        if (!response.ok) {
            throw new Error(`WebSocket server responded with status: ${response.status}`);
        }

        const result = await response.json();
        res.json(result);

    } catch (error) {
        console.error("Error forwarding command:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error",
            details: error.message
        });
    }
});

app.get("/check-agent-status", async (req, res) => {
    const token = req.query.token;

    if (!token) {
        return res.json({ 
            status: "error", 
            message: "Token missing" 
        });
    }

    let responded = false;
    let connectionTimeout;
    let responseTimeout;
    let ws;

    const safeRespond = (data) => {
        if (!responded) {
            responded = true;
            clearTimeout(connectionTimeout);
            clearTimeout(responseTimeout);
            res.json(data);

            if (ws && ws.readyState === WebSocket.OPEN) {
                console.log("Closing temporary WebSocket connection used for status check");
                ws.close(1000, "Status check complete");
            }
        }
    };

    try {
        ws = new WebSocket(`ws://${my_ip}:${socket_port}/socket?token=${encodeURIComponent(token)}`);

        connectionTimeout = setTimeout(() => {
            if (!responded) {
                safeRespond({ 
                    status: "timeout", 
                    message: "Connection timeout" 
                });
            }
        }, 5000);

        responseTimeout = setTimeout(() => {
            if (!responded) {
                safeRespond({ 
                    status: "timeout", 
                    message: "Response timeout" 
                });
            }
        }, 8000);

        ws.on("open", () => {
            console.log("WS opened: checking agent token...");
        });

        ws.on("message", (msg) => {
            try {
                const data = JSON.parse(msg.toString());
                console.log("Received message in check-agent-status:", data);

                if (data.type === "TOKEN_CONFIRMED") {
                    safeRespond({ 
                        status: "connected", 
                        username: data.username,
                        userId: data.userId 
                    });
                } else if (data.status === "error") {
                    safeRespond({ 
                        status: "invalid", 
                        message: data.message 
                    });
                }

            } catch (err) {
                console.error("Error parsing WebSocket message:", err);
            }
        });

        ws.on("close", (code, reason) => {
            console.log(`WS closed: ${code} - ${reason}`);
            if (!responded) {
                if (code !== 1000) {
                    safeRespond({ 
                        status: "disconnected", 
                        message: "WebSocket connection closed" 
                    });
                }
            }
        });

        ws.on("error", (err) => {
            console.error("WS error in check-agent-status:", err.message);
            if (!responded) {
                safeRespond({ 
                    status: "invalid", 
                    message: "Connection failed" 
                });
            }
        });

    } catch (err) {
        console.error("Error creating WebSocket:", err);
        safeRespond({ 
            status: "error", 
            message: "Internal server error" 
        });
    }
});

app.get("/api/agent-status", async (req, res) => {
    const token = req.query.token;

    if (!token) {
        return res.json({ 
            status: "error", 
            message: "Token missing" 
        });
    }

    try {
        const response = await fetch(`http://${my_ip}:${socket_port}/api/agent-status?token=${encodeURIComponent(token)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            const result = await response.json();
            res.json(result);
        } else {
            res.json({ 
                status: "disconnected", 
                message: "Agent not connected" 
            });
        }

    } catch (error) {
        console.error("Error checking agent status:", error);
        res.json({ 
            status: "error", 
            message: "Failed to check agent status" 
        });
    }
});

app.get("/api/validate-token", async (req, res) => {
    const token = req.query.token;

    if (!token) {
        return res.json({ 
            valid: false, 
            message: "Token missing" 
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const [rows] = await db.query(
            "SELECT username, status FROM agents WHERE username = ?",
            [decoded.username]
        );

        if (rows.length > 0) {
            return res.json({
                success: true,
                valid: true,
                status: rows[0].status,
                username: decoded.username,
                userId: decoded.id
            });
        } else {
            return res.json({
                success: true,
                valid: true,
                status: "disconnected",
                username: decoded.username,
                userId: decoded.id,
                message: "Token valid but agent not registered"
            });
        }

    } catch (err) {
        console.error("Token validation error:", err.message);
        return res.json({
            success: false,
            valid: false,
            status: "invalid",
            message: "Invalid token"
        });
    }
});

app.get("/health", (req, res) => {
    res.json({
        success: true,
        status: "ok",
        message: "Backend server is running",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        server_port: server_port,
        socket_port: socket_port
    });
});

app.get("/api/test-esxi-routes", async (req, res) => {
    try {
        const token = req.query.token;
        
        if (!token) {
            return res.json({
                success: false,
                message: "Token required for testing"
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const [users] = await db.query("SELECT COUNT(*) as count FROM users WHERE id = ?", [decoded.id]);
        const [esxiHosts] = await db.query("SELECT COUNT(*) as count FROM esxi_hosts WHERE user_id = ?", [decoded.id]);
        const [agents] = await db.query("SELECT COUNT(*) as count FROM agents WHERE username = ?", [decoded.username]);
        
        res.json({
            success: true,
            message: "ESXi routes test successful",
            user: {
                id: decoded.id,
                username: decoded.username
            },
            database: {
                users: users[0].count,
                esxi_hosts: esxiHosts[0].count,
                agents: agents[0].count
            },
            endpoints: {
                save_esxi_host: "POST /api/esxi/save-esxi-host",
                get_esxi_hosts: "GET /api/esxi/get-esxi-hosts",
                get_esxi_connections: "GET /api/esxi/get-esxi-connections",
                validate_esxi_connection: "POST /api/validate-esxi-connection"
            }
        });
        
    } catch (error) {
        console.error("Error testing ESXi routes:", error);
        res.status(500).json({
            success: false,
            message: "Test failed",
            error: error.message
        });
    }
});

app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: err.message
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route ${req.method} ${req.url} not found`
    });
});

app.listen(server_port, '0.0.0.0', () => {
    console.log(`Backend server running on http://${my_ip}:${server_port}`);
    console.log(`WebSocket server expected at: ws://${my_ip}:${socket_port}/socket`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Available endpoints:`);
    console.log(`  POST   /api/esxi/save-esxi-host`);
    console.log(`  GET    /api/esxi/get-esxi-hosts`);
    console.log(`  GET    /api/esxi/get-esxi-connections`);
    console.log(`  POST   /api/validate-esxi-connection`);
    console.log(`  GET    /check-agent-status`);
    console.log(`  GET    /health`);
});