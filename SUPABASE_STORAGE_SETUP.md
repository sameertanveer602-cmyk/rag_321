# Supabase Storage Setup Guide

## Problem
You're getting this error:
```
StorageUnknownError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

This means Supabase Storage is returning an HTML error page instead of JSON, which indicates the storage bucket isn't properly configured.

## Solution: Create Storage Bucket

### Step 1: Go to Supabase Dashboard
1. Open https://supabase.com/dashboard
2. Select your project: `pavqcqivhlpyccmwloxl`

### Step 2: Create Storage Bucket
1. Click on **Storage** in the left sidebar
2. Click **New bucket** button
3. Configure the bucket:
   - **Name**: `documents`
   - **Public bucket**: ❌ **NO** (keep it private for security)
   - **File size limit**: 100 MB
   - **Allowed MIME types**: Leave empty (allow all)
4. Click **Create bucket**

### Step 3: Set Bucket Policies
After creating the bucket, set up RLS (Row Level Security) policies:

1. Click on the `documents` bucket
2. Go to **Policies** tab
3. Click **New policy**
4. Create these policies:

#### Policy 1: Allow Service Role to Upload
```sql
CREATE POLICY "Service role can upload files"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'documents');
```

#### Policy 2: Allow Service Role to Read
```sql
CREATE POLICY "Service role can read files"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'documents');
```

#### Policy 3: Allow Service Role to Delete
```sql
CREATE POLICY "Service role can delete files"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'documents');
```

### Step 4: Verify Setup
Run this test in your Supabase SQL Editor:

```sql
-- Check if bucket exists
SELECT * FROM storage.buckets WHERE name = 'documents';

-- Check bucket policies
SELECT * FROM storage.policies WHERE bucket_id = 'documents';
```

## Alternative: Database Fallback (Already Implemented)

If you don't want to use Supabase Storage, the system now has a fallback that stores files in the database. However, this is less efficient for large files.

### Create File Storage Table (Optional)
If you want to use database fallback, create this table:

```sql
CREATE TABLE IF NOT EXISTS file_storage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content TEXT NOT NULL, -- Base64 encoded file content
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX idx_file_storage_path ON file_storage(file_path);
```

## Testing

After setup, test the upload:

1. Restart your development server:
   ```bash
   npm run dev
   ```

2. Try uploading a small PDF file

3. Check the console output:
   - ✅ Should see: "File uploaded to storage successfully"
   - ⚠️  If fallback: "File stored in database fallback"
   - ❌ If still failing: Check Supabase dashboard for errors

## Troubleshooting

### Error: "Documents bucket not found"
- **Solution**: Create the `documents` bucket in Supabase Storage

### Error: "Storage connection failed"
- **Solution**: Check your Supabase URL and service role key in `.env`

### Error: "Permission denied"
- **Solution**: Set up the RLS policies as shown above

### Error: "File too large"
- **Solution**: Increase bucket file size limit or split document

## Current Configuration

Your `.env` file has:
```
NEXT_PUBLIC_SUPABASE_URL=https://pavqcqivhlpyccmwloxl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

These are correct. You just need to create the storage bucket.

## Recommendation

**For production use**: Set up Supabase Storage properly (Steps 1-4 above)

**For quick testing**: The database fallback will work, but it's not recommended for large files or production use.
