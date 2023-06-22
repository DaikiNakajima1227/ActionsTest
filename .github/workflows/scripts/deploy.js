'use strict';

const sfcc = require('sfcc-ci');
const path = require('path');
const env = process.env
const argvLen = 4;

console.log('process.env : ' + env);

if (process.argv.length !== argvLen) {
    console.log('length of argv must be 4 : ' + process.argv.length);
}

const client_id = process.env.SFCC_OAUTH_CLIENT_ID;
const client_secret = process.env.SFCC_OAUTH_CLIENT_SECRET;
const instance = process.env.SFCC_INSTANCE_SANDBOX007;
const codeVersion = process.argv[2];
const archive = process.argv[3];
const option = {};

console.log('client_id : ' + client_id);
console.log('client_secret : ' + client_secret);
console.log('instance : ' + instance);
console.log('codeVersion : ' + codeVersion);
console.log('archive : ' + archive);

sfcc.auth.auth(client_id, client_secret, function (err, token) {
    if (token) {
        console.log('Authentication succeeded. Token is %s', token);

        sfcc.code.deploy(instance, archive, token, option, function (err) {
            if (err) {
                isError = true
                console.error('Deploy error: %s', err);
                return;
            }

            sfcc.code.activate(instance, codeVersion, token, function (err) {
                if (err) {
                    console.error('Activate error: %s', err);
                }
            });
        });
    }

    if (err) {
        isError = true;
        console.error('Authentication error: %s', err);
    }
});
