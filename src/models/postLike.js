const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const PostLike = sequelize.define(
  "PostLike",
  {
    id: {
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
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "post_likes",
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ["post_id", "user_id"],
      },
    ],
  }
);

module.exports = PostLike;