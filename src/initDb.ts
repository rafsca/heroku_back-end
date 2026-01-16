import 'dotenv/config';
import { pool } from './db';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

async function runSqlFileIfExists() {
    const sqlPath = path.resolve(__dirname, '..', 'sql', 'schema.sql');
    if (!fs.existsSync(sqlPath)) return false;
    const raw = fs.readFileSync(sqlPath, 'utf8');

    // Remove /* */ comments and -- single-line comments
    const withoutBlock = raw.replace(/\/\*[\s\S]*?\*\//g, '\n');
    const lines = withoutBlock
        .split(/\r?\n/)
        .map(l => l.replace(/--.*$/, ''))
        .join('\n');

    // Split statements on semicolon followed by newline or EOF
    const statements = lines
        .split(/;\s*(?:\r?\n|$)/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    console.log(`Found ${statements.length} statements in ${sqlPath}`);
    for (const stmt of statements) {
        try {
            await pool.query(stmt);
        } catch (err) {
            console.error('Error executing statement (continuing):', err && (err as any).message);
        }
    }
    return true;
}

async function main() {
    // If sql/schema.sql exists, execute it first so manual edits are applied
    const executed = await runSqlFileIfExists();
    if (executed) console.log('Executed sql/schema.sql');

    // Continue with seed inserts (idempotent where possible)
    try {
        // detect if `stock` column exists on products (to be tolerant with pre-existing tables)
        const [cols]: any = await pool.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'stock' LIMIT 1`
        );
        const hasStock = (cols as any).length > 0;

        // sample products (use column list depending on schema)
        try {
            if (hasStock) {
                await pool.query('INSERT IGNORE INTO products (id, name, description, price, stock) VALUES (?, ?, ?, ?, ?)', [1, 'T-Shirt', 'Comfortable cotton t-shirt', 19.99, 100]);
                await pool.query('INSERT IGNORE INTO products (id, name, description, price, stock) VALUES (?, ?, ?, ?, ?)', [2, 'Mug', 'Ceramic mug', 9.99, 50]);
            } else {
                await pool.query('INSERT IGNORE INTO products (id, name, description, price) VALUES (?, ?, ?, ?)', [1, 'T-Shirt', 'Comfortable cotton t-shirt', 19.99]);
                await pool.query('INSERT IGNORE INTO products (id, name, description, price) VALUES (?, ?, ?, ?)', [2, 'Mug', 'Ceramic mug', 9.99]);
            }
        } catch (e) {
            console.error('Product seed error (continuing):', (e as any).message || e);
        }

        // create admin if not exists
        try {
            const [rows]: any = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', ['admin@example.com']);
            if ((rows as any).length === 0) {
                const hashed = await bcrypt.hash('adminpass', 10);
                await pool.query('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)', ['admin@example.com', hashed, 'Admin', 'ADMIN']);
                console.log('Created admin user: admin@example.com / adminpass');
            }
        } catch (e) {
            console.error('Admin seed error (continuing):', (e as any).message || e);
        }

        console.log('DB initialized');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main().catch(e => { console.error(e); process.exit(1); });
