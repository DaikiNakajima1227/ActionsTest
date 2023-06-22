'use strict';

module.exports = {
    oms: {
        order: {
            validate: 'oms.order.validate',
            register: 'oms.order.register',
            amount: 'oms.order.amount',
            history: {
                list: 'oms.order.history.list',
                detail: 'oms.order.history.detail',
            },
            deliverydate: {
                get: 'oms.order.deliverydate.get',
            },
            nextdeliverydate: {
                get: 'oms.order.nextdeliverydate.get',
            },
        },
        customer: {
            register: 'oms.customer.register',
            update: 'oms.customer.update',
            get: 'oms.customer.get',
            address: {
                update: 'oms.customer.address.update',
                get: 'oms.customer.address.get',
            },
        },
        point: {
            history: {
                get: 'oms.point.history.get',
            },
        },
        enquiry: {
            register: 'oms.enquiry.register',
            list: 'oms.enquiry.list',
            append: 'oms.enquiry.append',
            history: {
                get: 'oms.enquiry.history.get',
            },
        },
        product: {
            deliveryInfo: {
                get: 'oms.product.deliveryInfo.get',
            },
        },
    },
    gmo: {
        card: {
            search: 'gmo.card.search',
            delete: 'gmo.card.delete',
            traded: 'gmo.card.traded',
        },
        transaction: {
            entry: 'gmo.transaction.entry',
            execute: 'gmo.transaction.execute',
        },
        member: {
            save: 'gmo.member.save',
            search: 'gmo.member.search',
        },
    },
    subsc: {
        oauth: {
            token: 'subsc.oauth.token',
        },
        orders: {
            update: 'subsc.orders.update',
        },
        subscriptions: {
            list: {
                get: 'subsc.subscriptions.list.get',
            },
        },
        rateplans: {
            detail: {
                get: 'subsc.rateplans.detail.get',
            },
            charge: {
                get: 'subsc.rateplans.charge.get',
            },
        },
        order: {
            create: 'subsc.order.create',
        },
    },
    amazon: {
        storage: {
            upload: 'amazon.storage.upload',
        },
    },
    product: {
        deliveryInfo: {
            get: 'oms.product.deliveryInfo.get',
        },
    },
};
