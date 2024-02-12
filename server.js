const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const https = require('https');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

mongoose.connect('mongodb+srv://Altynbek:corol357abc@altynbek.2yqbc2y.mongodb.net/', { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB Atlas');
});

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  isAdmin: { type: Boolean, default: false },
});

const User = mongoose.model('User', userSchema);

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'your-secret-key', resave: true, saveUninitialized: true }));

const requireLogin = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
};

app.get('/admin', requireLogin, async (req, res) => {
  try {
    const users = await User.find();
    res.render('admin', { username: req.session.username, users });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/admin/add-user', requireLogin, async (req, res) => {
  try {
    const { newUsername, newPassword } = req.body;
    
    const existingUser = await User.findOne({ username: newUsername });
    if (existingUser) {
      return res.status(400).send('User with this username already exists.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const newUser = new User({ username: newUsername, password: hashedPassword, isAdmin: false });
    await newUser.save();

    res.redirect('/admin');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/admin/remove-user', requireLogin, async (req, res) => {
  try {
    const { usernameToRemove } = req.body;
    await User.findOneAndDelete({ username: usernameToRemove });
    res.redirect('/admin');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/admin/edit-user', requireLogin, async (req, res) => {
  try {
    const { usernameToEdit } = req.body;

    const userToEdit = await User.findOne({ username: usernameToEdit });
    if (!userToEdit) {
      return res.status(400).send('User to edit not found.');
    }

    res.render('edit-user', { user: userToEdit });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/admin/edit-user-save', requireLogin, async (req, res) => {
  try {
    const { usernameToEdit, newUsername, newPassword } = req.body;

    const userToEdit = await User.findOne({ username: usernameToEdit });
    if (!userToEdit) {
      return res.status(400).send('User to edit not found.');
    }

    userToEdit.username = newUsername;
    userToEdit.password = await bcrypt.hash(newPassword, 10);
    await userToEdit.save();

    res.redirect('/admin');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/create-admin', async (req, res) => {
    const { username, password } = req.body;
  
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const newAdmin = new User({ username, password: hashedPassword, isAdmin: true });
      await newAdmin.save();
      res.send('Admin user created successfully.');
    } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
    }
});
  
app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.redirect('/login');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });

    if (user && (await bcrypt.compare(password, user.password))) {
      req.session.userId = user._id;
      req.session.username = user.username;
      req.session.isAdmin = user.isAdmin;

      res.redirect('/');
    } else {
      res.redirect('/login');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const apiHistorySchema = new mongoose.Schema({
  api: String,
  data: Object,
  timestamp: { type: Date, default: Date.now },
});

const ApiHistory = mongoose.model('ApiHistory', apiHistorySchema);

async function callApi(apiUrl, apiKey, apiName) {
  try {
    const response = await axios.get(apiUrl, { headers: { 'x-api-key': apiKey } });
    const apiData = response.data;
    const newApiHistory = new ApiHistory({ api: apiName, data: apiData });
    await newApiHistory.save();
    return apiData;
  } catch (error) {
    console.error(`Error calling ${apiName} API: ${error.message}`);
    throw error;
  }
}

app.get('/', (req, res) => {
  const data = {
    weatherResults: '',
    nasaResults: '<p>NASA data goes here</p>',
    exchangeRatesResults: '<p>Exchange rates data goes here</p>',
  };

  const isAdmin = req.session.isAdmin || false;

  res.render('index', { data, isAdmin });
});

app.get("/weather", function (req, res) {
    const city = req.query.city;
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=315ca2c3d000650c533c858e43fc4781&units=metric`;

    https.get(url, function (response) {
        response.on("data", function (data) {
            const weatherdata = JSON.parse(data);
            const temp = weatherdata.main.temp;
            const description = weatherdata.weather[0].description;
            const icon = weatherdata.weather[0].icon;
            const imgURL = `https://openweathermap.org/img/wn/${icon}@2x.png`;

            res.write(`<h1>Temperature is ${temp} Celsius in ${city}</h1>`);
            res.write(`<h2>The weather currently is ${description}</h2>`);
            res.write(`<img src=${imgURL}>`);
            res.send();
        });
    });
});

app.get('/nasa', async (req, res) => {
    try {
        const apiKey = 'smGR4v4aOPYqNbv7uTk9wlsIFyTjbmdoMLTC9aCd';
        const apiUrl = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}&date=2024-01-24`;
        const apiData = await callApi(apiUrl, apiKey, 'NASA');
        res.render('nasa', { data: apiData });
        } catch (error) {
        console.error(error); 
        res.status(500).send('Internal Server Error');
    }
  });
  

app.get('/currency', async (req, res) => {
    try {
      const apiUrl = 'https://api.exchangerate-api.com/v4/latest/USD';
      const apiKey = process.env.EXCHANGE_RATE_API_KEY; 
      const apiData = await callApi(apiUrl, apiKey, 'Exchange Rate');
      res.render('currency', { data: apiData });
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });

async function getNASAData(city) {
    const url = `https://api.nasa.gov/planetary/apod?api_key=${additionalApiKey1}&date=2024-01-24`;
    return await axios.get(url)
        .then(response => response.data)
        .catch(error => {
            console.error("Error fetching NASA data:", error);
            throw error;  
        });
}

const options = {
    hostname: 'example.com',
    port: 3000,
    path: '/',
    method: 'GET'
};

const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log(data);
    });
});

req.on('error', (e) => {
    console.error(`Error: ${e.message}`);
});

req.end();

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});