require('dotenv').config();
const OpenAI = require('openai');

// Ensure the OpenAI API key is set in the environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not found in .env file.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PREFERENCE_KEYS = [
  "culture", "adventure", "nature", "beaches", "nightlife",
  "cuisine", "wellness", "urban", "seclusion"
];

/**
 * Analyzes uploaded images and updates user preferences using OpenAI's GPT-4 Vision model.
 * @param {Array<object>} imageFiles - Array of file objects from multer (containing buffer, mimetype).
 * @param {Record<string, number>} currentPreferences - The user's current preference scores (1-5).
 * @returns {Promise<object>} - An object containing the updated preferences and a summary.
 */
async function analyzeImagesWithOpenAI(imageFiles, currentPreferences) {
  if (!imageFiles || imageFiles.length === 0) {
    throw new Error("No image files provided for analysis.");
  }
  if (!currentPreferences) {
    throw new Error("Current preferences not provided.");
  }
  // Basic validation for preference format (can be enhanced)
  if (typeof currentPreferences !== 'object' || Object.keys(currentPreferences).length === 0) {
    throw new Error("Invalid current preferences format.");
  }


  // --- Updated Prompt ---
  const textPromptContent = `
You are an image analysis assistant that adjusts a user's 9 travel preference scores (1–5) after seeing up to 3 photos.

INPUT
• user_profile – JSON: current scores for culture, adventure, nature, beaches, nightlife, cuisine, wellness, urban, seclusion  
• images       – array of 1–3 photos

MAPPING RULES
• Surf / waves  -> beaches, adventure up
• Ski / snow    -> adventure, nature up
• Skyline night -> urban, nightlife up; beaches, seclusion down if very dense city
• Forest cabin  -> nature, seclusion up; urban, nightlife down
• Museum / ruins -> culture up
• Spa / yoga    -> wellness up; adventure down (if spa like)
• Street food   -> cuisine up

DELTA LOGIC
1. Detect cues per photo and assign raw deltas: strong ±3, moderate ±2, weak ±1, none 0.  
2. Sum per feature across all photos; cap total at ±3.  
3. If a cue clearly contradicts an existing score ≥ 4, apply a negative delta (max -3).  
4. new_score = clamp(old + delta, 1, 5).  
5. Features without cues -> delta 0.

OUTPUT  
Return **only** this JSON (no markdown):

{
  "deltas": {            // every feature present, value -3…+3
    "culture": 0,
    "adventure": 0,
    "nature": 0,
    "beaches": -3,
    "nightlife": 0,
    "cuisine": 0,
    "wellness": 0,
    "urban": 3,
    "seclusion": -1
  },
  "summary": "Photos show a bustling Manhattan street at night with skyscrapers and taxis, indicating high urban and nightlife interest while reducing beach and seclusion relevance."
}

If a featur's delta is 0, still include it. If nothing changes, all deltas are 0 and summary states “No travel relevant cues detected.”

  `.trim();

  // --- Prepare input for OpenAI Responses API (using user-provided working structure) ---
  const inputPayload = [
    {
      role: "system",
      content: [
        { type: "input_text", text: textPromptContent },
      ],
    },
    {
      role: "user",
      content: [
        // Map image files to input_image type
        ...imageFiles.map(file => ({
          type: "input_image",
          image_url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
        })),
        // Add current preferences as input_text
        {
          type: "input_text",
          text: JSON.stringify(currentPreferences, null, 2) // Pass preferences as stringified JSON
        },
      ],
    },
  ];


  try {
    // Log only the user preferences part of the input payload
    const userMessageContent = inputPayload.find(msg => msg.role === 'user')?.content;
    const preferencesText = userMessageContent?.find(item => item.type === 'input_text')?.text;
    if (preferencesText) {
      console.log("Sending request to OpenAI with User Preferences:", preferencesText);
    } else {
      console.log("Sending request to OpenAI (User preferences text not found in input structure for logging).");
    }
    // console.log("Sending request to OpenAI with input:" + JSON.stringify(inputPayload, null, 2)); // Original full log

    const response = await openai.responses.create({
      model: "gpt-4.1", // Using the user-specified model
      input: inputPayload, // Passing combined text and image structure
      text: { // Requesting JSON output via schema defining DELTAS
        "format": {
          "type": "json_schema",
          "name": "image_analysis_result", // Updated schema name
          "strict": true,
          "schema": {
            "type": "object",
            "properties": {
              "imageAnalysis": { // Renamed field
                "type": "object",
                "properties": {
                  // Expecting deltas (-2 to +2)
                  "culture": { "type": "integer" },
                  "adventure": { "type": "integer" },
                  "nature": { "type": "integer" },
                  "beaches": { "type": "integer" },
                  "nightlife": { "type": "integer" },
                  "cuisine": { "type": "integer" },
                  "wellness": { "type": "integer" },
                  "urban": { "type": "integer" },
                  "seclusion": { "type": "integer" }
                },
                "required": [
                  "culture", "adventure", "nature", "beaches", "nightlife",
                  "cuisine", "wellness", "urban", "seclusion"
                ],
                "additionalProperties": false
              },
              "imageSummary": { "type": "string" } // Renamed field
            },
            "required": ["imageAnalysis", "imageSummary"], // Updated required fields
            "additionalProperties": false
          }
        }
      },
      temperature: 1,
      max_output_tokens: 2048,
      top_p: 1,
      store: true // Added back based on user snippet
    });

    console.log("Received response from OpenAI (responses.create).");

    // --- Adjust response parsing based on the documented structure for responses.create --- 
    // Expected structure might be: response.content[0].text containing the JSON string.
    let rawContent = null;
    if (response.content && Array.isArray(response.content) && response.content.length > 0 && response.content[0].type === 'output_text') {
      rawContent = response.content[0].text;
    } else if (response.output_text) { // Fallback check for output_text helper field
      rawContent = response.output_text;
    }

    if (!rawContent) {
      throw new Error("OpenAI response (responses.create) did not contain expected text content.");
    }

    // Parse the JSON response content
    let analysisResult;
    try {
      analysisResult = JSON.parse(rawContent);
    } catch (parseError) {
      console.error("Error parsing JSON response from OpenAI:", parseError);
      console.error("Raw content that failed parsing:", rawContent);
      throw new Error(`Failed to parse JSON response from OpenAI (responses.create): ${parseError.message}`);
    }

    // Optional: Add validation for the structure of analysisResult
    if (!analysisResult.imageAnalysis || !analysisResult.imageSummary || Object.keys(analysisResult.imageAnalysis).length !== PREFERENCE_KEYS.length) {
      console.error("Invalid JSON structure received:", JSON.stringify(analysisResult, null, 2));
      throw new Error("Received invalid JSON structure from OpenAI.");
    }

    // Log the final parsed analysis result
    console.log("Parsed Analysis Result from OpenAI:", JSON.stringify(analysisResult, null, 2));

    return analysisResult; // Return the parsed JSON object { imageAnalysis, imageSummary }

  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    // Re-throw the error to be handled by the calling endpoint
    throw new Error(`OpenAI API request failed: ${error.message}`);
  }
}

module.exports = {
  analyzeImagesWithOpenAI,
}; 