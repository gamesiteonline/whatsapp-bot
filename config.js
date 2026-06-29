const featuresConfig = require('./config/features.json');
const path = require('path');

module.exports = {
  dbPath: process.env.DB_PATH || './database/whatsapp.db',
  prefix: process.env.PREFIX || '!',
  ownerNumber: process.env.OWNER_NUMBER || '',
  botName: process.env.BOT_NAME || 'WhatsApp Bot',
  encryptionSecret: process.env.ENCRYPTION_SECRET || 'change-this-secret-in-production',
  features: featuresConfig.features,
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
  }
};
