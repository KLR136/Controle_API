const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../config/database');

const router = express.Router();

router.post('/', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { shipping_address } = req.body;

        const [carts] = await connection.execute(
            `SELECT c.id, ci.product_id, ci.quantity, p.price, p.stock_quantity
             FROM carts c
             JOIN cart_items ci ON c.id = ci.cart_id
             JOIN products p ON ci.product_id = p.id
             WHERE c.user_id = ? AND c.is_active = TRUE`,
            [req.user.id]
        );

        if (carts.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Cart is empty' });
        }

        let totalAmount = 0;
        for (const item of carts) {
            if (item.stock_quantity < item.quantity) {
                await connection.rollback();
                return res.status(400).json({ error: `Insufficient stock for product ID ${item.product_id}` });
            }
            totalAmount += item.price * item.quantity;
        }

        for (const item of carts) {
            await connection.execute(
                'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
                [item.quantity, item.product_id]
            );
        }

        const cartId = carts[0].id;
        const [orderResult] = await connection.execute(
            'INSERT INTO orders (user_id, cart_id, shipping_address, total_amount) VALUES (?, ?, ?, ?)',
            [req.user.id, cartId, shipping_address, totalAmount]  // Corrigé : total → totalAmount
        );

        await connection.execute(
            'UPDATE carts SET is_active = FALSE WHERE id = ?',
            [cartId]
        );

        await connection.commit();

        res.status(201).json({
            message: 'Order placed successfully',
            order_id: orderResult.insertId,
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: 'Error placing order' });
    } finally {
        connection.release();
    }
});

router.get('/', authenticateToken, async (req, res) => {
    try {
        const [orders] = await pool.execute(
            `SELECT o.*, c.id as cart_id
             FROM orders o 
             JOIN carts c ON o.cart_id = c.id 
             WHERE c.user_id = ? 
             ORDER BY o.created_at DESC`,
            [req.user.id]
        );

        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching orders' });
    }
});

router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const orderId = req.params.id;
        
        const [orders] = await pool.execute(
            `SELECT o.*, c.id as cart_id, c.user_id
             FROM orders o 
             JOIN carts c ON o.cart_id = c.id 
             WHERE o.id = ? AND c.user_id = ?`,
            [orderId, req.user.id]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orders[0];

        // Récupérer les produits de la commande
        const [orderItems] = await pool.execute(
            `SELECT ci.product_id, p.title, p.price, ci.quantity,
                    (p.price * ci.quantity) as subtotal
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

        res.json({ order: orderDetails });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching order' });
    }
});

module.exports = router;