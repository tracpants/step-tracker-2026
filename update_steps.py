import os
import json
import datetime
import logging
import subprocess
from garminconnect import Garmin
from dotenv import load_dotenv
from git import Repo

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def main():
    load_dotenv()
    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")
    repo_path = os.getcwd()

    if not email or not password:
        logging.error("Credentials missing. Please check .env file.")
        return

    try:
        logging.info("Authenticating with Garmin...")
        garmin = Garmin(email, password)
        garmin.login()

        today = datetime.date.today()
        start_date = datetime.date(2026, 1, 1)
        json_path = os.path.join(repo_path, "steps_data.json")
        
        # Read existing data to determine what dates we need to fetch
        existing_data = {}
        if os.path.exists(json_path):
            with open(json_path, "r") as f:
                existing_data = json.load(f)
        
        # Check last run date to avoid redundant API calls
        last_run_file = os.path.join(repo_path, ".last_run")
        last_run_date = None
        if os.path.exists(last_run_file):
            with open(last_run_file, "r") as f:
                last_run_str = f.read().strip()
                if last_run_str:
                    last_run_date = datetime.date.fromisoformat(last_run_str)
        
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
                existing_steps = existing_data.get(today.isoformat(), 0)
                today_reason = f"ensure current data"
                dates_to_check.append((today, today_reason))
            
        # Include yesterday only if we haven't run today yet
        if yesterday >= start_date:
            if last_run_date != today and yesterday not in [d[0] for d in dates_to_check]:
                existing_steps = existing_data.get(yesterday.isoformat(), 0)
                yesterday_reason = "catch updates"
                dates_to_check.append((yesterday, yesterday_reason))
            elif last_run_date == today:
                logging.info(f"Skipping yesterday ({yesterday}) - already checked today")
        
        if dates_to_check:
            logging.info(f"Found {len(dates_to_check)} dates to check:")
            for date, reason in dates_to_check:
                existing_steps = existing_data.get(date.isoformat(), 0)
                logging.info(f"  - {date}: existing steps={existing_steps}, reason={reason}")
        
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
        for entry in stats:
            date_str = entry['calendarDate']
            steps = entry['totalSteps']
            logging.info(f"  Garmin data: {date_str} = {steps} steps")

        # Update existing data with new stats
        data_points = existing_data.copy()
        new_count = 0
        updated_count = 0
        unchanged_count = 0
        
        for entry in stats:
            date_str = entry['calendarDate']
            steps = entry['totalSteps']
            
            if date_str not in data_points:
                # New date
                data_points[date_str] = steps
                new_count += 1
                logging.info(f"  NEW: {date_str} = {steps} steps")
            elif data_points[date_str] != steps:
                # Updated date
                old_steps = data_points[date_str]
                change = steps - old_steps
                data_points[date_str] = steps
                updated_count += 1
                logging.info(f"  UPDATED: {date_str} = {steps} steps (was {old_steps}, change: {change:+d})")
            else:
                # Unchanged date
                unchanged_count += 1
                logging.info(f"  UNCHANGED: {date_str} = {steps} steps (matches local data)")

        total_changes = new_count + updated_count
        logging.info(f"Comparison summary: {new_count} new, {updated_count} updated, {unchanged_count} unchanged")

        if total_changes == 0:
            logging.info("No new step data to update.")
            steps_updated = False
        else:
            with open(json_path, "w") as f:
                json.dump(data_points, f, sort_keys=True)
            logging.info(f"Database updated. {total_changes} days updated. Total days tracked: {len(data_points)}")
            steps_updated = True

        # Generate config.js with timezone setting only if changed
        timezone = os.getenv("TIMEZONE", "Australia/Sydney")
        config_path = os.path.join(repo_path, "config.js")
        config_changed = False
        
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                current_config = f.read()
                expected_config = f"window.CONFIG = {{\n    TIMEZONE: '{timezone}'\n}};\n"
                if current_config != expected_config:
                    config_changed = True
        else:
            config_changed = True
            
        if config_changed:
            with open(config_path, "w") as f:
                f.write(f"window.CONFIG = {{\n")
                f.write(f"    TIMEZONE: '{timezone}'\n")
                f.write(f"}};\n")
            logging.info(f"Config file updated with timezone: {timezone}")

        # Only commit and push if we have actual changes
        repo = Repo(repo_path)
        files_to_add = []
        
        # Always check if steps_data.json is modified and add it if needed
        if steps_updated or repo.is_dirty(path="steps_data.json"):
            files_to_add.append("steps_data.json")
        
        # Only add config.js if it changed
        if config_changed:
            files_to_add.append("config.js")
        
        if files_to_add:
            logging.info(f"Changes detected in: {', '.join(files_to_add)}. Committing and pushing...")
            repo.index.add(files_to_add)
            repo.index.commit(f"Update steps: {today}")
            
            # Use GitHub CLI for reliable pushing
            try:
                subprocess.run(['gh', 'repo', 'sync'], 
                             capture_output=True, text=True, check=True)
                logging.info("Push successful via GitHub CLI sync.")
            except subprocess.CalledProcessError as e:
                logging.warning(f"GitHub CLI sync failed: {e.stderr}")
                # Handle diverging changes with rebase and retry
                if "diverging changes" in e.stderr:
                    try:
                        # Try to rebase and retry sync
                        subprocess.run(['git', 'pull', '--rebase', 'origin', 'master'], 
                                     capture_output=True, text=True, check=True)
                        subprocess.run(['gh', 'repo', 'sync'], 
                                     capture_output=True, text=True, check=True)
                        logging.info("Push successful via GitHub CLI sync after rebase.")
                    except subprocess.CalledProcessError as rebase_error:
                        logging.error(f"Rebase and retry failed: {rebase_error.stderr}")
                        # Final fallback to git push
                        try:
                            subprocess.run(['git', 'push'], 
                                         capture_output=True, text=True, check=True)
                            logging.info("Push successful via git push.")
                        except subprocess.CalledProcessError as git_error:
                            logging.error(f"Git push also failed: {git_error.stderr}")
                            raise
                else:
                    # For other GitHub CLI errors, fallback to git push
                    try:
                        subprocess.run(['git', 'push'], 
                                     capture_output=True, text=True, check=True)
                        logging.info("Push successful via git push.")
                    except subprocess.CalledProcessError as git_error:
                        logging.error(f"Git push also failed: {git_error.stderr}")
                        raise
        else:
            logging.info("No changes to commit.")
        
        # Update last run date to avoid redundant API calls on subsequent runs
        with open(last_run_file, "w") as f:
            f.write(today.isoformat())

    except Exception as e:
        logging.error(f"Error: {e}")

if __name__ == "__main__":
    main()