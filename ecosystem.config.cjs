/**
 * BSC Textiles HRMS — Production Process Manager Configuration (PM2)
 * Designed for Hostinger KVM VPS / Ubuntu 22.04+ Deployment
 * 
 * Manages:
 * 1. bsc-backend: Node.js Express Core API + Socket.IO (:4000)
 * 2. bsc-worker: Biometric Device Supervised Worker (Heartbeats, Timeouts, Ingest Queue)
 * 3. bsc-frontend: Next.js Production Web Server (:3000)
 */

module.exports = {
  apps: [
    {
      name: 'bsc-backend',
      cwd: './backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1024M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        DEVICE_SYNC_MODE: 'cloud_push',
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'bsc-worker',
      cwd: './backend',
      script: 'dist/workers/superviseWorker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        DEVICE_SYNC_MODE: 'cloud_push',
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'bsc-frontend',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1024M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
