const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const cors = require("./src/config/cors");
const logger = require("./src/config/logger");
const postsRoutes = require("./src/routes/posts");
const bodyParser = require("body-parser");
const sequelize = require("./src/config/db");
const commentsRoutes = require("./src/routes/comments");
const postsLikesRoutes = require("./src/routes/postLikes"); // Import postLikes routes


const app = express();
const PORT = process.env.PORT || 3004;

// Increase payload size limit to handle large video uploads
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(bodyParser.json({ limit: "100mb" }));
app.use(bodyParser.urlencoded({ limit: "100mb", extended: true }));

app.use(cors);
app.use(express.json());
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// Connect to PostgreSQL
sequelize
  .authenticate()
  .then(() => {
    logger.info("Connected to PostgreSQL");
  })
  .catch((error) => {
    logger.error("Error connecting to PostgreSQL:", error.message);
    process.exit(1);
  });

app.use("/posts", postsRoutes);
app.use("/comments", commentsRoutes);
app.use("/postLikes", postsLikesRoutes); // Use postLikes routes

app.listen(PORT, () => {
  logger.info(`Post service running on port ${PORT}`);
});
