const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Story = require("../models/story");
const logger = require("../config/logger");
const UploadToDropbox = require("../config/dropbox.js");
const getDbxToken = require("../utils/getDbxToken.js");

const router = express.Router();

// Middleware to increase payload size limit
router.use(express.json({ limit: "100mb" }));
router.use(express.urlencoded({ limit: "100mb", extended: true }));

// Create a new story
router.post("/", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { video } = req.body; // video: { media_name, media_content (base64) }

  if (!video || !video.media_name || !video.media_content) {
    return res.status(400).json({ error: "Video file is required" });
  }

  try {
    // Upload to Dropbox
    const dbxAccessToken = await getDbxToken();
    if (!dbxAccessToken) {
      logger.error("Failed to get Dropbox access token");
      return res.status(500).json({ error: "Failed to get Dropbox access token" });
    }

    const video_url = await UploadToDropbox(
      video.media_content,
      video.media_name,
      dbxAccessToken,
      res
    );
    if (!video_url) {
      throw new Error("Failed to upload video to Dropbox");
    }

    const story = await Story.create({
      story_id: uuidv4(),
      user_id: userId,
      video_url, 
      viewed_by: [],
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    res.status(201).json({ story });
  } catch (error) {
    logger.error(`Error creating story: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Update a story (e.g., mark as viewed or update video)
router.put("/:story_id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { story_id } = req.params;
  const { video, mark_viewed } = req.body;

  try {
    const story = await Story.findOne({ where: { story_id, active: true } });
    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }

    // Mark as viewed
    if (mark_viewed) {
      if (!story.viewed_by.includes(userId)) {
        story.viewed_by = [...story.viewed_by, userId];
        story.updated_at = new Date();
        await story.save();
      }
      return res.json({ story });
    }

    // Update video (optional)
    if (video && video.media_name && video.media_content) {
      const dbxAccessToken = await getDbxToken();
      if (!dbxAccessToken) {
        logger.error("Failed to get Dropbox access token");
        return res.status(500).json({ error: "Failed to get Dropbox access token" });
      }
      const video_url = await UploadToDropbox(
        video.media_content,
        video.media_name,
        dbxAccessToken,
        res
      );
      if (!video_url) {
        throw new Error("Failed to upload video to Dropbox");
      }
      story.video_url = video_url;
      story.updated_at = new Date();
      await story.save();
      return res.json({ story });
    }

    res.status(400).json({ error: "No valid update parameters provided" });
  } catch (error) {
    logger.error(`Error updating story: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get stories for a specific user_id (requires x-user-id header)
router.get("/feed/:user_id", async (req, res) => {
  const xUserId = req.headers["x-user-id"];
  const { user_id } = req.params;

  if (!xUserId) {
    return res.status(401).json({ error: "Unauthorized: x-user-id header missing" });
  }

  try {
    const stories = await Story.findAll({
      where: { user_id, active: true },
      order: [["created_at", "DESC"]],
    });

    const apiGatewayUrl = process.env.API_GATEWAY_URL || "http://localhost:3001";
    const userRes = await fetch(`${apiGatewayUrl}/auth/user/${user_id}`, {
      headers: { "Content-Type": "application/json" },
    });

    if (!userRes.ok) {
      logger.error(`Failed to fetch user: ${userRes.status}`);
      return res.status(404).json({ error: "User not found", stories });
    }

    const userData = await userRes.json();
    const userDetails = userData.user || userData;

    // Attach user details to each story
    const storiesWithUser = stories.map(story => ({
      ...story.toJSON(),
      user: userDetails,
    }));

    res.json({
      stories: storiesWithUser,
    });
  } catch (error) {
    logger.error(`Error fetching stories feed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;