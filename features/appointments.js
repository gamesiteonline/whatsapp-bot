class AppointmentsFeature {
  constructor(sock, config, db, aiRouter, contextMemory, utils) {
    this.name = 'appointments';
    this.sock = sock;
    this.config = config;
    this.db = db;
    this.aiRouter = aiRouter;
    this.contextMemory = contextMemory;
    this.utils = utils;
    this.enabled = config.features?.appointments !== false;
    this.workingHours = config.appointments?.workingHours || { start: 9, end: 18 };
    this.slotDuration = config.appointments?.slotDuration || 60;
  }

  async handle(msg, text, sender, isGroup, isOwner, reply) {
    if (!this.enabled) return false;

    const lower = text.trim().toLowerCase();

    if (lower.startsWith('!appointment book ')) {
      return this.bookAppointment(text.slice('!appointment book '.length).trim(), sender, reply);
    }

    if (lower.startsWith('!appointment cancel ')) {
      return this.cancelAppointment(text.slice('!appointment cancel '.length).trim(), sender, isOwner, reply);
    }

    if (lower.startsWith('!appointment reschedule ')) {
      return this.rescheduleAppointment(text.slice('!appointment reschedule '.length).trim(), sender, isOwner, reply);
    }

    if (lower === '!appointment list') {
      return this.listAppointments(sender, reply);
    }

    if (lower.startsWith('!appointment available ')) {
      return this.showAvailableSlots(text.slice('!appointment available '.length).trim(), reply);
    }

    if (lower.startsWith('!appointment')) {
      await reply('Commands: !appointment book [date] [time] [service], !appointment cancel [id], !appointment reschedule [id] [date] [time], !appointment list, !appointment available [date]');
      return true;
    }

    return false;
  }

  async bookAppointment(args, sender, reply) {
    const parts = args.split(/\s+/);
    if (parts.length < 3) {
      await reply('Usage: !appointment book [date] [time] [service]\nExample: !appointment book 2025-06-15 14:00 Consultation');
      return true;
    }
    const [date, time, ...serviceParts] = parts;
    const service = serviceParts.join(' ');
    const dateTimeStr = `${date} ${time}`;
    const dt = new Date(dateTimeStr);
    if (isNaN(dt.getTime())) {
      await reply('Invalid date/time format. Use YYYY-MM-DD HH:MM (24hr).');
      return true;
    }
    const hour = dt.getHours();
    if (hour < this.workingHours.start || hour >= this.workingHours.end) {
      await reply(`Appointments available between ${this.workingHours.start}:00 and ${this.workingHours.end}:00.`);
      return true;
    }

    try {
      const existing = await this.db.get(
        'SELECT * FROM appointments WHERE date_time = ? AND status != "cancelled"',
        [dateTimeStr]
      );
      if (existing) {
        await reply('That time slot is already booked. Please choose another.');
        return true;
      }

      const id = `APT-${Date.now().toString(36).toUpperCase()}`;
      await this.db.run(
        'INSERT INTO appointments (id, user_jid, date_time, service, status, created_at) VALUES (?, ?, ?, ?, "confirmed", datetime("now"))',
        [id, sender, dateTimeStr, service]
      );
      await reply(`Appointment booked! ID: ${id}\nDate: ${dateTimeStr}\nService: ${service}`);
    } catch (err) {
      await reply('Failed to book appointment. Please try again.');
    }
    return true;
  }

  async cancelAppointment(id, sender, isOwner, reply) {
    if (!id) {
      await reply('Usage: !appointment cancel [id]');
      return true;
    }
    try {
      const appt = await this.db.get('SELECT * FROM appointments WHERE id = ?', [id]);
      if (!appt) {
        await reply('Appointment not found.');
        return true;
      }
      if (appt.user_jid !== sender && !isOwner) {
        await reply('You can only cancel your own appointments.');
        return true;
      }
      await this.db.run('UPDATE appointments SET status = "cancelled" WHERE id = ?', [id]);
      await reply(`Appointment ${id} has been cancelled.`);
    } catch (err) {
      await reply('Failed to cancel appointment.');
    }
    return true;
  }

  async rescheduleAppointment(args, sender, isOwner, reply) {
    const parts = args.split(/\s+/);
    if (parts.length < 3) {
      await reply('Usage: !appointment reschedule [id] [date] [time]');
      return true;
    }
    const [id, date, time] = parts;
    const dateTimeStr = `${date} ${time}`;
    const dt = new Date(dateTimeStr);
    if (isNaN(dt.getTime())) {
      await reply('Invalid date/time. Use YYYY-MM-DD HH:MM.');
      return true;
    }
    try {
      const appt = await this.db.get('SELECT * FROM appointments WHERE id = ?', [id]);
      if (!appt) {
        await reply('Appointment not found.');
        return true;
      }
      if (appt.user_jid !== sender && !isOwner) {
        await reply('You can only reschedule your own appointments.');
        return true;
      }
      const existing = await this.db.get(
        'SELECT * FROM appointments WHERE date_time = ? AND status != "cancelled" AND id != ?',
        [dateTimeStr, id]
      );
      if (existing) {
        await reply('That time slot is already booked.');
        return true;
      }
      await this.db.run(
        'UPDATE appointments SET date_time = ?, status = "rescheduled", updated_at = datetime("now") WHERE id = ?',
        [dateTimeStr, id]
      );
      await reply(`Appointment ${id} rescheduled to ${dateTimeStr}.`);
    } catch (err) {
      await reply('Failed to reschedule appointment.');
    }
    return true;
  }

  async listAppointments(sender, reply) {
    try {
      const appts = await this.db.all(
        'SELECT * FROM appointments WHERE user_jid = ? ORDER BY date_time ASC',
        [sender]
      );
      if (!appts || appts.length === 0) {
        await reply('You have no appointments.');
        return true;
      }
      let msg = '*Your Appointments:*\n\n';
      for (const a of appts) {
        msg += `ID: ${a.id}\nDate: ${a.date_time}\nService: ${a.service}\nStatus: ${a.status}\n\n`;
      }
      await reply(msg.trim());
    } catch (err) {
      await reply('Failed to retrieve appointments.');
    }
    return true;
  }

  async showAvailableSlots(date, reply) {
    if (!date) {
      await reply('Usage: !appointment available [date]\nExample: !appointment available 2025-06-15');
      return true;
    }
    const dt = new Date(date);
    if (isNaN(dt.getTime())) {
      await reply('Invalid date. Use YYYY-MM-DD format.');
      return true;
    }
    try {
      const booked = await this.db.all(
        'SELECT date_time FROM appointments WHERE date_time LIKE ? AND status != "cancelled"',
        [`${date}%`]
      );
      const bookedTimes = new Set(booked.map(b => b.date_time));
      let msg = `*Available slots for ${date}:*\n`;
      for (let h = this.workingHours.start; h < this.workingHours.end; h++) {
        const timeStr = `${String(h).padStart(2, '0')}:00`;
        const dtStr = `${date} ${timeStr}`;
        if (!bookedTimes.has(dtStr)) {
          msg += `- ${timeStr}\n`;
        }
      }
      await reply(msg.trim());
    } catch (err) {
      await reply('Failed to check available slots.');
    }
    return true;
  }
}

module.exports = AppointmentsFeature;
