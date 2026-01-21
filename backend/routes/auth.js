import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../config/db.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "secretkey123";

router.post("/signup", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "All fields required" });
    }

    try {
        const [existing] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
        if (existing.length > 0) {
            return res.status(400).json({ message: "User already exists" });
        }
        const hashed = await bcrypt.hash(password, 10);
        await db.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashed]);
        return res.status(201).json({ message: "User registered successfully!" });
    } catch (err) {
        console.error("Signup Error:", err);
        return res.status(500).json({ error: "Database error" });
    }
});

router.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "All fields required" });
    }
    try {
        const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
        if (rows.length === 0) return res.status(400).json({ error: "Invalid Credentials" });

        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: "Invalid Credentials" });

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "24h", });
        return res.json({ message: "Login successful", token });
    } catch (err) {
        console.error("Login Error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});
export default router;