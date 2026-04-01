const { google } = require('googleapis');

function getTokensFromCookie(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/gtoken=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const TEMPLATE_SHEET_ID = process.env.TEMPLATE_SHEET_ID || '1xwI9JZTHTmICJn9se31rYuO259ojLjoV';

// Column indexes (0-based)
const COL = {
  NUM: 0,        // A: #
  CODIGO_IMG: 1, // B: Codigo Img
  LINK_IMG: 2,   // C: Link Img
  PROPRIETARIO: 3, // D: Proprietário
  SERVICO: 4,    // E: Serviço
  CODIGO_COR: 5, // F: Codigo Cor
  LINK_COR: 6,   // G: Link Cor
  PECA_UP: 7,    // H: Peça UP
  PECA_DOWN: 8,  // I: Peça Down
  STATUS: 9,     // J: Status
  DATA: 10       // K: Data
};

const PECA_UP_OPTIONS = ['top', 'camiseta', 'camisa', 'blusa', 'casaco', 'Original'];
const PECA_DOWN_OPTIONS = ['calça', 'shorts', 'saia', 'bermuda', 'conjunto inferior', 'Original'];

// Data rows start at row index 7 (row 8 in spreadsheet)
const DATA_START_ROW = 7;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const tokens = getTokensFromCookie(req);
  if (!tokens) {
    return res.status(401).json({ error: 'Não autenticado. Faça login com Google.' });
  }

  const { title, rows } = req.body;
  if (!title || !rows || !rows.length) {
    return res.status(400).json({ error: 'Título e linhas são obrigatórios.' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.REDIRECT_URI
    );
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // 1. Copy the template spreadsheet
    const copyResponse = await drive.files.copy({
      fileId: TEMPLATE_SHEET_ID,
      requestBody: {
        name: title
      }
    });

    const newSheetId = copyResponse.data.id;
    const newSheetUrl = `https://docs.google.com/spreadsheets/d/${newSheetId}/edit`;

    // 2. Get sheet info to find the first sheet's sheetId
    const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: newSheetId });
    const firstSheet = sheetInfo.data.sheets[0];
    const gridSheetId = firstSheet.properties.sheetId;
    const sheetName = firstSheet.properties.title;

    // 3. Update title row (row 1, merged header)
    await sheets.spreadsheets.values.update({
      spreadsheetId: newSheetId,
      range: `${sheetName}!B1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[`🎨 ${title}`]]
      }
    });

    // 4. Prepare data rows
    // Clear existing sample rows first (rows 8-13 in template = index 7-12)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: newSheetId,
      range: `${sheetName}!A8:K100`
    });

    // Build values array
    const rowValues = rows.map((row, i) => {
      const rowArr = Array(11).fill('');
      rowArr[COL.NUM] = i + 1;
      rowArr[COL.CODIGO_IMG] = row.codigoImg || '';
      rowArr[COL.LINK_IMG] = row.linkImg ? `=HYPERLINK("${row.linkImg}","${row.codigoImg || 'Ver imagem'}")` : '';
      rowArr[COL.CODIGO_COR] = ''; // to be filled later
      rowArr[COL.LINK_COR] = '';   // to be filled later
      rowArr[COL.PECA_UP] = row.pecaUp || '';
      rowArr[COL.PECA_DOWN] = row.pecaDown || '';
      rowArr[COL.STATUS] = 'To Do';
      return rowArr;
    });

    // 5. Write data rows
    if (rowValues.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: newSheetId,
        range: `${sheetName}!A8`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: rowValues
        }
      });
    }

    // 6. Add dropdown validation for Peça UP (col H = index 7) and Peça Down (col I = index 8)
    const numRows = rows.length;
    const requests = [
      // Peça UP dropdown
      {
        setDataValidation: {
          range: {
            sheetId: gridSheetId,
            startRowIndex: DATA_START_ROW,
            endRowIndex: DATA_START_ROW + numRows,
            startColumnIndex: COL.PECA_UP,
            endColumnIndex: COL.PECA_UP + 1
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: PECA_UP_OPTIONS.map(v => ({ userEnteredValue: v }))
            },
            showCustomUi: true,
            strict: false
          }
        }
      },
      // Peça Down dropdown
      {
        setDataValidation: {
          range: {
            sheetId: gridSheetId,
            startRowIndex: DATA_START_ROW,
            endRowIndex: DATA_START_ROW + numRows,
            startColumnIndex: COL.PECA_DOWN,
            endColumnIndex: COL.PECA_DOWN + 1
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: PECA_DOWN_OPTIONS.map(v => ({ userEnteredValue: v }))
            },
            showCustomUi: true,
            strict: false
          }
        }
      },
      // Status dropdown
      {
        setDataValidation: {
          range: {
            sheetId: gridSheetId,
            startRowIndex: DATA_START_ROW,
            endRowIndex: DATA_START_ROW + numRows,
            startColumnIndex: COL.STATUS,
            endColumnIndex: COL.STATUS + 1
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'To Do' },
                { userEnteredValue: 'Em Progresso' },
                { userEnteredValue: 'Concluído' },
                { userEnteredValue: 'Revisão' }
              ]
            },
            showCustomUi: true,
            strict: false
          }
        }
      }
    ];

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: newSheetId,
      requestBody: { requests }
    });

    // 7. Update total images count (row 4, cell B4 area)
    await sheets.spreadsheets.values.update({
      spreadsheetId: newSheetId,
      range: `${sheetName}!B4`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[`Total Imagens: ${rows.length}`]] }
    });

    res.json({
      success: true,
      sheetId: newSheetId,
      sheetUrl: newSheetUrl,
      rowsCreated: rows.length
    });

  } catch (error) {
    console.error('Sheets API error:', error);
    if (error.code === 401 || error.status === 401) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    res.status(500).json({ error: 'Erro ao criar planilha: ' + error.message });
  }
};
