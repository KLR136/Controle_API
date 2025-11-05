const pool = require('../config/database')

const orderController = {

    createOrder: async (req, res) => {

        try {
            const connection = await pool.getConnection();

            const userId = req.user.id;
            const {shipping_address } = req.body;

            if (!shipping_address) {
                await connection.rollback();
                return res.status(400).json({ 
                    success: false,
                    error: 'Shipping address is required' 
                });
            }

            const [cartItems] = await connection.execute(
                `SELECT c.id as cart, ci.product_id, ci.quantity, p.price, p.stock_quantity
                 FROM carts c
                 JOIN cart_items ci ON c.id = ci.cart_id
                 JOIN products p ON ci.product_id = p.id
                 WHERE c.user_id = ? AND c.is_active = TRUE`,
                [userId]
            );

            if (cartItems.length === 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    error: 'Your cart is empty'
                });
            }

            let total = 0;
            const stockErrors = [];

            for (const item of cartItems) {
                if (item.stock_quantity < item.quantity) {
                    stockErrors.push({
                        product_id: item.product_id,
                        title: item.title,
                        requested: item.quantity,
                        available: item.stock_quantity
                    });
                }
                total += item.price * item.quantity;
            }

            if (stockErrors.length > 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    error: 'Some products are out of stock',
                    details: { stockErrors : stockErrors  }
                });
            }

            const cartID = cartItems[0].cart_id;

            const [orderResult] = await connection.execute(
                `INSERT INTO orders (user_id, total_amount, shipping_address, total_amount)
                 VALUES (?, ?, ?, ?)`,
                [userId, total, shipping_address, total]
            );

            await connection.execute(
                `UPDATE carts SET is_active = FALSE WHERE id = ?`,
                [cartID]
            );

            await connection.commit();

            res.status(201).json({
                success: true,
                message: 'Order created successfully',
                data: {
                     orderId: orderResult.insertId,
                     total_amount: total.toFixed(2)
                }
            });
        } catch (error) {
            await connection.rollback();
            console.error('Error creating order:', error);
            res.status(500).json({
                success: false,
                error: 'Error during order creation'
            });
        } finally {
            connection.release();
        }
    },

    getUserOrders: async (req, res) => {
        try {
            const userId = req.user.id;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            const [orders] = await pool.execute(
                `SELECTo.*, c.id as cart_id, 
                COUNT(*) OVER() AS total_count
                 FROM orders o
                 JOIN carts c ON o.user_id = c.user_id
                 WHERE o.user_id = ?
                 ORDER BY o.created_at DESC
                 LIMIT ? OFFSET ?`,
                [userId, limit, offset]
            );

            const ordersWithDetails = await Promise.all(
                orders.map(async (order) => {
                    const [orderItems] = await pool.execute(
                        `SELECT ci.product_id, p.title, p.price, ci.quantity
                        (p.price * ci.quantity) AS subtotal
                         FROM cart_items ci
                         JOIN products p ON ci.product_id = p.id
                         WHERE ci.cart_id = ?`,
                        [order.cart_id]
                    );

                    return {
                        id: order.id,
                        total_amount: parseFloat(order.total_amount),
                        shipping_address: order.shipping_address,
                        status: order.status,
                        created_at: order.created_at,
                        items: orderItems.map(item => ({
                            product_id: item.product_id,
                            title: item.title,
                            price: parseFloat(item.price),
                            quantity: item.quantity,
                            subtotal: parseFloat(item.subtotal)
                        }))
                    };
                })
            );

                const total = orders.length > 0 ? orders[0].total_count : 0;
                const totalPages = Math.ceil(total / limit);

                res.json({
                    success: true,
                    data: {
                        orders: ordersWithDetails,
                        pagination: {
                            current: page,
                            total: totalPages,
                            limit,
                            totalItems: total,
                            hasNext: page < totalPages,
                            hasPrev: page > 1
                        }
                    }
                });
        } catch (error) {
            console.error('Error fetching user orders:', error);
            res.status(500).json({
                success: false,
                error: 'Error during fetching user orders'
            });
        }
    },

    getOrderById: async (req, res) => {
        try {
            const userId = req.user.id;
            const orderId = req.params.id;

            const [orders] = await pool.execute(
                `SELECT o.*, c.id as cart_id
                 FROM orders o
                 JOIN carts c ON o.user_id = c.user_id
                 WHERE o.id = ? AND o.user_id = ?`,
                [orderId, userId]
            );

            if (orders.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Order not found'
                });
            }

            const order = orders[0];

            const [orderItems] = await pool.execute(
                `SELECT ci.product_id, p.title, p.price, ci.quantity,
                (p.price * ci.quantity) AS subtotal
                    FROM cart_items ci
                    JOIN products p ON ci.product_id = p.id
                    WHERE ci.cart_id = ?`,
                [order.cart_id]
            );

            const orderDetails = {
                id: order.id,
                total_amount: parseFloat(order.total_amount),
                shipping_address: order.shipping_address,
                status: order.status,
                created_at: order.created_at,
                items: orderItems.map(item => ({
                    product_id: item.product_id,
                    title: item.title,
                    price: parseFloat(item.price),
                    quantity: item.quantity,
                    subtotal: parseFloat(item.subtotal)
                }))
            };

            res.json({
                success: true,
                data: { order: orderDetails }
            });
        } catch (error) {
            console.error('Error fetching order by ID:', error);
            res.status(500).json({
                success: false,
                error: 'Error fetching order by ID'
            });
        }
    }
};

module.exports = orderController;