const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY || '';

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Cache storage
const cache = new Map();
const CACHE_TTL = 600000; // 10 minutes in milliseconds

// API Key middleware (optional)
function checkApiKey(req, res, next) {
  if (API_KEY && API_KEY !== '') {
    const providedKey = req.headers['x-api-key'];
    if (providedKey !== API_KEY) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }
  }
  next();
}

// Helper function to get universe ID from place ID
async function getUniverseIdFromPlaceId(placeId) {
  try {
    const response = await fetch(
      `https://apis.roblox.com/universes/v1/places/${placeId}/universe`
    );
    const data = await response.json();
    return data.universeId;
  } catch (error) {
    console.error('Error fetching universe ID:', error);
    return null;
  }
}

// Helper function to get game passes for a universe
async function getGamePasses(universeId) {
  try {
    const response = await fetch(
      `https://games.roblox.com/v1/games/${universeId}/game-passes?limit=100&sortOrder=Asc`
    );
    
    if (!response.ok) {
      throw new Error(`Roblox API returned ${response.status}`);
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching game passes:', error);
    throw error;
  }
}

// Main endpoint to get passes
app.get('/passes', checkApiKey, async (req, res) => {
  try {
    const { userId, placeId, universeId: queryUniverseId } = req.query;
    
    let universeId = queryUniverseId;
    
    // If placeId is provided, convert it to universeId
    if (placeId && !universeId) {
      universeId = await getUniverseIdFromPlaceId(placeId);
      if (!universeId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Could not find universe ID for the provided place ID' 
        });
      }
    }
    
    // For backward compatibility, treat userId as universeId
    if (userId && !universeId) {
      universeId = userId;
    }
    
    if (!universeId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameter: universeId, placeId, or userId' 
      });
    }
    
    // Check cache
    const cacheKey = `passes_${universeId}`;
    const cached = cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.time < CACHE_TTL)) {
      console.log(`Cache hit for universe ${universeId}`);
      return res.json({
        success: true,
        passes: cached.data,
        cached: true
      });
    }
    
    // Fetch fresh data
    console.log(`Fetching passes for universe ${universeId}`);
    const passes = await getGamePasses(universeId);
    
    // Store in cache
    cache.set(cacheKey, {
      data: passes,
      time: Date.now()
    });
    
    res.json({
      success: true,
      passes: passes,
      cached: false
    });
    
  } catch (error) {
    console.error('Error in /passes endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch game passes',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Roblox Pass API',
    endpoints: {
      '/passes': 'GET - Fetch game passes (params: universeId or placeId)',
      '/health': 'GET - Health check'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Key protection: ${API_KEY ? 'ENABLED' : 'DISABLED'}`);
});
