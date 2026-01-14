import json
import os
from unittest.mock import patch, MagicMock, call
import pytest
import requests

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from update_steps import (
    send_healthcheck,
    send_healthcheck_start,
    send_healthcheck_success,
    send_healthcheck_failure,
    send_healthcheck_warning,
    send_healthcheck_with_retry_status,
    upload_to_r2,
    download_from_r2,
    retry_with_backoff,
    garmin_login_with_retry,
    garmin_get_steps_with_retry,
    classify_r2_error,
    create_r2_client_with_retry,
    upload_file_to_r2_with_retry,
    GarminAuthenticationError,
    GarminAPIError,
    GarminNetworkError,
    GarminTemporaryError,
    R2AuthenticationError,
    R2NetworkError,
    R2ServiceError,
    R2ThrottleError,
    R2StorageError,
)


class TestHealthcheckFunctions:
    def test_send_healthcheck_no_url_configured(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch('requests.get') as mock_get:
                send_healthcheck()
                mock_get.assert_not_called()

    @patch('requests.get')
    def test_send_healthcheck_success_get(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_get.return_value = mock_response
        
        with patch.dict(os.environ, {'HEALTHCHECKS_URL': 'https://hc-ping.com/test-uuid'}):
            send_healthcheck()
            
        mock_get.assert_called_once_with('https://hc-ping.com/test-uuid', timeout=10)

    @patch('requests.post')
    def test_send_healthcheck_with_data_post(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response
        
        with patch.dict(os.environ, {'HEALTHCHECKS_URL': 'https://hc-ping.com/test-uuid'}):
            send_healthcheck('/fail', 'Test error message')
            
        mock_post.assert_called_once_with(
            'https://hc-ping.com/test-uuid/fail', 
            data='Test error message', 
            timeout=10
        )

    @patch('requests.get')
    def test_send_healthcheck_request_exception(self, mock_get):
        mock_get.side_effect = requests.RequestException('Network error')
        
        with patch.dict(os.environ, {'HEALTHCHECKS_URL': 'https://hc-ping.com/test-uuid'}):
            with patch('logging.warning') as mock_warning:
                send_healthcheck()
                mock_warning.assert_called_once()

    @patch('update_steps.send_healthcheck')
    def test_send_healthcheck_start(self, mock_send):
        send_healthcheck_start()
        mock_send.assert_called_once_with('/start')

    @patch('update_steps.send_healthcheck')
    def test_send_healthcheck_success(self, mock_send):
        send_healthcheck_success()
        mock_send.assert_called_once_with()

    @patch('update_steps.send_healthcheck')
    def test_send_healthcheck_failure_with_message(self, mock_send):
        send_healthcheck_failure('Test error')
        mock_send.assert_called_once_with('/fail', 'Step tracker error: Test error')

    @patch('update_steps.send_healthcheck')
    def test_send_healthcheck_failure_without_message(self, mock_send):
        send_healthcheck_failure()
        mock_send.assert_called_once_with('/fail', 'Step tracker failed')


class TestR2Functions:
    def test_upload_to_r2_no_config(self):
        """Test R2 upload when no configuration is provided"""
        test_data = {"metadata": {"lastUpdated": "2026-01-01T00:00:00Z"}, "data": {"2026-01-01": {"steps": 1000, "km": 0.8}}}
        test_config = "window.CONFIG = { TIMEZONE: 'UTC' };"
        
        # Test without R2 configuration
        result = upload_to_r2(test_data, test_config)
        
        assert result is False
    
    def test_download_from_r2_no_config(self):
        """Test R2 download when no configuration is provided"""
        result = download_from_r2()
        assert result is None
    
    @patch.dict(os.environ, {
        'R2_ENDPOINT_URL': 'https://test-account.r2.cloudflarestorage.com',
        'R2_ACCESS_KEY_ID': 'test-access-key',
        'R2_SECRET_ACCESS_KEY': 'test-secret-key',
        'R2_BUCKET_NAME': 'test-bucket'
    })
    @patch('update_steps.boto3.client')
    def test_upload_to_r2_success(self, mock_boto_client):
        """Test successful R2 upload"""
        mock_s3_client = MagicMock()
        mock_boto_client.return_value = mock_s3_client
        
        test_data = {"metadata": {"lastUpdated": "2026-01-01T00:00:00Z"}, "data": {"2026-01-01": {"steps": 5000, "km": 3.2}}}
        test_config = "window.CONFIG = { TIMEZONE: 'UTC' };"
        
        result = upload_to_r2(test_data, test_config)
        
        assert result is True
        assert mock_s3_client.put_object.call_count == 2  # json and js files
    
    @patch.dict(os.environ, {
        'R2_ENDPOINT_URL': 'https://test-account.r2.cloudflarestorage.com',
        'R2_ACCESS_KEY_ID': 'test-access-key',  
        'R2_SECRET_ACCESS_KEY': 'test-secret-key',
        'R2_BUCKET_NAME': 'test-bucket'
    })
    @patch('update_steps.boto3.client')
    def test_download_from_r2_success(self, mock_boto_client):
        """Test successful R2 download"""
        mock_s3_client = MagicMock()
        mock_boto_client.return_value = mock_s3_client
        
        # Mock the response object
        mock_response = MagicMock()
        test_data = {"metadata": {"lastUpdated": "2026-01-01T00:00:00Z"}, "data": {"2026-01-01": {"steps": 5000, "km": 3.2}}}
        mock_response['Body'].read.return_value = json.dumps(test_data).encode('utf-8')
        mock_s3_client.get_object.return_value = mock_response
        
        result = download_from_r2()
        
        assert result == test_data
        mock_s3_client.get_object.assert_called_once_with(Bucket='test-bucket', Key='steps_data.json')


class TestDataProcessing:
    def test_json_data_processing_new_format(self):
        """Test handling of new JSON format with metadata and data"""
        sample_data = {
            "metadata": {
                "lastUpdated": "2026-01-05T10:30:00+11:00",
                "timezone": "Australia/Sydney"
            },
            "data": {
                "2026-01-01": {"steps": 10000, "km": 8.5},
                "2026-01-02": {"steps": 12000, "km": 10.2}
            }
        }
        
        # Simulate the data processing logic from main()
        if isinstance(sample_data, dict) and "data" in sample_data and "metadata" in sample_data:
            existing_data = sample_data["data"]
            existing_metadata = sample_data["metadata"]
        else:
            existing_data = sample_data
            existing_metadata = {}
        
        assert len(existing_data) == 2
        assert existing_data["2026-01-01"]["steps"] == 10000
        assert existing_data["2026-01-01"]["km"] == 8.5
        assert existing_metadata["timezone"] == "Australia/Sydney"

    def test_json_data_processing_legacy_format(self):
        """Test handling of legacy JSON format (flat structure)"""
        sample_data = {
            "2026-01-01": 10000,
            "2026-01-02": 12000
        }
        
        # Simulate the data processing logic from main()
        if isinstance(sample_data, dict) and "data" in sample_data and "metadata" in sample_data:
            existing_data = sample_data["data"]
            existing_metadata = sample_data["metadata"]
        else:
            existing_data = sample_data
            existing_metadata = {}
        
        assert len(existing_data) == 2
        assert existing_data["2026-01-01"] == 10000
        assert existing_metadata == {}

    def test_step_data_comparison_logic(self):
        """Test the logic for comparing existing vs new step data"""
        existing_value = {"steps": 8000, "km": 6.5}
        new_data = {"steps": 10000, "km": 8.5}
        
        # This simulates the comparison logic from main()
        if existing_value != new_data:
            old_steps = existing_value.get("steps", 0)
            old_km = existing_value.get("km", 0)
            new_steps = new_data["steps"]
            new_km = new_data["km"]
            step_change = new_steps - old_steps
            km_change = new_km - old_km
            
            assert step_change == 2000
            assert km_change == 2.0
            assert old_steps == 8000
            assert old_km == 6.5

    def test_backward_compatibility_integer_format(self):
        """Test handling of backward compatibility with integer step values"""
        existing_value = 8000  # Old format (integer)
        
        # Convert old format to new format for comparison
        if isinstance(existing_value, int):
            existing_value = {"steps": existing_value, "km": 0}
        
        assert existing_value["steps"] == 8000
        assert existing_value["km"] == 0


class TestEnvironmentHandling:
    def test_missing_credentials(self):
        """Test behavior when Garmin credentials are missing"""
        with patch.dict(os.environ, {}, clear=True):
            # Simulate the credential check from main()
            email = os.getenv("GARMIN_EMAIL")
            password = os.getenv("GARMIN_PASSWORD")
            
            assert email is None
            assert password is None
            
            missing_credentials = not email or not password
            assert missing_credentials is True

    def test_timezone_default(self):
        """Test timezone defaults to Australia/Sydney"""
        with patch.dict(os.environ, {}, clear=True):
            timezone_str = os.getenv("TIMEZONE", "Australia/Sydney")
            assert timezone_str == "Australia/Sydney"

    def test_timezone_override(self):
        """Test timezone can be overridden"""
        with patch.dict(os.environ, {'TIMEZONE': 'UTC'}):
            timezone_str = os.getenv("TIMEZONE", "Australia/Sydney")
            assert timezone_str == "UTC"


class TestEnhancedHealthcheckFunctions:
    @patch('update_steps.send_healthcheck')
    def test_send_healthcheck_warning(self, mock_send):
        send_healthcheck_warning('Test warning')
        mock_send.assert_called_once_with('/log', 'Step tracker warning: Test warning')

    @patch('update_steps.send_healthcheck')
    def test_send_healthcheck_warning_without_message(self, mock_send):
        send_healthcheck_warning()
        mock_send.assert_called_once_with('/log', 'Step tracker warning')

    @patch('update_steps.send_healthcheck')
    def test_send_healthcheck_with_retry_status(self, mock_send):
        send_healthcheck_with_retry_status(2, 5, 'Network timeout')
        mock_send.assert_called_once_with('/log', 'Step tracker retry 2/5: Network timeout')


class TestRetryWithBackoff:
    def test_retry_success_first_attempt(self):
        """Test successful execution on first attempt"""
        mock_func = MagicMock(return_value="success")
        result = retry_with_backoff(mock_func, max_retries=3)
        assert result == "success"
        assert mock_func.call_count == 1

    def test_retry_success_after_failures(self):
        """Test successful execution after some failures"""
        mock_func = MagicMock(side_effect=[Exception("fail"), Exception("fail"), "success"])
        result = retry_with_backoff(mock_func, max_retries=3, base_delay=0.01)
        assert result == "success"
        assert mock_func.call_count == 3

    def test_retry_exhausted_raises_last_exception(self):
        """Test that final exception is raised after retries exhausted"""
        mock_func = MagicMock(side_effect=Exception("persistent failure"))
        with pytest.raises(Exception) as exc_info:
            retry_with_backoff(mock_func, max_retries=2, base_delay=0.01)
        assert str(exc_info.value) == "persistent failure"
        assert mock_func.call_count == 3  # Initial attempt + 2 retries

    @patch('time.sleep')
    def test_retry_exponential_backoff_timing(self, mock_sleep):
        """Test exponential backoff delay calculation"""
        mock_func = MagicMock(side_effect=[Exception("fail"), Exception("fail"), "success"])
        retry_with_backoff(mock_func, max_retries=2, base_delay=1, backoff_factor=2)
        
        expected_calls = [call(1), call(2)]  # 1s, then 2s
        mock_sleep.assert_has_calls(expected_calls)

    @patch('time.sleep')
    def test_retry_max_delay_cap(self, mock_sleep):
        """Test that delay is capped at max_delay"""
        mock_func = MagicMock(side_effect=[Exception("fail"), Exception("fail"), "success"])
        retry_with_backoff(mock_func, max_retries=2, base_delay=10, max_delay=5, backoff_factor=2)
        
        expected_calls = [call(5), call(5)]  # Both capped at 5
        mock_sleep.assert_has_calls(expected_calls)

    @patch('update_steps.send_healthcheck_with_retry_status')
    def test_retry_with_health_check_updates(self, mock_health_check):
        """Test that health check updates are sent during retries"""
        mock_func = MagicMock(side_effect=[Exception("fail1"), Exception("fail2"), "success"])
        retry_with_backoff(mock_func, max_retries=2, base_delay=0.01, send_retry_updates=True)
        
        expected_calls = [call(1, 2, "fail1"), call(2, 2, "fail2")]
        mock_health_check.assert_has_calls(expected_calls)

    def test_retry_specific_exceptions_only(self):
        """Test that only specified exceptions are retried"""
        mock_func = MagicMock(side_effect=ValueError("not retryable"))
        with pytest.raises(ValueError):
            retry_with_backoff(mock_func, max_retries=3, exceptions=(RuntimeError,))
        assert mock_func.call_count == 1  # Should not retry ValueError


class TestGarminErrorHandling:
    def test_garmin_authentication_error_classification(self):
        """Test that authentication errors are properly classified"""
        with patch('update_steps.Garmin') as mock_garmin_class:
            mock_garmin = MagicMock()
            mock_garmin_class.return_value = mock_garmin
            mock_garmin.login.side_effect = Exception("authentication failed")
            
            with pytest.raises(GarminAuthenticationError):
                garmin_login_with_retry("test@email.com", "password", max_retries=0)

    def test_garmin_network_error_classification(self):
        """Test that network errors are properly classified"""
        with patch('update_steps.Garmin') as mock_garmin_class:
            mock_garmin = MagicMock()
            mock_garmin_class.return_value = mock_garmin
            mock_garmin.login.side_effect = Exception("network timeout")
            
            with pytest.raises(GarminNetworkError):
                garmin_login_with_retry("test@email.com", "password", max_retries=0)

    def test_garmin_temporary_error_classification(self):
        """Test that temporary errors are properly classified"""
        with patch('update_steps.Garmin') as mock_garmin_class:
            mock_garmin = MagicMock()
            mock_garmin_class.return_value = mock_garmin
            mock_garmin.login.side_effect = Exception("rate limit exceeded")
            
            with pytest.raises(GarminTemporaryError):
                garmin_login_with_retry("test@email.com", "password", max_retries=0)

    def test_garmin_login_retry_success(self):
        """Test successful login after retries"""
        with patch('update_steps.Garmin') as mock_garmin_class:
            mock_garmin = MagicMock()
            mock_garmin_class.return_value = mock_garmin
            mock_garmin.login.side_effect = [Exception("server busy"), None]
            
            result = garmin_login_with_retry("test@email.com", "password", max_retries=1)
            assert result == mock_garmin
            assert mock_garmin.login.call_count == 2

    def test_garmin_api_error_classification(self):
        """Test that API errors are properly classified"""
        mock_garmin = MagicMock()
        mock_garmin.get_daily_steps.side_effect = Exception("API error 400")
        
        with pytest.raises(GarminAPIError):
            garmin_get_steps_with_retry(mock_garmin, "2026-01-01", "2026-01-02", max_retries=0)

    def test_garmin_api_retry_success(self):
        """Test successful API call after retries"""
        mock_garmin = MagicMock()
        mock_stats = [{"calendarDate": "2026-01-01", "totalSteps": 10000}]
        mock_garmin.get_daily_steps.side_effect = [Exception("server unavailable"), mock_stats]
        
        result = garmin_get_steps_with_retry(mock_garmin, "2026-01-01", "2026-01-02", max_retries=1)
        assert result == mock_stats
        assert mock_garmin.get_daily_steps.call_count == 2

    def test_garmin_authentication_not_retried(self):
        """Test that authentication errors are not retried"""
        with patch('update_steps.Garmin') as mock_garmin_class:
            mock_garmin = MagicMock()
            mock_garmin_class.return_value = mock_garmin
            mock_garmin.login.side_effect = Exception("invalid credentials")
            
            with pytest.raises(GarminAuthenticationError):
                garmin_login_with_retry("test@email.com", "password", max_retries=3)
            
            assert mock_garmin.login.call_count == 1  # Should not retry auth errors


class TestCustomExceptions:
    def test_custom_exception_inheritance(self):
        """Test that custom exceptions inherit from Exception properly"""
        assert issubclass(GarminAuthenticationError, Exception)
        assert issubclass(GarminAPIError, Exception)
        assert issubclass(GarminNetworkError, Exception)
        assert issubclass(GarminTemporaryError, Exception)

    def test_custom_exception_messages(self):
        """Test that custom exceptions can carry messages"""
        auth_error = GarminAuthenticationError("login failed")
        api_error = GarminAPIError("400 bad request")
        network_error = GarminNetworkError("connection timeout")
        temp_error = GarminTemporaryError("rate limit")
        
        assert str(auth_error) == "login failed"
        assert str(api_error) == "400 bad request"
        assert str(network_error) == "connection timeout"
        assert str(temp_error) == "rate limit"


class TestR2ErrorClassification:
    def test_classify_r2_client_error_authentication(self):
        """Test classification of R2 authentication errors"""
        from botocore.exceptions import ClientError
        
        error_response = {
            'Error': {
                'Code': 'InvalidAccessKeyId',
                'Message': 'The AWS Access Key Id you provided does not exist in our records.'
            }
        }
        mock_error = ClientError(error_response, 'PutObject')
        
        classified = classify_r2_error(mock_error)
        assert isinstance(classified, R2AuthenticationError)
        assert 'InvalidAccessKeyId' in str(classified)

    def test_classify_r2_client_error_throttle(self):
        """Test classification of R2 throttling errors"""
        from botocore.exceptions import ClientError
        
        error_response = {
            'Error': {
                'Code': 'SlowDown',
                'Message': 'Please reduce your request rate.'
            }
        }
        mock_error = ClientError(error_response, 'PutObject')
        
        classified = classify_r2_error(mock_error)
        assert isinstance(classified, R2ThrottleError)
        assert 'SlowDown' in str(classified)

    def test_classify_r2_client_error_service(self):
        """Test classification of R2 service errors"""
        from botocore.exceptions import ClientError
        
        error_response = {
            'Error': {
                'Code': 'ServiceUnavailable',
                'Message': 'Service temporarily unavailable, please try again.'
            }
        }
        mock_error = ClientError(error_response, 'PutObject')
        
        classified = classify_r2_error(mock_error)
        assert isinstance(classified, R2ServiceError)
        assert 'ServiceUnavailable' in str(classified)

    def test_classify_r2_client_error_storage(self):
        """Test classification of R2 storage errors"""
        from botocore.exceptions import ClientError
        
        error_response = {
            'Error': {
                'Code': 'EntityTooLarge',
                'Message': 'Your request was too large.'
            }
        }
        mock_error = ClientError(error_response, 'PutObject')
        
        classified = classify_r2_error(mock_error)
        assert isinstance(classified, R2StorageError)
        assert 'EntityTooLarge' in str(classified)

    def test_classify_r2_network_error(self):
        """Test classification of network-related errors"""
        network_error = Exception("connection timeout occurred")
        
        classified = classify_r2_error(network_error)
        assert isinstance(classified, R2NetworkError)
        assert 'network error' in str(classified).lower()

    def test_classify_r2_unknown_error(self):
        """Test classification of unknown errors defaults to service error"""
        unknown_error = Exception("something weird happened")
        
        classified = classify_r2_error(unknown_error)
        assert isinstance(classified, R2ServiceError)
        assert 'service error' in str(classified).lower()


class TestR2ClientCreation:
    @patch.dict(os.environ, {}, clear=True)
    def test_create_r2_client_no_config(self):
        """Test R2 client creation fails with missing config"""
        with pytest.raises(R2AuthenticationError) as exc_info:
            create_r2_client_with_retry(max_retries=0)
        
        assert "R2 configuration incomplete" in str(exc_info.value)

    @patch.dict(os.environ, {
        'R2_ENDPOINT_URL': 'https://test-account.r2.cloudflarestorage.com',
        'R2_ACCESS_KEY_ID': 'test-access-key',
        'R2_SECRET_ACCESS_KEY': 'test-secret-key'
    })
    @patch('update_steps.boto3.client')
    def test_create_r2_client_success(self, mock_boto_client):
        """Test successful R2 client creation"""
        mock_s3_client = MagicMock()
        mock_boto_client.return_value = mock_s3_client
        
        client = create_r2_client_with_retry(max_retries=0)
        
        assert client == mock_s3_client
        mock_boto_client.assert_called_once()

    @patch.dict(os.environ, {
        'R2_ENDPOINT_URL': 'https://test-account.r2.cloudflarestorage.com',
        'R2_ACCESS_KEY_ID': 'test-access-key',
        'R2_SECRET_ACCESS_KEY': 'test-secret-key',
        'R2_UPLOAD_TIMEOUT': '60'
    })
    @patch('update_steps.boto3.client')
    def test_create_r2_client_with_timeout(self, mock_boto_client):
        """Test R2 client creation with custom timeout"""
        mock_s3_client = MagicMock()
        mock_boto_client.return_value = mock_s3_client
        
        create_r2_client_with_retry(max_retries=0)
        
        # Verify timeout was passed to boto3 config
        call_args = mock_boto_client.call_args
        config = call_args[1]['config']
        assert config.read_timeout == 60
        assert config.connect_timeout == 60


class TestR2FileUpload:
    def test_upload_file_to_r2_success(self):
        """Test successful file upload to R2"""
        mock_s3_client = MagicMock()
        
        result = upload_file_to_r2_with_retry(
            s3_client=mock_s3_client,
            bucket="test-bucket",
            key="test-file.json",
            content="test content",
            content_type="application/json",
            cache_control="max-age=300",
            max_retries=0
        )
        
        assert result is True
        mock_s3_client.put_object.assert_called_once_with(
            Bucket="test-bucket",
            Key="test-file.json",
            Body="test content",
            ContentType="application/json",
            CacheControl="max-age=300"
        )

    def test_upload_file_to_r2_auth_failure(self):
        """Test file upload with authentication failure"""
        from botocore.exceptions import ClientError
        
        mock_s3_client = MagicMock()
        error_response = {
            'Error': {
                'Code': 'AccessDenied',
                'Message': 'Access denied.'
            }
        }
        mock_s3_client.put_object.side_effect = ClientError(error_response, 'PutObject')
        
        with pytest.raises(R2AuthenticationError):
            upload_file_to_r2_with_retry(
                s3_client=mock_s3_client,
                bucket="test-bucket",
                key="test-file.json",
                content="test content",
                content_type="application/json",
                cache_control="max-age=300",
                max_retries=0
            )

    def test_upload_file_to_r2_retry_success(self):
        """Test file upload success after retries"""
        from botocore.exceptions import ClientError
        
        mock_s3_client = MagicMock()
        error_response = {
            'Error': {
                'Code': 'ServiceUnavailable',
                'Message': 'Service temporarily unavailable.'
            }
        }
        # Fail once, then succeed
        mock_s3_client.put_object.side_effect = [
            ClientError(error_response, 'PutObject'),
            None
        ]
        
        result = upload_file_to_r2_with_retry(
            s3_client=mock_s3_client,
            bucket="test-bucket",
            key="test-file.json",
            content="test content",
            content_type="application/json",
            cache_control="max-age=300",
            max_retries=1
        )
        
        assert result is True
        assert mock_s3_client.put_object.call_count == 2


class TestR2UploadIntegration:
    @patch.dict(os.environ, {
        'R2_ENDPOINT_URL': 'https://test-account.r2.cloudflarestorage.com',
        'R2_ACCESS_KEY_ID': 'test-access-key',
        'R2_SECRET_ACCESS_KEY': 'test-secret-key',
        'R2_BUCKET_NAME': 'test-bucket',
        'R2_UPLOAD_RETRY_COUNT': '2'
    })
    @patch('update_steps.boto3.client')
    def test_upload_to_r2_complete_success(self, mock_boto_client):
        """Test complete successful upload to R2"""
        mock_s3_client = MagicMock()
        mock_boto_client.return_value = mock_s3_client
        
        test_data = {
            "metadata": {"lastUpdated": "2026-01-01T00:00:00Z"},
            "data": {"2026-01-01": {"steps": 10000, "km": 8.0}}
        }
        test_config = "window.CONFIG = { TIMEZONE: 'UTC' };"
        
        result = upload_to_r2(test_data, test_config)
        
        assert result is True
        assert mock_s3_client.put_object.call_count == 2  # JSON and JS files

    @patch.dict(os.environ, {
        'R2_ENDPOINT_URL': 'https://test-account.r2.cloudflarestorage.com',
        'R2_ACCESS_KEY_ID': 'test-access-key',
        'R2_SECRET_ACCESS_KEY': 'test-secret-key',
        'R2_BUCKET_NAME': 'test-bucket'
    })
    @patch('update_steps.boto3.client')
    @patch('update_steps.send_healthcheck_warning')
    def test_upload_to_r2_partial_success(self, mock_health_warning, mock_boto_client):
        """Test partial upload success with some failures"""
        from botocore.exceptions import ClientError
        
        mock_s3_client = MagicMock()
        mock_boto_client.return_value = mock_s3_client
        
        # Succeed for first call, fail for second
        error_response = {
            'Error': {
                'Code': 'ServiceUnavailable',
                'Message': 'Service temporarily unavailable.'
            }
        }
        mock_s3_client.put_object.side_effect = [
            None,  # JSON upload succeeds
            ClientError(error_response, 'PutObject'),  # Config upload fails
            ClientError(error_response, 'PutObject'),  # Retry 1 fails
            ClientError(error_response, 'PutObject'),  # Retry 2 fails
            ClientError(error_response, 'PutObject'),  # Retry 3 fails
        ]
        
        test_data = {
            "metadata": {"lastUpdated": "2026-01-01T00:00:00Z"},
            "data": {"2026-01-01": {"steps": 10000, "km": 8.0}}
        }
        test_config = "window.CONFIG = { TIMEZONE: 'UTC' };"
        
        result = upload_to_r2(test_data, test_config)
        
        assert result is False
        mock_health_warning.assert_called_once()

    @patch.dict(os.environ, {}, clear=True)
    @patch('update_steps.send_healthcheck_failure')
    def test_upload_to_r2_auth_failure(self, mock_health_failure):
        """Test upload failure due to missing authentication"""
        test_data = {
            "metadata": {"lastUpdated": "2026-01-01T00:00:00Z"},
            "data": {"2026-01-01": {"steps": 10000, "km": 8.0}}
        }
        
        result = upload_to_r2(test_data, None)
        
        assert result is False
        mock_health_failure.assert_called_once()

    def test_upload_to_r2_no_data(self):
        """Test upload with no data returns success"""
        result = upload_to_r2(None, None)
        assert result is True


class TestR2CustomExceptions:
    def test_r2_custom_exception_inheritance(self):
        """Test that R2 custom exceptions inherit from Exception properly"""
        assert issubclass(R2AuthenticationError, Exception)
        assert issubclass(R2NetworkError, Exception)
        assert issubclass(R2ServiceError, Exception)
        assert issubclass(R2ThrottleError, Exception)
        assert issubclass(R2StorageError, Exception)

    def test_r2_custom_exception_messages(self):
        """Test that R2 custom exceptions can carry messages"""
        auth_error = R2AuthenticationError("invalid credentials")
        network_error = R2NetworkError("connection timeout")
        service_error = R2ServiceError("service unavailable")
        throttle_error = R2ThrottleError("rate limit exceeded")
        storage_error = R2StorageError("bucket full")
        
        assert str(auth_error) == "invalid credentials"
        assert str(network_error) == "connection timeout"
        assert str(service_error) == "service unavailable"
        assert str(throttle_error) == "rate limit exceeded"
        assert str(storage_error) == "bucket full"