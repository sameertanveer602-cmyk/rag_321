# 🐳 Docker Deployment Guide for Hebrew RAG System

This guide covers deploying your Hebrew RAG system using Docker on various free platforms.

## 🚀 Free Deployment Platforms

### 1. **Railway.app** (Recommended)
- **Free Tier**: 500 hours/month, 1GB RAM, 1GB storage
- **Pros**: Easy setup, automatic deployments, good performance
- **Best for**: Production-ready deployments

### 2. **Render.com**
- **Free Tier**: 750 hours/month, 512MB RAM, auto-sleep after 15min
- **Pros**: Simple configuration, GitHub integration
- **Best for**: Development and testing

### 3. **Fly.io**
- **Free Tier**: 3 shared VMs, 160GB bandwidth/month
- **Pros**: Global edge deployment, good performance
- **Best for**: Global applications

## 📋 Prerequisites

1. **Environment Variables** (create `.env.production`):
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google AI Configuration
GOOGLE_API_KEY=your_google_api_key

# Optional
NEXT_PUBLIC_APP_URL=https://your-app-domain.com
ADMIN_KEY=your_admin_key_for_database_cleanup
```

2. **Docker installed locally** (for testing)
3. **Git repository** with your code

## 🛠️ Local Docker Testing

### Build and Test Locally:
```bash
# Build the Docker image
docker build -t hebrew-rag-system .

# Run locally
docker run -p 3000:3000 --env-file .env.production hebrew-rag-system

# Test the application
curl http://localhost:3000/api/health
```

## 🚂 Railway.app Deployment

### Step 1: Setup Railway
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository

### Step 2: Configure Environment Variables
```bash
# In Railway dashboard, go to Variables tab and add:
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GOOGLE_API_KEY=your_google_api_key
NODE_ENV=production
PORT=3000
```

### Step 3: Deploy
- Railway will automatically detect the `Dockerfile`
- Deployment starts automatically
- Get your URL from the Railway dashboard

## 🎨 Render.com Deployment

### Step 1: Setup Render
1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click "New" → "Web Service"
4. Connect your GitHub repository

### Step 2: Configure Service
```yaml
# Render will use the render.yaml file automatically
# Or configure manually:
- Environment: Docker
- Build Command: (leave empty - uses Dockerfile)
- Start Command: (leave empty - uses Dockerfile CMD)
```

### Step 3: Add Environment Variables
Add the same environment variables as Railway in the Render dashboard.

## ✈️ Fly.io Deployment

### Step 1: Install Fly CLI
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login
```

### Step 2: Initialize and Deploy
```bash
# Initialize (uses fly.toml)
flyctl launch --no-deploy

# Set environment variables
flyctl secrets set NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
flyctl secrets set NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
flyctl secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
flyctl secrets set GOOGLE_API_KEY=your_google_api_key

# Deploy
flyctl deploy
```

## 🔧 Getting API Keys

### Supabase Keys:
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings → API
4. Copy the URL and keys

### Google AI API Key:
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key

## 📊 Performance Optimization

### For Free Tiers:
```dockerfile
# In Dockerfile, optimize for memory usage:
ENV NODE_OPTIONS="--max-old-space-size=512"
```

### Environment Variables for Optimization:
```bash
# Disable telemetry
NEXT_TELEMETRY_DISABLED=1

# Optimize Node.js
NODE_OPTIONS=--max-old-space-size=512
```

## 🔍 Monitoring & Debugging

### Health Check Endpoint:
```bash
curl https://your-app-url.com/api/health
```

### View Logs:
- **Railway**: Dashboard → Deployments → View Logs
- **Render**: Dashboard → Logs tab
- **Fly.io**: `flyctl logs`

### Common Issues:

1. **Memory Issues**: Reduce `NODE_OPTIONS` memory limit
2. **Build Timeouts**: Optimize Dockerfile layers
3. **OCR Issues**: Ensure Alpine packages are installed

## 🎯 Recommended Deployment Flow

1. **Start with Railway** (easiest setup)
2. **Test thoroughly** with Hebrew documents
3. **Monitor performance** and memory usage
4. **Scale up** to paid tiers if needed

## 📱 Testing Your Deployment

### Upload a Hebrew Document:
```bash
curl -X POST https://your-app-url.com/api/upload \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.txt",
    "content": "base64_encoded_hebrew_content"
  }'
```

### Test Hebrew Table Query:
```bash
curl -X POST https://your-app-url.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "מה הנתונים בטבלה?",
    "top_k": 5
  }'
```

Your Hebrew RAG system is now ready for production deployment! 🎉