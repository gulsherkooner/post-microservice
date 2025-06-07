const express = require("express");
const router = express.Router();
const Comment = require("../models/comment");
const CommentLike = require("../models/commentLike");
const sequelize = require("../config/db");

// Create a comment (top-level or reply)
router.post("/", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { post_id, text, parent_comment_id } = req.body;
  if (!post_id || !text) {
    return res.status(400).json({ error: "post_id and text are required" });
  }

  try {
    const comment = await Comment.create({
      post_id,
      user_id: userId,
      text,
      parent_comment_id: parent_comment_id || null,
    });
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: "Failed to create comment" });
  }
});

// Like a comment
router.post("/:comment_id/like", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { comment_id } = req.params;
  try {
    // Prevent duplicate likes
    const [like, created] = await CommentLike.findOrCreate({
      where: { comment_id, user_id: userId },
      defaults: { comment_id, user_id: userId },
    });
    if (!created) {
      return res.status(400).json({ error: "Already liked" });
    }
    // Increment likes_count
    await Comment.increment("likes_count", { by: 1, where: { comment_id } });
    res.json({ message: "Comment liked" });
  } catch (err) {
    res.status(500).json({ error: "Failed to like comment" });
  }
});

// Unlike a comment
router.delete("/:comment_id/like", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { comment_id } = req.params;
  try {
    const like = await CommentLike.findOne({ where: { comment_id, user_id: userId } });
    if (!like) {
      return res.status(404).json({ error: "Like not found" });
    }
    await like.destroy();
    // Decrement likes_count, but not below zero
    await Comment.decrement("likes_count", { by: 1, where: { comment_id, likes_count: { [require("sequelize").Op.gt]: 0 } } });
    res.json({ message: "Comment unliked" });
  } catch (err) {
    res.status(500).json({ error: "Failed to unlike comment" });
  }
});

// Delete a comment (soft delete)
router.delete("/:comment_id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { comment_id } = req.params;
  try {
    const comment = await Comment.findOne({ where: { comment_id } });
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    if (comment.user_id !== userId) return res.status(403).json({ error: "Forbidden" });

    comment.is_deleted = true;
    await comment.save();
    res.json({ message: "Comment deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

// Get all comments for a post (including user data from users table)
router.get("/post/:post_id", async (req, res) => {
  const { post_id } = req.params;
  try {
    const comments = await sequelize.query(
      `
      SELECT c.*, 
             u.user_id, u.username, u.profile_img_url
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.user_id
      WHERE c.post_id = :post_id AND c.is_deleted = false
      ORDER BY c.created_at ASC
      `,
      {
        replacements: { post_id },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// Get all likes for all comments in a post (not user-specific)
router.get("/post/:post_id/likes", async (req, res) => {
  const { post_id } = req.params;
  try {
    // Get all comment IDs for this post
    const comments = await Comment.findAll({
      where: { post_id },
      attributes: ["comment_id"],
    });
    const commentIds = comments.map((c) => c.comment_id);

    // Get all likes for these comments
    const likes = await CommentLike.findAll({
      where: {
        comment_id: commentIds,
      },
      attributes: ["comment_id", "user_id"],
    });

    // Build a map: { [comment_id]: [user_id, ...] }
    const likesMap = {};
    likes.forEach((like) => {
      if (!likesMap[like.comment_id]) likesMap[like.comment_id] = [];
      likesMap[like.comment_id].push(like.user_id);
    });

    res.json(likesMap);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch likes" });
  }
});

// Get all users who liked a specific comment
router.get("/:comment_id/likes", async (req, res) => {
  const { comment_id } = req.params;
  try {
    const likes = await CommentLike.findAll({
      where: { comment_id },
      attributes: ["user_id"],
    });
    res.json(likes.map((like) => like.user_id));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch comment likes" });
  }
});

module.exports = router;