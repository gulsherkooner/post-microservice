const express = require("express");
const { v4: uuidv4 } = require("uuid");
const PostLike = require("../models/postLike");
const Post = require("../models/post");
const logger = require("../config/logger");

const router = express.Router();

// Middleware to increase payload size limit
router.use(express.json({ limit: "10mb" }));

// Like a post
router.post("/:post_id/like", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const { post_id } = req.params;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Check if post exists and is active
    const post = await Post.findOne({ where: { post_id, is_active: true } });
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Check if already liked
    const existing = await PostLike.findOne({ where: { post_id, user_id: userId } });
    if (existing) {
      return res.status(409).json({ error: "Already liked" });
    }

    await PostLike.create({
      id: uuidv4(),
      post_id,
      user_id: userId,
      created_at: new Date(),
    });

    // Optionally increment likes_count in Post model
    await Post.increment("likes_count", { by: 1, where: { post_id } });

    res.status(201).json({ message: "Post liked" });
  } catch (error) {
    logger.error(`Error liking post: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Unlike a post
router.delete("/:post_id/like", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const { post_id } = req.params;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const like = await PostLike.findOne({ where: { post_id, user_id: userId } });
    if (!like) {
      return res.status(404).json({ error: "Like not found" });
    }
    await like.destroy();

    // Optionally decrement likes_count in Post model, but not below zero
    await Post.decrement("likes_count", {
      by: 1,
      where: { post_id, likes_count: { [require("sequelize").Op.gt]: 0 } },
    });

    res.json({ message: "Post unliked" });
  } catch (error) {
    logger.error(`Error unliking post: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get all likes for a user (if user_id matches x-user-id)
router.get("/user/:user_id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const { user_id } = req.params;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (userId !== user_id) {
    return res.status(403).json({ error: "Forbidden: Can only access your own likes" });
  }

  try {
    const likes = await PostLike.findAll({
      where: { user_id },
      attributes: ["post_id", "created_at"],
    });
    res.json({ likes });
  } catch (error) {
    logger.error(`Error retrieving likes for user ${user_id}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get like for a specific post and user (user from x-user-id)
router.get("/:post_id/like", async (req, res) => {
  const userId = req.headers["x-user-id"];
  const { post_id } = req.params;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const like = await PostLike.findOne({
      where: { post_id, user_id: userId },
      attributes: ["id", "post_id", "user_id", "created_at"],
    });
    if (!like) {
      return res.status(404).json({ liked: false });
    }
    res.json({ liked: true, like });
  } catch (error) {
    logger.error(`Error fetching like for post ${post_id} and user ${userId}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get all likes for a specific post (no user id required)
router.get("/:post_id/all", async (req, res) => {
  const { post_id } = req.params;
  try {
    const likes = await PostLike.findAll({
      where: { post_id },
      attributes: ["user_id", "created_at"],
    });
    res.json({ likes });
  } catch (error) {
    logger.error(`Error retrieving likes for post ${post_id}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;