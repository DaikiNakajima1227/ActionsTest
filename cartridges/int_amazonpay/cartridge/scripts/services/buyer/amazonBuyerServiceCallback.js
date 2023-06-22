'use strict';

/**
 * This module implement the callback to be used when calling the service.
 * @module amazonBuyerServiceCallback
 */

var preferences = require('dw/system/Site').getCurrent().getPreferences();

var amazonBuyerServiceCallback = {
    /**
     * Get Buyer info such as buyerId, phone number, shipping address.
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
                name: 'John Example',
                email: 'johnexample@amazon.com',
                postalCode: '12345',
                countryCode: 'US',
                buyerId: 'DIRECTEDBUYERID',
                phoneNumber: '1234567811', // default billing address phone number
                shippingAddress: {
                    name: 'John',
                    addressLine1: '15th Street',
                    addressLine2: '',
                    addressLine3: '',
                    city: 'Seattle',
                    county: '',
                    district: '',
                    stateOrRegion: 'WA',
                    country: 'USA',
                    postalCode: '98121',
                    phoneNumber: '1234567899'
                },
                billingAddress: null,
                primeMembershipTypes: null,
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

module.exports = amazonBuyerServiceCallback;
