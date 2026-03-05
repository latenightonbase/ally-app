/**
 * Authentication middleware — placeholder for JWT validation.
 * The mobile team will implement real JWT verification here.
 */
function authenticate(req, res, next) {
  // TODO: Replace with real JWT validation from mobile team's auth system
  // Expected flow:
  //   1. Mobile app sends JWT in Authorization: Bearer <token>
  //   2. Validate token against your auth provider (Firebase Auth, Auth0, etc.)
  //   3. Extract userId from decoded token
  //   4. Attach to req.userId

  const userId = req.headers['x-user-id'] || req.body?.userId || req.params?.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Missing user identification' });
  }

  req.userId = userId;
  next();
}

module.exports = { authenticate };
