const { google } = require('googleapis');

const COLOR_CATALOG_SHEET_ID = '1mMB7Nf5eNzWDSeh3vWk1bkz1PsxyhpbEH5n65bijq-E';

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tokens = getTokensFromCookie(req);
  if (!tokens) {
    return res.status(401).json({ error: 'Não autenticado. Faça login com Google.' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.REDIRECT_URI
    );
    oauth2Client.setCredentials(tokens);

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // Read all data rows — skip header row 1, read from row 2
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: COLOR_CATALOG_SHEET_ID,
      range: 'A2:F200'
    });

    const rows = response.data.values || [];

    const colors = rows
      .filter(row => row[0]) // must have # index
      .map(row => ({
        num: row[0] || '',
        thumbImg: row[1] || '',
        linkCor: row[2] || '',
        codCor: row[3] || '',
        nomeOriginal: row[4] || '',
        referencia: row[5] || ''
      }));

    res.json({ colors, total: colors.length });
  } catch (error) {
    console.error('Sheets API error:', error);
    if (error.code === 401 || error.status === 401) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    res.status(500).json({ error: 'Erro ao acessar Color Catalog: ' + error.message });
  }
};
