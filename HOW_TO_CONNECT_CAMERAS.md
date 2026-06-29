# How to Connect Cameras

This guide covers connecting three camera types: **RTSP/IP cameras**, **Phone (wireless) cameras**, and **Wireless cameras**.

---

## 1. RTSP / IP Camera

Connect a physical CCTV camera or NVR that supports RTSP.

### Prerequisites
- Camera must be on the same local network (same WiFi/LAN) as the backend server
- You need the camera's RTSP URL — check the manufacturer's manual
- Common formats:
  - Hikvision: `rtsp://username:password@192.168.x.x:554/Streaming/Channels/101`
  - Dahua: `rtsp://username:password@192.168.x.x:554/cam/realmonitor?channel=1&subtype=0`
  - Generic ONVIF: `rtsp://username:password@192.168.x.x/onvif1`

### Steps
1. Open the dashboard → **Cameras** tab
2. Click **"Add camera"**
3. Enter a name and paste the RTSP URL
4. Click **"Add node"**
5. Go to **Live Monitoring** → start the stream

### Quality
You can switch between `480p`, `720p`, and `1080p` from the stream toolbar. Higher quality uses more CPU/bandwidth.

### Troubleshooting
| Problem | Fix |
|---------|-----|
| "No signal" / black screen | Camera IP must be reachable from the backend (not just your browser). Try: `ping 192.168.x.x` from the server. |
| Stream keeps disconnecting | Use TCP transport: add `?tcp` to RTSP URL, or set `RTSP_CAPTURE_BACKEND=ffmpeg` in `.env` |
| RTSP URL has `subtype=` | The dashboard will auto-detect and switch between main stream (`subtype=0`) and sub stream (`subtype=1`) based on quality selection |

### Direct ffmpeg test
```bash
ffmpeg -rtsp_transport tcp -i "rtsp://user:pass@192.168.x.x:554/stream" -frames:v 1 -f null -
```

---

## 2. Phone Camera (Wireless)

Turn any phone or tablet into a wireless camera. The phone streams its camera feed over WebSocket.

### Prerequisites
- The phone and the computer running Visionaryx must be on the **same WiFi network**
- The phone needs a web browser (Chrome/Safari recommended)
- **Important**: The phone must be able to reach the Visionaryx frontend

### Finding your LAN IP
On macOS: `ipconfig getifaddr en0`  
On Linux: `hostname -I | awk '{print $1}'`  
On Windows: `ipconfig` → look for "IPv4 Address"

The Expo dev server frontend runs on port `8081` by default.
Your frontend URL is: `http://<YOUR_LAN_IP>:8081`

### Steps
1. Open the dashboard → **Cameras** tab
2. Click **"Wireless"**
3. Enter a camera name (e.g. "Lobby iPhone")
4. **IMPORTANT**: Set the **App URL** field to your frontend's LAN URL (e.g., `http://192.168.1.5:8081`).
   - If it says `localhost`, replace it — your phone cannot access `localhost` on your computer
   - ⚠️ A warning will appear if `localhost` is detected
5. Click **"Create + show QR"**
6. Scan the QR code with your phone's camera app
7. On the phone, tap **"Start camera"** — allow camera permissions when prompted
8. The phone will start streaming frames to the backend

### Viewing the stream
Once the phone is streaming:
1. Go to **Cameras** tab
2. Click the **eye icon** on the phone camera row
3. The live preview modal shows the phone's camera feed

### How it works
- Phone captures frames via `getUserMedia()` at ~6fps
- Each frame is JPEG-encoded and sent as binary over WebSocket
- Backend stores frames in MongoDB and re-streams them as MJPEG
- Camera auto-marks as offline if no frames arrive for 30 seconds

### Troubleshooting Phone Cameras
| Problem | Fix |
|---------|-----|
| QR scan takes me to "page not found" | The App URL in the QR is wrong. Make sure you use the LAN IP (not localhost) and the correct port (usually 8081 for Expo). |
| "Disconnected" / camera keeps going offline | Phone lost WiFi or browser tab was closed. Keep the browser tab open and active. |
| Pair token expired | Tokens expire after 24 hours. Create a new wireless camera. |
| WebSocket error on phone | Backend may not be reachable. Check that the backend is running on `0.0.0.0:8000` and firewall allows it. |
| No camera permission prompt | Ensure you're using HTTPS (required for getUserMedia). For local dev, use `http://` LAN URLs. |

### Environment Variables for Production Deployment
```bash
# In backend .env:
PUBLIC_FRONTEND_URL=https://yourapp.com

# In frontend .env / mobile/.env:
EXPO_PUBLIC_API_URL=https://yourapi.com
```

---

## 3. Test / Demo Cameras

Use test cameras for development without any physical hardware.

### Steps
1. Add a camera with RTSP URL set to `test://demo`
2. The system generates animated test patterns with camera names
3. Face detection still runs but won't find real faces

---

## 4. Streaming Modes

Visionaryx supports multiple streaming modes:

| Mode | How it works | Best for |
|------|-------------|----------|
| **MJPEG** | Server captures RTSP → draws detection overlay → streams JPEG frames | Face detection overlays, direct viewing |
| **HLS** | FFmpeg transcodes RTSP to HLS segments | Browser compatibility, Safari/iOS |
| **WebRTC** | MediaMTX relays RTSP via WebRTC | Lowest latency |

The system auto-selects the best available mode. MJPEG is the default fallback.

---

## 5. Face Detection Overlay

Face detection runs server-side on the capture thread:

- **Green boxes** = known/registered faces (matched against enrolled users)
- **Red boxes** = unknown faces
- **Orange boxes** = detected objects (if YOLO is enabled)

### Enabling/Disabling
- Face detection: set `STREAM_ENABLE_AI_OVERLAY=true` in `.env` (default: on)
- Object detection: set `STREAM_ENABLE_YOLO_OVERLAY=true` in `.env` (default: off on macOS)
- Can also be toggled via Admin Settings UI

### Performance Notes
- On macOS: uses OpenCV Haar cascade for face detection (InsightFace is avoided in capture threads to prevent crashes)
- On Linux: uses InsightFace for better accuracy
- Labels are drawn above/below bounding boxes to avoid covering faces
- Detection runs every 5th frame for CPU efficiency while maintaining real-time feel
