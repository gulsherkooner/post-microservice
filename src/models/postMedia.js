const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const PostMedia = sequelize.define(
  "PostMedia",
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
    },
    media_type: {
      type: DataTypes.ENUM("image", "video"),
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING(2048),
      allowNull: false,
    },
    thumbnail_url: {
      type: DataTypes.STRING(2048),
      allowNull: true,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "post_media",
    timestamps: false,
  }
);

module.exports = PostMedia;
