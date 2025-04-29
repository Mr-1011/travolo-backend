require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const multer = require('multer'); // Import multer
const { analyzeImagesWithOpenAI } = require('./openaiService'); // Import the new service
const { generateRecommendations } = require('./services/recommendationService'); // Import the new recommendation service
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
    const preferencesString = req.body.preferences; // Get the stringified preferences

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No image files uploaded.' });
    }

    if (!preferencesString) {
      return res.status(400).json({ error: 'Preferences data missing in the request.' });
    }

    console.log(`Received ${files.length} images for analysis.`);

    // Parse the preferences string into an object
    let currentPreferences;
    try {
      currentPreferences = JSON.parse(preferencesString);
    } catch (parseError) {
      console.error("Error parsing preferences JSON:", parseError);
      return res.status(400).json({ error: 'Invalid preferences JSON format.' });
    }

    // Pass both files and parsed preferences to the service
    const analysisResult = await analyzeImagesWithOpenAI(files, currentPreferences);

    // Prepare the full response object
    const responsePayload = {
      message: `Successfully received and analyzed ${files.length} images.`,
      analysis: analysisResult
    };

    res.status(200).json(responsePayload);

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

// New endpoint to submit feedback for a destination
app.post('/api/destinations/:destinationId/feedback', async (req, res) => {
  try {
    const { destinationId } = req.params;
    const { feedback } = req.body;

    // Basic validation
    if (!destinationId) {
      return res.status(400).json({ error: 'Destination ID is required.' });
    }
    if (!feedback || typeof feedback !== 'string' || feedback.trim() === '') {
      return res.status(400).json({ error: 'Feedback text is required and cannot be empty.' });
    }

    // Insert feedback into Supabase table
    const { data, error } = await supabase
      .from('destination_feedback')
      .insert([
        { destination_id: destinationId, feedback_text: feedback.trim() },
      ])
      .select(); // Optionally select the inserted data if needed

    if (error) {
      console.error('Error inserting destination feedback:', error);
      // Check for foreign key violation (invalid destinationId)
      if (error.code === '23503') { // Foreign key violation code in PostgreSQL
        return res.status(404).json({ error: `Destination with ID ${destinationId} not found.`, details: error.message });
      }
      return res.status(500).json({ error: 'Failed to submit feedback', details: error.message });
    }

    console.log(`Feedback submitted for destination ${destinationId}:`, data);
    // Respond with success (201 Created or 204 No Content if not returning data)
    res.status(201).json({ message: 'Feedback submitted successfully.', feedback: data ? data[0] : null });

  } catch (err) {
    console.error('Server error submitting feedback:', err);
    res.status(500).json({ error: 'Internal server error during feedback submission' });
  }
});

// New endpoint to submit feedback (like/dislike) for a recommended destination
app.post('/api/recommendations/:recommendationId/feedback', async (req, res) => {
  try {
    const { recommendationId } = req.params;
    const { destinationId, feedback } = req.body; // e.g., { destinationId: "uuid", feedback: "like" | "dislike" }

    // --- Input Validation ---
    if (!recommendationId) {
      return res.status(400).json({ error: 'Recommendation ID is required in the URL path.' });
    }
    if (!destinationId || typeof destinationId !== 'string') {
      return res.status(400).json({ error: 'Destination ID is required in the request body.' });
    }
    if (!feedback || (feedback !== 'like' && feedback !== 'dislike')) {
      return res.status(400).json({ error: 'Feedback must be either "like" or "dislike".' });
    }

    // --- Fetch the recommendation record ---
    const { data: recommendation, error: fetchError } = await supabase
      .from('recommendations')
      .select('destination_1_id, destination_2_id, destination_3_id')
      .eq('id', recommendationId)
      .single();

    if (fetchError) {
      console.error('Error fetching recommendation record:', fetchError);
      // Check if error is due to record not found
      if (fetchError.code === 'PGRST116') { // PostgREST code for 'Exact one row expected' failed
        return res.status(404).json({ error: `Recommendation record with ID ${recommendationId} not found.` });
      }
      return res.status(500).json({ error: 'Failed to fetch recommendation record', details: fetchError.message });
    }

    if (!recommendation) {
      return res.status(404).json({ error: `Recommendation record with ID ${recommendationId} not found.` });
    }

    // --- Determine which feedback field to update ---
    let feedbackFieldToUpdate = null;
    if (recommendation.destination_1_id === destinationId) {
      feedbackFieldToUpdate = 'destination_1_feedback';
    } else if (recommendation.destination_2_id === destinationId) {
      feedbackFieldToUpdate = 'destination_2_feedback';
    } else if (recommendation.destination_3_id === destinationId) {
      feedbackFieldToUpdate = 'destination_3_feedback';
    }

    if (!feedbackFieldToUpdate) {
      return res.status(400).json({ error: `Destination ID ${destinationId} does not belong to recommendation record ${recommendationId}.` });
    }

    // --- Update the feedback field ---
    const updatePayload = { [feedbackFieldToUpdate]: feedback };
    const { data: updateData, error: updateError } = await supabase
      .from('recommendations')
      .update(updatePayload)
      .eq('id', recommendationId)
      .select('id'); // Optionally select data to confirm update

    if (updateError) {
      console.error('Error updating recommendation feedback:', updateError);
      return res.status(500).json({ error: 'Failed to update feedback', details: updateError.message });
    }

    console.log(`Feedback '${feedback}' submitted for destination ${destinationId} in recommendation ${recommendationId}.`);
    res.status(200).json({ message: 'Feedback submitted successfully.', updatedRecordId: updateData?.[0]?.id || recommendationId });

  } catch (err) {
    console.error('Server error submitting recommendation feedback:', err);
    res.status(500).json({ error: 'Internal server error during feedback submission' });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});