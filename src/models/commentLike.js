const { DataTypes } = require("sequelize");
const sequelize = require("../config/db"); // adjust path as needed

const CommentLike = sequelize.define("CommentLike", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  comment_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "comments",
      key: "comment_id",
    },
    onDelete: "CASCADE",
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "users",
      key: "user_id",
    },
    onDelete: "CASCADE",
  },
}, {
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
  tableName: "comment_likes",
  indexes: [
    {
      unique: true,
      fields: ["comment_id", "user_id"], // Prevent duplicate likes
    },
  ],
});

module.exports = CommentLike;