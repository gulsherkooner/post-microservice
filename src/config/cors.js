const cors = require('cors');

module.exports = cors({
  origin: [
    "https://api-gateway-sooty-nine.vercel.app",
    "http://localhost:3001",
    "https://api-gateway-sooty-nine.vercel.app"
  ], // Array of allowed origins
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'], // Allowed headers
});
