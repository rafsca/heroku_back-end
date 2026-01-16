// Ensure environment variables from .env are loaded before creating the pool
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

// create a pool using the connection URI
export const pool = mysql.createPool({
    uri: DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    }
} as any);

export async function query(sql: string, params: any[] = []) {
    const [rows] = await pool.query(sql, params as any);
    return rows;
}
