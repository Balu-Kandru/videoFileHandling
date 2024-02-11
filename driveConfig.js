const { google } = require('googleapis');
const credentials = require('./credentials.json')

const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/drive']
);

const drive = google.drive({ version: 'v3', auth });

module.exports = {
    drive
}