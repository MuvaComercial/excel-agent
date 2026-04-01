module.exports = async function handler(req, res) {
  res.setHeader('Set-Cookie', 'gtoken=; Path=/; HttpOnly; Max-Age=0');
  res.json({ success: true });
};
