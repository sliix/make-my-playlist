import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import router from './server/routes.js';

dotenv.config();

const app = express();
app.use(express.json());

// Mount router on both direct and netlify function paths
app.use('/api', router);
app.use('/.netlify/functions/api', router);

// Serve frontend build output when running in production environment
if (process.env.NODE_ENV === 'production' && !process.env.NETLIFY) {
  app.use(express.static(path.resolve('dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve('dist/index.html'));
  });
}

// Startup
if (process.env.NODE_ENV !== 'production' || !process.env.NETLIFY) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`MakeMyPlaylist secure backend server running on http://localhost:${PORT}`);
  });
}

export default app;
