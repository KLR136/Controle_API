const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
    // Créer un nouvel utilisateur
    static async create(userData) {
        const { email, password, role = 'customer' } = userData;
        
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Hasher le mot de passe
            const hashedPassword = await bcrypt.hash(password, 12);

            const [result] = await connection.execute(
                'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
                [email, hashedPassword, role]
            );

            await connection.commit();
            return {
                id: result.insertId,
                email,
                role,
                created_at: new Date()
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Trouver un utilisateur par email
    static async findByEmail(email) {
        try {
            const [users] = await pool.execute(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );
            return users.length > 0 ? users[0] : null;
        } catch (error) {
            throw error;
        }
    }

    // Trouver un utilisateur par ID
    static async findById(id) {
        try {
            const [users] = await pool.execute(
                'SELECT id, email, role, created_at, updated_at FROM users WHERE id = ?',
                [id]
            );
            return users.length > 0 ? users[0] : null;
        } catch (error) {
            throw error;
        }
    }

    // Vérifier le mot de passe
    static async verifyPassword(plainPassword, hashedPassword) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }

    // Mettre à jour le profil utilisateur
    static async update(id, updateData) {
        const { email, password } = updateData;
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            let query = 'UPDATE users SET ';
            const params = [];
            const updates = [];

            if (email) {
                updates.push('email = ?');
                params.push(email);
            }

            if (password) {
                const hashedPassword = await bcrypt.hash(password, 12);
                updates.push('password = ?');
                params.push(hashedPassword);
            }

            if (updates.length === 0) {
                throw new Error('Aucune donnée à mettre à jour');
            }

            query += updates.join(', ') + ', updated_at = NOW() WHERE id = ?';
            params.push(id);

            const [result] = await connection.execute(query, params);

            await connection.commit();
            return result.affectedRows > 0;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Supprimer un utilisateur
    static async delete(id) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Supprimer les sessions associées
            await connection.execute('DELETE FROM sessions WHERE user_id = ?', [id]);
            
            // Supprimer l'utilisateur
            const [result] = await connection.execute('DELETE FROM users WHERE id = ?', [id]);

            await connection.commit();
            return result.affectedRows > 0;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Récupérer tous les utilisateurs (admin)
    static async findAll(page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;

            const [users] = await pool.execute(
                `SELECT id, email, role, created_at, updated_at 
                 FROM users 
                 ORDER BY created_at DESC 
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            const [countResult] = await pool.execute('SELECT COUNT(*) as total FROM users');
            const total = countResult[0].total;

            return {
                users,
                pagination: {
                    current: page,
                    total: Math.ceil(total / limit),
                    limit,
                    totalItems: total
                }
            };
        } catch (error) {
            throw error;
        }
    }

    // Vérifier si l'email existe déjà
    static async emailExists(email, excludeId = null) {
        try {
            let query = 'SELECT id FROM users WHERE email = ?';
            const params = [email];

            if (excludeId) {
                query += ' AND id != ?';
                params.push(excludeId);
            }

            const [users] = await pool.execute(query, params);
            return users.length > 0;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = User;