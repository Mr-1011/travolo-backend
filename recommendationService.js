require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Ensure Supabase connection details are available if needed later
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Key not found in .env file.");
  // Depending on whether Supabase is always needed, you might handle this differently
}

// Use JSDoc for type hinting if desired, but remove TS syntax
/** @type {import('@supabase/supabase-js').SupabaseClient} */
const supabase = createClient(supabaseUrl, supabaseKey);

// Removed TypeScript interfaces - use JSDoc in function signatures if needed

/**
 * Generates destination recommendations based on user preferences,
 * saves the preferences and placeholder recommendations to the DB,
 * and returns detailed placeholder destination info to the frontend.
 * 
 * @param {object} userPreferences - The user's preference profile.
 * @property {object} [userPreferences.travelThemes]
 * @property {number} [userPreferences.travelThemes.culture]
 * @property {number} [userPreferences.travelThemes.adventure]
 * @property {number} [userPreferences.travelThemes.nature]
 * @property {number} [userPreferences.travelThemes.beaches]
 * @property {number} [userPreferences.travelThemes.nightlife]
 * @property {number} [userPreferences.travelThemes.cuisine]
 * @property {number} [userPreferences.travelThemes.wellness]
 * @property {number} [userPreferences.travelThemes.urban]
 * @property {number} [userPreferences.travelThemes.seclusion]
 * @property {[number, number]} [userPreferences.temperatureRange]
 * @property {string[]} [userPreferences.travelMonths]
 * @property {string[]} [userPreferences.travelDuration]
 * @property {string[]} [userPreferences.preferredRegions]
 * @property {object} [userPreferences.originLocation]
 * @property {string} [userPreferences.originLocation.name]
 * @property {number} [userPreferences.originLocation.lat]
 * @property {number} [userPreferences.originLocation.lon]
 * @property {string[]} [userPreferences.travelBudget]
 * @property {Record<string, string>} [userPreferences.destinationRatings]
 * @property {object} [userPreferences.photoAnalysis]
 * @property {number} [userPreferences.photoAnalysis.imageCount]
 * @property {boolean} [userPreferences.photoAnalysis.adjustmentSuccessful]
 * @property {object} [userPreferences.conversationSummary]
 * @property {number} [userPreferences.conversationSummary.userMessageCount]
 * 
 * @returns {Promise<object>} - An object containing the DB record ID and detailed placeholder recommendations.
 * @property {string} [message]
 * @property {string | null} [recommendationRecordId]
 * @property {object[]} [recommendations] - Array of destination details.
 * @property {string} [error]
 * @property {string} [details]
 * @property {object} [preferences_received] - Included in error case.
 */
async function generateRecommendations(userPreferences) {
  console.log("Received user preferences for recommendation:", JSON.stringify(userPreferences, null, 2));

  // --- Hardcoded Destination Data for Placeholder Response ---
  // JSDoc can define the shape if needed, but removed TS types
  const detailedPlaceholderRecommendations = [
    {
      id: '0e639efe-ac01-44b3-8716-2da67148d47c',
      city: 'Boston',
      country: 'United States',
      region: 'North America',
      short_description: 'Historic streets meet modern innovation, offering a mix of charming neighborhoods, rich history, and vibrant cultural scenes that invite exploration and discovery.',
      culture: 5, adventure: 2, nature: 3, beaches: 2, nightlife: 4, cuisine: 4, wellness: 3, urban: 5, seclusion: 2,
      avg_temp_monthly: { "1": { "avg": -0.1, "max": 3.6, "min": -3.8 }, "2": { "avg": 0.7, "max": 5.0, "min": -3.8 }, "3": { "avg": 4.0, "max": 8.2, "min": 0.1 }, "4": { "avg": 9.2, "max": 13.6, "min": 5.2 }, "5": { "avg": 15.1, "max": 20.0, "min": 10.7 }, "6": { "avg": 20.2, "max": 24.9, "min": 15.8 }, "7": { "avg": 23.9, "max": 28.4, "min": 19.8 }, "8": { "avg": 23.4, "max": 27.9, "min": 19.4 }, "9": { "avg": 19.6, "max": 23.6, "min": 15.7 }, "10": { "avg": 13.8, "max": 17.8, "min": 9.9 }, "11": { "avg": 7.7, "max": 11.8, "min": 3.6 }, "12": { "avg": 3.0, "max": 6.6, "min": -0.6 } },
      ideal_durations: ["Weekend", "One week", "Short trip"],
      budget_level: 'Luxury',
      confidence: 0.9, // Placeholder confidence
      image_url: 'https://modxpxeboqlapfyjcdfd.supabase.co/storage/v1/object/public/thumbnails/Toulouse_France_20250413174826.jpeg?'
    },
    {
      id: '0eeb9c0f-6cae-4e46-ba5a-dba09017c4ec',
      city: 'Toulouse',
      country: 'France',
      region: 'Europe',
      short_description: 'Charming cobblestone streets, pink-hued buildings, and a lively café culture create a welcoming atmosphere that\'s both vibrant and soothing.',
      culture: 4, adventure: 3, nature: 3, beaches: 2, nightlife: 4, cuisine: 4, wellness: 3, urban: 4, seclusion: 2,
      avg_temp_monthly: { "1": { "avg": 6.2, "max": 9.9, "min": 3.0 }, "2": { "avg": 8.2, "max": 12.8, "min": 4.3 }, "3": { "avg": 10.4, "max": 15.4, "min": 6.3 }, "4": { "avg": 13.1, "max": 18.5, "min": 8.4 }, "5": { "avg": 16.5, "max": 22.0, "min": 11.8 }, "6": { "avg": 21.1, "max": 26.9, "min": 16.1 }, "7": { "avg": 23.5, "max": 29.6, "min": 18.0 }, "8": { "avg": 23.5, "max": 29.9, "min": 17.8 }, "9": { "avg": 19.8, "max": 25.9, "min": 14.8 }, "10": { "avg": 15.7, "max": 21.0, "min": 11.5 }, "11": { "avg": 10.4, "max": 14.6, "min": 6.9 }, "12": { "avg": 7.9, "max": 12.0, "min": 4.6 } },
      ideal_durations: ["Short trip", "One week", "Weekend"],
      budget_level: 'Mid-range',
      confidence: 0.1, // Placeholder confidence
      image_url: 'https://modxpxeboqlapfyjcdfd.supabase.co/storage/v1/object/public/thumbnails/Toulouse_France_20250413174826.jpeg?'
    },
    {
      id: '0f7e00d1-189f-4504-a23d-71dc70d98ae4',
      city: 'Vientiane',
      country: 'Laos',
      region: 'Asia',
      short_description: 'Tranquil streets lined with French colonial architecture, vibrant markets, and serene temples create a peaceful yet culturally rich experience.',
      culture: 4, adventure: 3, nature: 3, beaches: 1, nightlife: 2, cuisine: 4, wellness: 3, urban: 2, seclusion: 4,
      avg_temp_monthly: { "1": { "avg": 23.3, "max": 29.6, "min": 17.6 }, "2": { "avg": 24.6, "max": 31.9, "min": 19.9 }, "3": { "avg": 28.1, "max": 34.3, "min": 22.8 }, "4": { "avg": 29.9, "max": 35.9, "min": 24.9 }, "5": { "avg": 29.7, "max": 35.1, "min": 25.7 }, "6": { "avg": 29.0, "max": 33.6, "min": 25.4 }, "7": { "avg": 28.6, "max": 33.4, "min": 25.7 }, "8": { "avg": 28.2, "max": 32.1, "min": 25.0 }, "9": { "avg": 28.1, "max": 32.6, "min": 24.8 }, "10": { "avg": 27.8, "max": 32.6, "min": 23.7 }, "11": { "avg": 26.7, "max": 32.1, "min": 21.3 }, "12": { "avg": 23.7, "max": 30.0, "min": 17.9 } },
      ideal_durations: ["Short trip", "Weekend"],
      budget_level: 'Budget',
      confidence: 0.06, // Placeholder confidence
      image_url: 'https://modxpxeboqlapfyjcdfd.supabase.co/storage/v1/object/public/thumbnails/Toulouse_France_20250413174826.jpeg?'
    }
  ];


  // --- Map preferences to DB schema (IDs are from the hardcoded data above) ---
  const recordToInsert = {
    // Travel Themes
    culture: userPreferences.culture,
    adventure: userPreferences.adventure,
    nature: userPreferences.nature,
    beaches: userPreferences.beaches,
    nightlife: userPreferences.nightlife,
    cuisine: userPreferences.cuisine,
    wellness: userPreferences.wellness,
    urban: userPreferences.urban,
    seclusion: userPreferences.seclusion,

    // Temperature
    temp_min: userPreferences.temperatureRange ? userPreferences.temperatureRange[0] : null,
    temp_max: userPreferences.temperatureRange ? userPreferences.temperatureRange[1] : null,

    // Arrays
    travel_months: userPreferences.travelMonths,
    ideal_durations: userPreferences.travelDuration, // Map userPreferences.travelDuration -> ideal_durations
    budget_level: userPreferences.travelBudget, // Map userPreferences.travelBudget -> budget_level (column name)
    preferred_regions: userPreferences.preferredRegions,

    // Origin
    origin_name: userPreferences.originLocation?.name,
    origin_lat: userPreferences.originLocation?.lat,
    origin_lon: userPreferences.originLocation?.lon,

    // Photo Analysis
    image_count: userPreferences.photoAnalysis?.imageCount, // Map userPreferences.photoAnalysis?.imageCount -> image_count
    image_adjusted: userPreferences.photoAnalysis?.adjustmentSuccessful, // Map userPreferences.photoAnalysis?.adjustmentSuccessful -> photo_adjusted
    image_analysis: userPreferences.photoAnalysis?.imageAnalysis, // Add mapping for imageAnalysis
    image_summary: userPreferences.photoAnalysis?.imageSummary, // Add mapping for imageSummary

    // Other feedback/metadata
    destination_ratings: userPreferences.destinationRatings, // Map userPreferences.destinationRatings -> rated_destination_feedback

    // Conversation Summary
    user_message_count: userPreferences.conversationSummary?.userMessageCount, // Map userPreferences.conversationSummary?.userMessageCount -> user_message_count

    // Use IDs from the hardcoded detailed recommendations
    destination_1_id: detailedPlaceholderRecommendations[0].id,
    destination_1_confidence: detailedPlaceholderRecommendations[0].confidence,
    destination_1_feedback: null,

    destination_2_id: detailedPlaceholderRecommendations[1].id,
    destination_2_confidence: detailedPlaceholderRecommendations[1].confidence,
    destination_2_feedback: null,

    destination_3_id: detailedPlaceholderRecommendations[2].id,
    destination_3_confidence: detailedPlaceholderRecommendations[2].confidence,
    destination_3_feedback: null,
  };

  console.log("Attempting to insert into recommendations table:", JSON.stringify(recordToInsert, null, 2));

  // --- Insert into Supabase 'recommendations' table ---
  const { data: insertedData, error: insertError } = await supabase
    .from('recommendations')
    .insert([recordToInsert])
    .select('id') // Select only the id of the newly inserted row
    .single(); // Expecting a single row back

  if (insertError) {
    console.error("Error inserting recommendation record:", insertError);
    return {
      error: "Failed to save recommendation preferences.",
      details: insertError.message,
      preferences_received: userPreferences,
      recommendations: [] // Indicate no recommendations available due to save error
    };
  }

  const newRecordId = insertedData ? insertedData.id : null;
  console.log("Successfully inserted recommendation record with ID:", newRecordId);

  // --- Return the ID of the saved record and the DETAILED placeholder info ---
  return {
    message: "Recommendation preferences saved. Returning placeholder recommendations.",
    recommendationRecordId: newRecordId, // ID of the row created in the DB
    recommendations: detailedPlaceholderRecommendations // Return the detailed hardcoded data
  };
}

// Use CommonJS exports for Node.js
module.exports = {
  generateRecommendations,
  // Cannot export types in JS
}; 