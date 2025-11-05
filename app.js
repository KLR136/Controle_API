const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import des routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');

// Import de la configuration DB et middleware
const pool = require('./config/database');
const { authenticateToken } = require('./middleware/auth');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

// Route de test
app.get('/api', (req, res) => {
    res.json({
        message: 'Bienvenue sur l\'API E-commerce',
        version: '1.0.0',
        endpoints: {
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                profile: 'GET /api/auth/profile'
            },
            products: {
                list: 'GET /api/products',
                details: 'GET /api/products/:id',
                featured: 'GET /api/products/featured',
                tags: 'GET /api/products/tags'
            },
            cart: {
                get: 'GET /api/cart',
                add: 'POST /api/cart/items',
                update: 'PUT /api/cart/items/:product_id',
                remove: 'DELETE /api/cart/items/:product_id',
                clear: 'DELETE /api/cart'
            },
            orders: {
                create: 'POST /api/orders',
                list: 'GET /api/orders',
                details: 'GET /api/orders/:id'
            }
        }
    });
});

// Gestion des erreurs 404
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route non trouvée'
    });
});

// Middleware de gestion d'erreurs
app.use((error, req, res, next) => {
    console.error('Erreur:', error);
    res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur API démarré sur http://localhost:${PORT}`);
    console.log(`📚 Documentation API: http://localhost:${PORT}/api`);
});