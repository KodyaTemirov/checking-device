import { server as WebSocketServer } from 'websocket';
import { getNumberOfMonitors, getApps } from '../utils/utils.js';

export const setupWebSocketServer = httpServer => {
	const wsServer = new WebSocketServer({ httpServer });

	let getMonitorsInterval = null;
	let getAppsInterval = null;
	let userDeniedAppsCount;
	let userMonitorCount;

	wsServer.on('request', request => {
		const connection = request.accept(null, request.origin);

		const updateMonitors = async () => {
			try {
				const currentCount = await getNumberOfMonitors();
				if (currentCount !== userMonitorCount) {
					connection.sendUTF(
						JSON.stringify({ type: 'monitor', count: currentCount })
					);
					userMonitorCount = currentCount;
				}
			} catch (error) {
				console.error(error);
				connection.sendUTF(
					JSON.stringify({
						type: 'error',
						message: 'Ошибка при получении данных о мониторах',
					})
				);
			}
		};

		updateMonitors();

		getMonitorsInterval = setInterval(updateMonitors, 2000);

		const sendAppsData = async connection => {
			try {
				const { activeBrowsers, userDeniedApps, activeApps } = await getApps();
				if (userDeniedAppsCount !== userDeniedApps.length) {
					connection.sendUTF(
						JSON.stringify({
							type: 'apps',
							activeBrowsers,
							userDeniedApps,
							activeApps,
						})
					);
					userDeniedAppsCount = userDeniedApps.length;
				}
			} catch (error) {
				console.error(error);
				connection.sendUTF(
					JSON.stringify({
						type: 'error',
						message: 'Ошибка при получении данных о приложениях',
					})
				);
			}
		};

		sendAppsData(connection);

		getAppsInterval = setInterval(() => {
			sendAppsData(connection);
		}, 1500);
	});

	wsServer.on('close', () => {
		userDeniedAppsCount = null;
		userMonitorCount = null;
		clearInterval(getMonitorsInterval);
		clearInterval(getAppsInterval);
	});
};
