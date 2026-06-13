const fs = require('fs');
const http = require('http');
const path = require('path');
const { Builder, By, until, Browser } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const rootDir = path.resolve(__dirname, '..');
const port = 8766;

const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function startServer() {
  const server = http.createServer((req, res) => {
    const requestedPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const filePath = path.join(rootDir, decodeURIComponent(requestedPath));

    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function clearStorage(driver, url) {
  await driver.get(url);
  await driver.executeScript('localStorage.clear(); sessionStorage.clear();');
}

async function run() {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const options = new chrome.Options()
    .setChromeBinaryPath('/usr/bin/google-chrome')
    .addArguments('--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1280,900');

  let driver;
  try {
    driver = await new Builder()
      .forBrowser(Browser.CHROME)
      .setChromeOptions(options)
      .build();

    await clearStorage(driver, `${baseUrl}/index.html`);
    await driver.findElement(By.id('loginBtn')).click();
    await driver.wait(until.elementIsVisible(driver.findElement(By.id('appContainer'))), 5000);
    await driver.wait(until.elementIsVisible(driver.findElement(By.id('orgInfoMandatoryModal'))), 5000);

    await clearStorage(driver, `${baseUrl}/cds.html`);
    await driver.findElement(By.css('#loginForm button[type="submit"]')).click();
    await driver.wait(until.elementIsVisible(driver.findElement(By.id('appShell'))), 5000);
    await driver.wait(until.elementIsVisible(driver.findElement(By.id('panelReceive'))), 5000);

    console.log('Selenium smoke test passed.');
  } finally {
    if (driver) await driver.quit();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
