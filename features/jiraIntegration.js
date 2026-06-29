class JiraIntegration {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'jiraIntegration';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.jiraIntegration !== false;
    this.apiConfig = {
      baseUrl: config.jiraBaseUrl || null,
      email: config.jiraEmail || null,
      token: config.jiraToken || null,
    };

    if (this.db) {
      try {
        this.db.prepare('CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, project TEXT, title TEXT, description TEXT, status TEXT DEFAULT "open", assignee TEXT, created_at TEXT, updated_at TEXT)').run();
      } catch {}
    }
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.toLowerCase().trim();
    if (!lower.startsWith('!task')) return false;

    const parts = text.slice(6).trim().split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'create':
        return this._createTask(text.slice(13).trim(), sender, reply);
      case 'list':
        return this._listTasks(parts.slice(1).join(' '), sender, reply);
      case 'update':
        return this._updateTask(parts[1], parts.slice(2).join(' '), sender, reply);
      case 'assign':
        return this._assignTask(parts[1], parts.slice(2).join(' '), sender, reply);
      default:
        return reply('Commands: create, list, update, assign');
    }
  }

  async _createTask(input, sender, reply) {
    const match = input.match(/^(\S+)\s+(.+?)\|(.+)$/s);
    if (!match) return reply('Usage: !task create [project] [title]|[description]');

    const [, project, title, description] = match;

    if (this.apiConfig.baseUrl && this.apiConfig.token) {
      try {
        const axios = require('axios');
        const auth = Buffer.from(`${this.apiConfig.email}:${this.apiConfig.token}`).toString('base64');

        const res = await axios.post(`${this.apiConfig.baseUrl}/rest/api/3/issue`, {
          fields: {
            project: { key: project.toUpperCase() },
            summary: title.trim(),
            description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: description.trim() }] }] },
            issuetype: { name: 'Task' },
          },
        }, {
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
          timeout: 10000,
        });

        return reply(`✅ Jira task created: ${res.data.key}\n${this.apiConfig.baseUrl}/browse/${res.data.key}`);
      } catch (err) {
        return reply(`Jira API error: ${err.message}. Falling back to local storage.`);
      }
    }

    const result = this.db.prepare('INSERT INTO tasks (user, project, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, "open", ?, ?)')
      .run(sender, project.toUpperCase(), title.trim(), description.trim(), new Date().toISOString(), new Date().toISOString());

    return reply(`✅ Task #${result.lastInsertRowid} created in project ${project.toUpperCase()}\nTitle: ${title.trim()}\nDescription: ${description.trim()}\n\n(Stored locally - configure Jira API for cloud sync)`);
  }

  async _listTasks(project, sender, reply) {
    const tasks = project
      ? this.db.prepare('SELECT * FROM tasks WHERE (project = ? OR user = ?) ORDER BY created_at DESC').all(project.toUpperCase(), sender)
      : this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();

    if (!tasks.length) return reply('No tasks found.');

    const lines = tasks.map(t =>
      `#${t.id} [${t.project}] ${t.title} - ${t.status}${t.assignee ? ` (→ ${t.assignee})` : ''}`
    );

    return reply(`*Tasks${project ? ` for ${project.toUpperCase()}` : ''}:*\n\n${lines.join('\n')}`);
  }

  async _updateTask(id, status, sender, reply) {
    if (!id || !status) return reply('Usage: !task update [id] [status]');

    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) return reply(`Task #${id} not found.`);

    const validStatuses = ['open', 'in_progress', 'done', 'closed', 'cancelled'];
    const newStatus = status.toLowerCase();
    if (!validStatuses.includes(newStatus)) return reply(`Invalid status. Valid: ${validStatuses.join(', ')}`);

    this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run(newStatus, new Date().toISOString(), id);

    return reply(`✅ Task #${id} updated to "${newStatus}".`);
  }

  async _assignTask(id, assignee, sender, reply) {
    if (!id || !assignee) return reply('Usage: !task assign [id] [assignee]');

    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) return reply(`Task #${id} not found.`);

    this.db.prepare('UPDATE tasks SET assignee = ?, updated_at = ? WHERE id = ?')
      .run(assignee.trim(), new Date().toISOString(), id);

    return reply(`✅ Task #${id} assigned to ${assignee.trim()}.`);
  }
}

module.exports = JiraIntegration;
