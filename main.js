const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const credentials = require('./credentials.json')
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  ['https://www.googleapis.com/auth/drive']
);

const drive = google.drive({ version: 'v3', auth });
let downloadStatus = "NotStarted";
let uploadStatus = "NotStarted";

app.get('/status', (req, res) => {
  res.json({ downloadStatus, uploadStatus });
});

app.get('/start', async (req, res) => {
  const sourceFileId = req.query.sourceFileId;
  const destinationFolderName = req.query.destinationFolderId;
  try {
    const destinationFolderId = await getOrCreateFolder(destinationFolderName);
    await downloadAndUploadVideo(sourceFileId, destinationFolderId);
    res.json({ message: 'Download and upload started' });
  } catch (err) {
    res.status(500).json({ message: 'Error starting download and upload', error: err.toString() });
  }
});

async function downloadAndUploadVideo(fileId, destinationFolderId) {
  const fileMetadata = await drive.files.get({ fileId: fileId, fields: 'id,name,mimeType,parents,size' });
  const fileName = fileMetadata.data.name
  const filePath = path.join(__dirname, fileName);
  const uploadMetadata = {
    name: fileMetadata.data.name,
    mimeType: fileMetadata.data.mimeType,
    parents: [destinationFolderId]
  };
  await downloadFile(fileId, filePath, uploadMetadata);
  totalSize = fileMetadata.data.size;
  await uploadFile(filePath, uploadMetadata, totalSize);
}

async function downloadFile(fileId, filePath, metadata) {
  const dest = fs.createWriteStream(filePath);
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  let downloadedBytes = 0;
  res.data.on('data', chunk => {
    downloadedBytes += chunk.length;
    console.log(`Download progress: ${downloadedBytes} bytes`);
  }).pipe(dest);
  return new Promise((resolve, reject) => {
    dest.on('finish', () => resolve(filePath));
    dest.on('error', reject);
  });
}

async function getOrCreateFolder(folderName) {
  try {
    const response = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}'`,
      fields: 'files(id)',
    });
    const folder = response.data.files[0];
    if (folder) {
      console.log('Folder already exists with ID:', folder.id);
      return folder.id;
    } else {
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      };
      const res = await drive.files.create({
        resource: fileMetadata,
        fields: 'id'
      });
      console.log('Folder created with ID:', res.data.id);
      return res.data.id;
    }
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}
async function uploadFile(filePath, metadata, totalSize) {
  let uploadedBytes = 0;
  const media = {
    mimeType: metadata.mimeType,
    body: fs.createReadStream(filePath)
      .on('data', chunk => {
        uploadedBytes += chunk.length;
        console.log(`Upload progress: ${uploadedBytes}/${totalSize} bytes`);
      })
  };
  const params = {
    uploadType: 'multipart',
    body: media,
    media: media,
    resource: metadata
  };
  try {
    await drive.files.create(params);
  } catch (err) {
    console.log(err)
  }
}
app.listen(3002, () => console.log('Server started on port 3002'));
