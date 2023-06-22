'use strict';

const URLUtils = require('dw/web/URLUtils');
const Resource = require('dw/web/Resource');
const Logger = require('dw/system/Logger');
const sitePreferences = require('dw/system/Site').getCurrent().getPreferences().getCustom();

/**
 * Request Class Defination
 * @param {httpMethod} httpMethod HTTP method
 */
function Request(httpMethod) {
    this.omsApiUrl = sitePreferences.omsApiUrl;
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
    this.normalizeUrl = function normalizeUrl(url) {
        // eslint-disable-line no-shadow
        if (!url) {
            return;
        }

        var paramsToReplace = [];
        var newURL = url;

        paramsToReplace.push({
            srchVal: ':omsApiUrl',
            rplcVal: this.omsApiUrl,
        });
        paramsToReplace.forEach(function (e) {
            newURL = newURL.replace(e.srchVal, e.rplcVal);
        });

        this.url = newURL;
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

Request.prototype.type = 'Request';
module.exports = Request;
