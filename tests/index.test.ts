import request from 'supertest';
import { io as Client, Socket } from 'socket.io-client';
import { app, httpServer } from '../src/server/index';
import axios from 'axios';
import { AddressInfo } from 'net';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Server Index (Express & Socket.io)', () => {
  let port: number;
  const sockets: Socket[] = [];

  beforeAll((done) => {
    httpServer.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    sockets.forEach((s) => s.disconnect());
    httpServer.close(done);
  });

  const createSocket = () => {
    const s = Client(`http://localhost:${port}`);
    sockets.push(s);
    return s;
  };

  describe('Express Routes', () => {
    it('should serve index.html on root path', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.type).toBe('text/html');
    });

    it('should serve admin.html on /admin path', async () => {
      const response = await request(app).get('/admin');
      expect(response.status).toBe(200);
      expect(response.type).toBe('text/html');
    });

    it('should handle /auth/debug with missing token', async () => {
      delete process.env.INSTAGRAM_ACCESS_TOKEN;
      const response = await request(app).get('/auth/debug');
      expect(response.text).toContain('Error: No INSTAGRAM_ACCESS_TOKEN found');
    });

    it('should handle /auth/debug with valid token (mocked)', async () => {
      process.env.INSTAGRAM_ACCESS_TOKEN = 'mock-token';

      // Mock the multiple axios calls in auth/debug
      mockedAxios.get
        .mockResolvedValueOnce({ data: { name: 'Test User', id: '123' } }) // me
        .mockResolvedValueOnce({
          data: { data: [{ permission: 'pages_show_list', status: 'granted' }] },
        }) // permissions
        .mockResolvedValueOnce({ data: { data: [] } }); // accounts

      const response = await request(app).get('/auth/debug');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Auth Debugger');
      expect(response.text).toContain('Test User');
    });
  });

  describe('Socket.io Events', () => {
    it('should communicate auth status on connection', (done) => {
      const socket = createSocket();

      socket.once('auth-status', (status) => {
        expect(status).toHaveProperty('apiReady');

        expect(status).toHaveProperty('browserReady');

        done();
      });
    }, 10000);

    it('should handle admin access verification', (done) => {
      const socket = createSocket();

      delete process.env.ADMIN_CODE;

      process.env.ACCESS_CODE = 'secret123';

      socket.on('connect', () => {
        socket.emit('verify-access-code', 'secret123');
      });

      socket.once('admin-access-granted', () => {
        done();
      });
    }, 10000);

    it('should deny invalid admin access', (done) => {
      const socket = createSocket();

      delete process.env.ADMIN_CODE;

      process.env.ACCESS_CODE = 'secret123';

      socket.on('connect', () => {
        socket.emit('verify-access-code', 'wrong-code');
      });

      socket.once('log', (msg) => {
        expect(msg).toContain('Admin Access Denied');

        done();
      });
    }, 10000);
  });
});
