const { google } = require('googleapis');

const TEMPLATE_SHEET_ID = process.env.TEMPLATE_SHEET_ID || '1xwI9JZTHTmICJn9se31rYuO259ojLjoV';

const COL = {
  NUM: 0,         // A: #
  CODIGO_IMG: 1,  // B: Codigo Img
  LINK_IMG: 2,    // C: Link Img
  PROPRIETARIO: 3,// D: Proprietário
  SERVICO: 4,     // E: Serviço
  CODIGO_COR: 5,  // F: Codigo Cor
  LINK_COR: 6,    // G: Link Cor
  PECA_UP: 7,     // H: Peça UP
  PECA_DOWN: 8,   // I: Peça Down
  STATUS: 9,      // J: Status
  DATA: 10        // K: Data
};

const PECA_UP_OPTIONS    = ['top', 'camiseta', 'camisa', 'blusa', 'casaco', 'Original'];
const PECA_DOWN_OPTIONS  = ['calça', 'shorts', 'saia', 'bermuda', 'conjunto inferior', 'Original'];
const STATUS_OPTIONS     = ['To Do', 'Em Progresso', 'Concluído', 'Revisão'];
const DATA_START_ROW     = 7; // row 8 in spreadsheet

function getAuth() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY não configurada.');
  const credentials = JSON.parse(key);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive'
    ]
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, files } = req.body;
  if (!title || !files || !files.length) {
    return res.status(400).json({ error: 'title e files são obrigatórios.' });
  }

  try {
    const auth  = getAuth();
    const drive  = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Copia template
    const copy = await drive.files.copy({
      fileId: TEMPLATE_SHEET_ID,
      requestBody: { name: title }
    });
    const sheetId  = copy.data.id;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

    // 2. Info da aba
    const info       = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const firstSheet = info.data.sheets[0];
    const gridId     = firstSheet.properties.sheetId;
    const tabName    = firstSheet.properties.title;

    // 3. Título no header
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tabName}!B1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[`🎨 ${title}`]] }
    });

    // 4. Limpa linhas de exemplo
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${tabName}!A8:K100`
    });

    // 5. Monta e escreve as linhas
    const rowValues = files.map((file, i) => {
      const row = Array(11).fill('');
      row[COL.NUM]        = i + 1;
      row[COL.CODIGO_IMG] = file.name;
      row[COL.STATUS]     = 'To Do';
      return row;
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tabName}!A8`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rowValues }
    });

    // 6. Dropdowns
    const n = files.length;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [
          makeDropdown(gridId, DATA_START_ROW, n, COL.PECA_UP,   PECA_UP_OPTIONS),
          makeDropdown(gridId, DATA_START_ROW, n, COL.PECA_DOWN,  PECA_DOWN_OPTIONS),
          makeDropdown(gridId, DATA_START_ROW, n, COL.STATUS,     STATUS_OPTIONS)
        ]
      }
    });

    // 7. Contagem no header
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tabName}!B4`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[`Total Imagens: ${files.length}`]] }
    });

    res.json({ success: true, sheetId, sheetUrl, total: files.length });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

function makeDropdown(sheetId, startRow, numRows, col, options) {
  return {
    setDataValidation: {
      range: {
        sheetId,
        startRowIndex: startRow,
        endRowIndex:   startRow + numRows,
        startColumnIndex: col,
        endColumnIndex:   col + 1
      },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: options.map(v => ({ userEnteredValue: v }))
        },
        showCustomUi: true,
        strict: false
      }
    }
  };
}
