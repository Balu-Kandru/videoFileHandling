const express = require('express');
const router = express.Router();

const { initiateProcess, getStatus, getFiles, getFolders } = require('./controller');

router.post('/initiateProcess', initiateProcess);
router.get('/getStatus', getStatus);
router.get('/getFiles', getFiles);
router.get('/getFolders', getFolders)

module.exports = router;