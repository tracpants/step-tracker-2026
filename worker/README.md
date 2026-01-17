# Cloudflare Worker for Step Tracker

This Cloudflare Worker replaces the Raspberry Pi Python script, running your step tracker updates in the cloud on a schedule.

## 🎯 What This Does

- ✅ Runs **4 times daily** on a schedule (1am, 7am, 1pm, 7pm Sydney time)
- ✅ Fetches step data from **Garmin Connect API**
- ✅ Uploads data directly to **Cloudflare R2**
- ✅ **Zero server maintenance** - fully serverless
- ✅ **Free tier** covers this usage easily
- ✅ Supports **manual triggering** via HTTP POST
- ✅ Optional **HealthChecks.io** monitoring

## 📋 Prerequisites

1. **Cloudflare Account** (free tier works)
2. **Cloudflare R2** bucket already set up (see main `R2_SETUP.md`)
3. **Node.js** installed (v18 or later)
4. **Garmin Connect** account credentials

## 🚀 Deployment Instructions

### Step 1: Install Wrangler CLI

```bash
cd worker
npm install
```

This installs Wrangler (Cloudflare's CLI) and the Garmin Connect library.

### Step 2: Login to Cloudflare

```bash
npx wrangler login
```

This opens a browser to authenticate with your Cloudflare account.

### Step 3: Configure R2 Bucket Binding

Edit `wrangler.toml` if your R2 bucket name is different from `step-tracker`:

```toml
[[r2_buckets]]
binding = "STEP_TRACKER_BUCKET"
bucket_name = "your-bucket-name"  # Change this if needed
```

### Step 4: Set Secrets (Secure Credentials)

Set your Garmin credentials and optional settings as **encrypted secrets**:

```bash
# Required: Garmin credentials
npx wrangler secret put GARMIN_EMAIL
# When prompted, enter: your_email@example.com

npx wrangler secret put GARMIN_PASSWORD
# When prompted, enter: your_password

# Optional: R2 public URL for config.js generation
npx wrangler secret put R2_PUBLIC_URL
# When prompted, enter: https://data.yourdomain.com

# Optional: HealthChecks.io monitoring
npx wrangler secret put HEALTHCHECKS_URL
# When prompted, enter: https://hc-ping.com/your-uuid
```

**Important**: These secrets are:
- 🔒 **Encrypted at rest** in Cloudflare
- 🔒 **Never visible** in code or logs
- 🔒 **Only accessible** by your worker during execution

### Step 5: Adjust Timezone (if needed)

The default timezone is `Australia/Sydney`. To change it, edit `wrangler.toml`:

```toml
[vars]
TIMEZONE = "America/New_York"  # Change to your timezone
```

### Step 6: Adjust Cron Schedule (if needed)

The default schedule is 4x daily at 1am, 7am, 1pm, 7pm Sydney time.

To change the schedule, edit the cron expressions in `wrangler.toml`:

```toml
[triggers]
crons = [
  "0 14 * * *",  # 1am Sydney (2pm UTC)
  "0 20 * * *",  # 7am Sydney (8pm UTC)
  "0 2 * * *",   # 1pm Sydney (2am UTC)
  "0 8 * * *"    # 7pm Sydney (8am UTC)
]
```

**Cron format**: `minute hour day month day-of-week` (in UTC)

Examples:
- Every hour: `"0 * * * *"`
- Every 6 hours: `"0 */6 * * *"`
- Every day at noon UTC: `"0 12 * * *"`

### Step 7: Deploy the Worker

```bash
npx wrangler deploy
```

You'll see output like:

```
 ⛅️ wrangler 3.85.0
-------------------
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Uploaded step-tracker-worker (X.XX sec)
Published step-tracker-worker (X.XX sec)
  https://step-tracker-worker.your-subdomain.workers.dev
Current Deployment ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

🎉 **Your worker is now deployed and running on schedule!**

## 🧪 Testing

### Test Manual Trigger

```bash
# Trigger a manual update via HTTP POST
curl -X POST https://step-tracker-worker.your-subdomain.workers.dev
```

You should see: `Step tracker update triggered`

### View Real-Time Logs

```bash
npx wrangler tail
```

This streams live logs from your worker. Trigger a manual update to see the logs in real-time.

### Check Scheduled Runs

Cron triggers will run automatically at the scheduled times. Check the logs:

```bash
npx wrangler tail
```

Leave this running during a scheduled execution time to see it work.

## 🔍 Monitoring

### View Worker Metrics

Go to your Cloudflare dashboard:
1. Navigate to **Workers & Pages**
2. Click on **step-tracker-worker**
3. View metrics: requests, errors, CPU time, etc.

### HealthChecks.io Integration (Optional)

If you set the `HEALTHCHECKS_URL` secret:
- Worker sends **start** signal when execution begins
- Sends **success** when data is uploaded successfully
- Sends **failure** if errors occur
- HealthChecks.io will email you if the worker fails

## 🛠 Maintenance

### Update Secrets

To change credentials:

```bash
npx wrangler secret put GARMIN_PASSWORD
# Enter new password
```

### Update Code

After making changes to `index.js`:

```bash
npx wrangler deploy
```

### View All Secrets

```bash
npx wrangler secret list
```

(Note: This only shows secret *names*, not values)

### Delete the Worker

```bash
npx wrangler delete
```

## 🔒 Security Notes

1. **Secrets are encrypted** - Cloudflare encrypts all secrets at rest
2. **Secrets never appear in logs** - Wrangler automatically redacts them
3. **R2 binding is secure** - Direct worker-to-R2 communication, no public endpoints needed
4. **Worker URL is public** - Anyone can POST to trigger an update. To restrict:
   - Add authentication header checking in the `fetch()` handler
   - Or disable manual triggers entirely (only allow cron)

### Example: Add Authentication for Manual Triggers

Edit `index.js` to require a secret token:

```javascript
async fetch(request, env, ctx) {
  if (request.method === 'POST') {
    const authHeader = request.headers.get('Authorization');
    const expectedToken = env.TRIGGER_TOKEN; // Set via: wrangler secret put TRIGGER_TOKEN

    if (authHeader !== `Bearer ${expectedToken}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    ctx.waitUntil(this.scheduled(null, env, ctx));
    return new Response('Step tracker update triggered', { status: 200 });
  }

  return new Response('Step Tracker Worker', { status: 200 });
}
```

Then set the token:

```bash
npx wrangler secret put TRIGGER_TOKEN
# Enter a random token
```

And use it:

```bash
curl -X POST \
  -H "Authorization: Bearer your-secret-token" \
  https://step-tracker-worker.your-subdomain.workers.dev
```

## 💰 Cost

Cloudflare Workers **Free Tier** includes:
- ✅ **100,000 requests/day** (you'll use ~4-8/day)
- ✅ **10ms CPU time per request** (step tracker uses ~200-500ms)
- ✅ **Unlimited cron triggers**
- ✅ **R2 Class A operations**: 1M/month free (you'll use ~120/month)

**Expected cost**: **$0.00/month** on free tier 🎉

If you exceed limits:
- Workers: $5/month for 10M requests
- R2: Extremely cheap (~$0.015 per million Class A operations)

## 🆚 vs Raspberry Pi

| Feature | Raspberry Pi | Cloudflare Worker |
|---------|--------------|-------------------|
| **Hardware** | Physical device | Serverless |
| **Maintenance** | OS updates, reboots | Zero maintenance |
| **Cost** | ~$5/mo electricity | $0/mo (free tier) |
| **Reliability** | Power outages, SD card failures | 99.99% uptime SLA |
| **Speed** | Depends on Pi model | Edge execution (<50ms) |
| **Security** | You manage | Cloudflare manages |
| **Scalability** | Fixed | Auto-scales |

## 🐛 Troubleshooting

### "Error: No such bucket"

Your R2 bucket name in `wrangler.toml` doesn't match the actual bucket. Check:

```bash
npx wrangler r2 bucket list
```

### "Garmin authentication failed"

1. Check that secrets are set correctly:
   ```bash
   npx wrangler secret list
   ```
2. Verify credentials work by testing locally with `wrangler dev`
3. Garmin may have rate limits - check logs for details

### "Module not found: garmin-connect"

Install dependencies:

```bash
npm install
```

### Worker doesn't run on schedule

1. Check that cron triggers are configured in `wrangler.toml`
2. Verify deployment was successful: `npx wrangler deployments list`
3. Cron triggers may take a few minutes to activate after first deployment

### See detailed logs

```bash
npx wrangler tail --format pretty
```

## 📚 Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [R2 Storage Documentation](https://developers.cloudflare.com/r2/)
- [Cron Triggers Guide](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## 🎉 Success!

Once deployed, your step tracker will:
1. ✅ Run automatically 4x daily
2. ✅ Fetch fresh data from Garmin
3. ✅ Upload to R2 for your website
4. ✅ Send health check pings (if configured)
5. ✅ Require zero maintenance

**You can now turn off your Raspberry Pi!** 🥳
