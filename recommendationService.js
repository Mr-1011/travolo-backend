require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { calculateRecommendations } = require('./recommendationAlgorithm'); // Import the algorithm

// Ensure Supabase connection details are available
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Key not found in .env file.");
  process.exit(1); // Exit if Supabase connection isn't possible
}

/** @type {import('@supabase/supabase-js').SupabaseClient} */
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Generates destination recommendations based on user preferences,
 * saves the preferences and recommendations to the DB,
 * and returns detailed recommendation info to the frontend.
 * 
 * @param {object} userPreferences - The user's preference profile.
 * @returns {Promise<object>} - An object containing the DB record ID and detailed recommendations.
 */
async function generateRecommendations(userPreferences) {
  console.log("Received user preferences for recommendation");

  // --- Fetch ALL Destinations from Supabase --- 
  console.log("Fetching all destinations from Supabase...");
  const { data: allDestinations, error: fetchError } = await supabase
    .from('destinations') // Make sure this table name is correct
    .select(`
      *,
      images ( public_url )
    `); // Fetch all destination columns and the public_url from the related images table

  if (fetchError) {
    console.error("Error fetching destinations:", fetchError);
    return {
      error: "Failed to fetch destination data.",
      details: fetchError.message,
      recommendations: []
    };
  }

  if (!allDestinations || allDestinations.length === 0) {
    console.error("No destinations found in the database.");
    return {
      error: "No destination data available.",
      details: "The 'destinations' table appears to be empty.",
      recommendations: []
    };
  }
  console.log(`Fetched ${allDestinations.length} destinations.`);

  // --- Calculate Recommendations using the Algorithm --- 
  console.log("Calculating recommendations...");
  // The calculateRecommendations function returns the top 3 scored destinations
  // Each object in the array includes the destination id and calculated scores/percentage
  const topRecommendationsScored = calculateRecommendations(userPreferences, allDestinations);
  console.log("Top 3 scored recommendations successfully calculated");

  // --- Retrieve Full Details for Top Recommendations --- 
  // Create a map for quick lookup
  const allDestinationsMap = new Map(allDestinations.map(d => [d.id, d]));

  // Get the full destination objects for the top recommendations and add the match percentage
  const topRecommendationsDetailed = topRecommendationsScored.map(scoredRec => {
    const fullDetails = allDestinationsMap.get(scoredRec.id);
    if (!fullDetails) {
      console.warn(`Destination details not found for ID: ${scoredRec.id}`);
      return null; // Handle case where ID might not be found
    }

    // Extract image URL
    let imageUrl = null;
    // Supabase returns related data as an array by default when using nested select
    if (Array.isArray(fullDetails.images) && fullDetails.images.length > 0) {
      imageUrl = fullDetails.images[0]?.public_url ?? null;
    } else if (fullDetails.images && typeof fullDetails.images === 'object' && !Array.isArray(fullDetails.images)) {
      // Fallback just in case it returns a single object (less common for one-to-many even with unique constraint)
      imageUrl = fullDetails.images.public_url ?? null;
    }

    // Create a copy without the 'images' property to avoid redundancy in the final output
    const detailsWithoutImages = { ...fullDetails };
    delete detailsWithoutImages.images;

    return {
      ...detailsWithoutImages,          // Spread destination details
      image_url: imageUrl,             // Add the image URL
      confidence: scoredRec.confidence, // Add the confidence score
      // Add other scores if needed, e.g.:
      // contentScore: scoredRec.contentScore, 
      // themeScore: scoredRec.themeScore, 
      // ...etc.
    };
  }).filter(rec => rec !== null); // Filter out any nulls introduced by missing details

  console.log(`Retrieved full details for ${topRecommendationsDetailed.length} recommendations.`);

  // --- Prepare Record for Supabase 'recommendations' Table --- 
  const recordToInsert = {
    // Travel Themes (Map from userPreferences)
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
    temp_min: userPreferences.temperatureRange?.[0] ?? null,
    temp_max: userPreferences.temperatureRange?.[1] ?? null,

    // Arrays
    travel_months: userPreferences.travelMonths,
    ideal_durations: userPreferences.travelDuration, // User's desired durations
    budget_level: userPreferences.travelBudget, // User's budget levels
    preferred_regions: userPreferences.preferredRegions,

    // Origin
    origin_name: userPreferences.originLocation?.name,
    origin_lat: userPreferences.originLocation?.lat,
    origin_lon: userPreferences.originLocation?.lon,

    // Photo Analysis
    image_count: userPreferences.photoAnalysis?.imageCount,
    image_adjusted: userPreferences.photoAnalysis?.adjustmentSuccessful,
    image_analysis: userPreferences.photoAnalysis?.imageAnalysis,
    image_summary: userPreferences.photoAnalysis?.imageSummary,

    // Other feedback/metadata
    destination_ratings: userPreferences.destinationRatings, // Renamed in DB? Assuming it maps to `destination_ratings`

    // Conversation Summary
    user_message_count: userPreferences.conversationSummary?.userMessageCount,

    // --- Top 3 Recommendations --- 
    // Store IDs and Match Percentages (using existing *_confidence columns)
    destination_1_id: topRecommendationsDetailed[0]?.id ?? null,
    destination_1_confidence: topRecommendationsDetailed[0]?.confidence ?? null,
    destination_1_feedback: null, // Keep feedback null initially

    destination_2_id: topRecommendationsDetailed[1]?.id ?? null,
    destination_2_confidence: topRecommendationsDetailed[1]?.confidence ?? null,
    destination_2_feedback: null,

    destination_3_id: topRecommendationsDetailed[2]?.id ?? null,
    destination_3_confidence: topRecommendationsDetailed[2]?.confidence ?? null,
    destination_3_feedback: null,
  };

  console.log("Attempting to insert into recommendations table");

  // --- Insert into Supabase 'recommendations' table --- 
  const { data: insertedData, error: insertError } = await supabase
    .from('recommendations') // Make sure this table name is correct
    .insert([recordToInsert])
    .select('id') // Select only the id of the newly inserted row
    .single(); // Expecting a single row back

  if (insertError) {
    console.error("Error inserting recommendation record:", insertError);
    // Return the calculated recommendations even if saving fails, but include error info
    return {
      error: "Failed to save recommendation preferences.",
      details: insertError.message,
      preferences_received: userPreferences,
      recommendations: topRecommendationsDetailed // Still return the calculated recommendations
    };
  }

  const newRecordId = insertedData ? insertedData.id : null;
  console.log("Successfully inserted recommendation record with ID:", newRecordId);

  // --- Return the ID of the saved record and the ACTUAL recommendations --- 
  return {
    message: "Recommendations generated and saved successfully.",
    recommendationRecordId: newRecordId, // ID of the row created in the DB
    recommendations: topRecommendationsDetailed // Return the detailed actual recommendations
  };
}

// Use CommonJS exports for Node.js
module.exports = {
  generateRecommendations,
};