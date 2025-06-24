const { DataTypes, Op } = require("sequelize");
const sequelize = require("../config/db");

const Story = sequelize.define(
  "Story",
  {
    story_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    video_url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    viewed_by: {
      type: DataTypes.ARRAY(DataTypes.UUID), // Array of user UUIDs
      allowNull: false,
      defaultValue: [],
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "stories",
    timestamps: false,
  }
);

Story.prototype.isActive = function () {
  if (!this.active) return false;
  const now = new Date();
  const created = new Date(this.created_at);
  return now - created < 24 * 60 * 60 * 1000;
};

// Add a new class method to deactivate expired stories
Story.deactivateExpiredStories = async function () {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return await this.update(
    { active: false },
    {
      where: {
        created_at: {
          [Op.lt]: twentyFourHoursAgo,
        },
        active: true,
      },
    }
  );
};

module.exports = Story;