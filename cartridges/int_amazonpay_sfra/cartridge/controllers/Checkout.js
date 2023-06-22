'use strict';

var server = require('server');
server.extend(module.superModule);

var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var ArrayList = require('dw/util/ArrayList');
var collections = require('*/cartridge/scripts/util/collections');

var AMAZON_SFRA_6_1_0_ENABLED = require('dw/system/Site').getCurrent().getCustomPreferenceValue("enableSFRAv6_1_0");

if (AMAZON_SFRA_6_1_0_ENABLED !== true) {
    server.prepend(
        'Login',
        server.middleware.https,
        consentTracking.consent,
        csrfProtection.generateToken,
        function (req, res, next) {
            var BasketMgr = require('dw/order/BasketMgr');
            var Transaction = require('dw/system/Transaction');

            var currentBasket = BasketMgr.getCurrentBasket();
            var checkoutSessionId = currentBasket.custom.amzPayCheckoutSessionId;
            var redirectUrl = currentBasket.custom.amzPayRedirectURL;

            if (redirectUrl !== null && checkoutSessionId != null) {
                var paymentInstruments = currentBasket.getPaymentInstruments('AMAZON_PAY');

                Transaction.wrap(function () {
                    currentBasket.custom.amzPayRedirectURL = null;

                    collections.forEach(paymentInstruments, function (item) {
                        currentBasket.removePaymentInstrument(item);
                    });
                });
            }

            COHelpers.prepareShippingForm(currentBasket);
            COHelpers.prepareBillingForm(currentBasket);

            return next();
        }
    );

    server.append(
        'Login',
        server.middleware.https,
        consentTracking.consent,
        csrfProtection.generateToken,
        function (req, res, next) {
            var Resource = require('dw/web/Resource');
            var viewData = res.getViewData();
            var query = req.querystring;

            if (query.amzError) {
                viewData.amzError = true;
                viewData.errorMessage = Resource.msg('error.message.' + query.errorMessage, 'amazon', null);
            }

            // redirect the customer to the Checkout-Begin page after a successfull login
            session.custom.amzSignInRedirect = '2';

            res.setViewData(viewData);
            return next();
        }
    );
}

server.prepend(
    'Begin',
    server.middleware.https,
    consentTracking.consent,
    csrfProtection.generateToken,
    function (req, res, next) {
        var BasketMgr = require('dw/order/BasketMgr');
        var Transaction = require('dw/system/Transaction');
        if (AMAZON_SFRA_6_1_0_ENABLED) {
            var Resource = require('dw/web/Resource');
        }
        var AccountModel = require('*/cartridge/models/account');
        var OrderModel = require('*/cartridge/models/order');
        var URLUtils = require('dw/web/URLUtils');
        var reportingUrlsHelper = require('*/cartridge/scripts/reportingUrls');
        var Locale = require('dw/util/Locale');
        var Logger = require('dw/system/Logger');
        var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');
        var AmazonPayRequest = require('*/cartridge/scripts/lib/AmazonPayRequest');
        var CheckoutSessionService = require('*/cartridge/scripts/services/checkoutSession/amazonCheckoutSessionService');

        var currentBasket = BasketMgr.getCurrentBasket();
        var validatedProducts = validationHelpers.validateProducts(currentBasket);

        if (!currentBasket || validatedProducts.error) {
            res.redirect(URLUtils.url('Cart-Show'));
            return next();
        }

        if (AMAZON_SFRA_6_1_0_ENABLED) {
            var requestStage = req.querystring.stage;
            var currentStage = requestStage || 'customer';

            // OPERATIONS INSIDE THIS "IF" STATEMENT, DO WHAT CHECKOUT-LOGIN WAS DOING BEFORE
            if (currentStage === 'customer') {
                var checkoutSessionId = currentBasket.custom.amzPayCheckoutSessionId;
                var redirectUrl = currentBasket.custom.amzPayRedirectURL;

                if (redirectUrl !== null && checkoutSessionId !== null) {
                    var paymentInstruments = currentBasket.getPaymentInstruments('AMAZON_PAY');

                    Transaction.wrap(function () {
                        currentBasket.custom.amzPayRedirectURL = null;
                        currentBasket.custom.amzPayCheckoutSessionId = null;

                        collections.forEach(paymentInstruments, function (item) {
                            currentBasket.removePaymentInstrument(item);
                        });
                    });
                }

                COHelpers.prepareShippingForm();
                COHelpers.prepareBillingForm();
            }
        }

        var isAmazonCheckout = currentBasket.custom.amzPayCheckoutSessionId && currentBasket.custom.amzPayRedirectURL ? true : false;

        if (AMAZON_SFRA_6_1_0_ENABLED !== true) {
            var currentStage = req.querystring.stage ? req.querystring.stage : 'shipping';
        }

        var billingAddress = currentBasket.billingAddress;
        var currentCustomer = req.currentCustomer.raw;
        var currentLocale = Locale.getLocale(req.locale.id);
        var preferredAddress;

        // only true if customer is registered
        if (req.currentCustomer.addressBook && req.currentCustomer.addressBook.preferredAddress) {
            var shipments = currentBasket.shipments;
            preferredAddress = req.currentCustomer.addressBook.preferredAddress;

            collections.forEach(shipments, function (shipment) {
                if (!shipment.shippingAddress) {
                    COHelpers.copyCustomerAddressToShipment(preferredAddress, shipment);
                }
            });

            if (!billingAddress) {
                COHelpers.copyCustomerAddressToBilling(preferredAddress);
            }
        }

        // Calculate the basket
        Transaction.wrap(function () {
            COHelpers.ensureNoEmptyShipments(req);
        });

        if (currentBasket.shipments.length <= 1) {
            req.session.privacyCache.set('usingMultiShipping', false);
        }

        if (currentBasket.currencyCode !== req.session.currency.currencyCode) {
            Transaction.wrap(function () {
                currentBasket.updateCurrency();
            });
        }

        COHelpers.recalculateBasket(currentBasket);

        if (AMAZON_SFRA_6_1_0_ENABLED) {
            var guestCustomerForm = COHelpers.prepareCustomerForm('coCustomer');
            var registeredCustomerForm = COHelpers.prepareCustomerForm('coRegisteredCustomer');
            var shippingForm = COHelpers.prepareShippingForm();
            var billingForm = COHelpers.prepareBillingForm();
        } else {
            var shippingForm = COHelpers.prepareShippingForm(currentBasket);
            var billingForm = COHelpers.prepareBillingForm(currentBasket);
        }

        var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');

        if (isAmazonCheckout) {
            var amazonPayRequest = new AmazonPayRequest(currentBasket, 'GET', '', ':checkoutSessionId', currentBasket.custom.amzPayCheckoutSessionId);
            var result = CheckoutSessionService.get(amazonPayRequest);
            var checkoutSession;

            try {
                checkoutSession = JSON.parse(result.object);
            } catch (error) {
                Logger.getLogger('AmazonPay', 'AmazonPay-CheckoutSession').error(error.toString());
                res.redirect(URLUtils.url('Cart-Show', 'amzError', true, 'errorMessage', 'service.fail').toString());

                return next();
            }

            var amzShippingAddress = checkoutSession.shippingAddress;
            var stateOrRegion = !empty(amzShippingAddress) && !empty(amzShippingAddress.stateOrRegion) ? amzShippingAddress.stateOrRegion : '';

            var map = new ArrayList();

            map.add({
                checked: true,
                htmlValue: stateOrRegion,
                id: stateOrRegion,
                label: stateOrRegion,
                selected: true,
                value: stateOrRegion
            });

            shippingForm.shippingAddress.addressFields.states.stateCode.options = map;
        }

        if (!isAmazonCheckout && preferredAddress) {
            shippingForm.copyFrom(preferredAddress);
            billingForm.copyFrom(preferredAddress);
        }

        // Loop through all shipments and make sure all are valid
        var allValid = COHelpers.ensureValidShipments(currentBasket);

        var orderModel = new OrderModel(
            currentBasket,
            {
                customer: currentCustomer,
                usingMultiShipping: usingMultiShipping,
                shippable: allValid,
                countryCode: currentLocale.country,
                containerView: 'basket'
            }
        );

        // Get rid of this from top-level ... should be part of OrderModel???
        var currentYear = new Date().getFullYear();
        var creditCardExpirationYears = [];

        for (var j = 0; j < 10; j++) {
            creditCardExpirationYears.push(currentYear + j);
        }

        var accountModel = new AccountModel(req.currentCustomer);

        var reportingURLs;
        reportingURLs = reportingUrlsHelper.getCheckoutReportingURLs(
            currentBasket.UUID,
            2,
            'Shipping'
        );

        if (AMAZON_SFRA_6_1_0_ENABLED) {
            if (currentStage === 'customer') {
                if (accountModel.registeredUser) {
                    // Since the shopper already login upon starting checkout, fast forward to shipping stage
                    currentStage = 'shipping';

                    // Only need to update email address in basket if start checkout from other page like cart or mini-cart
                    // and not on checkout page reload.
                    if (!requestStage) {
                        Transaction.wrap(function () {
                            currentBasket.customerEmail = accountModel.profile.email;
                            orderModel.orderEmail = accountModel.profile.email;
                        });
                    }
                } else if (currentBasket.customerEmail) {
                    // Email address has already collected so fast forward to shipping stage
                    currentStage = 'shipping';
                }
            }

            // Checking if any error about Amazon Sign In
            var viewData = res.getViewData();
            var query = req.querystring;

            if (query.amzError) {
                viewData.amzError = true;
                viewData.errorMessage = Resource.msg('error.message.' + query.errorMessage, 'amazon', null);
            }

            // redirect the customer to the Checkout-Begin page after a successfull login
            session.custom.amzSignInRedirect = '2';
        }

        if (AMAZON_SFRA_6_1_0_ENABLED) {
            res.render('checkout/checkout', {
                order: orderModel,
                customer: accountModel,
                forms: {
                    guestCustomerForm: guestCustomerForm,
                    registeredCustomerForm: registeredCustomerForm,
                    shippingForm: shippingForm,
                    billingForm: billingForm
                },
                expirationYears: creditCardExpirationYears,
                currentStage: currentStage,
                reportingURLs: reportingURLs,
                oAuthReentryEndpoint: 2,
                amzError: viewData.amzError || null,
                errorMessage: viewData.errorMessage || null
            });
        } else {
            res.render('checkout/checkout', {
                order: orderModel,
                customer: accountModel,
                forms: {
                    shippingForm: shippingForm,
                    billingForm: billingForm
                },
                expirationYears: creditCardExpirationYears,
                currentStage: currentStage,
                reportingURLs: reportingURLs
            });
        }

        this.emit('route:Complete', req, res);
        return; // eslint-disable-line consistent-return
    }
);

module.exports = server.exports();
