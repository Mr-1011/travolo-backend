require('dotenv').config();
const OpenAI = require('openai');

// Ensure the OpenAI API key is set in the environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not found in .env file.");
  // Optionally, throw an error or exit if the key is essential for the module to function
  // throw new Error("OPENAI_API_KEY is required"); 
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Analyzes uploaded images using OpenAI's GPT-4 Vision model.
 * @param {Array<object>} imageFiles - Array of file objects from multer (containing buffer, mimetype).
 * @returns {Promise<string>} - The analysis result from OpenAI.
 */
async function analyzeImagesWithOpenAI(imageFiles) {
  if (!imageFiles || imageFiles.length === 0) {
    throw new Error("No image files provided for analysis.");
  }

  // --- Basic Prompt ---
  // TODO: Refine this prompt based on desired preference adjustments
  const textPrompt = `
Analyze the following image(s) and describe the general travel vibe or style they represent. 
Focus on elements relevant to travel preferences like environment (urban, nature, beach), 
potential activities (adventure, relaxation, nightlife, culture), and overall mood (luxury, budget, family-friendly, romantic).
Be concise.
  `.trim();

  // --- Prepare messages for OpenAI API ---
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: textPrompt },
        // Map image files to the format OpenAI expects
        ...imageFiles.map(file => ({
          type: "image_url",
          image_url: {
            // Convert buffer to base64 data URL
            url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
          },
        })),
      ],
    },
  ];

  try {
    console.log("Sending request to OpenAI vision model...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Use the gpt-4o model
      messages: messages,
      max_tokens: 300, // Adjust token limit as needed
    });

    console.log("Received response from OpenAI.");
    // Log the full response object for debugging
    console.log("Full OpenAI Response:", JSON.stringify(response, null, 2));

    // Extract the response content
    const analysis = response.choices[0]?.message?.content;

    if (!analysis) {
      throw new Error("OpenAI response did not contain content.");
    }

    return analysis;

  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    // Re-throw the error to be handled by the calling endpoint
    throw new Error(`OpenAI API request failed: ${error.message}`);
  }
}

module.exports = {
  analyzeImagesWithOpenAI,
}; 