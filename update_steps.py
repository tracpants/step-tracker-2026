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
        
        # Find missing dates between start_date and today
        missing_dates = []
        current_date = start_date
        while current_date <= today:
            if current_date.isoformat() not in existing_data:
                missing_dates.append(current_date)
            current_date += datetime.timedelta(days=1)
        
        # Always include today to ensure current data is correct
        if today >= start_date and today not in missing_dates:
            missing_dates.append(today)
            
        # Always include yesterday (if it's in 2026) to catch any updates
        yesterday = today - datetime.timedelta(days=1)
        if yesterday >= start_date and yesterday not in missing_dates:
            missing_dates.append(yesterday)
        
        if not missing_dates:
            logging.info("No missing dates to fetch.")
            return
        
        # Fetch data for missing dates only
        missing_dates.sort()
        fetch_start = missing_dates[0].isoformat()
        fetch_end = missing_dates[-1].isoformat()
        logging.info(f"Fetching stats for {len(missing_dates)} missing dates from {fetch_start} to {fetch_end}...")
        
        stats = garmin.get_daily_steps(fetch_start, fetch_end)

        # Update existing data with new stats
        data_points = existing_data.copy()
        updated_count = 0
        for entry in stats:
            date_str = entry['calendarDate']
            steps = entry['totalSteps']
            if date_str not in data_points or data_points[date_str] != steps:
                data_points[date_str] = steps
                updated_count += 1

        if updated_count == 0:
            logging.info("No new step data to update.")
            # Still check config.js in case timezone changed
            steps_updated = False
        else:
            with open(json_path, "w") as f:
                json.dump(data_points, f, sort_keys=True)
            logging.info(f"Database updated. {updated_count} days updated. Total days tracked: {len(data_points)}")
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
        
        # Add steps_data.json only if step data was updated
        if steps_updated:
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
                result = subprocess.run(['gh', 'repo', 'sync'], 
                                      capture_output=True, text=True, check=True)
                logging.info("Push successful via GitHub CLI.")
            except subprocess.CalledProcessError as e:
                logging.error(f"GitHub CLI push failed: {e.stderr}")
                # Fallback to regular git push
                try:
                    result = subprocess.run(['git', 'push'], 
                                          capture_output=True, text=True, check=True)
                    logging.info("Push successful via git.")
                except subprocess.CalledProcessError as git_error:
                    logging.error(f"Git push also failed: {git_error.stderr}")
                    raise
        else:
            logging.info("No changes to commit.")

    except Exception as e:
        logging.error(f"Error: {e}")

if __name__ == "__main__":
    main()