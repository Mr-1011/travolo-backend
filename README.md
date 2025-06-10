# Travolo Backend

A sophisticated travel recommendation engine that uses AI-powered image analysis, hybrid filtering algorithms, and user feedback to provide personalized destination recommendations.

## 🌟 Features

### Core Recommendation Engine
- **Hybrid Filtering**: Combines content-based and collaborative filtering for optimal recommendations
- **AI Image Analysis**: Uses OpenAI GPT-4 Vision to analyze travel photos and infer user preferences
- **Dynamic Learning**: Adapts recommendations based on user feedback (likes/dislikes)
- **Multi-factor Scoring**: Considers themes, climate, budget, duration, regions, and distance

### Advanced Capabilities
- **Climate Matching**: Matches destinations to user's preferred temperature ranges and travel months
- **Budget & Duration Filtering**: Filters based on travel budget levels and trip duration preferences
- **Geographic Intelligence**: Calculates distances and applies duration-based penalties for far destinations
- **Confidence Scoring**: Provides confidence percentages (0-100%) for each recommendation

### User Experience
- **Photo-based Preferences**: Upload up to 3 travel photos to automatically adjust preference scores
- **Feedback Learning**: System learns from destination ratings to improve future recommendations
- **Personalized Profiles**: Supports complex user preference profiles with 9 travel themes

## 🏗️ Architecture


1. **Recommendation Algorithm** (`recommendationAlgorithm.js`)
   - Main orchestrator for generating recommendations
   - Processes user feedback and adjusts preferences
   - Combines content and collaborative scores

2. **Content-Based Filtering** (`contentFiltering.js`)
   - Calculates similarity between user preferences and destinations
   - Handles theme matching, climate scoring, budget/region/duration filtering
   - Uses cosine similarity and Gaussian climate scoring

3. **Collaborative Filtering** (`collaborativeFiltering.js`)
   - Analyzes user behavior patterns
   - Maintains item similarity matrix
   - Provides recommendations based on similar users' preferences

4. **Image Analysis Service** (`services/imageService.js`)
   - Integrates with OpenAI GPT-4 Vision API
   - Analyzes travel photos to extract preference insights
   - Updates user preference scores based on visual cues

5. **Recommendation Service** (`services/recommendationService.js`)
   - Coordinates the recommendation generation process
   - Manages database operations
   - Handles similarity matrix refresh

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- Supabase account and project
- OpenAI API key

### Environment Variables

Create a `.env` file in the root directory:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Server Configuration
PORT=3001
```

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd travolo-backend

# Install dependencies
npm install

# Start the server
npm start
```

### Database Setup

The system requires several Supabase tables:
- `destinations` - Travel destination data
- `recommendations` - User preference records and recommendation results
- `destination_feedback` - User feedback on destinations
- `item_similarity` - Collaborative filtering similarity matrix

## 📚 API Documentation

### Base URL
```
http://localhost:3001/api
```

### Endpoints

#### 1. Get Random Destinations
```http
GET /destinations/random
```
Returns 10 random destinations for exploration.

**Response:**
```json
[
  {
    "id": "uuid",
    "city": "Crete",
    "country": "Greece",
    "culture": 4,
    "adventure": 4,
    "nature": 5,
    // ... other destination properties
  }
]
```

#### 2. Analyze Travel Images
```http
POST /preferences/analyze-images
Content-Type: multipart/form-data
```

**Parameters:**
- `images`: Array of image files (max 3, 10MB each)
- `preferences`: JSON string of current user preferences

**Response:**
```json
{
  "message": "Successfully received and analyzed 3 images.",
  "analysis": {
    "imageAnalysis": {
      "culture": 0,
      "adventure": 2,
      "nature": 3,
      "beaches": 0,
      "nightlife": 0,
      "cuisine": 0,
      "wellness": 0,
      "urban": 0,
      "seclusion": 1
    },
    "imageSummary": "Photos show mountain landscapes suggesting adventure and nature preferences."
  }
}
```

#### 3. Generate Recommendations
```http
POST /recommendations
Content-Type: application/json
```

**Request Body:**
```json
{
  "culture": 5,
  "adventure": 5,
  "nature": 4,
  "beaches": 1,
  "nightlife": 1,
  "cuisine": 5,
  "wellness": 1,
  "urban": 1,
  "seclusion": 2,
  "temperatureRange": [11, 34],
  "travelMonths": ["May", "June", "July"],
  "travelDuration": ["weekend", "short"],
  "preferredRegions": ["asia", "europe", "middle_east"],
  "originLocation": {
    "name": "München, Bayern, Deutschland",
    "lat": 48.1371079,
    "lon": 11.5753822
  },
  "travelBudget": ["budget", "mid-range"],
  "destinationRatings": {
    "destination-id-1": "like",
    "destination-id-2": "dislike"
  }
}
```

**Response:**
```json
{
  "message": "Recommendations generated and saved successfully.",
  "recommendationRecordId": "uuid",
  "recommendations": [
    {
      "id": "destination-uuid",
      "city": "Kyoto",
      "country": "Japan",
      "confidence": 87,
      "image_url": "https://...",
      ... other destination details
    }
  ]
}
```

#### 4. Submit Destination Feedback
```http
POST /destinations/:destinationId/feedback
Content-Type: application/json
```

**Request Body:**
```json
{
  "feedback": "This destination was amazing! Perfect for cultural exploration."
}
```

#### 5. Submit Recommendation Feedback
```http
POST /recommendations/:recommendationId/feedback
Content-Type: application/json
```

**Request Body:**
```json
{
  "destinationId": "destination-uuid",
  "feedback": "like" // or "dislike"
}
```

## 🔧 Configuration

### Travel Themes
The system supports 9 travel preference themes (scale 1-5):
- **Culture**: Museums, historical sites, local traditions
- **Adventure**: Outdoor activities, extreme sports, hiking
- **Nature**: Natural landscapes, wildlife, parks
- **Beaches**: Coastal areas, water activities, relaxation
- **Nightlife**: Bars, clubs, entertainment
- **Cuisine**: Local food, restaurants, culinary experiences
- **Wellness**: Spas, yoga, health-focused activities
- **Urban**: Cities, shopping, modern attractions
- **Seclusion**: Remote areas, privacy, tranquility

### Scoring Weights
Content-based filtering uses weighted scoring:
- Theme Similarity: 35%
- Region Preference: 25%
- Climate Match: 15%
- Budget Match: 10%
- Duration Match: 10%
- Distance Factor: 5%

## 🧠 Algorithm Details

### Recommendation Process

1. **Feedback Analysis**: Analyzes user's previous destination ratings to identify preference patterns
2. **Preference Adjustment**: Modifies base preferences based on liked/disliked destination features
3. **Content Scoring**: Calculates similarity between adjusted preferences and destination attributes
4. **Collaborative Scoring**: Finds similar users and recommends destinations they liked
5. **Hybrid Combination**: Merges content (70%) and collaborative (30%) scores when user feedback exists
6. **Ranking & Confidence**: Sorts by hybrid score and maps to confidence percentages

### Image Analysis Process

1. **Image Upload**: Receives up to 3 travel photos via multipart upload
2. **AI Analysis**: Sends images to OpenAI GPT-4 Vision with structured prompts
3. **Feature Extraction**: Identifies visual cues (mountains→adventure, beaches→nature, etc.)
4. **Delta Calculation**: Computes adjustment values (-3 to +3) for each theme
5. **Preference Update**: Applies adjustments to user's base preference scores

## 🔍 Troubleshooting

### Common Issues

1. **OpenAI API Errors**: Ensure API key is valid and has sufficient credits
2. **Supabase Connection**: Verify URL and keys are correct in `.env`
3. **Image Upload Fails**: Check file size limits (10MB) and supported formats
4. **Empty Recommendations**: Ensure destination database is populated

### Debug Mode
Enable detailed logging by setting `NODE_ENV=development` in your environment.

## 📄 License

This project is licensed under the ISC License - see the LICENSE file for details.
