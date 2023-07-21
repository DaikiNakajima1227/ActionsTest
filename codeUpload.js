const sfcc = require('sfcc-ci');
const { execSync } = require('child_process');

function execute(command) {
    try {
        const stdout = execSync(command);
        console.log(`stdout: ${stdout}`);
    } catch (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
}

function run() {
    try {
        const instance = process.env.SFCC_SANDBOX_API_HOST;
        const clientId = process.env.SFCC_OAUTH_CLIENT_ID;
        const clientSecret = process.env.SFCC_OAUTH_CLIENT_SECRET;
        const codeVersion = process.env.CODE_VERSION;

        const src = process.cwd();
        const newCodeVersion = codeVersion;
        const archiveFile = `${src}/${newCodeVersion}.zip`;
        const option = {};
        console.log(`workspace:${process.cwd()}`);
        console.log(`archiveFile:${archiveFile}`);
        // 1.Authorization Server
        sfcc.auth.auth(clientId, clientSecret, (err, token) => {
            if (token) {
                console.log('Authentication succeeded. Token is %s', token);
                const srcDir = `${src}/cartridges`;

                // 2.Zip cartridges files
                execute(`cp -r ${srcDir} ${newCodeVersion}`);
                // expect for windows
                execute(`zip ${archiveFile} -r ${newCodeVersion}`);
                // only windows
                // execute(`powershell -c Compress-Archive -Path ${newCodeVersion} -DestinationPath ${archiveFile} -Force`);

                // 3.Upload to webDav
                sfcc.code.deploy(instance, archiveFile, token, option, (deployerr) => {
                    if (deployerr) {
                        console.error('Deploy error: %s', deployerr);
                        return;
                    }
                    // 4.Active the code version
                    sfcc.code.activate(instance, newCodeVersion, token, (activateerr) => {
                        if (activateerr) {
                            console.error('Activate error: %s', activateerr);
                        }
                    });

                    // 5.Remove the temporary source directory and archive file for deployment
                    execute(`rm -r ${newCodeVersion}`);
                    execute(`rm ${archiveFile}`);
                });
            }

            if (err) {
                console.error('Authentication error: %s', err);
            }
        });
    } catch (error) {
        console.error(error.message);
    }
}

run();
