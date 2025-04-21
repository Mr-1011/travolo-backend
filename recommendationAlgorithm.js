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
 * Maps duration labels to approximate number of days.
 * @param {string} durationLabel - The duration label ('weekend', 'short trip', etc.).
 * @returns {number | null} The approximate number of days or null if no match.
 */
function mapDurationToDays(durationLabel) {
  if (!durationLabel) return null;
  const lowerCaseDuration = durationLabel.toLowerCase();
  if (lowerCaseDuration === 'weekend') return 2;
  if (lowerCaseDuration === 'short' || lowerCaseDuration === 'short trip') return 4;
  if (lowerCaseDuration === 'one week') return 7;
  if (lowerCaseDuration === 'long' || lowerCaseDuration === 'long trip') return 14;
  return null;
}

/**
 * Safely gets the average temperature for a given month from destination data.
 * @param {object} destination - The destination object.
 * @param {number} monthIndex - The 1-based month index (1-12).
 * @returns {number | null} The average temperature or null if not found.
 */
function getAverageTemperature(destination, monthIndex) {
  return destination?.avg_temp_monthly?.[monthIndex]?.avg ?? null;
}

/**
 * Calculates the midpoint of a numerical range.
 * @param {[number, number]} range - The range [min, max].
 * @returns {number} The midpoint.
 */
function calculateMidpoint(range) {
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
 * @returns {object[]} Array of scored destinations sorted by hybridScore, including id and matchPercentage.
 */
function calculateRecommendations(userPreferences, allDestinations) {
  if (!userPreferences || !allDestinations || allDestinations.length === 0) {
    return [];
  }

  // --- Prepare User Data ---
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
  ].map(v => v ?? 0); // Default missing themes to 0 for calculation

  const userTravelMonths = userPreferences.travelMonths?.map(m => m.toLowerCase()) || [];
  const userTravelBudgets = userPreferences.travelBudget?.map(b => b.toLowerCase()) || [];
  const userPreferredRegions = userPreferences.preferredRegions?.map(r => r.toLowerCase()) || [];
  const userTravelDurations = userPreferences.travelDuration?.map(d => d.toLowerCase()) || [];
  const hasOrigin = userPreferences.originLocation?.lat != null && userPreferences.originLocation?.lon != null;
  const hasRatings = userPreferences.destinationRatings && Object.keys(userPreferences.destinationRatings).length > 0;

  // --- Calculate Collaborative Scores (V1 returns {}) ---
  const collabScores = calculateCollaborativeScores(userPreferences, allDestinations);

  // --- Score Each Destination ---
  const allScoredDestinations = allDestinations.map(d => {
    const scores = {
      id: d.id,
      // Initialize scores to null/undefined? Let's compute and only add if valid.
    };
    const destThemeVector = [
      d.culture, d.adventure, d.nature, d.beaches,
      d.nightlife, d.cuisine, d.wellness, d.urban, d.seclusion
    ].map(v => v ?? 0); // Also default missing themes to 0

    // 1. Theme Score
    scores.themeScore = cosineSimilarity(userThemeVector, destThemeVector);

    // 2. Climate Score
    if (userTravelMonths.length > 0 && userPreferences.temperatureRange) {
      const monthlyClimateScores = [];
      const userMidTemp = calculateMidpoint(userPreferences.temperatureRange);
      userTravelMonths.forEach(monthName => {
        const monthIndex = getMonthIndex(monthName);
        if (monthIndex) {
          const avgTemp = getAverageTemperature(d, monthIndex);
          if (avgTemp !== null) {
            const delta = Math.abs(avgTemp - userMidTemp);
            const scoreForMonth = Math.max(0, 1 - delta / 15);
            monthlyClimateScores.push(scoreForMonth);
          }
        }
      });
      if (monthlyClimateScores.length > 0) {
        scores.climateScore = monthlyClimateScores.reduce((a, b) => a + b, 0) / monthlyClimateScores.length;
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
          const minDistance = Math.min(...userLevels.map(u => Math.abs(u - destLevelNum)));
          scores.budgetScore = Math.max(0, 1 - 0.5 * minDistance); // Ensure score is not negative
        }
      }
    }

    // 4. Region Score
    // Check explicitly for 'anywhere' wildcard? Assuming not for now.
    if (userPreferredRegions.length > 0 && d.region) {
      scores.regionScore = userPreferredRegions.includes(d.region.toLowerCase()) ? 1 : 0.3;
    }

    // 5. Distance + Duration Score
    if (hasOrigin && userTravelDurations.length > 0 && d.latitude != null && d.longitude != null) {
      const km = haversineDistance(
        { lat: userPreferences.originLocation.lat, lon: userPreferences.originLocation.lon },
        { lat: d.latitude, lon: d.longitude }
      );
      const durationDistanceScores = [];
      const idealDurationsLower = d.ideal_durations?.map(dur => dur.toLowerCase()) || [];

      userTravelDurations.forEach(durationLabel => {
        const durationDays = mapDurationToDays(durationLabel);
        if (durationDays !== null) {
          const threshold = 750 * durationDays;
          const baseDistanceScore = threshold > 0 ? 1 / (1 + Math.pow(km / threshold, 2)) : (km === 0 ? 1 : 0);
          const durationMatchMultiplier = idealDurationsLower.includes(durationLabel) ? 1 : 0.7;
          const scoreForDuration = baseDistanceScore * durationMatchMultiplier;
          durationDistanceScores.push(scoreForDuration);
        }
      });

      if (durationDistanceScores.length > 0) {
        scores.distanceScore = Math.max(...durationDistanceScores);
      }
    }

    // 6. Content Blend
    const weights = { theme: 0.45, climate: 0.15, budget: 0.10, region: 0.10, distance: 0.20 };
    let weightedSum = 0;
    let weightSum = 0;
    for (const key in weights) {
      const scoreKey = `${key}Score`;
      if (scores[scoreKey] !== undefined && scores[scoreKey] !== null) {
        weightedSum += weights[key] * scores[scoreKey];
        weightSum += weights[key];
      }
    }
    scores.contentScore = (weightSum > 0) ? weightedSum / weightSum : 0;

    // 7. Collaborative Score
    scores.collabScore = collabScores[d.id] ?? 0;

    // 8. Hybrid Score
    const contentWeight = hasRatings ? 0.7 : 1.0;
    const collabWeight = hasRatings ? 0.3 : 0.0;
    scores.hybridScore = contentWeight * scores.contentScore + collabWeight * scores.collabScore;

    return scores;
  });

  // --- Post-Processing: Rank and Normalize ---
  const maxHybridScore = Math.max(0.0001, ...allScoredDestinations.map(d => d.hybridScore)); // Avoid division by zero, ensure slight positive

  const sortedDestinations = allScoredDestinations
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, 3) // Take top 3
    .map(d => ({
      ...d,
      matchPercentage: Math.round((100 * d.hybridScore) / maxHybridScore)
    }));

  return sortedDestinations;
}

// Use CommonJS exports for Node.js
module.exports = {
  calculateRecommendations,
  // Export helpers if they might be useful elsewhere, otherwise keep them internal
  // cosineSimilarity, 
  // haversineDistance,
  // ... etc
};
