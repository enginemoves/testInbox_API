const { Ratelimit } = require('@upstash/ratelimit');
const redis = require('../db/redis');

// Redis-backed sliding window rate limiter — 100 requests per minute per IP
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'),
  analytics: true,
});

async function rateLimiter(req, res, next) {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const { success, limit, remaining, reset } = await ratelimit.limit(ip);

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', reset);

    if (!success) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many requests. Please slow down.',
      });
    }

    next();
  } catch (error) {
    // If Redis fails, let the request through
    console.error('Rate limiter error:', error.message);
    next();
  }
}

module.exports = rateLimiter;
