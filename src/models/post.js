const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  post_id: { type: String, required: true, unique: true },
  user_id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  url: [{ type: String }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  post_type: { type: String, required: true, enum: ['text', 'image', 'carousel', 'video'], required: true },
  is_reel: { type: Boolean, default: false },
  category: { type: String },
  post_tags: [{ type: String }],
  visibility: { type: String, default: 'public', enum: ['public', 'private', 'followers'] },
  likes_count: { type: Number, default: 0 },
  comments_count: { type: Number, default: 0 },
  views_count: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true }, 
});

module.exports = mongoose.model('Post', postSchema);