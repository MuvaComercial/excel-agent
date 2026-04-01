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

function extractFolderId(input) {
  // Handle full Drive URL
  const urlMatch = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  // Handle direct ID
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim();
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tokens = getTokensFromCookie(req);
  if (!tokens) {
    return res.status(401).json({ error: 'Não autenticado. Faça login com Google.' });
  }

  const { folder } = req.query;
  if (!folder) {
    return res.status(400).json({ error: 'Parâmetro folder obrigatório.' });
  }

  const folderId = extractFolderId(folder);
  if (!folderId) {
    return res.status(400).json({ error: 'Link ou ID de pasta inválido.' });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.REDIRECT_URI
    );
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink)',
      orderBy: 'name',
      pageSize: 500
    });

    const files = response.data.files.map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      link: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
      isImage: file.mimeType && file.mimeType.startsWith('image/'),
      isPdf: file.mimeType === 'application/pdf'
    }));

    res.json({ files, folderId });
  } catch (error) {
    console.error('Drive API error:', error);
    if (error.code === 401 || error.status === 401) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    res.status(500).json({ error: 'Erro ao acessar o Google Drive: ' + error.message });
  }
};
