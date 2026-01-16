import { query, pool } from './db';

const CATEGORIES = ['Electronics', 'Books', 'Clothing', 'Home', 'Toys', 'Sports', 'Computers'];
const ADJECTIVES = ['Amazing', 'Incredible', 'Standard', 'Modern', 'Classic', 'Vintage', 'Digital', 'Analog'];
const NOUNS = ['Widget', 'Gizmo', 'Device', 'Shirt', 'Book', 'Lamp', 'Table', 'Phone', 'Watch', 'Camera'];

async function seed() {
    console.log('Seeding 100 products (relational)...');

    try {
        // 1. Ensure categories exist
        console.log('Ensuring categories exist...');
        for (const catName of CATEGORIES) {
            await query('INSERT IGNORE INTO categories (name) VALUES (?)', [catName]);
        }

        // 2. Fetch category IDs
        const catRows: any = await query('SELECT id, name FROM categories');
        const catMap = new Map();
        catRows.forEach((r: any) => catMap.set(r.name, r.id));

        // 3. Insert products one by one logic (or bulk if we omit category column in products table)
        // Since 'category' column is missing from products table, we insert product, then link in product_categories.

        for (let i = 0; i < 100; i++) {
            const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
            const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
            const catName = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
            const catId = catMap.get(catName);

            const name = `${adj} ${noun} ${i + 1}`;
            const description = `This is a great description for ${name}. High quality item in ${catName}.`;
            const price = (Math.random() * 500 + 5).toFixed(2);
            const stock = Math.floor(Math.random() * 100) + 1;
            const image_url = `https://picsum.photos/seed/${i + 123}/300/200`;

            // Insert product
            // Note: we removed 'category' column from INSERT
            const res: any = await query(
                'INSERT INTO products (name, description, price, stock, image_url) VALUES (?, ?, ?, ?, ?)',
                [name, description, price, stock, image_url]
            );

            const productId = res.insertId;

            // Link to category
            if (productId && catId) {
                await query(
                    'INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)',
                    [productId, catId]
                );
            }
        }

        console.log('Successfully inserted 100 products with categories!');
    } catch (err) {
        console.error('Error seeding products:', err);
    } finally {
        await pool.end();
    }
}

seed();
