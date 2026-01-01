import os
import json
import datetime
import logging
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
        logging.info(f"Fetching stats from {start_date} to {today}...")
        
        stats = garmin.get_daily_steps(start_date.isoformat(), today.isoformat())

        data_points = {}
        for entry in stats:
            date_str = entry['calendarDate']  # Keep as YYYY-MM-DD string
            steps = entry['totalSteps']
            data_points[date_str] = steps

        json_path = os.path.join(repo_path, "steps_data.json")
        with open(json_path, "w") as f:
            json.dump(data_points, f)
        logging.info(f"Database updated. Total days tracked: {len(data_points)}")

        # Generate config.js with timezone setting
        timezone = os.getenv("TIMEZONE", "Australia/Sydney")
        config_path = os.path.join(repo_path, "config.js")
        with open(config_path, "w") as f:
            f.write(f"window.CONFIG = {{\n")
            f.write(f"    TIMEZONE: '{timezone}'\n")
            f.write(f"}};\n")
        logging.info(f"Config file updated with timezone: {timezone}")

        repo = Repo(repo_path)
        if repo.is_dirty(untracked_files=True):
            logging.info("Changes detected. Pushing to GitHub...")
            repo.index.add(["steps_data.json", "config.js"])
            repo.index.commit(f"Update steps: {today}")
            origin = repo.remote(name='origin')
            origin.push()
            logging.info("Push successful.")
        else:
            logging.info("No changes to push.")

    except Exception as e:
        logging.error(f"Error: {e}")

if __name__ == "__main__":
    main()