'use strict';

/**
 * @module amazonChargePermissionServiceCallback
 */

var amazonChargePermissionServiceCallback = {
    get: {
        /**
         * Get Charge Permission to determine if this Charge Permission can be used to charge the buyer.
         * @param {Object} svc Service being executed.
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
    },
    update: {
        /**
         * Update the Charge Permission with your order metadata.
         * Some of the values may be shared with the buyer.
         * @param {Object} svc Service being executed.
         * @param {Object} params Parameters
         * @param {String} params.url The URL to override the original set on the Service Profile.
         * @param {String} params.httpMethod The HTTP method set on the request
         * @param {Array<headers>} params.headers Array containing all the necessary headers for the request
         * @param {Object} params.payload Payload
         * @param {merchantMetadata} params.payload.merchantMetadata Merchant-provided order details
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
    close: {
        /**
         * Moves the Charge Permission to a Closed state.
         * No future charges can be made and pending charges will be canceled if you set cancelPendingCharges to true.
         * @param {Object} svc Service being executed.
         * @param {Object} params Parameters
         * @param {String} params.url The URL to override the original set on the Service Profile.
         * @param {String} params.httpMethod The HTTP method set on the request
         * @param {Array<headers>} params.headers Array containing all the necessary headers for the request
         * @param {Object} params.payload Payload
         * @param {string} params.payload.chargePermissionId Charge Permission identifier
         * @param {string} params.payload.closureReason Merchant-provided reason for closing Charge Permission
         * @param {boolean} params.payload.cancelPendingCharges Boolean for whether pending charges should be canceled
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
    }
};

/**
 * @typedef headers
 * @type {Object}
 * @property {String} entry
 * @property {String} val
 */

module.exports = amazonChargePermissionServiceCallback;
