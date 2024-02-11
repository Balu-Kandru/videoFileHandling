const { start, getStates, getStatusForEverySec, getFilesList, getFoldersList } = require("./service");
const  { StatusCodes } =  require('http-status-codes');

async function initiateProcess(req, res){
    try{
        const sourceFileId = req.query.sourceFileId;
        const destinationFolderName = req.query.destinationFolderName;
        const emailId = req.query.emailId || 'balaswamy.dev@gmail.com';
        let response = {message: "created", data: null};
        let statusCode = StatusCodes.CREATED;
        if(!sourceFileId || !destinationFolderName){
            response.message = "please provide sourceFileId and destinationFolderName";
            response.error = null;
            statusCode = StatusCodes.BAD_REQUEST;
        }else{
            await start(sourceFileId, destinationFolderName, emailId);
        }
        res.status(statusCode).json(response);
    } catch (error) {
        console.error('Error occurred', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message: 'Error occurred.', error: error.toString() });
    }
}

async function getStatus(req, res){
    try{
        const { downloadedBytes, uploadedBytes, totalSize } =  await getStates()
        console.log(downloadedBytes, uploadedBytes, totalSize)
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        if(downloadedBytes == totalSize && uploadedBytes == totalSize){
          res.status(StatusCodes.OK).send("Initiate process by calling: localhost:3001/start");
          return;
        }else{
          res.write('Status: ' + JSON.stringify({ downloadedBytes, uploadedBytes, totalSize }));
        }
        getStatusForEverySec(res);
    }
    catch(error){
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message: 'Error while getting status.', error: error.toString() });
    }
}

async function getFiles(req, res){
    try{
        let response = {
            message: "No files",
            data: []
        }
        let filesList = await getFilesList();
        if(filesList.length){
            response.message = "Successfully fetched";
            response.data = filesList;
        }
        res.status(StatusCodes.OK).json(response)
    }
    catch(error){
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message: 'Error while getting files.', error: error.toString() });
    }
}

async function getFolders(req, res){
    try{
        let response = {
            message: "No files",
            data: []
        }
        let filesList = await getFoldersList();
        if(filesList.length){
            response.message = "Successfully fetched";
            response.data = filesList;
        }
        res.status(StatusCodes.OK).json(response)
    }
    catch(error){
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message: 'Error while getting folders.', error: error.toString() });
    }
}



module.exports = {
    initiateProcess, 
    getStatus,
    getFiles,
    getFolders
}