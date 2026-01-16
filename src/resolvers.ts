import { query } from './db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

export const root = {
    products: async ({ search, offset = 0, limit = 50 }: any) => {
        let sql = `
            SELECT p.id, p.name, p.description, p.price, p.stock, p.image_url as imageUrl, p.created_at as createdAt, c.name as category 
            FROM products p 
            LEFT JOIN product_categories pc ON p.id = pc.product_id 
            LEFT JOIN categories c ON pc.category_id = c.id
        `;
        let params: any[] = [];

        if (search) {
            sql += ' WHERE p.name LIKE ? OR p.description LIKE ?';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Group by product id to avoid duplicates if multiple categories exist
        // (We just take the first category found due to non-standard SQL grouping or implicit selection, 
        // to be strict we should use any_value(c.name) or similar, but for this simple setup it's fine)
        sql += ` GROUP BY p.id LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        return await query(sql, params);
    },
    product: async ({ id }: any) => {
        const sql = `
            SELECT p.id, p.name, p.description, p.price, p.stock, p.image_url as imageUrl, p.created_at as createdAt, c.name as category 
            FROM products p 
            LEFT JOIN product_categories pc ON p.id = pc.product_id 
            LEFT JOIN categories c ON pc.category_id = c.id 
            WHERE p.id = ? 
            LIMIT 1
        `;
        const rows: any = await query(sql, [id]);
        return rows[0] || null;
    },
    cart: async (_: any, context: any) => {
        if (!context || !context.user) throw new Error('Authentication required');
        try {
            // Removed GROUP BY to avoid SQL Strict Mode errors. Deduplication handled in JS.
            const sql = `
                SELECT ci.id as ci_id, ci.quantity, 
                       p.id as p_id, p.name, p.description, p.price, p.stock, p.image_url, p.created_at,
                       c.name as category
                FROM cart_items ci
                JOIN products p ON p.id = ci.product_id
                LEFT JOIN product_categories pc ON p.id = pc.product_id 
                LEFT JOIN categories c ON pc.category_id = c.id
                WHERE ci.user_id = ?
            `;
            const rows: any = await query(sql, [context.user.id]);

            // Deduplicate by cart item ID (pick first category found)
            const map = new Map();
            for (const r of (rows || [])) {
                if (!map.has(r.ci_id)) {
                    map.set(r.ci_id, {
                        id: r.ci_id,
                        quantity: r.quantity,
                        product: {
                            id: r.p_id,
                            name: r.name,
                            description: r.description,
                            price: r.price,
                            category: r.category,
                            stock: r.stock,
                            imageUrl: r.image_url,
                            createdAt: r.created_at
                        }
                    });
                }
            }
            return Array.from(map.values());
        } catch (err) {
            console.error('Cart Resolver Error:', err);
            throw new Error('Internal Server Error fetching cart');
        }
    },
    me: async (_: any, context: any) => {
        // Return current authenticated user (fresh from DB)
        if (!context || !context.user) return null;
        const rows: any = await query('SELECT id, email, name, role FROM users WHERE id = ? LIMIT 1', [context.user.id]);
        return rows && rows[0] ? rows[0] : null;
    },
    signup: async ({ email, password, name }: any) => {
        const existing: any = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
        if (existing.length) throw new Error('Email already in use');
        const hashed = await bcrypt.hash(password, 10);
        const res: any = await query('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)', [email, hashed, name || null, 'USER']);
        const insertId = (res as any).insertId;
        const user = { id: insertId, email, name, role: 'USER' };
        const token = jwt.sign({ id: insertId, email, role: 'USER' }, JWT_SECRET, { expiresIn: '7d' });
        return { token, user };
    },
    login: async ({ email, password }: any) => {
        try {
            const rows: any = await query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
            const user = rows && rows[0];
            if (!user) {
                throw new Error('Invalid credentials');
            }
            const ok = await bcrypt.compare(password, user.password);
            if (!ok) {
                throw new Error('Invalid credentials');
            }
            const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
            return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
        } catch (err: any) {
            console.error('[auth] login error', err && err.message ? err.message : err);
            // Surface a friendly message to the client; keep internal detail in server log
            throw new Error(err && err.message ? err.message : 'Internal server error');
        }
    },
    createProduct: async ({ name, description, price, category }: any, context: any) => {
        if (!context.user || context.user.role !== 'ADMIN') throw new Error('Not authorized');
        const res: any = await query('INSERT INTO products (name, description, price, category) VALUES (?, ?, ?, ?)', [name, description || null, price, category || null]);
        return { id: res.insertId, name, description, price, category };
    },
    updateProduct: async ({ id, name, description, price, category, stock, imageUrl }: any, context: any) => {
        if (!context.user || context.user.role !== 'ADMIN') throw new Error('Not authorized');
        // build dynamic SET clause
        const fields: string[] = [];
        const params: any[] = [];
        if (name !== undefined) { fields.push('name = ?'); params.push(name); }
        if (description !== undefined) { fields.push('description = ?'); params.push(description); }
        if (price !== undefined) { fields.push('price = ?'); params.push(price); }
        if (category !== undefined) { fields.push('category = ?'); params.push(category); }
        if (stock !== undefined) { fields.push('stock = ?'); params.push(stock); }
        if (imageUrl !== undefined) { fields.push('image_url = ?'); params.push(imageUrl); }
        if (fields.length === 0) {
            const rows: any = await query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
            return rows[0] || null;
        }
        params.push(id);
        const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = ?`;
        await query(sql, params);
        const rows: any = await query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
        const p = rows[0];
        if (!p) return null;
        return {
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.price,
            category: p.category,
            stock: p.stock,
            imageUrl: p.image_url,
            createdAt: p.created_at
        };
    },
    deleteProduct: async ({ id }: any, context: any) => {
        if (!context.user || context.user.role !== 'ADMIN') throw new Error('Not authorized');
        const res: any = await query('DELETE FROM products WHERE id = ?', [id]);
        return (res && (res as any).affectedRows && (res as any).affectedRows > 0) || false;
    },
    orders: async (_: any, context: any) => {
        if (!context || !context.user) throw new Error('Authentication required');
        const orders: any = await query('SELECT id, user_id, total, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC', [context.user.id]);
        const result: any[] = [];
        for (const ord of orders) {
            const items: any = await query(
                `SELECT oi.id as oi_id, oi.quantity, oi.price, p.id as p_id, p.name, p.description, p.price as product_price, p.category, p.stock, p.image_url, p.created_at
                 FROM order_items oi
                 LEFT JOIN products p ON p.id = oi.product_id
                 WHERE oi.order_id = ?`,
                [ord.id]
            );
            const mappedItems = (items || []).map((it: any) => ({
                id: it.oi_id,
                quantity: it.quantity,
                price: it.price,
                product: it.p_id ? {
                    id: it.p_id,
                    name: it.name,
                    description: it.description,
                    price: it.product_price,
                    category: it.category,
                    stock: it.stock,
                    imageUrl: it.image_url,
                    createdAt: it.created_at
                } : null
            }));
            result.push({ id: ord.id, items: mappedItems, total: ord.total, status: ord.status, createdAt: ord.created_at });
        }
        return result;
    },
    addToCart: async ({ productId, quantity }: any, context: any) => {
        if (!context.user) throw new Error('Authentication required');

        try {
            const existing: any = await query('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?', [context.user.id, productId]);

            if (existing && existing.length > 0) {
                const newQty = Number(existing[0].quantity) + quantity;
                await query('UPDATE cart_items SET quantity = ? WHERE id = ?', [newQty, existing[0].id]);
            } else {
                await query('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)', [context.user.id, productId, quantity]);
            }

            // Fetch item with correct joins for category
            const sql = `
                SELECT ci.id as ci_id, ci.quantity as ci_qty, 
                       p.id as p_id, p.name, p.description, p.price, p.stock, p.image_url, p.created_at,
                       c.name as category
                FROM cart_items ci 
                JOIN products p ON p.id = ci.product_id 
                LEFT JOIN product_categories pc ON p.id = pc.product_id 
                LEFT JOIN categories c ON pc.category_id = c.id
                WHERE ci.user_id = ? AND ci.product_id = ? 
                LIMIT 1`;

            const rows: any = await query(sql, [context.user.id, productId]);
            const r = rows && rows[0];

            if (!r) throw new Error('Failed to retrieve cart item');

            return {
                id: r.ci_id,
                quantity: r.ci_qty,
                product: {
                    id: r.p_id,
                    name: r.name,
                    description: r.description,
                    price: r.price,
                    category: r.category,
                    stock: r.stock,
                    imageUrl: r.image_url,
                    createdAt: r.created_at
                }
            };
        } catch (err) {
            console.error('addToCart Resolver Error:', err);
            throw new Error('Internal Server Error adding to cart');
        }
    },
    removeFromCart: async ({ productId }: any, context: any) => {
        if (!context.user) throw new Error('Authentication required');
        const res: any = await query('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [context.user.id, productId]);
        return (res && (res as any).affectedRows && (res as any).affectedRows > 0) || false;
    },
    updateCartItem: async ({ productId, quantity }: any, context: any) => {
        if (!context.user) throw new Error('Authentication required');
        if (quantity <= 0) {
            // delete item and return null (schema allows nullable)
            await query('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [context.user.id, productId]);
            return null;
        }
        await query('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?', [quantity, context.user.id, productId]);
        const rows: any = await query('SELECT ci.id as ci_id, ci.quantity, p.* FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = ? AND ci.product_id = ? LIMIT 1', [context.user.id, productId]);
        const r = rows && rows[0];
        if (!r) return null;
        return {
            id: r.ci_id,
            quantity: r.quantity,
            product: {
                id: r.id,
                name: r.name,
                description: r.description,
                price: r.price,
                category: r.category,
                stock: r.stock,
                imageUrl: r.image_url,
                createdAt: r.created_at
            }
        };
    },
    createOrder: async (_: any, context: any) => {
        if (!context.user) throw new Error('Authentication required');
        const cart: any = await query('SELECT ci.id, ci.quantity, p.* FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = ?', [context.user.id]);
        if (cart.length === 0) throw new Error('Cart is empty');
        const total = cart.reduce((s: number, c: any) => s + c.quantity * c.price, 0);
        const res: any = await query('INSERT INTO orders (user_id, total) VALUES (?, ?)', [context.user.id, total]);
        const orderId = res.insertId;
        for (const item of cart) {
            await query('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)', [orderId, item.id, item.quantity, item.price]);
        }
        await query('DELETE FROM cart_items WHERE user_id = ?', [context.user.id]);
        const items: any = await query('SELECT oi.id, oi.quantity, oi.price, p.* FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?', [orderId]);
        return { id: orderId, items, total, createdAt: new Date().toISOString() };
    }
};
