#!/usr/bin/env node

import 'source-map-support/register';

import * as http from 'http';
import * as dotenv from 'dotenv';
import app from './app';

// Load environment variables from .env
dotenv.config();

class Core {
  private server;

  constructor(port: number) {
    this.server = http.createServer(app);
    this.server.listen(port);
  }
}

export const core = new Core(parseInt(process.env.HONEYWELL_WORKER_PORT || '3000', 10));