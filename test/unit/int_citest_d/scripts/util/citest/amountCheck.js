'use strict';

const assert = require('chai').assert;

describe('amountCheck', function() {
    const util = require('../../../../../../cartridges/int_citest_d/cartridge/scripts/util/citest/amoutCheck.js')
    const num = 1234567890;

    it('isTenDigit', function() {
        const result = util.isTenDigit(num);
        assert.equal(result, true);
    });
});
