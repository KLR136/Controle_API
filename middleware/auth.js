const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const platform = req.headers['x-platform'] || 'web';

    if (!token) {
        return res.status(401).json({ 
            success: false,
            error: 'Token d\'authentification requis' 
        });
    }

    try {
        // Vérifier la session dans la base de données
        const [sessions] = await pool.execute(
            `SELECT s.*, u.id as user_id, u.email, u.role 
             FROM sessions s 
             JOIN users u ON s.user_id = u.id 
             WHERE s.token = ? AND s.platform = ? AND s.expires_at > NOW()`,
            [token, platform]
        );

        if (sessions.length === 0) {
            return res.status(403).json({ 
                success: false,
                error: 'Session invalide ou expirée' 
            });
        }

        const session = sessions[0];

        // Vérifier le token JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        
        req.user = {
            id: decoded.userId,
            email: decoded.email,
            role: decoded.role
        };
        
        next();
    } catch (error) {
        return res.status(403).json({ 
            success: false,
            error: 'Token invalide' 
        });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false,
            error: 'Accès réservé aux administrateurs' 
        });
    }
    next();
};

module.exports = {
    authenticateToken,
    requireAdmin
};