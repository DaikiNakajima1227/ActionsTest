'use strict';

/**
 * 10桁の整数であるか判定
 * @param {num} decimal 1000000000
 * @returns {bool} 
 */
function isTenDigit(num) {
    return num.toString().length === 10
}

exports.isTenDigit = isTenDigit;
