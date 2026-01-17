/**
 * Cloudflare Worker for Step Tracker
 * Fetches Garmin step data and uploads to R2
 */

import { GarminConnect } from 'garmin-connect';

// Custom error classes for better error handling
class GarminAuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GarminAuthenticationError';
  }
}

class GarminAPIError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GarminAPIError';
  }
}

class GarminNetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GarminNetworkError';
  }
}

class GarminTemporaryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GarminTemporaryError';
  }
}

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000, maxDelay = 60000, backoffFactor = 2) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        console.error(`Function failed after ${maxRetries} retries. Final error:`, error);
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
      console.warn(`Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delay}ms...`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Send healthcheck ping to Healthchecks.io
 */
async function sendHealthcheck(healthcheckUrl, endpoint = '', data = null) {
  if (!healthcheckUrl) {
    return;
  }

  try {
    const url = healthcheckUrl + endpoint;
    const options = data
      ? { method: 'POST', body: data }
      : { method: 'GET' };

    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
    console.log(`Healthcheck ping sent to ${endpoint || 'success'}: ${response.status}`);
  } catch (error) {
    console.warn(`Healthcheck ping failed (${endpoint || 'success'}):`, error);
  }
}

/**
 * Login to Garmin with retry logic
 */
async function garminLoginWithRetry(email, password, maxRetries = 3) {
  async function loginAttempt() {
    try {
      const GCClient = new GarminConnect({
        username: email,
        password: password,
      });

      await GCClient.login();
      console.log('Successfully authenticated with Garmin Connect');
      return GCClient;
    } catch (error) {
      const errorMsg = error.message.toLowerCase();

      // Categorize the error
      if (errorMsg.includes('authentication') || errorMsg.includes('credential') ||
          errorMsg.includes('login') || errorMsg.includes('password') ||
          errorMsg.includes('unauthorized') || errorMsg.includes('forbidden')) {
        throw new GarminAuthenticationError(`Garmin authentication failed: ${error.message}`);
      } else if (errorMsg.includes('network') || errorMsg.includes('connection') ||
                 errorMsg.includes('timeout') || errorMsg.includes('dns')) {
        throw new GarminNetworkError(`Network error during Garmin login: ${error.message}`);
      } else if (errorMsg.includes('rate limit') || errorMsg.includes('too many') ||
                 errorMsg.includes('busy') || errorMsg.includes('server')) {
        throw new GarminTemporaryError(`Temporary Garmin service issue: ${error.message}`);
      } else {
        throw new GarminTemporaryError(`Unknown Garmin login error: ${error.message}`);
      }
    }
  }

  try {
    return await retryWithBackoff(
      loginAttempt,
      maxRetries,
      2000,
      60000,
      2
    );
  } catch (error) {
    if (error instanceof GarminAuthenticationError) {
      throw error;
    }
    console.error(`Garmin login failed after ${maxRetries} retries:`, error);
    throw error;
  }
}

/**
 * Get daily steps from Garmin with retry logic
 */
async function garminGetStepsWithRetry(garmin, startDate, endDate, maxRetries = 5) {
  async function apiCallAttempt() {
    try {
      const stats = await garmin.getSteps(startDate, endDate);
      console.log(`Successfully fetched ${stats.length} days of step data from Garmin`);
      return stats;
    } catch (error) {
      const errorMsg = error.message.toLowerCase();

      if (errorMsg.includes('api') || errorMsg.includes('invalid request')) {
        throw new GarminAPIError(`Garmin API error: ${error.message}`);
      } else if (errorMsg.includes('network') || errorMsg.includes('connection') || errorMsg.includes('timeout')) {
        throw new GarminNetworkError(`Network error during Garmin API call: ${error.message}`);
      } else if (errorMsg.includes('rate limit') || errorMsg.includes('too many') ||
                 errorMsg.includes('busy') || errorMsg.includes('server') || errorMsg.includes('unavailable')) {
        throw new GarminTemporaryError(`Temporary Garmin API issue: ${error.message}`);
      } else if (errorMsg.includes('authentication') || errorMsg.includes('unauthorized')) {
        throw new GarminAuthenticationError(`Garmin session expired: ${error.message}`);
      } else {
        throw new GarminTemporaryError(`Unknown Garmin API error: ${error.message}`);
      }
    }
  }

  try {
    return await retryWithBackoff(apiCallAttempt, maxRetries, 1000);
  } catch (error) {
    if (error instanceof GarminAPIError || error instanceof GarminAuthenticationError) {
      throw error;
    }
    console.error(`Garmin API call failed after ${maxRetries} retries:`, error);
    throw error;
  }
}

/**
 * Upload data to R2
 */
async function uploadToR2(env, jsonData, configContent) {
  const uploads = [];

  // Upload steps data
  if (jsonData && (jsonData.data || jsonData.metadata)) {
    const jsonContent = JSON.stringify(jsonData, null, 2);
    uploads.push({
      key: 'steps_data.json',
      content: jsonContent,
      contentType: 'application/json',
      cacheControl: 'max-age=300',
    });
  }

  // Upload config if provided
  if (configContent) {
    uploads.push({
      key: 'config.js',
      content: configContent,
      contentType: 'application/javascript',
      cacheControl: 'max-age=3600',
    });
  }

  if (uploads.length === 0) {
    console.log('No files to upload to R2');
    return true;
  }

  console.log(`Uploading ${uploads.length} file(s) to R2`);

  for (const upload of uploads) {
    try {
      await env.STEP_TRACKER_BUCKET.put(upload.key, upload.content, {
        httpMetadata: {
          contentType: upload.contentType,
          cacheControl: upload.cacheControl,
        },
      });
      console.log(`Successfully uploaded ${upload.key} (${upload.content.length} bytes)`);
    } catch (error) {
      console.error(`Failed to upload ${upload.key}:`, error);
      throw error;
    }
  }

  return true;
}

/**
 * Download existing data from R2
 */
async function downloadFromR2(env) {
  try {
    const object = await env.STEP_TRACKER_BUCKET.get('steps_data.json');

    if (!object) {
      console.log('No existing data in R2 - starting fresh');
      return null;
    }

    const text = await object.text();
    const data = JSON.parse(text);
    console.log('Downloaded existing data from R2');
    return data;
  } catch (error) {
    console.warn('Failed to download from R2:', error);
    return null;
  }
}

/**
 * Main handler
 */
export default {
  async scheduled(event, env, ctx) {
    const healthcheckUrl = env.HEALTHCHECKS_URL;

    try {
      // Signal start
      await sendHealthcheck(healthcheckUrl, '/start');

      const email = env.GARMIN_EMAIL;
      const password = env.GARMIN_PASSWORD;
      const timezone = env.TIMEZONE || 'Australia/Sydney';

      if (!email || !password) {
        const error = 'Missing Garmin credentials';
        console.error(error);
        await sendHealthcheck(healthcheckUrl, '/fail', error);
        return;
      }

      // Download existing data
      const existingR2Data = await downloadFromR2(env);

      // Login to Garmin
      console.log('Authenticating with Garmin...');
      let garmin;
      try {
        garmin = await garminLoginWithRetry(email, password);
      } catch (error) {
        console.error('Authentication failed:', error);
        await sendHealthcheck(healthcheckUrl, '/fail', `Garmin auth failed: ${error.message}`);
        return;
      }

      // Get today's date in the configured timezone
      const now = new Date();
      const today = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      const todayStr = today.toISOString().split('T')[0];
      console.log(`Current date in ${timezone}: ${todayStr}`);

      const startDate = '2026-01-01';

      // Read existing data
      let existingData = {};
      let existingMetadata = {};

      if (existingR2Data) {
        if (existingR2Data.data && existingR2Data.metadata) {
          existingData = existingR2Data.data;
          existingMetadata = existingR2Data.metadata;
        } else {
          existingData = existingR2Data;
        }
      }

      console.log(`Existing data contains ${Object.keys(existingData).length} dates`);

      // Find dates to check (missing dates + today + yesterday)
      const datesToCheck = [];
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Find missing dates
      let currentDate = new Date(startDate);
      while (currentDate <= today) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (!existingData[dateStr]) {
          datesToCheck.push(dateStr);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Always include today
      if (!datesToCheck.includes(todayStr)) {
        datesToCheck.push(todayStr);
      }

      // Include yesterday if not already there
      if (!datesToCheck.includes(yesterdayStr) && yesterdayStr >= startDate) {
        datesToCheck.push(yesterdayStr);
      }

      if (datesToCheck.length === 0) {
        console.log('No missing dates to fetch');
        await sendHealthcheck(healthcheckUrl);
        return;
      }

      console.log(`Found ${datesToCheck.length} dates to check`);

      // Fetch data from Garmin
      const fetchStart = datesToCheck[0];
      const fetchEnd = datesToCheck[datesToCheck.length - 1];
      console.log(`Fetching stats from ${fetchStart} to ${fetchEnd}...`);

      let stats;
      try {
        stats = await garminGetStepsWithRetry(garmin, fetchStart, fetchEnd);
      } catch (error) {
        console.error('Failed to fetch step data:', error);

        // Graceful degradation
        if (Object.keys(existingData).length > 0) {
          console.log('Preserving existing data due to API failure');
          const outputData = {
            metadata: {
              lastUpdated: now.toISOString(),
              timezone: timezone,
              lastFailure: now.toISOString(),
              failureReason: 'Garmin API unavailable - data preserved',
            },
            data: existingData,
          };

          await uploadToR2(env, outputData, null);
          await sendHealthcheck(healthcheckUrl, '/log', 'Garmin API unavailable - existing data preserved');
          return;
        } else {
          await sendHealthcheck(healthcheckUrl, '/fail', `Garmin API error: ${error.message}`);
          return;
        }
      }

      // Process the stats
      const dataPoints = { ...existingData };
      let newCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      for (const entry of stats) {
        const dateStr = entry.calendarDate;
        const steps = entry.totalSteps || 0;
        const distanceMeters = entry.totalDistance || entry.totalDistanceMeters || 0;
        const distanceKm = distanceMeters ? Math.round(distanceMeters / 10) / 100 : 0;

        const newData = { steps, km: distanceKm };

        let existingValue = dataPoints[dateStr];
        if (typeof existingValue === 'number') {
          existingValue = { steps: existingValue, km: 0 };
        }

        if (!dataPoints[dateStr]) {
          dataPoints[dateStr] = newData;
          newCount++;
          console.log(`NEW: ${dateStr} = ${steps} steps, ${distanceKm} km`);
        } else if (JSON.stringify(existingValue) !== JSON.stringify(newData)) {
          const oldSteps = existingValue?.steps || 0;
          const oldKm = existingValue?.km || 0;
          dataPoints[dateStr] = newData;
          updatedCount++;
          console.log(`UPDATED: ${dateStr} = ${steps} steps, ${distanceKm} km (was ${oldSteps} steps, ${oldKm} km)`);
        } else {
          unchangedCount++;
          console.log(`UNCHANGED: ${dateStr} = ${steps} steps, ${distanceKm} km`);
        }
      }

      const totalChanges = newCount + updatedCount;
      console.log(`Comparison: ${newCount} new, ${updatedCount} updated, ${unchangedCount} unchanged`);

      if (totalChanges === 0) {
        console.log('No new step data to update');
        await sendHealthcheck(healthcheckUrl);
        return;
      }

      // Create output data with metadata
      const outputData = {
        metadata: {
          lastUpdated: now.toISOString(),
          timezone: timezone,
        },
        data: dataPoints,
      };

      // Generate config.js
      const r2PublicUrl = env.R2_PUBLIC_URL;
      let configContent = null;

      if (r2PublicUrl) {
        configContent = `window.CONFIG = {
    TIMEZONE: '${timezone}',
    R2_DATA_URL: '${r2PublicUrl.replace(/\/$/, '')}/steps_data.json'
};
`;
      }

      // Upload to R2
      console.log(`Uploading updated data to R2 (${totalChanges} changes, ${Object.keys(dataPoints).length} total days)`);
      await uploadToR2(env, outputData, configContent);

      console.log('Data successfully uploaded to R2');
      await sendHealthcheck(healthcheckUrl);

    } catch (error) {
      console.error('Error:', error);
      await sendHealthcheck(healthcheckUrl, '/fail', error.message);
      throw error;
    }
  },

  // Handle manual triggers via HTTP
  async fetch(request, env, ctx) {
    // Allow manual triggering via HTTP request
    if (request.method === 'POST') {
      ctx.waitUntil(this.scheduled(null, env, ctx));
      return new Response('Step tracker update triggered', { status: 200 });
    }

    return new Response('Step Tracker Worker - Use POST to trigger manually', { status: 200 });
  },
};
