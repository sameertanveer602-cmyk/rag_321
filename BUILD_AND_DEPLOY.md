# 🐳 Build Docker Image & Deploy to Railway

Complete workflow: Build Docker image locally → Test → Deploy to Railway

## 📋 Prerequisites

1. **Docker Desktop** installed and running
2. **Railway CLI** (optional, for advanced deployment)
3. **API Keys** ready

## 🔑 Step 1: Get API Keys

### Supabase (Free Database):
1. Go to [supabase.com](https://supabase.com) → "New Project"
2. Wait 2 minutes for setup
3. Go to Settings → API → Copy:
   - Project URL
   - anon public key
   - service_role secret key

### Google AI (Free API):
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create API Key → Copy it

## ⚙️ Step 2: Configure Environment

Create `.env.local` with your actual keys:
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_actual_service_key

# Google AI Configuration
GOOGLE_API_KEY=your_actual_google_key

# Application Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=production
PORT=3000
ADMIN_KEY=dev-admin-key
NEXT_TELEMETRY_DISABLED=1
```

## 🗄️ Step 3: Setup Database

1. Go to Supabase project → SQL Editor
2. Run the SQL from `complete-database-setup.sql`

## 🔨 Step 4: Build Docker Image

```bash
# Build the Docker image
docker build -t hebrew-rag-system:latest .

# Check if image was created
docker images | grep hebrew-rag-system
```

Expected output:
```
hebrew-rag-system   latest   abc123def456   2 minutes ago   1.2GB
```

## 🧪 Step 5: Test Docker Image Locally

```bash
# Run the container
docker run -d \
  --name hebrew-rag-test \
  -p 3000:3000 \
  --env-file .env.local \
  hebrew-rag-system:latest

# Check if container is running
docker ps

# View logs
docker logs hebrew-rag-test -f
```

Wait for startup message:
```
✓ Ready in 4.3s
- Local:        http://localhost:3000
```

## 🧪 Step 6: Test All APIs

```bash
# Test all endpoints
node test-apis.js

# Expected output:
# ✅ Health check passed
# ✅ Document upload successful
# ✅ RAG search successful
# ✅ Chat successful
# ✅ Database cleanup endpoint accessible
```

## 🌐 Step 7: Manual Testing

Open browser and test:
1. **Health**: http://localhost:3000/api/health
2. **App**: http://localhost:3000
3. **Upload Hebrew document** with tables
4. **Ask Hebrew questions** about tables

## 🧹 Step 8: Cleanup Local Test

```bash
# Stop and remove test container
docker stop hebrew-rag-test
docker rm hebrew-rag-test
```

## 🚂 Step 9: Deploy to Railway

### Option A: GitHub Deployment (Recommended)

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Ready for Railway deployment"
   git push origin main
   ```

2. **Deploy on Railway:**
   - Go to [railway.app](https://railway.app)
   - Login with GitHub
   - "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway auto-detects Dockerfile

3. **Add Environment Variables:**
   In Railway dashboard → Variables tab:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_actual_service_key
   GOOGLE_API_KEY=your_actual_google_key
   NODE_ENV=production
   PORT=3000
   NEXT_TELEMETRY_DISABLED=1
   ADMIN_KEY=your_secure_admin_key
   ```

4. **Deploy:**
   - Railway builds automatically
   - Wait 3-5 minutes for deployment
   - Get your URL from Railway dashboard

### Option B: Docker Image Upload (Advanced)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project
railway new

# Deploy Docker image
railway up --detach
```

## 🧪 Step 10: Test Deployed App

```bash
# Test your Railway deployment
node test-apis.js --url https://your-app.railway.app

# Should show all tests passing
```

## 📊 Step 11: Monitor Deployment

1. **Railway Dashboard** → Your Project
2. **Check Metrics**: CPU, Memory, Network
3. **View Logs**: Deployments → Latest → View Logs
4. **Monitor Usage**: Free tier limits

## 🔧 Troubleshooting

### Build Fails:
```bash
# Check Docker build logs
docker build -t hebrew-rag-system:latest . --no-cache

# Common issues:
# - Missing dependencies in Dockerfile
# - Network issues downloading packages
```

### Container Won't Start:
```bash
# Check container logs
docker logs hebrew-rag-test

# Common issues:
# - Wrong environment variables
# - Port conflicts
# - Memory issues
```

### Railway Deployment Fails:
```bash
# Check Railway logs in dashboard
# Common issues:
# - Missing environment variables
# - Build timeout (increase in settings)
# - Memory limits exceeded
```

## ✅ Success Checklist

- [ ] Docker image builds successfully
- [ ] Container runs locally without errors
- [ ] All API tests pass locally
- [ ] Hebrew document upload works
- [ ] Hebrew table queries return formatted results
- [ ] Railway deployment completes
- [ ] All API tests pass on Railway URL
- [ ] Web interface works on Railway

## 🎉 Final Result

Your Hebrew RAG system is now:
- ✅ **Dockerized** and tested locally
- ✅ **Deployed** on Railway with free hosting
- ✅ **Processing** Hebrew documents with table detection
- ✅ **Responding** to Hebrew queries with proper formatting
- ✅ **Production-ready** with monitoring and scaling

**Your app URL**: `https://your-app.railway.app`

**Ready for users!** 🚀