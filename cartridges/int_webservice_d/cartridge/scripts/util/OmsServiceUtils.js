const Encoding = require('dw/crypto/Encoding');
const CurrentSite = require('dw/system/Site').getCurrent();
const UUIDUtils = require('dw/util/UUIDUtils');
const URLUtils = require('dw/web/URLUtils');
const preferences = CurrentSite.getPreferences().getCustom();
const host = 'pay-api.amazon.' + preferences.amzPayRegion.value;

/**
 * Amazon payment with util functions.
 */
module.exports = {
    generateAuthorizationHeader : function (httpRequestMethod, canonicalUri, payload, queryString, canonicalHeaders) {
        var canonicalRequest = generateCanonicalRequestString(httpRequestMethod, canonicalUri, queryString, canonicalHeaders, canonicalHeaders, payload);
        var stringToSign = AMAZON_SIGNATURE_ALGORITHM + '\n' + hexAndHash(canonicalRequest);
        var signature = calculateSignature(stringToSign);
        var authorizationHeader = AMAZON_SIGNATURE_ALGORITHM;
        authorizationHeader += ' PublicKeyId=' + preferences.amzPayPublicKeyId + ',';
        authorizationHeader += ' SignedHeaders=' + normalizeSignedHeaders(canonicalHeaders) + ',';
        authorizationHeader += ' Signature=' + signature;
        return authorizationHeader;
    };

}

/**
 * Hex and Hash a value
 * @param {string} val Value to be Hexed and Hashed.
 * @returns {string} Hexed and Hashed value
 */
function hexAndHash(val) {
    var newVal;
    var Bytes = require('dw/util/Bytes');
    var MessageDigest = require('dw/crypto/MessageDigest');
    var bytes = new Bytes(val);
    var md = new MessageDigest(MessageDigest.DIGEST_SHA_256);
    md.updateBytes(bytes);
    newVal = Encoding.toHex(md.digest());
    return newVal;
}

/**
 * Generate the Pre-signed headers.
 * @param {Array<HeaderEntry>} clientHeaders Headers that client needs to add to the request.
 * @returns {Array<HeaderEntry>} Array of Header entries to be added to the service
 */
AmazonPayUtils.generatePreSignedHeaders = function (clientHeaders) {
    var headers = [];

    if ((clientHeaders !== null) && (clientHeaders !== undefined)) {
        clientHeaders.forEach(function (item) {
            headers.push(item);
        });
    }

    var region = preferences.amzPayRegion.value.toLowerCase() === 'com' ? 'na' : preferences.amzPayRegion.value.toLowerCase();

    headers.push({ entry: 'accept', val: 'application/json' });
    headers.push({ entry: 'content-type', val: 'application/json' });
    headers.push({ entry: 'x-amz-pay-date', val: AmazonPayUtils.getFormattedDate() });
    headers.push({ entry: 'x-amz-pay-host', val: host });
    headers.push({ entry: 'x-amz-pay-region', val: region });

    headers.sort(function (a, b) {
        return a.entry.toLowerCase().localeCompare(b.entry.toLowerCase());
    });

    return headers;
};
/**
 * Normalize the headers list,
 * converting all header names to lowercase and removing leading spaces and trailing spaces.
 * Convert sequential spaces in the header value to a single space.
 * @param {Array<HeaderEntry>} headers List of all the HTTP headers that you are including with the signed request.
 * @returns {string} Normalized value.
 */
function normalizeCanonicalHeaders(headers) {
    var str = '';

    headers.forEach(function (e) {
        if (e.entry !== 'x-amz-pay-simulation-code') {
            str = str + e.entry.toLowerCase() + ':' + e.val.trim() + '\n';
        }
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
 * Normalize the canonical headers list to signed headers.
 * @param {Array<HeaderEntry>} headers List of all the HTTP headers that you are including with the signed request.
 * @returns {string} Normalized value.
 */
function normalizeSignedHeaders(headers) {
    var str = '';
    var separator = '';
    var operator = 1;

    headers.forEach(function (header) {
        if (header.entry === 'x-amz-pay-simulation-code') {
            operator = 2;
        }
    });

    headers.forEach(function (header, index, t) {
        separator = index + operator < t.length ? ';' : '';
        if (header.entry !== 'x-amz-pay-simulation-code') {
            str = str + normalizeString(header.entry) + separator;
        }
    });
    return str;
}

/**
 * Normalize the canonical uri
 * @param {string} uri Value to be replaced
 * @returns {string} Normalized uri
 */
function normalizeCanonicalUri(uri) {
    var srchVal = 'https://' + host;
    var normalizedUri = uri.replace(srchVal, '');
    return normalizedUri;
}

/**
 * @param {requestMethod} httpRequestMethod HTTP Request Method
 * @param {string} canonicalUri canonical URI parameter
 * @param {string} queryString Query String Params
 * @param {string} canonicalHeaders Signed Headers
 * @param {string} signedHeaders Signed Headers
 * @param {Object} payload Payload
 * @returns {string} Generated canonical request string.
 */
function generateCanonicalRequestString(httpRequestMethod, canonicalUri, queryString, canonicalHeaders, signedHeaders, payload) {
    var canonicalRequestString = '';
    var pload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    var hashedPayload = hexAndHash(pload);
    var newLine = '\n';
    var normalizedCanonicalUri = normalizeCanonicalUri(canonicalUri);
    var normalizedCanonicalHeaders = normalizeCanonicalHeaders(canonicalHeaders);
    var normalizedSignedHeaders = normalizeSignedHeaders(signedHeaders);

    canonicalRequestString += httpRequestMethod;
    canonicalRequestString += newLine;
    canonicalRequestString += normalizedCanonicalUri;
    canonicalRequestString += newLine;
    canonicalRequestString += queryString ? queryString + newLine : newLine;
    canonicalRequestString += normalizedCanonicalHeaders;
    canonicalRequestString += newLine;
    canonicalRequestString += normalizedSignedHeaders;
    canonicalRequestString += newLine;
    canonicalRequestString += hashedPayload;

    return canonicalRequestString;
}

/**
 * @returns {string} Idempotency key
 */
AmazonPayUtils.generateIdempotencyKey = function () {
    return UUIDUtils.createUUID().substring(0, 16);
};

/**
 * @returns {string} Formatted Date value to add to the header.
 */
AmazonPayUtils.getFormattedDate = function () {
    var timeStamp = new Date().toISOString().replace(/(\:+|\-+|\.[0-9]+)/g, ''); // eslint-disable-line no-useless-escape
    return timeStamp;
};

AmazonPayUtils.getURLs = function () {
    return {
        getCheckoutSession: URLUtils.url('AmazonPay-GetCheckoutSession').toString(),
        getAdditionalButtonConfig: URLUtils.url('AmazonPay-GetAdditionalButtonConfig').toString(),
        getEstimatedOrderAmount: URLUtils.url('AmazonPay-GetEstimatedOrderAmount').toString()
    };
};

AmazonPayUtils.getPreferences = function (request, session) {
    var currencyCode;

    if (preferences.amzPayRegion == 'eu') {
        currencyCode = 'EUR';
    } else {
        currencyCode = session.getCurrency().getCurrencyCode();
    }

    var locale = request.getLocale();

    if (!empty(preferences.amzPayLocalesMap)) {
        try {
            var localesMap = JSON.parse(preferences.amzPayLocalesMap);
            var region = localesMap[preferences.amzPayRegion];
            locale = region[locale.substring(0, 2)];

            if (empty(locale) && preferences.amzPayRegion == 'eu') {
                locale = 'en_GB';
            }
        } catch (e) {
            var Logger = require('dw/system/Logger');
            Logger.error(e.toString());
        }
    }

    return {
        AMAZON_CURRENCY: currencyCode,
        AMAZON_CHECKOUT_LANGUAGE: locale,
        AMAZON_MERCHANT_ID: preferences.amzPayMerchantId,
        AMAZON_MERCHANT_NAME: preferences.amzPayMerchantName,
        AMAZON_SANDBOX_MODE: preferences.amzPayEnvironment.value === 'sandbox',
        AMAZON_PRODUCT_TYPE: preferences.amzPayProductType.value,
        AMAZON_PUBLIC_KEY_ID: preferences.amzPayPublicKeyId,
        AMAZON_SFRA_6_1_0_ENABLED: preferences.enableSFRAv6_1_0
    };
};

/**
 * @param {requestMethod} httpRequestMethod HTTP Request Method
 * @param {string} canonicalUri canonical URI parameter
 * @param {Object} payload Payload object that is being sent on request
 * @param {string} queryString Query String Params
 * @param {Object} canonicalHeaders Signed Headers
 * @returns {string} Return generated Authorization Header
 */
AmazonPayUtils.generateAuthorizationHeader = function (httpRequestMethod, canonicalUri, payload, queryString, canonicalHeaders) {
    var canonicalRequest = generateCanonicalRequestString(httpRequestMethod, canonicalUri, queryString, canonicalHeaders, canonicalHeaders, payload);
    var stringToSign = AMAZON_SIGNATURE_ALGORITHM + '\n' + hexAndHash(canonicalRequest);
    var signature = calculateSignature(stringToSign);
    var authorizationHeader = AMAZON_SIGNATURE_ALGORITHM;
    authorizationHeader += ' PublicKeyId=' + preferences.amzPayPublicKeyId + ',';
    authorizationHeader += ' SignedHeaders=' + normalizeSignedHeaders(canonicalHeaders) + ',';
    authorizationHeader += ' Signature=' + signature;
    return authorizationHeader;
};

AmazonPayUtils.getPaymentDetail = function (basket) {
    var grossPrice = basket ? basket.getTotalGrossPrice() : null;
    var paymentDetails = {};

    if (preferences.amzPayMultiAuthorization === true && !this.isRecurringOrder(basket)) {
        paymentDetails = {
            chargeAmount: {
                amount: '5',
                currencyCode: grossPrice && grossPrice.currencyCode ? grossPrice.currencyCode : session.currency.getCurrencyCode()
            },
            totalOrderAmount: {
                amount: grossPrice && grossPrice.value ? grossPrice.value.toString() : '',
                currencyCode: grossPrice && grossPrice.currencyCode ? grossPrice.currencyCode : session.currency.getCurrencyCode()
            },
            paymentIntent: preferences.amzPayPaymentIntent.value === 'AuthorizeWithCapture' ? 'Authorize' : preferences.amzPayPaymentIntent.value,
            canHandlePendingAuthorization: preferences.amzPayCanHandlePendingAuthorization
        };
    } else {
        paymentDetails = {
            chargeAmount: {
                amount: grossPrice && grossPrice.value ? grossPrice.value.toString() : '',
                currencyCode: grossPrice && grossPrice.currencyCode ? grossPrice.currencyCode : session.currency.getCurrencyCode()
            },
            paymentIntent: preferences.amzPayPaymentIntent.value === 'AuthorizeWithCapture' ? 'Authorize' : preferences.amzPayPaymentIntent.value,
            canHandlePendingAuthorization: preferences.amzPayCanHandlePendingAuthorization
        };
    }

    return paymentDetails;
};

AmazonPayUtils.isRecurringOrder = function (basket) {
    if (basket && basket.productQuantityTotal != 0) {
        return basket.getProductLineItems().toArray().some(function (pli) {
            return pli.product.custom.amzPayIsRecurringProduct;
        });
    } else {
        return false;
    }
};
