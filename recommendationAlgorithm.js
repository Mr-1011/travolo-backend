/**
 * recommendationAlgorithm.js
 * 
 * Calculates destination recommendations based on user preferences and destination data.
 */

// ====================
// Helper Functions
// ====================

/**
 * Calculates the cosine similarity between two vectors.
 * @param {number[]} vecA - The first vector.
 * @param {number[]} vecB - The second vector.
 * @returns {number} The cosine similarity (0 to 1), or 0 if either vector is zero or dimensions mismatch.
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const valA = vecA[i] ?? 0; // Default null/undefined to 0
    const valB = vecB[i] ?? 0; // Default null/undefined to 0
    dotProduct += valA * valB;
    magnitudeA += valA * valA;
    magnitudeB += valB * valB;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0; // Prevent division by zero
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Calculates the Haversine distance between two points on the Earth.
 * @param {{lat: number, lon: number}} coords1 - First coordinates.
 * @param {{lat: number, lon: number}} coords2 - Second coordinates.
 * @returns {number} The distance in kilometers.
 */
function haversineDistance(coords1, coords2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (coords2.lat - coords1.lat) * Math.PI / 180;
  const dLon = (coords2.lon - coords1.lon) * Math.PI / 180;
  const lat1 = coords1.lat * Math.PI / 180;
  const lat2 = coords2.lat * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Maps budget level strings to numerical values.
 * @param {string} budgetString - The budget level ('Budget', 'Mid-range', 'Luxury').
 * @returns {number | null} The numerical value (1, 2, 3) or null if no match.
 */
function mapBudgetToNumber(budgetString) {
  if (!budgetString) return null;
  const lowerCaseBudget = budgetString.toLowerCase();
  if (lowerCaseBudget === 'budget') return 1;
  if (lowerCaseBudget === 'mid-range') return 2;
  if (lowerCaseBudget === 'luxury') return 3;
  return null;
}

/**
 * Maps duration labels (from UI) to approximate number of days for threshold calculation.
 * @param {string} durationLabel - The duration label ('Day trip', 'Weekend', etc.).
 * @returns {number | null} The approximate number of days or null if no match.
 */
function mapDurationToDays(durationLabel) {
  if (!durationLabel) return null;
  // Normalize to handle variations like 'Day trip' vs 'day-trip' and case
  const lowerCaseDuration = durationLabel.toLowerCase().replace(' ', '-');
  if (lowerCaseDuration === 'day-trip') return 1;
  if (lowerCaseDuration === 'weekend') return 2; // Using 2 days for weekend threshold
  if (lowerCaseDuration === 'short-trip') return 4; // Using 4 days for short trip threshold
  if (lowerCaseDuration === 'one-week') return 7; // Using 7 days for one week threshold
  if (lowerCaseDuration === 'long-trip') return 10; // Using 10 days as the start for long trip threshold
  return null;
}

/**
 * Safely gets the average temperature for a given month from destination data.
 * @param {object} destination - The destination object.
 * @param {number} monthIndex - The 1-based month index (1-12).
 * @returns {number | null} The average temperature or null if not found.
 */
function getAverageTemperature(destination, monthIndex) {
  // Ensure monthIndex is treated as a string key if avg_temp_monthly keys are strings '1', '2', etc.
  // Or ensure avg_temp_monthly uses numerical keys if monthIndex is number. Assuming string keys based on JSON example.
  const monthKey = String(monthIndex);
  return destination?.avg_temp_monthly?.[monthKey]?.avg ?? null;
}

/**
 * Calculates the midpoint of a numerical range.
 * @param {[number, number]} range - The range [min, max].
 * @returns {number} The midpoint.
 */
function calculateMidpoint(range) {
  // Ensure range exists and has two numbers
  if (!Array.isArray(range) || range.length !== 2 || typeof range[0] !== 'number' || typeof range[1] !== 'number') {
    // Handle invalid range, maybe return a default or throw error?
    // Returning null might be safer if climate score relies on it.
    return null;
  }
  return (range[0] + range[1]) / 2;
}

/**
 * Gets the 1-based index for a month name.
 * @param {string} monthName - The full month name (e.g., 'January').
 * @returns {number | null} The month index (1-12) or null if invalid.
 */
function getMonthIndex(monthName) {
  if (!monthName) return null;
  const lowerCaseMonth = monthName.toLowerCase();
  const months = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  };
  return months[lowerCaseMonth] ?? null;
}

// ==========================
// NEW HELPER FUNCTION
// ==========================

/**
 * Calculates the element-wise average of an array of vectors.
 * @param {number[][]} vectors - An array of vectors (arrays of numbers).
 * @returns {number[]} The average vector, or null if input is empty or invalid.
 */
function averageVector(vectors) {
  if (!vectors || vectors.length === 0 || !Array.isArray(vectors[0])) {
    return null; // Or return a zero vector of appropriate length?
  }
  const numDimensions = vectors[0].length;
  const sumVector = Array(numDimensions).fill(0);

  for (const vector of vectors) {
    if (vector.length !== numDimensions) {
      console.warn("Skipping vector with mismatched dimensions in averageVector.");
      continue; // Skip vectors with wrong dimensions
    }
    for (let i = 0; i < numDimensions; i++) {
      sumVector[i] += vector[i] ?? 0; // Treat null/undefined as 0
    }
  }

  return sumVector.map(sum => sum / vectors.length);
}

/**
 * Calculates a climate score based on a Gaussian (bell curve) distribution.
 * @param {number} avgTemp - The average temperature of the destination month.
 * @param {number} desiredMid - The midpoint of the user's desired temperature range.
 * @param {number} [sigma=5] - Controls the steepness of the curve. Smaller sigma = steeper drop-off.
 * @returns {number} The climate score (0 to 1).
 */
function gaussianClimateScore(avgTemp, desiredMid, sigma = 5) {
  if (avgTemp === null || desiredMid === null) return 0; // Handle null inputs
  const delta = avgTemp - desiredMid;
  // Clamp the score between 0 and 1, although exp should naturally be in this range for real inputs.
  return Math.max(0, Math.min(1, Math.exp(-(delta * delta) / (2 * sigma * sigma))));
}

/**
 * Maps an absolute hybrid score (0-1) to a confidence percentage (0-100).
 * @param {number} score - The hybrid score.
 * @returns {number} The confidence percentage.
 */
function mapScoreToConfidence(score) {
  if (score === null || score === undefined || isNaN(score)) return 0;

  const s = Math.max(0, Math.min(1, score)); // Clamp score to [0, 1]

  if (s >= 0.80) {
    // Scale 0.80-1.00 to 90-100
    return Math.round(90 + 10 * (s - 0.80) / 0.20);
  } else if (s >= 0.60) {
    // Scale 0.60-0.79... to 70-89
    return Math.round(70 + 19 * (s - 0.60) / 0.20); // Use 19 to avoid overlap with 90
  } else if (s >= 0.40) {
    // Scale 0.40-0.59... to 50-69
    return Math.round(50 + 19 * (s - 0.40) / 0.20); // Use 19 to avoid overlap with 70
  } else {
    // Scale 0.00-0.39... to 0-49
    return Math.round(49 * s / 0.40); // Use 49 to avoid overlap with 50
  }
}

// ==========================
// Main Recommendation Logic
// ==========================

// TODO: Implement calculateCollaborativeScores (V1 returns {})
function calculateCollaborativeScores(userPreferences, allDestinations) {
  // V1: No collaborative filtering yet
  return {};
}

/**
 * Calculates recommendation scores for all destinations based on user preferences.
 * @param {object} userPreferences - The user's preference profile (e.g., from ExampleProfile.json).
 * @param {object[]} allDestinations - Array of all destination objects (e.g., from ExampleDestination.json structure).
 * @returns {object[]} Array of scored destinations sorted by hybridScore, including id and confidence.
 */
function calculateRecommendations(userPreferences, allDestinations) {
  if (!userPreferences || !allDestinations || allDestinations.length === 0) {
    return [];
  }

  // <<< START NEW CODE - Finding Liked/Disliked Destination Features >>>
  console.log('--- Finding Liked/Disliked Destination Features ---');
  const likedDestinationFeatures = [];
  const dislikedDestinationFeatures = [];

  if (userPreferences.destinationRatings && Object.keys(userPreferences.destinationRatings).length > 0) {
    for (const [destId, rating] of Object.entries(userPreferences.destinationRatings)) {
      const destination = allDestinations.find(d => d.id === destId);
      if (destination) {
        const features = [
          destination.culture ?? 0,
          destination.adventure ?? 0,
          destination.nature ?? 0,
          destination.beaches ?? 0,
          destination.nightlife ?? 0,
          destination.cuisine ?? 0,
          destination.wellness ?? 0,
          destination.urban ?? 0,
          destination.seclusion ?? 0
        ];
        if (rating === 'like') {
          console.log(`Liked Destination ID: ${destId}, Features: [${features.join(', ')}]`);
          likedDestinationFeatures.push(features);
        } else if (rating === 'dislike') {
          console.log(`Disliked Destination ID: ${destId}, Features: [${features.join(', ')}]`);
          dislikedDestinationFeatures.push(features);
        }
      } else {
        console.log(`Warning: Destination ID ${destId} from ratings not found in allDestinations.`);
      }
    }
  } else {
    console.log('No destination ratings found in user preferences.');
  }
  console.log('--- Finished Finding Features ---');
  // <<< END NEW CODE >>>

  // <<< START NEW CODE - Calculate Average and Delta Vectors >>>
  console.log('--- Calculating Feedback Adjustment Vectors ---');

  // Use the helper function, default to zero vector if no likes/dislikes
  const vec_like = averageVector(likedDestinationFeatures) || Array(9).fill(0);
  const vec_dislike = averageVector(dislikedDestinationFeatures) || Array(9).fill(0);

  // Calculate delta vector
  const delta_vec = vec_like.map((likeVal, i) => likeVal - vec_dislike[i]);

  console.log(`Average Liked Vector   (vec_like): [${vec_like.map(v => v.toFixed(3)).join(', ')}]`);
  console.log(`Average Disliked Vector(vec_dislike): [${vec_dislike.map(v => v.toFixed(3)).join(', ')}]`);
  console.log(`Delta Vector           (delta_vec): [${delta_vec.map(v => v.toFixed(3)).join(', ')}]`);

  console.log('--- Finished Calculating Adjustment Vectors ---');
  // <<< END NEW CODE >>>

  // <<< START NEW CODE - Normalize Delta and Prepare Analysis Object >>>
  console.log('--- Normalizing Delta and Preparing Analysis Object ---');

  // Apply the ceiling normalization based on user description
  const normalizedAdjustments = delta_vec.map(delta => {
    if (delta === 0) {
      return 0;
    } else if (delta > 0) {
      return Math.ceil(delta);
    } else { // delta < 0
      return -Math.ceil(Math.abs(delta));
    }
  });

  // Get the base user preferences vector BEFORE any adjustments (like photo analysis)
  const baseUserVector = [
    userPreferences.culture, userPreferences.adventure, userPreferences.nature,
    userPreferences.beaches, userPreferences.nightlife, userPreferences.cuisine,
    userPreferences.wellness, userPreferences.urban, userPreferences.seclusion
  ].map(v => v ?? 0); // Use 0 as default if preference is missing

  // Calculate the potential vector by applying normalized adjustments and clamping
  const potentialAdjustedVector = baseUserVector.map((baseVal, i) => {
    const adjusted = baseVal + normalizedAdjustments[i];
    return Math.max(1, Math.min(5, adjusted)); // Clamp between 1 and 5
  });

  // Generate a simple summary
  const themeNames = ['Culture', 'Adventure', 'Nature', 'Beaches', 'Nightlife', 'Cuisine', 'Wellness', 'Urban', 'Seclusion'];
  let summaryParts = [];
  normalizedAdjustments.forEach((adj, i) => {
    if (adj > 0) summaryParts.push(`increase ${themeNames[i]}`);
    if (adj < 0) summaryParts.push(`decrease ${themeNames[i]}`);
  });
  const analysisSummary = summaryParts.length > 0
    ? `Feedback analysis suggests: ${summaryParts.join(', ')}.`
    : "Feedback analysis suggests no significant adjustments.";

  // --- Create the simplified destination analysis object using NORMALIZED values --- 
  const normalized_destination_analysis = {};
  themeNames.forEach((name, index) => {
    // Use lowercase theme name as key, use the normalized adjustment value (0, 1, or -1)
    normalized_destination_analysis[name.toLowerCase()] = normalizedAdjustments[index];
  });

  // Directly add the analysis to the userPreferences object if ratings existed
  if ((likedDestinationFeatures && likedDestinationFeatures.length > 0) || (dislikedDestinationFeatures && dislikedDestinationFeatures.length > 0)) {
    userPreferences.destinationAnalysis = normalized_destination_analysis;
    console.log('Normalized Destination Analysis Object added to userPreferences:');
    console.log(JSON.stringify(normalized_destination_analysis, null, 2)); // Pretty print JSON
  } else {
    userPreferences.destinationAnalysis = null; // Ensure it's null if no analysis was done
    console.log('No ratings found, setting userPreferences.destinationAnalysis to null.');
  }

  console.log('--- Finished Normalizing and Preparing Analysis ---');
  // <<< END NEW CODE >>>


  // --- Prepare User Data ---
  // REMOVED: Initial userThemeVector definition moved after adjustments

  // --- Apply Destination Feedback Adjustments (if analysis exists) ---
  if (userPreferences.destinationAnalysis) {
    console.log("Applying destination feedback adjustments directly to userPreferences...");
    const themeKeysInOrder = ['culture', 'adventure', 'nature', 'beaches', 'nightlife', 'cuisine', 'wellness', 'urban', 'seclusion'];
    const originalVector = themeKeysInOrder.map(key => userPreferences[key] ?? 0);

    themeKeysInOrder.forEach((themeKey, index) => {
      const baseVal = userPreferences[themeKey] ?? 0;
      const adjustment = userPreferences.destinationAnalysis[themeKey] ?? 0;
      const adjusted = baseVal + adjustment;
      // Clamp the adjusted value (assuming preference scale is 1-5) and update userPreferences
      userPreferences[themeKey] = Math.max(1, Math.min(5, adjusted));
    });

    const updatedVector = themeKeysInOrder.map(key => userPreferences[key]);
    console.log(`Original Preferences Vector: [${originalVector.join(', ')}]`);
    console.log(`Updated Preferences Vector:  [${updatedVector.join(', ')}]`);
  } else {
    console.log("No destination feedback analysis found, using original user preferences.");
  }
  // --- End Adjustment ---

  // --- Define User Data (Now uses potentially updated preferences) ---
  const userThemeVector = [
    userPreferences.culture,
    userPreferences.adventure,
    userPreferences.nature,
    userPreferences.beaches,
    userPreferences.nightlife,
    userPreferences.cuisine,
    userPreferences.wellness,
    userPreferences.urban,
    userPreferences.seclusion
  ].map(v => v ?? 0); // Read the potentially modified values

  const userTravelMonths = userPreferences.travelMonths?.map(m => m.toLowerCase()) || [];
  const userTravelBudgets = userPreferences.travelBudget?.map(b => b.toLowerCase()) || [];
  const userPreferredRegions = userPreferences.preferredRegions?.map(r => r.toLowerCase()) || [];
  // Normalize user durations to match the keys used in mapDurationToDays and destination data normalization
  const userTravelDurations = userPreferences.travelDuration?.map(d => d.toLowerCase().replace(' ', '-')) || [];
  const hasOrigin = userPreferences.originLocation?.lat != null && userPreferences.originLocation?.lon != null;
  const hasRatings = userPreferences.destinationRatings && Object.keys(userPreferences.destinationRatings).length > 0;

  // --- Calculate Collaborative Scores (V1 returns {}) ---
  const collabScores = calculateCollaborativeScores(userPreferences, allDestinations);

  // --- Score Each Destination ---
  const allScoredDestinations = allDestinations.map(d => {
    const scores = {
      id: d.id,
      // Initialize scores
    };
    const destThemeVector = [
      d.culture, d.adventure, d.nature, d.beaches,
      d.nightlife, d.cuisine, d.wellness, d.urban, d.seclusion
    ].map(v => v ?? 0); // Also default missing themes to 0

    // 1. Theme Score
    // Uses the userThemeVector which now reflects the adjusted preferences
    scores.themeScore = cosineSimilarity(userThemeVector, destThemeVector);

    // 2. Climate Score
    if (userTravelMonths.length > 0 && userPreferences.temperatureRange) {
      const monthlyClimateScores = [];
      const userMidTemp = calculateMidpoint(userPreferences.temperatureRange);

      // Only proceed if userMidTemp is valid
      if (userMidTemp !== null) {
        userTravelMonths.forEach(monthName => {
          const monthIndex = getMonthIndex(monthName);
          if (monthIndex) {
            const avgTemp = getAverageTemperature(d, monthIndex);
            if (avgTemp !== null) {
              const scoreForMonth = gaussianClimateScore(avgTemp, userMidTemp, 5);
              monthlyClimateScores.push(scoreForMonth);
            }
          }
        });
        if (monthlyClimateScores.length > 0) {
          scores.climateScore = monthlyClimateScores.reduce((a, b) => a + b, 0) / monthlyClimateScores.length;
        } else {
          // If no valid monthly temps found for the selected months, maybe assign a default score or omit?
          // Omitting means weight gets redistributed. Assigning 0 might be too harsh. Let's omit for now.
        }
      }
    }

    // 3. Budget Score
    if (userTravelBudgets.length > 0) {
      const userLevels = userTravelBudgets.map(mapBudgetToNumber).filter(n => n !== null);
      const destLevelNum = mapBudgetToNumber(d.budget_level);

      if (userLevels.length > 0 && destLevelNum !== null) {
        if (userLevels.includes(destLevelNum)) {
          scores.budgetScore = 1;
        } else {
          // Penalize based on minimum distance between user's preferred levels and destination level
          const minDistance = Math.min(...userLevels.map(u => Math.abs(u - destLevelNum)));
          // Score decreases by 0.5 for each level difference (max diff 2 -> score 0)
          scores.budgetScore = Math.max(0, 1 - 0.5 * minDistance);
        }
      }
    }

    // 4. Region Score
    if (userPreferredRegions.length > 0 && d.region) {
      const regionMatch = userPreferredRegions.includes(d.region.toLowerCase());
      // Strong score for match, moderate penalty for mismatch if user specified regions
      scores.regionScore = regionMatch ? 1 : 0.3;
    } else if (d.region) {
      // If user has no region preference, this score component doesn't apply / is neutral.
      // It won't be added to the weighted sum later.
    }


    // 5a. Duration Match Score
    // Normalize destination durations similarly to user durations
    const destIdealDurations = d.ideal_durations?.map(dur => dur.toLowerCase().replace(' ', '-')) || [];
    if (userTravelDurations.length > 0) {
      if (destIdealDurations.length > 0) {
        const userDurationsSet = new Set(userTravelDurations);
        const intersection = destIdealDurations.filter(dur => userDurationsSet.has(dur));
        // Score is 1 if there's any overlap, 0.5 if no overlap but both have data
        scores.durationMatchScore = intersection.length > 0 ? 1 : 0.5;
      } else {
        // Destination has no ideal duration data, give a neutral score?
        scores.durationMatchScore = 0.7;
      }
    } else if (destIdealDurations.length > 0) {
      // User didn't specify duration, destination has data. Neutral score.
      scores.durationMatchScore = 0.8;
    } // If neither has data, score is omitted.


    // 5b. Distance Score (with duration penalty)
    if (hasOrigin && d.latitude != null && d.longitude != null) {
      const km = haversineDistance(
        { lat: userPreferences.originLocation.lat, lon: userPreferences.originLocation.lon },
        { lat: d.latitude, lon: d.longitude }
      );

      // Base score: decays with distance. 1/(1 + (km/scale)^2). Scale=2000km -> 0.5 score at 2000km.
      let baseDistanceScore = 1 / (1 + Math.pow(km / 2000, 2));
      let penaltyMultiplier = 1;

      // Apply penalty only if user specified durations
      if (userTravelDurations.length > 0) {
        const userDays = userTravelDurations.map(mapDurationToDays).filter(days => days !== null);
        if (userDays.length > 0) {
          const minUserDays = Math.min(...userDays);

          // Define thresholds based on mapped days (adjust as needed)
          const thresholds = {
            1: 500,    // Day trip max km
            2: 1500,   // Weekend max km
            4: 3000,   // Short trip max km
            7: 6000,   // One week max km
            10: 15000, // Long trip max km (using 10 from mapDurationToDays)
          };
          const relevantThreshold = thresholds[minUserDays] ?? thresholds[10];

          if (km > relevantThreshold && relevantThreshold > 0) {
            // Penalty: score reduces proportionally to how much threshold is exceeded.
            // Multiplier is clamped between 0.1 and 1.
            penaltyMultiplier = Math.max(0.1, relevantThreshold / km); // e.g., km=2*threshold -> multiplier=0.5
          }
        }
      }
      scores.distanceScore = baseDistanceScore * penaltyMultiplier;
    }

    // 6. Content Blend
    const weights = { theme: 0.35, climate: 0.20, budget: 0.10, region: 0.20, durationMatch: 0.10, distance: 0.05 };
    let weightedSum = 0;
    let weightSum = 0;

    for (const key in weights) {
      const scoreKey = `${key}Score`;
      // Check score exists and is a valid number before including in weighted average
      if (scores[scoreKey] !== undefined && scores[scoreKey] !== null && typeof scores[scoreKey] === 'number' && !isNaN(scores[scoreKey])) {
        weightedSum += weights[key] * scores[scoreKey];
        weightSum += weights[key];
      }
    }
    // Normalize the score based on the weights of the factors that were actually present
    scores.contentScore = (weightSum > 0) ? weightedSum / weightSum : 0;


    // 7. Collaborative Score
    scores.collabScore = collabScores[d.id] ?? 0; // Default to 0 if no collab score

    // 8. Hybrid Score
    const contentWeight = hasRatings ? 0.7 : 1.0; // More weight on content if no ratings exist
    const collabWeight = hasRatings ? 0.3 : 0.0; // Collab only counts if ratings exist
    scores.hybridScore = contentWeight * scores.contentScore + collabWeight * scores.collabScore;


    return scores;
  });

  // --- Post-Processing: Rank and Map to Confidence ---
  // Sort by hybrid score first
  const sortedDestinations = allScoredDestinations
    .sort((a, b) => (b.hybridScore ?? 0) - (a.hybridScore ?? 0)) // Handle potential undefined/null scores
    .slice(0, 3) // Take top 3
    .map((d, index) => { // Add index for logging rank
      const confidence = mapScoreToConfidence(d.hybridScore);

      // <<< START DEBUG LOGGING >>>
      console.log(`--- Recommendation Rank ${index + 1}: ID ${d.id} ---`);
      console.log(`  Theme Score:       ${d.themeScore?.toFixed(3) ?? 'N/A'}`);
      console.log(`  Climate Score:     ${d.climateScore?.toFixed(3) ?? 'N/A'}`);
      console.log(`  Budget Score:      ${d.budgetScore?.toFixed(3) ?? 'N/A'}`);
      console.log(`  Region Score:      ${d.regionScore?.toFixed(3) ?? 'N/A'}`);
      console.log(`  Duration Match:    ${d.durationMatchScore?.toFixed(3) ?? 'N/A'}`);
      console.log(`  Distance Score:    ${d.distanceScore?.toFixed(3) ?? 'N/A'}`);
      console.log(`  ------------------------------------`);
      console.log(`  Content Score:     ${d.contentScore?.toFixed(3) ?? 'N/A'}`);
      console.log(`  Collab Score:      ${d.collabScore?.toFixed(3) ?? 'N/A'}`);
      console.log(`  ------------------------------------`);
      console.log(`  Hybrid Score:      ${d.hybridScore?.toFixed(3) ?? 'N/A'}`);
      console.log(`  Confidence (%):    ${confidence}`);
      console.log(`--- End Rank ${index + 1} ---`);
      // <<< END DEBUG LOGGING >>>

      // Return the original expected structure (id and calculated confidence)
      // If your service expects the full score object 'd', return that instead.
      // Assuming it expects { id: ..., confidence: ... }
      return {
        id: d.id,
        confidence: confidence
      };
    });

  // RETURN JUST the recommendations array
  return sortedDestinations; // Return only the recommendations array
}

// Use CommonJS exports for Node.js
module.exports = {
  calculateRecommendations,
  cosineSimilarity,
  haversineDistance,
  mapBudgetToNumber,
  mapDurationToDays,
  getAverageTemperature,
  calculateMidpoint,
  getMonthIndex,
  gaussianClimateScore,
  mapScoreToConfidence,
  averageVector
};
