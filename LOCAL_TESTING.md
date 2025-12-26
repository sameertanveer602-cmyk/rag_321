# 🧪 Local Docker Testing Guide

Test your Hebrew RAG system locally before deploying to Railway.

## 📋 Prerequisites

1. **Docker Desktop** installed and running
2. **API Keys** ready (see setup below)

## 🔑 Step 1: Get API Keys (5 minutes)

### Supabase Database (Free):
1. Go to [supabase.com](https://supabase.com) → "New Project"
2. Wait 2 minutes for setup
3. Go to Settings → API → Copy these values:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY`

### Google AI API (Free):
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key → `GOOGLE_API_KEY`

## ⚙️ Step 2: Configure Environment

Edit `.env.local` with your actual values:
```bash
# Replace these with your actual keys:
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_actual_service_key
GOOGLE_API_KEY=your_actual_google_key
```

## 🗄️ Step 3: Setup Database Tables

1. Go to your Supabase project → SQL Editor
2. Copy and run the SQL from `complete-database-setup.sql`

## 🐳 Step 4: Build and Test Docker Image

```bash
# Build the Docker image
docker-compose build

# Start the container
docker-compose up -d

# Check if it's running
docker-compose ps

# View logs
docker-compose logs -f
```

## 🧪 Step 5: Test All APIs

```bash
# Run comprehensive API tests
node test-apis.js

# Or test specific URL
node test-apis.js --url http://localhost:3000
```

### Expected Test Results:
```
🧪 Testing Hebrew RAG System APIs
=================================

1️⃣  Testing Health Endpoint...
   ✅ Health check passed

2️⃣  Testing Document Upload...
   ✅ Document upload successful
   📄 Chunks created: 3
   🆔 Document ID: doc_xxxxx

3️⃣  Testing RAG Search...
   ✅ RAG search successful
   💬 Answer: בטבלה יש מוצרים עם מחירים...

4️⃣  Testing Chat API...
   ✅ Chat successful
   🤖 Response: הנתונים בטבלה כוללים...

5️⃣  Testing Database Cleanup...
   ✅ Database cleanup endpoint accessible

🎉 Test suite completed!
```

## 🌐 Step 6: Manual Testing

Open your browser and test:

1. **Health Check**: http://localhost:3000/api/health
2. **Main App**: http://localhost:3000
3. **Upload Hebrew Document** via the web interface
4. **Ask Hebrew Questions** about tables

## 🔧 Troubleshooting

### Container Won't Start:
```bash
# Check logs
docker-compose logs

# Rebuild if needed
docker-compose down
docker-compose build --no-cache
docker-compose up
```

### API Tests Fail:
```bash
# Check if container is running
docker-compose ps

# Check environment variables
docker-compose exec hebrew-rag-app env | grep SUPABASE

# Check health endpoint manually
curl http://localhost:3000/api/health
```

### Memory Issues:
```bash
# Check Docker memory usage
docker stats

# If needed, increase Docker Desktop memory limit
# Docker Desktop → Settings → Resources → Memory
```

## 🚂 Step 7: Deploy to Railway

Once all tests pass locally:

1. **Go to [railway.app](https://railway.app)**
2. **Connect your GitHub repository**
3. **Add the same environment variables** from `.env.local`
4. **Railway auto-deploys** using your Dockerfile
5. **Test the deployed URL** with: `node test-apis.js --url https://your-app.railway.app`

## 📊 Performance Notes

- **Local**: Full performance, no limits
- **Railway Free**: 500 hours/month, 1GB RAM
- **Memory Usage**: ~300-500MB typical
- **Startup Time**: ~30-60 seconds

## ✅ Success Checklist

- [ ] Docker container starts successfully
- [ ] Health endpoint returns 200
- [ ] Hebrew document uploads work
- [ ] Hebrew table queries return formatted results
- [ ] Chat API responds in Hebrew/English
- [ ] Database cleanup is accessible
- [ ] All API tests pass

**Ready for Railway deployment!** 🎉