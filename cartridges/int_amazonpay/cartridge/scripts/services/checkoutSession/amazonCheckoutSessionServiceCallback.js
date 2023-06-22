'use strict';

/**
 * @module amazonCheckoutSessionServiceCallback
 */

var amazonCheckoutSessionServiceCallback = {
    create: {
        /**
         * Create a new Amazon Pay Checkout Session to customize and manage the buyer experience,
         * from when the buyer clicks the Amazon Pay button to when they complete checkout.
         * @param {Object} svc Service being executed.
         * @param {Object} params Parameters
         * @param {String} params.url The URL to override the original set on the Service Profile.
         * @param {String} params.httpMethod The HTTP method set on the request
         * @param {Array<headers>} params.headers Array containing all the necessary headers for the request
         * @param {Object} params.payload Payload
         * @returns {Object} Request object to give to the execute method.
         */
        createRequest: function (svc, params) {
            svc.setURL(params.url);
            svc.setRequestMethod(params.httpMethod);

            params.headers.forEach(function (header) {
                svc.addHeader(header.entry, header.val);
            });

            return params.payload;
        },
        parseResponse: function (svc, response) {
            return response.text;
        },
        filterLogMessage: function (msg) {
            return msg;
        }
    },
    get: {
        /**
         * Get Checkout Session details includes buyer info, payment instrument details, and shipping address.
         * Use this operation to determine if checkout was successful after the buyer returns
         * from the AmazonPayRedirectUrl to the specified checkoutResultReturnUrl.
         * @param {Object} svc Service being executed.
         * @param {Object} params Parameters
         * @param {string} params.url The URL to override the original set on the Service Profile. This url contains the checkout session id on the path param.
         * @param {String} params.httpMethod The HTTP method set on the request
         * @param {Array<headers>} params.headers All the necessary headers to call the service
         */
        createRequest: function (svc, params) {
            svc.setURL(params.url);
            svc.setRequestMethod(params.httpMethod);

            params.headers.forEach(function (header) {
                svc.addHeader(header.entry, header.val);
            });

            return;
        },
        parseResponse: function (svc, response) {
            return response.text;
        },
        filterLogMessage: function (msg) {
            return msg;
        }
    },
    update: {
        /**
         * Update the Checkout Session with transaction details.
         * You can keep updating the Checkout Session, as long as it’s in an Open state.
         * @param {Object} svc Service being executed.
         * @param {Object} params Parameters
         * @param {string} params.url The URL to override the original set on the Service Profile. This url contains the checkout session id on the path param.
         * @param {String} params.httpMethod The HTTP method set on the request
         * @param {Array<headers>} params.headers All the necessary headers to call the service
         * @param {Object} params.payload
         * @returns {Object} Request object to give to the execute method.
         */
        createRequest: function (svc, params) {
            svc.setURL(params.url);
            svc.setRequestMethod(params.httpMethod);

            params.headers.forEach(function (header) {
                svc.addHeader(header.entry, header.val);
            });

            return params.payload;
        },
        parseResponse: function (svc, response) {
            return response.text;
        },
        filterLogMessage: function (msg) {
            return msg;
        }
    },
    complete: {
        /**
         * Get Complete Checkout Session details includes buyer info, payment instrument details, and shipping address.
         * Use this operation to determine if checkout was successful after the buyer returns
         * from the AmazonPayRedirectUrl to the specified checkoutResultReturnUrl.
         * @param {Object} svc Service being executed.
         * @param {Object} params Parameters
         * @param {string} params.url The URL to override the original set on the Service Profile. This url contains the checkout session id on the path param.
         * @param {String} params.httpMethod The HTTP method set on the request
         * @param {Array<headers>} params.headers All the necessary headers to call the service
         */
        createRequest: function (svc, params) {
            svc.setURL(params.url);
            svc.setRequestMethod(params.httpMethod);

            params.headers.forEach(function (header) {
                svc.addHeader(header.entry, header.val);
            });

            return params.payload;
        },
        parseResponse: function (svc, response) {
            return response.text;
        },
        filterLogMessage: function (msg) {
            return msg;
        }
    }
};

/**
 * @typedef headers
 * @type {Object}
 * @property {String} entry
 * @property {String} val
 */

module.exports = amazonCheckoutSessionServiceCallback;
