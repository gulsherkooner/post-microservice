const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Post = require('../models/post');
const PostMedia = require('../models/postMedia');
const logger = require('../config/logger');
const { Dropbox } = require('dropbox');
const getDbxToken = require('../utils/getDbxToken.js');
const UploadToDropbox = require('../config/dropbox.js');

const router = express.Router();

// Middleware to increase payload size limit
router.use(express.json({ limit: '50mb' }));
router.use(express.urlencoded({ limit: '50mb', extended: true }));

// Create a new post
router.post('/', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { title, description, post_type, media = [], category, post_tags, visibility } = req.body;

  // Validate media based on post_type
  if (post_type === 'text' && media.length > 0) {
    return res.status(400).json({ error: 'Text posts should not have media' });
  }
  if (post_type === 'image' && (media.length !== 1 || media[0].media_type !== 'image')) {
    return res.status(400).json({ error: 'Image posts should have exactly one image media' });
  }
  if (post_type === 'carousel' && (media.length < 2 || media.some(m => m.media_type !== 'image'))) {
    return res.status(400).json({ error: 'Carousel posts should have at least two image media' });
  }
  if (post_type === 'video' && (media.length > 1 || media[0].media_type !== 'video' || !media[0].media_content)) {
    return res.status(400).json({ error: 'Video posts should have exactly one video media with media_content' });
  }

  try {
    // Upload to Dropbox
    const dbxAccessToken = await getDbxToken();
    if (!dbxAccessToken) {
      logger.error('Failed to get Dropbox access token');
      return res.status(500).json({ error: 'Failed to get Dropbox access token' });
    }

    const postId = uuidv4();
    const media_array = [];

    if (media.length > 0) {
      const mediaPromises = media.map(async (m, i) => {
        let media_url = null;
        if (m.media_type === 'video' || m.media_type === 'image') {
          const fileName = m.media_name;
          const fileContent = m.media_content;
          media_url = await UploadToDropbox(fileContent, fileName, dbxAccessToken, res);
          if (!media_url) {
            throw new Error(`Failed to upload media ${fileName} to Dropbox`);
          }
          const mediaDoc = new PostMedia({
            post_id: postId,
            media_type: m.media_type,
            url: media_url,
          });
          await mediaDoc.save();
          logger.info(`Saved media document: ${mediaDoc}`);
          return media_url;
        }
        return null;
      });

      const uploadedUrls = await Promise.all(mediaPromises);
      media_array.push(...uploadedUrls.filter(url => url !== null));
    }

    console.log("media_array:", media_array);

    // Create a new post
    const post = new Post({
      post_id: postId,
      user_id: userId,
      title,
      url: media_array,
      description,
      post_type,
      category,
      post_tags,
      visibility: visibility || 'public',
      is_reel: post_type === 'video' && media.length === 1 && (media[0].height > media[0].width || false),
    });

    const savedPost = await post.save();

    res.status(201).json({ post: savedPost });
  } catch (error) {
    logger.error(`Error creating post: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve a post
router.get('/:post_id', async (req, res) => {
  const userId = req.headers['x-user-id'] || null;
  const { post_id } = req.params;

  try {
    const post = await Post.findOne({ post_id, is_active: true });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check visibility
    if (post.visibility === 'private' && (!userId || userId !== post.user_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ post });
  } catch (error) {
    logger.error(`Error retrieving post: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Update a post
router.put('/:post_id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { post_id } = req.params;
  const { title, description, category, post_tags, visibility, media } = req.body;

  try {
    const post = await Post.findOne({ post_id, is_active: true });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (post.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Update post fields
    post.title = title !== undefined ? title : post.title;
    post.description = description !== undefined ? description : post.description;
    post.category = category !== undefined ? category : post.category;
    post.post_tags = post_tags !== undefined ? post_tags : post.post_tags;
    post.visibility = visibility !== undefined ? visibility : post.visibility;
    post.updated_at = Date.now();

    // If media is provided, replace existing media
    if (media !== undefined) {
      // Validate media based on post_type
      if (post.post_type === 'text' && media.length > 0) {
        return res.status(400).json({ error: 'Text posts should not have media' });
      }
      if (post.post_type === 'image' && (media.length !== 1 || media[0].media_type !== 'image')) {
        return res.status(400).json({ error: 'Image posts should have exactly one image media' });
      }
      if (post.post_type === 'carousel' && (media.length < 2 || media.some(m => m.media_type !== 'image'))) {
        return res.status(400).json({ error: 'Carousel posts should have at least two image media' });
      }
      if (post.post_type === 'video' && (media.length > 1 || media[0].media_type !== 'video' || !media[0].media_content)) {
        return res.status(400).json({ error: 'Video posts should have exactly one video media with media_content' });
      }

      // Upload to Dropbox
      const dbxAccessToken = await getDbxToken();
      if (!dbxAccessToken) {
        logger.error('Failed to get Dropbox access token');
        return res.status(500).json({ error: 'Failed to get Dropbox access token' });
      }

      const media_array = [];
      await PostMedia.deleteMany({ post_id });

      if (media.length > 0) {
        const mediaPromises = media.map(async (m, i) => {
          let media_url = null;
          if (m.media_type === 'video' || m.media_type === 'image') {
            const fileName = m.media_name;
            const fileContent = m.media_content;
            media_url = await UploadToDropbox(fileContent, fileName, dbxAccessToken, res);
            if (!media_url) {
              throw new Error(`Failed to upload media ${fileName} to Dropbox`);
            }
            const mediaDoc = new PostMedia({
              post_id,
              media_type: m.media_type,
              url: media_url,
              order: i,
            });
            await mediaDoc.save();
            logger.info(`Saved updated media document: ${mediaDoc}`);
            return media_url;
          }
          return null;
        });

        const uploadedUrls = await Promise.all(mediaPromises);
        media_array.push(...uploadedUrls.filter(url => url !== null));
      }

      post.url = media_array;
      if (post.post_type === 'video' && media.length === 1) {
        post.is_reel = media[0].height > media[0].width || false;
      }
    }

    const updatedPost = await post.save();
    res.json({ post: updatedPost });
  } catch (error) {
    logger.error(`Error updating post: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Delete a post (soft delete)
router.delete('/:post_id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { post_id } = req.params;

  try {
    const post = await Post.findOne({ post_id, is_active: true });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (post.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    post.is_active = false;
    await post.save();
    res.status(204).send();
  } catch (error) {
    logger.error(`Error deleting post: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve all public posts
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find({ is_active: true, visibility: 'public' });
    res.json({ posts });
  } catch (error) {
    logger.error(`Error retrieving posts: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

router.get('/user/:user_id', async (req, res) => {
  const authenticatedUserId = req.headers['x-user-id'];
  const { user_id } = req.params;

  if (!authenticatedUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (authenticatedUserId !== user_id) {
    return res.status(403).json({ error: 'Forbidden: You can only access your own posts' });
  }

  try {
    const posts = await Post.find({ user_id, is_active: true });
    res.json({ posts });
  } catch (error) {
    logger.error(`Error retrieving posts for user ${user_id}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;