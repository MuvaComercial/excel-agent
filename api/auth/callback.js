const { google } = require('googleapis');

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );
}

module.exports = async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code missing' });
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    // Store tokens in a cookie (simplified - in production use encrypted session)
    const tokenJson = JSON.stringify(tokens);
    const encoded = Buffer.from(tokenJson).toString('base64');

    res.setHeader('Set-Cookie', `gtoken=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`);
    res.redirect('/?auth=success');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/?auth=error');
  }
};
