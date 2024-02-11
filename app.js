const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const routes = require('./fileHandler/routes');

const app = express();
app.use(express.json());
app.use(cors());
dotenv.config();

app.get("",(req,res)=>{
    try{
        res.status(200).json({
            message: "app working",
            data: null
        })
    }
    catch(error){
        res.sendStatus(500).json({
            message: "error",
            error: error.message
        })
    }
});

app.use('/api', routes);


const port = process.env.PORT || 3000;
app.listen(port, (error)=>{
    if(error){
        console.log(error, "Error occured while listening")
    }else{
        console.log(`Server is running on port ${port}`);
    }
});