import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export const auth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        console.warn('[Auth] No token provided');
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.error(`[Auth] Token verification failed: ${err.name}`);
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ msg: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

export default auth;
