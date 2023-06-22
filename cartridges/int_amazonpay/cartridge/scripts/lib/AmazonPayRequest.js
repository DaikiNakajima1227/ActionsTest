'use strict';

var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');

var sitePreferences = require('dw/system/Site').getCurrent().getPreferences().getCustom();
var amzPayUtils = require('*/cartridge/scripts/util/amazonPayUtils');

/**
 *
 * @param {dw.order.Basket|dw.order.Order} basket The Basket class represents a shopping cart.
 * @param {httpMethod} httpMethod HTTP method
 * @param {string} url URL tha will be set on the request call
 * @param {string} srchVal A value can search for and replace matches within a string.
 * @param {string} rplcVal A string containing the text to replace for every successful match of searchValue in this string.
 * @param {Object} amount An object containing the amount to be used for charge, refund, etc.
 * @param {Object} close An object containing the variables to perform a closeChargePermission call.
 * @param {Object} update An object containing the variables to perform an update on a recurring order.
 */
function AmazonPayRequest(basket, httpMethod, url, srchVal, rplcVal, amount, close, update) {
    this.amount = amount;
    this.basket = basket;
    this.close = close;
    this.update = update;
    this.captureNow = sitePreferences.amzCaptureNow;
    this.headers = [];
    this.httpMethod = httpMethod;
    this.idempotencyKey = this.httpMethod === 'POST' ? amzPayUtils.generateIdempotencyKey() : '';
    this.rplcVal = rplcVal || '';
    this.srchVal = srchVal || '';
    this.url = url || '';

    /**
     * Normalize URL received.
     * @param {String} url URL to be normalized
     */
    this.normalizeUrl = function normalizeUrl(url) { // eslint-disable-line no-shadow
        if (!url) {
            return;
        }

        var paramsToReplace = [];
        var newURL = url;

        paramsToReplace.push({ srchVal: ':region', rplcVal: sitePreferences.amzPayRegion.value });
        paramsToReplace.push({ srchVal: ':environment', rplcVal: sitePreferences.amzPayEnvironment.value });

        if (srchVal && rplcVal) {
            paramsToReplace.push({ srchVal: this.srchVal, rplcVal: this.rplcVal });
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
        var simulationCode = sitePreferences.amzPaySimulationCode ? sitePreferences.amzPaySimulationCode.split(':') : null;
        var platformId = amzPayUtils.getPlatformId();

        if (this.idempotencyKey) {
            this.headers.push({ entry: 'x-amz-pay-idempotency-key', val: this.idempotencyKey });
        }

        switch (this.srchVal) {
            case ':buyerToken':
                if (this.httpMethod === 'GET') {
                    this.payload = '';
                }
                break;
            case ':checkoutSessionId':
                if (this.httpMethod === 'GET' || this.httpMethod === 'DELETE') {
                    this.payload = '';
                } else if (this.httpMethod === 'PATCH') {
                    this.payload = {
                        webCheckoutDetails: {
                            checkoutReviewReturnUrl:
                                sitePreferences.amzPayCheckoutType.value === 'OneStepCheckout' ?
                                    URLUtils.https('AmazonPay-OneReview').toString() :
                                    URLUtils.https('AmazonPay-Review').toString(),
                            checkoutResultReturnUrl: URLUtils.https('AmazonPay-Result').toString()
                        },
                        paymentDetails: amzPayUtils.getPaymentDetail(this.basket),
                        platformId: platformId,
                        chargePermissionType: amzPayUtils.isRecurringOrder(this.basket) ? 'Recurring' : 'OneTime'
                    };

                    if (this.payload.chargePermissionType === 'Recurring') {
                        this.payload.recurringMetadata = amzPayUtils.getRecurringMetadata(this.basket);
                    }

                    if (simulationCode && simulationCode[0] === 'CheckoutSession') {
                        this.headers.push({ entry: 'x-amz-pay-simulation-code', val: simulationCode[1] });
                    }
                } else if (this.httpMethod === 'POST') {
                    if (sitePreferences.amzPayMultiAuthorization === true && !amzPayUtils.isRecurringOrder(this.basket)) {
                        this.payload = {
                            chargeAmount: amzPayUtils.getPaymentDetail(this.basket).chargeAmount,
                            totalOrderAmount: amzPayUtils.getPaymentDetail(this.basket).totalOrderAmount
                        };
                    } else {
                        this.payload = {
                            chargeAmount: amzPayUtils.getPaymentDetail(this.basket).chargeAmount
                        };
                    }
                }
                break;
            case ':chargePermissionId':
                if (this.httpMethod === 'GET') {
                    this.payload = '';
                } else if (this.httpMethod === 'PATCH') {
                    this.payload = {
                        merchantMetadata: {
                            merchantReferenceId: this.basket.orderNo,
                            merchantStoreName: sitePreferences.amzPayMerchantName || '',
                            noteToBuyer: sitePreferences.amzPayNoteToBuyer || '',
                            customInformation: Resource.msg('amazon.cartridge.version', 'amazon', null)
                        }
                    };

                    if (!empty(this.update)) {
                        this.payload.recurringMetadata = !empty(this.update) ? this.update : '';
                    }
                } else if (this.httpMethod === 'DELETE') {
                    this.payload = {
                        closureReason: !empty(this.close) && !empty(this.close.closureReason) ? this.close.closureReason : 'No more charges required',
                        cancelPendingCharges: !empty(this.close) && !empty(this.close.cancelPendingCharges) ? this.close.cancelPendingCharges : false
                    };

                    if (simulationCode && (simulationCode[0] === 'ChargePermission' || simulationCode[0] === 'Charge')) {
                        this.headers.push({ entry: 'x-amz-pay-simulation-code', val: simulationCode[1] });
                    }
                }
                break;
            case ':chargeId':
                if (this.httpMethod === 'GET') {
                    this.payload = '';
                } else if (this.httpMethod === 'DELETE') {
                    this.payload = {
                        cancellationReason: 'REASON DESCRIPTION' // change this to a value from BM
                    };
                } else {
                    this.payload = {
                        captureAmount: this.amount ? this.amount : amzPayUtils.getPaymentDetail(this.basket).chargeAmount,
                        softDescriptor: !empty(sitePreferences.amzPayCaptureDescriptor) ? sitePreferences.amzPayCaptureDescriptor.substr(0, 16) : null
                    };
                }
                if (simulationCode && simulationCode[0] === 'Charge') {
                    this.headers.push({ entry: 'x-amz-pay-simulation-code', val: simulationCode[1] });
                }
                break;
            case ':refundId':
                if (this.httpMethod === 'GET') {
                    this.payload = '';
                }
                break;
            default:
                if (this.url.indexOf('checkoutSession') !== -1) {
                    this.payload = {
                        webCheckoutDetails: {
                            checkoutReviewReturnUrl: sitePreferences.amzPayCheckoutType.value === 'OneStepCheckout' ?
                                URLUtils.https('AmazonPay-OneReview').toString() :
                                URLUtils.https('AmazonPay-Review').toString(),
                            checkoutResultReturnUrl: URLUtils.https('AmazonPay-Result').toString()
                        },
                        storeId: sitePreferences.amzPayStoreId,
                        paymentDetails: amzPayUtils.getPaymentDetail(this.basket),
                        chargePermissionType: amzPayUtils.isRecurringOrder(this.basket) ? 'Recurring' : 'OneTime'
                    };

                    if (this.payload.chargePermissionType === 'Recurring') {
                        this.payload.recurringMetadata = amzPayUtils.getRecurringMetadata(this.basket);
                    }

                    if (this.httpMethod === 'POST') {
                        // Explicitly define the scope to include the billingAddress on the Complete Checkout response
                        this.payload.scopes = ['name', 'email', 'phoneNumber', 'billingAddress'];

                        // If region is EU, then we add presentmentCurrency for multi-currency
                        if (sitePreferences.amzPayRegion.value === 'eu') {
                            this.payload.paymentDetails.presentmentCurrency = amzPayUtils.getPaymentDetail(this.basket).chargeAmount.currencyCode;
                        }
                    }
                } else if (this.url.indexOf('charges') !== -1) {
                    if (this.captureNow) {
                        this.payload = {
                            chargePermissionId: this.rplcVal,
                            chargeAmount: this.amount ? this.amount : amzPayUtils.getPaymentDetail(this.basket).chargeAmount,
                            captureNow: this.captureNow, // default is false
                            softDescriptor: !empty(sitePreferences.amzPayCaptureDescriptor) ? sitePreferences.amzPayCaptureDescriptor.substr(0, 16) : null, // Do not set this value if CaptureNow is set to false
                            canHandlePendingAuthorization: sitePreferences.amzPayCanHandlePendingAuthorization
                        };
                    } else {
                        this.payload = {
                            chargePermissionId: this.rplcVal,
                            chargeAmount: this.amount ? this.amount : amzPayUtils.getPaymentDetail(this.basket).chargeAmount,
                            captureNow: this.captureNow, // default is false
                            canHandlePendingAuthorization: sitePreferences.amzPayCanHandlePendingAuthorization
                        };
                    }
                    if (simulationCode && simulationCode[0] === 'Charge') {
                        this.headers.push({ entry: 'x-amz-pay-simulation-code', val: simulationCode[1] });
                    }
                } else if (this.url.indexOf('refunds') !== -1) {
                    this.payload = {
                        chargeId: this.rplcVal, // change logic to set this value easily
                        refundAmount: this.amount ? this.amount : amzPayUtils.getPaymentDetail(this.basket).chargeAmount,
                        softDescriptor: !empty(sitePreferences.amzPayRefundDescriptor) ? sitePreferences.amzPayRefundDescriptor.substr(0, 16) : null
                    };
                }
                break;
        }

        this.payload = typeof this.payload === 'string' ? this.payload : JSON.stringify(this.payload);

        this.headers = amzPayUtils.generatePreSignedHeaders(this.headers);

        this.headers.push({ entry: 'authorization', val: amzPayUtils.generateAuthorizationHeader(this.httpMethod, this.url, this.payload, '', this.headers) });
        // dw.system.Logger.getLogger('AmazonPay', 'AmazonPayRequest').error(JSON.stringify(this.headers));
    };
}
AmazonPayRequest.prototype.type = 'AmazonPayRequest';

/**
 * @typedef {'POST'|'GET'|'PATCH'|'DELETE'} httpMethod
 */
/**
 * @typedef {':checkoutSessionId'|':chargePermissionId'|':chargeId'|':refundId'|''} srchVal
 */
module.exports = AmazonPayRequest;
