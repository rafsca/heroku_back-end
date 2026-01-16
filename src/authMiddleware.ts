import { Request } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

export function getUserFromReq(req: Request) {
    const auth = req.headers['authorization'] || '';
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        try {
            const data = jwt.verify(token, JWT_SECRET) as any;
            return data;
        } catch (err) {
            return null;
        }
    }
    return null;
}
