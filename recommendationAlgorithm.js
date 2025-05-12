/**
 * @fileoverview Main recommendation algorithm implementation for Travolo 
 * 
 * This file contains the core logic for generating destination recommendations based on:
 * 1. User preferences (travel themes, climate, budget, etc.)
 * 2. User feedback on previously viewed destinations
 * 3. Hybrid filtering (combining content-based and collaborative filtering)
 * 
 * The algorithm adjusts user preferences based on feedback and generates
 * ranked destination recommendations with confidence scores.
 */

// ====================
// Imports & Dependencies
// ====================
const { calculateCollaborativeScores } = require('./collaborativeFiltering');
const { calculateContentScores } = require('./contentFiltering');

// ====================
// Helper Functions
// ====================

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

/**
 * Calculates recommendation scores for all destinations based on user preferences.
 * @param {object} userPreferences - The user's preference profile (e.g., from ExampleProfile.json).
 * @param {object[]} allDestinations - Array of all destination objects (e.g., from ExampleDestination.json structure).
 * @returns {object[]} Array of scored destinations sorted by hybridScore, including id and confidence.
 */
async function calculateRecommendations(userPreferences, allDestinations) {
  if (!userPreferences || !allDestinations || allDestinations.length === 0) {
    return [];
  }

  // --- Step 1: Process User Feedback (Destination Ratings) ---
  // Extract features from destinations the user has rated previously
  console.log('--- Step 1: Processing User Feedback (Destination Ratings) ---');
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
  console.log('--- Finished Step 1 ---');

  // --- Step 2: Calculate Feedback Adjustment Vector ---
  // Average feature vectors from liked and disliked destinations 
  // and compute their difference to determine how to adjust preferences
  console.log('--- Step 2: Calculating Feedback Adjustment Vector ---');

  // Use the helper function, default to zero vector if no likes/dislikes
  const vec_like = averageVector(likedDestinationFeatures) || Array(9).fill(0);
  const vec_dislike = averageVector(dislikedDestinationFeatures) || Array(9).fill(0);

  // Calculate delta vector
  const delta_vec = vec_like.map((likeVal, i) => likeVal - vec_dislike[i]);

  console.log(`Average Liked Vector   (vec_like): [${vec_like.map(v => v.toFixed(3)).join(', ')}]`);
  console.log(`Average Disliked Vector(vec_dislike): [${vec_dislike.map(v => v.toFixed(3)).join(', ')}]`);
  console.log(`Delta Vector           (delta_vec): [${delta_vec.map(v => v.toFixed(3)).join(', ')}]`);

  console.log('--- Finished Step 2 ---');

  // --- Step 3: Normalize Adjustments and Prepare Analysis Object ---
  // Convert raw delta scores to discrete adjustment values (-1, 0, 1) for better interpretability
  console.log('--- Step 3: Normalizing Adjustments and Preparing Analysis ---');

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

  console.log('--- Finished Step 3 ---');


  // --- Step 4: Apply Adjustments to User Preferences ---
  // Modify the original user preference values based on feedback analysis
  console.log('--- Step 4: Applying Adjustments to User Preferences ---');

  // Apply Destination Feedback Adjustments (if analysis exists)
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
  console.log('--- Finished Step 4 ---');

  // --- Step 5: Prepare User Data Vectors and Parameters ---
  // Create the theme vector that will be used for content filtering
  console.log('--- Step 5: Preparing User Data ---');

  // Define User Theme Vector (Now uses potentially updated preferences)
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

  // Other user preferences needed for scoring functions are accessed directly or passed
  const hasRatings = userPreferences.destinationRatings && Object.keys(userPreferences.destinationRatings).length > 0;

  console.log('--- Finished Step 5 ---');

  // --- Step 6: Calculate Collaborative Scores (Using Imported Function) ---
  // Get collaborative filtering scores based on similarities between destinations
  console.log('--- Step 6: Calculating Collaborative Scores ---');

  // Fetch collaborative scores from the collaborativeFiltering module
  const collabScores = await calculateCollaborativeScores(userPreferences, allDestinations);
  console.log('--- Finished Step 6 ---');

  // --- Step 7: Calculate Content Scores (Using Imported Function) ---
  // Get content-based scores using feature similarity
  console.log('--- Step 7: Calculating Content Scores ---');

  // Get content scores from the contentFiltering module
  const contentScoresMap = calculateContentScores(userPreferences, allDestinations, userThemeVector);
  console.log('--- Finished Step 7 ---');


  // --- Step 8: Combine Scores, Post-Process, Rank, Map Confidence ---
  // Blend content and collaborative scores to create final recommendations
  console.log('--- Step 8: Combining Scores and Post-Processing Results ---');

  // Combine content and collaborative scores, calculate hybrid score
  const combinedScores = allDestinations.map(d => {
    const destId = d.id;
    const contentData = contentScoresMap[destId] ?? {}; // Get content scores for this ID
    const collabScore = collabScores[destId] ?? 0;     // Get collab score for this ID

    const contentScore = contentData.contentScore ?? 0; // Default to 0 if no content score

    // Calculate Hybrid Score
    const contentWeight = hasRatings ? 0.7 : 1.0;
    const collabWeight = hasRatings ? 0.3 : 0.0;
    const hybridScore = contentWeight * contentScore + collabWeight * collabScore;

    // Return a combined object with all scores for sorting and logging
    return {
      ...contentData, // Includes id, themeScore, climateScore, etc., contentScore
      collabScore: collabScore,
      hybridScore: hybridScore
    };
  });


  // Sort by hybrid score first, then take top N, map confidence
  const sortedDestinations = combinedScores
    .sort((a, b) => (b.hybridScore ?? 0) - (a.hybridScore ?? 0)) // Handle potential undefined/null scores
    .slice(0, 3) // Take top 3
    .map((d, index) => { // Add index for logging rank and map confidence
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
      return {
        id: d.id,
        confidence: confidence
      };
    });

  console.log('--- Finished Step 8 ---');
  // RETURN JUST the recommendations array
  return sortedDestinations; // Return only the recommendations array
}

// ==========================
// Exports
// ==========================
// Use CommonJS exports for Node.js
module.exports = {
  calculateRecommendations,
  mapScoreToConfidence,
  averageVector
};
