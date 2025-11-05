app.get('/api/cart', authenticateToken, async (req, res) => {
    try {
        const [carts] = await pool.execute(
            'SELECT c.id as cart_id, ci.product_id, p.title, p.price, ci.quantity, (p.price * ci.quantity) as subtotal FROM carts c JOIN cart_items ci ON c.id = ci.cart_id JOIN products p ON ci.product_id = p.id WHERE c.user_id = ? AND c.is_active = TRUE',
            [req.user.id]
        );

        const total = carts.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);

        res.json({
            items: carts,
            total: total.toFixed(2),
        });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching cart' });
    }
});

app.post('/api/cart/items', authenticateToken, async (req, res) => {
    try {
        const { product_id, quantity } = req.body;

        if (!product_id || quantity <= 0) {
            return res.status(400).json({ error: 'Valid product and quantity are required' });
        }
    

    const [products] = await pool.execute(
        'SELECT stock_quantity FROM products WHERE id = ? AND is_active = TRUE',
        [product_id]
    );

    if (products.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
    }

    if (products[0].stock_quantity < quantity) {
        return res.status(400).json({ error: 'Insufficient stock quantity' });
    }

    let [carts] = await pool.execute(
        'SELECT id FROM carts WHERE user_id = ? AND is_active = TRUE',
        [req.user.id]
    );

    let cartId;
    if (carts.length === 0) {
        const [result] = await pool.execute(
            'INSERT INTO carts (user_id, is_active) VALUES (?)',
            [req.user.id, true]
        );
        cartId = result.insertId;
    } else {
        cartId = carts[0].id;
    }

    const [existingItems] = await pool.execute(
        'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
        [cartId, product_id]
    );

    if (existingItems.length > 0) {
        const newQuantity = existingItems[0].quantity + quantity;
        await pool.execute(
            'UPDATE cart_items SET quantity = ? WHERE id = ?',
            [newQuantity, existingItems[0].id]
        );
    } else {
        await pool.execute(
            'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)',
            [cartId, product_id, quantity]
        );
    }

    res.json({ message: 'Item added to cart successfully' });

    } catch (error) {
        res.status(500).json({ error: 'Error adding item to cart' });
    }
});

app.delete('/api/cart/items/:productId', authenticateToken, async (req, res) => {
    try {
        const { quantity } = req.body;
        const productId = req.params.productId;

        if (quantity !== undefined && quantity <= 0) {
            return res.status(400).json({ error: 'Quantity must be greater than zero' });
        }

    const [products] = await pool.execute(
        'SELECT stock_quantity FROM products WHERE id = ?',
        [productId]
    );

    if (products[0].stock_quantity < quantity) {
        return res.status(400).json({ error: 'Insufficient stock quantity' });
    }

    const [carts] = await pool.execute(
        'SELECT id FROM carts WHERE user_id = ? AND is_active = TRUE',
        [req.user.id]
    );

    if (carts.length === 0) {
        return res.status(404).json({ error: 'Cart not found' });
    }

    await pool.execute(
        'UPDATE cart_items SET quantity = quantity - ? WHERE cart_id = ? AND product_id = ?',
        [quantity, carts[0].id, productId]
    );

    res.json({ message : 'Item quantity updated in cart successfully' });
    } 
    catch (error) {
        res.status(500).json({ error: 'Error updating item in cart' });
    }
});

app.delete('/api/cart/items/:productId/remove', authenticateToken, async (req, res) => {
    try {
        const productId = req.params.productId;

        const [carts] = await pool.execute(
            'SELECT id FROM carts WHERE user_id = ? AND is_active = TRUE',
            [req.user.id]
        );

        if (carts.length === 0) {
            return res.status(404).json({ error: 'Cart not found' });
        }

        await pool.execute(
            'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?',
            [carts[0].id, productId]
        );

        res.json({ message: 'Item removed from cart successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error removing item from cart' });
    }
});

module.exports = app;