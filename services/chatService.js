require('dotenv').config();
const OpenAI = require('openai');

// Ensure the OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not found in .env file.");
  // Depending on your error handling strategy, you might throw an error
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the structure for the user preferences relevant to the chat
// This helps guide the LLM. Adjust based on your UserPreferences type.
const PREFERENCE_FIELDS_FOR_LLM = [
  { key: 'travelThemes', name: 'Travel Themes', scale: null }, // e.g., Relaxation, Adventure
  { key: 'temperatureRange', name: 'Ideal Temperature Range', scale: null }, // e.g., [15, 25]
  { key: 'travelMonths', name: 'Travel Months', scale: null }, // e.g., ['June', 'July']
  { key: 'travelDuration', name: 'Travel Duration', scale: null }, // e.g., '1-2 weeks'
  { key: 'preferredRegions', name: 'Preferred Regions', scale: null }, // e.g., ['Europe', 'Asia']
  { key: 'travelBudget', name: 'Budget Level', scale: null }, // e.g., 'Mid-range'
  // Add the 1-5 scale preferences from your DB schema
  { key: 'culture', name: 'Importance of Culture', scale: '1-5' },
  { key: 'adventure', name: 'Importance of Adventure', scale: '1-5' },
  { key: 'nature', name: 'Importance of Nature', scale: '1-5' },
  { key: 'beaches', name: 'Importance of Beaches', scale: '1-5' },
  { key: 'nightlife', name: 'Importance of Nightlife', scale: '1-5' },
  { key: 'cuisine', name: 'Importance of Cuisine', scale: '1-5' },
  { key: 'wellness', name: 'Importance of Wellness/Relaxation', scale: '1-5' },
  { key: 'urban', name: 'Preference for Urban Environments', scale: '1-5' },
  { key: 'seclusion', name: 'Preference for Seclusion/Remoteness', scale: '1-5' },
];

function generateInitialSystemPrompt(preferences) {
  let prompt = `You are a helpful travel assistant refining a user's trip preferences. 
Their current profile is:
`;

  PREFERENCE_FIELDS_FOR_LLM.forEach(field => {
    const value = preferences[field.key];
    if (value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)) {
      prompt += `- ${field.name}: ${Array.isArray(value) ? value.join(', ') : value}
`;
    }
  });

  prompt += `
Your goal is to understand the user's priorities better, especially for aspects rated on a 1-5 scale (1=Not important, 5=Very important). 
Ask clarifying questions to understand their desired levels for things like Culture, Adventure, Nature, Beaches, Nightlife, Cuisine, Wellness, Urban vs. Seclusion. 
Guide them to provide ratings or express importance for these factors. 
Keep your questions concise and focused on gathering preference details. Start by asking about one or two key aspects based on their initial themes or lack of detail in the 1-5 scales.`;

  return prompt.trim();
}

/**
 * Handles a chat interaction, sending history to OpenAI and getting the next response.
 * 
 * @param {Array<object>} chatMessages - The history of messages ({ role: 'user' | 'assistant' | 'system', content: string }).
 * @param {object | null} initialPreferences - The user's initial preferences (used only for the first interaction to create the system prompt).
 * @returns {Promise<string>} - The AI assistant's response message content.
 */
async function handleChatInteraction(chatMessages, initialPreferences = null) {
  if (!chatMessages || chatMessages.length === 0) {
    throw new Error("Chat history is empty.");
  }

  let messagesForAPI = [...chatMessages];

  // Check if this is the first *user* message needing the initial system prompt
  const isInitialUserMessage = chatMessages.length === 1 && chatMessages[0].role === 'user' && initialPreferences;

  if (isInitialUserMessage) {
    console.log("Generating initial system prompt based on preferences.");
    const systemPrompt = generateInitialSystemPrompt(initialPreferences);
    // Add the system prompt to the beginning of the conversation
    messagesForAPI.unshift({ role: 'system', content: systemPrompt });
    console.log("System Prompt:", systemPrompt); // Log for debugging
  }

  // Ensure messages have the correct structure (role, content)
  messagesForAPI = messagesForAPI.map(msg => ({ role: msg.role, content: msg.content }));

  console.log(`Sending ${messagesForAPI.length} messages to OpenAI...`);
  // console.log("Messages for API:", JSON.stringify(messagesForAPI, null, 2)); // Careful: Can be very long

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Or your preferred model
      messages: messagesForAPI,
      temperature: 0.7, // Adjust as needed
      max_tokens: 150, // Keep responses relatively concise
    });

    const assistantResponse = response.choices[0]?.message?.content;

    if (!assistantResponse) {
      throw new Error("OpenAI response did not contain content.");
    }

    console.log("Received assistant response from OpenAI.");
    return assistantResponse.trim();

  } catch (error) {
    console.error("Error calling OpenAI API in chat service:", error);
    throw new Error(`OpenAI API request failed: ${error.message}`);
  }
}

module.exports = {
  handleChatInteraction,
}; 