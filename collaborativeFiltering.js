// --- Item Similarity Cache & Fetching Logic ---
let simCache = null; // Simple in-memory cache for item similarity, managed locally

/**
 * Fetches the item similarity matrix from Supabase, caches it, 
 * and reshapes it for easy lookup.
 * @returns {Promise<object>} - The similarity matrix structured as { itemId: [ {id, sim}, ... ] }
 */
async function getItemSimilarity() {
  if (simCache) {
    console.log("Returning cached item similarity matrix (from collaborativeFiltering).");
    return simCache; // Return cached copy
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Supabase URL/Key missing in collaborativeFiltering. Cannot fetch similarities.");
    throw new Error("Supabase connection details missing.");
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("Fetching item similarity matrix from Supabase (within collaborativeFiltering)...", supabaseUrl);
  const { data, error } = await supabase
    .from('item_similarity')
    .select('item_id, neighbour_id, sim');

  if (error) {
    console.error("Error fetching item similarity (within collaborativeFiltering):", error);
    throw error; // Re-throw the error
  }

  // Reshape → { itemId: [ {id, sim}, … ] }
  console.log("Reshaping and caching item similarity matrix (within collaborativeFiltering).");
  simCache = data.reduce((acc, row) => {
    (acc[row.item_id] ??= []).push({ id: row.neighbour_id, sim: row.sim });
    return acc;
  }, {});

  return simCache;
}

/**
 * Invalidates the local item similarity cache.
 */
function invalidateSimilarityCache() {
  console.log("Invalidating item similarity cache (within collaborativeFiltering).");
  simCache = null;
}
// --- End Item Similarity ---

/**
 * Calculates collaborative filtering scores for destinations based on user likes and item similarities.
 *
 * @param {object} userPreferences - The user's preference profile, including destinationRatings.
 * @param {object[]} allDestinations - Array of all destination objects, used to iterate candidates.
 * @returns {Promise<object>} An object mapping destination IDs to their collaborative scores: { destId: score, ... }.
 */
// Make the function asynchronous
async function calculateCollaborativeScores(userPreferences, allDestinations) {

  // --- Fetch Item Similarity Data (now uses local function) ---
  let itemSimilarityData = {};
  try {
    // Fetch and cache the similarity matrix
    itemSimilarityData = await getItemSimilarity();
    console.log(`Successfully fetched/retrieved item similarity data for ${Object.keys(itemSimilarityData).length} items inside collaborativeFiltering.`);
  } catch (error) {
    console.error("Failed to get item similarity data inside collaborativeFiltering:", error);
    console.warn("Collaborative filtering will be disabled.");
    return {}; // Return empty scores if fetching failed
  }

  // If item similarity data is empty (e.g., DB table is empty or fetch failed silently)
  if (Object.keys(itemSimilarityData).length === 0) {
    console.warn("Item similarity data is empty. Cannot calculate collaborative scores.");
    return {};
  }

  // --- Extract Liked and Rated Destinations --- 
  const likedDestIds = [];
  const ratedDestIds = new Set(); // Keep track of all destinations rated by the user

  // Extract liked destination IDs and populate the set of all rated destinations
  if (userPreferences.destinationRatings) {
    for (const [destId, rating] of Object.entries(userPreferences.destinationRatings)) {
      ratedDestIds.add(destId);
      if (rating === 'like') {
        likedDestIds.push(destId);
      }
    }
  }

  // If the user hasn't liked any destinations, collaborative filtering cannot be applied.
  if (likedDestIds.length === 0) {
    console.log("No liked destinations found for user, skipping collaborative filtering.");
    return {}; // Return empty scores
  }

  console.log(`Calculating collaborative scores based on ${likedDestIds.length} liked destinations: [${likedDestIds.join(', ')}]`);

  // --- Calculate Scores --- 
  const collabScores = {};

  // Iterate through all candidate destinations
  for (const destination of allDestinations) {
    const candidateId = destination.id;

    // Skip destinations the user has already rated (liked or disliked)
    if (ratedDestIds.has(candidateId)) {
      continue;
    }

    let scoreNumerator = 0;
    let scoreDenominator = 0;

    // Iterate through the destinations the user LIKED
    for (const likedId of likedDestIds) {
      // Find the similarity between the liked item (likedId) and the candidate item (candidateId)
      // The data structure is { likedId: [ {id: neighbourId, sim: similarity}, ... ] }
      const neighboursOfLikedItem = itemSimilarityData[likedId] || [];
      const neighbourEntry = neighboursOfLikedItem.find(neighbour => neighbour.id === candidateId);
      const similarity = neighbourEntry ? neighbourEntry.sim : 0;

      if (similarity > 0) {
        // Standard collaborative filtering formula: sum(similarity * rating) / sum(similarity)
        // Since our ratings are implicitly 1 (liked), this simplifies:
        scoreNumerator += similarity; // Add the similarity (similarity * 1)
        scoreDenominator += similarity; // Add the similarity for the denominator
      }
    }

    // Calculate the final score for the candidate
    // Avoid division by zero
    const finalScore = scoreDenominator > 0 ? scoreNumerator / scoreDenominator : 0;

    if (finalScore > 0) {
      collabScores[candidateId] = finalScore;
      // Optional: Log detailed scores per candidate for debugging
      // console.log(`  Collab score for ${candidateId}: ${finalScore.toFixed(4)}`);
    }
  }

  console.log(`Calculated collaborative scores for ${Object.keys(collabScores).length} destinations.`);
  return collabScores;
}

// Use CommonJS exports for Node.js
module.exports = {
  calculateCollaborativeScores,
  invalidateSimilarityCache // Export the invalidation function
}; 