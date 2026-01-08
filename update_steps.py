import os
import json
import datetime
import logging
import subprocess
import requests
from zoneinfo import ZoneInfo
from garminconnect import Garmin
from dotenv import load_dotenv
from git import Repo
import boto3
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Track if we've already logged about missing healthcheck URL
_healthcheck_skip_logged = False

def send_healthcheck(endpoint="", data=None):
    """Send a healthcheck signal to Healthchecks.io

    Args:
        endpoint: Additional endpoint path (e.g., "/start", "/fail", "")
        data: Optional diagnostic data to include in POST request
    """
    global _healthcheck_skip_logged
    healthcheck_url = os.getenv("HEALTHCHECKS_URL")
    if not healthcheck_url:
        if not _healthcheck_skip_logged:
            logging.info("Healthcheck skipped - HEALTHCHECKS_URL not configured")
            _healthcheck_skip_logged = True
        return  # Skip healthcheck if not configured
    
    try:
        url = healthcheck_url + endpoint
        if data:
            response = requests.post(url, data=data, timeout=10)
        else:
            response = requests.get(url, timeout=10)
        logging.info(f"Healthcheck ping sent to {endpoint or 'success'}: {response.status_code}")
    except requests.RequestException as e:
        logging.warning(f"Healthcheck ping failed ({endpoint or 'success'}): {e}")

def send_healthcheck_start():
    """Signal the start of the script execution"""
    send_healthcheck("/start")

def send_healthcheck_success():
    """Signal successful completion of the script"""
    send_healthcheck()

def send_healthcheck_failure(error_message=None):
    """Signal script failure with optional error details"""
    data = f"Step tracker error: {error_message}" if error_message else "Step tracker failed"
    send_healthcheck("/fail", data)

# Git functions removed - using R2 for data storage instead

def upload_to_r2(json_path, config_path):
    """Upload data files to Cloudflare R2"""
    try:
        # Get R2 configuration from environment
        r2_endpoint = os.getenv("R2_ENDPOINT_URL")
        r2_access_key = os.getenv("R2_ACCESS_KEY_ID")
        r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        r2_bucket = os.getenv("R2_BUCKET_NAME", "step-tracker")
        
        if not all([r2_endpoint, r2_access_key, r2_secret_key]):
            logging.warning("R2 configuration incomplete - skipping upload")
            logging.info("Set R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables")
            return False
        
        # Configure S3 client for R2
        s3_client = boto3.client(
            's3',
            endpoint_url=r2_endpoint,
            aws_access_key_id=r2_access_key,
            aws_secret_access_key=r2_secret_key,
            region_name='auto'  # R2 uses 'auto' for region
        )
        
        uploaded_files = []
        
        # Upload steps_data.json if it exists and has content
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r') as f:
                    data = json.load(f)
                    # Only upload if we have actual data (not empty)
                    if data.get('data') or data.get('metadata'):
                        s3_client.upload_file(
                            json_path, 
                            r2_bucket, 
                            'steps_data.json',
                            ExtraArgs={
                                'ContentType': 'application/json',
                                'CacheControl': 'max-age=300'  # 5 minute cache
                            }
                        )
                        uploaded_files.append('steps_data.json')
                        logging.info(f"Uploaded steps_data.json to R2: {len(data.get('data', {}))} days tracked")
            except (json.JSONDecodeError, ClientError) as e:
                logging.error(f"Failed to upload steps_data.json: {e}")
        
        # Upload config.js if it exists
        if os.path.exists(config_path):
            try:
                s3_client.upload_file(
                    config_path,
                    r2_bucket,
                    'config.js',
                    ExtraArgs={
                        'ContentType': 'application/javascript',
                        'CacheControl': 'max-age=3600'  # 1 hour cache
                    }
                )
                uploaded_files.append('config.js')
                logging.info("Uploaded config.js to R2")
            except ClientError as e:
                logging.error(f"Failed to upload config.js: {e}")
        
        if uploaded_files:
            logging.info(f"Successfully uploaded {len(uploaded_files)} files to R2: {', '.join(uploaded_files)}")
            return True
        else:
            logging.info("No files uploaded to R2")
            return False
            
    except Exception as e:
        logging.error(f"R2 upload failed: {e}")
        return False

def download_from_r2(json_path):
    """Download existing data file from R2"""
    try:
        r2_endpoint = os.getenv("R2_ENDPOINT_URL")
        r2_access_key = os.getenv("R2_ACCESS_KEY_ID")
        r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        r2_bucket = os.getenv("R2_BUCKET_NAME", "step-tracker")
        
        if not all([r2_endpoint, r2_access_key, r2_secret_key]):
            logging.info("R2 not configured - starting with empty data")
            return False
        
        s3_client = boto3.client(
            's3',
            endpoint_url=r2_endpoint,
            aws_access_key_id=r2_access_key,
            aws_secret_access_key=r2_secret_key,
            region_name='auto'
        )
        
        try:
            s3_client.download_file(r2_bucket, 'steps_data.json', json_path)
            logging.info("Downloaded existing data from R2")
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                logging.info("No existing data file in R2 - starting fresh")
            else:
                logging.warning(f"Failed to download from R2: {e}")
            return False
            
    except Exception as e:
        logging.warning(f"R2 download failed: {e}")
        return False

def main():
    load_dotenv()
    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")
    timezone_str = os.getenv("TIMEZONE", "Australia/Sydney")
    repo_path = os.getcwd()

    if not email or not password:
        logging.error("Credentials missing. Please check .env file.")
        send_healthcheck_failure("Missing Garmin credentials")
        return

    try:
        # Signal the start of script execution
        send_healthcheck_start()
        
        # Set up file paths
        json_path = os.path.join(repo_path, "steps_data.json")
        
        # Download existing data from R2 (if configured)
        download_from_r2(json_path)

        logging.info("Authenticating with Garmin...")
        garmin = Garmin(email, password)
        garmin.login()

        # Get today's date in the configured timezone
        tz = ZoneInfo(timezone_str)
        now_in_tz = datetime.datetime.now(tz)
        today = now_in_tz.date()
        logging.info(f"Current date in {timezone_str}: {today} (UTC would be: {datetime.date.today()})")

        start_date = datetime.date(2026, 1, 1)
        
        # Read existing data to determine what dates we need to fetch
        existing_data = {}
        existing_metadata = {}
        if os.path.exists(json_path):
            with open(json_path, "r") as f:
                json_content = json.load(f)
                
                # Handle new structure with metadata, or legacy flat structure
                if isinstance(json_content, dict) and "data" in json_content and "metadata" in json_content:
                    # New structure
                    existing_data = json_content["data"]
                    existing_metadata = json_content["metadata"]
                else:
                    # Legacy structure - treat entire content as data
                    existing_data = json_content
        
        # Check last update time from JSON metadata to avoid redundant API calls
        last_run_date = None
        if existing_metadata.get("lastUpdated"):
            try:
                last_updated = datetime.datetime.fromisoformat(existing_metadata["lastUpdated"])
                # Convert to date in the appropriate timezone
                if last_updated.tzinfo:
                    last_run_date = last_updated.date()
                else:
                    # Assume UTC if no timezone info
                    last_run_date = last_updated.date()
            except (ValueError, TypeError):
                logging.warning(f"Invalid lastUpdated format in metadata: {existing_metadata.get('lastUpdated')}")
        
        logging.info(f"Date range analysis: {start_date} to {today}")
        logging.info(f"Existing data contains {len(existing_data)} dates")
        
        # Find dates that need to be checked
        dates_to_check = []
        yesterday = today - datetime.timedelta(days=1)
        
        # Find missing dates between start_date and today
        current_date = start_date
        while current_date <= today:
            if current_date.isoformat() not in existing_data:
                dates_to_check.append((current_date, "missing data"))
            current_date += datetime.timedelta(days=1)
        
        # Always include today to ensure current data is correct
        if today >= start_date:
            today_reason = "ensure current data"
            if today not in [d[0] for d in dates_to_check]:
                today_reason = f"ensure current data"
                dates_to_check.append((today, today_reason))

        # Include yesterday only if we haven't run today yet
        if yesterday >= start_date:
            if last_run_date != today and yesterday not in [d[0] for d in dates_to_check]:
                yesterday_reason = "catch updates"
                dates_to_check.append((yesterday, yesterday_reason))
            elif last_run_date == today:
                logging.info(f"Skipping yesterday ({yesterday}) - already checked today")

        if dates_to_check:
            logging.info(f"Found {len(dates_to_check)} dates to check:")
            for date, reason in dates_to_check:
                existing_value = existing_data.get(date.isoformat())
                # Handle both old format (int) and new format (dict)
                if isinstance(existing_value, dict):
                    existing_steps = existing_value.get("steps", 0)
                    existing_km = existing_value.get("km", 0)
                    logging.info(f"  - {date}: existing steps={existing_steps}, km={existing_km}, reason={reason}")
                elif isinstance(existing_value, int):
                    logging.info(f"  - {date}: existing steps={existing_value}, reason={reason}")
                else:
                    logging.info(f"  - {date}: existing steps=0, reason={reason}")
        
        missing_dates = [d[0] for d in dates_to_check]
        
        if not missing_dates:
            logging.info("No missing dates to fetch.")
            return
        
        # Fetch data for missing dates only
        missing_dates.sort()
        fetch_start = missing_dates[0].isoformat()
        fetch_end = missing_dates[-1].isoformat()
        logging.info(f"Fetching stats for {len(missing_dates)} dates from {fetch_start} to {fetch_end}...")
        
        stats = garmin.get_daily_steps(fetch_start, fetch_end)
        logging.info(f"Garmin returned {len(stats)} entries for date range {fetch_start} to {fetch_end}")
        
        # Log the Garmin data for transparency
        for i, entry in enumerate(stats):
            date_str = entry['calendarDate']
            steps = entry['totalSteps']
            # Extract distance in meters and convert to km
            distance_meters = entry.get('totalDistance') or entry.get('totalDistanceMeters', 0)
            distance_km = round(distance_meters / 1000, 2) if distance_meters else 0
            # Log first entry structure to see available fields
            if i == 0:
                logging.info(f"  First entry keys: {list(entry.keys())}")
                logging.info(f"  First entry full data: {entry}")
            logging.info(f"  Garmin data: {date_str} = {steps} steps, {distance_km} km")

        # Update existing data with new stats
        data_points = existing_data.copy()
        new_count = 0
        updated_count = 0
        unchanged_count = 0

        for entry in stats:
            date_str = entry['calendarDate']
            steps = entry['totalSteps']
            # Extract distance in meters and convert to km
            distance_meters = entry.get('totalDistance') or entry.get('totalDistanceMeters', 0)
            distance_km = round(distance_meters / 1000, 2) if distance_meters else 0

            new_data = {"steps": steps, "km": distance_km}

            # Handle backward compatibility - old format was integer, new is object
            existing_value = data_points.get(date_str)
            if isinstance(existing_value, int):
                # Convert old format to new format for comparison
                existing_value = {"steps": existing_value, "km": 0}

            if date_str not in data_points or data_points[date_str] is None:
                # New date or date with None value
                data_points[date_str] = new_data
                new_count += 1
                logging.info(f"  NEW: {date_str} = {steps} steps, {distance_km} km")
            elif existing_value != new_data:
                # Updated date
                old_steps = existing_value.get("steps", 0) if isinstance(existing_value, dict) else existing_value
                old_km = existing_value.get("km", 0) if isinstance(existing_value, dict) else 0
                step_change = steps - old_steps
                km_change = distance_km - old_km
                data_points[date_str] = new_data
                updated_count += 1
                logging.info(f"  UPDATED: {date_str} = {steps} steps, {distance_km} km (was {old_steps} steps, {old_km} km, changes: {step_change:+d} steps, {km_change:+.2f} km)")
            else:
                # Unchanged date
                unchanged_count += 1
                logging.info(f"  UNCHANGED: {date_str} = {steps} steps, {distance_km} km (matches local data)")

        total_changes = new_count + updated_count
        logging.info(f"Comparison summary: {new_count} new, {updated_count} updated, {unchanged_count} unchanged")

        if total_changes == 0:
            logging.info("No new step data to update.")
            steps_updated = False
        else:
            # Create new JSON structure with metadata
            output_data = {
                "metadata": {
                    "lastUpdated": now_in_tz.isoformat(),
                    "timezone": timezone_str
                },
                "data": data_points
            }
            with open(json_path, "w") as f:
                json.dump(output_data, f, indent=2)
            logging.info(f"Database updated. {total_changes} days updated. Total days tracked: {len(data_points)}")
            steps_updated = True

        # Generate config.js with timezone and R2 URL settings
        config_path = os.path.join(repo_path, "config.js")
        config_changed = False
        
        # Build config object
        config_obj = {
            'TIMEZONE': timezone_str
        }
        
        # Add R2 URL if configured
        r2_public_url = os.getenv("R2_PUBLIC_URL")
        r2_bucket = os.getenv("R2_BUCKET_NAME", "step-tracker")
        r2_endpoint = os.getenv("R2_ENDPOINT_URL")
        
        if r2_public_url:
            config_obj['R2_DATA_URL'] = f"{r2_public_url.rstrip('/')}/steps_data.json"
        elif r2_endpoint and r2_bucket:
            # Use direct R2 endpoint (requires CORS setup)
            config_obj['R2_DATA_URL'] = f"{r2_endpoint.rstrip('/')}/{r2_bucket}/steps_data.json"
        
        # Generate expected config content
        config_lines = ["window.CONFIG = {"]
        config_items = list(config_obj.items())
        for i, (key, value) in enumerate(config_items):
            comma = "," if i < len(config_items) - 1 else ""
            config_lines.append(f"    {key}: '{value}'{comma}")
        config_lines.append("};")
        expected_config = "\n".join(config_lines) + "\n"
        
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                current_config = f.read()
                if current_config != expected_config:
                    config_changed = True
        else:
            config_changed = True

        if config_changed:
            with open(config_path, "w") as f:
                f.write(expected_config)
            logging.info(f"Config file updated with timezone: {timezone_str}")
            if 'R2_DATA_URL' in config_obj:
                logging.info(f"Config file updated with R2 URL: {config_obj['R2_DATA_URL']}")

        # Upload data changes to R2 instead of git commits
        data_changes = steps_updated or config_changed
        
        if data_changes:
            # Upload to R2
            upload_success = upload_to_r2(json_path, config_path)
            if upload_success:
                logging.info("Data successfully uploaded to R2")
            else:
                logging.warning("R2 upload failed or skipped - check R2 configuration")
        else:
            logging.info("No data changes to upload.")
        
        # Note: Last run tracking is now handled by the JSON metadata's lastUpdated field
        
        # Signal successful completion
        send_healthcheck_success()

    except Exception as e:
        logging.error(f"Error: {e}")
        send_healthcheck_failure(str(e))
        raise

if __name__ == "__main__":
    main()