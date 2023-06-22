'use strict';

const URLUtils = require('dw/web/URLUtils');
const Resource = require('dw/web/Resource');
const Logger = require('dw/system/Logger');
const sitePreferences = require('dw/system/Site').getCurrent().getPreferences().getCustom();

/**
 * PackageRequest Class Defination
 * @param {httpMethod} httpMethod HTTP method
 */
function PackageRequest(httpMethod) {
    this.omsApiUrl = sitePreferences.omsPKGUrl;
    this.headers = [];
    this.url = '';
    this.payload = '';
    this.httpMethod = typeof httpMethod == 'undefined' ? 'POST' : httpMethod;
    this.guid = '';
    const logger = Logger.getLogger('OmsRequest');

    /**
     * Normalize URL received.
     * @param {String} url URL to be normalized
     */
    this.normalizeUrl = function normalizeUrl(url, args) {
        // eslint-disable-line no-shadow
        if (!url) {
            return;
        }

        var paramsToReplace = [];
        var newURL = url;

        paramsToReplace.push({
            srchVal: ':omsPKGUrl',
            rplcVal: this.omsApiUrl,
        });
        paramsToReplace.forEach(function (e) {
            newURL = newURL.replace(e.srchVal, e.rplcVal);
        });

        const keys = Object.keys(args);
        const queryString = keys.map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(args[key])}`).join('&');

        this.url = newURL + '?' + queryString;
    };
    /**
     * Generate headers to be added on the service headers.
     */
    this.generateHeaders = function generateHeaders() {
        //Generate PreSignedHeaders with utils module if necessary
        this.headers.push({
            entry: 'Content-Type',
            val: 'application/json;charset=UTF-8',
        });
    };

    /**
     * Set the payload data
     */
    this.setData = function setData(data) {
        this.payload = data;
    };
}

PackageRequest.prototype.type = 'PackageRequest';
module.exports = PackageRequest;
