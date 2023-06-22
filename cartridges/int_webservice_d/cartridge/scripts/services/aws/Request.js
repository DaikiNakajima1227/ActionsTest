'use strict';

const Encoding = require('dw/crypto/Encoding');
const URLUtils = require('dw/web/URLUtils');
const Resource = require('dw/web/Resource');
const Logger = require('dw/system/Logger');
const sitePreferences = require('dw/system/Site').getCurrent().getPreferences().getCustom();
const strUtils = require('dw/util/StringUtils');
const NEW_LINE = '\n';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
const AMAZON_SIGNATURE_ALGORITHM = 'AWS4-HMAC-SHA256';
const AWS_REGION = 'ap-northeast-1';
/**
 *
 * @param {httpMethod} httpMethod HTTP method
 */
function Request(httpMethod) {
    this.headers = [];
    this.url = '';
    this.payload = '';
    this.httpMethod = httpMethod;
    this.buyerId = '';
    this.timeStamp = null;

    const logger = Logger.getLogger('AWSRequest');

    /**
     * Normalize URL received.
     * @param {String} url URL to be normalized
     */
    this.normalizeUrl = function normalizeUrl(url, key) { // eslint-disable-line no-shadow
        if (!url) {
            return;
        }
        let paramsToReplace = [];
        let newURL = url;

        paramsToReplace.push({
            srchVal: ':awsS3Url',
            rplcVal: sitePreferences.awsS3Url
        });
        if (key != null) {
            paramsToReplace.push({
                srchVal: ':key',
                rplcVal: key
            });
        }
        paramsToReplace.forEach(function (e) {
            newURL = newURL.replace(e.srchVal, e.rplcVal);
        });

        this.url = newURL;
    };
    /**
     * Generate headers to be added on the service headers.
     */
    this.generateHeaders = function generateHeaders() {
        const strUtils = require('dw/util/StringUtils');
        this.headers = generatePreSignedHeaders();

        this.headers.push({
            entry: 'authorization',
            val: generateAuthorizationHeader(this.httpMethod, this.url, this.payload, '', this.headers)
        });

    };

    /**
     * 
     */
    this.setData = function setData(data) {
        this.payload = data;
    }

    function generatePreSignedHeaders(clientHeaders) {
        let headers = [];
        this.timeStamp = getFormattedDate();

        if ((clientHeaders !== null) && (clientHeaders !== undefined)) {
            clientHeaders.forEach(function (item) {
                headers.push(item);
            });
        }

        headers.push({
            entry: 'accept',
            val: 'application/json'
        });
        headers.push({
            entry: 'content-type',
            val: 'application/json'
        });
        headers.push({
            entry: 'host',
            val: getAwsHost()
        });
        headers.push({
            entry: 'x-amz-content-sha256',
            val: UNSIGNED_PAYLOAD
        });
        headers.push({
            entry: 'x-amz-date',
            val: this.timeStamp
        });

        return headers;
    };

    /**
     * 
     * @param {*} httpRequestMethod 
     * @param {*} canonicalUri 
     * @param {*} payload 
     * @param {*} queryString 
     * @param {*} canonicalHeaders 
     *"Authorization: AWS4-HMAC-SHA256 Credential={Access Key}/{YYYYMMDD}/{Region}/s3/aws4_request,SignedHeaders={canonicalHeaders},Signature={calculated-signature}"
     * @returns 
     */
    function generateAuthorizationHeader(httpRequestMethod, canonicalUri, payload, queryString, canonicalHeaders) {
        let canonicalRequest = generateCanonicalRequestString(httpRequestMethod, canonicalUri, queryString, canonicalHeaders, canonicalHeaders, payload);
        let stringToSign = generateStringToSign(canonicalRequest);
        let signature = calculateSignature(stringToSign);

        let authorizationHeader = AMAZON_SIGNATURE_ALGORITHM;
        authorizationHeader += ' Credential=' + sitePreferences.awsS3AccessKey + '/' + getScope() + ',';
        authorizationHeader += 'SignedHeaders=' + normalizeSignedHeaders(canonicalHeaders) + ',';
        authorizationHeader += 'Signature=' + signature;
        return authorizationHeader;
    };

    /**
     * 
     * @param {*} canonicalRequest 
     *"AWS4-HMAC-SHA256" + "\n" +
     *timeStampISO8601Format + "\n" +
     *<Scope > +"\n" +
     *Hex(SHA256Hash( < CanonicalRequest > ))
     * @returns stringToSign
     */
    function generateStringToSign(canonicalRequest) {
        let timeStamp = this.timeStamp;
        let stringToSign = AMAZON_SIGNATURE_ALGORITHM + NEW_LINE
        stringToSign = stringToSign + timeStamp + NEW_LINE;
        stringToSign = stringToSign + getScope() + NEW_LINE;
        stringToSign = stringToSign + hexAndHash(canonicalRequest);
        return stringToSign;
    }

    /**
     * 
     * @param {*} httpRequestMethod 
     * @param {*} canonicalUri 
     * @param {*} queryString 
     * @param {*} canonicalHeaders 
     * @param {*} signedHeaders 
     * @param {*} payload 
     * < HTTPMethod > \n <
         CanonicalURI > \n <
         CanonicalQueryString > \n <
         CanonicalHeaders > \n <
         SignedHeaders > \n <
         HashedPayload >
     * @returns 
     */
    function generateCanonicalRequestString(httpRequestMethod, canonicalUri, queryString, canonicalHeaders, signedHeaders, payload) {
        let canonicalRequestString = '';
        //let pload = typeof payload === 'string' ? payload : JSON.stringify(payload);
        let hashedPayload = hexAndHash('');

        let normalizedCanonicalUri = normalizeCanonicalUri(canonicalUri);
        let normalizedCanonicalHeaders = normalizeCanonicalHeaders(canonicalHeaders);
        let normalizedSignedHeaders = normalizeSignedHeaders(signedHeaders);

        canonicalRequestString += httpRequestMethod;
        canonicalRequestString += NEW_LINE;
        canonicalRequestString += normalizedCanonicalUri;
        canonicalRequestString += NEW_LINE;
        canonicalRequestString += queryString ? queryString + NEW_LINE : NEW_LINE;
        canonicalRequestString += normalizedCanonicalHeaders;
        canonicalRequestString += NEW_LINE;
        canonicalRequestString += normalizedSignedHeaders;
        canonicalRequestString += NEW_LINE;
        canonicalRequestString += UNSIGNED_PAYLOAD;
        //canonicalRequestString += hexAndHash(payload);

        return canonicalRequestString;
    }

    function getAwsHost() {
        let urlParts = sitePreferences.awsS3Url.split('/');
        return urlParts[0];
    }

    function getScope() {
        let timeStamp = this.timeStamp;
        let scope = timeStamp.substring(0, 8) + "/" + AWS_REGION + "/s3/aws4_request";
        return scope;
    }

    function getFormattedDate() {
        let timeStamp = new Date().toISOString().replace(/(\:+|\-+|\.[0-9]+)/g, ''); // eslint-disable-line no-useless-escape
        return timeStamp;
    };
    /**
     * Hex and Hash a value
     * @param {string} val Value to be Hexed and Hashed.
     * @returns {string} Hexed and Hashed value
     */
    function hexAndHash(val) {
        let newVal;
        let Bytes = require('dw/util/Bytes');
        let MessageDigest = require('dw/crypto/MessageDigest');
        let bytes = new Bytes(val);
        let md = new MessageDigest(MessageDigest.DIGEST_SHA_256);
        md.updateBytes(bytes);
        newVal = Encoding.toHex(md.digest());
        return newVal;
    }

    /**
     * Calculate signature
     * @param {string} stringToSign String to sign
     * @returns {string} Calculated signature
     */
    function calculateSignature(stringToSign) {
        //const Bytes = require('dw/util/Bytes');
        //let Signature = require('dw/crypto/Signature');
        const Mac = require('dw/crypto/Mac');

        let hmac = new Mac(Mac.HMAC_SHA_256);
        let dateKey = hmac.digest(this.timeStamp.substring(0, 8), 'AWS4' + sitePreferences.awsS3SecretAccessKey);
        let dateRegionKey = hmac.digest(AWS_REGION, dateKey);
        let dateRegionServiceKey = hmac.digest('s3', dateRegionKey);
        let signingKey = hmac.digest('aws4_request', dateRegionServiceKey);
        let signature = hmac.digest(stringToSign, signingKey);
        let encodedSignature = Encoding.toHex(signature);

        return encodedSignature;
    }

    /**
     * Normalize the headers list,
     * converting all header names to lowercase and removing leading spaces and trailing spaces.
     * Convert sequential spaces in the header value to a single space.
     * @param {Array<HeaderEntry>} headers List of all the HTTP headers that you are including with the signed request.
     * @returns {string} Normalized value.
     */
    function normalizeCanonicalHeaders(headers) {
        let str = '';

        headers.forEach(function (e) {
            str = str + e.entry.toLowerCase() + ':' + e.val.trim() + '\n';
        });
        return str;
    }

    /**
     * Normalize the canonical headers list to signed headers.
     * @param {Array<HeaderEntry>} headers List of all the HTTP headers that you are including with the signed request.
     * @returns {string} Normalized value.
     */
    function normalizeSignedHeaders(headers) {
        let str = '';
        let separator = '';
        let operator = 1;

        headers.forEach(function (header, index, t) {
            separator = index + operator < t.length ? ';' : '';
            str = str + normalizeString(header.entry) + separator;
        });
        return str;
    }

    /**
     * @param {string} value Value to be normalized.
     * @returns {string} String with lowercased and trimmed.
     */
    function normalizeString(value) {
        return value.toLowerCase().trim();
    }

    /**
     * Normalize the canonical uri
     * @param {string} uri Value to be replaced
     * @returns {string} Normalized uri
     */
    function normalizeCanonicalUri(uri) {
        let srchVal = 'https://' + getAwsHost();
        let normalizedUri = uri.replace(srchVal, '');
        return normalizedUri;
    }
}

Request.prototype.type = 'Request';
module.exports = Request;