import express from 'express';
import bodyParser from 'body-parser';
import * as dockerController from './DockerEndpoints.js';

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());

app.post('/execute-poolanalysis', dockerController.poolAnalysis);
app.post('/execute-useranalysis/:userAddress', dockerController.userAnalysis);
app.post('/execute-poolmonitor', dockerController.poolMonitor);
app.post('/execute-transfermonitor', dockerController.transferMonitor);

// app.post('/execute-poolanalysis', dockerController.poolAnalysis);


// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});