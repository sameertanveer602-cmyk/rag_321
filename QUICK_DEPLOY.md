# ⚡ Quick Deploy Guide - Hebrew RAG System

## 🎯 Fastest Way to Deploy (5 minutes)

### Step 1: Get Your API Keys

#### Supabase (Free Database):
1. Go to [supabase.com](https://supabase.com) → "New Project"
2. Create project (takes 2 minutes)
3. Go to Settings → API → Copy these 3 values:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
   - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY`

#### Google AI (Free API):
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key" → Copy the key → `GOOGLE_API_KEY`

### Step 2: Deploy to Railway (Recommended)

1. **Go to [railway.app](https://railway.app)**
2. **Sign up with GitHub**
3. **Click "Deploy from GitHub repo"**
4. **Select your repository**
5. **Add Environment Variables:**
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   GOOGLE_API_KEY=your_google_api_key
   NODE_ENV=production
   PORT=3000
   ```
6. **Deploy!** Railway auto-detects Docker and deploys

### Step 3: Setup Database Tables

1. **Go to your Supabase project → SQL Editor**
2. **Run this SQL:**
   ```sql
   -- Copy the content from complete-database-setup.sql
   ```
3. **Or use the setup endpoint:**
   ```bash
   curl -X POST https://your-railway-url.railway.app/api/setup-database
   ```

### Step 4: Test Your Deployment

```bash
# Health check
curl https://your-railway-url.railway.app/api/health

# Upload a test document
curl -X POST https://your-railway-url.railway.app/api/upload \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.txt",
    "content": "SGVsbG8gV29ybGQ="
  }'

# Test Hebrew chat
curl -X POST https://your-railway-url.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "מה יש במסמך?",
    "top_k": 5
  }'
```

## 🔄 Alternative Platforms

### Render.com (Free with sleep):
1. Go to [render.com](https://render.com)
2. New Web Service → Connect GitHub
3. Environment: Docker
4. Add same environment variables
5. Deploy

### Fly.io (Free tier):
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Deploy
flyctl launch --no-deploy
flyctl secrets set NEXT_PUBLIC_SUPABASE_URL=your_url
flyctl secrets set GOOGLE_API_KEY=your_key
# ... add other secrets
flyctl deploy
```

## 🚨 Common Issues & Solutions

### Build Fails:
- Check environment variables are set
- Ensure Docker file is in root directory
- Check logs for specific errors

### Memory Issues:
- Add: `NODE_OPTIONS=--max-old-space-size=512`
- Use Railway (better memory handling)

### OCR Not Working:
- Ensure Alpine packages are installed (they are in our Dockerfile)
- Check if Tesseract is loading properly

### Database Connection Issues:
- Verify Supabase URL and keys
- Check if database tables are created
- Run the database setup SQL

## 🎉 You're Done!

Your Hebrew RAG system is now live and ready to:
- ✅ Process Hebrew documents with tables
- ✅ Extract text from images with OCR
- ✅ Answer questions in Hebrew and English
- ✅ Handle multilingual content
- ✅ Provide proper table formatting

**Your app URL**: `https://your-app-name.railway.app`

Need help? Check `DOCKER_DEPLOYMENT.md` for detailed instructions!