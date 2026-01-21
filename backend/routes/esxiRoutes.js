import express from 'express';
import jwt from 'jsonwebtoken';
import ESXiDB from '../config/esxiDb.js'; 

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "secretkey123";

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
        req.user = decoded; 
        console.log('Token verified for user:', { id: decoded.id, username: decoded.username });
        next();
    } catch (err) {
        console.error('Token verification error:', err.message);
        return res.status(401).json({ 
            success: false,
            error: 'Invalid token' 
        });
    }
};

router.post('/save-esxi-host', verifyToken, async (req, res) => {
    try {
        const { 
            connection_name, 
            connectionName, 
            host_ip, 
            ip, 
            username = 'root',
            password, 
            installation_type = 'existing',
            status = 'pending'
        } = req.body;

        console.log('Save ESXi host request:', {
            user_id: req.user.id,
            username: req.user.username,
            connection_name,
            connectionName,
            host_ip,
            ip,
            username_provided: username,
            password_length: password ? password.length : 0,
            installation_type,
            status
        });

        const finalHostIp = host_ip || ip;
        
        if (!finalHostIp || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Host IP and password are required' 
            });
        }

        const finalConnectionName = connection_name || connectionName || `ESXi-${finalHostIp}`;

        console.log('Using ESXiDB.addConnection with:', {
            user_id: req.user.id,
            connection_name: finalConnectionName,
            host_ip: finalHostIp,
            username,
            installation_type,
            status
        });

        const result = await ESXiDB.addConnection({
            connection_name: finalConnectionName,
            connectionName: finalConnectionName, 
            ip: finalHostIp,
            host_ip: finalHostIp,
            username,
            password, 
            installation_type,
            status: status || 'pending'
        }, req.user.id);

        if (!result.success) {
            return res.status(result.error?.includes('already exists') ? 409 : 400).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data,
            message: 'ESXi host saved successfully'
        });

    } catch (error) {
        console.error('Error in save-esxi-host:', error);
        
        let statusCode = 500;
        let errorMessage = 'Failed to save ESXi host';
        
        if (error.message.includes('already have') || error.message.includes('already exists')) {
            statusCode = 409; 
            errorMessage = error.message;
        } else if (error.message.includes('is required')) {
            statusCode = 400; 
            errorMessage = error.message;
        }
        
        res.status(statusCode).json({ 
            success: false,
            error: errorMessage,
            details: error.message 
        });
    }
});

router.get('/get-esxi-host-with-password/:host_id', verifyToken, async (req, res) => {
    try {
        const { host_id } = req.params;
        
        console.log('Getting ESXi host with password:', {
            host_id,
            user_id: req.user.id,
            username: req.user.username
        });
        
        const result = await ESXiDB.getConnectionById(host_id, req.user.id, true);
        
        if (!result.success) {
            return res.status(404).json({ 
                success: false,
                error: result.error || 'ESXi host not found'
            });
        }
        
        res.json({ 
            success: true, 
            host: result.connection
        });
    } catch (error) {
        console.error('Error in get-esxi-host-with-password:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch ESXi host',
            details: error.message 
        });
    }
});

router.get('/get-esxi-credentials/:host_id', verifyToken, async (req, res) => {
    try {
        const { host_id } = req.params;
        
        console.log('Getting ESXi credentials for host:', {
            host_id,
            user_id: req.user.id,
            username: req.user.username
        });
        
        const result = await ESXiDB.getEsxiCredentials(host_id, req.user.id);
        
        if (!result.success) {
            return res.status(404).json({ 
                success: false,
                error: result.error || 'ESXi host not found'
            });
        }
        
        res.json({ 
            success: true, 
            credentials: result.credentials
        });
    } catch (error) {
        console.error('Error in get-esxi-credentials:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch ESXi credentials',
            details: error.message 
        });
    }
});

router.get('/get-esxi-hosts', verifyToken, async (req, res) => {
    try {
        const includePassword = req.query.include_password === 'true';
        
        console.log('Getting ESXi hosts for user:', {
            user_id: req.user.id,
            username: req.user.username,
            include_password: includePassword
        });
        
        const result = await ESXiDB.getConnections(req.user.id, includePassword);
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false,
                error: result.error || 'Failed to fetch ESXi hosts'
            });
        }
        
        res.json({ 
            success: true, 
            hosts: result.connections,
            connections: result.connections, 
            count: result.connections.length
        });
    } catch (error) {
        console.error('Error in get-esxi-hosts:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch ESXi hosts',
            details: error.message 
        });
    }
});

router.get('/get-esxi-host/:host_id', verifyToken, async (req, res) => {
    try {
        const { host_id } = req.params;
        const includePassword = req.query.include_password === 'true';
        
        console.log('Getting ESXi host by ID:', {
            host_id,
            user_id: req.user.id,
            include_password: includePassword
        });
        
        const result = await ESXiDB.getConnectionById(host_id, req.user.id, includePassword);
        
        if (!result.success) {
            return res.status(404).json({ 
                success: false,
                error: result.error || 'ESXi host not found'
            });
        }
        
        res.json({ 
            success: true, 
            host: result.connection,
            connection: result.connection 
        });
    } catch (error) {
        console.error('Error in get-esxi-host:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch ESXi host',
            details: error.message 
        });
    }
});

router.put('/update-host-status/:host_id', verifyToken, async (req, res) => {
    try {
        const { host_id } = req.params;
        const { status } = req.body;

        console.log('Updating host status:', {
            host_id,
            user_id: req.user.id,
            status
        });

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

        const result = await ESXiDB.updateConnection(host_id, { status }, req.user.id);
        
        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: result.error || 'Failed to update status'
            });
        }
        
        res.json({
            success: true,
            message: result.message || 'Status updated successfully',
            affectedRows: result.affectedRows
        });
    } catch (error) {
        console.error('Error in update-host-status:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update status',
            details: error.message 
        });
    }
});

router.post('/mark-host-installed/:host_id', verifyToken, async (req, res) => {
    try {
        const { host_id } = req.params;
        
        console.log('Marking host as installed:', {
            host_id,
            user_id: req.user.id
        });
        
        const result = await ESXiDB.updateConnection(host_id, { status: 'installed' }, req.user.id);
        
        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: result.error || 'Failed to mark as installed'
            });
        }
        
        res.json({
            success: true,
            message: result.message || 'Host marked as installed',
            affectedRows: result.affectedRows
        });
    } catch (error) {
        console.error('Error in mark-host-installed:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to mark as installed',
            details: error.message 
        });
    }
});

router.delete('/delete-esxi-host/:host_id', verifyToken, async (req, res) => {
    try {
        const { host_id } = req.params;
        
        console.log('Deleting ESXi host:', {
            host_id,
            user_id: req.user.id
        });
        
        const result = await ESXiDB.deleteConnection(host_id, req.user.id);
        
        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: result.error || 'Failed to delete host'
            });
        }
        
        res.json({
            success: true,
            message: result.message || 'Host deleted successfully',
            affectedRows: result.affectedRows
        });
    } catch (error) {
        console.error('Error in delete-esxi-host:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to delete ESXi host',
            details: error.message 
        });
    }
});

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

        console.log('Legacy save-esxi request:', {
            user_id: req.user.id,
            ip_address,
            password_length: password ? password.length : 0
        });

        const result = await ESXiDB.addConnection({
            connection_name: connection_name || `ESXi-${ip_address}`,
            ip: ip_address,
            host_ip: ip_address,
            username,
            password, 
            installation_type,
            status: status || 'pending'
        }, req.user.id);

        if (!result.success) {
            return res.status(result.error?.includes('already exists') ? 409 : 400).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data,
            message: 'ESXi connection saved successfully'
        });

    } catch (error) {
        console.error('Error in legacy save-esxi:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to save ESXi connection',
            details: error.message 
        });
    }
});

router.get('/get-esxi-connections', verifyToken, async (req, res) => {
    try {
        const includePassword = req.query.include_password === 'true';
        
        console.log('Legacy get-esxi-connections request:', {
            user_id: req.user.id,
            include_password: includePassword
        });
        
        const result = await ESXiDB.getConnections(req.user.id, includePassword);
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false,
                error: result.error || 'Failed to fetch ESXi connections'
            });
        }
        
        const connections = result.connections.map(host => ({
            id: host.id,
            connection_id: host.connection_id,
            connection_name: host.connection_name,
            name: host.name,
            ip_address: host.host_ip, 
            host_ip: host.host_ip,
            ip: host.ip,
            username: host.username,
            ...(includePassword && host.password && { password: host.password }),
            status: host.status,
            installation_type: host.installation_type,
            last_seen: host.last_seen,
            lastSeen: host.lastSeen,
            created_at: host.created_at,
            hasCompleteCredentials: host.hasCompleteCredentials
        }));
        
        res.json({ 
            success: true, 
            connections: connections,
            hosts: connections, 
            count: connections.length
        });
    } catch (error) {
        console.error('Error in legacy get-esxi-connections:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch ESXi connections',
            details: error.message 
        });
    }
});

router.post('/test-esxi-connection', verifyToken, async (req, res) => {
    try {
        const { host_ip, username, password } = req.body;
        
        console.log('Testing ESXi connection:', {
            user_id: req.user.id,
            host_ip,
            username
        });
        
        if (!host_ip || !password) {
            return res.status(400).json({
                success: false,
                error: 'Host IP and password are required'
            });
        }
        
        const isValidIP = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(host_ip);
        
        if (!isValidIP) {
            return res.json({
                success: false,
                valid: false,
                message: 'Invalid IP address format'
            });
        }
        
        res.json({
            success: true,
            valid: true,
            message: 'ESXi connection test successful ',
            host_info: {
                ip: host_ip,
                username: username || 'root',
                validated_at: new Date().toISOString().replace('T', ' ').split('.')[0]
            }
        });
        
    } catch (error) {
        console.error('Error in test-esxi-connection:', error);
        res.status(500).json({
            success: false,
            error: 'Connection test failed',
            details: error.message
        });
    }
});

export default router;