'use strict';

$(document).ready(function() {
    window.amazonBtnToUpdate = [];

    function addListeners() {
        if (amazonBtnToUpdate) {
            var bodyJQueryProps = Object.keys($('body').length && $('body')[0]);
            var amazonEvents = bodyJQueryProps.filter(function(prop) {
                var current = $('body')[0][prop];
    
                if (current && current.events && current.events['cart:update']) {
                    return current.events['cart:update'].find(function(ev) {
                        if (ev.namespace === 'amazon') {
                            return ev;
                        }
                    });
                }
            });
    
            if (!amazonEvents.length) {
                $('body').on('cart:update.amazon cart:shippingMethodSelected.amazon product:afterAddToCart.amazon', function() {
                    $.ajax({
                        type: 'GET',
                        url: AmazonURLs.getEstimatedOrderAmount,
                        dataType: 'json',
                        success: function(data) {
                            var currentAmount = JSON.parse(data.AmazonPayEstimatedOrderAmount);
                            currentAmount.amount = Number(currentAmount.amount);
    
                            if (amazonBtnToUpdate && !isNaN(currentAmount.amount)) {
                                amazonBtnToUpdate.map(function(item) {
                                    item.updateButtonInfo(currentAmount);
                                });
                            }
                        },
                        error: function () {
                            console.error(data)
                        }
                    });
                });
            }
        }
    }    

    function createRenderButtonObject(buttonPlacement, productType, payloadJSON, signature, estimatedOrderAmount) {
        var renderButtonObject = {};
        var sessionConfigPropName = (productType === 'SignIn') ? 'signInConfig' : 'createCheckoutSessionConfig';

        renderButtonObject = {
            merchantId: AmazonSitePreferences.AMAZON_MERCHANT_ID,
            publicKeyId: AmazonSitePreferences.AMAZON_PUBLIC_KEY_ID,
            ledgerCurrency: AmazonSitePreferences.AMAZON_CURRENCY,
            // customize the buyer experience
            checkoutLanguage: AmazonSitePreferences.AMAZON_CHECKOUT_LANGUAGE,
            productType: productType,
            sandbox: AmazonSitePreferences.AMAZON_SANDBOX_MODE,
            placement: buttonPlacement,
            buttonColor: 'Gold',
        };

        // configure Create Checkout Session request
        renderButtonObject[sessionConfigPropName] = {
            payloadJSON: payloadJSON,
            signature: signature,
            algorithm: 'AMZN-PAY-RSASSA-PSS-V2'
        };

        if (estimatedOrderAmount != null) {
            renderButtonObject.estimatedOrderAmount = estimatedOrderAmount;
        }

        return renderButtonObject;
    }

    var amazonPaymentsObject = {
        addSignInButton: function () {
            var amazonButtons = $('[amazonpay-type="signIn"][amazonpay-uid]');

            amazonButtons.map(function () {
                var buttonUID = $(this).attr('amazonpay-uid');

                if (!this.shadowRoot && buttonUID && window.amazon) {
                    // eslint-disable-next-line
                    amazon.Pay.renderButton(
                        '[amazonpay-uid="'+ buttonUID +'"]', 
                        createRenderButtonObject(
                            'Other',
                            'SignIn',
                            AmazonSignInPayload,
                            AmazonSignInSignature,
                            null
                        )
                    );
                }
            });
        },
        addButtonToCheckoutPage: function () {
            var amazonButtons = $('[amazonpay-type="checkout"][amazonpay-uid]');

            amazonButtons.map(function () {
                var buttonUID = $(this).attr('amazonpay-uid');

                if (!this.shadowRoot && buttonUID && window.amazon) {
                    // eslint-disable-next-line
                    var renderedButton = amazon.Pay.renderButton(
                        '[amazonpay-uid="'+ buttonUID +'"]',
                        createRenderButtonObject(
                            'Checkout',
                            AmazonSitePreferences.AMAZON_PRODUCT_TYPE,
                            AmazonPayPayload,
                            AmazonPaySignature,
                            AmazonEstimatedOrderAmount
                        )
                    );
                    amazonBtnToUpdate.push(renderedButton);
                }
            });
        },
        addButtonToCartPage: function () {
            var amazonButtons = $('[amazonpay-type="cart"][amazonpay-uid]');

            amazonButtons.map(function () {
                var buttonUID = $(this).attr('amazonpay-uid');

                if (!this.shadowRoot && buttonUID && window.amazon) {
                    // eslint-disable-next-line
                    var renderedButton = amazon.Pay.renderButton(
                        '[amazonpay-uid="'+ buttonUID +'"]',
                        createRenderButtonObject(
                            'Cart',
                            AmazonSitePreferences.AMAZON_PRODUCT_TYPE,
                            AmazonPayPayload,
                            AmazonPaySignature,
                            AmazonEstimatedOrderAmount
                        )
                    );
                    amazonBtnToUpdate.push(renderedButton);
                }
            });
        },
        addAdditionalButtonToCheckoutPage: function () {
            var amazonButtons = $('[amazonpay-type="additionalPayButton"][amazonpay-uid]');

            amazonButtons.map(function() {
                var currElem = this;
                var buttonUID = $(currElem).attr('amazonpay-uid');

                $.ajax({
                    url: AmazonURLs.getAdditionalButtonConfig,
                    type: 'GET',
                    success: function (data) {
                        if (!currElem.shadowRoot && buttonUID && window.amazon) {
                            // eslint-disable-next-line
                            amazon.Pay.renderButton(
                                '[amazonpay-uid="'+ buttonUID +'"]',
                                createRenderButtonObject(
                                    'Checkout',
                                    AmazonSitePreferences.AMAZON_PRODUCT_TYPE,
                                    data.AmazonPayAdditionalButtonPayload,
                                    data.AmazonPayAdditionalButtonSignature,
                                    null
                                )
                            );
                        }
                    }
                });
            });
        },
        initiateBindChangeActions: function () {
            if ($('.edit-shipping').length || $('.change-payment').length || $('.edit-shipping-first').length) {
                $.ajax({
                    url: AmazonURLs.getCheckoutSession,
                    type: 'GET',
                    success: function (data) {
                        if (data.checkoutSessionId != null) {
                            if ($('.edit-shipping').length) {
                                // eslint-disable-next-line
                                amazon.Pay.bindChangeAction('.edit-shipping', {
                                    amazonCheckoutSessionId: data.checkoutSessionId,
                                    changeAction: 'changeAddress'
                                });
                            }
                            if ($('.edit-shipping-first').length) {
                                // eslint-disable-next-line
                                amazon.Pay.bindChangeAction('.edit-shipping-first', {
                                    amazonCheckoutSessionId: data.checkoutSessionId,
                                    changeAction: 'changeAddress'
                                });
                            }
                            if ($('.change-payment').length) {
                                // eslint-disable-next-line
                                amazon.Pay.bindChangeAction('.change-payment', {
                                    amazonCheckoutSessionId: data.checkoutSessionId,
                                    changeAction: 'changePayment'
                                });
                            }
                        }
                    }
                });
            }
        },
        placeOrderAction: function () {
            $('.process-order-amazon').on('click', function (e) {
                e.preventDefault();
                if ($('.process-order-amazon').data('action')) {
                    window.location.href = $('.process-order-amazon').data('action');
                }
            });
        },
        init: function () {
            this.addSignInButton();
            this.addButtonToCartPage();
            this.addButtonToCheckoutPage();
            this.addAdditionalButtonToCheckoutPage();
            this.initiateBindChangeActions();
            this.placeOrderAction();
        }
    };

    if (!window.amazon) {
        var SDK = document.createElement('script');
        SDK.src = $('#amazon-sdk').data('sdk');
        SDK.onload = function () {
            amazonPaymentsObject.init();
            if ($('.submit-shipping').length) {
                $('.submit-shipping').on('click', function (e) {
                    e.preventDefault();
                    amazonPaymentsObject.init();
                });
            } else {
                amazonPaymentsObject.init();
            }
        }
        document.body.appendChild(SDK);
    } else {
        amazonPaymentsObject.init();
        if ($('.submit-shipping').length) {
            $('.submit-shipping').on('click', function (e) {
                e.preventDefault();
                amazonPaymentsObject.init();
            });
        } else {
            amazonPaymentsObject.init();
        }
    }

    $('[amazonpay-type="cart"]').on('click', function (e) {
        if (sessionStorage) {
            sessionStorage.setItem('paymentMethodId', '');
        }
    });

    $('[amazonpay-type="checkout"]').on('click', function (e) {
        if (sessionStorage) {
            sessionStorage.setItem('paymentMethodId', '');
        }
    });

    addListeners();
});
