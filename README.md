# Visioryx

AI-Powered Real-Time Face Recognition & Surveillance System

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Real-time Face Recognition** - Detect and identify faces from camera streams
- **Multi-platform Support** - Web dashboard (Next.js) + Mobile app (React Native/Expo)
- **Analytics Dashboard** - Detection trends, statistics, and forensic analysis
- **User Management** - Role-based access (Admin, Operator, Enrollee)
- **Face Enrollment** - In-app enrollment with voice guidance
- **Alert System** - Configurable alerts with severity levels
- **Audit Logging** - Track all administrative actions
- **Cloudflare Integration** - CDN, SSL, and R2 storage support

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI (Python) |
| Database | PostgreSQL (Neon) |
| Web Dashboard | Next.js + Tailwind CSS |
| Mobile App | React Native + Expo |
| Face Recognition | InsightFace, OpenCV |
| Streaming | MediaMTX, WebRTC, MJPEG |

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.10+
- PostgreSQL (Neon or local)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Devender0077/Visioryx.git
cd Visioryx
```

2. **Start development servers**
```bash
./scripts/start-dev.sh all
```

This starts:
- Backend API (port 8000)
- Web Dashboard (port 3000)
- Mobile Metro Bundler (port 8081)

### Environment Variables

**Backend** (`backend/.env`):
```env
DATABASE_URL=postgresql://...
SECRET_KEY=<generate-with-openssl-rand-hex-32>
DEBUG=false
PUBLIC_DASHBOARD_URL=http://localhost:3000
```

**Mobile** (`mobile/.env`):
```env
EXPO_PUBLIC_API_URL=http://localhost:8000
```

## Default Credentials

- Email: `admin@visioryx.dev`
- Password: `admin123`

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/register` - Register
- `POST /api/v1/auth/forgot-password` - Password recovery
- `POST /api/v1/auth/reset-password` - Reset password
- `POST /api/v1/auth/refresh` - Refresh token

### Users
- `GET /api/v1/users` - List users
- `POST /api/v1/users` - Create user
- `PATCH /api/v1/users/{id}` - Update user
- `DELETE /api/v1/users/{id}` - Delete user

### Cameras
- `GET /api/v1/cameras` - List cameras
- `POST /api/v1/cameras` - Add camera
- `DELETE /api/v1/cameras/{id}` - Remove camera

### Detections
- `GET /api/v1/detections` - List detections
- `GET /api/v1/detections/export.csv` - Export CSV

### Alerts
- `GET /api/v1/alerts` - List alerts
- `PATCH /api/v1/alerts/{id}/read` - Mark as read

### Analytics
- `GET /api/v1/analytics/overview` - Dashboard stats
- `GET /api/v1/analytics/detection-trends` - Trends over time

### Settings
- `GET /api/v1/settings` - App settings
- `PATCH /api/v1/settings` - Update settings
- `GET /api/v1/settings/brand` - Brand settings
- `POST /api/v1/settings/brand` - Save brand settings

## Security

- JWT authentication with refresh tokens
- Rate limiting (100 requests/minute)
- Login attempt tracking (5 failed = 5 min lockout)
- Security headers (HSTS, CSP, X-Frame-Options)
- TLS 1.3 / HTTPS encryption

## Deployment

### Production Setup

1. **Configure environment**
```env
DEBUG=false
CORS_ORIGINS=https://your-domain.com
SECRET_KEY=<strong-random-key>
```

2. **Setup SSL** (using Cloudflare)
```bash
./scripts/setup-cloudflare-ssl.sh your-domain.com
```

3. **Build mobile apps**
```bash
./scripts/build-mobile.sh
```

### Cloudflare Configuration

In Admin Settings → Cloudflare:
- Enable Cloudflare
- Enter API Token and Zone ID
- Configure R2 storage for mobile app uploads
- Enable SSL

### Brand Settings

In Admin Settings → Brand:
- Upload company logo
- Upload favicon
- Set company name
- Set copyright text

## Project Structure

```
Visioryx/
├── backend/           # FastAPI backend
│   ├── app/
│   │   ├── api/      # API endpoints
│   │   ├── core/     # Config, security
│   │   ├── database/  # Models, connection
│   │   └── services/  # Business logic
│   └── scripts/      # Seed data
├── frontend/          # Next.js web dashboard
│   └── src/
│       ├── app/      # Pages
│       └── components/
├── mobile/           # React Native/Expo app
│   ├── app/         # Screens
│   └── lib/         # API, utils
├── scripts/          # Build & deployment scripts
└── docker/          # Docker configurations
```

## License

MIT License - See LICENSE file for details
