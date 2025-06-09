require("dotenv").config();
const sequelize = require("../config/db");
// const Post = require("../models/post");
// const PostMedia = require("../models/postMedia");
// const Comment = require("../models/comment");
// const CommentLike = require("../models/commentLike");
const postLike = require("../models/postLike");

async function initDb() {
  try {
    await sequelize.authenticate();
    console.log("Connected to PostgreSQL");
    await sequelize.sync({ force: true }); // Creates table, drops if exists
    console.log("Posts table created");
    process.exit(0);
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exit(1);
  }
}

initDb();
