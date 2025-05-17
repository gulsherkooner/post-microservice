const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('./src/config/cors');
const logger = require('./src/config/logger');
const postsRoutes = require('./src/routes/posts');
const bodyParser = require('body-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3004;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/post_service';

// Increase payload size limit to handle large video uploads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use(bodyParser.json({ limit: '100mb' })); // For JSON payloads
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true })); // For form data

app.use(cors);
app.use(express.json());
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

app.use('/posts', postsRoutes);

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    app.listen(PORT, () => console.log(`Post Service running on port ${PORT}`));
  })
  .catch(err => console.error('MongoDB connection error:', err));