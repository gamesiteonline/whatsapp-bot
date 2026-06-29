const PDFDocument = require('pdfkit');

class PDFGenerator {
  constructor(config) {
    this.config = config || {};
    this.brandName = config.brandName || 'WhatsApp Bot';
    this.brandColor = config.brandColor || '#2563eb';
  }

  async generateInvoice(data) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.fontSize(24).font('Helvetica-Bold').fillColor(this.brandColor)
          .text('INVOICE', { align: 'center' });
        doc.moveDown(0.5);

        doc.fontSize(10).font('Helvetica').fillColor('#666')
          .text(`Invoice #: ${data.invoiceNumber || 'N/A'}`, { align: 'center' })
          .text(`Date: ${data.date || new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(1);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
        doc.moveDown(1);

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000')
          .text('Bill To:', { continued: false });
        doc.fontSize(10).font('Helvetica').fillColor('#333')
          .text(data.customerName || 'N/A')
          .text(data.customerEmail || '')
          .text(data.customerAddress || '');
        doc.moveDown(1);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
        doc.moveDown(1);

        const tableTop = doc.y;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000');

        doc.text('Item', 50, tableTop, { width: 250 });
        doc.text('Qty', 300, tableTop, { width: 50, align: 'center' });
        doc.text('Price', 380, tableTop, { width: 80, align: 'right' });
        doc.text('Total', 480, tableTop, { width: 80, align: 'right' });
        doc.moveDown(0.5);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
        doc.moveDown(0.5);

        doc.font('Helvetica').fillColor('#333');
        let yPos = doc.y;
        const items = data.items || [];

        for (const item of items) {
          doc.text(item.name || item.description || 'Item', 50, yPos, { width: 250 });
          doc.text(String(item.quantity || 1), 300, yPos, { width: 50, align: 'center' });
          doc.text(`$${(item.price || 0).toFixed(2)}`, 380, yPos, { width: 80, align: 'right' });
          doc.text(`$${((item.quantity || 1) * (item.price || 0)).toFixed(2)}`, 480, yPos, { width: 80, align: 'right' });
          yPos += 20;
        }

        doc.y = yPos;
        doc.moveDown(1);

        doc.moveTo(380, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
        doc.moveDown(0.5);

        const subtotal = items.reduce((s, i) => s + (i.quantity || 1) * (i.price || 0), 0);
        const tax = data.tax || 0;
        const total = subtotal + tax;

        doc.fontSize(10).font('Helvetica');
        doc.text('Subtotal:', 380, doc.y, { width: 80, align: 'right' });
        doc.text(`$${subtotal.toFixed(2)}`, 480, doc.y - 12, { width: 80, align: 'right' });
        doc.moveDown(0.5);

        if (tax > 0) {
          doc.text('Tax:', 380, doc.y, { width: 80, align: 'right' });
          doc.text(`$${tax.toFixed(2)}`, 480, doc.y - 12, { width: 80, align: 'right' });
          doc.moveDown(0.5);
        }

        doc.moveTo(380, doc.y).lineTo(545, doc.y).strokeColor('#000').stroke();
        doc.moveDown(0.5);

        doc.fontSize(12).font('Helvetica-Bold').fillColor(this.brandColor);
        doc.text('Total:', 380, doc.y, { width: 80, align: 'right' });
        doc.text(`$${total.toFixed(2)}`, 480, doc.y - 15, { width: 80, align: 'right' });

        doc.moveDown(3);

        doc.fontSize(9).font('Helvetica').fillColor('#999')
          .text('Thank you for your business!', { align: 'center' });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  async generateReport(title, sections) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.fontSize(22).font('Helvetica-Bold').fillColor(this.brandColor)
          .text(title, { align: 'center' });
        doc.moveDown(1);

        doc.fontSize(10).font('Helvetica').fillColor('#666')
          .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown(1);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
        doc.moveDown(1);

        for (const section of sections || []) {
          doc.fontSize(16).font('Helvetica-Bold').fillColor('#000')
            .text(section.heading || 'Section', { underline: false });
          doc.moveDown(0.5);

          doc.fontSize(10).font('Helvetica').fillColor('#333');

          const body = section.body || '';
          const lines = body.split('\n');
          for (const line of lines) {
            doc.text(line, { indent: 10 });
          }

          if (section.items && Array.isArray(section.items)) {
            for (const item of section.items) {
              doc.text(`- ${item}`, { indent: 20 });
            }
          }

          doc.moveDown(1);
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  async generateTicket(ticketData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        doc.rect(50, 50, 495, 20).fill(this.brandColor);
        doc.fillColor('#fff').fontSize(12).font('Helvetica-Bold')
          .text('SUPPORT TICKET', 55, 54, { align: 'center' });

        doc.fillColor('#000');
        doc.moveDown(3);

        doc.fontSize(16).font('Helvetica-Bold')
          .text(`Ticket: ${ticketData.ticketNumber || ticketData.id || 'N/A'}`);
        doc.moveDown(0.5);

        doc.fontSize(10).font('Helvetica').fillColor('#666')
          .text(`Status: ${ticketData.status || 'Open'}`)
          .text(`Priority: ${ticketData.priority || 'Normal'}`)
          .text(`Date: ${ticketData.date || new Date().toLocaleDateString()}`);
        doc.moveDown(1);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
        doc.moveDown(1);

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000')
          .text('Customer Information');
        doc.moveDown(0.5);

        doc.fontSize(10).font('Helvetica').fillColor('#333')
          .text(`Name: ${ticketData.customerName || ticketData.customer_name || 'N/A'}`)
          .text(`Phone: ${ticketData.customerPhone || ticketData.customer_phone || 'N/A'}`)
          .text(`Email: ${ticketData.email || 'N/A'}`);
        doc.moveDown(1);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
        doc.moveDown(1);

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000')
          .text('Subject');
        doc.moveDown(0.5);

        doc.fontSize(10).font('Helvetica').fillColor('#333')
          .text(ticketData.subject || 'No subject');
        doc.moveDown(1);

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000')
          .text('Description');
        doc.moveDown(0.5);

        doc.fontSize(10).font('Helvetica').fillColor('#333')
          .text(ticketData.description || 'No description', {
            align: 'left',
            lineGap: 4,
          });

        doc.moveDown(3);

        doc.fontSize(9).font('Helvetica').fillColor('#999')
          .text(`Ticket generated by ${this.brandName}`, { align: 'center' });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = PDFGenerator;
