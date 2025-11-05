const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authController = {
    // Inscription d'un nouvel utilisateur
    register: async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Email et mot de passe requis' 
                });
            }

            // Validation de l'email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    error: 'Format d\'email invalide'
                });
            }

            // Vérifier si l'utilisateur existe déjà
            const [existingUsers] = await pool.execute(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );

            if (existingUsers.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: 'Cet email est déjà utilisé'
                });
            }

            // Hasher le mot de passe
            const hashedPassword = await bcrypt.hash(password, 12);

            // Créer l'utilisateur
            const [result] = await pool.execute(
                'INSERT INTO users (email, password) VALUES (?, ?)',
                [email, hashedPassword]
            );

            res.status(201).json({
                success: true,
                message: 'Utilisateur créé avec succès',
                data: {
                    user_id: result.insertId
                }
            });
        } catch (error) {
            console.error('Erreur register:', error);
            res.status(500).json({
                success: false,
                error: 'Erreur lors de la création du compte'
            });
        }
    },

    // Connexion de l'utilisateur
    login: async (req, res) => {
        try {
            const { email, password } = req.body;
            const platform = req.headers['x-platform'] || 'web';

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Email et mot de passe requis'
                });
            }

            // Récupérer l'utilisateur
            const [users] = await pool.execute(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (users.length === 0) {
                return res.status(401).json({
                    success: false,
                    error: 'Identifiants invalides'
                });
            }

            const user = users[0];

            // Vérifier le mot de passe
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({
                    success: false,
                    error: 'Identifiants invalides'
                });
            }

            // Déterminer la durée de la session
            let expiresIn;
            if (platform === 'kiosk') {
                expiresIn = '1h';
            } else {
                expiresIn = '30d';
            }

            // Générer un token
            const token = jwt.sign(
                { 
                    userId: user.id, 
                    email: user.email, 
                    role: user.role 
                },
                process.env.JWT_SECRET || 'secret',
                { expiresIn }
            );

            // Calculer la date d'expiration
            const expiresAt = new Date();
            if (platform === 'kiosk') {
                expiresAt.setHours(expiresAt.getHours() + 1);
            } else {
                expiresAt.setDate(expiresAt.getDate() + 30);
            }

            // Supprimer les sessions expirées de l'utilisateur
            await pool.execute(
                'DELETE FROM sessions WHERE user_id = ? AND expires_at < NOW()',
                [user.id]
            );

            // Stocker la nouvelle session
            await pool.execute(
                'INSERT INTO sessions (user_id, token, platform, expires_at) VALUES (?, ?, ?, ?)',
                [user.id, token, platform, expiresAt]
            );

            res.json({
                success: true,
                message: 'Connexion réussie',
                data: {
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        role: user.role
                    }
                }
            });
        } catch (error) {
            console.error('Erreur login:', error);
            res.status(500).json({
                success: false,
                error: 'Erreur de connexion'
            });
        }
    },

    // Déconnexion
    logout: async (req, res) => {
        try {
            const token = req.headers['authorization'].split(' ')[1];
            
            await pool.execute('DELETE FROM sessions WHERE token = ?', [token]);
            
            res.json({
                success: true,
                message: 'Déconnexion réussie'
            });
        } catch (error) {
            console.error('Erreur logout:', error);
            res.status(500).json({
                success: false,
                error: 'Erreur lors de la déconnexion'
            });
        }
    },

    // Vérification du token
    verify: async (req, res) => {
        try {
            res.json({
                success: true,
                data: {
                    user: req.user
                }
            });
        } catch (error) {
            console.error('Erreur verify:', error);
            res.status(500).json({
                success: false,
                error: 'Erreur de vérification'
            });
        }
    },

    // Récupération du profil utilisateur
    getProfile: async (req, res) => {
        try {
            const [users] = await pool.execute(
                'SELECT id, email, role, created_at FROM users WHERE id = ?',
                [req.user.id]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Utilisateur non trouvé'
                });
            }

            res.json({
                success: true,
                data: {
                    user: users[0]
                }
            });
        } catch (error) {
            console.error('Erreur getProfile:', error);
            res.status(500).json({
                success: false,
                error: 'Erreur lors de la récupération du profil'
            });
        }
    }
};

module.exports = authController;