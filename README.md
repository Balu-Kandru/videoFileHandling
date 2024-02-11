ProjectName:
    Video File Handling

description:
    Integrated Google drive APIs to perform upload, download, getting files, folders and deletion.
    And has functionlitites to initiate download and upload, monitor status, and retrieve file/folder lists.

    note: can use any service account credentials, but I created a sample service account included in the project.
        email - balaswamy.dev@gmail.com
        password - Balu@9640

Clone the repository:
    git clone https://github.com/Balu-Kandru/videoFileHandling.git

Installation:
    npm install

To Run Project:
    npm start (Default I using 3000 PORT.) 

Endpoints INFO:
    1. Post /api/initiateProcess
            query parameter(2):
                1. destinationFolderName = ID of the file to download from Google Drive.
                    use: fileUploads (any name is also fine)

                2. sourceFileId = Name of the destination folder in Google Drive. 
                    use: 1x_NPqpEJGW7xiJFrTRChDHh05016iLkw or 1TRU-njIVz4RVK3x2DzUDkPWw7kmcNcP3 
                        (can use any fileId but first upload to the drive, an account is already provided).
                
    2.Get  /api/getStatus
            no parameters, but please open in brower, if want ot use in postman some settings need to change

    3.Get /api/getFiles
            no parameters

    4.Get /api/getFolders 
            no parameters

Dependencies:
    fs: For file system operations.
    googleapis: Google API library.
    http-status-codes: For HTTP status code constants.
    path: For file path manipulation.
    stream: For streaming data operations.
