import * as express from 'express';
import * as rp from 'request-promise-native';

const router = express.Router();

/* POST user access token */
router.post('/token', async (req: any, res, next) => {
  try {
    const token = await rp.post('https://api.honeywell.com/oauth2/token', {
      auth: {
        user: req.body.consumerKey,
        pass: req.body.consumerSecret,
      },
      form: {
        grant_type: 'authorization_code',
        code: req.body.code,
        redirect_uri: req.body.redirect_uri,
      },
      json: true,
    });
    return res.json(token);
  } catch (e) {
    return res.sendStatus(500);
  }
});

/* POST refresh user access token */
router.post('/refresh', async (req: any, res, next) => {
  if (!req.body.refresh_token) {
    return res.status(400).json({ message: 'refresh_token missing' });
  }
  if (!req.body.consumerKey) {
    return res.status(400).json({ message: 'consumerKey missing' });
  }
  if (req.body.consumerKey !== process.env.HONEYWELL_OAUTH_KEY) {
    return res.status(401).json({ message: 'consumerKey is not correct'});
  }
  try {
    const token = await rp.post('https://api.honeywell.com/oauth2/token', {
      auth: {
        user: process.env.HONEYWELL_OAUTH_KEY,
        pass: process.env.HONEYWELL_OAUTH_SECRET,
      },
      form: {
        grant_type: 'refresh_token',
        refresh_token: req.body.refresh_token,
      },
      json: true,
    });
    return res.json(token);
  } catch (e) {
    return res.sendStatus(500);
  }
});

export default router;
