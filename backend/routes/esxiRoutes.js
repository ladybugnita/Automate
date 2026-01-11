import express from 'express';
import jwt from 'jsonwebtoken';
import * as esxiModel from '../models/esxiModel.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "secretkey123";

// Token verification middleware with user_id extraction
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    } else {
        token = req.query.token || req.body.token;
    }
    
    if (!token) {
        return res.status(401).json({ 
            success: false,
            error: 'Access token required' 
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // This should have id, username from your JWT
        console.log('Token verified for user:', decoded);
        next();
    } catch (err) {
        console.error('Token verification error:', err.message);
        return res.status(401).json({ 
            success: false,
            error: 'Invalid token' 
        });
    }
};

// Route to save ESXi connection (with user_id from token)
router.post('/save-esxi', verifyToken, async (req, res) => {
    try {
        const { 
            connection_name, 
            ip_address, 
            username = 'root', 
            password, 
            installation_type = 'existing',
            status = 'pending'
        } = req.body;

        // Validate required fields
        if (!ip_address || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'IP address and password are required' 
            });
        }

        console.log('Saving ESXi connection for user ID:', req.user.id, 'Username:', req.user.username);

        const result = await esxiModel.saveEsxiConnection({
            user_id: req.user.id || 1, // Get from token, fallback to 1
            connection_name: connection_name || `ESXi-${ip_address}`,
            ip_address,
            username,
            password,
            installation_type,
            status: status || 'pending'
        });

        res.json({
            success: true,
            data: result,
            message: 'ESXi connection saved successfully'
        });

    } catch (error) {
        console.error('Error in save-esxi:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to save ESXi connection',
            details: error.message 
        });
    }
});

// Route to save validated ESXi connection (for WebSocket validation flow)
router.post('/save-validated-esxi', verifyToken, async (req, res) => {
    try {
        const { 
            ip, 
            username = 'root', 
            password, 
            name,
            validated = false
        } = req.body;

        console.log('Received validated ESXi save request for user:', req.user.id, { ip, username, name, validated });

        // Validate required fields
        if (!ip || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'IP address and password are required' 
            });
        }

        const result = await esxiModel.saveEsxiConnection({
            user_id: req.user.id || 1,
            connection_name: name || `ESXi-${ip}`,
            ip_address: ip,
            username,
            password,
            installation_type: 'existing',
            status: validated ? 'connected' : 'pending'
        });

        res.json({
            success: true,
            data: result,
            message: 'ESXi connection saved successfully'
        });

    } catch (error) {
        console.error('Error in save-validated-esxi:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to save ESXi connection',
            details: error.message 
        });
    }
});

// Route to get all ESXi connections for the authenticated user
router.get('/get-esxi-connections', verifyToken, async (req, res) => {
    try {
        const filters = {
            user_id: req.user.id // Filter by authenticated user
        };
        
        // Optional filters from query params
        if (req.query.status) filters.status = req.query.status;
        if (req.query.installation_type) filters.installation_type = req.query.installation_type;

        const connections = await esxiModel.getEsxiConnections(filters);
        
        // Don't send passwords in response for security
        const safeConnections = connections.map(conn => ({
            id: conn.id,
            user_id: conn.user_id,
            connection_name: conn.connection_name,
            ip_address: conn.ip_address,
            username: conn.username,
            status: conn.status,
            installation_type: conn.installation_type,
            last_seen: conn.last_seen,
            created_at: conn.created_at,
            updated_at: conn.updated_at
        }));
        
        res.json({ 
            success: true, 
            connections: safeConnections,
            count: safeConnections.length
        });
    } catch (error) {
        console.error('Error in get-esxi-connections:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch ESXi connections',
            details: error.message 
        });
    }
});

// Route to get single ESXi connection (for installation - includes password)
router.get('/get-esxi-connection/:ip_address', verifyToken, async (req, res) => {
    try {
        const { ip_address } = req.params;
        
        const connection = await esxiModel.getEsxiConnectionByIP(ip_address, req.user.id);
        
        if (!connection) {
            return res.status(404).json({ 
                success: false,
                error: 'ESXi connection not found' 
            });
        }
        
        res.json({ 
            success: true, 
            connection: connection 
        });
    } catch (error) {
        console.error('Error in get-esxi-connection:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch ESXi connection',
            details: error.message 
        });
    }
});

// Route to update connection status
router.put('/update-status/:ip_address', verifyToken, async (req, res) => {
    try {
        const { ip_address } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ 
                success: false,
                error: 'Status is required' 
            });
        }

        const validStatuses = ['pending', 'connected', 'disconnected', 'installing', 'installed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid status value' 
            });
        }

        const result = await esxiModel.updateConnectionStatus(ip_address, status, req.user.id);
        
        res.json({
            success: result.success,
            message: result.message
        });
    } catch (error) {
        console.error('Error in update-status:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update status',
            details: error.message 
        });
    }
});

// Route to mark as installed
router.post('/mark-installed/:ip_address', verifyToken, async (req, res) => {
    try {
        const { ip_address } = req.params;
        
        const result = await esxiModel.markAsInstalled(ip_address, req.user.id);
        
        res.json({
            success: result.success,
            message: result.message
        });
    } catch (error) {
        console.error('Error in mark-installed:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to mark as installed',
            details: error.message 
        });
    }
});

// Route to delete connection
router.delete('/delete-esxi/:ip_address', verifyToken, async (req, res) => {
    try {
        const { ip_address } = req.params;
        
        const result = await esxiModel.deleteEsxiConnection(ip_address, req.user.id);
        
        res.json({
            success: result.success,
            message: result.message
        });
    } catch (error) {
        console.error('Error in delete-esxi:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to delete ESXi connection',
            details: error.message 
        });
    }
});

export default router;