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

def get_current_branch(repo_path):
    """Get the current git branch name"""
    try:
        result = subprocess.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], 
                              capture_output=True, text=True, check=True, cwd=repo_path)
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return None

def ensure_clean_git_state(repo_path):
    """Ensure we're on master branch with a clean state before starting"""
    repo = Repo(repo_path)
    
    # Check if we're in detached HEAD state
    if repo.head.is_detached:
        logging.warning("Detached HEAD detected - cleaning up...")
        # Abort any in-progress operations
        subprocess.run(['git', 'rebase', '--abort'], capture_output=True, cwd=repo_path)
        subprocess.run(['git', 'cherry-pick', '--abort'], capture_output=True, cwd=repo_path)
        subprocess.run(['git', 'merge', '--abort'], capture_output=True, cwd=repo_path)
        # Checkout master
        subprocess.run(['git', 'checkout', 'master'], check=True, cwd=repo_path)
        logging.info("Checked out master branch")
    
    # Check if we have any uncommitted changes
    status_result = subprocess.run(['git', 'status', '--porcelain'], 
                                 capture_output=True, text=True, cwd=repo_path)
    if status_result.stdout.strip():
        logging.info("Uncommitted changes detected - stashing before pull")
        subprocess.run(['git', 'stash', 'push', '-m', 'Auto-stash before step update'], 
                      check=True, cwd=repo_path)
        stashed = True
    else:
        stashed = False
    
    # Pull latest changes before we start making modifications
    try:
        subprocess.run(['git', 'pull', '--rebase', 'origin', 'master'], 
                      capture_output=True, text=True, check=True, cwd=repo_path)
        logging.info("Pulled latest changes from origin")
    except subprocess.CalledProcessError as e:
        # If pull failed and we're now detached, recover
        if Repo(repo_path).head.is_detached:
            logging.warning(f"Pull/rebase failed and left detached HEAD: {e.stderr}")
            subprocess.run(['git', 'rebase', '--abort'], check=True, cwd=repo_path)
            subprocess.run(['git', 'checkout', 'master'], check=True, cwd=repo_path)
            subprocess.run(['git', 'reset', '--hard', 'origin/master'], check=True, cwd=repo_path)
            logging.info("Reset to origin/master after failed rebase")
        else:
            logging.warning(f"Pull failed but continuing: {e.stderr}")
    
    # Restore stashed changes if we stashed any
    if stashed:
        try:
            subprocess.run(['git', 'stash', 'pop'], check=True, cwd=repo_path)
            logging.info("Restored stashed changes")
        except subprocess.CalledProcessError:
            logging.warning("Failed to restore stashed changes - continuing anyway")

def copy_data_from_gh_pages(repo_path):
    """Copy data files from gh-pages branch to working directory"""
    try:
        # Copy steps_data.json from gh-pages branch if it exists
        try:
            subprocess.run(['git', 'show', 'gh-pages:steps_data.json'], 
                         stdout=open('steps_data.json', 'w'), 
                         check=True, cwd=repo_path)
            logging.info("Copied steps_data.json from gh-pages branch")
        except subprocess.CalledProcessError:
            logging.info("steps_data.json not found in gh-pages, will create new")
        
        # Copy config.js from gh-pages branch if it exists
        try:
            subprocess.run(['git', 'show', 'gh-pages:config.js'], 
                         stdout=open('config.js', 'w'), 
                         check=True, cwd=repo_path)
            logging.info("Copied config.js from gh-pages branch")
        except subprocess.CalledProcessError:
            logging.info("config.js not found in gh-pages, will create new")
            
    except Exception as e:
        logging.warning(f"Failed to copy data files from gh-pages: {e}")

def commit_data_to_gh_pages(repo_path, json_path, config_path, today):
    """Commit data changes to gh-pages branch"""
    try:
        # Store current branch
        current_branch = get_current_branch(repo_path)
        logging.info(f"Current branch: {current_branch}")
        
        # Handle data files before switching branches
        # We'll temporarily move them aside and restore them after switching
        temp_data = {}
        data_files = ['steps_data.json', 'config.js']
        for file in data_files:
            if os.path.exists(file):
                with open(file, 'r') as f:
                    temp_data[file] = f.read()
                os.remove(file)
                logging.info(f"Temporarily moved {file} aside")
        
        # Switch to gh-pages branch
        logging.info("Switching to gh-pages branch for data update...")
        subprocess.run(['git', 'checkout', 'gh-pages'], check=True, cwd=repo_path)
        
        # Restore the data files
        for file, content in temp_data.items():
            with open(file, 'w') as f:
                f.write(content)
            logging.info(f"Restored {file}")
        
        # Pull latest changes from gh-pages
        try:
            subprocess.run(['git', 'pull', 'origin', 'gh-pages'], 
                          capture_output=True, text=True, check=True, cwd=repo_path)
            logging.info("Pulled latest changes from gh-pages")
        except subprocess.CalledProcessError as e:
            logging.warning(f"Pull from gh-pages failed: {e.stderr}")
        
        # Copy updated files from master branch working directory
        # The files should already be updated in the working directory
        files_to_commit = []
        
        # Check if steps_data.json has changes
        status_result = subprocess.run(['git', 'status', '--porcelain', 'steps_data.json'], 
                                     capture_output=True, text=True, cwd=repo_path)
        if status_result.stdout.strip():
            files_to_commit.append("steps_data.json")
        
        # Check if config.js has changes 
        status_result = subprocess.run(['git', 'status', '--porcelain', 'config.js'], 
                                     capture_output=True, text=True, cwd=repo_path)
        if status_result.stdout.strip():
            files_to_commit.append("config.js")
        
        if files_to_commit:
            logging.info(f"Committing data changes to gh-pages: {', '.join(files_to_commit)}")
            subprocess.run(['git', 'add'] + files_to_commit, check=True, cwd=repo_path)
            subprocess.run(['git', 'commit', '-m', f'Update steps: {today}'], check=True, cwd=repo_path)
            
            # Push to gh-pages
            logging.info("Pushing data changes to gh-pages...")
            subprocess.run(['git', 'push', 'origin', 'gh-pages'], 
                         capture_output=True, text=True, check=True, cwd=repo_path)
            logging.info("Data push to gh-pages successful.")
            return True
        else:
            logging.info("No data changes to commit to gh-pages.")
            return False
            
    except subprocess.CalledProcessError as e:
        logging.error(f"Failed to commit to gh-pages: {e}")
        raise
    finally:
        # Always switch back to the original branch
        if current_branch:
            logging.info(f"Switching back to {current_branch} branch...")
            subprocess.run(['git', 'checkout', current_branch], check=True, cwd=repo_path)
        else:
            logging.warning("Could not determine original branch, staying on current branch")

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
        # Ensure clean git state before starting
        ensure_clean_git_state(repo_path)
        
        # Copy data files from gh-pages branch to working directory
        copy_data_from_gh_pages(repo_path)

        logging.info("Authenticating with Garmin...")
        garmin = Garmin(email, password)
        garmin.login()

        # Get today's date in the configured timezone
        tz = ZoneInfo(timezone_str)
        now_in_tz = datetime.datetime.now(tz)
        today = now_in_tz.date()
        logging.info(f"Current date in {timezone_str}: {today} (UTC would be: {datetime.date.today()})")

        start_date = datetime.date(2026, 1, 1)
        json_path = os.path.join(repo_path, "steps_data.json")
        
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

        # Generate config.js with timezone setting only if changed
        config_path = os.path.join(repo_path, "config.js")
        config_changed = False
        
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                current_config = f.read()
                expected_config = f"window.CONFIG = {{\n    TIMEZONE: '{timezone_str}'\n}};\n"
                if current_config != expected_config:
                    config_changed = True
        else:
            config_changed = True

        if config_changed:
            with open(config_path, "w") as f:
                f.write(f"window.CONFIG = {{\n")
                f.write(f"    TIMEZONE: '{timezone_str}'\n")
                f.write(f"}};\n")
            logging.info(f"Config file updated with timezone: {timezone_str}")

        # Only commit data changes if we have actual changes
        # Data changes (steps_data.json, config.js) go to gh-pages branch
        # Code changes would go to master branch (but we don't expect any in this script)
        
        data_changes = steps_updated or config_changed
        
        if data_changes:
            # Use the new function to commit data to gh-pages branch
            commit_data_to_gh_pages(repo_path, json_path, config_path, today)
        else:
            logging.info("No data changes to commit.")
        
        # Note: Last run tracking is now handled by the JSON metadata's lastUpdated field
        
        # Signal successful completion
        send_healthcheck_success()

    except Exception as e:
        logging.error(f"Error: {e}")
        send_healthcheck_failure(str(e))
        raise

if __name__ == "__main__":
    main()