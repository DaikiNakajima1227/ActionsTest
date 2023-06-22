'use strict';

module.exports = {
    services: {
        charge: {
            cancel: 'amazon.pay.charge.cancel',
            capture: 'amazon.pay.charge.capture',
            create: 'amazon.pay.charge.create',
            get: 'amazon.pay.charge.get'
        },
        chargePermission: {
            close: 'amazon.pay.chargePermission.close',
            get: 'amazon.pay.chargePermission.get',
            update: 'amazon.pay.chargePermission.update'
        },
        checkoutSession: {
            create: 'amazon.pay.checkoutSession.create',
            get: 'amazon.pay.checkoutSession.get',
            update: 'amazon.pay.checkoutSession.update',
            complete: 'amazon.pay.checkoutSession.complete'
        },
        refund: {
            create: 'amazon.pay.refund.create',
            get: 'amazon.pay.refund.get'
        },
        buyer: {
            get: 'amazon.pay.buyer.get'
        }
    }
};
