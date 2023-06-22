'use strict';

/**
 * @module amazonRefundServiceCallback
 */

var amazonRefundServiceCallback = {
    create: {
        /**
         * Initiate a full or partial refund for a charge.
         * @param {Object} svc Service being executed
         * @param {Object} params Parameters
         * @param {String} params.url The URL to override the original set on the Service Profile.
         * @param {String} params.httpMethod The HTTP method set on the request
         * @param {Array<headers>} params.headers Array containing all the necessary headers for the request
         * @param {Object} params.payload Payload
         * @param {string} params.payload.chargeId Charge identifier.
         * @param {price} params.payload.refundAmount Amount to be refunded.
         * @param {string} params.payload.softDescriptor The description is shown on the buyer payment instrument (such as bank) statement.
         * Default: "AMZ* <MerchantStoreName> amzn.com/pmts"
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
         * Get refund details.
         * @param {Object} svc Service being executed
         * @param {Object} params Parameters
         * @param {String} params.url The URL to override the original set on the Service Profile.
         * @param {String} params.httpMethod The HTTP method set on the request
         * @param {Array<headers>} params.headers Array containing all the necessary headers for the request
         * @returns {Object} Request object to give to the execute method.
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
    }
};

/**
 * @typedef price
 * @type {Object}
 * @property {String} amount Transaction amount.
 * @property {String} currencyCode Transaction currency code in ISO 4217 format. Example: USD.
 */
/**
 * @typedef headers
 * @type {Object}
 * @property {String} entry
 * @property {String} val
 */

module.exports = amazonRefundServiceCallback;
