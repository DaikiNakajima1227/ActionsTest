'use strict';

var server = require('server');

var BasketMgr = require('dw/order/BasketMgr');
var Logger = require('dw/system/Logger');
var Transaction = require('dw/system/Transaction');
var URLUtils = require('dw/web/URLUtils');
var Resource = require('dw/web/Resource');
var HookMgr = require('dw/system/HookMgr');
var PaymentMgr = require('dw/order/PaymentMgr');

var AmazonPayRequest = require('*/cartridge/scripts/lib/AmazonPayRequest');

var ChargePermissionService = require('*/cartridge/scripts/services/chargePermission/amazonChargePermissionService');
var ChargeService = require('*/cartridge/scripts/services/charge/amazonChargeService');
var CheckoutSessionService = require('*/cartridge/scripts/services/checkoutSession/amazonCheckoutSessionService');
var BuyerService = require('*/cartridge/scripts/services/buyer/amazonBuyerService');

var sitePreferences = require('dw/system/Site').getCurrent().getPreferences().getCustom();

var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var accountHelpers = require('*/cartridge/scripts/helpers/accountHelpers');

function resRedirecter(res, msg) {
    res.redirect(URLUtils.url('Cart-Show', 'amzError', 'true', 'errorMessage', msg).toString());
}

server.get('Login', server.middleware.https, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');

    var buyer;
    var result;
    var amazonPayRequest;
    var buyerToken = req.querystring.buyerToken;
    var target = session.custom.amzSignInRedirect || '1';
    var errorURL;

    if (sitePreferences.enableSFRAv6_1_0) {
        errorURL = target == '1' ? 'Login-Show' : 'Checkout-Begin';
    } else {
        errorURL = target == '1' ? 'Login-Show' : 'Checkout-Login';
    }

    delete session.custom.amzSignInRedirect;

    amazonPayRequest = new AmazonPayRequest(null, 'GET', '', ':buyerToken', buyerToken, null, null, null);
    result = BuyerService.get(amazonPayRequest);

    if (!result.ok) {
        res.redirect(URLUtils.https(errorURL, 'amzError', 'true', 'errorMessage', 'sign.in.service.fail'));

        return next();
    }

    try {
        buyer = JSON.parse(result.object);
    } catch (error) {
        Logger.getLogger('AmazonPay', 'AmazonPay-Login').error(error);
        res.redirect(URLUtils.https(errorURL, 'amzError', 'true', 'errorMessage', 'sign.in.service.fail'));

        return next();
    }

    var formattedName = buyer.name.replace(/\s+/g, ' ');
    var names = formattedName.split(' ');
    var firstName = '';
    var lastName = '';

    names.forEach(function (n, i, a) {
        if (i === 0) {
            firstName = n;
        } else {
            lastName = lastName + n + (i + 1 < a.length ? ' ' : '');
        }
    });

    if (empty(lastName) && buyer.countryCode !== 'JP') {
        lastName = '-';
    }

    if (buyer.countryCode === 'JP') {
        var initialLastNameJP = lastName;
        lastName = !initialLastNameJP ? firstName + '-' : firstName;
        firstName = initialLastNameJP;
    }

    var amazonCustomer = {
        email: buyer.email,
        firstName: firstName,
        lastName: lastName,
        phone: buyer.phoneNumber,
        buyerId: buyer.buyerId,
        rurl: target
    };

    var amzBillingAddress = !empty(buyer.billingAddress) ? buyer.billingAddress : null;
    var amzShippingAddress = buyer.shippingAddress;
    var shipping = server.forms.getForm('shipping');
    var billing = server.forms.getForm('billing');

    shipping.clear();
    billing.clear();

    var address1 = '';
    var address2 = '';

    if (!empty(buyer.shippingAddress)) {
        if (empty(amzShippingAddress.addressLine1) && !empty(amzShippingAddress.addressLine2)) {
            address1 = amzShippingAddress.addressLine2;
            address2 = !empty(amzShippingAddress.addressLine3) ? amzShippingAddress.addressLine3 : '';
        } else {
            address1 = amzShippingAddress.addressLine1;
            address2 = amzShippingAddress.addressLine2;
        }

        address2 = !empty(amzShippingAddress.addressLine3) ? address2 + ' ' + amzShippingAddress.addressLine3 : address2;
    }

    amazonCustomer.shippingAddress = {
        firstName: firstName,
        lastName: lastName,
        address1: address1,
        address2: address2,
        addressId: address1,
        countryCode: {
            value: amzShippingAddress.countryCode
        },
        postalCode: amzShippingAddress.postalCode,
        phone: amzShippingAddress.phoneNumber
    };

    var stateOrRegion = !empty(amzShippingAddress.stateOrRegion) ? amzShippingAddress.stateOrRegion : '';

    if (Object.prototype.hasOwnProperty.call(shipping.shippingAddress.addressFields, 'states')) {
        amazonCustomer.shippingAddress.stateCode = stateOrRegion;
    }

    if (Object.prototype.hasOwnProperty.call(shipping.shippingAddress.addressFields, 'city')) {
        if (!empty(amzShippingAddress.city)) {
            amazonCustomer.shippingAddress.city = amzShippingAddress.city;
        } else if (empty(amzShippingAddress.city) && !empty(amazonCustomer.shippingAddress.address1)) {
            amazonCustomer.shippingAddress.city = amazonCustomer.shippingAddress.address1;
            amazonCustomer.shippingAddress.address1 = amazonCustomer.shippingAddress.address2 ? amazonCustomer.shippingAddress.address2 : '--';
            amazonCustomer.shippingAddress.address2 = !empty(amzShippingAddress.addressLine3) ? amzShippingAddress.addressLine3 : '';
        } else if (empty(amzShippingAddress.city) && empty(amazonCustomer.shippingAddress.address1)) {
            amazonCustomer.shippingAddress.city = '--';
        }
    }

    if (!empty(buyer.billingAddress)) {
        var formattedBillingName = amzBillingAddress.name.replace(/\s+/g, ' ');
        var billingNames = formattedBillingName.split(' ');
        var firstNameBilling = '';
        var lastNameBilling = '';

        billingNames.forEach(function (n, i, a) {
            if (i === 0) {
                firstNameBilling = n;
            } else {
                lastNameBilling = lastNameBilling + n + (i + 1 < a.length ? ' ' : '');
            }
        });

        if (empty(lastNameBilling) && amzBillingAddress.countryCode !== 'JP') {
            lastNameBilling = '-';
        }

        if (amzBillingAddress.countryCode === 'JP') {
            var initialBillingLastNameJP = lastNameBilling;
            lastNameBilling = !initialBillingLastNameJP ? firstNameBilling + '-' : firstNameBilling;
            firstNameBilling = initialBillingLastNameJP;
        }

        if (empty(amzBillingAddress.addressLine1) && !empty(amzBillingAddress.addressLine2)) {
            address1 = amzBillingAddress.addressLine2;
            address2 = !empty(amzBillingAddress.addressLine3) ? amzBillingAddress.addressLine3 : '';
        } else {
            address1 = amzBillingAddress.addressLine1;
            address2 = amzBillingAddress.addressLine2;
        }

        address2 = !empty(amzBillingAddress.addressLine3) ? address2 + ' ' + amzBillingAddress.addressLine3 : address2;

        amazonCustomer.billingAddress = {
            firstName: firstNameBilling,
            lastName: lastNameBilling,
            address1: address1,
            address2: address2,
            addressId: address1,
            city: amzBillingAddress.city,
            countryCode: {
                value: amzBillingAddress.countryCode
            },
            stateCode: amzBillingAddress.stateOrRegion,
            postalCode: amzBillingAddress.postalCode,
            phone: amzBillingAddress.phoneNumber || amzShippingAddress.phoneNumber
        };

        stateOrRegion = !empty(amzBillingAddress.stateOrRegion) ? amzBillingAddress.stateOrRegion : '';

        if (Object.prototype.hasOwnProperty.call(billing.addressFields, 'states')) {
            amazonCustomer.billingAddress.stateCode = stateOrRegion;
        }

        if (Object.prototype.hasOwnProperty.call(billing.addressFields, 'city')) {
            if (!empty(amzBillingAddress.city)) {
                amazonCustomer.billingAddress.city = amzBillingAddress.city;
            } else if (empty(amzBillingAddress.city) && !empty(amazonCustomer.billingAddress.address1)) {
                amazonCustomer.billingAddress.city = amazonCustomer.billingAddress.address1;
                amazonCustomer.billingAddress.address1 = amazonCustomer.billingAddress.address2 ? amazonCustomer.billingAddress.address2 : '--';
                amazonCustomer.billingAddress.address2 = !empty(amzBillingAddress.addressLine3) ? amzBillingAddress.addressLine3 : '';
            } else if (empty(amzBillingAddress.city) && empty(amazonCustomer.billingAddress.address1)) {
                amazonCustomer.billingAddress.city = '--';
            }
        }
    }

    // save amazon customer on privacy session
    session.privacy.amazonCustomer = JSON.stringify(amazonCustomer);

    // externally authenticate customer
    var authenticationProviderId = 'AmazonPay';
    var externalId = buyer.buyerId;
    var externalProfile = null;
    var newCustomer = false;

    try {
        Transaction.wrap(function () {
            externalProfile = CustomerMgr.loginExternallyAuthenticatedCustomer(authenticationProviderId, externalId, false);
        });

        if (empty(externalProfile)) {
            var customer = CustomerMgr.getCustomerByLogin(buyer.email);

            // create customer account and login
            if (empty(customer)) {
                var UUIDUtils = require('dw/util/UUIDUtils');

                try {
                    Transaction.wrap(function () {
                        customer = CustomerMgr.createCustomer(buyer.email, UUIDUtils.createUUID().concat("APv2!"));
                        customer.createExternalProfile(authenticationProviderId, externalId);

                        externalProfile = CustomerMgr.loginExternallyAuthenticatedCustomer(authenticationProviderId, externalId, false);

                        var amazonProfile = externalProfile.getProfile();

                        if (!empty(amazonProfile)) {
                            amazonProfile.setFirstName(amazonCustomer.firstName);
                            amazonProfile.setLastName(amazonCustomer.lastName);
                            amazonProfile.setPhoneHome(amazonCustomer.phone);
                            amazonProfile.setEmail(amazonCustomer.email);

                            var addressBook = amazonProfile.getAddressBook();

                            if (!empty(amazonCustomer.shippingAddress)) {
                                var shippingAddress = addressBook.createAddress(amazonCustomer.shippingAddress.addressId);

                                shippingAddress.setFirstName(amazonCustomer.firstName);
                                shippingAddress.setLastName(amazonCustomer.lastName);
                                shippingAddress.setPhone(amazonCustomer.phone);
                                shippingAddress.setAddress1(amazonCustomer.shippingAddress.address1);
                                shippingAddress.setAddress2(amazonCustomer.shippingAddress.address2);
                                shippingAddress.setCity(amazonCustomer.shippingAddress.city);
                                shippingAddress.setCountryCode(amazonCustomer.shippingAddress.countryCode.value);
                                shippingAddress.setStateCode(amazonCustomer.shippingAddress.stateCode);
                                shippingAddress.setPostalCode(amazonCustomer.shippingAddress.postalCode);
                            }

                            if (!empty(amazonCustomer.billingAddress)) {
                                var billingAddress = addressBook.createAddress(amazonCustomer.billingAddress.addressId);

                                billingAddress.setFirstName(amazonCustomer.firstName);
                                billingAddress.setLastName(amazonCustomer.lastName);
                                billingAddress.setPhone(amazonCustomer.phone);
                                billingAddress.setAddress1(amazonCustomer.billingAddress.address1);
                                billingAddress.setAddress2(amazonCustomer.billingAddress.address2);
                                billingAddress.setCity(amazonCustomer.billingAddress.city);
                                billingAddress.setCountryCode(amazonCustomer.billingAddress.countryCode.value);
                                billingAddress.setStateCode(amazonCustomer.billingAddress.stateCode);
                                billingAddress.setPostalCode(amazonCustomer.billingAddress.postalCode);
                            }
                        }

                        newCustomer = true;
                    });

                    // send a registration email
                    accountHelpers.sendCreateAccountEmail(externalProfile.profile);
                } catch (error) {
                    Logger.getLogger('AmazonPay', 'AmazonPay-Login').error(error);
                    res.redirect(URLUtils.https(errorURL, 'amzError', 'true', 'errorMessage', 'unable.to.create.account'));

                    return next();
                }
            } else {
                // request user password for the SFCC account
                res.render('account/amazonConfirmPassword');

                return next();
            }
        }
    } catch (error) {
        Logger.getLogger('AmazonPay', 'AmazonPay-Login').error(error);
        res.redirect(URLUtils.https(errorURL, 'amzError', 'true', 'errorMessage', 'sign.in.service.fail'));

        return next();
    }

    if (empty(externalProfile)) {
        Logger.getLogger('AmazonPay', 'AmazonPay-Login').error('Empty external profile');
        res.redirect(URLUtils.https(errorURL, 'amzError', 'true', 'errorMessage', 'sign.in.service.fail'));

        return next();
    }

    res.redirect(accountHelpers.getLoginRedirectURL(target, req.session.privacyCache, newCustomer, amazonCustomer));
    req.session.privacyCache.set('args', null);

    return next();
});

server.post('VerifyPassword', server.middleware.https, function (req, res, next) {
    var CustomerMgr = require('dw/customer/CustomerMgr');
    var AuthenticationStatus = require('dw/customer/AuthenticationStatus');

    var amazonCustomer = JSON.parse(session.privacy.amazonCustomer);
    var password = req.form.loginPassword;
    var externalProfile = null;
    var errorURL;
    var target = amazonCustomer.rurl || '1';

    if (sitePreferences.enableSFRAv6_1_0) {
        errorURL = amazonCustomer.rurl == '1' ? 'Login-Show' : 'Checkout-Begin';
    } else {
        errorURL = amazonCustomer.rurl == '1' ? 'Login-Show' : 'Checkout-Login';
    }

    if (CustomerMgr.authenticateCustomer(amazonCustomer.email, password).getStatus() === AuthenticationStatus.AUTH_OK) {
        var customer = CustomerMgr.getCustomerByLogin(amazonCustomer.email);

        // Link Amazon account to existing SFCC account
        if (customer) {
            Transaction.wrap(function () {
                customer.createExternalProfile("AmazonPay", amazonCustomer.buyerId);
                externalProfile = CustomerMgr.loginExternallyAuthenticatedCustomer("AmazonPay", amazonCustomer.buyerId, false);
            });
        }

        if (empty(externalProfile)) {
            Logger.getLogger('AmazonPay', 'AmazonPay-VerifyPassword').error('Empty external profile');
            res.redirect(URLUtils.https(errorURL, 'amzError', 'true', 'errorMessage', 'sign.in.service.fail'));

            return next();
        }

        res.setViewData({ authenticatedCustomer: externalProfile });
        res.json({
            success: true,
            redirectUrl: accountHelpers.getLoginRedirectURL(target, req.session.privacyCache, false)
        });

        req.session.privacyCache.set('args', null);

        return next();
    }

    Logger.getLogger('AmazonPay', 'AmazonPay-VerifyPassword').error('Authentication failed');

    res.json({
        success: true,
        redirectUrl: URLUtils.https(errorURL, 'amzError', 'true', 'errorMessage', 'password.mismatch').toString()
    });

    return next();
});

server.get('PlaceOrder', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();
    var amazonPayRequest;
    var checkoutSession;
    var result;
    var amzPayRedirectURL;

    if (!currentBasket) {
        res.redirect(URLUtils.url('Cart-Show').toString());
        return next();
    }

    amazonPayRequest = new AmazonPayRequest(currentBasket, 'PATCH', '', ':checkoutSessionId', currentBasket.custom.amzPayCheckoutSessionId);
    result = CheckoutSessionService.update(amazonPayRequest);

    if (!result.ok) {
        resRedirecter(res, 'service.fail');

        return next();
    }

    try {
        checkoutSession = JSON.parse(result.object);
    } catch (error) {
        Logger.getLogger('AmazonPay', 'AmazonPay-CheckoutSession').error(error.toString());
        resRedirecter(res, 'service.fail');

        return next();
    }

    Transaction.wrap(function () {
        currentBasket.custom.amzPayCheckoutSessionId = checkoutSession.checkoutSessionId;
    });

    amzPayRedirectURL = currentBasket.custom.amzPayRedirectURL;

    res.redirect(amzPayRedirectURL);

    return next();
});

server.get('GetCheckoutSession', server.middleware.https, function (req, res, next) {
    var currentBasket = BasketMgr.getCurrentBasket();

    res.json({
        checkoutSessionId: currentBasket.custom.amzPayCheckoutSessionId
    });

    return next();
});

server.get('Review', server.middleware.https, function (req, res, next) {
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');

    var currentBasket = BasketMgr.getCurrentBasket();


    if (!currentBasket) {
        resRedirecter(res, 'no.basket');

        return next();
    }

    var validatedProducts = validationHelpers.validateProducts(currentBasket);

    if (validatedProducts.error) {
        resRedirecter(res, 'no.basket');

        return next();
    }

    var viewData = {};
    var amazonCheckoutSessionId = req.querystring.amazonCheckoutSessionId;

    Transaction.wrap(function () {
        currentBasket.custom.amzPayCheckoutSessionId = amazonCheckoutSessionId;
    });

    var amazonPayRequest = new AmazonPayRequest(currentBasket, 'GET', '', ':checkoutSessionId', amazonCheckoutSessionId);
    var result = CheckoutSessionService.get(amazonPayRequest);

    if (!result.ok) {
        resRedirecter(res, 'service.fail');

        return next();
    }

    try {
        var checkoutSession = JSON.parse(result.object);
    } catch (error) {
        Logger.getLogger('AmazonPay', 'AmazonPay-CheckoutSession').error(error.toString());
        resRedirecter(res, 'service.fail');

        return next();
    }

    var amzBillingAddress = !empty(checkoutSession.billingAddress) ? checkoutSession.billingAddress : null;
    var amzShippingAddress = checkoutSession.shippingAddress;
    var shipping = server.forms.getForm('shipping');
    var billing = server.forms.getForm('billing');

    shipping.clear();
    billing.clear();

    var formattedName = amzShippingAddress.name.replace(/\s+/g, ' ');
    var names = formattedName.split(' ');
    var firstName = '';
    var lastName = '';

    names.forEach(function (n, i, a) {
        if (i === 0) {
            firstName = n;
        } else {
            lastName = lastName + n + (i + 1 < a.length ? ' ' : '');
        }
    });

    if (empty(lastName) && amzShippingAddress.countryCode !== 'JP') {
        lastName = '-';
    }

    if (amzShippingAddress.countryCode === 'JP') {
        var initialLastNameJP = lastName;
        lastName = !initialLastNameJP ? firstName + '-' : firstName;
        firstName = initialLastNameJP;
    }

    var address1 = '';
    var address2 = '';

    if (empty(amzShippingAddress.addressLine1) && !empty(amzShippingAddress.addressLine2)) {
        address1 = amzShippingAddress.addressLine2;
        address2 = !empty(amzShippingAddress.addressLine3) ? amzShippingAddress.addressLine3 : '';
    } else {
        address1 = amzShippingAddress.addressLine1;
        address2 = amzShippingAddress.addressLine2;
    }

    address2 = !empty(amzShippingAddress.addressLine3) ? address2 + ' ' + amzShippingAddress.addressLine3 : address2;

    viewData.shippingAddress = {
        firstName: firstName,
        lastName: lastName,
        address1: address1,
        address2: address2,
        addressId: address1,
        countryCode: {
            value: amzShippingAddress.countryCode
        },
        postalCode: amzShippingAddress.postalCode,
        phone: amzShippingAddress.phoneNumber
    };

    var stateOrRegion = !empty(amzShippingAddress.stateOrRegion) ? amzShippingAddress.stateOrRegion : '';

    if (Object.prototype.hasOwnProperty.call(shipping.shippingAddress.addressFields, 'states')) {
        viewData.shippingAddress.stateCode = stateOrRegion;
    }

    if (Object.prototype.hasOwnProperty.call(shipping.shippingAddress.addressFields, 'city')) {
        if (!empty(amzShippingAddress.city)) {
            viewData.shippingAddress.city = amzShippingAddress.city;
        } else if (empty(amzShippingAddress.city) && !empty(viewData.shippingAddress.address1)) {
            viewData.shippingAddress.city = viewData.shippingAddress.address1;
            viewData.shippingAddress.address1 = viewData.shippingAddress.address2 ? viewData.shippingAddress.address2 : '--';
            viewData.shippingAddress.address2 = !empty(amzShippingAddress.addressLine3) ? amzShippingAddress.addressLine3 : '';
        } else if (empty(amzShippingAddress.city) && empty(viewData.shippingAddress.address1)) {
            viewData.shippingAddress.city = '--';
        }
    }

    // Billing Address
    if (amzBillingAddress) {
        var formattedBillingName = amzBillingAddress.name.replace(/\s+/g, ' ');
        var billingNames = formattedBillingName.split(' ');
        var firstNameBilling = '';
        var lastNameBilling = '';

        billingNames.forEach(function (n, i, a) {
            if (i === 0) {
                firstNameBilling = n;
            } else {
                lastNameBilling = lastNameBilling + n + (i + 1 < a.length ? ' ' : '');
            }
        });

        if (empty(lastNameBilling) && amzBillingAddress.countryCode !== 'JP') {
            lastNameBilling = '-';
        }

        if (amzBillingAddress.countryCode === 'JP') {
            var initialBillingLastNameJP = lastNameBilling;
            lastNameBilling = !initialBillingLastNameJP ? firstNameBilling + '-' : firstNameBilling;
            firstNameBilling = initialBillingLastNameJP;
        }

        if (empty(amzBillingAddress.addressLine1) && !empty(amzBillingAddress.addressLine2)) {
            address1 = amzBillingAddress.addressLine2;
            address2 = !empty(amzBillingAddress.addressLine3) ? amzBillingAddress.addressLine3 : '';
        } else {
            address1 = amzBillingAddress.addressLine1;
            address2 = amzBillingAddress.addressLine2;
        }

        address2 = !empty(amzBillingAddress.addressLine3) ? address2 + ' ' + amzBillingAddress.addressLine3 : address2;

        viewData.billingAddress = {
            firstName: firstNameBilling,
            lastName: lastNameBilling,
            address1: address1,
            address2: address2,
            addressId: address1,
            city: amzBillingAddress.city,
            countryCode: {
                value: amzBillingAddress.countryCode
            },
            stateCode: amzBillingAddress.stateOrRegion,
            postalCode: amzBillingAddress.postalCode,
            phone: amzBillingAddress.phoneNumber || amzShippingAddress.phoneNumber
        };

        stateOrRegion = !empty(amzBillingAddress.stateOrRegion) ? amzBillingAddress.stateOrRegion : '';

        if (Object.prototype.hasOwnProperty.call(billing.addressFields, 'states')) {
            viewData.billingAddress.stateCode = stateOrRegion;
        }

        if (Object.prototype.hasOwnProperty.call(billing.addressFields, 'city')) {
            if (!empty(amzBillingAddress.city)) {
                viewData.billingAddress.city = amzBillingAddress.city;
            } else if (empty(amzBillingAddress.city) && !empty(viewData.billingAddress.address1)) {
                viewData.billingAddress.city = viewData.billingAddress.address1;
                viewData.billingAddress.address1 = viewData.billingAddress.address2 ? viewData.billingAddress.address2 : '--';
                viewData.billingAddress.address2 = !empty(amzBillingAddress.addressLine3) ? amzBillingAddress.addressLine3 : '';
            } else if (empty(amzBillingAddress.city) && empty(viewData.billingAddress.address1)) {
                viewData.billingAddress.city = '--';
            }
        }

        shipping.shippingAddress.shippingAddressUseAsBillingAddress.value = false;
    } else {
        viewData.billingAddress = viewData.shippingAddress;
        shipping.shippingAddress.shippingAddressUseAsBillingAddress.value = true;
    }

    viewData.shippingMethod = shipping.shippingAddress.shippingMethodID.value
        ? shipping.shippingAddress.shippingMethodID.value.toString()
        : null;

    viewData.isGift = shipping.shippingAddress.isGift.checked;

    viewData.email = checkoutSession.buyer.email;

    viewData.giftMessage = viewData.isGift ? shipping.shippingAddress.giftMessage.value : null;

    req.session.privacyCache.set(currentBasket.defaultShipment.UUID, 'valid');

    res.setViewData(viewData);

    var shippingFormErrors = COHelpers.validateShippingForm(shipping.shippingAddress.addressFields);
    if (Object.keys(shippingFormErrors).length > 0) {
        req.session.privacyCache.set(currentBasket.defaultShipment.UUID, 'invalid');

        res.json({
            form: shipping,
            fieldErrors: [shippingFormErrors],
            serverErrors: [],
            error: true
        });
    } else {
        COHelpers.copyCustomerAddressToShipment(viewData.shippingAddress, currentBasket.defaultShipment);
        COHelpers.copyCustomerAddressToBilling(viewData.billingAddress);
        COHelpers.recalculateBasket(currentBasket);

        var giftResult = COHelpers.setGift(
            currentBasket.defaultShipment,
            viewData.isGift,
            viewData.giftMessage
        );

        if (giftResult.error) {
            res.json({
                error: giftResult.error,
                fieldErrors: [],
                serverErrors: [giftResult.errorMessage]
            });

            return next();
        }

        if (currentBasket.shipments.length <= 1) {
            req.session.privacyCache.set('usingMultiShipping', false);
        }

        COHelpers.recalculateBasket(currentBasket);

        Transaction.wrap(function () {
            currentBasket.custom.amzPayRedirectURL = checkoutSession.webCheckoutDetails.amazonPayRedirectUrl;
            currentBasket.setCustomerEmail(viewData.email);
        });

        var checkoutURL = URLUtils.url('Checkout-Begin', 'stage', 'shipping');
        res.redirect(checkoutURL);
        return next();
    }

    return next();
});

server.get('OneReview', server.middleware.https, function (req, res, next) {
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
    var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');

    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        resRedirecter(res, 'no.basket');

        return next();
    }

    var validatedProducts = validationHelpers.validateProducts(currentBasket);

    if (validatedProducts.error) {
        resRedirecter(res, 'no.basket');

        return next();
    }

    var amazonCheckoutSessionId = req.querystring.amazonCheckoutSessionId;

    Transaction.wrap(function () {
        currentBasket.custom.amzPayCheckoutSessionId = amazonCheckoutSessionId;
    });

    var amazonPayRequest = new AmazonPayRequest(currentBasket, 'GET', '', ':checkoutSessionId', amazonCheckoutSessionId);
    var result = CheckoutSessionService.get(amazonPayRequest);

    if (!result.ok) {
        resRedirecter(res, 'service.fail');

        return next();
    }

    try {
        var checkoutSession = JSON.parse(result.object);
    } catch (error) {
        Logger.getLogger('AmazonPay', 'AmazonPay-CheckoutSession').error(error.toString());
        resRedirecter(res, 'invalid.json');
    }

    var amzBillingAddress = !empty(checkoutSession.billingAddress) ? checkoutSession.billingAddress : null;
    var amzShippingAddress = checkoutSession.shippingAddress;
    var shipping = server.forms.getForm('shipping');
    var billing = server.forms.getForm('billing');
    var formattedName = amzShippingAddress.name.replace(/\s+/g, ' ');
    var names = formattedName.split(' ');
    var firstName = '';
    var lastName = '';
    var data = {
        email: checkoutSession.buyer.email
    };

    names.forEach(function (n, i, a) {
        if (i === 0) {
            firstName = n;
        } else {
            lastName = lastName + n + (i + 1 < a.length ? ' ' : '');
        }
    });

    if (empty(lastName) && amzShippingAddress.countryCode !== 'JP') {
        lastName = '-';
    }

    if (amzShippingAddress.countryCode === 'JP') {
        var initialLastNameJP = lastName;
        lastName = !initialLastNameJP ? firstName + '-' : firstName;
        firstName = initialLastNameJP;
    }

    var address1 = '';
    var address2 = '';

    if (empty(amzShippingAddress.addressLine1) && !empty(amzShippingAddress.addressLine2)) {
        address1 = amzShippingAddress.addressLine2;
        address2 = amzShippingAddress.addressLine2;
    } else {
        address1 = amzShippingAddress.addressLine1;
        address2 = amzShippingAddress.addressLine2;
    }

    address2 = !empty(amzShippingAddress.addressLine3) ? address2 + ' ' + amzShippingAddress.addressLine3 : address2;

    data.shippingAddress = {
        firstName: firstName,
        lastName: lastName,
        address1: address1,
        address2: address2,
        addressId: address1,
        city: amzShippingAddress.city,
        countryCode: {
            value: amzShippingAddress.countryCode
        },
        stateCode: amzShippingAddress.stateOrRegion,
        postalCode: amzShippingAddress.postalCode,
        phone: amzShippingAddress.phoneNumber
    };

    // Create billing address from Amazon Pay if any
    if (amzBillingAddress) {
        var billingNames = amzBillingAddress.name.split(' ');
        var firstNameBilling = '';
        var lastNameBilling = '';

        billingNames.forEach(function (n, i, a) {
            if (i === 0) {
                firstNameBilling = n;
            } else {
                lastNameBilling = lastNameBilling + n + (i + 1 < a.length ? ' ' : '');
            }
        });

        if (empty(lastNameBilling) && amzBillingAddress.countryCode !== 'JP') {
            lastNameBilling = '-';
        }

        if (empty(amzBillingAddress.addressLine1) && !empty(amzBillingAddress.addressLine2)) {
            address1 = amzBillingAddress.addressLine2;
            address2 = amzBillingAddress.addressLine2;
        } else {
            address1 = amzBillingAddress.addressLine1;
            address2 = amzBillingAddress.addressLine2;
        }

        address2 = !empty(amzBillingAddress.addressLine3) ? address2 + ' ' + amzBillingAddress.addressLine3 : address2;

        data.billingAddress = {
            firstName: firstNameBilling,
            lastName: lastNameBilling,
            address1: address1,
            address2: address2,
            addressId: address1,
            city: amzBillingAddress.city,
            countryCode: {
                value: amzBillingAddress.countryCode
            },
            stateCode: amzBillingAddress.stateOrRegion,
            postalCode: amzBillingAddress.postalCode,
            phone: amzBillingAddress.phoneNumber || amzShippingAddress.phoneNumber
        };
    } else {
        data.billingAddress = data.shippingAddress;
    }

    req.session.privacyCache.set('usingMultiShipping', false);

    // Create Shipping and Billing Address
    COHelpers.copyCustomerAddressToShipment(data.shippingAddress, currentBasket.defaultShipment);
    COHelpers.copyCustomerAddressToBilling(data.billingAddress);
    COHelpers.recalculateBasket(currentBasket);

    Transaction.wrap(function () {
        currentBasket.setCustomerEmail(data.email);
    });

    var paymentProcessor = PaymentMgr.getPaymentMethod('AMAZON_PAY').getPaymentProcessor();

    var paymentFormResult;
    if (HookMgr.hasHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase())) {
        paymentFormResult = HookMgr.callHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase(),
            'processForm',
            req,
            billing,
            data.billingAddress
        );
    } else {
        paymentFormResult = HookMgr.callHook('app.payment.form.processor.default_form_processor', 'processForm');
    }

    // use paymentFormResult to return something
    if (HookMgr.hasHook('app.payment.processor.' + paymentProcessor.ID.toLowerCase())) {
        result = HookMgr.callHook('app.payment.processor.' + paymentProcessor.ID.toLowerCase(),
            'Handle',
            currentBasket,
            data.paymentInformation
        );
    } else {
        result = HookMgr.callHook('app.payment.processor.default', 'Handle');
    }

    // Calculate the basket
    Transaction.wrap(function () {
        basketCalculationHelpers.calculateTotals(currentBasket);
    });

    // Re-calculate the payments.
    var calculatedPaymentTransaction = COHelpers.calculatePaymentTransaction(currentBasket);

    try {
        Transaction.wrap(function () {
            currentBasket.custom.amzPayRedirectURL = checkoutSession.webCheckoutDetails.amazonPayRedirectUrl;
        });
    } catch (error) {
        Logger.getLogger('AmazonPay', 'AmazonPay-CheckoutSession').error(error.toString());
    }

    res.redirect(URLUtils.url('Checkout-Begin', 'stage', 'placeOrder'));

    return next();
});

server.get('Result', server.middleware.https, function (req, res, next) {
    var OrderMgr = require('dw/order/OrderMgr');
    var ArrayList = require('dw/util/ArrayList');

    var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
    var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
    var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
    var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');

    var currentBasket = BasketMgr.getCurrentBasket();
    var subject;
    var text;

    if (!currentBasket) {
        res.redirect(URLUtils.url('Cart-Show', 'error', true, 'cartError', true).toString());

        return next();
    }

    var validatedProducts = validationHelpers.validateProducts(currentBasket);

    if (validatedProducts.error) {
        res.redirect(URLUtils.url('Cart-Show', 'error', true, 'cartError', true).toString());

        return next();
    }

    if (req.session.privacyCache.get('fraudDetectionStatus')) {
        res.redirect(URLUtils.url('Error-ErrorCode', 'err', '01').toString());
        return next();
    }

    var validationOrderStatus = hooksHelper('app.validate.order', 'validateOrder', currentBasket, require('*/cartridge/scripts/hooks/validateOrder').validateOrder);

    if (validationOrderStatus.error) {
        Logger.getLogger('AmazonPay', 'Result').error('Error while trying to validate the Order: {0}', validationOrderStatus.message);
        resRedirecter(res, 'technical');
        return next();
    }

    // Calculate the basket
    Transaction.wrap(function () {
        basketCalculationHelpers.calculateTotals(currentBasket);
    });

    // Re-validates existing payment instruments
    var validPayment = COHelpers.validatePayment(req, currentBasket);
    if (validPayment.error) {
        resRedirecter(res, 'payment.not.valid');
        return next();
    }

    // Re-calculate the payments.
    var calculatedPaymentTransactionTotal = COHelpers.calculatePaymentTransaction(currentBasket);
    if (calculatedPaymentTransactionTotal.error) {
        Logger.getLogger('AmazonPay', 'Result').error('Error while calculating payment transaction {0}', calculatedPaymentTransactionTotal.error);
        resRedirecter(res, 'technical');
        return next();
    }

    //COMPLETE CHECKOUT SESSION FOR v2
    var amazonCheckoutSessionId = req.querystring.amazonCheckoutSessionId;
    var amazonPayRequest = new AmazonPayRequest(currentBasket, 'POST', '', ':checkoutSessionId', amazonCheckoutSessionId);
    var result = CheckoutSessionService.complete(amazonPayRequest);

    if (!result.ok) {
        resRedirecter(res, 'service.fail');

        return next();
    }

    try {
        var checkoutSession = JSON.parse(result.object);
    } catch (error) {
        Logger.getLogger('AmazonPay', 'AmazonPay-CheckoutSession').error(error.toString());
        resRedirecter(res, 'invalid.json');

        return next();
    }

    Transaction.wrap(function () {
        currentBasket.custom.amzPayChargeId = checkoutSession.chargeId;
        currentBasket.custom.amzPayChargePermissionId = checkoutSession.chargePermissionId;
        currentBasket.custom.amzPayCheckoutSessionState = checkoutSession.statusDetails.state;
        currentBasket.custom.amzPayCheckoutSessionReasonCode = checkoutSession.statusDetails.reasonCode;
        currentBasket.custom.amzPayRedirectURL = null;

        if (!currentBasket.custom.amzPayCheckoutSessionId) {
            currentBasket.custom.amzPayCheckoutSessionId = checkoutSession.checkoutSessionId;
        }
    });

    if (checkoutSession.statusDetails.state === 'Completed') {
        // Creates a new order.
        var order = COHelpers.createOrder(currentBasket);
        if (!order) {
            Logger.getLogger('AmazonPay', 'Result').error('Error while trying to create the Order');
            resRedirecter(res, 'technical');

            return next();
        }

        // Handles payment authorization
        var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo);
        if (handlePaymentResult.error) {
            Logger.getLogger('AmazonPay', 'Result').error('Error while trying to handle payments used in the Order');
            resRedirecter(res, 'technical');

            return next();
        }

        var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
        if (fraudDetectionStatus.status === 'fail') {
            Transaction.wrap(function () { OrderMgr.failOrder(order, true); });

            // fraud detection failed
            req.session.privacyCache.set('fraudDetectionStatus', true);

            res.redirect(URLUtils.url('Error-ErrorCode', 'err', fraudDetectionStatus.errorCode).toString());

            return next();
        }

        amazonPayRequest = new AmazonPayRequest(order, 'PATCH', '', ':chargePermissionId', checkoutSession.chargePermissionId);
        result = ChargePermissionService.update(amazonPayRequest);

        if (!result.ok) {
            resRedirecter(res, 'service.fail');

            return next();
        }

        try {
            var chargePermission = JSON.parse(result.object);
        } catch (error) {
            Logger.getLogger('AmazonPay', 'AmazonPay-ChargePermission').error(error.toString());
            resRedirecter(res, 'invalid.json');

            return next();
        }

        subject = Resource.msgf('notes.subject.chargepermission.2', 'amazon', null, chargePermission.statusDetails.state);
        text = Resource.msgf('chargepermission.status.code.msg.' + chargePermission.statusDetails.state, 'amazon', null, chargePermission.chargePermissionId);

        Transaction.wrap(function () {
            if (chargePermission.statusDetails.reasons) {
                var reasonCodes = new ArrayList(order.custom.amzPayChargePermissionReasonCode);
                chargePermission.statusDetails.reasons.forEach(function (e) {
                    reasonCodes.push(e.reasonCode);
                    var chargePermissionSubject = Resource.msgf('notes.subject.chargepermission.1', 'amazon', null, chargePermission.statusDetails.state, e.reasonCode);
                    var chargePermissionText = Resource.msgf('chargepermission.status.code.msg.' + e.reasonCode, 'amazon', null, chargePermission.chargePermissionId);
                    order.addNote(chargePermissionSubject, chargePermissionText);
                });
                order.custom.amzPayChargePermissionReasonCode = reasonCodes.toArray();
            }

            order.addNote(subject, text);
            order.custom.amzPayChargePermissionState = chargePermission.statusDetails.state;
        });

        // If the payment intent is confirm there is no chargeId on checkoutSession object
        if (sitePreferences.amzPayPaymentIntent.value !== 'Confirm') {
            // GET the Charge object and update the order details
            amazonPayRequest = new AmazonPayRequest('', 'GET', '', ':chargeId', checkoutSession.chargeId);
            result = ChargeService.get(amazonPayRequest);

            if (!result.ok) {
                resRedirecter(res, 'service.fail');
                return next();
            }

            try {
                var charge = JSON.parse(result.object);
            } catch (error) {
                Logger.getLogger('AmazonPay', 'AmazonPay-Charge').error(error.toString());
                resRedirecter(res, 'invalid.json');
                return next();
            }

            if (charge.statusDetails.reasonCode) {
                subject = Resource.msgf('notes.subject.charge.1', 'amazon', null, charge.statusDetails.state, charge.statusDetails.reasonCode);
                text = Resource.msgf('charge.status.code.msg.' + charge.statusDetails.reasonCode, 'amazon', null, charge.chargeId);
            } else {
                subject = Resource.msgf('notes.subject.charge.2', 'amazon', null, charge.statusDetails.state);
                text = Resource.msgf('charge.status.code.msg.' + charge.statusDetails.state, 'amazon', null, charge.chargeId);
            }

            try {
                Transaction.wrap(function () {
                    order.addNote(subject, text);
                    order.custom.amzPayChargeState = charge.statusDetails.state;
                    order.custom.amzPayChargeReasonCode = charge.statusDetails.reasonCode;
                });
            } catch (error) {
                Logger.error(error.toString());
            }
        }

        if (sitePreferences.amzPayPaymentIntent.value === 'AuthorizeWithCapture' && charge.statusDetails.state === 'Authorized') {
            // Capture Charge
            amazonPayRequest = new AmazonPayRequest(currentBasket, 'POST', '', ':chargeId', checkoutSession.chargeId);
            result = ChargeService.capture(amazonPayRequest);

            if (!result.ok) {
                // Merchant should try again the attempt to create the charge
                resRedirecter(res, 'service.fail');
                return next();
            }

            try {
                charge = JSON.parse(result.object);
            } catch (error) {
                Logger.getLogger('AmazonPay', 'AmazonPay-Charge').error(error.toString());
                resRedirecter(res, 'invalid.json');
                return next();
            }

            if (charge.statusDetails.reasonCode) {
                subject = Resource.msgf('notes.subject.charge.1', 'amazon', null, charge.statusDetails.state, charge.statusDetails.reasonCode);
                text = Resource.msgf('charge.status.code.msg.' + charge.statusDetails.reasonCode, 'amazon', null, charge.chargeId);
            } else {
                subject = Resource.msgf('notes.subject.charge.2', 'amazon', null, charge.statusDetails.state);
                text = Resource.msgf('charge.status.code.msg.' + charge.statusDetails.state, 'amazon', null, charge.chargeId);
            }

            try {
                Transaction.wrap(function () {
                    order.addNote(subject, text);
                    order.custom.amzPayChargeState = charge.statusDetails.state;
                    order.custom.amzPayChargeReasonCode = charge.statusDetails.reasonCode;
                });
            } catch (error) {
                Logger.getLogger('AmazonPay', 'Result').error('ERROR! Another transaction was in progress causing the fail of update for Order with the new Charge State and Charge Reason Code');
                resRedirecter(res, 'technical');
            }
        }

        var chargeState = charge ? charge.statusDetails.state : null;

        if (chargeState
            && (
                chargeState === 'AuthorizationInitiated' ||
                chargeState === 'Authorized' ||
                chargeState === 'CaptureInitiated' ||
                chargeState === 'Captured'
            )
        ) {
            // Places the order
            var placeOrderResult = COHelpers.placeOrder(order, fraudDetectionStatus);
            if (placeOrderResult.error) {
                Logger.getLogger('AmazonPay', 'Result').error('Error while trying to place Order');
                resRedirecter(res, 'technical');
                return next();
            }

            COHelpers.sendConfirmationEmail(order, req.locale.id);

            if (sitePreferences.enableSFRAv6_1_0) {
                res.redirect(URLUtils.url('Order-Confirm', 'ID', order.orderNo, 'error', false, 'token', order.orderToken, 'amzPayCheckoutSessionId', checkoutSession.checkoutSessionId));
            } else {
                res.redirect(URLUtils.url('Order-Confirm', 'ID', order.orderNo, 'error', false, 'token', order.orderToken));
            }

            return next();
        } else if (chargeState && charge.statusDetails.state === 'Declined') {
            // fail order
            Transaction.wrap(function () { OrderMgr.failOrder(order, true); });

            // After fail order clean up currentBasket
            var notes = currentBasket.getNotes().iterator();

            while (notes.hasNext()) {
                var note = note.next();
                currentBasket.removeNote(note);
            }

            resRedirecter(res, 'payment.decline');

            return next();
        } else {
            // Places the order
            var placeOrderResult = COHelpers.placeOrder(order, fraudDetectionStatus);
            if (placeOrderResult.error) {
                resRedirecter(res, 'technical');
                return next();
            }
            amazonPayRequest = new AmazonPayRequest(order, 'PATCH', '', ':chargePermissionId', checkoutSession.chargePermissionId);
            result = ChargePermissionService.update(amazonPayRequest);

            if (!result.ok) {
                resRedirecter(res, 'service.fail');

                return next();
            }

            COHelpers.sendConfirmationEmail(order, req.locale.id);

            if (sitePreferences.enableSFRAv6_1_0) {
                res.redirect(URLUtils.url('Order-Confirm', 'ID', order.orderNo, 'error', false, 'token', order.orderToken, 'amzPayCheckoutSessionId', checkoutSession.checkoutSessionId));
            } else {
                res.redirect(URLUtils.url('Order-Confirm', 'ID', order.orderNo, 'error', false, 'token', order.orderToken));
            }

            return next();
        }
    } else if (checkoutSession.statusDetails.state === 'Canceled') {
        if (checkoutSession.statusDetails.reasonCode === 'Declined') {
            // Creates a new order.
            var order = COHelpers.createOrder(currentBasket);
            if (!order) {
                Logger.getLogger('AmazonPay', 'Result').error('Error while trying to create the Order');
                resRedirecter(res, 'technical');

                return next();
            }

            // Handles payment authorization
            var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo);
            if (handlePaymentResult.error) {
                Logger.getLogger('AmazonPay', 'Result').error('Error while trying to handle payments used in the Order');
                resRedirecter(res, 'technical');

                return next();
            }

            var fraudDetectionStatus = hooksHelper('app.fraud.detection', 'fraudDetection', currentBasket, require('*/cartridge/scripts/hooks/fraudDetection').fraudDetection);
            if (fraudDetectionStatus.status === 'fail') {
                Transaction.wrap(function () { OrderMgr.failOrder(order, true); });

                // fraud detection failed
                req.session.privacyCache.set('fraudDetectionStatus', true);

                res.redirect(URLUtils.url('Error-ErrorCode', 'err', fraudDetectionStatus.errorCode).toString());

                return next();
            }

            Transaction.wrap(function () {
                OrderMgr.failOrder(order, true);
                order.addNote(checkoutSession.statusDetails.reasonCode, checkoutSession.statusDetails.reasonDescription);
                var notes = currentBasket.getNotes().iterator();
                while (notes.hasNext()) {
                    var note = note.next();
                    currentBasket.removeNote(note);
                }
            });

            resRedirecter(res, 'payment.decline');

            return next();
        } else {
            res.redirect(URLUtils.url('Cart-Show').toString());
            return next();
        }
    }

    return next();
});

server.post(
    'SubmitPayment',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

        var viewData = {};
        var paymentForm = server.forms.getForm('billing');
        var currentBasket = BasketMgr.getCurrentBasket();

        // Handling Amazon Pay Checkout
        if (currentBasket.custom.amzPayRedirectURL !== null) {
            var checkoutSessionId = currentBasket.custom.amzPayCheckoutSessionId;
            var amazonPayRequest = new AmazonPayRequest('', 'GET', '', ':checkoutSessionId', checkoutSessionId);
            var result = CheckoutSessionService.get(amazonPayRequest);
            var checkoutSession = JSON.parse(result.object);
            if (checkoutSession.statusDetails.state !== 'Open') {
                Transaction.wrap(function () {
                    currentBasket.custom.amzPayCheckoutSessionId = null;
                    currentBasket.custom.amzPayRedirectURL = null;
                });
                checkoutSessionId = null;
            } else {
                paymentForm.paymentMethod.value = 'AMAZON_PAY';
            }
        }

        // verify billing form data
        var billingFormErrors = COHelpers.validateBillingForm(paymentForm.addressFields);
        var contactInfoFormErrors = COHelpers.validateFields(paymentForm.contactInfoFields);

        var formFieldErrors = [];
        if (Object.keys(billingFormErrors).length) {
            formFieldErrors.push(billingFormErrors);
        } else {
            viewData.address = {
                firstName: { value: paymentForm.addressFields.firstName.value },
                lastName: { value: paymentForm.addressFields.lastName.value },
                address1: { value: paymentForm.addressFields.address1.value },
                address2: { value: paymentForm.addressFields.address2.value },
                city: { value: paymentForm.addressFields.city.value },
                postalCode: { value: paymentForm.addressFields.postalCode.value },
                countryCode: { value: paymentForm.addressFields.country.value }
            };

            if (Object.prototype.hasOwnProperty.call(paymentForm.addressFields, 'states')) {
                viewData.address.stateCode = { value: paymentForm.addressFields.states.stateCode.value };
            }
        }

        if (Object.keys(contactInfoFormErrors).length) {
            formFieldErrors.push(contactInfoFormErrors);
        } else {
            viewData.email = {
                value: sitePreferences.enableSFRAv6_1_0 ? currentBasket.customerEmail : paymentForm.contactInfoFields.email.value
            };

            viewData.phone = { value: paymentForm.contactInfoFields.phone.value };
        }

        var paymentMethodIdValue = paymentForm.paymentMethod.value;
        if (!PaymentMgr.getPaymentMethod(paymentMethodIdValue).paymentProcessor) {
            throw new Error(Resource.msg(
                'error.payment.processor.missing',
                'checkout',
                null
            ));
        }

        var paymentProcessor = PaymentMgr.getPaymentMethod(paymentMethodIdValue).getPaymentProcessor();

        var paymentFormResult;
        if (HookMgr.hasHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase())) {
            paymentFormResult = HookMgr.callHook('app.payment.form.processor.' + paymentProcessor.ID.toLowerCase(),
                'processForm',
                req,
                paymentForm,
                viewData
            );
        } else {
            paymentFormResult = HookMgr.callHook('app.payment.form.processor.default_form_processor', 'processForm');
        }

        if (paymentFormResult.error && paymentFormResult.fieldErrors) {
            formFieldErrors.push(paymentFormResult.fieldErrors);
        }

        if (formFieldErrors.length || paymentFormResult.serverErrors) {
            // respond with form data and errors
            res.json({
                form: paymentForm,
                fieldErrors: formFieldErrors,
                serverErrors: paymentFormResult.serverErrors ? paymentFormResult.serverErrors : [],
                error: true
            });
            return next();
        }

        res.setViewData(paymentFormResult.viewData);

        this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
            var PaymentInstrument = require('dw/order/PaymentInstrument');
            var AccountModel = require('*/cartridge/models/account');
            var OrderModel = require('*/cartridge/models/order');
            var Locale = require('dw/util/Locale');
            var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
            var hooksHelper = require('*/cartridge/scripts/helpers/hooks');
            var validationHelpers = require('*/cartridge/scripts/helpers/basketValidationHelpers');

            currentBasket = BasketMgr.getCurrentOrNewBasket();
            var validatedProducts = validationHelpers.validateProducts(currentBasket);

            var billingData = res.getViewData();

            if (!currentBasket || validatedProducts.error) {
                delete billingData.paymentInformation;

                res.json({
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                });
                return;
            }

            var billingAddress = currentBasket.billingAddress;
            var billingForm = server.forms.getForm('billing');
            var paymentMethodID = billingData.paymentMethod.value;
            var result;

            billingForm.creditCardFields.cardNumber.htmlValue = '';
            billingForm.creditCardFields.securityCode.htmlValue = '';

            Transaction.wrap(function () {
                if (!billingAddress) {
                    billingAddress = currentBasket.createBillingAddress();
                }

                billingAddress.setFirstName(billingData.address.firstName.value);
                billingAddress.setLastName(billingData.address.lastName.value);
                billingAddress.setAddress1(billingData.address.address1.value);
                billingAddress.setAddress2(billingData.address.address2.value);
                billingAddress.setCity(billingData.address.city.value);
                billingAddress.setPostalCode(billingData.address.postalCode.value);
                if (Object.prototype.hasOwnProperty.call(billingData.address, 'stateCode')) {
                    billingAddress.setStateCode(billingData.address.stateCode.value);
                }
                billingAddress.setCountryCode(billingData.address.countryCode.value);

                if (billingData.storedPaymentUUID) {
                    billingAddress.setPhone(req.currentCustomer.profile.phone);
                    currentBasket.setCustomerEmail(req.currentCustomer.profile.email);
                } else {
                    billingAddress.setPhone(billingData.phone.value);
                    currentBasket.setCustomerEmail(billingData.email.value);
                }
            });

            // if there is no selected payment option and balance is greater than zero
            if (!paymentMethodID && currentBasket.totalGrossPrice.value > 0) {
                var noPaymentMethod = {};

                noPaymentMethod[billingData.paymentMethod.htmlName] =
                    Resource.msg('error.no.selected.payment.method', 'payment', null);

                delete billingData.paymentInformation;

                res.json({
                    form: billingForm,
                    fieldErrors: [noPaymentMethod],
                    serverErrors: [],
                    error: true
                });
                return;
            }

            if (PaymentInstrument.METHOD_CREDIT_CARD === paymentMethodID) {
                // Validate payment instrument
                var creditCardPaymentMethod = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD);
                var paymentCard = PaymentMgr.getPaymentCard(billingData.paymentInformation.cardType.value);

                var applicablePaymentCards = creditCardPaymentMethod.getApplicablePaymentCards(
                    req.currentCustomer.raw,
                    req.geolocation.countryCode,
                    null
                );

                if (!applicablePaymentCards.contains(paymentCard)) {
                    // Invalid Payment Instrument
                    var invalidPaymentMethod = Resource.msg('error.payment.not.valid', 'checkout', null);
                    delete billingData.paymentInformation;
                    res.json({
                        form: billingForm,
                        fieldErrors: [],
                        serverErrors: [invalidPaymentMethod],
                        error: true
                    });
                    return;
                }
            }

            // check to make sure there is a payment processor
            if (!PaymentMgr.getPaymentMethod(paymentMethodID).paymentProcessor) {
                throw new Error(Resource.msg(
                    'error.payment.processor.missing',
                    'checkout',
                    null
                ));
            }

            var processor = PaymentMgr.getPaymentMethod(paymentMethodID).getPaymentProcessor();

            if (HookMgr.hasHook('app.payment.processor.' + processor.ID.toLowerCase())) {
                result = HookMgr.callHook('app.payment.processor.' + processor.ID.toLowerCase(),
                    'Handle',
                    currentBasket,
                    billingData.paymentInformation
                );
            } else {
                result = HookMgr.callHook('app.payment.processor.default', 'Handle');
            }

            // need to invalidate credit card fields
            if (result.error) {
                delete billingData.paymentInformation;

                res.json({
                    form: billingForm,
                    fieldErrors: result.fieldErrors,
                    serverErrors: result.serverErrors,
                    error: true
                });
                return;
            }

            if (HookMgr.hasHook('app.payment.form.processor.' + processor.ID.toLowerCase())) {
                HookMgr.callHook('app.payment.form.processor.' + processor.ID.toLowerCase(),
                    'savePaymentInformation',
                    req,
                    currentBasket,
                    billingData
                );
            } else {
                HookMgr.callHook('app.payment.form.processor.default', 'savePaymentInformation');
            }

            // Calculate the basket
            Transaction.wrap(function () {
                basketCalculationHelpers.calculateTotals(currentBasket);
            });

            // Re-calculate the payments.
            var calculatedPaymentTransaction = COHelpers.calculatePaymentTransaction(
                currentBasket
            );

            if (calculatedPaymentTransaction.error) {
                res.json({
                    form: paymentForm,
                    fieldErrors: [],
                    serverErrors: [Resource.msg('error.technical', 'checkout', null)],
                    error: true
                });
                return;
            }

            var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
            if (usingMultiShipping === true && currentBasket.shipments.length < 2) {
                req.session.privacyCache.set('usingMultiShipping', false);
                usingMultiShipping = false;
            }

            if (sitePreferences.enableSFRAv6_1_0) {
                hooksHelper('app.customer.subscription', 'subscribeTo', [paymentForm.subscribe.checked, currentBasket.customerEmail], function () {});
            } else {
                hooksHelper('app.customer.subscription', 'subscribeTo', [paymentForm.subscribe.checked, paymentForm.contactInfoFields.email.htmlValue], function () {});
            }

            var currentLocale = Locale.getLocale(req.locale.id);

            var basketModel = new OrderModel(
                currentBasket,
                { usingMultiShipping: usingMultiShipping, countryCode: currentLocale.country, containerView: 'basket' }
            );

            var accountModel = new AccountModel(req.currentCustomer);
            var renderedStoredPaymentInstrument = COHelpers.getRenderedPaymentInstruments(
                req,
                accountModel
            );

            delete billingData.paymentInformation;

            res.json({
                renderedPaymentInstruments: renderedStoredPaymentInstrument,
                customer: accountModel,
                order: basketModel,
                form: billingForm,
                error: false
            });
        });

        return next();
    }
);

server.get('GetAdditionalButtonConfig', server.middleware.https, function (req, res, next) {
    var amazonPayUtils = require('*/cartridge/scripts/util/amazonPayUtils.js');

    var amazonPayAdditionalButtonPayload = amazonPayUtils.generateAmazonPayAdditionalButtonPayload();
    var amazonPayAdditionalButtonSignature = amazonPayUtils.generateAmazonButtonSignature(amazonPayUtils.generateAmazonPayAdditionalButtonPayload());

    res.json({
        AmazonPayAdditionalButtonPayload: amazonPayAdditionalButtonPayload,
        AmazonPayAdditionalButtonSignature: amazonPayAdditionalButtonSignature
    });

    return next();
});

server.post('RenderAmazonAPB', server.middleware.https, function (req, res, next) {
    res.render('common/amazonPay/amazonPayAdditionalButton');
    return next();
});

server.get('GetEstimatedOrderAmount', server.middleware.https, function (req, res, next) {
    var amazonPayUtils = require('*/cartridge/scripts/util/amazonPayUtils.js');

    var amazonPayEstimatedOrderAmount = amazonPayUtils.getEstimatedOrderAmount();

    res.json({
        AmazonPayEstimatedOrderAmount: amazonPayEstimatedOrderAmount
    });

    return next();
});

module.exports = server.exports();
