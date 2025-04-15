require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const multer = require('multer'); // Import multer
const { analyzeImagesWithOpenAI } = require('./openaiService'); // Import the new service
const { generateRecommendations } = require('./recommendationService'); // Import the new recommendation service
const { handleChatInteraction } = require('./chatService'); // Import the new chat service

const app = express();
const port = process.env.PORT || 3001; // Use PORT from env or default to 3001

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Middleware to parse JSON bodies

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Key not provided in .env file");
  process.exit(1); // Exit if Supabase credentials are missing
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configure Multer for memory storage (stores files as Buffers in RAM)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // Optional: Limit file size (e.g., 10MB)
});

// Endpoint to get 5 random destinations
app.get('/api/destinations/random', async (req, res) => {
  try {
    // Call a Supabase database function to get random destinations
    const { data, error } = await supabase.rpc('get_random_destinations', { limit_count: 10 });

    if (error) {
      console.error('Error fetching random destinations:', error);
      return res.status(500).json({ error: 'Failed to fetch random destinations', details: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'No destinations found.' });
    }

    // Return the destination data
    res.json(data);

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// New endpoint to receive images for preference analysis
app.post('/api/preferences/analyze-images', upload.array('images', 3), async (req, res) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No image files uploaded.' });
    }

    console.log(`Received ${files.length} images for analysis.`);

    const analysisResult = await analyzeImagesWithOpenAI(files);

    console.log("OpenAI Analysis Result:", analysisResult);

    res.status(200).json({
      message: `Successfully received and analyzed ${files.length} images.`,
      analysis: analysisResult
    });

  } catch (err) {
    console.error('Error analyzing images:', err);
    // Handle specific multer errors if needed
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    }
    res.status(500).json({ error: 'Internal server error during image analysis' });
  }
});

// New Endpoint to refine preferences with ChatBot
app.post('/api/preferences/chat', async (req, res) => {
  try {
    const { messages, preferences } = req.body;

    // Validate input
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Chat messages array is missing or empty.' });
    }
    // Preferences are optional after the first message, but needed if messages length is 1
    if (messages.length === 1 && (!preferences || typeof preferences !== 'object')) {
      return res.status(400).json({ error: 'Initial user preferences object is required for the first message.' });
    }

    // Call the chat service
    // Pass preferences only if it's potentially the first message
    const assistantMessage = await handleChatInteraction(messages, messages.length === 1 ? preferences : null);

    // Send back the assistant's response
    res.status(200).json({ response: assistantMessage });

  } catch (err) {
    console.error('Error during chat interaction:', err);
    res.status(500).json({ error: `Internal server error during chat interaction: ${err.message}` });
  }
});

// New endpoint to create recommendations based on user preferences
app.post('/api/recommendations', async (req, res) => {
  try {
    const userPreferences = req.body; // Assumes preferences are sent in JSON body

    // Basic validation: Check if preferences object is provided
    if (!userPreferences || typeof userPreferences !== 'object' || Object.keys(userPreferences).length === 0) {
      return res.status(400).json({ error: 'User preferences object is missing or empty in request body.' });
    }

    // Call the recommendation service
    const result = await generateRecommendations(userPreferences);

    // Send back the result (currently includes placeholder recommendations)
    res.status(200).json(result);

  } catch (err) {
    console.error('Error generating recommendations:', err);
    // Consider more specific error handling based on potential errors from the service
    res.status(500).json({ error: 'Internal server error during recommendation generation' });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});