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

module.exports = async function handler(req, res) {
  const tokens = getTokensFromCookie(req);

  if (!tokens) {
    return res.json({ authenticated: false });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.REDIRECT_URI
    );
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    res.json({ authenticated: true, email: data.email, name: data.name });
  } catch {
    res.json({ authenticated: false });
  }
};
