const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

class CRMAdapter {
  constructor(config) {
    this.config = config || {};
    this.webhookUrl = config.crmWebhookUrl || null;
    this.dbPath = config.dbPath || path.resolve(process.cwd(), 'data', 'crm.db');
    this._initDB();
  }

  _initDB() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let sqlite3;
    try {
      sqlite3 = require('better-sqlite3');
    } catch (err) {
      return;
    }

    if (!this.db) {
      this.db = new sqlite3(this.dbPath);
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS leads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          phone TEXT,
          email TEXT,
          message TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subject TEXT,
          description TEXT,
          customer_name TEXT,
          customer_phone TEXT,
          priority TEXT DEFAULT 'normal',
          status TEXT DEFAULT 'open',
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }
  }

  async syncLead(leadData) {
    const logEntry = {
      name: leadData.name || null,
      phone: leadData.phone || null,
      email: leadData.email || null,
      message: leadData.message || null,
      metadata: JSON.stringify(leadData.metadata || {}),
      timestamp: new Date().toISOString(),
    };

    if (this.db) {
      try {
        const stmt = this.db.prepare(
          'INSERT INTO leads (name, phone, email, message, metadata) VALUES (?, ?, ?, ?, ?)'
        );
        stmt.run(logEntry.name, logEntry.phone, logEntry.email, logEntry.message, logEntry.metadata);
      } catch (err) {
        console.error('Failed to save lead to DB:', err.message);
      }
    }

    if (this.webhookUrl) {
      await this._postWebhook({ type: 'lead', data: logEntry });
    }

    return { success: true, id: logEntry.timestamp };
  }

  async syncTicket(ticketData) {
    const logEntry = {
      subject: ticketData.subject || 'No subject',
      description: ticketData.description || '',
      customer_name: ticketData.customerName || ticketData.customer_name || null,
      customer_phone: ticketData.customerPhone || ticketData.customer_phone || null,
      priority: ticketData.priority || 'normal',
      status: 'open',
      metadata: JSON.stringify(ticketData.metadata || {}),
      timestamp: new Date().toISOString(),
    };

    if (this.db) {
      try {
        const stmt = this.db.prepare(
          'INSERT INTO tickets (subject, description, customer_name, customer_phone, priority, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        stmt.run(
          logEntry.subject,
          logEntry.description,
          logEntry.customer_name,
          logEntry.customer_phone,
          logEntry.priority,
          logEntry.status,
          logEntry.metadata
        );
      } catch (err) {
        console.error('Failed to save ticket to DB:', err.message);
      }
    }

    if (this.webhookUrl) {
      await this._postWebhook({ type: 'ticket', data: logEntry });
    }

    return { success: true, id: logEntry.timestamp };
  }

  _postWebhook(payload) {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(this.webhookUrl);
        const postData = JSON.stringify(payload);
        const client = url.protocol === 'https:' ? https : http;

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 10000,
        };

        const req = client.request(options, (res) => {
          resolve({ statusCode: res.statusCode });
        });

        req.on('error', (err) => {
          console.error('Webhook post failed:', err.message);
          resolve({ error: err.message });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ error: 'Timeout' });
        });

        req.write(postData);
        req.end();
      } catch (err) {
        resolve({ error: err.message });
      }
    });
  }
}

module.exports = CRMAdapter;
