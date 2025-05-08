const mongoose = require('mongoose');

const postMediaSchema = new mongoose.Schema({
  post_id: { type: String, required: true },
  media_type: { type: String, required: true, enum: ['image', 'video'] },
  url: { type: String, required: true },
  thumbnail_url: { type: String },
  duration: { type: Number },
  width: { type: Number },
  height: { type: Number },
});

module.exports = mongoose.model('PostMedia', postMediaSchema);