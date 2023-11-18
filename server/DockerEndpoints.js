import { exec } from 'child_process';
import Dockerode from 'dockerode';

export const poolAnalysis = (req, res) => {
    // Assuming you pass the necessary parameters in the request body
    const { type, condition, address, value, output, outputURI, outputOptions, customConditionURI, msgScriptURI } = req.body;

    // Build the Docker command
    const dockerCommand = `docker run your-image-name node ./$file ${type} ${condition} ${address} ${value} ${output} ${outputURI} ${outputOptions} ${customConditionURI} ${msgScriptURI}`;

    // Execute the Docker command
    exec(dockerCommand, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing Docker command: ${error}`);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Process the Docker container output (stdout)
        console.log(`Docker output: ${stdout}`);

        // Respond to the client
        res.status(200).json({ success: true, message: 'Docker command executed successfully' });
    });
}

export const userAnalysis = (req, res) => {
    const userAddress = req.params.userAddress
    const docker = new Dockerode();

    // Build the Docker command
    const dockerCommand = `docker run cm172596/datadock ./userAnalysis.js ${userAddress}`;

    // Specify your Docker image name and userAddress as arguments
    const imageName = 'cm172596/datadock';

    // //promise
    // docker.run(imageName, ['./userAnalysis.js', userAddress], process.stdout).then(function (data) {
    //     var output = data[0];
    //     var container = data[1];
    //     console.log(data);
    //     return container.remove();
    // }).then(function (data2) {
    //     console.log('container removed', data2);
    // }).catch(function (err) {
    //     console.log(err);
    // });


    exec(dockerCommand, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing Docker command: ${error}`);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Process the Docker container output (stdout)
        console.log((stdout))
        res.status(200).json({ success: true, message: JSON.parse(stdout) });
    });
}

export const poolMonitor = (req, res) => {

}

export const transferMonitor = (req, res) => {

}

