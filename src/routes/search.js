const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Post = require("../models/post");
const PostMedia = require("../models/postMedia");
const logger = require("../config/logger");
const { Dropbox } = require("dropbox");
const getDbxToken = require("../utils/getDbxToken.js");
const UploadToDropbox = require("../config/dropbox.js");
const sequelize = require("../config/db.js");
const { Op } = require("sequelize"); // Add this line

const router = express.Router();

// Search posts route
router.get("/search", async (req, res) => {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const {
      q: searchString,
      post_type,
      page = 1,
      limit = 20,
      seed = "defaultseed",
    } = req.query;

    // Check if query is empty or not provided
    if (!searchString || searchString.trim() === "") {
      return res.status(400).json({ error: "Search query is required. Use '~' to fetch all posts." });
    }

    // Validate post_type if provided
    const validPostTypes = ["image", "video", "reel"];
    if (post_type && !validPostTypes.includes(post_type)) {
      return res.status(400).json({
        error: "Invalid post_type. Must be one of: image, video, reel",
      });
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const apiGatewayUrl =
      process.env.API_GATEWAY_URL || "http://localhost:3001";

    // Get user's following list
    let followingUserIds = [];
    try {
      const followingResponse = await fetch(
        `${apiGatewayUrl}/social/following/${userId}`
      );
      if (followingResponse.ok) {
        const followingData = await followingResponse.json();
        followingUserIds =
          followingData.following?.map((f) => f.target_userid) || [];
      }
    } catch (error) {
      logger.warn(`Error fetching following list: ${error.message}`);
    }

    // Build base where clause
    const baseWhereClause = {
      is_active: true,
      visibility: "public",
    };

    // Determine if this is a search operation or fetch all operation
    const isSearchOperation = searchString.trim() !== "~";

    // Only add search filters if searchString is not "~"
    if (isSearchOperation) {
      baseWhereClause[Op.or] = [
        { title: { [Op.iLike]: `%${searchString}%` } },
        { description: { [Op.iLike]: `%${searchString}%` } },
        // Handle JSON tags properly
        sequelize.where(
          sequelize.cast(sequelize.col('post_tags'), 'TEXT'),
          { [Op.iLike]: `%${searchString}%` }
        ),
      ];
    }

    // Add post_type filter if specified
    if (post_type) {
      if (post_type === "reel") {
        baseWhereClause.is_reel = true;
        baseWhereClause.post_type = "video";
      } else {
        baseWhereClause.post_type = post_type;
        if (post_type === "video") {
          baseWhereClause.is_reel = false;
        }
      }
    }

    // Count total matching posts
    const total = await Post.count({ where: baseWhereClause });

    let allPosts = [];

    // First, get posts from followed users
    if (followingUserIds.length > 0) {
      const followedUsersWhereClause = {
        ...baseWhereClause,
        user_id: { [Op.in]: followingUserIds },
      };

      const followedUsersPosts = await Post.findAll({
        where: followedUsersWhereClause,
        order: [[sequelize.literal(`md5('${seed}' || post_id)`), "ASC"]],
        limit: limitNum,
        offset: offset,
      });

      allPosts = followedUsersPosts;
    }

    // If we need more posts, get from other users
    const remainingLimit = limitNum - allPosts.length;
    if (remainingLimit > 0) {
      const otherUsersWhereClause = {
        ...baseWhereClause,
        user_id: {
          [Op.notIn]:
            followingUserIds.length > 0
              ? [...followingUserIds, userId]
              : [userId],
        },
      };

      const otherUsersPosts = await Post.findAll({
        where: otherUsersWhereClause,
        order: [[sequelize.literal(`md5('${seed}' || post_id)`), "ASC"]],
        limit: remainingLimit,
        offset:
          allPosts.length > 0 ? Math.max(0, offset - allPosts.length) : offset,
      });

      allPosts = allPosts.concat(otherUsersPosts);
    }

    // Fetch user data for all posts
    const postsWithUserData = await Promise.all(
      allPosts.map(async (post) => {
        try {
          const userResponse = await fetch(
            `${apiGatewayUrl}/auth/user/${post.user_id}`
          );
          const userData = await userResponse.json();
          if (!userResponse.ok || !userData.user) {
            throw new Error(userData.error || "Failed to fetch user data");
          }
          return {
            ...post.toJSON(),
            user: {
              username: userData.user.username,
              profile_img_url: userData.user.profile_img_url,
            },
            is_from_followed_user: followingUserIds.includes(post.user_id),
          };
        } catch (error) {
          logger.error(
            `Error retrieving user data for post ${post.post_id}: ${error.message}`
          );
          return {
            ...post.toJSON(),
            user: null,
            is_from_followed_user: followingUserIds.includes(post.user_id),
          };
        }
      })
    );

    const responseMessage = isSearchOperation
      ? `Search "${searchString}" returned ${postsWithUserData.length} posts`
      : `Retrieved ${postsWithUserData.length} public posts`;

    logger.info(responseMessage);

    res.json({
      posts: postsWithUserData,
      search_query: isSearchOperation ? searchString : "",
      post_type: post_type || "all",
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      followed_users_count: followingUserIds.length,
      is_search: isSearchOperation,
    });
  } catch (error) {
    logger.error(`Error searching posts: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
