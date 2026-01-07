# Cloudflare R2 Setup Guide

This guide walks you through setting up Cloudflare R2 storage for your step tracker data, eliminating the need for complex git-based deployments.

## Why R2?

✅ **Zero build triggers** - Data updates go directly to R2, no GitHub Actions needed  
✅ **Global CDN** - Cloudflare's edge network serves your data fast worldwide  
✅ **Simple architecture** - No orphan branches, no complex git workflows  
✅ **Cost effective** - R2 storage is very affordable for small data files  
✅ **Fast updates** - Instant data availability after step sync  

## Prerequisites

- Cloudflare account (free tier works fine)
- Access to Cloudflare dashboard
- Basic familiarity with environment variables

## Step 1: Create R2 Bucket

1. **Log in to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com
   - Navigate to **R2 Object Storage** in the sidebar

2. **Create a New Bucket**
   - Click **"Create bucket"**
   - Enter bucket name: `step-tracker` (or your preferred name)
   - Choose a region close to your location for best performance
   - Click **"Create bucket"**

3. **Configure Public Access (Optional)**
   - In your bucket settings, you can set up a custom domain
   - For public access, enable **"Public URL access"**
   - Note: The step tracker works fine with private buckets using API access

## Step 2: Create R2 API Token

1. **Go to R2 Tokens**
   - In the R2 dashboard, click **"Manage R2 API tokens"**
   - Or visit: https://dash.cloudflare.com/profile/api-tokens

2. **Create Custom Token**
   - Click **"Create token"**
   - Use **"Custom token"** template

3. **Configure Token Permissions**
   ```
   Permissions:
   - Cloudflare R2:Edit
   
   Account Resources:
   - Include: Your Account
   
   Zone Resources:
   - Include: All zones (or specific zone if you have one)
   ```

4. **Add R2 Resource Constraints**
   ```
   R2 Resources:
   - Include: Specific bucket: step-tracker
   ```

5. **Create and Save Token**
   - Click **"Continue to summary"**
   - Click **"Create token"**
   - **⚠️ IMPORTANT**: Copy the token immediately - you won't see it again!

## Step 3: Get Your Account ID and Endpoint

1. **Find Your Account ID**
   - In Cloudflare dashboard, right sidebar shows **Account ID**
   - Copy this value

2. **Determine Your R2 Endpoint**
   - R2 endpoints follow this pattern: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - Replace `<ACCOUNT_ID>` with your actual account ID
   - Example: `https://abc123def456.r2.cloudflarestorage.com`

## Step 4: Configure Environment Variables

Add these variables to your `.env` file:

```bash
# Cloudflare R2 Configuration
R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-token-here
R2_SECRET_ACCESS_KEY=your-r2-secret-here
R2_BUCKET_NAME=step-tracker

# Optional: Custom R2 domain (if you set one up)
R2_PUBLIC_URL=https://data.yourdomain.com
```

### Getting R2 Credentials

When you created the API token, Cloudflare should have provided:
- **Access Key ID** - Use this for `R2_ACCESS_KEY_ID`
- **Secret Access Key** - Use this for `R2_SECRET_ACCESS_KEY`

If you only got one token, you might need to:
1. Go back to R2 API tokens
2. Create an **R2 Token** specifically (not a general API token)
3. This will give you both an Access Key ID and Secret

## Step 5: Update Website Configuration

The step tracker website needs to know where to fetch data from R2 instead of the local file.

### Option 1: Use R2 Public URL (Recommended)

If you set up a public bucket or custom domain:

1. Update `index.html` to fetch from R2:
   ```javascript
   // Replace this line:
   fetch('./steps_data.json?t=' + Date.now())
   
   // With this:
   fetch('https://your-bucket-url/steps_data.json?t=' + Date.now())
   ```

### Option 2: Use Signed URLs (Advanced)

For private buckets, you'd need to generate signed URLs. This is more complex but more secure.

## Step 6: Test the Setup

1. **Test R2 Upload**
   ```bash
   # Run the step tracker script to test
   python update_steps.py
   ```

2. **Check R2 Bucket**
   - Go to your R2 bucket in Cloudflare dashboard
   - You should see `steps_data.json` and `config.js` files

3. **Test Website**
   - Visit your GitHub Pages site
   - Open browser dev tools to check for fetch errors
   - Data should load from R2

## Troubleshooting

### Common Issues

1. **"Access Denied" errors**
   - Check that your API token has correct permissions
   - Verify the bucket name matches exactly
   - Ensure account ID is correct in endpoint URL

2. **"No Such Bucket" errors**
   - Verify bucket name spelling
   - Check that bucket exists in the same account
   - Confirm account ID is correct

3. **CORS issues on website**
   - R2 buckets may need CORS configuration for browser access
   - Add CORS rules in R2 bucket settings if using public access

4. **Upload fails silently**
   - Check that all environment variables are set
   - Verify network connectivity
   - Check script logs for detailed error messages

### Getting Help

If you encounter issues:
1. Check the script logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test bucket access using the Cloudflare dashboard
4. Ensure your API token hasn't expired

## Benefits of This Setup

Once configured, your step tracker will:

- ✅ Upload data directly to R2 (no git commits)
- ✅ Serve data from Cloudflare's global CDN
- ✅ Have near-instant updates after Garmin sync
- ✅ Eliminate GitHub Actions complexity
- ✅ Reduce repository size (no data files in git)

Your GitHub repository becomes purely for code, while R2 handles all data storage and delivery!