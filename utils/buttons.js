function createListMessage(sections, title, text, buttonText) {
  return {
    title: title || 'Options',
    text: text || 'Please select an option:',
    footer: '',
    buttonText: buttonText || 'View Options',
    sections,
  };
}

function createButtonMessage(buttons, text) {
  return {
    text: text || 'Please choose:',
    buttons: buttons.map((btn, index) => ({
      buttonId: btn.id || `btn_${index}`,
      buttonText: { displayText: btn.text || btn.title || `Option ${index + 1}` },
      type: 1,
    })),
  };
}

function createSection(title, rows) {
  return {
    title: title || '',
    rows: rows.map((row) => ({
      title: row.title || '',
      rowId: row.id || '',
      description: row.description || '',
    })),
  };
}

function createRow(id, title, description) {
  return {
    id: id || '',
      title: title || '',
    description: description || '',
  };
}

module.exports = {
  createListMessage,
  createButtonMessage,
  createSection,
  createRow,
};
