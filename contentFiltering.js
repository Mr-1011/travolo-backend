/**
 * @fileoverview Content-based filtering implementation for the Travolo recommendation engine
 * 
 * This module provides content-based recommendation functionality by analyzing the
 * similarity between user preferences and destination attributes. It calculates
 * various scores (theme similarity, climate match, budget, etc.) and combines them
 * into a final content score.
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

  const budgetMap = {
    'budget': 1,
    'mid-range': 2,
    'luxury': 3
  };

  return budgetMap[lowerCaseBudget] || null;
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

  const durationMap = {
    'day-trip': 1,
    'weekend': 2,       // Using 2 days for weekend threshold
    'short-trip': 4,    // Using 4 days for short trip threshold
    'one-week': 7,      // Using 7 days for one week threshold
    'long-trip': 10     // Using 10 days as the start for long trip threshold
  };

  return durationMap[lowerCaseDuration] || null;
}

/**
 * Safely gets the average temperature for a given month from destination data.
 * @param {object} destination - The destination object.
 * @param {number} monthIndex - The 1-based month index (1-12).
 * @returns {number | null} The average temperature or null if not found.
 */
function getAverageTemperature(destination, monthIndex) {
  // Ensure monthIndex is treated as a string key if avg_temp_monthly keys are strings '1', '2', etc.
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
  if (!Array.isArray(range) || range.length !== 2 ||
    typeof range[0] !== 'number' || typeof range[1] !== 'number') {
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


// ==========================
// Content Scoring Logic
// ==========================

/**
 * Calculates content-based recommendation scores for all destinations.
 * @param {object} userPreferences - The user's preference profile.
 * @param {object[]} allDestinations - Array of all destination objects.
 * @param {number[]} userThemeVector - The user's theme preference vector (potentially adjusted).
 * @returns {object} A map where keys are destination IDs and values are objects containing detailed content scores.
 *                   Example: { destId1: { id: destId1, themeScore: ..., climateScore: ..., contentScore: ... }, ... }
 */
function calculateContentScores(userPreferences, allDestinations, userThemeVector) {
  const contentScoresMap = {};

  // Pre-process user preferences for efficiency
  const userTravelMonths = userPreferences.travelMonths?.map(m => m.toLowerCase()) || [];
  const userTravelBudgets = userPreferences.travelBudget?.map(b => b.toLowerCase()) || [];
  const userPreferredRegions = userPreferences.preferredRegions?.map(r => r.toLowerCase()) || [];
  const userTravelDurations = userPreferences.travelDuration?.map(d => d.toLowerCase().replace(' ', '-')) || [];
  const hasOrigin = userPreferences.originLocation?.lat != null && userPreferences.originLocation?.lon != null;

  // Define scoring weights for different factors
  const weights = {
    theme: 0.35,
    climate: 0.15,
    budget: 0.10,
    region: 0.25,
    durationMatch: 0.10,
    distance: 0.05
  };

  // Calculate scores for each destination
  allDestinations.forEach(destination => {
    const scores = { id: destination.id }; // Initialize score object for this destination

    // 1. Theme Score - calculate similarity between user preferences and destination themes
    const destThemeVector = [
      destination.culture, destination.adventure, destination.nature, destination.beaches,
      destination.nightlife, destination.cuisine, destination.wellness, destination.urban, destination.seclusion
    ].map(v => v ?? 0);

    scores.themeScore = cosineSimilarity(userThemeVector, destThemeVector);

    // 2. Climate Score - check if destination temperatures match user's preferred range
    if (userTravelMonths.length > 0 && userPreferences.temperatureRange) {
      const monthlyClimateScores = [];
      const userMidTemp = calculateMidpoint(userPreferences.temperatureRange);
      if (userMidTemp !== null) {
        userTravelMonths.forEach(monthName => {
          const monthIndex = getMonthIndex(monthName);
          if (monthIndex) {
            const avgTemp = getAverageTemperature(destination, monthIndex);
            if (avgTemp !== null) {
              monthlyClimateScores.push(gaussianClimateScore(avgTemp, userMidTemp, 5));
            }
          }
        });
        if (monthlyClimateScores.length > 0) {
          scores.climateScore = monthlyClimateScores.reduce((a, b) => a + b, 0) / monthlyClimateScores.length;
        }
      }
    }

    // 3. Budget Score - determine if destination budget level matches user's budget preference
    if (userTravelBudgets.length > 0) {
      const userLevels = userTravelBudgets.map(mapBudgetToNumber).filter(n => n !== null);
      const destLevelNum = mapBudgetToNumber(destination.budget_level);
      if (userLevels.length > 0 && destLevelNum !== null) {
        if (userLevels.includes(destLevelNum)) {
          scores.budgetScore = 1;
        } else {
          const minDistance = Math.min(...userLevels.map(u => Math.abs(u - destLevelNum)));
          scores.budgetScore = Math.max(0, 1 - 0.5 * minDistance);
        }
      }
    }

    // 4. Region Score - check if destination region matches user's preferred regions
    if (userPreferredRegions.length > 0 && destination.region) {
      const regionMatch = userPreferredRegions.includes(destination.region.toLowerCase());
      scores.regionScore = regionMatch ? 1 : 0.3;
    }

    // 5a. Duration Match Score - check if destination's ideal durations match user preferences
    const destIdealDurations = destination.ideal_durations?.map(dur => dur.toLowerCase().replace(' ', '-')) || [];
    if (userTravelDurations.length > 0) {
      if (destIdealDurations.length > 0) {
        const userDurationsSet = new Set(userTravelDurations);
        const intersection = destIdealDurations.filter(dur => userDurationsSet.has(dur));
        scores.durationMatchScore = intersection.length > 0 ? 1 : 0.5;
      } else {
        scores.durationMatchScore = 0.7;
      }
    } else if (destIdealDurations.length > 0) {
      scores.durationMatchScore = 0.8;
    }

    // 5b. Distance Score - calculate based on haversine distance and apply penalties for short trips to far places
    if (hasOrigin && destination.latitude != null && destination.longitude != null) {
      const km = haversineDistance(
        { lat: userPreferences.originLocation.lat, lon: userPreferences.originLocation.lon },
        { lat: destination.latitude, lon: destination.longitude }
      );
      let baseDistanceScore = 1 / (1 + Math.pow(km / 2000, 2));
      let penaltyMultiplier = 1;

      // Apply duration-based distance penalties
      if (userTravelDurations.length > 0) {
        const userDays = userTravelDurations.map(mapDurationToDays).filter(days => days !== null);
        if (userDays.length > 0) {
          const minUserDays = Math.min(...userDays);
          const thresholds = { 1: 500, 2: 1500, 4: 3000, 7: 6000, 10: 15000 };
          const relevantThreshold = thresholds[minUserDays] ?? thresholds[10];
          if (km > relevantThreshold && relevantThreshold > 0) {
            penaltyMultiplier = Math.max(0.1, relevantThreshold / km);
          }
        }
      }
      scores.distanceScore = baseDistanceScore * penaltyMultiplier;
    }

    // 6. Content Blend - Create weighted average of all applicable scores
    let weightedSum = 0;
    let weightSum = 0;

    for (const key in weights) {
      const scoreKey = `${key}Score`;
      if (scores[scoreKey] !== undefined && scores[scoreKey] !== null &&
        typeof scores[scoreKey] === 'number' && !isNaN(scores[scoreKey])) {
        weightedSum += weights[key] * scores[scoreKey];
        weightSum += weights[key];
      }
    }

    scores.contentScore = (weightSum > 0) ? weightedSum / weightSum : 0;

    // Add the calculated scores for this destination to the map
    contentScoresMap[destination.id] = scores;
  });

  return contentScoresMap;
}

// ==========================
// Exports
// ==========================
module.exports = {
  calculateContentScores,
}; 