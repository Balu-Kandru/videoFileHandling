const fs = require('fs');
const { access, unlink } = require('fs').promises;
const { drive } = require('../driveConfig');
const path = require('path');
const { Readable } = require('stream');

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

function streamCleanup(destFileStream, readStream) {
    destFileStream.end();
    readStream.push(null);
}

async function getStates() {
    return { downloadedBytes, uploadedBytes, totalSize }
}

function getStatusForEverySec(response) {
    if (processCompleted) {
      response.end();
    } else {
      response.write(`\r${'Status: ' + JSON.stringify({ downloadedBytes, uploadedBytes, totalSize })}`);
      setTimeout(() => { getStatusForEverySec(response) }, 1000)
    };
  };

async function getFilesList() {
    try {
        const response = await drive.files.list({
            fields: "files(id, name, mimeType)"
        });
        const filesList = response.data.files;
        return filesList;
    } catch (err) {
        throw err;
    }
}

async function getFoldersList() {
    try {
        const response = await drive.files.list({
            q: "mimeType='application/vnd.google-apps.folder'",
            fields: "files(id, name)"
        });
        const folderList = response.data.files;
        return folderList
    }
    catch (error) {
        throw error;
    }
}

async function shareFolder(folderId, emailId) {
    try {
        console.log(emailId)
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

async function getOrCreateFolder(folderName, emailId) {
    try {
        const response = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}'`,
            fields: 'files(id)',
        });
        const folder = response.data.files;
        if (folder.length) {
            console.log('Folder already exists with ID:', folder[0].id);
            return folder[0].id;
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
    try {
        const fileName = fileMetadata.data.name
        let dirPath = path.join(__dirname, 'downloads');
        await ensureOrCreateFolder(dirPath)
        const filePath = path.join(dirPath, fileName);
        const uploadMetadata = {
            name: fileMetadata.data.name,
            mimeType: fileMetadata.data.mimeType,
            parents: [destinationFolderId]
        };
        await downloadAndUploadFile(fileId, filePath, uploadMetadata, totalSize);
    } catch (error) {
        console.error("Error occuried while download and upload", error);
        throw error;
    }
}


async function downloadAndUploadFile(fileId, localFilePath, metadata, totalSize) {
    try {
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
            process.stdout.write(`\r                      Download Progress: ${downloadProgress}%`);
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
            await drive.files.create(params, {
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
    catch (error) {
        throw error
    }
};

async function deleteByFileId(fileName, folderId) {
    let filePath = path.join(__dirname, 'downloads', fileName);
    try {
        await deleteFileIfExists(filePath);
        await deleteFileByFilenameAndFolderId(fileName, folderId)
        console.log('File deleted successfully from Google Drive.');
    }
    catch (error) {
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

async function start(sourceFileId, destinationFolderName, emailId){
    stateCleanup();
    let fileMetadata;
    try{
      fileMetadata = await drive.files.get({ fileId: sourceFileId, fields: 'id,name,mimeType,parents,size' });
      totalSize = fileMetadata.data.size;
    }catch(error){
      console.log('"File does not exist in drive"')
      throw error;
    }
    let destinationFolderId;
    try {
      destinationFolderId = await getOrCreateFolder(destinationFolderName, emailId);
      await downloadAndUpload(sourceFileId, destinationFolderId, fileMetadata);
    } catch (error) {
      if(destinationFolderId){
        await deleteByFileId(fileMetadata.data.name, destinationFolderId);
      }
      throw error;
    } finally{
      stateCleanup();
    }
}


module.exports = {
    getStates,
    getStatusForEverySec,
    start,
    getFilesList,
    getFoldersList
}