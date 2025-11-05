const pool = require('../config/database');

class Cart {
    // Récupérer le panier actif d'un utilisateur
    static async getActiveCart(userId) {
        try {
            const [carts] = await pool.execute(
                'SELECT * FROM carts WHERE user_id = ? AND is_active = TRUE',
                [userId]
            );
            return carts.length > 0 ? carts[0] : null;
        } catch (error) {
            throw error;
        }
    }

    // Créer un nouveau panier
    static async create(userId) {
        try {
            const [result] = await pool.execute(
                'INSERT INTO carts (user_id) VALUES (?)',
                [userId]
            );
            return { id: result.insertId, user_id: userId, is_active: true };
        } catch (error) {
            throw error;
        }
    }

    // Récupérer ou créer un panier actif
    static async getOrCreateActiveCart(userId) {
        let cart = await this.getActiveCart(userId);
        if (!cart) {
            cart = await this.create(userId);
        }
        return cart;
    }

    // Récupérer les éléments du panier
    static async getCartItems(cartId) {
        try {
            const [items] = await pool.execute(
                `SELECT ci.*, p.title, p.price, p.stock_quantity,
                        (p.price * ci.quantity) as subtotal
                 FROM cart_items ci
                 JOIN products p ON ci.product_id = p.id
                 WHERE ci.cart_id = ?
                 ORDER BY ci.created_at DESC`,
                [cartId]
            );

            return items.map(item => ({
                id: item.id,
                product_id: item.product_id,
                title: item.title,
                price: parseFloat(item.price),
                quantity: item.quantity,
                stock_quantity: item.stock_quantity,
                subtotal: parseFloat(item.subtotal),
                available: item.stock_quantity >= item.quantity,
                created_at: item.created_at,
                updated_at: item.updated_at
            }));
        } catch (error) {
            throw error;
        }
    }

    // Ajouter un produit au panier
    static async addItem(cartId, productId, quantity) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Vérifier si le produit est déjà dans le panier
            const [existingItems] = await connection.execute(
                'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
                [cartId, productId]
            );

            let result;
            if (existingItems.length > 0) {
                // Mettre à jour la quantité
                const newQuantity = existingItems[0].quantity + quantity;
                [result] = await connection.execute(
                    'UPDATE cart_items SET quantity = ?, updated_at = NOW() WHERE id = ?',
                    [newQuantity, existingItems[0].id]
                );
            } else {
                // Ajouter un nouvel élément
                [result] = await connection.execute(
                    'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)',
                    [cartId, productId, quantity]
                );
            }

            await connection.commit();
            return result.affectedRows > 0;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Mettre à jour la quantité d'un produit dans le panier
    static async updateItemQuantity(cartId, productId, quantity) {
        try {
            const [result] = await pool.execute(
                'UPDATE cart_items SET quantity = ?, updated_at = NOW() WHERE cart_id = ? AND product_id = ?',
                [quantity, cartId, productId]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    // Supprimer un produit du panier
    static async removeItem(cartId, productId) {
        try {
            const [result] = await pool.execute(
                'DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?',
                [cartId, productId]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    // Vider le panier
    static async clearCart(cartId) {
        try {
            const [result] = await pool.execute(
                'DELETE FROM cart_items WHERE cart_id = ?',
                [cartId]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    // Désactiver le panier (après commande)
    static async deactivateCart(cartId) {
        try {
            const [result] = await pool.execute(
                'UPDATE carts SET is_active = FALSE WHERE id = ?',
                [cartId]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    // Calculer le total du panier
    static async calculateTotal(cartId) {
        try {
            const [result] = await pool.execute(
                `SELECT SUM(p.price * ci.quantity) as total
                 FROM cart_items ci
                 JOIN products p ON ci.product_id = p.id
                 WHERE ci.cart_id = ?`,
                [cartId]
            );

            return result[0].total ? parseFloat(result[0].total) : 0;
        } catch (error) {
            throw error;
        }
    }

    // Vérifier la disponibilité de tous les produits du panier
    static async checkStockAvailability(cartId) {
        try {
            const items = await this.getCartItems(cartId);
            const stockErrors = [];

            for (const item of items) {
                if (!item.available) {
                    stockErrors.push({
                        product_id: item.product_id,
                        title: item.title,
                        requested: item.quantity,
                        available: item.stock_quantity
                    });
                }
            }

            return {
                allAvailable: stockErrors.length === 0,
                stockErrors
            };
        } catch (error) {
            throw error;
        }
    }

    // Récupérer le panier complet avec les éléments
    static async getCartWithItems(userId) {
        try {
            const cart = await this.getOrCreateActiveCart(userId);
            if (!cart) return null;

            const items = await this.getCartItems(cart.id);
            const total = await this.calculateTotal(cart.id);
            const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

            return {
                cart: {
                    id: cart.id,
                    user_id: cart.user_id,
                    is_active: cart.is_active,
                    created_at: cart.created_at
                },
                items,
                summary: {
                    total_items: totalItems,
                    total_amount: total
                }
            };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = Cart;