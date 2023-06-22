'use strict';

/**
 * This module implement the callback to be used when calling the service.
 * @module amazonChargeServiceCallback
 */

var preferences = require('dw/system/Site').getCurrent().getPreferences();

var amazonChargeServiceCallback = {
    /**
     * You can create a Charge to authorize payment, if you have a Charge Permission in a Chargeable state.
     */
    create: {
        /**
         * Creates a request object to be used when calling the service
         * @param {Service} svc Service being executed
         * @param {Object} params Parameters
         * @param {string} params.url The URL to override the original set on the Service Profile. This url contains the checkout session id on the path param.
         * @param {String} params.httpMethod The HTTP method set on the request
         * @param {Array<headers>} params.headers All the necessary headers to call the service
         * @param {string} params.payload.chargePermissionId Charge identifier
         * @param {Price} params.payload.chargeAmount Represents the amount to be charged/authorized
         * @param {boolean} params.payload.captureNow Boolean that indicates whether or not Charge should be captured immediately after a successful authorization
         * @param {string} params.payload.idempotencyKey Idempotency key to safely retry requests.
         * @param {string} params.payload.softDescriptor Description shown on the buyer's payment instrument statement.
         * The soft descriptor sent to the payment processor is: 'AMZ* <soft descriptor specified here>'
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
        /**
         * Creates a response object from a successful service call.
         * Use this operation to determine if authorization or capture was successful.
         * @param {Service} svc Service being executed.
         * @param {Object} response Service-specific response object.
         * @returns {Object} Object to return in the service call's Result.
         */
        parseResponse: function (svc, response) {
            return response.text;
        },
        filterLogMessage: function (msg) {
            return msg;
        },
        mockCall: function (svc, params) {
            var key = preferences.custom.amazonAuthorizationKey;

            svc.setRequestMethod('POST');

            svc.addHeader('x-amz-pay-idempotency-key', key);
            svc.addHeader('authorization', key);

            var mockedResponse = {
                chargeId: 'P21-1111111-1111111-C111111',
                chargePermissionId: 'P21-1111111-1111111',
                chargeAmount: {
                    amount: '14.00',
                    currencyCode: 'USD'
                },
                captureAmount: {
                    amount: '14.00',
                    currencyCode: 'USD'
                },
                refundedAmount: {
                    amount: '0.00',
                    currencyCode: 'USD'
                },
                softDescriptor: 'SOFT_DESCRIPTOR',
                providerMetadata: {
                    providerReferenceId: null
                },
                statusDetails: {
                    state: 'Captured',
                    reasonCode: null,
                    reasonDescription: null,
                    lastUpdatedTimestamp: '20190714T155300Z'
                },
                creationTimestamp: '20190714T155300Z',
                expirationTimestamp: '20190715T155300Z',
                params: params
            };
            return JSON.stringify(mockedResponse);
        }
    },
    /**
     * Get Charge details such as charge amount and authorization state.
     */
    get: {
        /**
         * Creates a request object to be used when calling the service
         * @param {Service} svc Service being executed
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
        /**
         * Creates a response object from a successful service call.
         * @param {Service} svc Service being executed.
         * @param {Object} response Service-specific response object.
         * @returns {Object} Object to return in the service call's Result.
         */
        parseResponse: function (svc, response) {
            return response.text;
        },
        filterLogMessage: function (msg) {
            return msg;
        },
        mockCall: function (svc, params) {
            var key = preferences.custom.amazonAuthorizationKey;

            svc.setRequestMethod('GET');

            svc.addHeader('authorization', key);

            var mockedResponse = {
                chargeId: 'P21-1111111-1111111-C111111',
                chargePermissionId: 'P21-1111111-1111111',
                chargeAmount: {
                    amount: '14.00',
                    currencyCode: 'USD'
                },
                captureAmount: {
                    amount: '14.00',
                    currencyCode: 'USD'
                },
                refundedAmount: {
                    amount: '0.00',
                    currencyCode: 'USD'
                },
                softDescriptor: 'SOFT_DESCRIPTOR',
                providerMetadata: {
                    providerReferenceId: null
                },
                statusDetails: {
                    state: 'Captured',
                    reasonCode: null,
                    reasonDescription: null,
                    lastUpdatedTimestamp: '20190714T155300Z'
                },
                creationTimestamp: '20190714T155300Z',
                expirationTimestamp: '20190715T155300Z',
                params: params
            };
            return JSON.stringify(mockedResponse);
        }
    },
    /**
     * Capture payment on a Charge in the Authorized state.
     * A successful Capture will move the Charge from Authorized to Captured state.
     * The Captured state may be preceded by a temporary CaptureInitiated state if payment was captured more than 7 days after authorization.
     */
    capture: {
        /**
         * Creates a request object to be used when calling the service
         * @param {Service} svc Service being executed
         * @param {Object} params Parameters
         * @param {String} params.url The URL to override the original set on the Service Profile.
         * @param {String} params.httpMethod The HTTP method set on the request
         * @param {Array<headers>} params.headers Array containing all the necessary headers for the request
         * @param {Object} params.payload Payload
         * @param {Object} params.payload.captureAmount Amount to capture.
         * @param {string} params.softDescriptor Description shown on the buyer's payment instrument statement.
         * The soft descriptor sent to the payment processor is: 'AMZ* <soft descriptor specified here>'
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
        /**
         * Creates a response object from a successful service call.
         * @param {Service} svc Service being executed.
         * @param {Object} response Service-specific response object.
         * @returns {Object} Object to return in the service call's Result.
         */
        parseResponse: function (svc, response) {
            return response.text;
        },
        filterLogMessage: function (msg) {
            return msg;
        },
        mockCall: function (svc, params) {
            var key = preferences.custom.amazonAuthorizationKey;

            svc.setRequestMethod('GET');

            svc.addHeader('authorization', key);

            var mockedResponse = {
                chargeId: 'P21-1111111-1111111-C111111',
                chargePermissionId: 'P21-1111111-1111111',
                chargeAmount: {
                    amount: '14.00',
                    currencyCode: 'USD'
                },
                captureAmount: {
                    amount: '14.00',
                    currencyCode: 'USD'
                },
                refundedAmount: {
                    amount: '0.00',
                    currencyCode: 'USD'
                },
                softDescriptor: 'SOFT_DESCRIPTOR',
                providerMetadata: {
                    providerReferenceId: null
                },
                statusDetails: {
                    state: 'Captured',
                    reasonCode: null,
                    reasonDescription: null,
                    lastUpdatedTimestamp: '20190714T155300Z'
                },
                creationTimestamp: '20190714T155300Z',
                expirationTimestamp: '20190715T155300Z',
                params: params
            };
            return JSON.stringify(mockedResponse);
        }
    },
    cancel: {
        /**
         * Creates a request object to be used when calling the service
         * @param {Service} svc Service being executed
         * @param {Object} params Parameters
         * @param {String} params.url The URL to override the original set on the Service Profile.
         * @param {String} params.httpMethod The HTTP method set on the request
         * @param {Array<headers>} params.headers Array containing all the necessary headers for the request
         * @param {Object} params.payload Payload
         * @param {string} params.payload.cancellationReason Merchant-provided reason for canceling Charge.
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
        /**
         * Creates a response object from a successful service call.
         * @param {Service} svc Service being executed.
         * @param {Object} response Service-specific response object.
         * @returns {Object} Object to return in the service call's Result.
         */
        parseResponse: function (svc, response) {
            return response.text;
        },
        filterLogMessage: function (msg) {
            return msg;
        },
        mockCall: function (svc, params) {
            var key = preferences.custom.amazonAuthorizationKey;

            svc.setRequestMethod('DELETE');

            svc.addHeader('authorization', key);

            var mockedResponse = {
                chargeId: 'P21-1111111-1111111-C111111',
                chargePermissionId: 'P21-1111111-1111111',
                chargeAmount: {
                    amount: '14.00',
                    currencyCode: 'USD'
                },
                captureAmount: {
                    amount: '14.00',
                    currencyCode: 'USD'
                },
                refundedAmount: {
                    amount: '0.00',
                    currencyCode: 'USD'
                },
                softDescriptor: 'SOFT DESCRIPTOR',
                providerMetadata: {
                    providerReferenceId: null
                },
                statusDetails: {
                    state: 'Canceled',
                    reasonCode: null,
                    reasonDescription: null,
                    lastUpdatedTimestamp: '20190714T155300Z'
                },
                creationTimestamp: '20190714T155300Z',
                expirationTimestamp: '20190715T155300Z',
                params: params
            };
            return JSON.stringify(mockedResponse);
        }
    }
};

/**
 * @typedef headers
 * @type {Object}
 * @property {String} entry
 * @property {String} val
 */

module.exports = amazonChargeServiceCallback;
