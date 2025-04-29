/**
 * Calculates collaborative filtering scores for destinations based on user likes and item similarities.
 *
 * @param {object} userPreferences - The user's preference profile, including destinationRatings.
 * @param {object[]} allDestinations - Array of all destination objects, used to iterate candidates.
 * @param {object} itemSimilarityData - Pre-computed item-item similarities (e.g., loaded from itemSimilarity.json).
 *                                     Structure: { destId1: { destId2: similarity, ... }, ... }
 * @returns {object} An object mapping destination IDs to their collaborative scores: { destId: score, ... }.
 */
function calculateCollaborativeScores(userPreferences, allDestinations, itemSimilarityData) {
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

  // If item similarity data is missing or empty, cannot proceed.
  if (!itemSimilarityData || Object.keys(itemSimilarityData).length === 0) {
    console.warn("Item similarity data is missing or empty. Cannot calculate collaborative scores.");
    return {};
  }

  console.log(`Calculating collaborative scores based on ${likedDestIds.length} liked destinations: [${likedDestIds.join(', ')}]`);

  const collabScores = {};

  // Iterate through all candidate destinations
  for (const destination of allDestinations) {
    const candidateId = destination.id;

    // Skip destinations the user has already rated (liked or disliked)
    if (ratedDestIds.has(candidateId)) {
      continue;
    }

    let totalSimilarity = 0;
    let relevantLikedItemsCount = 0;

    // Calculate average similarity between the candidate and the user's liked items
    for (const likedId of likedDestIds) {
      // Look up similarity, checking both orders as the matrix might be sparse/symmetric
      // Ensure likedId and candidateId exist as keys before accessing nested properties
      const sim = itemSimilarityData[candidateId]?.[likedId] ?? itemSimilarityData[likedId]?.[candidateId] ?? 0;

      // Only consider non-zero similarities in the average
      if (sim > 0) {
        totalSimilarity += sim;
        relevantLikedItemsCount++;
      }
    }

    // Calculate the average similarity. If no similar items found among liked ones, score is 0.
    const averageSimilarity = relevantLikedItemsCount > 0 ? totalSimilarity / relevantLikedItemsCount : 0;

    if (averageSimilarity > 0) {
      collabScores[candidateId] = averageSimilarity;
      // Optional: Log detailed scores per candidate for debugging
      // console.log(`  Collab score for ${candidateId}: ${averageSimilarity.toFixed(4)} (based on ${relevantLikedItemsCount} similar liked items)`);
    }
    // We store scores even if 0, though often these might be filtered later.
    // Or, only store > 0 scores: if (averageSimilarity > 0) { collabScores[candidateId] = averageSimilarity; }
  }

  console.log(`Calculated collaborative scores for ${Object.keys(collabScores).length} destinations.`);
  return collabScores;
}

// Use CommonJS exports for Node.js
module.exports = {
  calculateCollaborativeScores
}; 