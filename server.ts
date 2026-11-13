import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { runMigrations } from './server/db.ts';
import { seedDatabase } from './server/seed.ts';
import { setupWebSocket } from './server/realtime.ts';
import authRoutes from './server/routes/auth.ts';
import publicRoutes from './server/routes/public.ts';
import customerRoutes from './server/routes/customer.ts';
import staffRoutes from './server/routes/staff.ts';
import chefRoutes from './server/routes/chef.ts';
import adminRoutes from './server/routes/admin.ts';

async function bootstrap() {
  // Initialize relational database & seed sample data
  runMigrations();
  seedDatabase();

  const app = express();
  const server = http.createServer(app);

  // Attach real-time WebSocket server to HTTP server
  setupWebSocket(server);

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // Serve uploaded files and generated menu assets reliably in both dev & production
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  const menuImagesDir = path.resolve(process.cwd(), 'src', 'assets', 'images');
  if (fs.existsSync(menuImagesDir)) {
    app.use('/menu-images', express.static(menuImagesDir));
  }

  // REST API routes
  app.use('/api/auth', authRoutes);
  app.use('/api', publicRoutes);
  app.use('/api/customer', customerRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/chef', chefRoutes);
  app.use('/api/admin', adminRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Global API error handler
  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`DineEasy full-stack server listening on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start DineEasy server:', err);
  process.exit(1);
});
