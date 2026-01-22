import os
import json
import datetime
import logging
import subprocess
import requests
import time
import argparse
from zoneinfo import ZoneInfo
from garminconnect import Garmin
from dotenv import load_dotenv
from git import Repo
import boto3
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Custom exception classes for better error handling
class GarminAuthenticationError(Exception):
    """Raised when Garmin authentication fails"""
    pass

class GarminAPIError(Exception):
    """Raised when Garmin API calls fail"""
    pass

class GarminNetworkError(Exception):
    """Raised when network connectivity issues occur"""
    pass

class GarminTemporaryError(Exception):
    """Raised for temporary errors that should be retried"""
    pass

# Custom exception classes for R2 error handling
class R2AuthenticationError(Exception):
    """Raised when R2 authentication/authorization fails"""
    pass

class R2NetworkError(Exception):
    """Raised when R2 network connectivity issues occur"""
    pass

class R2ServiceError(Exception):
    """Raised when R2 service is unavailable"""
    pass

class R2ThrottleError(Exception):
    """Raised when R2 rate limiting occurs"""
    pass

class R2StorageError(Exception):
    """Raised when R2 storage quota or disk space issues occur"""
    pass

# Track if we've already logged about missing healthcheck URL
_healthcheck_skip_logged = False

def retry_with_backoff(func, max_retries=3, base_delay=1, max_delay=60, backoff_factor=2, exceptions=(Exception,), send_retry_updates=False):
    """
    Retry a function with exponential backoff
    
    Args:
        func: Function to retry
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay between retries
        backoff_factor: Multiplier for delay between retries
        exceptions: Tuple of exceptions to catch and retry on
        send_retry_updates: Whether to send health check updates during retries
    
    Returns:
        The result of the successful function call
    
    Raises:
        The last exception encountered after all retries are exhausted
    """
    last_exception = None
    
    for attempt in range(max_retries + 1):  # +1 to include the initial attempt
        try:
            return func()
        except exceptions as e:
            last_exception = e
            
            if attempt == max_retries:
                func_name = getattr(func, '__name__', 'unknown')
                logging.error(f"Function {func_name} failed after {max_retries} retries. Final error: {e}")
                raise e
            
            delay = min(base_delay * (backoff_factor ** attempt), max_delay)
            logging.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay:.1f}s...")
            
            # Send health check update during retries if requested
            if send_retry_updates:
                send_healthcheck_with_retry_status(attempt + 1, max_retries, str(e))
            
            time.sleep(delay)
    
    # This line should never be reached, but included for completeness
    if last_exception:
        raise last_exception

def garmin_login_with_retry(email, password, max_retries=3):
    """
    Login to Garmin with retry logic and proper error handling
    
    Args:
        email: Garmin Connect email
        password: Garmin Connect password
        max_retries: Maximum number of retry attempts
    
    Returns:
        Authenticated Garmin instance
    
    Raises:
        GarminAuthenticationError: For authentication failures
        GarminNetworkError: For network connectivity issues
        GarminTemporaryError: For temporary errors that should be retried
    """
    def login_attempt():
        try:
            garmin = Garmin(email, password)
            garmin.login()
            logging.info("Successfully authenticated with Garmin Connect")
            return garmin
        except Exception as e:
            error_msg = str(e).lower()
            
            # Categorize the error
            if any(term in error_msg for term in ['authentication', 'credential', 'login', 'password', 'unauthorized', 'forbidden']):
                raise GarminAuthenticationError(f"Garmin authentication failed: {e}")
            elif any(term in error_msg for term in ['network', 'connection', 'timeout', 'dns', 'socket']):
                raise GarminNetworkError(f"Network error during Garmin login: {e}")
            elif any(term in error_msg for term in ['rate limit', 'too many', 'busy', 'server', '5']):
                raise GarminTemporaryError(f"Temporary Garmin service issue: {e}")
            else:
                # Unknown error, treat as temporary and retry
                raise GarminTemporaryError(f"Unknown Garmin login error: {e}")
    
    # Retry only temporary errors and network errors
    retryable_exceptions = (GarminTemporaryError, GarminNetworkError)
    
    try:
        return retry_with_backoff(
            login_attempt, 
            max_retries=max_retries,
            base_delay=2,
            exceptions=retryable_exceptions,
            send_retry_updates=True
        )
    except GarminAuthenticationError:
        # Authentication errors should not be retried
        raise
    except (GarminTemporaryError, GarminNetworkError) as e:
        # Convert final retry failure to appropriate error
        logging.error(f"Garmin login failed after {max_retries} retries: {e}")
        raise

def garmin_get_steps_with_retry(garmin, start_date, end_date, max_retries=5):
    """
    Get daily steps from Garmin with retry logic and proper error handling
    
    Args:
        garmin: Authenticated Garmin instance
        start_date: Start date (ISO format string)
        end_date: End date (ISO format string)
        max_retries: Maximum number of retry attempts
    
    Returns:
        List of daily step data
    
    Raises:
        GarminAPIError: For API failures
        GarminNetworkError: For network connectivity issues
        GarminTemporaryError: For temporary errors that should be retried
    """
    def api_call_attempt():
        try:
            stats = garmin.get_daily_steps(start_date, end_date)
            logging.info(f"Successfully fetched {len(stats)} days of step data from Garmin")
            return stats
        except Exception as e:
            error_msg = str(e).lower()
            
            # Categorize the error
            if any(term in error_msg for term in ['api', 'invalid request', '400', '404', 'not found']):
                raise GarminAPIError(f"Garmin API error: {e}")
            elif any(term in error_msg for term in ['network', 'connection', 'timeout', 'dns', 'socket']):
                raise GarminNetworkError(f"Network error during Garmin API call: {e}")
            elif any(term in error_msg for term in ['rate limit', 'too many', 'busy', 'server', '5', 'unavailable']):
                raise GarminTemporaryError(f"Temporary Garmin API issue: {e}")
            elif any(term in error_msg for term in ['authentication', 'unauthorized', '401', '403']):
                raise GarminAuthenticationError(f"Garmin session expired or unauthorized: {e}")
            else:
                # Unknown error, treat as temporary and retry
                raise GarminTemporaryError(f"Unknown Garmin API error: {e}")
    
    # Retry temporary errors and network errors
    retryable_exceptions = (GarminTemporaryError, GarminNetworkError)
    
    try:
        return retry_with_backoff(
            api_call_attempt,
            max_retries=max_retries,
            base_delay=1,
            exceptions=retryable_exceptions,
            send_retry_updates=True
        )
    except GarminAPIError:
        # API errors should not be retried
        raise
    except GarminAuthenticationError:
        # Authentication errors should not be retried
        raise
    except (GarminTemporaryError, GarminNetworkError) as e:
        # Convert final retry failure to appropriate error
        logging.error(f"Garmin API call failed after {max_retries} retries: {e}")
        raise

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

def send_healthcheck_warning(warning_message=None):
    """Signal script partial success or warning with optional details"""
    data = f"Step tracker warning: {warning_message}" if warning_message else "Step tracker warning"
    send_healthcheck("/log", data)

def send_healthcheck_with_retry_status(retry_count, max_retries, error_message):
    """Signal retry status during API failures"""
    data = f"Step tracker retry {retry_count}/{max_retries}: {error_message}"
    send_healthcheck("/log", data)

# Git functions removed - using R2 for data storage instead

def classify_r2_error(error):
    """
    Classify R2/S3 errors into appropriate exception types
    
    Args:
        error: The exception or error response to classify
    
    Returns:
        Appropriate custom exception instance
    """
    if isinstance(error, ClientError):
        error_code = error.response.get('Error', {}).get('Code', '')
        error_message = error.response.get('Error', {}).get('Message', str(error))
        
        # Authentication/Authorization errors
        if error_code in ['NoCredentialsError', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', 'NoSuchBucket', 'AccessDenied']:
            return R2AuthenticationError(f"R2 authentication failed: {error_message} (Code: {error_code})")
        
        # Throttling/Rate limiting errors
        elif error_code in ['SlowDown', 'RequestLimitExceeded', 'TooManyRequests']:
            return R2ThrottleError(f"R2 rate limit exceeded: {error_message} (Code: {error_code})")
        
        # Service unavailability errors
        elif error_code in ['ServiceUnavailable', 'RequestTimeout', 'InternalError']:
            return R2ServiceError(f"R2 service unavailable: {error_message} (Code: {error_code})")
        
        # Storage quota/space errors
        elif error_code in ['BucketNotEmpty', 'EntityTooLarge', 'InsufficientStorage']:
            return R2StorageError(f"R2 storage issue: {error_message} (Code: {error_code})")
        
        # Network/connectivity errors
        elif error_code in ['NetworkingError', 'ConnectionError']:
            return R2NetworkError(f"R2 network error: {error_message} (Code: {error_code})")
        
        else:
            # Unknown ClientError, treat as service error for retry
            return R2ServiceError(f"Unknown R2 error: {error_message} (Code: {error_code})")
    
    else:
        # Non-ClientError exceptions (network, timeout, etc.)
        error_msg = str(error).lower()
        
        if any(term in error_msg for term in ['network', 'connection', 'timeout', 'dns', 'socket', 'resolve']):
            return R2NetworkError(f"R2 network error: {error}")
        elif any(term in error_msg for term in ['credential', 'auth', 'permission', 'access']):
            return R2AuthenticationError(f"R2 authentication error: {error}")
        else:
            # Default to service error for unknown exceptions
            return R2ServiceError(f"R2 service error: {error}")

def create_r2_client_with_retry(max_retries=3):
    """
    Create R2 S3 client with retry logic and proper error handling
    
    Args:
        max_retries: Maximum number of retry attempts
    
    Returns:
        Configured S3 client for R2
    
    Raises:
        R2AuthenticationError: For credential/config issues
        R2NetworkError: For network connectivity issues
        R2ServiceError: For service unavailability
    """
    def create_client():
        try:
            # Get R2 configuration from environment
            r2_endpoint = os.getenv("R2_ENDPOINT_URL")
            r2_access_key = os.getenv("R2_ACCESS_KEY_ID")
            r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
            
            if not all([r2_endpoint, r2_access_key, r2_secret_key]):
                raise R2AuthenticationError("R2 configuration incomplete - set R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables")
            
            # Configure S3 client for R2 with timeout settings
            timeout_seconds = int(os.getenv("R2_UPLOAD_TIMEOUT", "30"))
            
            s3_client = boto3.client(
                's3',
                endpoint_url=r2_endpoint,
                aws_access_key_id=r2_access_key,
                aws_secret_access_key=r2_secret_key,
                region_name='auto',  # R2 uses 'auto' for region
                config=boto3.session.Config(
                    retries={'max_attempts': 0},  # Disable boto3's built-in retries since we handle them
                    read_timeout=timeout_seconds,
                    connect_timeout=timeout_seconds
                )
            )
            
            logging.info("Successfully created R2 S3 client")
            return s3_client
            
        except Exception as e:
            # Classify and re-raise the error
            classified_error = classify_r2_error(e)
            logging.error(f"Failed to create R2 client: {classified_error}")
            raise classified_error
    
    # Retry only network and service errors
    retryable_exceptions = (R2NetworkError, R2ServiceError)
    
    try:
        return retry_with_backoff(
            create_client,
            max_retries=max_retries,
            base_delay=2,
            exceptions=retryable_exceptions,
            send_retry_updates=True
        )
    except R2AuthenticationError:
        # Authentication errors should not be retried
        raise
    except (R2NetworkError, R2ServiceError) as e:
        # Convert final retry failure to appropriate error
        logging.error(f"R2 client creation failed after {max_retries} retries: {e}")
        raise

def upload_file_to_r2_with_retry(s3_client, bucket, key, content, content_type, cache_control, max_retries=3):
    """
    Upload a single file to R2 with retry logic and proper error handling
    
    Args:
        s3_client: Configured S3 client for R2
        bucket: R2 bucket name
        key: Object key (filename)
        content: File content to upload
        content_type: MIME content type
        cache_control: Cache control header
        max_retries: Maximum number of retry attempts
    
    Returns:
        True if upload successful
    
    Raises:
        R2AuthenticationError: For auth/permission failures
        R2ThrottleError: For rate limiting
        R2StorageError: For storage issues
        R2ServiceError: For service unavailability
        R2NetworkError: For network issues
    """
    def upload_attempt():
        try:
            s3_client.put_object(
                Bucket=bucket,
                Key=key,
                Body=content,
                ContentType=content_type,
                CacheControl=cache_control
            )
            logging.info(f"Successfully uploaded {key} to R2 ({len(content)} bytes)")
            return True
            
        except Exception as e:
            # Classify and re-raise the error
            classified_error = classify_r2_error(e)
            logging.warning(f"Upload attempt failed for {key}: {classified_error}")
            raise classified_error
    
    # Retry network, service, and throttle errors
    retryable_exceptions = (R2NetworkError, R2ServiceError, R2ThrottleError)
    
    try:
        return retry_with_backoff(
            upload_attempt,
            max_retries=max_retries,
            base_delay=1,
            max_delay=30,  # Cap at 30 seconds for uploads
            exceptions=retryable_exceptions,
            send_retry_updates=True
        )
    except (R2AuthenticationError, R2StorageError):
        # Auth and storage errors should not be retried
        raise
    except (R2NetworkError, R2ServiceError, R2ThrottleError) as e:
        # Convert final retry failure to appropriate error
        logging.error(f"File upload {key} failed after {max_retries} retries: {e}")
        raise

def upload_to_r2(json_data, config_content):
    """
    Upload data directly to Cloudflare R2 with retry logic and proper error handling
    
    Args:
        json_data: JSON data to upload as steps_data.json
        config_content: JavaScript config content to upload as config.js
    
    Returns:
        bool: True if all uploads successful, False otherwise
    """
    # Get retry configuration from environment
    max_retries = int(os.getenv("R2_UPLOAD_RETRY_COUNT", "3"))
    r2_bucket = os.getenv("R2_BUCKET_NAME", "step-tracker")
    
    # Track upload operations for transactional behavior
    upload_operations = []
    successful_uploads = []
    failed_uploads = []
    
    # Prepare upload operations
    if json_data and (json_data.get('data') or json_data.get('metadata')):
        json_content = json.dumps(json_data, indent=2)
        upload_operations.append({
            'key': 'steps_data.json',
            'content': json_content,
            'content_type': 'application/json',
            'cache_control': 'max-age=300',  # 5 minute cache
            'description': f"step data ({len(json_data.get('data', {}))} days)"
        })
    
    if config_content:
        upload_operations.append({
            'key': 'config.js', 
            'content': config_content,
            'content_type': 'application/javascript',
            'cache_control': 'max-age=3600',  # 1 hour cache
            'description': "configuration"
        })
    
    if not upload_operations:
        logging.info("No files to upload to R2")
        return True  # Success - nothing to do
    
    try:
        # Create R2 client with retry logic
        logging.info(f"Creating R2 client for {len(upload_operations)} file(s)")
        try:
            s3_client = create_r2_client_with_retry(max_retries)
        except R2AuthenticationError as e:
            logging.error(f"R2 authentication failed: {e}")
            send_healthcheck_failure(f"R2 authentication failed: {str(e)}")
            return False
        except (R2NetworkError, R2ServiceError) as e:
            logging.error(f"R2 client creation failed: {e}")
            send_healthcheck_failure(f"R2 connection failed: {str(e)}")
            return False
        
        # Perform uploads with individual retry logic
        logging.info(f"Starting upload of {len(upload_operations)} files to R2")
        
        for operation in upload_operations:
            key = operation['key']
            
            try:
                upload_file_to_r2_with_retry(
                    s3_client=s3_client,
                    bucket=r2_bucket,
                    key=key,
                    content=operation['content'],
                    content_type=operation['content_type'],
                    cache_control=operation['cache_control'],
                    max_retries=max_retries
                )
                
                successful_uploads.append({
                    'key': key,
                    'size': len(operation['content']),
                    'description': operation['description']
                })
                logging.info(f"Successfully uploaded {key}: {operation['description']}")
                
            except R2AuthenticationError as e:
                logging.error(f"Authentication failed for {key}: {e}")
                failed_uploads.append({'key': key, 'error': 'authentication', 'message': str(e)})
                
            except R2StorageError as e:
                logging.error(f"Storage error for {key}: {e}")
                failed_uploads.append({'key': key, 'error': 'storage', 'message': str(e)})
                
            except (R2NetworkError, R2ServiceError, R2ThrottleError) as e:
                logging.error(f"Upload failed for {key} after retries: {e}")
                failed_uploads.append({'key': key, 'error': 'transient', 'message': str(e)})
        
        # Analyze results and provide detailed reporting
        total_files = len(upload_operations)
        success_count = len(successful_uploads)
        failure_count = len(failed_uploads)
        
        if success_count == total_files:
            # Complete success
            file_details = ', '.join([f"{u['key']} ({u['size']} bytes)" for u in successful_uploads])
            logging.info(f"All {total_files} files uploaded successfully to R2: {file_details}")
            return True
            
        elif success_count > 0:
            # Partial success - some files uploaded
            successful_keys = [u['key'] for u in successful_uploads]
            failed_keys = [f['key'] for f in failed_uploads]
            
            logging.warning(f"Partial R2 upload: {success_count}/{total_files} files succeeded")
            logging.info(f"Successful uploads: {', '.join(successful_keys)}")
            logging.error(f"Failed uploads: {', '.join(failed_keys)}")
            
            # For partial failures, we still return False but provide detailed health check
            auth_failures = [f for f in failed_uploads if f['error'] == 'authentication']
            storage_failures = [f for f in failed_uploads if f['error'] == 'storage'] 
            transient_failures = [f for f in failed_uploads if f['error'] == 'transient']
            
            if auth_failures:
                send_healthcheck_failure(f"R2 authentication failed for {len(auth_failures)} files")
            elif storage_failures:
                send_healthcheck_failure(f"R2 storage issues for {len(storage_failures)} files")
            else:
                send_healthcheck_warning(f"R2 partial upload: {success_count}/{total_files} files succeeded")
            
            return False
            
        else:
            # Complete failure
            logging.error(f"All R2 uploads failed ({failure_count} files)")
            
            # Categorize failures for appropriate health check response
            auth_failures = [f for f in failed_uploads if f['error'] == 'authentication']
            storage_failures = [f for f in failed_uploads if f['error'] == 'storage']
            
            if auth_failures:
                send_healthcheck_failure("R2 authentication failed for all uploads")
            elif storage_failures:
                send_healthcheck_failure("R2 storage issues prevented all uploads")
            else:
                send_healthcheck_failure("R2 service unavailable - all uploads failed")
            
            return False
            
    except Exception as e:
        # Unexpected error during upload process
        logging.error(f"Unexpected R2 upload error: {e}")
        send_healthcheck_failure(f"R2 upload error: {str(e)}")
        return False

def download_from_r2():
    """Download existing data from R2 and return as dict"""
    try:
        r2_endpoint = os.getenv("R2_ENDPOINT_URL")
        r2_access_key = os.getenv("R2_ACCESS_KEY_ID")
        r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        r2_bucket = os.getenv("R2_BUCKET_NAME", "step-tracker")
        
        if not all([r2_endpoint, r2_access_key, r2_secret_key]):
            logging.info("R2 not configured - starting with empty data")
            return None
        
        s3_client = boto3.client(
            's3',
            endpoint_url=r2_endpoint,
            aws_access_key_id=r2_access_key,
            aws_secret_access_key=r2_secret_key,
            region_name='auto'
        )
        
        try:
            response = s3_client.get_object(Bucket=r2_bucket, Key='steps_data.json')
            json_content = response['Body'].read().decode('utf-8')
            data = json.loads(json_content)
            logging.info("Downloaded existing data from R2")
            return data
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                logging.info("No existing data file in R2 - starting fresh")
            else:
                logging.warning(f"Failed to download from R2: {e}")
            return None
            
    except Exception as e:
        logging.warning(f"R2 download failed: {e}")
        return None

def download_config_from_r2():
    """Download existing config.js from R2 and return as string"""
    try:
        r2_endpoint = os.getenv("R2_ENDPOINT_URL")
        r2_access_key = os.getenv("R2_ACCESS_KEY_ID")
        r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        r2_bucket = os.getenv("R2_BUCKET_NAME", "step-tracker")
        
        if not all([r2_endpoint, r2_access_key, r2_secret_key]):
            return None
        
        s3_client = boto3.client(
            's3',
            endpoint_url=r2_endpoint,
            aws_access_key_id=r2_access_key,
            aws_secret_access_key=r2_secret_key,
            region_name='auto'
        )
        
        try:
            response = s3_client.get_object(Bucket=r2_bucket, Key='config.js')
            config_content = response['Body'].read().decode('utf-8')
            logging.info("Downloaded existing config from R2")
            return config_content
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                logging.info("No existing config file in R2 - will create new")
            else:
                logging.warning(f"Failed to download config from R2: {e}")
            return None
            
    except Exception as e:
        logging.warning(f"R2 config download failed: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Update step tracker data from Garmin Connect")
    parser.add_argument("--force-dates", 
                       help="Force re-fetch specific date range (format: YYYY-MM-DD or YYYY-MM-DD:YYYY-MM-DD)")
    args = parser.parse_args()
    
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
        
        # Download existing data from R2 (if configured)
        existing_r2_data = download_from_r2()

        logging.info("Authenticating with Garmin...")
        try:
            garmin = garmin_login_with_retry(email, password)
        except GarminAuthenticationError as e:
            logging.error(f"Authentication failed: {e}")
            send_healthcheck_failure(f"Garmin authentication failed: {str(e)}")
            return
        except (GarminNetworkError, GarminTemporaryError) as e:
            logging.error(f"Unable to connect to Garmin after retries: {e}")
            send_healthcheck_failure(f"Garmin connection failed: {str(e)}")
            return

        # Get today's date in the configured timezone
        tz = ZoneInfo(timezone_str)
        now_in_tz = datetime.datetime.now(tz)
        today = now_in_tz.date()
        logging.info(f"Current date in {timezone_str}: {today} (UTC would be: {datetime.date.today()})")

        start_date = datetime.date(2026, 1, 1)
        
        # Read existing data to determine what dates we need to fetch
        existing_data = {}
        existing_metadata = {}
        if existing_r2_data:
            # Handle new structure with metadata, or legacy flat structure
            if isinstance(existing_r2_data, dict) and "data" in existing_r2_data and "metadata" in existing_r2_data:
                # New structure
                existing_data = existing_r2_data["data"]
                existing_metadata = existing_r2_data["metadata"]
            else:
                # Legacy structure - treat entire content as data
                existing_data = existing_r2_data
        
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
        
        # Handle manual date range override
        if args.force_dates:
            try:
                if ":" in args.force_dates:
                    # Date range: YYYY-MM-DD:YYYY-MM-DD
                    start_str, end_str = args.force_dates.split(":")
                    force_start = datetime.date.fromisoformat(start_str)
                    force_end = datetime.date.fromisoformat(end_str)
                    current_date = force_start
                    while current_date <= force_end:
                        dates_to_check.append((current_date, f"manual override ({args.force_dates})"))
                        current_date += datetime.timedelta(days=1)
                    logging.info(f"Force-fetching date range: {force_start} to {force_end}")
                else:
                    # Single date: YYYY-MM-DD
                    force_date = datetime.date.fromisoformat(args.force_dates)
                    dates_to_check.append((force_date, f"manual override ({args.force_dates})"))
                    logging.info(f"Force-fetching single date: {force_date}")
            except ValueError as e:
                logging.error(f"Invalid force-dates format: {args.force_dates}. Use YYYY-MM-DD or YYYY-MM-DD:YYYY-MM-DD")
                return
        else:
            # Find missing dates between start_date and today
            current_date = start_date
            while current_date <= today:
                if current_date.isoformat() not in existing_data:
                    dates_to_check.append((current_date, "missing data"))
                current_date += datetime.timedelta(days=1)
        
        # Only add automatic date logic if not using manual override
        if not args.force_dates:
            # Always include today to ensure current data is correct
            if today >= start_date:
                today_reason = "ensure current data"
                if today not in [d[0] for d in dates_to_check]:
                    today_reason = f"ensure current data"
                    dates_to_check.append((today, today_reason))

            # Always include last 2 days to catch any late updates or corrections from Garmin
            for days_back in [1, 2]:  # Yesterday and day before
                check_date = today - datetime.timedelta(days=days_back)
                if check_date >= start_date and check_date not in [d[0] for d in dates_to_check]:
                    reason = "force recent data refresh"
                    dates_to_check.append((check_date, reason))
                    logging.info(f"Adding {check_date} for recent data refresh (to catch late Garmin updates)")

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
        
        try:
            stats = garmin_get_steps_with_retry(garmin, fetch_start, fetch_end)
            logging.info(f"Garmin returned {len(stats)} entries for date range {fetch_start} to {fetch_end}")
        except GarminAuthenticationError as e:
            logging.error(f"Authentication expired during API call: {e}")
            send_healthcheck_failure(f"Garmin session expired: {str(e)}")
            return
        except GarminAPIError as e:
            logging.error(f"Garmin API error: {e}")
            send_healthcheck_failure(f"Garmin API error: {str(e)}")
            return
        except (GarminNetworkError, GarminTemporaryError) as e:
            logging.error(f"Unable to fetch step data after retries: {e}")
            # For step data fetch failures, we'll implement graceful degradation
            logging.warning("Proceeding with graceful degradation - preserving existing data")
            stats = []  # Empty stats will trigger graceful degradation below
        
        # Graceful degradation: Handle empty stats from API failures
        if not stats:
            logging.warning("No step data received from Garmin API - implementing graceful degradation")
            
            # Check if we have some existing data to work with
            if existing_data:
                logging.info(f"Preserving existing data ({len(existing_data)} days) and updating metadata")
                
                # Update only metadata to show we attempted an update
                output_data = {
                    "metadata": {
                        "lastUpdated": now_in_tz.isoformat(),
                        "timezone": timezone_str,
                        "lastFailure": now_in_tz.isoformat(),
                        "failureReason": "Garmin API unavailable - data preserved"
                    },
                    "data": existing_data
                }
                
                # Still upload to R2 to update the lastUpdated timestamp
                config_content = None  # Don't update config on failure
                upload_success = upload_to_r2(output_data, config_content)
                
                if upload_success:
                    logging.info("Existing data preserved and metadata updated in R2")
                    # Send a warning status to indicate partial success (data preserved)
                    send_healthcheck_warning("Garmin API unavailable - existing data preserved")
                else:
                    logging.warning("Failed to update R2 metadata during graceful degradation")
                    send_healthcheck_failure("Garmin API unavailable and R2 update failed")
                
                return
            else:
                logging.error("No existing data available and Garmin API is unavailable - cannot proceed")
                send_healthcheck_failure("No data available - Garmin API down and no cached data")
                return

        # Log the Garmin API response for transparency
        logging.info(f"Garmin API returned data for {len(stats)} dates:")
        for i, entry in enumerate(stats):
            date_str = entry['calendarDate']
            steps = entry['totalSteps'] or 0  # Handle None values from Garmin API
            # Extract distance in meters and convert to km
            distance_meters = entry.get('totalDistance') or entry.get('totalDistanceMeters', 0)
            distance_km = round(distance_meters / 1000, 2) if distance_meters else 0

            # Check if this is recent data that might be incomplete
            entry_date = datetime.date.fromisoformat(date_str)
            days_ago = (today - entry_date).days
            recent_flag = " (RECENT)" if days_ago <= 2 else ""

            # Log first entry structure to see available fields
            if i == 0:
                logging.info(f"  API response structure: {list(entry.keys())}")
                if args.force_dates:
                    logging.info(f"  Manual override mode - fetching: {args.force_dates}")

            logging.info(f"  Garmin API: {date_str} = {steps} steps, {distance_km} km{recent_flag}")

        # Update existing data with new stats
        data_points = existing_data.copy()
        new_count = 0
        updated_count = 0
        unchanged_count = 0

        for entry in stats:
            date_str = entry['calendarDate']
            steps = entry['totalSteps'] or 0  # Handle None values from Garmin API
            # Extract distance in meters and convert to km
            distance_meters = entry.get('totalDistance') or entry.get('totalDistanceMeters', 0)
            distance_km = round(distance_meters / 1000, 2) if distance_meters else 0

            new_data = {"steps": steps, "km": distance_km}

            # Validate potentially incomplete recent data
            entry_date = datetime.date.fromisoformat(date_str)
            days_ago = (today - entry_date).days
            if days_ago <= 3 and steps < 5000:  # Recent dates with unusually low step counts
                logging.warning(f"Potentially incomplete data for {date_str}: {steps} steps (only {days_ago} days ago)")
                send_healthcheck_warning(f"Low step count for recent date {date_str}: {steps} steps")

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
                old_steps = (existing_value.get("steps") or 0) if isinstance(existing_value, dict) else (existing_value or 0)
                old_km = (existing_value.get("km") or 0) if isinstance(existing_value, dict) else 0
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
            output_data = None
        else:
            # Create new JSON structure with metadata
            output_data = {
                "metadata": {
                    "lastUpdated": now_in_tz.isoformat(),
                    "timezone": timezone_str
                },
                "data": data_points
            }
            logging.info(f"Database updated. {total_changes} days updated. Total days tracked: {len(data_points)}")
            steps_updated = True

        # Generate config.js with timezone and R2 URL settings
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
        
        # Generate config content
        config_lines = ["window.CONFIG = {"]
        config_items = list(config_obj.items())
        for i, (key, value) in enumerate(config_items):
            comma = "," if i < len(config_items) - 1 else ""
            config_lines.append(f"    {key}: '{value}'{comma}")
        config_lines.append("};")
        config_content = "\n".join(config_lines) + "\n"
        
        # Check if config has actually changed by comparing with R2 version
        existing_config = download_config_from_r2()
        config_changed = existing_config != config_content
        
        if config_changed:
            logging.info(f"Config changed - updating with timezone: {timezone_str}")
            if 'R2_DATA_URL' in config_obj:
                logging.info(f"Config changed - updating with R2 URL: {config_obj['R2_DATA_URL']}")
        else:
            logging.info("Config unchanged - skipping upload")

        # Upload data changes to R2 instead of git commits
        data_changes = steps_updated or config_changed
        
        if data_changes:
            # Upload to R2 directly without local files
            # Only pass config_content if config actually changed
            config_to_upload = config_content if config_changed else None
            upload_success = upload_to_r2(output_data, config_to_upload)
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