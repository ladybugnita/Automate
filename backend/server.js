import express from "express";
import cors from "cors";
import WebSocket from "ws";
import dotenv from "dotenv";
import path from "path";

import authRoutes from "./routes/auth.js";
import db from "./config/db.js";

dotenv.config({ path: path.resolve("backend/.env") });

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", authRoutes);

const persistentConnections = new Map();

app.post("/api/send-command", async (req, res) => {
    try {
        const { username, command, payload } = req.body;

        if (!username || !command) {
            return res.status(400).json({ error: "Username and command are required" });
        }

        console.log(`Forwarding command to WebSocket server: ${command} for user: ${username}`);

        const response = await fetch('http://localhost:8081/api/send-command', {
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
            error: "Internal server error",
            details: error.message
        });
    }
});

app.get("/check-agent-status", async (req, res) => {
    const token = req.query.token;

    if (!token) {
        return res.json({ status: "error", message: "Token missing" });
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
        ws = new WebSocket(`ws://localhost:8081/socket?token=${encodeURIComponent(token)}`);

        connectionTimeout = setTimeout(() => {
            if (!responded) {
                safeRespond({ status: "timeout", message: "Connection timeout" });
            }
        }, 5000);

        responseTimeout = setTimeout(() => {
            if (!responded) {
                safeRespond({ status: "timeout", message: "Response timeout" });
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
                    safeRespond({ status: "connected", username: data.username });
                } else if (data.status === "error") {
                    safeRespond({ status: "invalid", message: data.message });
                }

            } catch (err) {
                console.error("Error parsing WebSocket message:", err);
            }
        });

        ws.on("close", (code, reason) => {
            console.log(`WS closed: ${code} - ${reason}`);
            if (!responded) {
                if (code !== 1000) {
                    safeRespond({ status: "disconnected", message: "WebSocket connection closed" });
                }
            }
        });

        ws.on("error", (err) => {
            console.error("WS error in check-agent-status:", err.message);
            if (!responded) {
                safeRespond({ status: "invalid", message: "Connection failed" });
            }
        });

    } catch (err) {
        console.error("Error creating WebSocket:", err);
        safeRespond({ status: "error", message: "Internal server error" });
    }
});

app.get("/api/agent-status", async (req, res) => {
    const token = req.query.token;

    if (!token) {
        return res.json({ status: "error", message: "Token missing" });
    }

    try {
        const response = await fetch('http://localhost:8081/api/agent-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token })
        });

        if (response.ok) {
            const result = await response.json();
            res.json(result);

        } else {
            res.json({ status: "disconnected", message: "Agent not connected" });
        }

    } catch (error) {
        console.error("Error checking agent status:", error);
        res.json({ status: "error", message: "Failed to check agent status" });
    }
});


import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "secretkey123";

app.get("/validate-token", async (req, res) => {
    const token = req.query.token;

    if (!token) {
        return res.json({ valid: false, message: "Token missing" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        const [rows] = await db.query(
            "SELECT username, status FROM agents WHERE username = ? AND status = 'connected'",
            [decoded.username]
        );

        if (rows.length > 0) {
            return res.json({
                valid: true,
                status: "connected",
                username: decoded.username
            });
        } else {
            return res.json({
                valid: true,
                status: "disconnected",
                username: decoded.username,
                message: "Token valid but agent not connected"
            });
        }

    } catch (err) {
        console.error("Token validation error:", err.message);
        return res.json({
            valid: false,
            status: "invalid",
            message: "Invalid token"
        });
    }
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        message: "Backend server is running",
        timestamp: new Date().toISOString()
    });
});

app.listen(5000, () => {
    console.log("Backend running on http://localhost:5000");
});