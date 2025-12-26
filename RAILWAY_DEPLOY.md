# 🚂 Railway Deployment Guide

Deploy your tested Hebrew RAG system to Railway.app (free tier).

## ✅ Prerequisites

- [ ] Local Docker testing completed successfully
- [ ] All API tests passing with `node test-apis.js`
- [ ] Environment variables ready from `.env.local`

## 🚀 Step 1: Deploy to Railway

### 1.1 Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Click "Login" → "Login with GitHub"
3. Authorize Railway to access your repositories

### 1.2 Deploy from GitHub
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your repository: `rag_321`
4. Railway will automatically detect the Dockerfile

### 1.3 Add Environment Variables
In the Railway dashboard, go to **Variables** tab and add:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key

# Google AI Configuration  
GOOGLE_API_KEY=your_google_api_key

# Application Configuration
NODE_ENV=production
PORT=3000
NEXT_TELEMETRY_DISABLED=1

# Optional Performance
NODE_OPTIONS=--max-old-space-size=512
ADMIN_KEY=your_secure_admin_key
```

### 1.4 Deploy
1. Click "Deploy" 
2. Wait for build to complete (~3-5 minutes)
3. Railway will provide your app URL

## 🧪 Step 2: Test Deployed Application

### 2.1 Get Your Railway URL
- Copy the URL from Railway dashboard (e.g., `https://your-app.railway.app`)

### 2.2 Run API Tests
```bash
# Test your deployed app
node test-apis.js --url https://your-app.railway.app

# Should show all tests passing
```

### 2.3 Manual Testing
1. **Health Check**: `https://your-app.railway.app/api/health`
2. **Web Interface**: `https://your-app.railway.app`
3. **Upload Hebrew Document** with tables
4. **Ask Hebrew Questions**: "מה יש בטבלה?"

## 📊 Railway Free Tier Limits

- **Hours**: 500 hours/month (enough for development)
- **Memory**: 1GB RAM
- **Storage**: 1GB
- **Bandwidth**: Unlimited
- **Sleep**: No auto-sleep (unlike Render)

## 🔧 Monitoring & Debugging

### View Logs
1. Railway Dashboard → Your Project
2. Click "Deployments" tab
3. Click latest deployment → "View Logs"

### Check Metrics
1. Railway Dashboard → "Metrics" tab
2. Monitor CPU, Memory, Network usage

### Common Issues & Solutions

#### Build Fails:
```bash
# Check build logs in Railway dashboard
# Usually environment variable issues
```

#### Memory Issues:
```bash
# Add to Railway environment variables:
NODE_OPTIONS=--max-old-space-size=512
```

#### Slow Startup:
```bash
# Normal for first deployment (Docker image download)
# Subsequent deployments are faster
```

## 🔄 Continuous Deployment

Railway automatically redeploys when you push to GitHub:

```bash
# Make changes locally
git add .
git commit -m "Update Hebrew table detection"
git push origin main

# Railway automatically rebuilds and deploys
```

## 🌐 Custom Domain (Optional)

1. Railway Dashboard → Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

## 📈 Scaling (When Ready)

### Upgrade to Pro Plan:
- **$5/month** for more resources
- **8GB RAM**, **8GB storage**
- **Priority support**

### Performance Optimization:
```bash
# Add to environment variables for better performance:
NEXT_CACHE_HANDLER=redis  # If using Redis
NEXT_REVALIDATE=3600      # Cache optimization
```

## ✅ Deployment Checklist

- [ ] Railway account created and GitHub connected
- [ ] Repository deployed successfully
- [ ] All environment variables added
- [ ] Build completed without errors
- [ ] Health endpoint returns 200
- [ ] API tests pass on deployed URL
- [ ] Hebrew document upload works
- [ ] Hebrew table queries return proper format
- [ ] Chat responses work in Hebrew/English

## 🎉 Success!

Your Hebrew RAG system is now live at:
**`https://your-app.railway.app`**

### Features Working:
- ✅ Hebrew document processing with table detection
- ✅ OCR for Hebrew text in images
- ✅ Multilingual chat responses
- ✅ Proper Hebrew table formatting
- ✅ Database cleanup functionality
- ✅ Production-ready performance

### Next Steps:
1. **Share your URL** with users
2. **Monitor usage** in Railway dashboard
3. **Scale up** when needed
4. **Add custom domain** if desired

**Your Hebrew RAG system is production-ready!** 🚀