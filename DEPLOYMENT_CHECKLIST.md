# ✅ Deployment Checklist

Complete checklist for building Docker image and deploying to Railway.

## 🔑 Phase 1: Setup (5 minutes)

- [ ] **Get Supabase Keys**
  - [ ] Go to [supabase.com](https://supabase.com) → New Project
  - [ ] Copy Project URL → `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] Copy anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] Copy service_role secret → `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Get Google AI Key**
  - [ ] Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
  - [ ] Create API Key → `GOOGLE_API_KEY`

- [ ] **Setup Database**
  - [ ] Supabase → SQL Editor
  - [ ] Run SQL from `complete-database-setup.sql`

## 🐳 Phase 2: Docker Build & Test (10 minutes)

- [ ] **Configure Environment**
  - [ ] Edit `.env.local` with your actual API keys
  - [ ] Verify all required keys are set

- [ ] **Build Docker Image**
  - [ ] Windows: Run `build-docker.bat`
  - [ ] Linux/Mac: Run `chmod +x build-docker.sh && ./build-docker.sh`
  - [ ] Verify image builds without errors

- [ ] **Test Locally**
  - [ ] Container starts successfully
  - [ ] Health check passes: http://localhost:3000/api/health
  - [ ] Run: `node test-apis.js`
  - [ ] All 5 tests pass ✅

- [ ] **Manual Testing**
  - [ ] Open http://localhost:3000
  - [ ] Upload Hebrew document with tables
  - [ ] Ask Hebrew question: "מה יש בטבלה?"
  - [ ] Verify Hebrew table formatting in response

## 🚂 Phase 3: Railway Deployment (5 minutes)

- [ ] **Deploy to Railway**
  - [ ] Go to [railway.app](https://railway.app)
  - [ ] Login with GitHub
  - [ ] "New Project" → "Deploy from GitHub repo"
  - [ ] Select your repository

- [ ] **Configure Environment**
  - [ ] Railway Dashboard → Variables tab
  - [ ] Add all variables from `.env.local`:
    - [ ] `NEXT_PUBLIC_SUPABASE_URL`
    - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - [ ] `SUPABASE_SERVICE_ROLE_KEY`
    - [ ] `GOOGLE_API_KEY`
    - [ ] `NODE_ENV=production`
    - [ ] `PORT=3000`
    - [ ] `NEXT_TELEMETRY_DISABLED=1`

- [ ] **Deploy & Monitor**
  - [ ] Railway builds automatically (3-5 minutes)
  - [ ] Check build logs for errors
  - [ ] Get your Railway URL

## 🧪 Phase 4: Production Testing (5 minutes)

- [ ] **Test Deployed App**
  - [ ] Run: `node test-apis.js --url https://your-app.railway.app`
  - [ ] All 5 tests pass ✅
  - [ ] Health endpoint responds: `https://your-app.railway.app/api/health`

- [ ] **Manual Production Testing**
  - [ ] Open your Railway URL in browser
  - [ ] Upload Hebrew document
  - [ ] Test Hebrew table queries
  - [ ] Verify responses are properly formatted

## 📊 Phase 5: Monitoring (Ongoing)

- [ ] **Railway Dashboard**
  - [ ] Monitor CPU/Memory usage
  - [ ] Check deployment logs
  - [ ] Verify no errors in logs

- [ ] **Performance Check**
  - [ ] Response times < 5 seconds
  - [ ] Memory usage < 800MB
  - [ ] No crashes or restarts

## 🎯 Success Criteria

### Local Testing:
```
✅ Health check passed
✅ Document upload successful
✅ RAG search successful  
✅ Chat successful
✅ Database cleanup endpoint accessible
```

### Production Testing:
```
✅ Railway deployment successful
✅ All APIs responding
✅ Hebrew document processing works
✅ Hebrew table formatting correct
✅ No errors in logs
```

## 🚨 Troubleshooting

### Docker Build Fails:
- [ ] Check Docker is running
- [ ] Verify `.env.local` exists and has correct values
- [ ] Try: `docker build --no-cache -t hebrew-rag-system:latest .`

### Local Container Fails:
- [ ] Check logs: `docker logs hebrew-rag-test`
- [ ] Verify port 3000 is not in use
- [ ] Check environment variables are correct

### Railway Deployment Fails:
- [ ] Check Railway build logs
- [ ] Verify all environment variables are set
- [ ] Check Dockerfile is in repository root

### API Tests Fail:
- [ ] Verify Supabase database tables are created
- [ ] Check API keys are correct and active
- [ ] Test individual endpoints manually

## 🎉 Completion

When all checkboxes are ✅, your Hebrew RAG system is:

- **Built** with Docker and tested locally
- **Deployed** on Railway with free hosting  
- **Processing** Hebrew documents with table detection
- **Responding** to Hebrew queries with proper formatting
- **Production-ready** and monitored

**Your live app**: `https://your-app.railway.app`

**Ready for users!** 🚀