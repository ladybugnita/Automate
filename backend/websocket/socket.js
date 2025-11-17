import express from "express";
import http, { globalAgent } from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import path from "path";
import jwt from "jsonwebtoken";
import db from "../config/db.js";

dotenv.config({ path: path.resolve("backend/.env") });

const SECRET = process.env.JWT_SECRET;
const PORT = 8081;

const app = express();
const server = http.createServer(app);

const agentWss = new WebSocketServer({ server, path: "/socket" });
const adminWss = new WebSocketServer({ port: 8082, path: "/ws/admin" });

console.log("Agent WS:", `ws://localhost:${PORT}/socket`);
console.log("Admin WS:", `ws://localhost:8082/ws/admin`);

const agentClients = new Map();

const heartbeat = (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => ws.isAlive = true);
};

 setInterval(async () => {
    for (const [username, ws] of agentClients.entries()) {
        if (!ws.isAlive) {
            ws.terminate();
            agentClients.delete(username);
            
            try {
            await db.query(
                "UPDATE agents SET status='disconnected', updatedAt=NOW() WHERE username=?",
                [username]
            );

            notifyAdmin({
                type: "AGENT_STATUS_CHANGED",
                username,
                status: "disconnected"
            });
        } catch (err) {
            console.error("Error updating agent status:", err);
        }

            continue;
        }
        ws.isAlive = false;
        ws.ping();
    }
}, 30000);

function notifyAdmin(msg) {
    adminWss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify(msg));
        }
    });
}

function authenticateToken(token) {
    try {
        const payload =jwt.verify(token, SECRET);
        return {
            id: payload.id,
            username: payload.username,
        };
    } catch (err) {
        console.log("Token verification failed:", err.message);
        return null;
    }
}

async function authenticateViaURL(ws, req){
    try {
        const url = new URL (req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get("token");

        if (!token) {
            console.log("No token provided");
            ws.send(JSON.stringify({ status: "error", message: "No token provided" }));
            ws.close();
            return false;
        }

        const user = authenticateToken(token);
        if(!user){
            console.log("Invalid token");
            ws.send(JSON.stringify({ status: "error", message: "Invalid token" }));
            ws.close();
            return false;
        }

        
        ws.user = user;
        ws.authenticated = true;

        await db.query(
            `INSERT INTO agents (token, username, status)
             VALUES (?, ?, 'connected')
             ON DUPLICATE KEY UPDATE status='connected', updatedAt=NOW()`,
            [token, user.username]
        );

        agentClients.set(user.username, ws);

        ws.send(JSON.stringify({
            type: "TOKEN_CONFIRMED",
            username: user.username,
            message: "WebSocket Auth Successful"
        }));

        notifyAdmin({
            type: "AGENT_STATUS_CHANGED",
            username: user.username,
            status: "connected"
        });
        console.log("Agent connected:", user.username);
        return true;

    } catch (err) {
       console.log("URL auth error:", err.message);
       ws.send(JSON.stringify({ status: "error", message:"Auth failed" }));
       ws.close();
        return false;
    }
}

agentWss.on("connection", async (ws, req) => {
    console.log("Agent attemtpting to connect...");
    heartbeat(ws);

    const ok = await authenticateViaURL(ws, req);
    if(!ok) return ;

    ws.on("message", async (raw) => {
         if (!ws.authenticated) return;
        try {
        const data = JSON.parse(raw);

        if (data.type === "COMMAND") {
            const result = `Executed: ${data.command}`;
            ws.send(JSON.stringify({ type: "COMMAND_RESULT", result }));
            notifyAdmin({
                type: "COMMAND_RESULT",
                username: ws.user.username,
                result,
            });
        }
    } catch (err) {
        console.error("Error processing message:", err);
    }
    });

    ws.on("close", async () => {
        if (!ws.authenticated) return; 

            const username = ws.user.username;
            agentClients.delete(username);

            try{
            await db.query(
                "UPDATE agents SET status='disconnected', updatedAt=NOW() WHERE username=?",
                [username]
            );

            notifyAdmin({
                type: "AGENT_STATUS_CHANGED",
                username,
                status: "disconnected"
            });

            console.log("Agent disconnected:", username);     
    } catch (err) {
        console.error("Error updating agent status on disconnect:", err);
    }
    });

    ws.on("error", (error) => {
        console.error("Websocket error:", error);
    });
});

adminWss.on("connection", async (ws) => {
    console.log("Admin connected");
    
    try{
    const [rows] = await db.query(
        "SELECT username, status, updatedAt AS last_seen FROM agents"
    );

    ws.send(JSON.stringify({ type: "AGENT_LIST", agents: rows }));
} catch (err){
    console.error("Error fetching agents:", err);
    ws.send(JSON.stringify({ type: "AGENT_LIST", agents: [] }));
}

    ws.on("message", (msg) => {
        try{
        const payload = JSON.parse(msg);

        if (payload.type === "SEND_COMMAND") {
            const target = agentClients.get(payload.username);

            if (target && target.readyState === target.OPEN) {
                target.send(JSON.stringify({
                    type: "COMMAND",
                    command: payload.command
                }));
            }
        }
    } catch (err) {
        console.error ("Error processing admin message:", err);
    }
    });
    ws.on("error", (error) => {
        console.error("Admin WebSocke error:", error);
    });
});

server.listen(PORT, () => {
    console.log("HTTP + WS Server running on port:", PORT);
});
