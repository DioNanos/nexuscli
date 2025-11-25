const express = require('express');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

const router = express.Router();

/**
 * POST /api/v1/conversations/:conversationId/messages
 * Add message to conversation
 */
router.post('/:conversationId/messages', (req, res) => {
  try {
    const { conversationId } = req.params;
    const { role, content, metadata } = req.body;

    // Validate conversation exists
    const conversation = Conversation.getById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Validate input
    if (!role || !content) {
      return res.status(400).json({ error: 'Role and content are required' });
    }

    if (!['user', 'assistant', 'system'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Create message
    const message = Message.create(conversationId, role, content, metadata);

    res.status(201).json(message);
  } catch (error) {
    console.error('[Messages] Create error:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

/**
 * GET /api/v1/conversations/:conversationId/messages
 * Get messages for conversation
 */
router.get('/:conversationId/messages', (req, res) => {
  try {
    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const messages = Message.getByConversation(conversationId, limit, offset);

    res.json({ messages });
  } catch (error) {
    console.error('[Messages] List error:', error);
    res.status(500).json({ error: 'Failed to list messages' });
  }
});

module.exports = router;
