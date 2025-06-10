require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const multer = require('multer');
const { analyzeImagesWithOpenAI } = require('./services/imageService');
const { generateRecommendations } = require('./services/recommendationService');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Key not provided in .env file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.get('/api/destinations/random', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('get_random_destinations', { limit_count: 10 });

    if (error) {
      console.error('Error fetching random destinations:', error);
      return res.status(500).json({ error: 'Failed to fetch random destinations', details: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'No destinations found.' });
    }

    res.json(data);

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/preferences/analyze-images', upload.array('images', 3), async (req, res) => {
  try {
    const files = req.files;
    const preferencesString = req.body.preferences;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No image files uploaded.' });
    }

    if (!preferencesString) {
      return res.status(400).json({ error: 'Preferences data missing in the request.' });
    }

    console.log(`Received ${files.length} images for analysis.`);

    let currentPreferences;
    try {
      currentPreferences = JSON.parse(preferencesString);
    } catch (parseError) {
      console.error("Error parsing preferences JSON:", parseError);
      return res.status(400).json({ error: 'Invalid preferences JSON format.' });
    }

    const analysisResult = await analyzeImagesWithOpenAI(files, currentPreferences);

    const responsePayload = {
      message: `Successfully received and analyzed ${files.length} images.`,
      analysis: analysisResult
    };

    res.status(200).json(responsePayload);

  } catch (err) {
    console.error('Error analyzing images:', err);
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    }
    res.status(500).json({ error: 'Internal server error during image analysis' });
  }
});

app.post('/api/recommendations', async (req, res) => {
  try {
    const userPreferences = req.body;

    if (!userPreferences || typeof userPreferences !== 'object' || Object.keys(userPreferences).length === 0) {
      return res.status(400).json({ error: 'User preferences object is missing or empty in request body.' });
    }

    const result = await generateRecommendations(userPreferences);

    res.status(200).json(result);

  } catch (err) {
    console.error('Error generating recommendations:', err);
    res.status(500).json({ error: 'Internal server error during recommendation generation' });
  }
});

app.post('/api/destinations/:destinationId/feedback', async (req, res) => {
  try {
    const { destinationId } = req.params;
    const { feedback } = req.body;

    if (!destinationId) {
      return res.status(400).json({ error: 'Destination ID is required.' });
    }
    if (!feedback || typeof feedback !== 'string' || feedback.trim() === '') {
      return res.status(400).json({ error: 'Feedback text is required and cannot be empty.' });
    }

    const { data, error } = await supabase
      .from('destination_feedback')
      .insert([
        { destination_id: destinationId, feedback_text: feedback.trim() },
      ])
      .select();

    if (error) {
      console.error('Error inserting destination feedback:', error);
      if (error.code === '23503') {
        return res.status(404).json({ error: `Destination with ID ${destinationId} not found.`, details: error.message });
      }
      return res.status(500).json({ error: 'Failed to submit feedback', details: error.message });
    }

    console.log(`Feedback submitted for destination ${destinationId}:`, data);
    res.status(201).json({ message: 'Feedback submitted successfully.', feedback: data ? data[0] : null });

  } catch (err) {
    console.error('Server error submitting feedback:', err);
    res.status(500).json({ error: 'Internal server error during feedback submission' });
  }
});

app.post('/api/recommendations/:recommendationId/feedback', async (req, res) => {
  try {
    const { recommendationId } = req.params;
    const { destinationId, feedback } = req.body;

    if (!recommendationId) {
      return res.status(400).json({ error: 'Recommendation ID is required in the URL path.' });
    }
    if (!destinationId || typeof destinationId !== 'string') {
      return res.status(400).json({ error: 'Destination ID is required in the request body.' });
    }
    if (!feedback || (feedback !== 'like' && feedback !== 'dislike')) {
      return res.status(400).json({ error: 'Feedback must be either "like" or "dislike".' });
    }

    const { data: recommendation, error: fetchError } = await supabase
      .from('recommendations')
      .select('destination_1_id, destination_2_id, destination_3_id')
      .eq('id', recommendationId)
      .single();

    if (fetchError) {
      console.error('Error fetching recommendation record:', fetchError);
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: `Recommendation record with ID ${recommendationId} not found.` });
      }
      return res.status(500).json({ error: 'Failed to fetch recommendation record', details: fetchError.message });
    }

    if (!recommendation) {
      return res.status(404).json({ error: `Recommendation record with ID ${recommendationId} not found.` });
    }

    let feedbackFieldToUpdate = null;
    if (recommendation.destination_1_id === destinationId) {
      feedbackFieldToUpdate = 'destination_1_feedback';
    } else if (recommendation.destination_2_id === destinationId) {
      feedbackFieldToUpdate = 'destination_2_feedback';
    } else if (recommendation.destination_3_id === destinationId) {
      feedbackFieldToUpdate = 'destination_3_feedback';
    }

    if (!feedbackFieldToUpdate) {
      return res.status(400).json({ error: `Destination ID ${destinationId} does not match any destination in recommendation record ${recommendationId}.` });
    }

    const updatePayload = { [feedbackFieldToUpdate]: feedback };
    const { data: updateData, error: updateError } = await supabase
      .from('recommendations')
      .update(updatePayload)
      .eq('id', recommendationId)
      .select('id');

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