const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Post = require("../models/post");
const PostMedia = require("../models/postMedia");
const logger = require("../config/logger");
const { Dropbox } = require("dropbox");
const getDbxToken = require("../utils/getDbxToken.js");
const UploadToDropbox = require("../config/dropbox.js");

const router = express.Router();

// Middleware to increase payload size limit
router.use(express.json({ limit: "100mb" }));
router.use(express.urlencoded({ limit: "1000mb", extended: true }));

// Create a new post
router.post("/", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const {
    title,
    description,
    post_type,
    media = [],
    category,
    post_tags,
    visibility,
    is_reel
  } = req.body;

  // Validate media based on post_type
  if (post_type === "text" && media.length > 0) {
    return res.status(400).json({ error: "Text posts should not have media" });
  }
  if (
    post_type === "image" &&
    (media.length !== 1 || media[0].media_type !== "image")
  ) {
    return res
      .status(400)
      .json({ error: "Image posts should have exactly one image media" });
  }
  if (
    post_type === "carousel" &&
    (media.length < 2 || media.some((m) => m.media_type !== "image"))
  ) {
    return res
      .status(400)
      .json({ error: "Carousel posts should have at least two image media" });
  }
  if (
    post_type === "video" &&
    (media.length > 1 ||
      media[0].media_type !== "video" ||
      !media[0].media_content)
  ) {
    return res.status(400).json({
      error: "Video posts should have exactly one video media with media_content",
    });
  }

  try {
    // Upload to Dropbox
    const dbxAccessToken = await getDbxToken();
    if (!dbxAccessToken) {
      logger.error("Failed to get Dropbox access token");
      return res
        .status(500)
        .json({ error: "Failed to get Dropbox access token" });
    }

    const postId = uuidv4();
    const media_array = [];

    // Create the post first
    const post = await Post.create({
      post_id: postId,
      user_id: userId,
      title,
      description,
      url: [], // Will update with media_array later if media exists
      post_type,
      category,
      post_tags,
      visibility: visibility || 'public',
      is_reel,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Create media entries
    if (media.length > 0) {
      const mediaPromises = media.map(async (m) => {
        if (m.media_type === "video" || m.media_type === "image") {
          const fileName = m.media_name;
          const fileContent = m.media_content;
          const media_url = await UploadToDropbox(
            fileContent,
            fileName,
            dbxAccessToken,
            res
          );
          if (!media_url) {
            throw new Error(`Failed to upload media ${fileName} to Dropbox`);
          }
          // Create PostMedia record
          await PostMedia.create({
            id: uuidv4(),
            post_id: postId,
            media_type: m.media_type,
            url: media_url,
            thumbnail_url: m.thumbnail_url || null,
            duration: m.duration || null,
            width: m.width || null,
            height: m.height || null,
          });
          return media_url;
        }
        return null;
      });

      const uploadedUrls = await Promise.all(mediaPromises);
      media_array.push(...uploadedUrls.filter((url) => url !== null));

      // Update post with media URLs
      if (media_array.length > 0) {
        await post.update({ url: media_array });
      }
    }

    res.status(201).json({ post });
  } catch (error) {
    logger.error(`Error creating post: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve a post
router.get("/post/:post_id", async (req, res) => {
  const userId = req.headers["x-user-id"] || null;
  const { post_id } = req.params;

  try {
    const post = await Post.findOne({ where: { post_id, is_active: true } });
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Check visibility
    if (post.visibility === "private" && (!userId || userId !== post.user_id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.json({ post });
  } catch (error) {
    logger.error(`Error retrieving post: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Update a post
router.put("/:post_id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { post_id } = req.params;
  const { title, description, category, post_tags, visibility, media } =
    req.body;

  try {
    const post = await Post.findOne({ where: { post_id, is_active: true } });
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    if (post.user_id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Prepare update data
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (post_tags !== undefined) updateData.post_tags = post_tags;
    if (visibility !== undefined) updateData.visibility = visibility;
    updateData.updated_at = new Date();

    // If media is provided, update media URLs
    if (media !== undefined) {
      // Validate media based on post_type
      if (post.post_type === "text" && media.length > 0) {
        return res.status(400).json({ error: "Text posts should not have media" });
      }
      if (
        post.post_type === "image" &&
        (media.length !== 1 || media[0].media_type !== "image")
      ) {
        return res
          .status(400)
          .json({ error: "Image posts should have exactly one image media" });
      }
      if (post.post_type === "carousel" && (media.length < 2 || media.some((m) => m.media_type !== "image"))
      ) {
        return res.status(400).json({
          error: "Carousel posts should have at least two image media"
        });
      }
      if (
        post.post_type === "video" &&
        (media.length > 1 ||
          media[0].media_type !== "video" ||
          !media[0].media_content)
      ) {
        return res.status(400).json({
          error:
            "Video posts should have exactly one video media with media_content",
        });
      }

      // Upload to Dropbox
      const dbxAccessToken = await getDbxToken();
      if (!dbxAccessToken) {
        logger.error("Failed to get Dropbox access token");
        return res
          .status(500)
          .json({ error: "Failed to get Dropbox access token" });
      }

      const media_array = [];
      if (media.length > 0) {
        const mediaPromises = media.map(async (m) => {
          let media_url = '';
          if (m.media_type === "video" || m.media_type === "image") {
            const fileName = m.media_name;
            const fileContent = m.media_content;
            media_url = await UploadToDropbox(
              fileContent,
              fileName,
              dbxAccessToken,
              res
            );
            if (!media_url) {
              throw new Error(`Failed to upload media ${fileName} to Dropbox`);
            }
            return media_url;
          }
          return null;
        });

        const uploadedUrls = await Promise.all(mediaPromises);
        media_array.push(...uploadedUrls.filter((url) => url !== null));
      }

      updateData.url = media_array;
      if (post.post_type === "video" && media.length === 1) {
        updateData.is_reel = media[0].height > media[0].width || false;
      }
    }

    // Update post
    await post.update(updateData);
    res.json({ post });
  } catch (error) {
    logger.error(`Error updating post: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Delete a post (soft delete)
router.delete("/:post_id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { post_id } = req.params;

  try {
    const post = await Post.findOne({ where: { post_id, is_active: true } });
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    if (post.user_id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await post.update({ is_active: false });
    res.status(204).send();
  } catch (error) {
    logger.error(`Error deleting post: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve user's posts
router.get("/user/:user_id", async (req, res) => {
  const authenticatedUserId = req.headers["x-user-id"];
  const { user_id } = req.params;

  if (!authenticatedUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (authenticatedUserId !== user_id) {
    return res
      .status(403)
      .json({ error: "Forbidden: You can only access your own posts" });
  }

  try {
    const posts = await Post.findAll({ where: { user_id, is_active: true } });
    res.json({ posts });
  } catch (error) {
    logger.error(
      `Error retrieving posts for user ${user_id}: ${error.message}`
    );
    res.status(500).json({ error: error.message });
  }
});

// Retrieve all public posts
router.get("/", async (req, res) => {
  try {
    const posts = await Post.findAll({ where: { is_active: true, visibility: "public" } });
    const postsWithUsernames = await Promise.all(
      posts.map(async (post) => {
        try {
          const userResponse = await fetch(
            `${process.env.API_GATEWAY_URL}/auth/user/${post.user_id}`
          );
          const userData = await userResponse.json();
          if (!userResponse.ok) {
            throw new Error(userData.error || "Failed to fetch user data");
          }
          return {
            ...post.toJSON(),
            user:
              {
                username: userData.user.username,
                profile_img_url: userData.user.profile_img_url,
              } || null,
          };
        } catch (error) {
          logger.error(
            `Error retrieving user data for post ${post.post_id}: ${error.message}`
          );
          return {
            ...post.toJSON(),
            user: null,
          };
        }
      })
    );
    res.json({ posts: postsWithUsernames });
  } catch (error) {
    logger.error(`Error retrieving posts: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve user's public posts
router.get("/user/public/:user_id", async (req, res) => {
  const { user_id } = req.params;

  try {
    const posts = await Post.findAll({
      where: { user_id, is_active: true, visibility: "public" },
    });
    res.json({ posts });
  } catch (error) {
    logger.error(
      `Error retrieving posts for user ${user_id}: ${error.message}`
    );
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;