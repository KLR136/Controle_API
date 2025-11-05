const pool = require('../config/database');

const cartController = {

    getCart: async (req, res) => {
        try {
            const userId = req.user.id;
            const [carts] = await pool.execute(
                `SELECT c.id as cart_id, ci.product_id, p.title, p.price, ci.quantity, p.stock_quantity, (p.price * ci.quantity) as subtotal
                 FROM carts c
                 JOIN cart_items ci ON c.id = ci.cart_id
                 JOIN products p ON ci.product_id = p.id
                 WHERE c.user_id = ? AND c.is_active = TRUE
                 ORDER BY ci.created_at DESC`,
                [userId]
            );

            const total = carts.reduce((sum, item) => sum + item.subtotal, 0);

            const totalItems = carts.reduce((sum, item) => sum + item.quantity, 0);

            res.json({
                success: true,
                data: {
                    cart_id: carts.length > 0 ? carts[0].cart_id : null,
                    items: carts.map(item => ({
                        product_id: item.product_id,
                        title: item.title,
                        price: parseFloat(item.price),
                        quantity: item.quantity,
                        subtotal: parseFloat(item.subtotal),
                        available: item.stock_quantity > item.quantity
                    })),
                    summary: {
                        total_items: totalItems,
                        total_price: total.toFixed(2)
                    }
                }
            });
        } catch (error) {
            console.error('Error fetching cart:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    },

    addToCart: async (req, res) => {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const userId = req.user.id;
            const { product_id, quantity } = req.body;

            if (!product_id || !quantity || quantity <= 0) {
                await connection.rollback();
                return res.status(400).json({
                     success: false, 
                     message: 'Invalid product ID or quantity' 
                    });
            }

            const [products] = await connection.execute(
                `SELECT idm title, price, stock_quantity
                FROM products
                WHERE id = ? AND is_acive = TRUE AND stock_quantity >= ?`,
                [product_id, quantity]
            );

            if (products.length === 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Product not available or insufficient stock'
                });
            }

            let cart_Id;
            if (carts.length === 0) {
                const [cartResult] = await connection.execute(
                    'INSERT INTO carts (user_id) VALUES (?)',
                    [userId]
                );
                cart_Id = cartResult.insertId;
            }
            else {
                cart_Id = carts[0].cart_id;
            }

            const [existingItems] = await connection.execute(
                'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
                [cart_Id, product_id]
            );

            let newQuantity = quantity;
            if (existingItems.length > 0) {
                newQuantity += existingItems[0].quantity;
                
                if (products[0].stock_quantity < newQuantity) {
                    await connection.rollback();
                    return res.status(400).json({
                        success: false,
                        error: 'Insufficient stock for the requested quantity'
                    });   
                }
                await connection.execute(
                    'UPDATE cart_items SET quantity = ? WHERE id = ?',
                    [newQuantity, existingItems[0].id]
                );
            }
            else {
                await connection.execute(
                    'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)',
                    [cart_Id, product_id, quantity]
                );
            }

            await connection.commit();

            res.status(201).json({
                success: true,
                message: 'Product added to cart successfully',
                data: { 
                    cart_id: cart_Id,
                    product_id,
                    quantity: newQuantity 
                }
            });
        } catch (error) {
            await connection.rollback();
            console.error('Error adding to cart:', error);
            res.status(500).json({
                success: false,
                message: 'Error during adding product to cart'
            });
        } finally {
            connection.release();
        }
    },

    updateCartItem: async (req, res) => {

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const userId = req.user.id;
            const productId = req.params.product_id
            const { quantity } = req.body;

            if (quantity == null || quantity < 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    error: 'Invalid quantity'
                });
            }

            const [products] = await connection.execute(
                'SELECT stock_quantity FROM products WHERE id = ? AND is_active = TRUE',
                [productId]
            );

            if (products.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    error: 'Product not found'
                });
            }

            if (products[0].stock_quantity < quantity) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    error: 'Insufficient stock'
                });
            }

            if (carts.lenght === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    error: 'Cart not found'
                });
            }

            const cartId = carts[0].cart_id;

            const [existingItems] = await connection.execute(
                'SELECT id FROM cart_items WHERE cart_id = ? AND product_id = ?',
                [cartId, productId]
            );

            if (existingItems.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    error: 'Cart item not found'
                });
            }

            await connection.execute(
                'UPDATE cart_items SET quantity = ? WHERE id = ? AND product_id = ?',
                [quantity, existingItems[0].id, productId]
            );

            await connection.commit();

            res.json({
                success: true,
                message: 'Cart item updated successfully',
                data: {
                    product_id: productId,
                    quantity
                }
            });
        } catch (error) {
            await connection.rollback();
            console.error('Error updating cart item:', error);
            res.status(500).json({
                success: false,
                message: 'Error during updating cart item'
            });
        } finally {
            connection.release();
        }
    },

    removeCartItem: async (req, res) => {
        try {
            const userId = req.user.id;
            const productId = req.params.product_id;

            const [carts] = await pool.execute(
                'SELECT id as cart_id FROM carts WHERE user_id = ? AND is_active = TRUE',
                [userId]
            );

            if (carts.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Cart not found'
                });
            }

            const cartId = carts[0].cart_id;

            const [result] = await pool.execute(
                'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?',
                [cartId, productId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Cart item not found'
                });
            }

            res.json({
                success: true,
                message: 'Cart item removed successfully',
                data: {
                    product_id: productId
                }
            });
        } catch (error) {
            console.error('Error removing cart item:', error);
            res.status(500).json({
                success: false,
                message: 'Error during removing cart item'
            });
        }
    },

    clearCart: async (req, res) => {
        try {
            const userId = req.user.id;

            const [carts] = await pool.execute(
                'SELECT id as cart_id FROM carts WHERE user_id = ? AND is_active = TRUE',
                [userId]
            );

            if (carts.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Cart not found'
                });
            }

            const cartId = carts[0].cart_id;

            await pool.execute(
                'DELETE FROM cart_items WHERE cart_id = ?',
                [cartId]
            );

            res.json({
                success: true,
                message: 'Cart cleared successfully'
            });
        } catch (error) {
            console.error('Error clearing cart:', error);
            res.status(500).json({
                success: false,
                message: 'Error during clearing cart'
            });
        }
    }
};

module.exports = cartController;