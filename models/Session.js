const pool = require('../config/database');

class Session {
    // Créer une nouvelle session
    static async create(sessionData) {
        const { user_id, token, platform, expires_at } = sessionData;
        
        try {
            const [result] = await pool.execute(
                'INSERT INTO sessions (user_id, token, platform, expires_at) VALUES (?, ?, ?, ?)',
                [user_id, token, platform, expires_at]
            );
            return { id: result.insertId, user_id, token, platform, expires_at };
        } catch (error) {
            throw error;
        }
    }

    // Trouver une session par token
    static async findByToken(token) {
        try {
            const [sessions] = await pool.execute(
                `SELECT s.*, u.email, u.role 
                 FROM sessions s 
                 JOIN users u ON s.user_id = u.id 
                 WHERE s.token = ?`,
                [token]
            );
            return sessions.length > 0 ? sessions[0] : null;
        } catch (error) {
            throw error;
        }
    }

    // Trouver les sessions d'un utilisateur
    static async findByUserId(userId) {
        try {
            const [sessions] = await pool.execute(
                'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC',
                [userId]
            );
            return sessions;
        } catch (error) {
            throw error;
        }
    }

    // Supprimer une session
    static async delete(token) {
        try {
            const [result] = await pool.execute(
                'DELETE FROM sessions WHERE token = ?',
                [token]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    // Supprimer toutes les sessions d'un utilisateur
    static async deleteAllByUserId(userId) {
        try {
            const [result] = await pool.execute(
                'DELETE FROM sessions WHERE user_id = ?',
                [userId]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    // Supprimer les sessions expirées
    static async deleteExpired() {
        try {
            const [result] = await pool.execute(
                'DELETE FROM sessions WHERE expires_at < NOW()'
            );
            return result.affectedRows;
        } catch (error) {
            throw error;
        }
    }

    // Vérifier si une session est valide
    static async isValid(token, platform = null) {
        try {
            let query = `
                SELECT s.*, u.email, u.role 
                FROM sessions s 
                JOIN users u ON s.user_id = u.id 
                WHERE s.token = ? AND s.expires_at > NOW()
            `;

            const params = [token];

            if (platform) {
                query += ' AND s.platform = ?';
                params.push(platform);
            }

            const [sessions] = await pool.execute(query, params);
            return sessions.length > 0 ? sessions[0] : null;
        } catch (error) {
            throw error;
        }
    }

    // Prolonger une session
    static async extend(token, newExpiresAt) {
        try {
            const [result] = await pool.execute(
                'UPDATE sessions SET expires_at = ? WHERE token = ?',
                [newExpiresAt, token]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = Session;