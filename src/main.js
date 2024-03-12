// main.js
import { app } from 'electron';
import path from 'path';
import http from 'http';
import { setupWebSocketServer } from './websocket/websocketServer.js';
import { getNumberOfMonitors, getApps } from './utils/utils.js';

app.on('ready', () => {
	// Создаем HTTP сервер
	const server = http.createServer(async (req, res) => {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Content-Type', 'application/json');

		if (req.url === '/monitors') {
			try {
				const data = await getNumberOfMonitors();
				res.end(JSON.stringify({ count: data }));
			} catch (error) {
				console.error(error);
				res.statusCode = 500;
				res.end('Internal Server Error');
			}
		} else if (req.url === '/apps') {
			try {
				const data = await getApps();
				const stringifyObject = JSON.parse(data);

				if (stringifyObject.hasDeniedApps) {
					res.end(stringifyObject.userDeniedApps);
				} else {
					res.end([]);
				}
			} catch (error) {
				console.error(error);
			}
		} else {
			res.statusCode = 404;
			res.end('Not Found');
		}
	});

	// Создаем WebSocket сервер на основе HTTP сервера
	setupWebSocketServer(server);

	server.listen(9061, () => {
		console.log('Server is listening on port 9061');
	});
});
