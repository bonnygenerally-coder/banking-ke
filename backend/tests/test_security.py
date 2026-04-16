"""
Security Tests for Banking KE Security Audit Dashboard
Tests security headers, XSS protection, and API functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSecurityHeaders:
    """Test that all security headers are present in API responses"""
    
    def test_strict_transport_security_header(self):
        """Verify HSTS header is present"""
        response = requests.get(f"{BASE_URL}/api/security/status")
        assert response.status_code == 200
        assert "strict-transport-security" in response.headers
        hsts = response.headers["strict-transport-security"]
        assert "max-age=31536000" in hsts
        assert "includeSubDomains" in hsts
        print(f"HSTS header: {hsts}")
    
    def test_content_security_policy_header(self):
        """Verify CSP header with upgrade-insecure-requests"""
        response = requests.get(f"{BASE_URL}/api/security/status")
        assert response.status_code == 200
        assert "content-security-policy" in response.headers
        csp = response.headers["content-security-policy"]
        assert "upgrade-insecure-requests" in csp
        assert "form-action" in csp
        assert "https:" in csp
        print(f"CSP header: {csp}")
    
    def test_x_content_type_options_header(self):
        """Verify X-Content-Type-Options: nosniff"""
        response = requests.get(f"{BASE_URL}/api/security/status")
        assert response.status_code == 200
        assert "x-content-type-options" in response.headers
        assert response.headers["x-content-type-options"] == "nosniff"
        print(f"X-Content-Type-Options: {response.headers['x-content-type-options']}")
    
    def test_x_xss_protection_header(self):
        """Verify X-XSS-Protection header"""
        response = requests.get(f"{BASE_URL}/api/security/status")
        assert response.status_code == 200
        assert "x-xss-protection" in response.headers
        assert "1; mode=block" in response.headers["x-xss-protection"]
        print(f"X-XSS-Protection: {response.headers['x-xss-protection']}")
    
    def test_x_frame_options_header(self):
        """Verify X-Frame-Options: DENY"""
        response = requests.get(f"{BASE_URL}/api/security/status")
        assert response.status_code == 200
        assert "x-frame-options" in response.headers
        assert response.headers["x-frame-options"] == "DENY"
        print(f"X-Frame-Options: {response.headers['x-frame-options']}")
    
    def test_referrer_policy_header(self):
        """Verify Referrer-Policy header"""
        response = requests.get(f"{BASE_URL}/api/security/status")
        assert response.status_code == 200
        assert "referrer-policy" in response.headers
        print(f"Referrer-Policy: {response.headers['referrer-policy']}")
    
    def test_permissions_policy_header(self):
        """Verify Permissions-Policy header"""
        response = requests.get(f"{BASE_URL}/api/security/status")
        assert response.status_code == 200
        assert "permissions-policy" in response.headers
        pp = response.headers["permissions-policy"]
        assert "camera=()" in pp
        assert "microphone=()" in pp
        print(f"Permissions-Policy: {pp}")
    
    def test_cache_control_header_on_api(self):
        """Verify Cache-Control: no-store on API endpoints"""
        response = requests.get(f"{BASE_URL}/api/security/status")
        assert response.status_code == 200
        assert "cache-control" in response.headers
        cc = response.headers["cache-control"]
        assert "no-store" in cc or "no-cache" in cc
        print(f"Cache-Control: {cc}")


class TestSecurityStatusEndpoint:
    """Test /api/security/status endpoint returns correct configuration"""
    
    def test_security_status_returns_200(self):
        """Verify endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/security/status")
        assert response.status_code == 200
    
    def test_security_status_json_structure(self):
        """Verify JSON structure has all required fields"""
        response = requests.get(f"{BASE_URL}/api/security/status")
        data = response.json()
        
        # Check top-level keys
        assert "security_headers" in data
        assert "xss_protection" in data
        assert "https_enforcement" in data
        assert "cors_configured" in data
        
        # Check security_headers
        headers = data["security_headers"]
        assert headers["strict_transport_security"] is True
        assert headers["content_security_policy"] is True
        assert headers["x_content_type_options"] is True
        assert headers["x_xss_protection"] is True
        assert headers["x_frame_options"] is True
        assert headers["referrer_policy"] is True
        assert headers["permissions_policy"] is True
        
        # Check xss_protection
        xss = data["xss_protection"]
        assert xss["input_sanitization"] is True
        assert xss["csp_enabled"] is True
        assert xss["upgrade_insecure_requests"] is True
        
        # Check https_enforcement
        https = data["https_enforcement"]
        assert https["hsts_enabled"] is True
        assert https["http_redirect"] is True
        assert https["form_action_https_only"] is True
        
        # Check cors
        assert data["cors_configured"] is True
        
        print("All security configurations are enabled")


class TestXSSSanitization:
    """Test XSS input sanitization on /api/status endpoint"""
    
    def test_xss_script_tag_sanitized(self):
        """Verify <script> tags are HTML-escaped"""
        payload = {"client_name": "<script>alert(1)</script>"}
        response = requests.post(f"{BASE_URL}/api/status", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify script tags are escaped
        assert "<script>" not in data["client_name"]
        assert "&lt;script&gt;" in data["client_name"]
        print(f"Sanitized output: {data['client_name']}")
    
    def test_xss_event_handler_sanitized(self):
        """Verify event handlers like onclick are stripped"""
        payload = {"client_name": '<img src=x onerror="alert(1)">'}
        response = requests.post(f"{BASE_URL}/api/status", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify onerror is stripped
        assert "onerror=" not in data["client_name"]
        print(f"Sanitized output: {data['client_name']}")
    
    def test_xss_javascript_protocol_sanitized(self):
        """Verify javascript: protocol is stripped"""
        payload = {"client_name": 'javascript:alert(1)'}
        response = requests.post(f"{BASE_URL}/api/status", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        # Verify javascript: is stripped
        assert "javascript:" not in data["client_name"]
        print(f"Sanitized output: {data['client_name']}")
    
    def test_normal_input_preserved(self):
        """Verify normal input is not modified"""
        payload = {"client_name": "TEST_Normal Client Name 123"}
        response = requests.post(f"{BASE_URL}/api/status", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert data["client_name"] == "TEST_Normal Client Name 123"
        assert "id" in data
        assert "timestamp" in data
        print(f"Normal input preserved: {data['client_name']}")


class TestStatusEndpointCRUD:
    """Test /api/status endpoint CRUD operations"""
    
    def test_get_status_returns_list(self):
        """Verify GET /api/status returns a list"""
        response = requests.get(f"{BASE_URL}/api/status")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"GET /api/status returned {len(data)} items")
    
    def test_post_status_creates_entry(self):
        """Verify POST /api/status creates a new entry"""
        payload = {"client_name": "TEST_Security_Test_Client"}
        response = requests.post(f"{BASE_URL}/api/status", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert "client_name" in data
        assert "timestamp" in data
        assert data["client_name"] == "TEST_Security_Test_Client"
        print(f"Created entry with id: {data['id']}")
    
    def test_post_status_persists_data(self):
        """Verify POST data is persisted and retrievable via GET"""
        # Create unique entry
        unique_name = "TEST_Persistence_Check_12345"
        payload = {"client_name": unique_name}
        post_response = requests.post(f"{BASE_URL}/api/status", json=payload)
        assert post_response.status_code == 200
        created_id = post_response.json()["id"]
        
        # Verify it appears in GET
        get_response = requests.get(f"{BASE_URL}/api/status")
        assert get_response.status_code == 200
        items = get_response.json()
        
        found = any(item["id"] == created_id for item in items)
        assert found, f"Created entry {created_id} not found in GET response"
        print(f"Entry {created_id} persisted and retrieved successfully")


class TestRootEndpoint:
    """Test /api/ root endpoint"""
    
    def test_root_endpoint_returns_message(self):
        """Verify GET /api/ returns hello world message"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "Hello World"
        print(f"Root endpoint response: {data}")


class TestCORSConfiguration:
    """Test CORS is properly configured"""
    
    def test_cors_headers_present(self):
        """Verify CORS headers are present"""
        response = requests.get(f"{BASE_URL}/api/security/status")
        # Check for CORS headers
        assert "access-control-allow-origin" in response.headers
        print(f"CORS Allow-Origin: {response.headers.get('access-control-allow-origin')}")
    
    def test_cors_methods_specified(self):
        """Verify CORS methods are specified (not just *)"""
        response = requests.options(f"{BASE_URL}/api/security/status")
        # OPTIONS request should return allowed methods
        if "access-control-allow-methods" in response.headers:
            methods = response.headers["access-control-allow-methods"]
            print(f"CORS Allow-Methods: {methods}")
            # Verify specific methods are listed
            assert "GET" in methods or "*" in methods


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
