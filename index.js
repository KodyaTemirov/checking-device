const { app } = require('electron');
const path = require('path');
const http = require('http');
const WebSocket = require('websocket').server;
const { exec } = require('child_process');
const os = require('os');
const activeWindow = require('active-win');


const childProcess = null;
let currentCountMonitor = 0;
// Функция для определения операционной системы и выполнения соответствующей команды
function getNumberOfMonitors() {
	const platform = os.platform();

	let command;
	if (platform === 'win32') {
		// Команда для Windows
		command =
			'powershell -Command "(Get-WmiObject -Namespace root\\wmi -Class WmiMonitorBasicDisplayParams).Count"';
	} else if (platform === 'linux') {
		// Команда для Linux
		command = 'xrandr -q | grep " connected" | wc -l';
	} else if (platform === 'darwin') {
		// Команда для macOS
		command = 'system_profiler SPDisplaysDataType | grep "Resolution" | wc -l';
	} else {
		console.error('Неизвестная операционная система');
		return Promise.reject(new Error('Неизвестная операционная система'));
	}

	return new Promise((resolve, reject) => {
		childProcess = exec(command, (error, stdout, stderr) => {
			if (error) {
				console.error(`Ошибка при выполнении команды: ${error.message}`);
				reject(error);
				return;
			}
			if (stderr) {
				console.error(`Ошибка: ${stderr}`);
				reject(new Error(stderr));
				return;
			}

			// Вывод результата
			const numMonitors = parseInt(stdout.trim(), 10);

			resolve(!numMonitors ? 1 : numMonitors);
		});
	});
}

function getApps(){
	return new Promise((resolve, reject) => {
		try{
			let browsers = ['Google Chrome', 'Yandex with voice assistant Alice', 'Microsoft Edge', 'Firefox', 'Safari'];
			let activeApps = activeWindow.getOpenWindowsSync();
			let activeBrowsers = [];
			let hasManyBrowsers = false;
			let hasDeniedApps = false;
			let deniedApps = ['Telegram Desktop', 'TeamViewer', 'AnyDesk', 'AeroAdmin','Getscreen', 'SupRemo', 'TightVNC', 'Radmin', 'Kickidler'];
			let userDeniedApps = [];
		
			activeApps.forEach(app => {
				if(browsers.includes(app.owner.name)){
					activeBrowsers.push(app.owner.name);
				}
				if(deniedApps.includes(app.owner.name)){
					userDeniedApps.push(app.owner.name);
				}
			})
		
			if(activeBrowsers.length > 1){
				hasManyBrowsers = true;
			}
		
			if(userDeniedApps.length){
				hasDeniedApps = true;
			}
		
			resolve(JSON.stringify({hasManyBrowsers, hasDeniedApps, userDeniedApps}));
		}
		catch(error){
			reject(error);
		}
		
	})
	
}


// Вызов функции

app.on('ready', () => {
	// Установка иконки приложения
	const iconPath = path.join(__dirname, 'assets', 'logo.png');
	if (process.platform === 'darwin') {
		app.dock.setIcon(iconPath);
	} else {
		app.applicationIcon = iconPath;
	}

	// Создаем HTTP сервер
	const server = http.createServer(async (req, res) => {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Content-Type', 'application/json');

		if (req.url === '/monitors') {
			try {
				const data = await getNumberOfMonitors();
				res.end(JSON.stringify({ count: data }));

				if(childProcess){
					childProcess.kill();
				}
			} catch (error) {
				console.error(error);

				if(childProcess){
					childProcess.kill();
				}
				
				res.statusCode = 500;
				res.end('Internal Server Error');
			}
		} 
		else if(req.url === '/apps'){
			getApps()
				.then(data => {
					let stringifyObject = JSON.parse(data);

					if(stringifyObject.hasDeniedApps){
						res.end(stringifyObject.userDeniedApps);
					}
					else{
						res.end([]);
					}
					
				})
				.catch(console.error);
		}
		
		else {
			res.statusCode = 404;
			res.end('Not Found');
		}
	});

	// Создаем WebSocket сервер на основе HTTP сервера
	const wsServer = new WebSocket({
		httpServer: server,
	});

	let getMonitorsInterval = null;
	let getAppsInterval = null;

	// Обработка подключений к WebSocket серверу
	wsServer.on('request', request => {
		const connection = request.accept(null, request.origin);

		// Отправляем количество мониторов при подключении
		getNumberOfMonitors()
			.then(data => {
				currentCountMonitor = data;
				connection.sendUTF(JSON.stringify({ type: 'monitor', count: data }));

				if(childProcess){
					childProcess.kill();
				}
				
			})
			.catch(error => {
				console.error(error);
				connection.sendUTF(
					JSON.stringify({
						type: 'error',
						message: 'Ошибка при получении данных о мониторах',
					})
				);

				if(childProcess){
					childProcess.kill();
				}
			});

		getApps()
			.then(data => {
				connection.sendUTF(JSON.stringify({ type: 'apps', data }));
			})
			.catch(error => {
				console.error(error);
				connection.sendUTF(
					JSON.stringify({
						type: 'error',
						message: 'Ошибка при получении данных о приложениях',
					})
				);
			});


		getMonitorsInterval = setInterval(async () => {
			const currentCount = await getNumberOfMonitors();
			if (currentCount != currentCountMonitor) {
				currentCountMonitor = currentCount;
				connection.sendUTF(
					JSON.stringify({ type: 'monitor', count: currentCount })
				);
			}
		}, 2000);

		getAppsInterval = setTimeout(async function toInterval(){
			if(getAppsInterval){
				getApps().then(data => {
					let stringifyObject = JSON.parse(data);

					if(stringifyObject.hasDeniedApps){
						connection.sendUTF(stringifyObject.userDeniedApps);
					}
					else{
						connection.sendUTF([]);
					}
					
					getAppsInterval = setTimeout(toInterval, 1500);
				})				
			}
		}, 1500);

	});

	wsServer.on('close', () => {
		clearInterval(getMonitorsInterval);
		clearInterval(getAppsInterval);
	})


	server.listen(9061, () => {
		console.log('Server is listening on port 9060');
	});
});
