/**
 * @fileoverview Recommendation Service for Travolo
 * 
 * This service handles the recommendation generation logic:
 * 1. Receives user preferences from the frontend
 * 2. Fetches destinations from the database
 * 3. Calls the recommendation algorithm to generate personalized recommendations
 * 4. Stores the user preferences and recommendations in the database
 * 5. Returns detailed recommendation information to the frontend
 * 6. Triggers the similarity matrix refresh when appropriate
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { calculateRecommendations } = require('../recommendationAlgorithm'); // Import the algorithm
const { invalidateSimilarityCache } = require('../collaborativeFiltering'); // Adjust path if necessary

// Ensure Supabase connection details are available
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // <-- Add service role key

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase URL or Public Key not found in .env file.");
  process.exit(1); // Exit if Supabase connection isn't possible
}

if (!supabaseServiceRoleKey) {
  console.warn("Supabase Service Role Key not found in .env file. Similarity matrix refresh will fail.");
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

  // --- Step 1: Fetch destinations from database --- 
  console.log("Fetching all destinations from Supabase...");
  const { data: allDestinations, error: fetchError } = await supabase
    .from('destinations')
    .select(`
      *,
      images ( public_url )
    `);

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

  // --- Step 2: Calculate recommendations using the algorithm --- 
  console.log("Calculating recommendations...");
  // The calculateRecommendations function modifies userPreferences directly
  // and returns an array of recommendations with id and confidence.
  const topRecommendationsScored = await calculateRecommendations(userPreferences, allDestinations);
  console.log("Top 3 scored recommendations successfully calculated");

  // --- Step 3: Retrieve full destination details for top recommendations --- 
  // Create a map for quick lookup of destination details
  const allDestinationsMap = new Map(allDestinations.map(d => [d.id, d]));

  // Get the full destination objects for the top recommendations and add the match percentage
  const topRecommendationsDetailed = topRecommendationsScored.map(scoredRec => {
    const fullDetails = allDestinationsMap.get(scoredRec.id);
    if (!fullDetails) {
      console.warn(`Destination details not found for ID: ${scoredRec.id}`);
      return null; // Handle case where ID might not be found
    }

    // Extract image URL from the nested images relation
    let imageUrl = null;
    // Supabase returns related data as an array by default when using nested select
    if (Array.isArray(fullDetails.images) && fullDetails.images.length > 0) {
      imageUrl = fullDetails.images[0]?.public_url ?? null;
    } else if (fullDetails.images && typeof fullDetails.images === 'object' && !Array.isArray(fullDetails.images)) {
      // Fallback just in case it returns a single object
      imageUrl = fullDetails.images.public_url ?? null;
    }

    // Create a copy without the 'images' property to avoid redundancy in output
    const detailsWithoutImages = { ...fullDetails };
    delete detailsWithoutImages.images;

    return {
      ...detailsWithoutImages,          // Spread destination details
      image_url: imageUrl,              // Add the image URL
      confidence: scoredRec.confidence, // Add the confidence score
    };
  }).filter(rec => rec !== null); // Filter out any nulls introduced by missing details

  console.log(`Retrieved full details for ${topRecommendationsDetailed.length} recommendations.`);

  // --- Step 4: Prepare record for database storage --- 
  // Map user preferences to database schema
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
    destination_ratings: userPreferences.destinationRatings,
    destination_analysis: userPreferences.destinationAnalysis, // Analysis added by the algorithm

    // Top 3 Recommendations - Store IDs and Match Percentages
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

  // --- Step 5: Save recommendation record to database --- 
  const { data: insertedData, error: insertError } = await supabase
    .from('recommendations')
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

  // --- Step 6: Refresh Item Similarity Matrix for collaborative filtering ---
  if (newRecordId && supabaseServiceRoleKey) {
    console.log("Attempting to refresh item similarity matrix...");
    // Create a separate client instance with the Service Role Key for the RPC call
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { error: rpcError } = await supabaseAdmin.rpc('refresh_item_similarity');

    if (rpcError) {
      console.error("Error calling refresh_item_similarity RPC:", rpcError);
      // Log error but don't fail the request
    } else {
      console.log("Successfully triggered refresh_item_similarity. Invalidating cache.");
      // Invalidate the cache so next request will fetch fresh data
      invalidateSimilarityCache();
    }
  } else if (!supabaseServiceRoleKey) {
    console.warn("Skipping item similarity refresh because SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  // --- Step 7: Return results to frontend --- 
  return {
    message: "Recommendations generated and saved successfully.",
    recommendationRecordId: newRecordId, // ID of the row created in the DB
    recommendations: topRecommendationsDetailed // Return the detailed recommendations
  };
}

// Use CommonJS exports for Node.js
module.exports = {
  generateRecommendations,
};