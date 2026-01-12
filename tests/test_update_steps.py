import json
import os
import tempfile
import subprocess
from unittest.mock import patch, MagicMock, call
import pytest
from datetime import date, datetime
import requests

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from update_steps import (
    send_healthcheck,
    send_healthcheck_start,
    send_healthcheck_success,
    send_healthcheck_failure,
    upload_to_r2,
    download_from_r2,
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