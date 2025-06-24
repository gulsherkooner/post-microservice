const cron = require('node-cron');
const { Op } = require('sequelize');
const Story = require('../models/story');
const logger = require('../config/logger');  // If you have a logger setup

// Run every hour to deactivate old stories
const scheduleStoryDeactivation = () => {
  cron.schedule('0 * * * *', async () => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const result = await Story.update(
        { active: false },
        {
          where: {
            created_at: {
              [Op.lt]: twentyFourHoursAgo
            },
            active: true
          }
        }
      );

      logger.info(`Deactivated ${result[0]} stories older than 24 hours`);
    } catch (error) {
      logger.error('Error deactivating old stories:', error);
    }
  });
};

module.exports = {
  scheduleStoryDeactivation
};