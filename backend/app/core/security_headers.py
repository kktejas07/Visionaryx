"""
Security middleware for HTTP headers and rate limiting.
"""
import time
from collections import defaultdict
from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # HSTS - Force HTTPS (only in production)
        from app.core.config import get_settings
        settings = get_settings()
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        
        # XSS protection
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # Content Security Policy - allow fonts and external resources for mobile
        response.headers["Content-Security-Policy"] = "default-src 'self'; font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com data:; img-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' https: wss:; frame-src 'self' https:;"
        
        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Permissions policy
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware based on IP address."""
    
    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.requests: dict[str, list[float]] = defaultdict(list)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip rate limiting for health checks
        if request.url.path in ["/", "/health", "/health/db"]:
            return await call_next(request)
        
        client_ip = request.client.host if request.client else "unknown"
        current_time = time.time()
        
        # Clean old requests (older than 1 minute)
        self.requests[client_ip] = [
            req_time for req_time in self.requests[client_ip]
            if current_time - req_time < 60
        ]
        
        # Check rate limit
        if len(self.requests[client_ip]) >= self.requests_per_minute:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "retry_after": 60
                }
            )
        
        # Add current request
        self.requests[client_ip].append(current_time)
        
        return await call_next(request)


class LoginRateLimitMiddleware(BaseHTTPMiddleware):
    """Specific rate limiting for login/forgot-password endpoints."""
    
    # In-memory store: email -> (failed_attempts, locked_until)
    login_attempts: dict[str, tuple[int, float]] = {}
    max_attempts = 5
    lockout_duration = 300  # 5 minutes
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        
        # Only apply to auth endpoints
        if "/auth/login" not in path and "/auth/forgot-password" not in path:
            return await call_next(request)
        
        # Get email from request body if present
        email = None
        if request.method == "POST":
            try:
                body = await request.body()
                import json
                data = json.loads(body) if body else {}
                email = data.get("email", "").lower()
            except:
                pass
        
        if email:
            current_time = time.time()
            attempts, locked_until = self.login_attempts.get(email, (0, 0))
            
            # Check if locked out
            if locked_until > current_time:
                remaining = int(locked_until - current_time)
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": f"Too many failed attempts. Try again in {remaining} seconds.",
                        "locked": True,
                        "retry_after": remaining
                    }
                )
        
        response = await call_next(request)
        
        # Track failed attempts (401 response)
        if email and response.status_code == 401:
            attempts, _ = self.login_attempts.get(email, (0, 0))
            attempts += 1
            
            if attempts >= self.max_attempts:
                self.login_attempts[email] = (attempts, current_time + self.lockout_duration)
            else:
                self.login_attempts[email] = (attempts, 0)
        
        # Reset attempts on successful login
        if email and response.status_code == 200:
            self.login_attempts[email] = (0, 0)
        
        return response
