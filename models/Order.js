const pool = require('../config/database');

class Order {
    // Créer une nouvelle commande
    static async create(orderData) {
        const { user_id, cart_id, shipping_address, total_amount } = orderData;
        
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [result] = await connection.execute(
                `INSERT INTO orders (user_id, cart_id, shipping_address, total_amount) 
                 VALUES (?, ?, ?, ?)`,
                [user_id, cart_id, shipping_address, total_amount]
            );

            await connection.commit();
            return await this.findById(result.insertId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Trouver une commande par ID
    static async findById(id, userId = null) {
        try {
            let query = `
                SELECT o.*, c.user_id, u.email as user_email
                FROM orders o
                JOIN carts c ON o.cart_id = c.id
                JOIN users u ON c.user_id = u.id
                WHERE o.id = ?
            `;

            const params = [id];

            if (userId) {
                query += ' AND c.user_id = ?';
                params.push(userId);
            }

            const [orders] = await pool.execute(query, params);

            if (orders.length === 0) return null;

            const order = orders[0];
            const items = await this.getOrderItems(order.cart_id);

            return {
                id: order.id,
                user_id: order.user_id,
                user_email: order.user_email,
                cart_id: order.cart_id,
                shipping_address: order.shipping_address,
                total_amount: parseFloat(order.total_amount),
                status: order.status,
                created_at: order.created_at,
                items
            };
        } catch (error) {
            throw error;
        }
    }

    // Récupérer toutes les commandes d'un utilisateur
    static async findByUserId(userId, page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;

            const [orders] = await pool.execute(
                `SELECT o.*, c.user_id,
                        COUNT(*) OVER() as total_count
                 FROM orders o
                 JOIN carts c ON o.cart_id = c.id
                 WHERE c.user_id = ?
                 ORDER BY o.created_at DESC
                 LIMIT ? OFFSET ?`,
                [userId, limit, offset]
            );

            const total = orders.length > 0 ? parseInt(orders[0].total_count) : 0;

            // Récupérer les détails pour chaque commande
            const ordersWithDetails = await Promise.all(
                orders.map(async (order) => {
                    const items = await this.getOrderItems(order.cart_id);
                    return {
                        id: order.id,
                        total_amount: parseFloat(order.total_amount),
                        shipping_address: order.shipping_address,
                        status: order.status,
                        created_at: order.created_at,
                        items
                    };
                })
            );

            return {
                orders: ordersWithDetails,
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

    // Récupérer toutes les commandes (admin)
    static async findAll(page = 1, limit = 10, filters = {}) {
        try {
            const offset = (page - 1) * limit;
            const { status, start_date, end_date } = filters;

            let query = `
                SELECT o.*, c.user_id, u.email as user_email,
                       COUNT(*) OVER() as total_count
                FROM orders o
                JOIN carts c ON o.cart_id = c.id
                JOIN users u ON c.user_id = u.id
                WHERE 1=1
            `;

            const params = [];

            if (status) {
                query += ' AND o.status = ?';
                params.push(status);
            }

            if (start_date) {
                query += ' AND o.created_at >= ?';
                params.push(start_date);
            }

            if (end_date) {
                query += ' AND o.created_at <= ?';
                params.push(end_date);
            }

            query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            const [orders] = await pool.execute(query, params);

            const total = orders.length > 0 ? parseInt(orders[0].total_count) : 0;

            // Récupérer les détails pour chaque commande
            const ordersWithDetails = await Promise.all(
                orders.map(async (order) => {
                    const items = await this.getOrderItems(order.cart_id);
                    return {
                        id: order.id,
                        user_id: order.user_id,
                        user_email: order.user_email,
                        total_amount: parseFloat(order.total_amount),
                        shipping_address: order.shipping_address,
                        status: order.status,
                        created_at: order.created_at,
                        items
                    };
                })
            );

            return {
                orders: ordersWithDetails,
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

    // Mettre à jour le statut d'une commande
    static async updateStatus(id, status) {
        try {
            const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered'];
            if (!validStatuses.includes(status)) {
                throw new Error('Statut de commande invalide');
            }

            const [result] = await pool.execute(
                'UPDATE orders SET status = ? WHERE id = ?',
                [status, id]
            );

            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    // Récupérer les éléments d'une commande
    static async getOrderItems(cartId) {
        try {
            const [items] = await pool.execute(
                `SELECT ci.product_id, p.title, p.price, ci.quantity,
                        (p.price * ci.quantity) as subtotal
                 FROM cart_items ci
                 JOIN products p ON ci.product_id = p.id
                 WHERE ci.cart_id = ?`,
                [cartId]
            );

            return items.map(item => ({
                product_id: item.product_id,
                title: item.title,
                price: parseFloat(item.price),
                quantity: item.quantity,
                subtotal: parseFloat(item.subtotal)
            }));
        } catch (error) {
            throw error;
        }
    }

    // Obtenir les statistiques des commandes
    static async getStats() {
        try {
            // Total des commandes
            const [totalOrders] = await pool.execute('SELECT COUNT(*) as count FROM orders');
            
            // Chiffre d'affaires total
            const [totalRevenue] = await pool.execute(
                'SELECT COALESCE(SUM(total_amount), 0) as revenue FROM orders WHERE status != "pending"'
            );
            
            // Commandes par statut
            const [ordersByStatus] = await pool.execute(
                'SELECT status, COUNT(*) as count FROM orders GROUP BY status'
            );
            
            // Commandes des 30 derniers jours
            const [recentOrders] = await pool.execute(
                `SELECT DATE(created_at) as date, COUNT(*) as count, SUM(total_amount) as revenue
                 FROM orders 
                 WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                 GROUP BY DATE(created_at)
                 ORDER BY date DESC`
            );

            return {
                total_orders: totalOrders[0].count,
                total_revenue: parseFloat(totalRevenue[0].revenue),
                orders_by_status: ordersByStatus.reduce((acc, item) => {
                    acc[item.status] = item.count;
                    return acc;
                }, {}),
                recent_orders: recentOrders
            };
        } catch (error) {
            throw error;
        }
    }

    // Obtenir les produits les plus vendus
    static async getTopProducts(limit = 5) {
        try {
            const [products] = await pool.execute(
                `SELECT p.id, p.title, SUM(ci.quantity) as total_sold,
                        SUM(ci.quantity * p.price) as total_revenue
                 FROM cart_items ci
                 JOIN carts c ON ci.cart_id = c.id
                 JOIN orders o ON c.id = o.cart_id
                 JOIN products p ON ci.product_id = p.id
                 WHERE o.status != 'pending'
                 GROUP BY p.id, p.title
                 ORDER BY total_sold DESC
                 LIMIT ?`,
                [limit]
            );

            return products.map(product => ({
                id: product.id,
                title: product.title,
                total_sold: parseInt(product.total_sold),
                total_revenue: parseFloat(product.total_revenue)
            }));
        } catch (error) {
            throw error;
        }
    }
}

module.exports = Order;