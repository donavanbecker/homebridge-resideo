import * as path from 'path';
import * as express from 'express';
import * as cors from 'cors';
import * as helmet from 'helmet';
import * as bodyParser from 'body-parser';
import * as dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

import userRouter from './routes/user';

// Create Express server
const app = express();

const serveSpa = (req, res, next) => {
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  res.sendFile(path.resolve(__dirname, '../static/index.html'));
};

// set some headers to help secure the app
app.use(
  helmet({
    hsts: false,
    frameguard: true,
    referrerPolicy: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        frameSrc: [`'none'`],
        scriptSrc: [`'self'`, `'unsafe-inline'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        imgSrc: [`'self'`, `https://user-images.githubusercontent.com`],
        fontSrc: [`'self'`],
        workerSrc: [`'none'`],
        connectSrc: [`'self'`],
      },
    },
  }),
);

// parse json body
app.use(bodyParser.json());

// spa entry point
app.get('/', serveSpa);

// static assets
app.use(express.static(path.resolve(__dirname, '../static')));

app.use(
  cors({
    origin: 'http://localhost:4500',
  }),
);

// include routes
app.use('/user', userRouter);

// serve index.html for anything not on the /api routes
app.get(/^((?!user|auth|api\/).)*$/, serveSpa);

// handle errors
app.use((err, req, res, next) => {
  if (res.statusCode === 200) {
    res.status(500);
  }
  if (res.statusCode === 500) {
    console.error(err);
    return res.json({
      error: 'Internal Server Error',
      message: 'Internal Server Error',
    });
  } else {
    return res.json({
      error: err,
      message: err.message,
    });
  }
});

export default app;
