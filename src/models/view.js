const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const View = sequelize.define(
  "View",
  {
    view_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "The user who viewed the post",
    },
    post_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "The post that was viewed",
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  },
  {
    tableName: "post_views",
    timestamps: false,
    indexes: [
      // Composite index for efficient querying
      {
        unique: true,
        fields: ["user_id", "post_id"],
        name: "unique_user_post_view",
      },
      // Index for finding views by post
      {
        fields: ["post_id"],
        name: "post_views_post_id_idx",
      },
      // Index for finding views by user
      {
        fields: ["user_id"],
        name: "post_views_user_id_idx",
      },
      // Index for time-based queries
      {
        fields: ["created_at"],
        name: "post_views_created_at_idx",
      },
    ],
  }
);

module.exports = View;
