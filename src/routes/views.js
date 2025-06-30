const express = require("express");
const View = require("../models/view");
const Post = require("../models/post"); // Assuming you have a Post model
const logger = require("../config/logger");

const router = express.Router();

// Record a view for a post
router.post("/", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { post_id } = req.body;

  if (!post_id) {
    return res.status(400).json({ error: "Post ID is required" });
  }

  try {
    // Check if the post exists
    const post = await Post.findByPk(post_id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Record the view (prevents duplicates due to unique constraint)
    const [view, created] = await View.findOrCreate({
      where: {
        user_id: userId,
        post_id: post_id,
      },
      defaults: {
        user_id: userId,
        post_id: post_id,
      },
    });

    // If a new view was created, increment the post's view count
    if (created) {
      await Post.increment('views_count', {
        where: { post_id: post_id }
      });
      
      logger.info(`New view recorded for post ${post_id} by user ${userId}`);
    }

    // Get updated post view count
    const updatedPost = await Post.findByPk(post_id);
    
    res.status(created ? 201 : 200).json({
      view,
      created,
      total_views: updatedPost.views_count || 0,
      message: created ? "View recorded successfully" : "View already exists"
    });

  } catch (error) {
    logger.error(`Error recording view: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get views by post ID
router.get("/post/:post_id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { post_id } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const offset = (page - 1) * limit;

  try {
    // Check if the post exists
    const post = await Post.findByPk(post_id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Get views for the post
    const views = await View.findAll({
      where: { post_id },
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Get total count
    const totalViews = await View.count({
      where: { post_id }
    });

    // Fetch user details for each view (optional, can be heavy)
    const apiGatewayUrl = process.env.API_GATEWAY_URL || "http://localhost:3001";
    const viewsWithUserDetails = await Promise.all(
      views.map(async (view) => {
        try {
          const userRes = await fetch(`${apiGatewayUrl}/auth/user/${view.user_id}`, {
            headers: { "Content-Type": "application/json" },
          });
          
          if (userRes.ok) {
            const userData = await userRes.json();
            const userDetails = userData.user || userData;
            return {
              ...view.toJSON(),
              user: {
                user_id: userDetails.user_id,
                username: userDetails.username,
                profile_img_url: userDetails.profile_img_url,
              }
            };
          }
        } catch (fetchError) {
          logger.warn(`Failed to fetch user details for user ${view.user_id}: ${fetchError.message}`);
        }
        
        return {
          ...view.toJSON(),
          user: null
        };
      })
    );

    res.json({
      views: viewsWithUserDetails,
      pagination: {
        total: totalViews,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalViews / limit),
      }
    });

  } catch (error) {
    logger.error(`Error fetching views for post ${post_id}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get view count for a post (lightweight endpoint)
router.get("/post/:post_id/count", async (req, res) => {
  const { post_id } = req.params;

  try {
    // Check if the post exists
    const post = await Post.findByPk(post_id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const viewCount = await View.count({
      where: { post_id }
    });

    res.json({
      post_id,
      views_count: viewCount
    });

  } catch (error) {
    logger.error(`Error fetching view count for post ${post_id}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Check if current user has viewed a post
router.get("/post/:post_id/viewed", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { post_id } = req.params;

  try {
    const view = await View.findOne({
      where: {
        user_id: userId,
        post_id: post_id,
      },
    });

    res.json({
      post_id,
      user_id: userId,
      has_viewed: !!view,
      viewed_at: view ? view.created_at : null
    });

  } catch (error) {
    logger.error(`Error checking view status: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
