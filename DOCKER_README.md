# 🐳 Docker Testing & Railway Deployment

Simple workflow to test locally with Docker, then deploy to Railway.

## 🎯 Quick Start

### 1. Get API Keys (5 min)
- **Supabase**: [supabase.com](https://supabase.com) → New Project → Settings → API
- **Google AI**: [makersuite.google.com](https://makersuite.google.com/app/apikey) → Create API Key

### 2. Configure Local Environment
Edit `.env.local` with your keys:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
GOOGLE_API_KEY=your_google_key
```

### 3. Test Locally with Docker
```bash
# Build and start
docker-compose up --build -d

# Test all APIs
node test-apis.js

# View logs
docker-compose logs -f

# Stop when done
docker-compose down
```

### 4. Deploy to Railway
1. Go to [railway.app](https://railway.app)
2. Deploy from GitHub repo
3. Add same environment variables
4. Test deployed app: `node test-apis.js --url https://your-app.railway.app`

## 📚 Detailed Guides

- **Local Testing**: See `LOCAL_TESTING.md`
- **Railway Deployment**: See `RAILWAY_DEPLOY.md`

## 🧪 Test Results Expected

```
✅ Health check passed
✅ Document upload successful (Hebrew text with tables)
✅ RAG search successful (Hebrew queries)
✅ Chat successful (Hebrew responses with table formatting)
✅ Database cleanup endpoint accessible
```

## 🚀 Features Tested

- Hebrew document processing with table detection
- OCR for Hebrew text in images  
- Multilingual chat responses
- Proper Hebrew table formatting in responses
- Database cleanup functionality

**Ready for production!** 🎉