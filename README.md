# Real-time Driver Matching System

A high-performance, production-ready driver matching system built with **Node.js**, **TypeScript**, **Redis**, and **WebSockets**. Designed for ride-sharing and delivery platforms with real-time location tracking and intelligent driver assignment.

### Tech Stack

- **Runtime**: Node.js 20
- **Language**: TypeScript
- **Database**: Redis 7 (GeoSpatial + Pub/Sub)
- **WebSocket**: ws library
- **Logging**: Pino
- **Validation**: Zod
- **Containerization**: Docker + Docker Compose

---

## Quick Start

### Prerequisites

```bash
node --version  # v20.x or higher
docker --version
docker-compose --version
```

### Installation

```bash
# Clone the repository
git clone https://github.com/ItsAbir005/super-funicular.git

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### Environment Variables

Create a `.env` file:

```env
NODE_ENV=development
PORT=3000
REDIS_URL=redis://localhost:6379
```

### Running Locally

```bash
# Start Redis
docker-compose up redis -d

# Run application in development mode
npm run dev

# Or build and run production
npm run build
npm start
```

### Running with Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

---

## API Documentation

### Base URL
```
http://localhost:3000
```

### Endpoints

#### 1. Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "redis": "up",
  "websocket": {
    "connections": 5,
    "alive": 5
  },
  "circuit": {
    "redis": {
      "isOpen": false,
      "failures": 0,
      "errorRate": 0
    },
    "matching": {
      "isOpen": false,
      "failures": 0,
      "errorRate": 0
    }
  }
}
```

---

#### 2. System Metrics
```http
GET /metrics
```

**Response:**
```json
{
  "timestamp": 1706025600000,
  "websocket": {
    "total": 5,
    "alive": 5,
    "dead": 0
  },
  "circuit_breakers": {
    "redis": {...},
    "matching": {...}
  },
  "uptime": 3600.5,
  "memory": {
    "rss": 52428800,
    "heapTotal": 20971520,
    "heapUsed": 15728640
  }
}
```

---

#### 3. Match Driver
```http
POST /match
Content-Type: application/json

{
  "lat": 40.7128,
  "lng": -74.0060,
  "idempotencyKey": "optional-unique-id"
}
```

**Success Response:**
```json
{
  "driverId": "driver-123",
  "distance": 234.56,
  "searchRadius": 3000,
  "attemptCount": 1
}
```

**Error Response:**
```json
{
  "error": "No drivers available within 10000m",
  "requestId": "abc-123"
}
```

**Features:**
- Searches in expanding radius: 3km → 5km → 7km → 9km → 10km
- Idempotency protection (60 second window)
- Circuit breaker protection
- Automatic driver locking

---

#### 4. Release Driver
```http
POST /release/:driverId
```

**Example:**
```http
POST /release/driver-123
```

**Response:**
```json
{
  "success": true,
  "driverId": "driver-123"
}
```

---

## WebSocket API

### Connection
```
ws://localhost:8081
```

### Messages

#### Subscribe to Location Updates
```json
{
  "type": "SUBSCRIBE",
  "lat": 40.7128,
  "lng": -74.0060
}
```

**Response:**
```json
{
  "type": "SUBSCRIBED",
  "cell": "4071:-740",
  "lat": 40.7128,
  "lng": -74.0060
}
```

---

#### Update Driver Location
```json
{
  "type": "DRIVER_LOCATION",
  "driverId": "driver-123",
  "lat": 40.7128,
  "lng": -74.0060
}
```

Publishes to all subscribers in the same cell.

---

#### Ping/Pong
```json
{
  "type": "PING"
}
```

**Response:**
```json
{
  "type": "PONG",
  "timestamp": 1706025600000
}
```

---

#### Unsubscribe
```json
{
  "type": "UNSUBSCRIBE",
  "lat": 40.7128,
  "lng": -74.0060
}
```

Or unsubscribe from all:
```json
{
  "type": "UNSUBSCRIBE"
}
```

---

## 🧪 Testing

### Seed Test Data

```bash
npx ts-node test-data-seeder.ts
```

This creates 5 test drivers in NYC area:
- `driver-1` to `driver-5` at various locations
- `driver-1, 2, 3, 5` are AVAILABLE
- `driver-4` is BUSY

### Postman Collection

Import this collection to test all endpoints:

**Test Flow:**
```bash
# 1. Health Check
GET http://localhost:3000/health

# 2. System Metrics
GET http://localhost:3000/metrics

# 3. Match a Driver
POST http://localhost:3000/match
Content-Type: application/json
{
  "lat": 40.7128,
  "lng": -74.0060
}

# 4. Release Driver
POST http://localhost:3000/release/driver-1

# 5. Match Again (should get same driver)
POST http://localhost:3000/match
Content-Type: application/json
{
  "lat": 40.7128,
  "lng": -74.0060
}

# 6. Test Idempotency
POST http://localhost:3000/match
Content-Type: application/json
{
  "lat": 40.7580,
  "lng": -73.9855,
  "idempotencyKey": "unique-key-123"
}

# Duplicate request (should fail)
POST http://localhost:3000/match
Content-Type: application/json
{
  "lat": 40.7580,
  "lng": -73.9855,
  "idempotencyKey": "unique-key-123"
}
```

### WebSocket Testing

Using `wscat`:
```bash
npm install -g wscat
wscat -c ws://localhost:8081

# Then send messages
> {"type":"SUBSCRIBE","lat":40.7128,"lng":-74.0060}
> {"type":"PING"}
> {"type":"DRIVER_LOCATION","driverId":"driver-99","lat":40.7128,"lng":-74.0060}
```
---
