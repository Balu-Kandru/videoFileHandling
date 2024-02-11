const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const credentials = require('./credentials.json')
const fs = require('fs');
const { access, unlink } = require('fs').promises;
const path = require('path');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(express.json());
const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  ['https://www.googleapis.com/auth/drive']
  );
  
const drive = google.drive({ version: 'v3', auth });
  
// const processes = {};
let downloadedBytes = 0;
let uploadedBytes = 0;
let totalSize = 0;
let processCompleted = false;

function stateCleanup() { 
  processCompleted = true;
  uploadedBytes = 0;
  downloadedBytes = 0;
  totalSize = 0;
}
function streamCleanup(destFileStream,readStream){
  destFileStream.end();
  readStream.push(null);
}

app.post('/deleteFolders', async (req,res)=>{
  const apiResponse = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder'",
    fields: "files(id, name)"
  });
  const folderList = apiResponse.data.files;
  for(let folder of folderList){
    await drive.files.delete({
      fileId: folder.id
    })
  }
  res.send("Successfully deleted");
});

// app.post('/deleteFiles', async (req,res)=>{
//   const apiResponse = await drive.files.list({
//     fields: "files(id, name)"
//   });
//   const filesList = apiResponse.data.files;
//   console.log("")
//   let count = 0;
//   for(let file of filesList){
//     let fileId = file.id
//     if (file.id === '1x_NPqpEJGW7xiJFrTRChDHh05016iLkw' || file.id === '1TRU-njIVz4RVK3x2DzUDkPWw7kmcNcP3') {
//         continue;
//     } else {
//       console.log(file.id)
//       await drive.files.delete({
//         fileId: file.id
//       })
//     }
//   }
//   res.send("Successfully deleted");
// });

app.get('/getFoldersList', async (req,res)=>{
  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder'",
    fields: "files(id, name)"
  });
  const folderList = response.data.files;
  res.json(folderList);
});

app.get('/getFilesList', async (req,res)=>{
  const response = await drive.files.list({
    fields: "files(id, name, mimeType)"
  });
  const filesList = response.data.files;
  console.log(filesList)
  res.json(filesList);
})

app.get('/status', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  if(downloadedBytes == totalSize && uploadedBytes == totalSize){
    res.send("Initiate process by calling: localhost:3001/start");
    return;
  }else{
    res.write('Status: ' + JSON.stringify({ downloadedBytes, uploadedBytes, totalSize }));
  }
  getStatus(res);
});


function getStatus(response) {
  if (processCompleted) {
    response.end();
  } else {
    response.write(`\n ${'Status: ' + JSON.stringify({ downloadedBytes, uploadedBytes, totalSize })}`);
    setTimeout(() => { getStatus(response) }, 1000)
  };
};

app.get('/start', async (req, res) => {
  const sourceFileId = req.query.sourceFileId;
  const destinationFolderName = req.query.destinationFolderName;
  const emailId = req.query.emailId || 'balaswamy.dev@gmail.com';
  let fileMetadata;
  try{
    fileMetadata = await drive.files.get({ fileId: sourceFileId, fields: 'id,name,mimeType,parents,size' });
  }catch(error){
    console.log('"File does not exist in drive"')
    throw error;
  }
  let destinationFolderId;
  try {
    destinationFolderId = await getOrCreateFolder(destinationFolderName, emailId);
    await downloadAndUpload(sourceFileId, destinationFolderId, fileMetadata);
    res.json({ message: 'Download and upload started' });
  } catch (error) {
    if(destinationFolderId){
      await deleteByFileId(fileMetadata.data.name, destinationFolderId);
    }
    res.status(500).json({ message: 'Error occuried while starting the process', error: error.toString() });
  } finally{
    stateCleanup(fileMetadata);
  }
});

async function getOrCreateFolder(folderName, emailId) {
  try {
    const response = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}'`,
      fields: 'files(id)',
    });
    const folder = response.data.files;
    if (folder.length) {

      console.log('Folder already exists with ID:', folder[0].id);
      return folder.id;
    } else {
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      };
      const newFolderData = await drive.files.create({
        resource: fileMetadata,
        fields: 'id'
      });
      console.log('Folder created with ID:', newFolderData.data.id);
      await shareFolder(newFolderData.data.id, emailId);
      return newFolderData.data.id;
    }
  } catch (error) {
    console.error('Error while creating folder: ', error);
    throw error;
  }
}
async function shareFolder(folderId, emailId) {
  try {
    const res = await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        role: 'writer',
        type: 'user',
        emailAddress: emailId
      },
      fields: 'id'
    });
    console.log('Permission ID:', res.data.id);
  } catch (error) {
    console.error('Error while sharing folder', error.message);
    throw error;
  }
}

async function ensureOrCreateFolder(folderPath) {
  try {
    await fs.promises.stat(folderPath);
    console.log('Folder already exists:', folderPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Creating folder:', folderPath);
      await fs.promises.mkdir(folderPath);
    } else {
      throw error;
    }
  }
}

async function downloadAndUpload(fileId, destinationFolderId, fileMetadata) {
  try{
    const fileName = fileMetadata.data.name
    let dirPath = path.join(__dirname, 'downloads');
    await ensureOrCreateFolder(dirPath)
    const filePath = path.join(dirPath, fileName);
    const uploadMetadata = {
      name: fileMetadata.data.name,
      mimeType: fileMetadata.data.mimeType,
      parents: [destinationFolderId]
    };
    totalSize = fileMetadata.data.size;
    await downloadAndUploadFile(fileId, filePath, uploadMetadata, totalSize);
  }catch(error){
    console.error("Error occuried while download and upload", error);
    throw error;
  }
}

async function downloadAndUploadFile(fileId, localFilePath, metadata, totalSize) {
  try{
    const destFileStream = fs.createWriteStream(localFilePath);
    const readStream = new Readable({
      read() {}
    });
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    
    readStream.on('end', () => {
      console.log('Steam Completed');
    }).on('error', (error) => {
      streamCleanup(destFileStream, readStream);
      console.log("Error in upstream:", error);
      throw error;
    });
  
    destFileStream.on('finish', () => {
      console.log('download Completed');
    }).on('error', (error) => {
      streamCleanup(destFileStream, readStream);
      console.log("Error in downStream:", error);
      throw error;
    });
    res.data.on('data', (chunk) => {
      readStream.push(chunk);
      destFileStream.write(chunk);
      downloadedBytes += chunk.length;
      const downloadProgress = Math.round((downloadedBytes / totalSize) * 100);
      process.stdout.write(`\r                     Download Progress: ${downloadProgress}%`);
    }).on('end', () => {
      streamCleanup(destFileStream, readStream);
    });
  
    const media = {
      mimeType: metadata.mimeType,
      body: readStream
    };
  
    const params = {
      uploadType: 'resumable',
      media,
      resource: metadata,
    };
    try {
      await drive.files.create(params,{
        onUploadProgress: (progressEvent) => {
          uploadedBytes = progressEvent.bytesRead
          let uploadProgress = Math.round((progressEvent.bytesRead / totalSize) * 100);
          console.log(`\rUpload Progress: ${uploadProgress}%`);
        }
      });
      console.log('File uploaded successfully.');
    } catch (err) {
      console.error('Error uploading file:', err);
      throw err;
    }
  }
  catch(error){
    throw error
  }
};

async function deleteByFileId(fileName, folderId){
  let filePath = path.join(__dirname, 'downloads', fileName);
  try{
    await deleteFileIfExists(filePath);
    await deleteFileByFilenameAndFolderId(fileName, folderId)
    console.log('File deleted successfully from Google Drive.');
  }
  catch(error){
    console.error('Error deleting file:', error);
  }
}

async function deleteFileIfExists(filePath) {
  try {
    await access(filePath, fs.constants.F_OK);
    await unlink(filePath);
    console.log(`File deleted successfully from : ${filePath}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`File not found: ${filePath}`);
    } else {
      console.error('Error deleting file:', error);
    }
  }
}
async function deleteFileByFilenameAndFolderId(fileName, folderId) {
  try {
    const response = await drive.files.list({
      q: `name='${fileName}' and '${folderId}' in parents`,
      fields: 'files(id)',
    });

    const files = response.data.files;
    if (files.length === 0) {
      console.log('File not found.');
      return;
    }
    const fileId = files[0].id;
    await drive.files.delete({ fileId });
    console.log('File deleted successfully.');
  } catch (error) {
    console.error('Error deleting file:', error);
  }
}

// app.post('/cancel', async (req, res) => {
//   const fileId = req.body.fileId;
//   if (!fileId) {
//     return res.status(400).json({ message: 'Please provide a valid fileId along with request body' });
//   }
//   if (processes[fileId]) {
//     processes[fileId].canceled = true;
//     res.json({ message: 'Cancellation request received' });
//   } else {
//     res.status(404).json({ message: 'Process not found' });
//   }
// });

app.listen(3003, () => console.log('Server started on port 3002'));
