const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Post = require("../models/post");
const PostMedia = require("../models/postMedia");
const logger = require("../config/logger");
const { Dropbox } = require("dropbox");
const getDbxToken = require("../utils/getDbxToken.js");
const UploadToDropbox = require("../config/dropbox.js");
const sequelize = require("../config/db.js");
const { Op } = require("sequelize");

const router = express.Router();

// New route for search suggestions
router.get("/suggestions", async (req, res) => {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const {
      q: searchString,
      post_type,
      limit = 5,
    } = req.query;

    // Check if query is empty
    if (!searchString || searchString.trim() === "") {
      return res.json({ suggestions: [] });
    }

    const limitNum = parseInt(limit, 10) || 5;
    const apiGatewayUrl = process.env.API_GATEWAY_URL || "http://localhost:3001";

    // Handle user suggestions
    if (post_type === "users") {
      try {
        const searchUrl = `${apiGatewayUrl}/auth/search/users?q=${encodeURIComponent(searchString)}&page=1&limit=${limitNum}`;
        
        const userSearchResponse = await fetch(searchUrl);
        
        if (userSearchResponse.ok) {
          const userSearchData = await userSearchResponse.json();
          const userSuggestions = (userSearchData.users || []).map(user => ({
            user_id: user.user_id,
            username: user.username,
            name: user.name,
            profile_img_url: user.profile_img_url,
            is_verified: user.is_verified,
            type: 'user'
          }));
          
          return res.json({ suggestions: userSuggestions });
        } else {
          const errorData = await userSearchResponse.json();
        }
      } catch (error) {
        logger.error(`Error getting user suggestions: ${error.message}`);
      }
      return res.json({ suggestions: [] });
    }

    // Handle post suggestions (images, videos, reels)
    const baseWhereClause = {
      is_active: true,
      visibility: "public",
      [Op.or]: [
        { title: { [Op.iLike]: `%${searchString}%` } },
        { description: { [Op.iLike]: `%${searchString}%` } },
      ],
    };

    // Add post_type filter
    if (post_type === "reels") {
      baseWhereClause.is_reel = true;
      baseWhereClause.post_type = "video";
    } else if (post_type === "videos") {
      baseWhereClause.post_type = "video";
      baseWhereClause.is_reel = false;
    } else if (post_type === "posts") {
      baseWhereClause.post_type = "image";
    }

    const posts = await Post.findAll({
      where: baseWhereClause,
      order: [['created_at', 'DESC']],
      limit: limitNum,
      attributes: ['post_id', 'title', 'description', 'post_type', 'is_reel', 'user_id']
    });

    // Get user data for posts
    const postsWithUserData = await Promise.all(
      posts.map(async (post) => {
        try {
          const userResponse = await fetch(`${apiGatewayUrl}/auth/user/${post.user_id}`);
          const userData = await userResponse.json();
          return {
            post_id: post.post_id,
            title: post.title,
            description: post.description,
            post_type: post.post_type,
            is_reel: post.is_reel,
            user: userData.user ? {
              username: userData.user.username,
              profile_img_url: userData.user.profile_img_url
            } : null,
            type: 'post'
          };
        } catch (error) {
          return {
            post_id: post.post_id,
            title: post.title,
            description: post.description,
            post_type: post.post_type,
            is_reel: post.is_reel,
            user: null,
            type: 'post'
          };
        }
      })
    );

    res.json({ suggestions: postsWithUserData });
  } catch (error) {
    logger.error(`Error getting suggestions: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

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

    // Validate post_type if provided - ADD "users" to valid types
    const validPostTypes = ["image", "video", "reel", "users"];
    if (post_type && !validPostTypes.includes(post_type)) {
      return res.status(400).json({
        error: "Invalid post_type. Must be one of: image, video, reel, users",
      });
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const apiGatewayUrl =
      process.env.API_GATEWAY_URL || "http://localhost:3001";

    // Handle user search separately
    if (post_type === "users") {
      try {
        const userSearchResponse = await fetch(
          `${apiGatewayUrl}/auth/search/users?q=${encodeURIComponent(searchString)}&page=${pageNum}&limit=${limitNum}`
        );
        
        if (userSearchResponse.ok) {
          const userSearchData = await userSearchResponse.json();
          return res.json({
            users: userSearchData.users || [],
            search_query: searchString,
            post_type: "users",
            page: pageNum,
            limit: limitNum,
            total: userSearchData.total || 0,
            totalPages: userSearchData.totalPages || 0,
            is_search: true,
            content_type: "users"
          });
        } else {
          // Fallback: return empty users array if auth service doesn't have user search
          return res.json({
            users: [],
            search_query: searchString,
            post_type: "users",
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 0,
            is_search: true,
            content_type: "users",
            message: "User search not available"
          });
        }
      } catch (error) {
        logger.error(`Error searching users: ${error.message}`);
        return res.json({
          users: [],
          search_query: searchString,
          post_type: "users",
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0,
          is_search: true,
          content_type: "users",
          error: "User search failed"
        });
      }
    }

    // Rest of your existing code for posts/videos/reels search...
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

    // Add post_type filter if specified (for posts, not users)
    if (post_type && post_type !== "users") {
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
    
    // Calculate limits for followed users (20%) and public posts (80%)
    const followedUsersLimit = Math.ceil(limitNum * 0.2); // 20% for followed users
    const publicPostsLimit = limitNum - followedUsersLimit; // 80% for public posts

    let allPosts = [];

    // Get posts from followed users (20% of the limit)
    if (followingUserIds.length > 0 && followedUsersLimit > 0) {
      const followedUsersWhereClause = {
        ...baseWhereClause,
        user_id: { [Op.in]: followingUserIds },
      };

      const followedUsersPosts = await Post.findAll({
        where: followedUsersWhereClause,
        order: [[sequelize.literal(`md5('${seed}' || post_id::text)`), "ASC"]],
        limit: followedUsersLimit,
        offset: Math.floor(offset * 0.2), // Proportional offset for followed users
      });

      allPosts = followedUsersPosts;
    }

    // Get public posts from non-followed users (80% of the limit)
    if (publicPostsLimit > 0) {
      const publicPostsWhereClause = {
        ...baseWhereClause,
        user_id: {
          [Op.notIn]:
            followingUserIds.length > 0
              ? [...followingUserIds, userId] // Exclude followed users and self
              : [userId], // Only exclude self if no following list
        },
      };

      const publicPosts = await Post.findAll({
        where: publicPostsWhereClause,
        order: [[sequelize.literal(`md5('${seed}' || post_id::text)`), "ASC"]],
        limit: publicPostsLimit,
        offset: Math.floor(offset * 0.8), // Proportional offset for public posts
      });

      allPosts = allPosts.concat(publicPosts);
    }

    // If we still don't have enough posts, fill with any remaining public posts
    const remainingLimit = limitNum - allPosts.length;
    if (remainingLimit > 0) {
      const anyPublicWhereClause = {
        ...baseWhereClause,
        user_id: { [Op.ne]: userId }, // Exclude only self
      };

      const anyPublicPosts = await Post.findAll({
        where: anyPublicWhereClause,
        order: [[sequelize.literal(`md5('${seed}' || post_id::text)`), "ASC"]],
        limit: remainingLimit,
        offset: offset + allPosts.length,
      });

      allPosts = allPosts.concat(anyPublicPosts);
    }

    // Shuffle the combined results to mix followed and public posts
    const shuffleArray = (array, seedString) => {
      const arr = [...array];
      // Create a simple hash from seed for consistent shuffling
      let hash = 0;
      for (let i = 0; i < seedString.length; i++) {
        const char = seedString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      // Use the hash to create a pseudo-random shuffle
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.abs(hash + i) % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    // Shuffle posts while maintaining the seed for consistency
    const shuffledPosts = shuffleArray(allPosts, seed + pageNum.toString());

    // Fetch user data for all posts
    const postsWithUserData = await Promise.all(
      shuffledPosts.map(async (post) => {
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

    // Calculate statistics for the response
    const followedPostsCount = postsWithUserData.filter(post => post.is_from_followed_user).length;
    const publicPostsCount = postsWithUserData.length - followedPostsCount;

    const responseMessage = isSearchOperation
      ? `Search "${searchString}" returned ${postsWithUserData.length} posts (${followedPostsCount} from followed users, ${publicPostsCount} public)`
      : `Retrieved ${postsWithUserData.length} posts (${followedPostsCount} from followed users, ${publicPostsCount} public)`;

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
      followed_posts_count: followedPostsCount,
      public_posts_count: publicPostsCount,
      content_ratio: {
        followed_percentage: postsWithUserData.length > 0 ? Math.round((followedPostsCount / postsWithUserData.length) * 100) : 0,
        public_percentage: postsWithUserData.length > 0 ? Math.round((publicPostsCount / postsWithUserData.length) * 100) : 0,
      },
      is_search: isSearchOperation,
      debug_info: {
        where_clause: baseWhereClause,
        user_id: userId,
        is_search_operation: isSearchOperation,
        following_user_ids: followingUserIds,
      }
    });
  } catch (error) {
    logger.error(`Error searching posts: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Add a debug route to check database contents
router.get("/debug", async (req, res) => {
  const userId = req.headers["x-user-id"];

  try {
    const allPosts = await Post.count();
    const activePosts = await Post.count({ where: { is_active: true } });
    const publicPosts = await Post.count({ where: { is_active: true, visibility: "public" } });
    const otherUsersPublicPosts = await Post.count({ 
      where: { 
        is_active: true, 
        visibility: "public",
        user_id: { [Op.ne]: userId }
      } 
    });

    // Get sample posts
    const samplePosts = await Post.findAll({
      limit: 5,
      attributes: ['post_id', 'user_id', 'is_active', 'visibility', 'post_type', 'title']
    });

    res.json({
      total_posts: allPosts,
      active_posts: activePosts,
      public_posts: publicPosts,
      other_users_public_posts: otherUsersPublicPosts,
      current_user_id: userId,
      sample_posts: samplePosts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
