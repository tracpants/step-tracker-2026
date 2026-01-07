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
   - **Location**: Choose "Automatic" for best global performance
     - R2 automatically replicates data globally
     - Specific regions are only needed for compliance requirements
   - Click **"Create bucket"**

3. **Choose Access Model**

   You have two options - choose based on your needs:

   ### Option A: Private Bucket (More Secure - Recommended)
   - **Security**: API credentials required for all access
   - **Use case**: When you want to control who can read your data
   - **Setup**: No additional configuration needed
   - **CORS**: Must configure CORS (see Step 6 below)
   - ✅ **Best for**: Most users who want better security

   ### Option B: Public Bucket (Simpler Setup)
   - **Security**: Anyone with the URL can read data
   - **Use case**: Public data with no sensitive information
   - **Setup**: Enable "Public Access" in bucket settings
   - **CORS**: Not needed if using R2.dev domain
   - ⚠️ **Warning**: Your step data will be publicly accessible

   **Recommendation**: Use private bucket (Option A) unless you specifically want public data.

## Step 2: Create R2 API Token

**Security Best Practice**: Create tokens with minimum required permissions (principle of least privilege).

### How to Create API Token

1. **Navigate to R2 API Tokens**
   - In Cloudflare dashboard, go to **R2 Object Storage**
   - Click **"Manage R2 API Tokens"** in the top right
   - Or go directly to your R2 page → **Manage API Tokens** button

2. **Create New Token**
   - Click **"Create API Token"** button
   - You'll have two options:
     - **User API Token**: Tied to your personal Cloudflare user (recommended for personal projects)
     - **Account API Token**: Requires Super Administrator role (use for team/production)

   **For most users**: Choose **"User API Token"**

3. **Configure Permissions** (Most Important Step!)

   **Recommended Settings**:
   ```
   Token Name: step-tracker-upload

   Permissions:
   - Select: "Object Read and Write"
     (NOT "Admin" - only use minimum required permissions)

   Bucket Scope:
   - Apply to specific buckets only
   - Select: step-tracker (or your bucket name)

   TTL (Optional):
   - Set token expiration: 1 year
   - Helps limit damage if token is compromised
   - Set calendar reminder to rotate before expiry
   ```

   **Why these settings**:
   - ✅ "Object Read and Write" allows uploading files (sufficient for this app)
   - ❌ "Admin" permissions are unnecessary and risky
   - ✅ Bucket scope limits token to only your step-tracker bucket
   - ✅ TTL expiration forces periodic security review

4. **Save Your Credentials** ⚠️ **CRITICAL**

   After clicking "Create API Token", you'll see:
   - **Access Key ID**: `abc123...` (visible anytime)
   - **Secret Access Key**: `xyz789...` (shown ONCE - never again!)

   **You MUST copy both values immediately**:
   - Store in password manager (1Password, Bitwarden, etc.)
   - Or save in secure encrypted note
   - You cannot retrieve the Secret Access Key later!

   **Security Warnings**:
   - ⛔ NEVER commit these to git
   - ⛔ NEVER share in screenshots or public forums
   - ⛔ NEVER hardcode in your scripts
   - ✅ ONLY store in .env file (which is in .gitignore)

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

### Understanding R2 Credentials

After creating your R2 API token in Step 2, you received two values:

- **Access Key ID**: Like a username - identifies your token (can view anytime)
- **Secret Access Key**: Like a password - proves you own the token (shown ONCE)

**These are NOT the same as**:
- ❌ Cloudflare Global API Key (different thing!)
- ❌ Cloudflare API Token for DNS/zones (different thing!)
- ✅ These are R2-specific S3-compatible credentials

**If you lost your Secret Access Key**:
1. You cannot retrieve it - it's cryptographically hashed
2. You must create a new R2 API token
3. Update your .env file with the new credentials
4. Consider using a password manager to avoid this

## Step 5: Update Website Configuration

The step tracker website automatically uses R2 when configured. No code changes needed!

The website checks `window.CONFIG.R2_DATA_URL` in `config.js`, which is automatically generated by `update_steps.py`.

### Verify Configuration

Your `config.js` will be auto-generated with:
```javascript
window.CONFIG = {
    TIMEZONE: 'Australia/Sydney',
    R2_DATA_URL: 'https://your-bucket.r2.cloudflarestorage.com/step-tracker/steps_data.json'
}
```

The website will automatically fetch from R2 instead of local file.

### Custom Domain Setup (Optional)

For a cleaner URL like `https://data.yourdomain.com/steps_data.json`:

1. **Add custom domain in R2 bucket settings**
   - Go to bucket → Settings → Custom Domains
   - Add your domain/subdomain (e.g., `data.yourdomain.com`)
   - Add CNAME record to your DNS pointing to the R2 bucket

2. **Update .env file**:
   ```bash
   R2_PUBLIC_URL=https://data.yourdomain.com
   ```

3. Run `update_steps.py` to regenerate `config.js` with your custom URL

## Step 6: Configure CORS (Required for Private Buckets)

**When CORS is needed**: If you chose a private bucket in Step 1, you MUST configure CORS to allow your website to fetch data from R2.

**Skip this step if**: You're using a public bucket with R2.dev domain.

### What is CORS?

CORS (Cross-Origin Resource Sharing) allows your website (on GitHub Pages) to request data from R2 (different domain). Without CORS, browsers block these requests for security.

### Configure CORS Policy

1. **Go to Your Bucket Settings**
   - Cloudflare Dashboard → R2 → Your bucket → Settings tab
   - Scroll to **CORS Policy** section

2. **Add CORS Rule**

   Click **"Add CORS policy"** and use this configuration:

   **For GitHub Pages**:
   ```json
   [
     {
       "AllowedOrigins": [
         "https://yourusername.github.io"
       ],
       "AllowedMethods": [
         "GET"
       ],
       "AllowedHeaders": [
         "*"
       ],
       "ExposeHeaders": [],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   **For Custom Domain**:
   ```json
   [
     {
       "AllowedOrigins": [
         "https://yourdomain.com",
         "https://www.yourdomain.com"
       ],
       "AllowedMethods": [
         "GET"
       ],
       "AllowedHeaders": [
         "*"
       ],
       "ExposeHeaders": [],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   **For Development + Production** (use during testing only):
   ```json
   [
     {
       "AllowedOrigins": [
         "http://localhost:*",
         "http://127.0.0.1:*",
         "https://yourusername.github.io"
       ],
       "AllowedMethods": [
         "GET"
       ],
       "AllowedHeaders": [
         "*"
       ],
       "ExposeHeaders": [],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

3. **Save the CORS Policy**

### CORS Configuration Explained

- **AllowedOrigins**: Which websites can access your R2 data
  - Use exact URLs (including https://)
  - Supports wildcards: `https://*.yourdomain.com`
  - ⚠️ NEVER use `"*"` in production - allows anyone to access your data!

- **AllowedMethods**: What operations are allowed
  - `GET` - Reading data (all you need for this app)
  - `PUT` - Uploading (not needed from browser)
  - `POST`, `DELETE` - Other operations (not needed)

- **AllowedHeaders**: Which HTTP headers browsers can send
  - `"*"` is safe here - allows cache control, content-type, etc.

- **MaxAgeSeconds**: How long browsers cache the CORS policy
  - `3600` = 1 hour (reduces CORS preflight requests)

### Troubleshooting CORS

**If you see CORS errors in browser console**:

1. **Check your website URL matches exactly**:
   - Wrong: `http://yourusername.github.io` (should be https)
   - Wrong: `https://yourusername.github.io/` (trailing slash)
   - Right: `https://yourusername.github.io`

2. **Check browser console for specific error**:
   ```
   Access to fetch at 'https://...r2.cloudflarestorage.com/...'
   from origin 'https://yourusername.github.io' has been blocked by CORS policy
   ```
   This tells you which origin is trying to access R2

3. **Verify CORS policy was saved**:
   - Go back to R2 bucket settings
   - Check CORS policy is still there (sometimes UI glitches)

4. **Test with curl** (to isolate CORS vs other issues):
   ```bash
   curl -H "Origin: https://yourusername.github.io" \
        -H "Access-Control-Request-Method: GET" \
        -H "Access-Control-Request-Headers: X-Requested-With" \
        -X OPTIONS \
        https://your-account-id.r2.cloudflarestorage.com/step-tracker/steps_data.json
   ```
   Should return CORS headers in response

## Step 7: Test the Setup

### 1. Test Local Upload to R2

Run the step tracker script to verify R2 connection:

```bash
python update_steps.py
```

**Expected output**:
```
INFO - Authenticating with Garmin...
INFO - Uploaded steps_data.json to R2: X days tracked
INFO - Uploaded config.js to R2
INFO - Successfully uploaded 2 files to R2: steps_data.json, config.js
```

**If you see errors**:
- "R2 configuration incomplete" → Check .env file has all R2 variables
- "Access Denied" → Verify API token permissions and bucket name
- "No Such Bucket" → Check bucket name spelling matches exactly

### 2. Verify Files in R2 Bucket

1. Go to Cloudflare Dashboard → R2 → Your bucket
2. You should see two files:
   - `steps_data.json` (your step data)
   - `config.js` (website configuration)

3. Click on `steps_data.json` to preview:
   - Should contain your Garmin step data
   - Check `metadata.lastUpdated` shows recent timestamp

### 3. Test Website Fetching from R2

1. **Deploy to GitHub Pages** (if not already deployed):
   ```bash
   git add config.js
   git commit -m "Configure R2 data source"
   git push origin master
   ```

2. **Visit your website**:
   - Open: `https://yourusername.github.io/step-tracker-2026`
   - Open browser Developer Tools (F12)
   - Go to Console tab

3. **Check for errors**:

   ✅ **Success** - You should see:
   - Step count displayed
   - Heatmap visible
   - No CORS errors in console

   ❌ **CORS Error** - You'll see:
   ```
   Access to fetch at '...' from origin '...' has been blocked by CORS policy
   ```
   → Go back to Step 6 and configure CORS

   ❌ **404 Not Found**:
   ```
   GET https://...r2.cloudflarestorage.com/step-tracker/steps_data.json 404
   ```
   → Check R2_ENDPOINT_URL and R2_BUCKET_NAME in .env are correct

   ❌ **403 Forbidden**:
   ```
   GET https://...r2.cloudflarestorage.com/step-tracker/steps_data.json 403
   ```
   → File doesn't exist, run `python update_steps.py` to upload

### 4. Test Data Updates (End-to-End)

1. **Make a change**:
   - Wait for Garmin to sync new steps (or manually add test data)

2. **Run update script**:
   ```bash
   python update_steps.py
   ```

3. **Verify immediate update**:
   - Refresh your website (Ctrl+R or Cmd+R)
   - New data should appear within seconds
   - No need to wait for GitHub Actions build!

### Test Checklist

- [ ] `update_steps.py` runs without errors
- [ ] Files appear in R2 bucket
- [ ] Website loads and displays step data
- [ ] No CORS errors in browser console
- [ ] "Last updated" timestamp is recent
- [ ] Heatmap displays correctly
- [ ] Running update script shows new data immediately on website

## Troubleshooting

### Common Issues

**"Access Denied" errors**
- Verify API token has "Object Read & Write" permission
- Check bucket name in .env matches exactly (case-sensitive)
- Ensure account ID is correct in R2_ENDPOINT_URL
- Try creating a new API token

**"No Such Bucket" errors**
- Verify bucket name spelling in .env
- Check bucket exists in Cloudflare dashboard
- Confirm using correct Cloudflare account

**CORS errors on website**
- See Step 6 for detailed CORS setup
- Verify AllowedOrigins matches your website URL exactly
- Check CORS policy was saved (refresh bucket settings page)
- Make sure using https:// not http://

**Upload fails silently**
- Check all R2 environment variables are set in .env
- Look for error messages in script output
- Verify network connectivity to Cloudflare
- Try uploading a test file via Cloudflare dashboard

**Token expired or invalid**
- Check if token has TTL expiration set
- Create new token and update .env
- Verify Access Key ID and Secret Access Key are both set

**Data not updating on website**
- Clear browser cache (Ctrl+Shift+R or Cmd+Shift+R)
- Check Network tab in DevTools for fetch request
- Verify config.js has correct R2_DATA_URL
- Check "Last updated" timestamp in browser

### Security Checklist

Before going to production, verify:

- [ ] .env file is in .gitignore (never committed to git)
- [ ] API token uses "Object Read & Write" (NOT Admin)
- [ ] API token is scoped to specific bucket only
- [ ] API token has TTL expiration set (recommended: 1 year)
- [ ] Using private bucket (unless you want public data)
- [ ] CORS AllowedOrigins lists specific domains (not "*")
- [ ] CORS AllowedMethods is only "GET" (not "PUT", "DELETE")
- [ ] Credentials stored in password manager as backup

### Getting Help

If you encounter issues:
1. Check script logs for detailed error messages
2. Verify all environment variables in .env match Step 4 format
3. Test bucket access via Cloudflare dashboard (upload test file manually)
4. Check browser console for specific error messages
5. Review your API token permissions in Cloudflare dashboard

## Benefits of This Setup

Once configured, your step tracker will:

- ✅ Upload data directly to R2 (no git commits)
- ✅ Serve data from Cloudflare's global CDN
- ✅ Have near-instant updates after Garmin sync
- ✅ Eliminate GitHub Actions complexity
- ✅ Reduce repository size (no data files in git)

Your GitHub repository becomes purely for code, while R2 handles all data storage and delivery!

## Security Best Practices

### Credential Management

**DO**:
- ✅ Store credentials only in .env file (excluded from git)
- ✅ Use password manager to backup credentials
- ✅ Set token expiration (TTL) to force periodic rotation
- ✅ Use minimum required permissions (Object Read & Write)
- ✅ Scope tokens to specific buckets only

**DON'T**:
- ❌ Commit .env to git
- ❌ Share credentials in screenshots, logs, or messages
- ❌ Use Admin permissions when not needed
- ❌ Reuse R2 credentials for multiple unrelated projects
- ❌ Store credentials in code comments or documentation

### Token Rotation

Set a calendar reminder to rotate your R2 API token annually:

1. Create new R2 API token with same permissions
2. Update .env with new credentials
3. Test: Run `python update_steps.py`
4. Once confirmed working, delete old token in Cloudflare dashboard

### Monitoring

**Watch for**:
- Unexpected R2 storage growth (could indicate unauthorized uploads)
- Failed authentication in script logs (could indicate token compromise)
- CORS errors from unexpected origins (check Cloudflare logs)

**Set up alerts** (optional):
- Cloudflare email notifications for R2 API errors
- Health monitoring for update script (using HEALTHCHECKS_URL)

### Cost Controls

R2 is very affordable, but set safeguards:

1. **Storage limits**: Your step tracker should use <1 MB
   - Monitor in Cloudflare Dashboard → R2 → Your bucket
   - Alert if usage exceeds expected amount

2. **Egress is free**: R2 has no egress fees to internet
   - Unlike AWS S3, bandwidth is included
   - No surprise bills from traffic spikes

3. **Operation limits**:
   - Free tier: 1 million requests/month
   - Your usage: ~30-60 requests/month (very low)

### Backup Strategy

**Automatic local backup**:
Your `steps_data.json` file is generated locally before upload, so you always have a local copy.

**Manual backup** (optional):
```bash
# Download from R2 periodically
aws s3 cp s3://step-tracker/steps_data.json ./backup/ \
  --endpoint-url https://YOUR-ACCOUNT-ID.r2.cloudflarestorage.com
```

**Git backup** (if desired):
While R2 is the primary data source, you can still commit data backups:
```bash
# Create a backup branch
git checkout -b data-backup
git add steps_data.json
git commit -m "Data backup $(date +%Y-%m-%d)"
git push origin data-backup
```

## Advanced Configuration

### Using R2 with Custom Domains

For production use, consider a custom domain:

**Benefits**:
- Cleaner URLs: `https://data.yourdomain.com` vs `https://abc123.r2.cloudflarestorage.com`
- Better CORS control
- Professional appearance

**Setup**:
1. Add custom domain in R2 bucket settings
2. Create CNAME DNS record: `data.yourdomain.com` → R2 endpoint
3. Update .env: `R2_PUBLIC_URL=https://data.yourdomain.com`
4. Optional: Enable Cloudflare proxy for DDoS protection

### Logging and Debugging

Enable detailed logging in `update_steps.py`:

```python
# Already configured - check logs for:
# - R2 upload confirmation
# - File sizes and object counts
# - Error messages with stack traces
```

View logs:
```bash
python update_steps.py 2>&1 | tee step-tracker.log
```

### Performance Optimization

**Current setup is already optimized**:
- ✅ HTTP cache headers set (5 min for data, 1 hour for config)
- ✅ Cache-busting query params in website (`?t=timestamp`)
- ✅ Gzip compression (automatic via Cloudflare)
- ✅ Global CDN distribution (automatic with R2)

**If needed, you can**:
- Reduce cache time for more real-time updates
- Increase cache time to reduce API calls
- Enable Cloudflare Access for authentication

## Reference

### Official Documentation

- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [R2 API Authentication](https://developers.cloudflare.com/r2/api/tokens/)
- [R2 CORS Configuration](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2 Pricing](https://developers.cloudflare.com/r2/pricing/)

### Quick Commands Reference

```bash
# Test R2 upload
python update_steps.py

# View config
cat config.js

# Check environment variables
cat .env

# Test R2 connection (requires AWS CLI)
aws s3 ls s3://step-tracker \
  --endpoint-url https://YOUR-ACCOUNT-ID.r2.cloudflarestorage.com

# Download from R2
aws s3 cp s3://step-tracker/steps_data.json ./test.json \
  --endpoint-url https://YOUR-ACCOUNT-ID.r2.cloudflarestorage.com
```

### Environment Variables Reference

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `GARMIN_EMAIL` | Yes | `you@example.com` | Garmin Connect login |
| `GARMIN_PASSWORD` | Yes | `your_password` | Garmin Connect password |
| `R2_ENDPOINT_URL` | Yes | `https://abc123.r2.cloudflarestorage.com` | Your R2 endpoint |
| `R2_ACCESS_KEY_ID` | Yes | `abc123def456...` | R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Yes | `xyz789uvw012...` | R2 Secret Access Key |
| `R2_BUCKET_NAME` | Yes | `step-tracker` | Your R2 bucket name |
| `R2_PUBLIC_URL` | Optional | `https://data.yourdomain.com` | Custom domain for R2 |
| `TIMEZONE` | Optional | `Australia/Sydney` | Display timezone |
| `HEALTHCHECKS_URL` | Optional | `https://hc-ping.com/uuid` | Health monitoring |