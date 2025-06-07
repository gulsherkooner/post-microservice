const { DataTypes } = require("sequelize");
const sequelize = require("../config/db"); // adjust path as needed

const Comment = sequelize.define("Comment", {
  comment_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  post_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: "posts",
      key: "post_id",
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
  parent_comment_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: "comments",
      key: "comment_id",
    },
    onDelete: "CASCADE",
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  likes_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
  tableName: "comments",
});

module.exports = Comment;