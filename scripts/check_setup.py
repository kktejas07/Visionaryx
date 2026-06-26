#!/usr/bin/env python3
"""Quick database setup verification."""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

def check_setup():
    """Verify database tables exist."""
    try:
        from app.database.connection import AsyncSessionLocal
        from app.database.models import User, AuthUser, Camera, Alert, Detection
        import asyncio
        
        async def verify():
            async with AsyncSessionLocal() as db:
                from sqlalchemy import text
                await db.execute(text("SELECT 1"))
            return True
        
        asyncio.run(verify())
        print("✅ Database tables verified")
        return True
    except Exception as e:
        print(f"❌ Database check failed: {e}")
        print("Make sure backend/.env has correct DATABASE_URL")
        return False

if __name__ == "__main__":
    sys.exit(0 if check_setup() else 1)
