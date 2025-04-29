# Hybrid Recommender – Implementation Plan

---

## Overview

### 1. Objectives
- Enhance content-based scoring using user's like/dislike feedback (**Feedback Enrichment**).
- Add an **Item-Based Collaborative Filtering** layer based on multi-user ratings.
- Combine both into a **Hybrid** score.

### 2. High-Level Approach
- **Content Side:** Adjust base user theme vector using feedback (weight `α`).
- **Collaborative Side:** Score items based on Jaccard similarity to user's liked items (using pre-computed `itemSimilarity.json`).
- **Blending:** Linearly combine content and collaborative scores (weights `contentWeight`, `collabWeight`).

### 3. Key Data Requirements
- `allDestinations`: Destination attributes.
- `userPreferences.destinationRatings`: Current user's likes/dislikes.
- `allRatings` (multi-user): Global `userId, destId, rating` table (for offline job).
- `itemSimilarity.json`: Pre-computed item-item similarities (for online scoring).

---

## Implementation Details

### 4. Content-Profile Adjustment (Feedback Enrichment)
- **Algorithm:**
    1. Get user's liked (`L`) and disliked (`D`) destination IDs.
    2. Calculate average feature vectors: `vec_like = mean(features(L))`, `vec_dislike = mean(features(D))`.
    3. Compute adjustment: `delta = vec_like - vec_dislike`.
    4. New vector: `userThemeVector_adj[i] = max(0, base[i] + α * delta[i])`.
- **Parameter:** `α` (feedback weight, default `0.2`).
- **Code:** Replace `userThemeVector` construction with `buildUserThemeVector(userPrefs, allDestinations)` helper.

### 5. Item-Based Collaborative Filtering
- **Offline Job (`computeItemSimilarity.js`):**
    - Input: `allRatings` (multi-user).
    - Metric: Jaccard `sim(i,j) = |Liked Both| / |Liked Either|`.
    - Output: `itemSimilarity.json` (sparse matrix, `sim > 0`).
- **Online Scoring (`calculateCollaborativeScores`):**
    1. Get user's `likedDestIds`.
    2. For each candidate `d` (unrated by user): `score_d = mean { sim(d, l) | l ∈ likedDestIds }`.
    3. Return `{ destId: score, ... }`.
- **Edge Cases:** Handle no user likes (return `{}`), missing similarity (treat as 0).

### 6. Score Blending
- **Formula:**
  ```
  contentW = hasRatings ? 0.7 : 1.0
  collabW  = hasRatings ? 0.3 : 0.0
  hybridScore = contentW * contentScore + collabW * collabScore
  ```
- **Parameters:** `contentWeight`, `collabWeight` (tunable).

### 7. Validation & Testing
- **Unit Tests:** For `buildUserThemeVector`, `calculateCollaborativeScores`.
- **Offline Metrics:** Precision/Recall@k using held-out ratings.
- **Ablation Study:** Compare Content-only vs. Hybrid.

### 8. Implementation Checklist
- [ ] Create/Update `CollaborativeImplementation.md` (this file).
- [ ] Add helper `buildUserThemeVector`.
- [ ] Implement `calculateCollaborativeScores` (using `itemSimilarity.json`).
- [ ] Write offline script `computeItemSimilarity.js`.
- [ ] Set up loading/injection of `itemSimilarity.json`.
- [ ] Expose parameters (`α`, weights) via config.
- [ ] Add tests & benchmarks.
- [ ] Update thesis chapter.
