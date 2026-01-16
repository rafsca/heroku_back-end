import { Request, Response, NextFunction } from 'express';
import { query } from '../db';
import bcrypt from 'bcryptjs';

/**
 * Basic / Bearer auth middleware for /graphql
 * - If Authorization missing -> 401 with WWW-Authenticate
 * - If Bearer token present -> pass through (JWT handled elsewhere)
 * - If Basic present -> decode and validate against DB users OR static credentials
 */
export default async function basicAuth(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers['authorization'];
    // If no Authorization header is provided, allow the request through.
    // This allows public GraphQL operations (eg. signup/login, public product queries)
    // to be executed without Basic auth. When Authorization is present we validate it.
    if (!auth || typeof auth !== 'string') {
        return next();
    }

    if (auth.startsWith('Bearer ')) {
        // allow Bearer tokens through (JWT will be validated by getUserFromReq in context)
        return next();
    }

    if (!auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="GraphQL"');
        return res.status(401).json({ error: 'Unsupported authorization scheme' });
    }

    const b64 = auth.slice(6).trim();
    let decoded = '';
    try {
        decoded = Buffer.from(b64, 'base64').toString('utf8');
    } catch (err) {
        res.setHeader('WWW-Authenticate', 'Basic realm="GraphQL"');
        return res.status(401).json({ error: 'Invalid Basic token' });
    }

    const idx = decoded.indexOf(':');
    if (idx < 0) {
        res.setHeader('WWW-Authenticate', 'Basic realm="GraphQL"');
        return res.status(401).json({ error: 'Invalid Basic credentials format' });
    }

    const username = decoded.slice(0, idx);
    const password = decoded.slice(idx + 1);

    // Static fallback credentials from env (convenience for demos)
    const staticUser = process.env.BASIC_AUTH_STATIC_USER;
    const staticPass = process.env.BASIC_AUTH_STATIC_PASS;
    if (staticUser && staticPass) {
        if (username === staticUser && password === staticPass) {
            // attach a lightweight user object for use in context
            (req as any).basicUser = { id: 0, email: username, role: 'ADMIN' };
            return next();
        }
        res.setHeader('WWW-Authenticate', 'Basic realm="GraphQL"');
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Otherwise validate against users table (email=username)
    try {
        const rows: any = await query('SELECT id, email, password, name, role FROM users WHERE email = ? LIMIT 1', [username]);
        const user = rows && rows[0];
        if (!user) {
            res.setHeader('WWW-Authenticate', 'Basic realm="GraphQL"');
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
            res.setHeader('WWW-Authenticate', 'Basic realm="GraphQL"');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // success: attach basicUser for downstream use
        (req as any).basicUser = { id: user.id, email: user.email, name: user.name, role: user.role };
        return next();
    } catch (err) {
        console.error('[basicAuth] error validating credentials', err);
        res.setHeader('WWW-Authenticate', 'Basic realm="GraphQL"');
        return res.status(401).json({ error: 'Invalid credentials' });
    }
}
