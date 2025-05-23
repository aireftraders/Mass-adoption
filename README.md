# Deployment Checklist

## 1. Install Node.js dependencies
Run this in your project root:
```
npm install
```

## 2. Environment Variables
Set these in your Vercel dashboard:
- `PAYSTACK_SECRET_KEY` (your Paystack secret key)
- `MONGODB_URI` (if you use MongoDB for persistent storage)

## 3. (Optional) Database Setup

If you want persistent storage, set up a managed database (e.g., **MongoDB Atlas**) and update your backend code to use it.

### a. Create a MongoDB Atlas Cluster
- Go to [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and create a free cluster.
- Create a database user and get your connection string (e.g., `mongodb+srv://<user>:<password>@cluster0.mongodb.net/<dbname>?retryWrites=true&w=majority`).

### b. Set Environment Variable
- In your Vercel dashboard, set:
  - `MONGODB_URI` = your MongoDB Atlas connection string

### c. Install MongoDB Node.js Driver
```
npm install mongodb
```

### d. Example Usage in `api/index.js`
```js
// ...existing code...
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function getDb() {
  if (!db) {
    await client.connect();
    db = client.db(); // default DB from URI
  }
  return db;
}

// Example: Insert application
app.post('/api/application', async (req, res) => {
  const { phone, ...formData } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  const db = await getDb();
  await db.collection('applications').updateOne(
    { phone },
    { $set: { ...formData, phone, updatedAt: new Date() } },
    { upsert: true }
  );
  res.json({ success: true });
});

// Example: Read application
app.get('/api/application', async (req, res) => {
  const { phone } = req.query;
  const db = await getDb();
  const app = await db.collection('applications').findOne({ phone });
  res.json(app || {});
});
```

### e. Update All Backend Logic
- Replace all in-memory storage with MongoDB queries for applications, shares, and payments.

**See [MongoDB Node.js docs](https://mongodb.github.io/node-mongodb-native/) for more.**

## 4. Paystack Webhook
- Set your Paystack dashboard webhook URL to:  
  `https://<your-vercel-domain>/api/paystack-webhook`

## 5. Deploy to Vercel
Push your code to your GitHub/GitLab/Bitbucket repo and connect it to Vercel, or use the Vercel CLI:
```
vercel --prod
```

## 6. No other installations required
Vercel will install dependencies from `package.json` automatically during deployment.

## 7. Using Supabase for Data Storage

### a. Create a Supabase Project
- Go to [https://supabase.com/](https://supabase.com/) and create a new project.
- Note your Supabase project URL and service role key (for backend use).

### b. Create Tables

You can use the Supabase dashboard SQL editor or run these SQL commands:

#### Applications Table
```sql
create table applications (
  id uuid primary key default uuid_generate_v4(),
  phone varchar not null unique,
  data jsonb,
  created_at timestamp with time zone default now()
);
```

#### Shares Table
```sql
create table shares (
  id uuid primary key default uuid_generate_v4(),
  phone varchar not null,
  friends int default 0,
  groups int default 0,
  updated_at timestamp with time zone default now(),
  unique(phone)
);
```

#### Payments Table
```sql
create table payments (
  id uuid primary key default uuid_generate_v4(),
  phone varchar not null,
  reference varchar,
  status varchar,
  upgrade boolean default false,
  created_at timestamp with time zone default now(),
  unique(phone, reference)
);
```

### c. Connect Backend to Supabase

1. Install the Supabase JS client:
   ```
   npm install @supabase/supabase-js
   ```

2. In your backend (`api/index.js`), initialize Supabase:
   ```js
   // ...existing code...
   const { createClient } = require('@supabase/supabase-js');
   const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
   // ...use supabase.from('applications') etc. for DB operations...
   ```

3. Set these environment variables in Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

### d. Update Backend Logic

- Replace in-memory storage with Supabase queries for all CRUD operations.
- Example: To insert an application:
  ```js
  await supabase.from('applications').upsert({ phone, data: formData });
  ```

- Example: To update shares:
  ```js
  await supabase.from('shares').upsert({ phone, friends, groups });
  ```

- Example: To record/verify payments:
  ```js
  await supabase.from('payments').upsert({ phone, reference, status, upgrade });
  ```

**See [Supabase JS docs](https://supabase.com/docs/reference/javascript) for more.**

## 8. Additional Installations

- **For MongoDB:**  
  You already have `mongodb` in your `package.json`.  
  Run:
  ```
  npm install
  ```
  to ensure all dependencies are installed.

- **For Paystack:**  
  No extra installation is needed; you use the Paystack inline JS script in your HTML.

- **For Supabase (if you use it):**  
  ```
  npm install @supabase/supabase-js
  ```

- **For local development:**  
  You may want to install [Vercel CLI](https://vercel.com/download) for local testing:
  ```
  npm install -g vercel
  ```

**Summary:**  
If you have run `npm install` and set up your environment variables, you do not need any other installation for deployment on Vercel.

## Is index.html now connected to the backend?

**Yes, your `index.html` is now connected to the backend.**

- All frontend actions (application submission, WhatsApp share tracking, payment verification, eligibility checks) are performed via API calls to your backend endpoints (e.g., `/api/application`, `/api/share`, `/api/verify-payment`, `/api/eligibility`).
- The backend is now using MongoDB (or Supabase, if you switch) for persistent storage, so all user data, shares, and payments are stored and retrieved from your database.
- The frontend uses `fetch` to communicate with these endpoints, so all user actions are processed and validated server-side.

**You do not need to change the frontend further for backend connectivity, unless you change your API endpoints or data structure.**

## 9. Environment Variables: .env file

For **local development**, you can create a `.env` file in your project root (not required for Vercel deployment, but useful locally):

```
# .env
PAYSTACK_SECRET_KEY=your_paystack_secret_key
MONGODB_URI=your_mongodb_atlas_connection_string
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

- Vercel uses its dashboard for environment variables in production, but `.env` is helpful for local testing.
- **Do not commit your `.env` file to version control.** Add `.env` to your `.gitignore`.

## 10. Deploy to Vercel

**Yes, you can now push your code and deploy to Vercel.**

- Make sure you have committed all your changes.
- Push your code to your connected GitHub/GitLab/Bitbucket repository.
- Vercel will automatically build and deploy your project.
- Ensure all required environment variables are set in the Vercel dashboard for production.

You can also deploy using the Vercel CLI:
```
vercel --prod
```

**After deployment, your frontend and backend will be live and connected.**

Thanks for using this deployment checklist! 🚀
