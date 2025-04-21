# Recommendation Algorithm Implementation Plan

This document outlines the steps to implement the destination recommendation algorithm in `recommendationAlgorithm.js`.

## 1. Setup and Data Fetching

-   **Import necessary libraries:** Potential libraries for math operations (if needed beyond standard JS Math).
-   **Fetch all destinations:** Use Supabase client (passed from `recommendationService.js`) to fetch all rows from the `destinations` table.
    ```javascript
    // Inside the main recommendation function
    const { data: allDestinations, error: fetchError } = await supabase.from('destinations').select('*');
    if (fetchError) {
        console.error("Error fetching destinations:", fetchError);
        // Handle error appropriately
        return [];
    }
    ```

## 2. Helper Functions

Implement the following helper functions within `recommendationAlgorithm.js` or a separate utility file. Standardize string comparisons (e.g., lowercase) where necessary (regions, budget levels, durations).

-   **`cosineSimilarity(vecA, vecB)`:**
    -   Takes two vectors (arrays of numbers).
    -   Calculates the dot product.
    -   Calculates the magnitude of each vector.
    -   Returns dot product / (magnitudeA * magnitudeB). Handle zero vectors (return 0 similarity).
-   **`haversineDistance(coords1, coords2)`:**
    -   Takes two coordinate pairs: `{lat: lat1, lon: lon1}` and `{lat: lat2, lon: lon2}`.
    -   Implements the Haversine formula to calculate the distance in kilometers.
-   **`mapBudgetToNumber(budgetString)`:**
    -   Maps 'budget' -> 1, 'mid-range' -> 2, 'luxury' -> 3 (case-insensitive). Returns null if no match.
-   **`mapDurationToDays(durationLabel)`:**
    -   Maps duration labels ('weekend' -> 2, 'short'/'short trip' -> 4, 'one week' -> 7, 'long'/'long trip' -> 14) to approximate day counts (case-insensitive). Returns null if no match.
-   **`getAverageTemperature(destination, monthIndex)`:**
    -   Takes a destination object and a 1-based month index (1-12).
    -   Accesses `destination.avg_temp_monthly[monthIndex].avg`. Returns null if data is missing for the month.
-   **`calculateMidpoint(range)`:**
    -   Takes a two-element array `[min, max]`.
    -   Returns `(min + max) / 2`.
-   **`getMonthIndex(monthName)`:**
    -   Maps month names ('January', 'February', ..., 'December') to 1-based indices (1-12) (case-insensitive). Returns null if no match.

## 3. Main Algorithm Logic

Create an exported function, e.g., `calculateRecommendations(userPreferences, allDestinations)`, that takes the user profile and the fetched destinations.

-   **Input Validation & Defaults:** Check required user preferences (e.g., themes). Handle missing optional preferences gracefully.
-   **Prepare User Data:**
    -   Construct the 9-dimensional `userThemeVector` from `userPreferences`. Ensure order matches destination vectors. Handle missing themes (e.g., default to a neutral value like 3?). *Decision: Use provided values, assume missing themes aren't possible or default to 0 for calculation? Let's assume they are always present based on `ExampleProfile.json`.*
    -   Standardize user inputs (lowercase arrays for budgets, regions, durations, months).
-   **Calculate Collaborative Scores (Initial Step):**
    -   Call `calculateCollaborativeScores(userPreferences, allDestinations)`. *For V1, this function can just return an empty map `{}`.* Store the result in `collabScores`.
-   **Iterate through `allDestinations`:** For each destination `d`:
    -   Create a `scores` object for the destination: `const scores = { id: d.id };`
    -   **Step 1: Theme Similarity (`themeScore`)**
        -   Extract the 9 theme values from `d` into `destThemeVector`. Ensure consistent order.
        -   `scores.themeScore = cosineSimilarity(userThemeVector, destThemeVector);`
    -   **Step 2: Season Fit (`climateScore`)**
        -   Check if `userPreferences.travelMonths` (standardized) and `userPreferences.temperatureRange` exist.
        -   Initialize `monthlyClimateScores = []`.
        -   For each `monthName` in `userPreferences.travelMonths`:
            -   `monthIndex = getMonthIndex(monthName)`.
            -   If `monthIndex`, get `avgTemp = getAverageTemperature(d, monthIndex)`.
            -   If `avgTemp` is not null:
                -   `userMidTemp = calculateMidpoint(userPreferences.temperatureRange)`.
                -   `delta = Math.abs(avgTemp - userMidTemp)`.
                -   `scoreForMonth = Math.max(0, 1 - delta / 15)`.
                -   Add `scoreForMonth` to `monthlyClimateScores`.
        -   If `monthlyClimateScores` is not empty, `scores.climateScore = monthlyClimateScores.reduce((a, b) => a + b, 0) / monthlyClimateScores.length;` (average). Otherwise, this score is skipped (remains undefined).
    -   **Step 3: Budget Match (`budgetScore`)**
        -   Check if `userPreferences.travelBudget` (standardized) exists and has entries.
        -   `userLevels = userPreferences.travelBudget.map(mapBudgetToNumber).filter(n => n !== null);`
        -   `destLevelNum = mapBudgetToNumber(d.budget_level);`
        -   If `userLevels.length > 0` and `destLevelNum !== null`:
            -   If `userLevels.includes(destLevelNum)`, `scores.budgetScore = 1;`
            -   Else, `minDistance = Math.min(...userLevels.map(u => Math.abs(u - destLevelNum)))`; `scores.budgetScore = 1 - 0.5 * minDistance;`
        -   Otherwise, skip this score.
    -   **Step 4: Region Preference (`regionScore`)**
        -   Check if `userPreferences.preferredRegions` (standardized) exists, has entries, and doesn't include a wildcard.
        -   If applicable, `scores.regionScore = userPreferences.preferredRegions.includes(d.region.toLowerCase()) ? 1 : 0.3;` Otherwise, skip.
    -   **Step 5: Duration vs. Distance (`distanceScore`)**
        -   Check if `userPreferences.originLocation?.lat`, `userPreferences.originLocation?.lon`, `d.latitude`, `d.longitude`, and `userPreferences.travelDuration` (standardized) exist.
        -   Initialize `durationDistanceScores = []`.
        -   `km = haversineDistance({ lat: userPreferences.originLocation.lat, lon: userPreferences.originLocation.lon }, { lat: d.latitude, lon: d.longitude });`
        -   For each `durationLabel` in `userPreferences.travelDuration`:
            -   `durationDays = mapDurationToDays(durationLabel)`.
            -   If `durationDays !== null`:
                -   `threshold = 750 * durationDays`. Handle `threshold = 0`.
                -   `baseDistanceScore = threshold > 0 ? 1 / (1 + Math.pow(km / threshold, 2)) : (km === 0 ? 1 : 0);`
                -   Standardize `d.ideal_durations`: `idealDurationsLower = d.ideal_durations?.map(dur => dur.toLowerCase()) || [];`
                -   `durationMatchMultiplier = idealDurationsLower.includes(durationLabel) ? 1 : 0.7;`
                -   `scoreForDuration = baseDistanceScore * durationMatchMultiplier;`
                -   Add `scoreForDuration` to `durationDistanceScores`.
        -   If `durationDistanceScores` is not empty, `scores.distanceScore = Math.max(...durationDistanceScores);` (max score across user's preferred durations). Otherwise, skip.
    -   **Step 6: Content Blend (`contentScore`)**
        -   Define weights: `const weights = { theme: 0.45, climate: 0.15, budget: 0.10, region: 0.10, distance: 0.20 };`
        -   `availableScores = Object.keys(scores).filter(k => k.endsWith('Score') && weights[k.replace('Score', '')]);`
        -   `weightedSum = availableScores.reduce((sum, key) => sum + weights[key.replace('Score', '')] * scores[key], 0);`
        -   `weightSum = availableScores.reduce((sum, key) => sum + weights[key.replace('Score', '')], 0);`
        -   `scores.contentScore = (weightSum > 0) ? weightedSum / weightSum : 0;`
    -   **Step 7: Collaborative Score (`collabScore`)**
        -   `scores.collabScore = collabScores[d.id] ?? 0;`
    -   **Step 8: Hybrid Score (`hybridScore`)**
        -   `hasFeedback = userPreferences.destinationRatings && Object.keys(userPreferences.destinationRatings).length > 0;`
        -   `contentWeight = hasFeedback ? 0.7 : 1.0;`
        -   `collabWeight = hasFeedback ? 0.3 : 0.0;`
        -   `scores.hybridScore = contentWeight * scores.contentScore + collabWeight * scores.collabScore;`
    -   Add the `scores` object to a results array `allScoredDestinations`.

## 4. Post-Processing and Output

-   **Calculate Collaborative Scores (Function):**
    -   `function calculateCollaborativeScores(userPreferences, allDestinations)`
    -   *V1 Implementation:* Return an empty map `{}` immediately.
    -   *Future Implementation:*
        -   Check `userPreferences.destinationRatings`. If empty, return `{}`.
        -   Requires Item-Item Similarity Matrix (e.g., pre-computed cosine similarity of theme vectors).
        -   Calculate raw scores based on similarity to liked/disliked items.
        -   Min-Max scale raw scores to 0-1.
        -   Return map `{ destinationId: scaledScore }`.
-   **Final Ranking and Formatting:**
    -   Find `maxHybridScore = Math.max(0, ...allScoredDestinations.map(d => d.hybridScore));` (Use 0 if array is empty or all scores are negative, although they shouldn't be).
    -   Sort `allScoredDestinations` descending by `hybridScore`.
    -   Take top 3: `top3Scored = allScoredDestinations.slice(0, 3);`
    -   Format output: Map `top3Scored` to include `id`, `hybridScore`, and `matchPercentage`.
        -   `matchPercentage = (maxHybridScore > 0) ? Math.round(100 * d.hybridScore / maxHybridScore) : 0;`
    -   Return the formatted top 3 array, e.g., `[{ id: '...', hybridScore: 0.85, matchPercentage: 100 }, ...]`.

## 5. Integration with `recommendationService.js`

-   Modify `generateRecommendations` in `recommendationService.js`.
-   Require the `calculateRecommendations` function from `recommendationAlgorithm.js`.
-   Fetch `allDestinations`.
-   Call `top3 = calculateRecommendations(userPreferences, allDestinations)`.
-   Retrieve full details for the top 3 IDs from `allDestinations` using the IDs in `top3`.
-   Map the `top3` results to the `recordToInsert` for the `recommendations` table. *Decision: Add `*_match_percentage` columns to the DB table.*
    -   `destination_1_id: top3[0]?.id || null,`
    -   `destination_1_match_percentage: top3[0]?.matchPercentage || null,`
    -   ... (similarly for 2 and 3)
-   Return the *full destination details* for the top 3, augmented with their `matchPercentage` and potentially other scores for explainability if desired by the frontend.

## Decisions Summary:

1.  **User Theme Vector:** Assumed present in `userPreferences`.
2.  **Travel Months:** Average climate score across selected months.
3.  **Travel Duration:** Max distance score across selected durations.
4.  **Duration Mapping:** weekend: 2, short/short trip: 4, one week: 7, long/long trip: 14.
5.  **Collaborative Filtering:** V1 returns 0.
6.  **Database Schema:** Add `destination_N_match_percentage` columns.
7.  **Missing User Prefs:** Handled by weighted average normalization (Step 6).
8.  **String Comparison:** Standardize inputs/data to lowercase for comparisons (budgets, regions, durations, months).
9.  **Haversine Input:** Use `{lat, lon}` objects.
10. **Zero Vectors (Cosine Sim):** Return 0 similarity.
11. **Zero Distance Threshold:** Handle division by zero.
12. **Zero Max Hybrid Score:** Handle division by zero for percentage. 