import { settings } from '../src/config/settings.js';

export default async function handler(req, res) {
  const cfHandle = settings.CF_HANDLE || 'Not Configured';
  const timezone = settings.TIMEZONE || 'Asia/Kolkata';
  const retention = settings.MISSED_RETENTION_DAYS || 3;
  const deleteUnattempted = settings.DELETE_UNATTEMPTED ? 'Enabled' : 'Disabled';
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CF Contest Sync Agent</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070712;
      --card-bg: rgba(18, 18, 38, 0.45);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent: #8b5cf6;
      --accent-hover: #a78bfa;
      --accent-glow: rgba(139, 92, 246, 0.25);
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.3);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(139, 92, 246, 0.1) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.08) 0px, transparent 50%);
      background-attachment: fixed;
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 24px;
      overflow-x: hidden;
    }

    .container {
      width: 100%;
      max-width: 680px;
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 40px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5), 
                  0 0 80px rgba(139, 92, 246, 0.05);
      position: relative;
    }

    .container::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, var(--accent), #3b82f6);
      border-radius: 24px 24px 0 0;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 36px;
    }

    .logo-section {
      display: flex;
      flex-direction: column;
    }

    h1 {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #ffffff 60%, #c084fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      font-size: 14px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 100px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      color: var(--success);
      box-shadow: 0 0 12px var(--success-glow);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      background-color: var(--success);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      }
      70% {
        transform: scale(1);
        box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
      }
      100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
      }
    }

    .grid-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 36px;
    }

    @media (max-width: 540px) {
      .grid-info {
        grid-template-columns: 1fr;
      }
    }

    .card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 20px;
      transition: all 0.3s ease;
    }

    .card:hover {
      border-color: rgba(139, 92, 246, 0.3);
      background: rgba(255, 255, 255, 0.04);
      transform: translateY(-2px);
    }

    .card-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .card-value {
      font-size: 18px;
      font-weight: 600;
      color: var(--text);
    }

    .card-value.highlight {
      color: #a78bfa;
    }

    .details-list {
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 36px;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 14px;
    }

    .detail-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .detail-row:first-child {
      padding-top: 0;
    }

    .detail-label {
      color: var(--text-muted);
    }

    .detail-val {
      font-weight: 500;
    }

    .actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .btn {
      width: 100%;
      background: linear-gradient(135deg, var(--accent), #4f46e5);
      border: none;
      border-radius: 14px;
      color: white;
      padding: 16px 24px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.25s ease;
      box-shadow: 0 4px 16px var(--accent-glow);
      text-align: center;
      text-decoration: none;
    }

    .btn:hover {
      background: linear-gradient(135deg, var(--accent-hover), #6366f1);
      box-shadow: 0 6px 24px rgba(139, 92, 246, 0.4);
      transform: translateY(-1px);
    }

    .btn:active {
      transform: translateY(1px);
    }

    .action-tip {
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
    }

    .action-tip a {
      color: #a78bfa;
      text-decoration: none;
    }

    .action-tip a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-section">
        <h1>CP Contest Agent</h1>
        <div class="subtitle">Autonomous Tasks & Alarms Sync</div>
      </div>
      <div class="status-badge">
        <div class="status-dot"></div>
        <span>ACTIVE</span>
      </div>
    </header>

    <div class="grid-info">
      <div class="card">
        <div class="card-title">Codeforces Handle</div>
        <div class="card-value highlight">${cfHandle}</div>
      </div>
      <div class="card">
        <div class="card-title">Active Timezone</div>
        <div class="card-value">${timezone}</div>
      </div>
    </div>

    <div class="details-list">
      <div class="detail-row">
        <span class="detail-label">Google Tasks Integration</span>
        <span class="detail-val" style="color: var(--success);">Connected</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Google Calendar Alarms</span>
        <span class="detail-val" style="color: var(--success);">Enabled</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Retention Policy</span>
        <span class="detail-val">Delete Missed Tasks</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Retention Threshold</span>
        <span class="detail-val">${retention} Days</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Deployment Environment</span>
        <span class="detail-val" style="color: #60a5fa;">Vercel Serverless</span>
      </div>
    </div>

    <div class="actions">
      <a href="/api/sync" class="btn">Trigger Manual Synchronization</a>
      <div class="action-tip">
        Synchronization is automated. You can also view raw endpoints: <a href="/api/sync">/api/sync</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}
