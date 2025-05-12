const cors = require('cors');

const corsOptions = {
  origin: ['https://api-gateway-eta-navy.vercel.app', 'http://localhost:3001', 'https://next-frontend-one-xi.vercel.app'],
  credentials: true, // Allow cookies (e.g., refreshToken)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['X-Requested-With, Content-Type, Authorization'],
  MAX_AGE: 86400,
};

module.exports = cors(corsOptions);