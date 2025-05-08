const cors = require('cors');
module.exports = cors({
  origin: '*', // Adjust based on your security requirements
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
});