const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config/env');

router.post('/solve', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }

    if (!config.deepseekApiKey) {
      return res.status(500).json({ success: false, message: 'DeepSeek API key is not configured' });
    }

    const messages = [
      {
        role: "user",
        content: `Pilihlah jawaban yang paling tepat dari soal berikut:\n\n${prompt}`
      }
    ];

    const fullMessages = [
      {
        role: "system",
        content: `Kamu adalah asisten ujian. Jawab HANYA dengan JSON valid yang berisi dua key: "jawaban" (berisi huruf opsi A, B, C, D, atau E) dan "penjelasan" (berisi penjelasan singkat 1-2 kalimat). Contoh: {"jawaban": "A", "penjelasan": "Karena..."}`
      },
      ...messages
    ];

    const requestPayload = {
      model: "deepseek-chat",
      messages: fullMessages,
      response_format: { type: "json_object" }
    };

    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', requestPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.deepseekApiKey}`
      }
    });

    const data = response.data;
    
    if (data.choices && data.choices.length > 0) {
        return res.json({
            success: true,
            data: data
        });
    } else {
        return res.status(500).json({ success: false, message: 'Invalid response from DeepSeek' });
    }

  } catch (error) {
    console.error('Quiz solve error:', error.response?.data || error.message);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error.response?.data || error.message
    });
  }
});

module.exports = router;
