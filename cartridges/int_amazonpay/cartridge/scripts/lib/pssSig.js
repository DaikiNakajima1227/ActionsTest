/* eslint-disable */
var CryptoJS =
    CryptoJS ||
    (function(Math, undefined) {
        var C = {};
        var C_lib = (C.lib = {});
        var Base = (C_lib.Base = (function() {
            function F() {}

            return {
                extend: function(overrides) {
                    F.prototype = this;
                    var subtype = new F();

                    if (overrides) {
                        subtype.mixIn(overrides);
                    }

                    if (!subtype.hasOwnProperty('init')) {
                        subtype.init = function() {
                            subtype.$super.init.apply(this, arguments);
                        };
                    }

                    subtype.init.prototype = subtype;

                    subtype.$super = this;

                    return subtype;
                },

                create: function() {
                    var instance = this.extend();
                    instance.init.apply(instance, arguments);

                    return instance;
                },

                init: function() {},

                mixIn: function(properties) {
                    for (var propertyName in properties) {
                        if (properties.hasOwnProperty(propertyName)) {
                            this[propertyName] = properties[propertyName];
                        }
                    }

                    if (properties.hasOwnProperty('toString')) {
                        this.toString = properties.toString;
                    }
                },

                clone: function() {
                    return this.init.prototype.extend(this);
                }
            };
        })());

        var WordArray = (C_lib.WordArray = Base.extend({
            init: function(words, sigBytes) {
                words = this.words = words || [];

                if (sigBytes != undefined) {
                    this.sigBytes = sigBytes;
                } else {
                    this.sigBytes = words.length * 4;
                }
            },

            toString: function(encoder) {
                return (encoder || Hex).stringify(this);
            },

            concat: function(wordArray) {
                // Shortcuts
                var thisWords = this.words;
                var thatWords = wordArray.words;
                var thisSigBytes = this.sigBytes;
                var thatSigBytes = wordArray.sigBytes;

                this.clamp();

                if (thisSigBytes % 4) {
                    for (var i = 0; i < thatSigBytes; i++) {
                        var thatByte =
                            (thatWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                        thisWords[(thisSigBytes + i) >>> 2] |=
                            thatByte << (24 - ((thisSigBytes + i) % 4) * 8);
                    }
                } else {
                    for (var i = 0; i < thatSigBytes; i += 4) {
                        thisWords[(thisSigBytes + i) >>> 2] =
                            thatWords[i >>> 2];
                    }
                }
                this.sigBytes += thatSigBytes;

                return this;
            },

            clamp: function() {
                var words = this.words;
                var sigBytes = this.sigBytes;

                words[sigBytes >>> 2] &=
                    0xffffffff << (32 - (sigBytes % 4) * 8);
                words.length = Math.ceil(sigBytes / 4);
            },

            clone: function() {
                var clone = Base.clone.call(this);
                clone.words = this.words.slice(0);

                return clone;
            },

            random: function(nBytes) {
                var words = [];
                for (var i = 0; i < nBytes; i += 4) {
                    words.push((Math.random() * 0x100000000) | 0);
                }

                return new WordArray.init(words, nBytes);
            }
        }));

        var C_enc = (C.enc = {});

        var Hex = (C_enc.Hex = {
            stringify: function(wordArray) {
                var words = wordArray.words;
                var sigBytes = wordArray.sigBytes;

                var hexChars = [];
                for (var i = 0; i < sigBytes; i++) {
                    var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                    hexChars.push((bite >>> 4).toString(16));
                    hexChars.push((bite & 0x0f).toString(16));
                }

                return hexChars.join('');
            },

            parse: function(hexStr) {
                var hexStrLength = hexStr.length;

                var words = [];
                for (var i = 0; i < hexStrLength; i += 2) {
                    words[i >>> 3] |=
                        parseInt(hexStr.substr(i, 2), 16) << (24 - (i % 8) * 4);
                }

                return new WordArray.init(words, hexStrLength / 2);
            }
        });

        var Latin1 = (C_enc.Latin1 = {
            stringify: function(wordArray) {
                var words = wordArray.words;
                var sigBytes = wordArray.sigBytes;

                var latin1Chars = [];
                for (var i = 0; i < sigBytes; i++) {
                    var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                    latin1Chars.push(String.fromCharCode(bite));
                }

                return latin1Chars.join('');
            },

            parse: function(latin1Str) {
                var latin1StrLength = latin1Str.length;

                var words = [];
                for (var i = 0; i < latin1StrLength; i++) {
                    words[i >>> 2] |=
                        (latin1Str.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
                }

                return new WordArray.init(words, latin1StrLength);
            }
        });

        var Utf8 = (C_enc.Utf8 = {
            stringify: function(wordArray) {
                try {
                    return decodeURIComponent(
                        escape(Latin1.stringify(wordArray))
                    );
                } catch (e) {
                    throw new Error('Malformed UTF-8 data');
                }
            },

            parse: function(utf8Str) {
                return Latin1.parse(unescape(encodeURIComponent(utf8Str)));
            }
        });

        var BufferedBlockAlgorithm = (C_lib.BufferedBlockAlgorithm = Base.extend(
            {
                reset: function() {
                    this._data = new WordArray.init();
                    this._nDataBytes = 0;
                },

                _append: function(data) {
                    if (typeof data == 'string') {
                        data = Utf8.parse(data);
                    }

                    this._data.concat(data);
                    this._nDataBytes += data.sigBytes;
                },

                _process: function(doFlush) {
                    var data = this._data;
                    var dataWords = data.words;
                    var dataSigBytes = data.sigBytes;
                    var blockSize = this.blockSize;
                    var blockSizeBytes = blockSize * 4;

                    var nBlocksReady = dataSigBytes / blockSizeBytes;
                    if (doFlush) {
                        nBlocksReady = Math.ceil(nBlocksReady);
                    } else {
                        nBlocksReady = Math.max(
                            (nBlocksReady | 0) - this._minBufferSize,
                            0
                        );
                    }

                    var nWordsReady = nBlocksReady * blockSize;

                    var nBytesReady = Math.min(nWordsReady * 4, dataSigBytes);

                    if (nWordsReady) {
                        for (
                            var offset = 0;
                            offset < nWordsReady;
                            offset += blockSize
                        ) {
                            this._doProcessBlock(dataWords, offset);
                        }

                        var processedWords = dataWords.splice(0, nWordsReady);
                        data.sigBytes -= nBytesReady;
                    }

                    return new WordArray.init(processedWords, nBytesReady);
                },

                clone: function() {
                    var clone = Base.clone.call(this);
                    clone._data = this._data.clone();

                    return clone;
                },

                _minBufferSize: 0
            }
        ));

        var Hasher = (C_lib.Hasher = BufferedBlockAlgorithm.extend({
            cfg: Base.extend(),

            init: function(cfg) {
                this.cfg = this.cfg.extend(cfg);

                this.reset();
            },

            reset: function() {
                BufferedBlockAlgorithm.reset.call(this);

                this._doReset();
            },

            update: function(messageUpdate) {
                this._append(messageUpdate);

                this._process();

                return this;
            },

            finalize: function(messageUpdate) {
                if (messageUpdate) {
                    this._append(messageUpdate);
                }

                var hash = this._doFinalize();

                return hash;
            },

            blockSize: 512 / 32,

            _createHelper: function(hasher) {
                return function(message, cfg) {
                    return new hasher.init(cfg).finalize(message);
                };
            },

            _createHmacHelper: function(hasher) {
                return function(message, key) {
                    return new C_algo.HMAC.init(hasher, key).finalize(message);
                };
            }
        }));

        var C_algo = (C.algo = {});

        return C;
    })(Math);

var dbits;

var canary = 0xdeadbeefcafe;
var j_lm = (canary & 0xffffff) == 0xefcafe;

function BigInteger(a, b, c) {
    if (a != null)
        if ('number' == typeof a) this.fromNumber(a, b, c);
        else if (b == null && 'string' != typeof a) this.fromString(a, 256);
        else this.fromString(a, b);
}

function nbi() {
    return new BigInteger(null);
}

function am3(i, x, w, j, c, n) {
    var xl = x & 0x3fff,
        xh = x >> 14;
    while (--n >= 0) {
        var l = this[i] & 0x3fff;
        var h = this[i++] >> 14;
        var m = xh * l + h * xl;
        l = xl * l + ((m & 0x3fff) << 14) + w[j] + c;
        c = (l >> 28) + (m >> 14) + xh * h;
        w[j++] = l & 0xfffffff;
    }
    return c;
}

BigInteger.prototype.am = am3;
dbits = 28;

BigInteger.prototype.DB = dbits;
BigInteger.prototype.DM = (1 << dbits) - 1;
BigInteger.prototype.DV = 1 << dbits;

var BI_FP = 52;
BigInteger.prototype.FV = Math.pow(2, BI_FP);
BigInteger.prototype.F1 = BI_FP - dbits;
BigInteger.prototype.F2 = 2 * dbits - BI_FP;

var BI_RM = '0123456789abcdefghijklmnopqrstuvwxyz';
var BI_RC = new Array();
var rr, vv;
rr = '0'.charCodeAt(0);
for (vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
rr = 'a'.charCodeAt(0);
for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
rr = 'A'.charCodeAt(0);
for (vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

function int2char(n) {
    return BI_RM.charAt(n);
}
function intAt(s, i) {
    var c = BI_RC[s.charCodeAt(i)];
    return c == null ? -1 : c;
}

function bnpCopyTo(r) {
    for (var i = this.t - 1; i >= 0; --i) r[i] = this[i];
    r.t = this.t;
    r.s = this.s;
}

function bnpFromInt(x) {
    this.t = 1;
    this.s = x < 0 ? -1 : 0;
    if (x > 0) this[0] = x;
    else if (x < -1) this[0] = x + this.DV;
    else this.t = 0;
}

function nbv(i) {
    var r = nbi();
    r.fromInt(i);
    return r;
}

function bnpFromString(s, b) {
    var k;
    if (b == 16) k = 4;
    else if (b == 8) k = 3;
    else if (b == 256) k = 8;
    // byte array
    else if (b == 2) k = 1;
    else if (b == 32) k = 5;
    else if (b == 4) k = 2;
    else {
        this.fromRadix(s, b);
        return;
    }
    this.t = 0;
    this.s = 0;
    var i = s.length,
        mi = false,
        sh = 0;
    while (--i >= 0) {
        var x = k == 8 ? s[i] & 0xff : intAt(s, i);
        if (x < 0) {
            if (s.charAt(i) == '-') mi = true;
            continue;
        }
        mi = false;
        if (sh == 0) this[this.t++] = x;
        else if (sh + k > this.DB) {
            this[this.t - 1] |= (x & ((1 << (this.DB - sh)) - 1)) << sh;
            this[this.t++] = x >> (this.DB - sh);
        } else this[this.t - 1] |= x << sh;
        sh += k;
        if (sh >= this.DB) sh -= this.DB;
    }
    if (k == 8 && (s[0] & 0x80) != 0) {
        this.s = -1;
        if (sh > 0) this[this.t - 1] |= ((1 << (this.DB - sh)) - 1) << sh;
    }
    this.clamp();
    if (mi) BigInteger.ZERO.subTo(this, this);
}

function bnpClamp() {
    var c = this.s & this.DM;
    while (this.t > 0 && this[this.t - 1] == c) --this.t;
}

function bnToString(b) {
    if (this.s < 0) return '-' + this.negate().toString(b);
    var k;
    if (b == 16) k = 4;
    else if (b == 8) k = 3;
    else if (b == 2) k = 1;
    else if (b == 32) k = 5;
    else if (b == 4) k = 2;
    else return this.toRadix(b);
    var km = (1 << k) - 1,
        d,
        m = false,
        r = '',
        i = this.t;
    var p = this.DB - ((i * this.DB) % k);
    if (i-- > 0) {
        if (p < this.DB && (d = this[i] >> p) > 0) {
            m = true;
            r = int2char(d);
        }
        while (i >= 0) {
            if (p < k) {
                d = (this[i] & ((1 << p) - 1)) << (k - p);
                d |= this[--i] >> (p += this.DB - k);
            } else {
                d = (this[i] >> (p -= k)) & km;
                if (p <= 0) {
                    p += this.DB;
                    --i;
                }
            }
            if (d > 0) m = true;
            if (m) r += int2char(d);
        }
    }
    return m ? r : '0';
}

function bnNegate() {
    var r = nbi();
    BigInteger.ZERO.subTo(this, r);
    return r;
}

function bnAbs() {
    return this.s < 0 ? this.negate() : this;
}

function bnCompareTo(a) {
    var r = this.s - a.s;
    if (r != 0) return r;
    var i = this.t;
    r = i - a.t;
    if (r != 0) return this.s < 0 ? -r : r;
    while (--i >= 0) if ((r = this[i] - a[i]) != 0) return r;
    return 0;
}

function nbits(x) {
    var r = 1,
        t;
    if ((t = x >>> 16) != 0) {
        x = t;
        r += 16;
    }
    if ((t = x >> 8) != 0) {
        x = t;
        r += 8;
    }
    if ((t = x >> 4) != 0) {
        x = t;
        r += 4;
    }
    if ((t = x >> 2) != 0) {
        x = t;
        r += 2;
    }
    if ((t = x >> 1) != 0) {
        x = t;
        r += 1;
    }
    return r;
}

function bnBitLength() {
    if (this.t <= 0) return 0;
    return (
        this.DB * (this.t - 1) + nbits(this[this.t - 1] ^ (this.s & this.DM))
    );
}

function bnpDLShiftTo(n, r) {
    var i;
    for (i = this.t - 1; i >= 0; --i) r[i + n] = this[i];
    for (i = n - 1; i >= 0; --i) r[i] = 0;
    r.t = this.t + n;
    r.s = this.s;
}

function bnpDRShiftTo(n, r) {
    for (var i = n; i < this.t; ++i) r[i - n] = this[i];
    r.t = Math.max(this.t - n, 0);
    r.s = this.s;
}

function bnpLShiftTo(n, r) {
    var bs = n % this.DB;
    var cbs = this.DB - bs;
    var bm = (1 << cbs) - 1;
    var ds = Math.floor(n / this.DB),
        c = (this.s << bs) & this.DM,
        i;
    for (i = this.t - 1; i >= 0; --i) {
        r[i + ds + 1] = (this[i] >> cbs) | c;
        c = (this[i] & bm) << bs;
    }
    for (i = ds - 1; i >= 0; --i) r[i] = 0;
    r[ds] = c;
    r.t = this.t + ds + 1;
    r.s = this.s;
    r.clamp();
}

function bnpRShiftTo(n, r) {
    r.s = this.s;
    var ds = Math.floor(n / this.DB);
    if (ds >= this.t) {
        r.t = 0;
        return;
    }
    var bs = n % this.DB;
    var cbs = this.DB - bs;
    var bm = (1 << bs) - 1;
    r[0] = this[ds] >> bs;
    for (var i = ds + 1; i < this.t; ++i) {
        r[i - ds - 1] |= (this[i] & bm) << cbs;
        r[i - ds] = this[i] >> bs;
    }
    if (bs > 0) r[this.t - ds - 1] |= (this.s & bm) << cbs;
    r.t = this.t - ds;
    r.clamp();
}

function bnpSubTo(a, r) {
    var i = 0,
        c = 0,
        m = Math.min(a.t, this.t);
    while (i < m) {
        c += this[i] - a[i];
        r[i++] = c & this.DM;
        c >>= this.DB;
    }
    if (a.t < this.t) {
        c -= a.s;
        while (i < this.t) {
            c += this[i];
            r[i++] = c & this.DM;
            c >>= this.DB;
        }
        c += this.s;
    } else {
        c += this.s;
        while (i < a.t) {
            c -= a[i];
            r[i++] = c & this.DM;
            c >>= this.DB;
        }
        c -= a.s;
    }
    r.s = c < 0 ? -1 : 0;
    if (c < -1) r[i++] = this.DV + c;
    else if (c > 0) r[i++] = c;
    r.t = i;
    r.clamp();
}

function bnpMultiplyTo(a, r) {
    var x = this.abs(),
        y = a.abs();
    var i = x.t;
    r.t = i + y.t;
    while (--i >= 0) r[i] = 0;
    for (i = 0; i < y.t; ++i) r[i + x.t] = x.am(0, y[i], r, i, 0, x.t);
    r.s = 0;
    r.clamp();
    if (this.s != a.s) BigInteger.ZERO.subTo(r, r);
}

function bnpSquareTo(r) {
    var x = this.abs();
    var i = (r.t = 2 * x.t);
    while (--i >= 0) r[i] = 0;
    for (i = 0; i < x.t - 1; ++i) {
        var c = x.am(i, x[i], r, 2 * i, 0, 1);
        if (
            (r[i + x.t] += x.am(
                i + 1,
                2 * x[i],
                r,
                2 * i + 1,
                c,
                x.t - i - 1
            )) >= x.DV
        ) {
            r[i + x.t] -= x.DV;
            r[i + x.t + 1] = 1;
        }
    }
    if (r.t > 0) r[r.t - 1] += x.am(i, x[i], r, 2 * i, 0, 1);
    r.s = 0;
    r.clamp();
}

function bnpDivRemTo(m, q, r) {
    var pm = m.abs();
    if (pm.t <= 0) return;
    var pt = this.abs();
    if (pt.t < pm.t) {
        if (q != null) q.fromInt(0);
        if (r != null) this.copyTo(r);
        return;
    }
    if (r == null) r = nbi();
    var y = nbi(),
        ts = this.s,
        ms = m.s;
    var nsh = this.DB - nbits(pm[pm.t - 1]); // normalize modulus
    if (nsh > 0) {
        pm.lShiftTo(nsh, y);
        pt.lShiftTo(nsh, r);
    } else {
        pm.copyTo(y);
        pt.copyTo(r);
    }
    var ys = y.t;
    var y0 = y[ys - 1];
    if (y0 == 0) return;
    var yt = y0 * (1 << this.F1) + (ys > 1 ? y[ys - 2] >> this.F2 : 0);
    var d1 = this.FV / yt,
        d2 = (1 << this.F1) / yt,
        e = 1 << this.F2;
    var i = r.t,
        j = i - ys,
        t = q == null ? nbi() : q;
    y.dlShiftTo(j, t);
    if (r.compareTo(t) >= 0) {
        r[r.t++] = 1;
        r.subTo(t, r);
    }
    BigInteger.ONE.dlShiftTo(ys, t);
    t.subTo(y, y);
    while (y.t < ys) y[y.t++] = 0;
    while (--j >= 0) {
        var qd =
            r[--i] == y0
                ? this.DM
                : Math.floor(r[i] * d1 + (r[i - 1] + e) * d2);
        if ((r[i] += y.am(0, qd, r, j, 0, ys)) < qd) {
            y.dlShiftTo(j, t);
            r.subTo(t, r);
            while (r[i] < --qd) r.subTo(t, r);
        }
    }
    if (q != null) {
        r.drShiftTo(ys, q);
        if (ts != ms) BigInteger.ZERO.subTo(q, q);
    }
    r.t = ys;
    r.clamp();
    if (nsh > 0) r.rShiftTo(nsh, r);
    if (ts < 0) BigInteger.ZERO.subTo(r, r);
}

function bnMod(a) {
    var r = nbi();
    this.abs().divRemTo(a, null, r);
    if (this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r, r);
    return r;
}

function Classic(m) {
    this.m = m;
}
function cConvert(x) {
    if (x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
    else return x;
}
function cRevert(x) {
    return x;
}
function cReduce(x) {
    x.divRemTo(this.m, null, x);
}
function cMulTo(x, y, r) {
    x.multiplyTo(y, r);
    this.reduce(r);
}
function cSqrTo(x, r) {
    x.squareTo(r);
    this.reduce(r);
}

Classic.prototype.convert = cConvert;
Classic.prototype.revert = cRevert;
Classic.prototype.reduce = cReduce;
Classic.prototype.mulTo = cMulTo;
Classic.prototype.sqrTo = cSqrTo;

function bnpInvDigit() {
    if (this.t < 1) return 0;
    var x = this[0];
    if ((x & 1) == 0) return 0;
    var y = x & 3; // y == 1/x mod 2^2
    y = (y * (2 - (x & 0xf) * y)) & 0xf; // y == 1/x mod 2^4
    y = (y * (2 - (x & 0xff) * y)) & 0xff; // y == 1/x mod 2^8
    y = (y * (2 - (((x & 0xffff) * y) & 0xffff))) & 0xffff; // y == 1/x mod 2^16
    // last step - calculate inverse mod DV directly;
    // assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
    y = (y * (2 - ((x * y) % this.DV))) % this.DV; // y == 1/x mod 2^dbits
    // we really want the negative inverse, and -DV < y < DV
    return y > 0 ? this.DV - y : -y;
}

function Montgomery(m) {
    this.m = m;
    this.mp = m.invDigit();
    this.mpl = this.mp & 0x7fff;
    this.mph = this.mp >> 15;
    this.um = (1 << (m.DB - 15)) - 1;
    this.mt2 = 2 * m.t;
}

function montConvert(x) {
    var r = nbi();
    x.abs().dlShiftTo(this.m.t, r);
    r.divRemTo(this.m, null, r);
    if (x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r, r);
    return r;
}

function montRevert(x) {
    var r = nbi();
    x.copyTo(r);
    this.reduce(r);
    return r;
}

function montReduce(x) {
    while (
        x.t <= this.mt2 // pad x so am has enough room later
    )
        x[x.t++] = 0;
    for (var i = 0; i < this.m.t; ++i) {
        var j = x[i] & 0x7fff;
        var u0 =
            (j * this.mpl +
                (((j * this.mph + (x[i] >> 15) * this.mpl) & this.um) << 15)) &
            x.DM;

        j = i + this.m.t;
        x[j] += this.m.am(0, u0, x, i, 0, this.m.t);

        while (x[j] >= x.DV) {
            x[j] -= x.DV;
            x[++j]++;
        }
    }
    x.clamp();
    x.drShiftTo(this.m.t, x);
    if (x.compareTo(this.m) >= 0) x.subTo(this.m, x);
}

function montSqrTo(x, r) {
    x.squareTo(r);
    this.reduce(r);
}

function montMulTo(x, y, r) {
    x.multiplyTo(y, r);
    this.reduce(r);
}

Montgomery.prototype.convert = montConvert;
Montgomery.prototype.revert = montRevert;
Montgomery.prototype.reduce = montReduce;
Montgomery.prototype.mulTo = montMulTo;
Montgomery.prototype.sqrTo = montSqrTo;

function bnpIsEven() {
    return (this.t > 0 ? this[0] & 1 : this.s) == 0;
}

BigInteger.prototype.copyTo = bnpCopyTo;
BigInteger.prototype.fromInt = bnpFromInt;
BigInteger.prototype.fromString = bnpFromString;
BigInteger.prototype.clamp = bnpClamp;
BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
BigInteger.prototype.drShiftTo = bnpDRShiftTo;
BigInteger.prototype.lShiftTo = bnpLShiftTo;
BigInteger.prototype.rShiftTo = bnpRShiftTo;
BigInteger.prototype.subTo = bnpSubTo;
BigInteger.prototype.multiplyTo = bnpMultiplyTo;
BigInteger.prototype.squareTo = bnpSquareTo;
BigInteger.prototype.divRemTo = bnpDivRemTo;
BigInteger.prototype.invDigit = bnpInvDigit;
BigInteger.prototype.isEven = bnpIsEven;

BigInteger.prototype.toString = bnToString;
BigInteger.prototype.negate = bnNegate;
BigInteger.prototype.abs = bnAbs;
BigInteger.prototype.compareTo = bnCompareTo;
BigInteger.prototype.bitLength = bnBitLength;
BigInteger.prototype.mod = bnMod;

BigInteger.ZERO = nbv(0);
BigInteger.ONE = nbv(1);

function bnClone() {
    var r = nbi();
    this.copyTo(r);
    return r;
}

function bnIntValue() {
    if (this.s < 0) {
        if (this.t == 1) return this[0] - this.DV;
        else if (this.t == 0) return -1;
    } else if (this.t == 1) return this[0];
    else if (this.t == 0) return 0;

    return ((this[1] & ((1 << (32 - this.DB)) - 1)) << this.DB) | this[0];
}

function bnByteValue() {
    return this.t == 0 ? this.s : (this[0] << 24) >> 24;
}

function bnShortValue() {
    return this.t == 0 ? this.s : (this[0] << 16) >> 16;
}

function bnpChunkSize(r) {
    return Math.floor((Math.LN2 * this.DB) / Math.log(r));
}

function bnSigNum() {
    if (this.s < 0) return -1;
    else if (this.t <= 0 || (this.t == 1 && this[0] <= 0)) return 0;
    else return 1;
}

function bnpToRadix(b) {
    if (b == null) b = 10;
    if (this.signum() == 0 || b < 2 || b > 36) return '0';
    var cs = this.chunkSize(b);
    var a = Math.pow(b, cs);
    var d = nbv(a),
        y = nbi(),
        z = nbi(),
        r = '';
    this.divRemTo(d, y, z);

    while (y.signum() > 0) {
        r = (a + z.intValue()).toString(b).substr(1) + r;
        y.divRemTo(d, y, z);
    }
    return z.intValue().toString(b) + r;
}

function bnpFromRadix(s, b) {
    this.fromInt(0);
    if (b == null) b = 10;
    var cs = this.chunkSize(b);
    var d = Math.pow(b, cs),
        mi = false,
        j = 0,
        w = 0;
    for (var i = 0; i < s.length; ++i) {
        var x = intAt(s, i);
        if (x < 0) {
            if (s.charAt(i) == '-' && this.signum() == 0) mi = true;
            continue;
        }
        w = b * w + x;
        if (++j >= cs) {
            this.dMultiply(d);
            this.dAddOffset(w, 0);
            j = 0;
            w = 0;
        }
    }
    if (j > 0) {
        this.dMultiply(Math.pow(b, j));
        this.dAddOffset(w, 0);
    }
    if (mi) BigInteger.ZERO.subTo(this, this);
}

function bnpFromNumber(a, b, c) {
    if ('number' == typeof b) {
        if (a < 2) this.fromInt(1);
        else {
            this.fromNumber(a, c);
            if (!this.testBit(a - 1))
                // force MSB set
                this.bitwiseTo(BigInteger.ONE.shiftLeft(a - 1), op_or, this);
            if (this.isEven()) this.dAddOffset(1, 0); // force odd
            while (!this.isProbablePrime(b)) {
                this.dAddOffset(2, 0);
                if (this.bitLength() > a)
                    this.subTo(BigInteger.ONE.shiftLeft(a - 1), this);
            }
        }
    } else {
        var x = new Array(),
            t = a & 7;
        x.length = (a >> 3) + 1;
        b.nextBytes(x);
        if (t > 0) x[0] &= (1 << t) - 1;
        else x[0] = 0;
        this.fromString(x, 256);
    }
}

function bnToByteArray() {
    var i = this.t,
        r = new Array();
    r[0] = this.s;
    var p = this.DB - ((i * this.DB) % 8),
        d,
        k = 0;
    if (i-- > 0) {
        if (p < this.DB && (d = this[i] >> p) != (this.s & this.DM) >> p)
            r[k++] = d | (this.s << (this.DB - p));
        while (i >= 0) {
            if (p < 8) {
                d = (this[i] & ((1 << p) - 1)) << (8 - p);
                d |= this[--i] >> (p += this.DB - 8);
            } else {
                d = (this[i] >> (p -= 8)) & 0xff;
                if (p <= 0) {
                    p += this.DB;
                    --i;
                }
            }
            if ((d & 0x80) != 0) d |= -256;
            if (k == 0 && (this.s & 0x80) != (d & 0x80)) ++k;
            if (k > 0 || d != this.s) r[k++] = d;
        }
    }
    return r;
}

function bnEquals(a) {
    return this.compareTo(a) == 0;
}
function bnMin(a) {
    return this.compareTo(a) < 0 ? this : a;
}
function bnMax(a) {
    return this.compareTo(a) > 0 ? this : a;
}

function bnpBitwiseTo(a, op, r) {
    var i,
        f,
        m = Math.min(a.t, this.t);
    for (i = 0; i < m; ++i) r[i] = op(this[i], a[i]);
    if (a.t < this.t) {
        f = a.s & this.DM;
        for (i = m; i < this.t; ++i) r[i] = op(this[i], f);
        r.t = this.t;
    } else {
        f = this.s & this.DM;
        for (i = m; i < a.t; ++i) r[i] = op(f, a[i]);
        r.t = a.t;
    }
    r.s = op(this.s, a.s);
    r.clamp();
}

function op_and(x, y) {
    return x & y;
}
function bnAnd(a) {
    var r = nbi();
    this.bitwiseTo(a, op_and, r);
    return r;
}

function op_or(x, y) {
    return x | y;
}
function bnOr(a) {
    var r = nbi();
    this.bitwiseTo(a, op_or, r);
    return r;
}

function op_xor(x, y) {
    return x ^ y;
}
function bnXor(a) {
    var r = nbi();
    this.bitwiseTo(a, op_xor, r);
    return r;
}

function op_andnot(x, y) {
    return x & ~y;
}
function bnAndNot(a) {
    var r = nbi();
    this.bitwiseTo(a, op_andnot, r);
    return r;
}

function bnNot() {
    var r = nbi();
    for (var i = 0; i < this.t; ++i) r[i] = this.DM & ~this[i];
    r.t = this.t;
    r.s = ~this.s;
    return r;
}

function bnShiftLeft(n) {
    var r = nbi();
    if (n < 0) this.rShiftTo(-n, r);
    else this.lShiftTo(n, r);
    return r;
}

function bnShiftRight(n) {
    var r = nbi();
    if (n < 0) this.lShiftTo(-n, r);
    else this.rShiftTo(n, r);
    return r;
}

function lbit(x) {
    if (x == 0) return -1;
    var r = 0;
    if ((x & 0xffff) == 0) {
        x >>= 16;
        r += 16;
    }
    if ((x & 0xff) == 0) {
        x >>= 8;
        r += 8;
    }
    if ((x & 0xf) == 0) {
        x >>= 4;
        r += 4;
    }
    if ((x & 3) == 0) {
        x >>= 2;
        r += 2;
    }
    if ((x & 1) == 0) ++r;
    return r;
}

function bnGetLowestSetBit() {
    for (var i = 0; i < this.t; ++i)
        if (this[i] != 0) return i * this.DB + lbit(this[i]);
    if (this.s < 0) return this.t * this.DB;
    return -1;
}

function cbit(x) {
    var r = 0;
    while (x != 0) {
        x &= x - 1;
        ++r;
    }
    return r;
}

function bnBitCount() {
    var r = 0,
        x = this.s & this.DM;
    for (var i = 0; i < this.t; ++i) r += cbit(this[i] ^ x);
    return r;
}

function bnTestBit(n) {
    var j = Math.floor(n / this.DB);
    if (j >= this.t) return this.s != 0;
    return (this[j] & (1 << n % this.DB)) != 0;
}

function bnpChangeBit(n, op) {
    var r = BigInteger.ONE.shiftLeft(n);
    this.bitwiseTo(r, op, r);
    return r;
}

function bnSetBit(n) {
    return this.changeBit(n, op_or);
}

function bnClearBit(n) {
    return this.changeBit(n, op_andnot);
}

function bnFlipBit(n) {
    return this.changeBit(n, op_xor);
}

function bnpAddTo(a, r) {
    var i = 0,
        c = 0,
        m = Math.min(a.t, this.t);
    while (i < m) {
        c += this[i] + a[i];
        r[i++] = c & this.DM;
        c >>= this.DB;
    }
    if (a.t < this.t) {
        c += a.s;
        while (i < this.t) {
            c += this[i];
            r[i++] = c & this.DM;
            c >>= this.DB;
        }
        c += this.s;
    } else {
        c += this.s;
        while (i < a.t) {
            c += a[i];
            r[i++] = c & this.DM;
            c >>= this.DB;
        }
        c += a.s;
    }
    r.s = c < 0 ? -1 : 0;
    if (c > 0) r[i++] = c;
    else if (c < -1) r[i++] = this.DV + c;
    r.t = i;
    r.clamp();
}

function bnAdd(a) {
    var r = nbi();
    this.addTo(a, r);
    return r;
}
function bnSubtract(a) {
    var r = nbi();
    this.subTo(a, r);
    return r;
}
function bnMultiply(a) {
    var r = nbi();
    this.multiplyTo(a, r);
    return r;
}
function bnSquare() {
    var r = nbi();
    this.squareTo(r);
    return r;
}
function bnDivide(a) {
    var r = nbi();
    this.divRemTo(a, r, null);
    return r;
}
function bnRemainder(a) {
    var r = nbi();
    this.divRemTo(a, null, r);
    return r;
}

function bnDivideAndRemainder(a) {
    var q = nbi(),
        r = nbi();
    this.divRemTo(a, q, r);
    return new Array(q, r);
}

function bnpDMultiply(n) {
    this[this.t] = this.am(0, n - 1, this, 0, 0, this.t);
    ++this.t;
    this.clamp();
}

function bnpDAddOffset(n, w) {
    if (n == 0) return;
    while (this.t <= w) this[this.t++] = 0;
    this[w] += n;
    while (this[w] >= this.DV) {
        this[w] -= this.DV;
        if (++w >= this.t) this[this.t++] = 0;
        ++this[w];
    }
}

function NullExp() {}
function nNop(x) {
    return x;
}
function nMulTo(x, y, r) {
    x.multiplyTo(y, r);
}
function nSqrTo(x, r) {
    x.squareTo(r);
}

NullExp.prototype.convert = nNop;
NullExp.prototype.revert = nNop;
NullExp.prototype.mulTo = nMulTo;
NullExp.prototype.sqrTo = nSqrTo;

function bnPow(e) {
    return this.exp(e, new NullExp());
}

function bnpMultiplyLowerTo(a, n, r) {
    var i = Math.min(this.t + a.t, n);
    r.s = 0;
    r.t = i;
    while (i > 0) r[--i] = 0;
    var j;
    for (j = r.t - this.t; i < j; ++i)
        r[i + this.t] = this.am(0, a[i], r, i, 0, this.t);
    for (j = Math.min(a.t, n); i < j; ++i) this.am(0, a[i], r, i, 0, n - i);
    r.clamp();
}

function bnpMultiplyUpperTo(a, n, r) {
    --n;
    var i = (r.t = this.t + a.t - n);
    r.s = 0;
    while (--i >= 0) r[i] = 0;
    for (i = Math.max(n - this.t, 0); i < a.t; ++i)
        r[this.t + i - n] = this.am(n - i, a[i], r, 0, 0, this.t + i - n);
    r.clamp();
    r.drShiftTo(1, r);
}

function Barrett(m) {
    this.r2 = nbi();
    this.q3 = nbi();
    BigInteger.ONE.dlShiftTo(2 * m.t, this.r2);
    this.mu = this.r2.divide(m);
    this.m = m;
}

function barrettConvert(x) {
    if (x.s < 0 || x.t > 2 * this.m.t) return x.mod(this.m);
    else if (x.compareTo(this.m) < 0) return x;
    else {
        var r = nbi();
        x.copyTo(r);
        this.reduce(r);
        return r;
    }
}

function barrettRevert(x) {
    return x;
}

function barrettReduce(x) {
    x.drShiftTo(this.m.t - 1, this.r2);
    if (x.t > this.m.t + 1) {
        x.t = this.m.t + 1;
        x.clamp();
    }
    this.mu.multiplyUpperTo(this.r2, this.m.t + 1, this.q3);
    this.m.multiplyLowerTo(this.q3, this.m.t + 1, this.r2);
    while (x.compareTo(this.r2) < 0) x.dAddOffset(1, this.m.t + 1);
    x.subTo(this.r2, x);
    while (x.compareTo(this.m) >= 0) x.subTo(this.m, x);
}

function barrettSqrTo(x, r) {
    x.squareTo(r);
    this.reduce(r);
}
function barrettMulTo(x, y, r) {
    x.multiplyTo(y, r);
    this.reduce(r);
}

Barrett.prototype.convert = barrettConvert;
Barrett.prototype.revert = barrettRevert;
Barrett.prototype.reduce = barrettReduce;
Barrett.prototype.mulTo = barrettMulTo;
Barrett.prototype.sqrTo = barrettSqrTo;

function bnModPow(e, m) {
    var i = e.bitLength(),
        k,
        r = nbv(1),
        z;
    if (i <= 0) return r;
    else if (i < 18) k = 1;
    else if (i < 48) k = 3;
    else if (i < 144) k = 4;
    else if (i < 768) k = 5;
    else k = 6;
    if (i < 8) z = new Classic(m);
    else if (m.isEven()) z = new Barrett(m);
    else z = new Montgomery(m);

    var g = new Array(),
        n = 3,
        k1 = k - 1,
        km = (1 << k) - 1;
    g[1] = z.convert(this);
    if (k > 1) {
        var g2 = nbi();
        z.sqrTo(g[1], g2);
        while (n <= km) {
            g[n] = nbi();
            z.mulTo(g2, g[n - 2], g[n]);
            n += 2;
        }
    }

    var j = e.t - 1,
        w,
        is1 = true,
        r2 = nbi(),
        t;
    i = nbits(e[j]) - 1;
    while (j >= 0) {
        if (i >= k1) w = (e[j] >> (i - k1)) & km;
        else {
            w = (e[j] & ((1 << (i + 1)) - 1)) << (k1 - i);
            if (j > 0) w |= e[j - 1] >> (this.DB + i - k1);
        }

        n = k;
        while ((w & 1) == 0) {
            w >>= 1;
            --n;
        }
        if ((i -= n) < 0) {
            i += this.DB;
            --j;
        }
        if (is1) {
            g[w].copyTo(r);
            is1 = false;
        } else {
            while (n > 1) {
                z.sqrTo(r, r2);
                z.sqrTo(r2, r);
                n -= 2;
            }
            if (n > 0) z.sqrTo(r, r2);
            else {
                t = r;
                r = r2;
                r2 = t;
            }
            z.mulTo(r2, g[w], r);
        }

        while (j >= 0 && (e[j] & (1 << i)) == 0) {
            z.sqrTo(r, r2);
            t = r;
            r = r2;
            r2 = t;
            if (--i < 0) {
                i = this.DB - 1;
                --j;
            }
        }
    }
    return z.revert(r);
}

function bnGCD(a) {
    var x = this.s < 0 ? this.negate() : this.clone();
    var y = a.s < 0 ? a.negate() : a.clone();
    if (x.compareTo(y) < 0) {
        var t = x;
        x = y;
        y = t;
    }
    var i = x.getLowestSetBit(),
        g = y.getLowestSetBit();
    if (g < 0) return x;
    if (i < g) g = i;
    if (g > 0) {
        x.rShiftTo(g, x);
        y.rShiftTo(g, y);
    }
    while (x.signum() > 0) {
        if ((i = x.getLowestSetBit()) > 0) x.rShiftTo(i, x);
        if ((i = y.getLowestSetBit()) > 0) y.rShiftTo(i, y);
        if (x.compareTo(y) >= 0) {
            x.subTo(y, x);
            x.rShiftTo(1, x);
        } else {
            y.subTo(x, y);
            y.rShiftTo(1, y);
        }
    }
    if (g > 0) y.lShiftTo(g, y);
    return y;
}

function bnpModInt(n) {
    if (n <= 0) return 0;
    var d = this.DV % n,
        r = this.s < 0 ? n - 1 : 0;
    if (this.t > 0)
        if (d == 0) r = this[0] % n;
        else for (var i = this.t - 1; i >= 0; --i) r = (d * r + this[i]) % n;
    return r;
}

function bnModInverse(m) {
    var ac = m.isEven();
    if ((this.isEven() && ac) || m.signum() == 0) return BigInteger.ZERO;
    var u = m.clone(),
        v = this.clone();
    var a = nbv(1),
        b = nbv(0),
        c = nbv(0),
        d = nbv(1);
    while (u.signum() != 0) {
        while (u.isEven()) {
            u.rShiftTo(1, u);
            if (ac) {
                if (!a.isEven() || !b.isEven()) {
                    a.addTo(this, a);
                    b.subTo(m, b);
                }
                a.rShiftTo(1, a);
            } else if (!b.isEven()) b.subTo(m, b);
            b.rShiftTo(1, b);
        }
        while (v.isEven()) {
            v.rShiftTo(1, v);
            if (ac) {
                if (!c.isEven() || !d.isEven()) {
                    c.addTo(this, c);
                    d.subTo(m, d);
                }
                c.rShiftTo(1, c);
            } else if (!d.isEven()) d.subTo(m, d);
            d.rShiftTo(1, d);
        }
        if (u.compareTo(v) >= 0) {
            u.subTo(v, u);
            if (ac) a.subTo(c, a);
            b.subTo(d, b);
        } else {
            v.subTo(u, v);
            if (ac) c.subTo(a, c);
            d.subTo(b, d);
        }
    }
    if (v.compareTo(BigInteger.ONE) != 0) return BigInteger.ZERO;
    if (d.compareTo(m) >= 0) return d.subtract(m);
    if (d.signum() < 0) d.addTo(m, d);
    else return d;
    if (d.signum() < 0) return d.add(m);
    else return d;
}

var lowprimes = [
    2,
    3,
    5,
    7,
    11,
    13,
    17,
    19,
    23,
    29,
    31,
    37,
    41,
    43,
    47,
    53,
    59,
    61,
    67,
    71,
    73,
    79,
    83,
    89,
    97,
    101,
    103,
    107,
    109,
    113,
    127,
    131,
    137,
    139,
    149,
    151,
    157,
    163,
    167,
    173,
    179,
    181,
    191,
    193,
    197,
    199,
    211,
    223,
    227,
    229,
    233,
    239,
    241,
    251,
    257,
    263,
    269,
    271,
    277,
    281,
    283,
    293,
    307,
    311,
    313,
    317,
    331,
    337,
    347,
    349,
    353,
    359,
    367,
    373,
    379,
    383,
    389,
    397,
    401,
    409,
    419,
    421,
    431,
    433,
    439,
    443,
    449,
    457,
    461,
    463,
    467,
    479,
    487,
    491,
    499,
    503,
    509,
    521,
    523,
    541,
    547,
    557,
    563,
    569,
    571,
    577,
    587,
    593,
    599,
    601,
    607,
    613,
    617,
    619,
    631,
    641,
    643,
    647,
    653,
    659,
    661,
    673,
    677,
    683,
    691,
    701,
    709,
    719,
    727,
    733,
    739,
    743,
    751,
    757,
    761,
    769,
    773,
    787,
    797,
    809,
    811,
    821,
    823,
    827,
    829,
    839,
    853,
    857,
    859,
    863,
    877,
    881,
    883,
    887,
    907,
    911,
    919,
    929,
    937,
    941,
    947,
    953,
    967,
    971,
    977,
    983,
    991,
    997
];
var lplim = (1 << 26) / lowprimes[lowprimes.length - 1];

function bnIsProbablePrime(t) {
    var i,
        x = this.abs();
    if (x.t == 1 && x[0] <= lowprimes[lowprimes.length - 1]) {
        for (i = 0; i < lowprimes.length; ++i)
            if (x[0] == lowprimes[i]) return true;
        return false;
    }
    if (x.isEven()) return false;
    i = 1;
    while (i < lowprimes.length) {
        var m = lowprimes[i],
            j = i + 1;
        while (j < lowprimes.length && m < lplim) m *= lowprimes[j++];
        m = x.modInt(m);
        while (i < j) if (m % lowprimes[i++] == 0) return false;
    }
    return x.millerRabin(t);
}

function bnpMillerRabin(t) {
    var n1 = this.subtract(BigInteger.ONE);
    var k = n1.getLowestSetBit();
    if (k <= 0) return false;
    var r = n1.shiftRight(k);
    t = (t + 1) >> 1;
    if (t > lowprimes.length) t = lowprimes.length;
    var a = nbi();
    for (var i = 0; i < t; ++i) {
        a.fromInt(lowprimes[Math.floor(Math.random() * lowprimes.length)]);
        var y = a.modPow(r, this);
        if (y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0) {
            var j = 1;
            while (j++ < k && y.compareTo(n1) != 0) {
                y = y.modPowInt(2, this);
                if (y.compareTo(BigInteger.ONE) == 0) return false;
            }
            if (y.compareTo(n1) != 0) return false;
        }
    }
    return true;
}

BigInteger.prototype.chunkSize = bnpChunkSize;
BigInteger.prototype.toRadix = bnpToRadix;
BigInteger.prototype.fromRadix = bnpFromRadix;
BigInteger.prototype.fromNumber = bnpFromNumber;
BigInteger.prototype.bitwiseTo = bnpBitwiseTo;
BigInteger.prototype.changeBit = bnpChangeBit;
BigInteger.prototype.addTo = bnpAddTo;
BigInteger.prototype.dMultiply = bnpDMultiply;
BigInteger.prototype.dAddOffset = bnpDAddOffset;
BigInteger.prototype.multiplyLowerTo = bnpMultiplyLowerTo;
BigInteger.prototype.multiplyUpperTo = bnpMultiplyUpperTo;
BigInteger.prototype.modInt = bnpModInt;
BigInteger.prototype.millerRabin = bnpMillerRabin;

BigInteger.prototype.clone = bnClone;
BigInteger.prototype.intValue = bnIntValue;
BigInteger.prototype.byteValue = bnByteValue;
BigInteger.prototype.shortValue = bnShortValue;
BigInteger.prototype.signum = bnSigNum;
BigInteger.prototype.toByteArray = bnToByteArray;
BigInteger.prototype.equals = bnEquals;
BigInteger.prototype.min = bnMin;
BigInteger.prototype.max = bnMax;
BigInteger.prototype.and = bnAnd;
BigInteger.prototype.or = bnOr;
BigInteger.prototype.xor = bnXor;
BigInteger.prototype.andNot = bnAndNot;
BigInteger.prototype.not = bnNot;
BigInteger.prototype.shiftLeft = bnShiftLeft;
BigInteger.prototype.shiftRight = bnShiftRight;
BigInteger.prototype.getLowestSetBit = bnGetLowestSetBit;
BigInteger.prototype.bitCount = bnBitCount;
BigInteger.prototype.testBit = bnTestBit;
BigInteger.prototype.setBit = bnSetBit;
BigInteger.prototype.clearBit = bnClearBit;
BigInteger.prototype.flipBit = bnFlipBit;
BigInteger.prototype.add = bnAdd;
BigInteger.prototype.subtract = bnSubtract;
BigInteger.prototype.multiply = bnMultiply;
BigInteger.prototype.divide = bnDivide;
BigInteger.prototype.remainder = bnRemainder;
BigInteger.prototype.divideAndRemainder = bnDivideAndRemainder;
BigInteger.prototype.modPow = bnModPow;
BigInteger.prototype.modInverse = bnModInverse;
BigInteger.prototype.pow = bnPow;
BigInteger.prototype.gcd = bnGCD;
BigInteger.prototype.isProbablePrime = bnIsProbablePrime;

BigInteger.prototype.square = bnSquare;

function Arcfour() {
    this.i = 0;
    this.j = 0;
    this.S = new Array();
}

function ARC4init(key) {
    var i, j, t;
    for (i = 0; i < 256; ++i) this.S[i] = i;
    j = 0;
    for (i = 0; i < 256; ++i) {
        j = (j + this.S[i] + key[i % key.length]) & 255;
        t = this.S[i];
        this.S[i] = this.S[j];
        this.S[j] = t;
    }
    this.i = 0;
    this.j = 0;
}

function ARC4next() {
    var t;
    this.i = (this.i + 1) & 255;
    this.j = (this.j + this.S[this.i]) & 255;
    t = this.S[this.i];
    this.S[this.i] = this.S[this.j];
    this.S[this.j] = t;
    return this.S[(t + this.S[this.i]) & 255];
}

Arcfour.prototype.init = ARC4init;
Arcfour.prototype.next = ARC4next;

function prng_newstate() {
    return new Arcfour();
}

var rng_psize = 256;
var rng_state;
var rng_pool;
var rng_pptr;

function rng_seed_int(x) {
    rng_pool[rng_pptr++] ^= x & 255;
    rng_pool[rng_pptr++] ^= (x >> 8) & 255;
    rng_pool[rng_pptr++] ^= (x >> 16) & 255;
    rng_pool[rng_pptr++] ^= (x >> 24) & 255;
    if (rng_pptr >= rng_psize) rng_pptr -= rng_psize;
}

function rng_seed_time() {
    rng_seed_int(new Date().getTime());
}

if (rng_pool == null) {
    rng_pool = new Array();
    rng_pptr = 0;
    var t;

    var qrng_pool_ = new Array(255);
    var j = 0;
    var min = 0;
    var max = 255;

    while (j < qrng_pool_.length) {
        var randnum = Math.floor(Math.random() * (max - min + 1) + min);
        var found = false;

        for (var i = 0; i < qrng_pool_.length; i++) {
            if (qrng_pool_[i] === randnum) {
                found = true;
                break;
            }
        }

        if (!found) {
            qrng_pool_[j] = randnum;
            j++;
        }
    }
    rng_pool = qrng_pool_;

    while (rng_pptr < rng_psize) {
        t = Math.floor(65536 * Math.random());
        rng_pool[rng_pptr++] = t >>> 8;
        rng_pool[rng_pptr++] = t & 255;
    }
    rng_pptr = 0;
    rng_seed_time();
}

function rng_get_byte() {
    if (rng_state == null) {
        rng_seed_time();
        rng_state = prng_newstate();
        rng_state.init(rng_pool);
        for (rng_pptr = 0; rng_pptr < rng_pool.length; ++rng_pptr)
            rng_pool[rng_pptr] = 0;
        rng_pptr = 0;
    }

    return rng_state.next();
}

function rng_get_bytes(ba) {
    var i;
    for (i = 0; i < ba.length; ++i) ba[i] = rng_get_byte();
}

function SecureRandom() {}

SecureRandom.prototype.nextBytes = rng_get_bytes;

(function(Math) {
    var C = CryptoJS;
    var C_lib = C.lib;
    var WordArray = C_lib.WordArray;
    var Hasher = C_lib.Hasher;
    var C_algo = C.algo;
    var H = [];
    var K = [];

    (function() {
        function isPrime(n) {
            var sqrtN = Math.sqrt(n);
            for (var factor = 2; factor <= sqrtN; factor++) {
                if (!(n % factor)) {
                    return false;
                }
            }

            return true;
        }

        function getFractionalBits(n) {
            return ((n - (n | 0)) * 0x100000000) | 0;
        }

        var n = 2;
        var nPrime = 0;
        while (nPrime < 64) {
            if (isPrime(n)) {
                if (nPrime < 8) {
                    H[nPrime] = getFractionalBits(Math.pow(n, 1 / 2));
                }
                K[nPrime] = getFractionalBits(Math.pow(n, 1 / 3));

                nPrime++;
            }

            n++;
        }
    })();

    var W = [];

    var SHA256 = (C_algo.SHA256 = Hasher.extend({
        _doReset: function() {
            this._hash = new WordArray.init(H.slice(0));
        },

        _doProcessBlock: function(M, offset) {
            var H = this._hash.words;
            var a = H[0];
            var b = H[1];
            var c = H[2];
            var d = H[3];
            var e = H[4];
            var f = H[5];
            var g = H[6];
            var h = H[7];

            for (var i = 0; i < 64; i++) {
                if (i < 16) {
                    W[i] = M[offset + i] | 0;
                } else {
                    var gamma0x = W[i - 15];
                    var gamma0 =
                        ((gamma0x << 25) | (gamma0x >>> 7)) ^
                        ((gamma0x << 14) | (gamma0x >>> 18)) ^
                        (gamma0x >>> 3);

                    var gamma1x = W[i - 2];
                    var gamma1 =
                        ((gamma1x << 15) | (gamma1x >>> 17)) ^
                        ((gamma1x << 13) | (gamma1x >>> 19)) ^
                        (gamma1x >>> 10);

                    W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16];
                }

                var ch = (e & f) ^ (~e & g);
                var maj = (a & b) ^ (a & c) ^ (b & c);

                var sigma0 =
                    ((a << 30) | (a >>> 2)) ^
                    ((a << 19) | (a >>> 13)) ^
                    ((a << 10) | (a >>> 22));
                var sigma1 =
                    ((e << 26) | (e >>> 6)) ^
                    ((e << 21) | (e >>> 11)) ^
                    ((e << 7) | (e >>> 25));

                var t1 = h + sigma1 + ch + K[i] + W[i];
                var t2 = sigma0 + maj;

                h = g;
                g = f;
                f = e;
                e = (d + t1) | 0;
                d = c;
                c = b;
                b = a;
                a = (t1 + t2) | 0;
            }

            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0;
            H[5] = (H[5] + f) | 0;
            H[6] = (H[6] + g) | 0;
            H[7] = (H[7] + h) | 0;
        },

        _doFinalize: function() {
            var data = this._data;
            var dataWords = data.words;
            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;

            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - (nBitsLeft % 32));
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(
                nBitsTotal / 0x100000000
            );
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
            data.sigBytes = dataWords.length * 4;

            this._process();

            return this._hash;
        },

        clone: function() {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();

            return clone;
        }
    }));

    C.SHA256 = Hasher._createHelper(SHA256);

    C.HmacSHA256 = Hasher._createHmacHelper(SHA256);
})(Math);

function parseBigInt(str, r) {
    return new BigInteger(str, r);
}

function linebrk(s, n) {
    var ret = '';
    var i = 0;
    while (i + n < s.length) {
        ret += s.substring(i, i + n) + '\n';
        i += n;
    }
    return ret + s.substring(i, s.length);
}

function byte2Hex(b) {
    if (b < 0x10) return '0' + b.toString(16);
    else return b.toString(16);
}

// PKCS#1 (type 2, random) pad input string s to n bytes, and return a bigint
function pkcs1pad2(s, n) {
    if (n < s.length + 11) {
        throw 'Message too long for RSA';
        return null;
    }
    var ba = new Array();
    var i = s.length - 1;
    while (i >= 0 && n > 0) {
        var c = s.charCodeAt(i--);
        if (c < 128) {
            // encode using utf-8
            ba[--n] = c;
        } else if (c > 127 && c < 2048) {
            ba[--n] = (c & 63) | 128;
            ba[--n] = (c >> 6) | 192;
        } else {
            ba[--n] = (c & 63) | 128;
            ba[--n] = ((c >> 6) & 63) | 128;
            ba[--n] = (c >> 12) | 224;
        }
    }
    ba[--n] = 0;
    var rng = new SecureRandom();
    var x = new Array();
    while (n > 2) {
        // random non-zero pad
        x[0] = 0;
        while (x[0] == 0) rng.nextBytes(x);
        ba[--n] = x[0];
    }
    ba[--n] = 2;
    ba[--n] = 0;
    return new BigInteger(ba);
}

// PKCS#1 (OAEP) mask generation function
function oaep_mgf1_arr(seed, len, hash) {
    var mask = '',
        i = 0;

    while (mask.length < len) {
        mask += hash(
            String.fromCharCode.apply(
                String,
                seed.concat([
                    (i & 0xff000000) >> 24,
                    (i & 0x00ff0000) >> 16,
                    (i & 0x0000ff00) >> 8,
                    i & 0x000000ff
                ])
            )
        );
        i += 1;
    }

    return mask;
}

function oaep_pad(s, n, hash, hashLen) {
    var MD = SIGLIB.crypto.MessageDigest;
    var Util = SIGLIB.crypto.Util;
    var algName = null;

    if (!hash) hash = 'sha1';

    if (typeof hash === 'string') {
        algName = MD.getCanonicalAlgName(hash);
        hashLen = MD.getHashLength(algName);
        hash = function(s) {
            return hextorstr(Util.hashHex(rstrtohex(s), algName));
        };
    }

    if (s.length + 2 * hashLen + 2 > n) {
        throw 'Message too long for RSA';
    }

    var PS = '',
        i;

    for (i = 0; i < n - s.length - 2 * hashLen - 2; i += 1) {
        PS += '\x00';
    }

    var DB = hash('') + PS + '\x01' + s;
    var seed = new Array(hashLen);
    new SecureRandom().nextBytes(seed);

    var dbMask = oaep_mgf1_arr(seed, DB.length, hash);
    var maskedDB = [];

    for (i = 0; i < DB.length; i += 1) {
        maskedDB[i] = DB.charCodeAt(i) ^ dbMask.charCodeAt(i);
    }

    var seedMask = oaep_mgf1_arr(maskedDB, seed.length, hash);
    var maskedSeed = [0];

    for (i = 0; i < seed.length; i += 1) {
        maskedSeed[i + 1] = seed[i] ^ seedMask.charCodeAt(i);
    }

    return new BigInteger(maskedSeed.concat(maskedDB));
}

function RSAKey() {
    this.n = null;
    this.e = 0;
    this.d = null;
    this.p = null;
    this.q = null;
    this.dmp1 = null;
    this.dmq1 = null;
    this.coeff = null;
}

function RSASetPublic(N, E) {
    this.isPublic = true;
    this.isPrivate = false;
    if (typeof N !== 'string') {
        this.n = N;
        this.e = E;
    } else if (N != null && E != null && N.length > 0 && E.length > 0) {
        this.n = parseBigInt(N, 16);
        this.e = parseInt(E, 16);
    } else {
        throw 'Invalid RSA public key';
    }
}

function RSADoPublic(x) {
    return x.modPowInt(this.e, this.n);
}

function RSAEncrypt(text) {
    var m = pkcs1pad2(text, (this.n.bitLength() + 7) >> 3);
    if (m == null) return null;
    var c = this.doPublic(m);
    if (c == null) return null;
    var h = c.toString(16);
    if ((h.length & 1) == 0) return h;
    else return '0' + h;
}

function RSAEncryptOAEP(text, hash, hashLen) {
    var m = oaep_pad(text, (this.n.bitLength() + 7) >> 3, hash, hashLen);
    if (m == null) return null;
    var c = this.doPublic(m);
    if (c == null) return null;
    var h = c.toString(16);
    if ((h.length & 1) == 0) return h;
    else return '0' + h;
}

RSAKey.prototype.doPublic = RSADoPublic;
RSAKey.prototype.setPublic = RSASetPublic;
RSAKey.prototype.encrypt = RSAEncrypt;
RSAKey.prototype.encryptOAEP = RSAEncryptOAEP;
RSAKey.prototype.type = 'RSA';

function pkcs1unpad2(d, n) {
    var b = d.toByteArray();
    var i = 0;
    while (i < b.length && b[i] == 0) ++i;
    if (b.length - i != n - 1 || b[i] != 2) return null;
    ++i;
    while (b[i] != 0) if (++i >= b.length) return null;
    var ret = '';
    while (++i < b.length) {
        var c = b[i] & 255;
        if (c < 128) {
            // utf-8 decode
            ret += String.fromCharCode(c);
        } else if (c > 191 && c < 224) {
            ret += String.fromCharCode(((c & 31) << 6) | (b[i + 1] & 63));
            ++i;
        } else {
            ret += String.fromCharCode(
                ((c & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63)
            );
            i += 2;
        }
    }
    return ret;
}

function oaep_mgf1_str(seed, len, hash) {
    var mask = '',
        i = 0;

    while (mask.length < len) {
        mask += hash(
            seed +
                String.fromCharCode.apply(String, [
                    (i & 0xff000000) >> 24,
                    (i & 0x00ff0000) >> 16,
                    (i & 0x0000ff00) >> 8,
                    i & 0x000000ff
                ])
        );
        i += 1;
    }
    return mask;
}

function oaep_unpad(d, n, hash, hashLen) {
    var MD = SIGLIB.crypto.MessageDigest;
    var Util = SIGLIB.crypto.Util;
    var algName = null;

    if (!hash) hash = 'sha1';

    if (typeof hash === 'string') {
        algName = MD.getCanonicalAlgName(hash);
        hashLen = MD.getHashLength(algName);
        hash = function(s) {
            return hextorstr(Util.hashHex(rstrtohex(s), algName));
        };
    }

    d = d.toByteArray();

    var i;

    for (i = 0; i < d.length; i += 1) {
        d[i] &= 0xff;
    }

    while (d.length < n) {
        d.unshift(0);
    }

    d = String.fromCharCode.apply(String, d);

    if (d.length < 2 * hashLen + 2) {
        throw 'Cipher too short';
    }

    var maskedSeed = d.substr(1, hashLen);
    var maskedDB = d.substr(hashLen + 1);

    var seedMask = oaep_mgf1_str(maskedDB, hashLen, hash);
    var seed = [],
        i;

    for (i = 0; i < maskedSeed.length; i += 1) {
        seed[i] = maskedSeed.charCodeAt(i) ^ seedMask.charCodeAt(i);
    }

    var dbMask = oaep_mgf1_str(
        String.fromCharCode.apply(String, seed),
        d.length - hashLen,
        hash
    );

    var DB = [];

    for (i = 0; i < maskedDB.length; i += 1) {
        DB[i] = maskedDB.charCodeAt(i) ^ dbMask.charCodeAt(i);
    }

    DB = String.fromCharCode.apply(String, DB);

    if (DB.substr(0, hashLen) !== hash('')) {
        throw 'Hash mismatch';
    }

    DB = DB.substr(hashLen);

    var first_one = DB.indexOf('\x01');
    var last_zero =
        first_one != -1 ? DB.substr(0, first_one).lastIndexOf('\x00') : -1;

    if (last_zero + 1 != first_one) {
        throw 'Malformed data';
    }

    return DB.substr(first_one + 1);
}

function RSASetPrivate(N, E, D) {
    this.isPrivate = true;
    if (typeof N !== 'string') {
        this.n = N;
        this.e = E;
        this.d = D;
    } else if (N != null && E != null && N.length > 0 && E.length > 0) {
        this.n = parseBigInt(N, 16);
        this.e = parseInt(E, 16);
        this.d = parseBigInt(D, 16);
    } else throw 'Invalid RSA private key';
}

function RSASetPrivateEx(N, E, D, P, Q, DP, DQ, C) {
    this.isPrivate = true;
    this.isPublic = false;
    if (N == null) throw 'RSASetPrivateEx N == null';
    if (E == null) throw 'RSASetPrivateEx E == null';
    if (N.length == 0) throw 'RSASetPrivateEx N.length == 0';
    if (E.length == 0) throw 'RSASetPrivateEx E.length == 0';

    if (N != null && E != null && N.length > 0 && E.length > 0) {
        this.n = parseBigInt(N, 16);
        this.e = parseInt(E, 16);
        this.d = parseBigInt(D, 16);
        this.p = parseBigInt(P, 16);
        this.q = parseBigInt(Q, 16);
        this.dmp1 = parseBigInt(DP, 16);
        this.dmq1 = parseBigInt(DQ, 16);
        this.coeff = parseBigInt(C, 16);
    } else {
        throw 'Invalid RSA private key in RSASetPrivateEx';
    }
}

function RSAGenerate(B, E) {
    var rng = new SecureRandom();
    var qs = B >> 1;
    this.e = parseInt(E, 16);
    var ee = new BigInteger(E, 16);
    for (;;) {
        for (;;) {
            this.p = new BigInteger(B - qs, 1, rng);
            if (
                this.p
                    .subtract(BigInteger.ONE)
                    .gcd(ee)
                    .compareTo(BigInteger.ONE) == 0 &&
                this.p.isProbablePrime(10)
            )
                break;
        }
        for (;;) {
            this.q = new BigInteger(qs, 1, rng);
            if (
                this.q
                    .subtract(BigInteger.ONE)
                    .gcd(ee)
                    .compareTo(BigInteger.ONE) == 0 &&
                this.q.isProbablePrime(10)
            )
                break;
        }
        if (this.p.compareTo(this.q) <= 0) {
            var t = this.p;
            this.p = this.q;
            this.q = t;
        }
        var p1 = this.p.subtract(BigInteger.ONE); // p1 = p - 1
        var q1 = this.q.subtract(BigInteger.ONE); // q1 = q - 1
        var phi = p1.multiply(q1);
        if (phi.gcd(ee).compareTo(BigInteger.ONE) == 0) {
            this.n = this.p.multiply(this.q); // this.n = p * q
            this.d = ee.modInverse(phi); // this.d =
            this.dmp1 = this.d.mod(p1); // this.dmp1 = d mod (p - 1)
            this.dmq1 = this.d.mod(q1); // this.dmq1 = d mod (q - 1)
            this.coeff = this.q.modInverse(this.p); // this.coeff = (q ^ -1) mod p
            break;
        }
    }
    this.isPrivate = true;
}

function RSADoPrivate(x) {
    if (this.p == null || this.q == null) return x.modPow(this.d, this.n);

    var xp = x.mod(this.p).modPow(this.dmp1, this.p);
    var xq = x.mod(this.q).modPow(this.dmq1, this.q);

    while (xp.compareTo(xq) < 0) xp = xp.add(this.p);

    return xp
        .subtract(xq)
        .multiply(this.coeff)
        .mod(this.p)
        .multiply(this.q)
        .add(xq);
}

function RSADecrypt(ctext) {
    var c = parseBigInt(ctext, 16);
    var m = this.doPrivate(c);
    if (m == null) return null;
    return pkcs1unpad2(m, (this.n.bitLength() + 7) >> 3);
}

function RSADecryptOAEP(ctext, hash, hashLen) {
    var c = parseBigInt(ctext, 16);
    var m = this.doPrivate(c);
    if (m == null) return null;
    return oaep_unpad(m, (this.n.bitLength() + 7) >> 3, hash, hashLen);
}

RSAKey.prototype.doPrivate = RSADoPrivate;
RSAKey.prototype.setPrivate = RSASetPrivate;
RSAKey.prototype.setPrivateEx = RSASetPrivateEx;
RSAKey.prototype.generate = RSAGenerate;
RSAKey.prototype.decrypt = RSADecrypt;
RSAKey.prototype.decryptOAEP = RSADecryptOAEP;

var b64map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var b64pad = '=';

function hex2b64(h) {
    var i;
    var c;
    var ret = '';
    for (i = 0; i + 3 <= h.length; i += 3) {
        c = parseInt(h.substring(i, i + 3), 16);
        ret += b64map.charAt(c >> 6) + b64map.charAt(c & 63);
    }
    if (i + 1 == h.length) {
        c = parseInt(h.substring(i, i + 1), 16);
        ret += b64map.charAt(c << 2);
    } else if (i + 2 == h.length) {
        c = parseInt(h.substring(i, i + 2), 16);
        ret += b64map.charAt(c >> 2) + b64map.charAt((c & 3) << 4);
    }
    if (b64pad) while ((ret.length & 3) > 0) ret += b64pad;
    return ret;
}

function b64tohex(s) {
    var ret = '';
    var i;
    var k = 0; // b64 state, 0-3
    var slop;
    var v;
    for (i = 0; i < s.length; ++i) {
        if (s.charAt(i) == b64pad) break;
        v = b64map.indexOf(s.charAt(i));
        if (v < 0) continue;
        if (k == 0) {
            ret += int2char(v >> 2);
            slop = v & 3;
            k = 1;
        } else if (k == 1) {
            ret += int2char((slop << 2) | (v >> 4));
            slop = v & 0xf;
            k = 2;
        } else if (k == 2) {
            ret += int2char(slop);
            ret += int2char(v >> 2);
            slop = v & 3;
            k = 3;
        } else {
            ret += int2char((slop << 2) | (v >> 4));
            ret += int2char(v & 0xf);
            k = 0;
        }
    }
    if (k == 1) ret += int2char(slop << 2);
    return ret;
}

var SIGLIB;
if (typeof SIGLIB == 'undefined' || !SIGLIB) SIGLIB = {};
if (typeof SIGLIB.lang == 'undefined' || !SIGLIB.lang) SIGLIB.lang = {};

SIGLIB.lang.String = function() {};

function Base64x() {}

function hextorstr(sHex) {
    var s = '';
    for (var i = 0; i < sHex.length - 1; i += 2) {
        s += String.fromCharCode(parseInt(sHex.substr(i, 2), 16));
    }
    return s;
}

function rstrtohex(s) {
    var result = '';
    for (var i = 0; i < s.length; i++) {
        result += ('0' + s.charCodeAt(i).toString(16)).slice(-2);
    }
    return result;
}

exports.hextob64 = function hextob64(s) {
    return hex2b64(s);
};

function b64nltohex(s) {
    var b64 = s.replace(/[^0-9A-Za-z\/+=]*/g, '');
    var hex = b64tohex(b64);
    return hex;
}

function pemtohex(s, sHead) {
    if (s.indexOf('-----BEGIN ') == -1) throw "can't find PEM header: " + sHead;

    if (sHead !== undefined) {
        s = s.replace('-----BEGIN ' + sHead + '-----', '');
        s = s.replace('-----END ' + sHead + '-----', '');
    } else {
        s = s.replace(/-----BEGIN [^-]+-----/, '');
        s = s.replace(/-----END [^-]+-----/, '');
    }
    return b64nltohex(s);
}

RSAKey.getPosArrayOfChildrenFromHex = function(hPrivateKey) {
    return ASN1HEX.getChildIdx(hPrivateKey, 0);
};

RSAKey.getHexValueArrayOfChildrenFromHex = function(hPrivateKey) {
    var _ASN1HEX = ASN1HEX;
    var _getV = _ASN1HEX.getV;
    var a = RSAKey.getPosArrayOfChildrenFromHex(hPrivateKey);
    var h_v = _getV(hPrivateKey, a[0]);
    var h_n = _getV(hPrivateKey, a[1]);
    var h_e = _getV(hPrivateKey, a[2]);
    var h_d = _getV(hPrivateKey, a[3]);
    var h_p = _getV(hPrivateKey, a[4]);
    var h_q = _getV(hPrivateKey, a[5]);
    var h_dp = _getV(hPrivateKey, a[6]);
    var h_dq = _getV(hPrivateKey, a[7]);
    var h_co = _getV(hPrivateKey, a[8]);
    var a = new Array();
    a.push(h_v, h_n, h_e, h_d, h_p, h_q, h_dp, h_dq, h_co);
    return a;
};

RSAKey.prototype.readPrivateKeyFromPEMString = function(keyPEM) {
    var keyHex = pemtohex(keyPEM);
    var a = RSAKey.getHexValueArrayOfChildrenFromHex(keyHex);
    this.setPrivateEx(a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]);
};

RSAKey.prototype.readPKCS5PrvKeyHex = function(h) {
    var a = RSAKey.getHexValueArrayOfChildrenFromHex(h);
    this.setPrivateEx(a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]);
};

RSAKey.prototype.readPKCS8PrvKeyHex = function(h) {
    var hN, hE, hD, hP, hQ, hDP, hDQ, hCO;
    var _ASN1HEX = ASN1HEX;
    var _getVbyList = _ASN1HEX.getVbyList;

    if (_ASN1HEX.isASN1HEX(h) === false) throw 'not ASN.1 hex string';

    try {
        hN = _getVbyList(h, 0, [2, 0, 1], '02');
        hE = _getVbyList(h, 0, [2, 0, 2], '02');
        hD = _getVbyList(h, 0, [2, 0, 3], '02');
        hP = _getVbyList(h, 0, [2, 0, 4], '02');
        hQ = _getVbyList(h, 0, [2, 0, 5], '02');
        hDP = _getVbyList(h, 0, [2, 0, 6], '02');
        hDQ = _getVbyList(h, 0, [2, 0, 7], '02');
        hCO = _getVbyList(h, 0, [2, 0, 8], '02');
    } catch (ex) {
        throw 'malformed PKCS#8 plain RSA private key';
    }

    this.setPrivateEx(hN, hE, hD, hP, hQ, hDP, hDQ, hCO);
};

RSAKey.prototype.readPKCS5PubKeyHex = function(h) {
    var _ASN1HEX = ASN1HEX;
    var _getV = _ASN1HEX.getV;

    if (_ASN1HEX.isASN1HEX(h) === false) throw 'keyHex is not ASN.1 hex string';
    var aIdx = _ASN1HEX.getChildIdx(h, 0);
    if (
        aIdx.length !== 2 ||
        h.substr(aIdx[0], 2) !== '02' ||
        h.substr(aIdx[1], 2) !== '02'
    )
        throw 'wrong hex for PKCS#5 public key';
    var hN = _getV(h, aIdx[0]);
    var hE = _getV(h, aIdx[1]);
    this.setPublic(hN, hE);
};

RSAKey.prototype.readPKCS8PubKeyHex = function(h) {
    var _ASN1HEX = ASN1HEX;
    if (_ASN1HEX.isASN1HEX(h) === false) throw 'not ASN.1 hex string';

    if (_ASN1HEX.getTLVbyList(h, 0, [0, 0]) !== '06092a864886f70d010101')
        throw 'not PKCS8 RSA public key';

    var p5hex = _ASN1HEX.getTLVbyList(h, 0, [1, 0]);
    this.readPKCS5PubKeyHex(p5hex);
};

RSAKey.prototype.readCertPubKeyHex = function(h, nthPKI) {
    var x, hPub;
    x = new X509();
    x.readCertHex(h);
    hPub = x.getPublicKeyHex();
    this.readPKCS8PubKeyHex(hPub);
};

var ASN1HEX = new (function() {})();

ASN1HEX.getLblen = function(s, idx) {
    if (s.substr(idx + 2, 1) != '8') return 1;
    var i = parseInt(s.substr(idx + 3, 1));
    if (i == 0) return -1; // length octet '80' indefinite length
    if (0 < i && i < 10) return i + 1; // including '8?' octet;
    return -2; // malformed format
};

ASN1HEX.getL = function(s, idx) {
    var len = ASN1HEX.getLblen(s, idx);
    if (len < 1) return '';
    return s.substr(idx + 2, len * 2);
};

ASN1HEX.getVblen = function(s, idx) {
    var hLen, bi;
    hLen = ASN1HEX.getL(s, idx);
    if (hLen == '') return -1;
    if (hLen.substr(0, 1) === '8') {
        bi = new BigInteger(hLen.substr(2), 16);
    } else {
        bi = new BigInteger(hLen, 16);
    }
    return bi.intValue();
};

ASN1HEX.getVidx = function(s, idx) {
    var l_len = ASN1HEX.getLblen(s, idx);
    if (l_len < 0) return l_len;
    return idx + (l_len + 1) * 2;
};

ASN1HEX.getV = function(s, idx) {
    var idx1 = ASN1HEX.getVidx(s, idx);
    var blen = ASN1HEX.getVblen(s, idx);
    return s.substr(idx1, blen * 2);
};

ASN1HEX.getNextSiblingIdx = function(s, idx) {
    var idx1 = ASN1HEX.getVidx(s, idx);
    var blen = ASN1HEX.getVblen(s, idx);
    return idx1 + blen * 2;
};

ASN1HEX.getChildIdx = function(h, pos) {
    var _ASN1HEX = ASN1HEX;
    var a = new Array();
    var p0 = _ASN1HEX.getVidx(h, pos);
    if (h.substr(pos, 2) == '03') {
        a.push(p0 + 2);
    } else {
        a.push(p0);
    }

    var blen = _ASN1HEX.getVblen(h, pos);
    var p = p0;
    var k = 0;
    while (1) {
        var pNext = _ASN1HEX.getNextSiblingIdx(h, p);
        if (pNext == null || pNext - p0 >= blen * 2) break;
        if (k >= 200) break;

        a.push(pNext);
        p = pNext;

        k++;
    }

    return a;
};

var KEYUTIL = (function() {
    var decryptAES = function(dataHex, keyHex, ivHex) {
        return decryptGeneral(CryptoJS.AES, dataHex, keyHex, ivHex);
    };

    var decrypt3DES = function(dataHex, keyHex, ivHex) {
        return decryptGeneral(CryptoJS.TripleDES, dataHex, keyHex, ivHex);
    };

    var decryptDES = function(dataHex, keyHex, ivHex) {
        return decryptGeneral(CryptoJS.DES, dataHex, keyHex, ivHex);
    };

    var decryptGeneral = function(f, dataHex, keyHex, ivHex) {
        var data = CryptoJS.enc.Hex.parse(dataHex);
        var key = CryptoJS.enc.Hex.parse(keyHex);
        var iv = CryptoJS.enc.Hex.parse(ivHex);
        var encrypted = {};
        encrypted.key = key;
        encrypted.iv = iv;
        encrypted.ciphertext = data;
        var decrypted = f.decrypt(encrypted, key, { iv: iv });
        return CryptoJS.enc.Hex.stringify(decrypted);
    };

    var encryptAES = function(dataHex, keyHex, ivHex) {
        return encryptGeneral(CryptoJS.AES, dataHex, keyHex, ivHex);
    };

    var encrypt3DES = function(dataHex, keyHex, ivHex) {
        return encryptGeneral(CryptoJS.TripleDES, dataHex, keyHex, ivHex);
    };

    var encryptDES = function(dataHex, keyHex, ivHex) {
        return encryptGeneral(CryptoJS.DES, dataHex, keyHex, ivHex);
    };

    var encryptGeneral = function(f, dataHex, keyHex, ivHex) {
        var data = CryptoJS.enc.Hex.parse(dataHex);
        var key = CryptoJS.enc.Hex.parse(keyHex);
        var iv = CryptoJS.enc.Hex.parse(ivHex);
        var encryptedHex = f.encrypt(data, key, { iv: iv });
        var encryptedWA = CryptoJS.enc.Hex.parse(encryptedHex.toString());
        var encryptedB64 = CryptoJS.enc.Base64.stringify(encryptedWA);
        return encryptedB64;
    };

    var ALGLIST = {
        'AES-256-CBC': {
            proc: decryptAES,
            eproc: encryptAES,
            keylen: 32,
            ivlen: 16
        },
        'AES-192-CBC': {
            proc: decryptAES,
            eproc: encryptAES,
            keylen: 24,
            ivlen: 16
        },
        'AES-128-CBC': {
            proc: decryptAES,
            eproc: encryptAES,
            keylen: 16,
            ivlen: 16
        },
        'DES-EDE3-CBC': {
            proc: decrypt3DES,
            eproc: encrypt3DES,
            keylen: 24,
            ivlen: 8
        },
        'DES-CBC': { proc: decryptDES, eproc: encryptDES, keylen: 8, ivlen: 8 }
    };

    var getFuncByName = function(algName) {
        return ALGLIST[algName]['proc'];
    };

    var _generateIvSaltHex = function(numBytes) {
        var wa = CryptoJS.lib.WordArray.random(numBytes);
        var hex = CryptoJS.enc.Hex.stringify(wa);
        return hex;
    };

    var _parsePKCS5PEM = function(sPKCS5PEM) {
        var info = {};
        var matchResult1 = sPKCS5PEM.match(
            new RegExp('DEK-Info: ([^,]+),([0-9A-Fa-f]+)', 'm')
        );
        if (matchResult1) {
            info.cipher = matchResult1[1];
            info.ivsalt = matchResult1[2];
        }
        var matchResult2 = sPKCS5PEM.match(
            new RegExp('-----BEGIN ([A-Z]+) PRIVATE KEY-----')
        );
        if (matchResult2) {
            info.type = matchResult2[1];
        }
        var i1 = -1;
        var lenNEWLINE = 0;
        if (sPKCS5PEM.indexOf('\r\n\r\n') != -1) {
            i1 = sPKCS5PEM.indexOf('\r\n\r\n');
            lenNEWLINE = 2;
        }
        if (sPKCS5PEM.indexOf('\n\n') != -1) {
            i1 = sPKCS5PEM.indexOf('\n\n');
            lenNEWLINE = 1;
        }
        var i2 = sPKCS5PEM.indexOf('-----END');
        if (i1 != -1 && i2 != -1) {
            var s = sPKCS5PEM.substring(i1 + lenNEWLINE * 2, i2 - lenNEWLINE);
            s = s.replace(/\s+/g, '');
            info.data = s;
        }
        return info;
    };

    var _getKeyAndUnusedIvByPasscodeAndIvsalt = function(
        algName,
        passcode,
        ivsaltHex
    ) {
        var saltHex = ivsaltHex.substring(0, 16);

        var salt = CryptoJS.enc.Hex.parse(saltHex);
        var data = CryptoJS.enc.Utf8.parse(passcode);

        var nRequiredBytes =
            ALGLIST[algName]['keylen'] + ALGLIST[algName]['ivlen'];
        var hHexValueJoined = '';
        var hLastValue = null;

        for (;;) {
            var h = CryptoJS.algo.MD5.create();
            if (hLastValue != null) {
                h.update(hLastValue);
            }
            h.update(data);
            h.update(salt);
            hLastValue = h.finalize();
            hHexValueJoined =
                hHexValueJoined + CryptoJS.enc.Hex.stringify(hLastValue);

            if (hHexValueJoined.length >= nRequiredBytes * 2) {
                break;
            }
        }
        var result = {};
        result.keyhex = hHexValueJoined.substr(
            0,
            ALGLIST[algName]['keylen'] * 2
        );
        result.ivhex = hHexValueJoined.substr(
            ALGLIST[algName]['keylen'] * 2,
            ALGLIST[algName]['ivlen'] * 2
        );
        return result;
    };

    var _decryptKeyB64 = function(
        privateKeyB64,
        sharedKeyAlgName,
        sharedKeyHex,
        ivsaltHex
    ) {
        var privateKeyWA = CryptoJS.enc.Base64.parse(privateKeyB64);
        var privateKeyHex = CryptoJS.enc.Hex.stringify(privateKeyWA);
        var f = ALGLIST[sharedKeyAlgName]['proc'];
        var decryptedKeyHex = f(privateKeyHex, sharedKeyHex, ivsaltHex);
        return decryptedKeyHex;
    };

    var _encryptKeyHex = function(
        privateKeyHex,
        sharedKeyAlgName,
        sharedKeyHex,
        ivsaltHex
    ) {
        var f = ALGLIST[sharedKeyAlgName]['eproc'];
        var encryptedKeyB64 = f(privateKeyHex, sharedKeyHex, ivsaltHex);
        return encryptedKeyB64;
    };

    return {
        version: '1.0.0',
        parsePKCS5PEM: function(sPKCS5PEM) {
            return _parsePKCS5PEM(sPKCS5PEM);
        },
        getKeyAndUnusedIvByPasscodeAndIvsalt: function(
            algName,
            passcode,
            ivsaltHex
        ) {
            return _getKeyAndUnusedIvByPasscodeAndIvsalt(
                algName,
                passcode,
                ivsaltHex
            );
        },
        decryptKeyB64: function(
            privateKeyB64,
            sharedKeyAlgName,
            sharedKeyHex,
            ivsaltHex
        ) {
            return _decryptKeyB64(
                privateKeyB64,
                sharedKeyAlgName,
                sharedKeyHex,
                ivsaltHex
            );
        },
        getDecryptedKeyHex: function(sEncryptedPEM, passcode) {
            var info = _parsePKCS5PEM(sEncryptedPEM);
            var publicKeyAlgName = info.type;
            var sharedKeyAlgName = info.cipher;
            var ivsaltHex = info.ivsalt;
            var privateKeyB64 = info.data;
            var sharedKeyInfo = _getKeyAndUnusedIvByPasscodeAndIvsalt(
                sharedKeyAlgName,
                passcode,
                ivsaltHex
            );
            var sharedKeyHex = sharedKeyInfo.keyhex;
            var decryptedKey = _decryptKeyB64(
                privateKeyB64,
                sharedKeyAlgName,
                sharedKeyHex,
                ivsaltHex
            );
            return decryptedKey;
        },
        getEncryptedPKCS5PEMFromPrvKeyHex: function(
            pemHeadAlg,
            hPrvKey,
            passcode,
            sharedKeyAlgName,
            ivsaltHex
        ) {
            var sPEM = '';

            if (
                typeof sharedKeyAlgName == 'undefined' ||
                sharedKeyAlgName == null
            ) {
                sharedKeyAlgName = 'AES-256-CBC';
            }
            if (typeof ALGLIST[sharedKeyAlgName] == 'undefined')
                throw 'KEYUTIL unsupported algorithm: ' + sharedKeyAlgName;

            if (typeof ivsaltHex == 'undefined' || ivsaltHex == null) {
                var ivlen = ALGLIST[sharedKeyAlgName]['ivlen'];
                var randIV = _generateIvSaltHex(ivlen);
                ivsaltHex = randIV.toUpperCase();
            }

            var sharedKeyInfo = _getKeyAndUnusedIvByPasscodeAndIvsalt(
                sharedKeyAlgName,
                passcode,
                ivsaltHex
            );
            var sharedKeyHex = sharedKeyInfo.keyhex;

            var encryptedKeyB64 = _encryptKeyHex(
                hPrvKey,
                sharedKeyAlgName,
                sharedKeyHex,
                ivsaltHex
            );

            var pemBody = encryptedKeyB64.replace(/(.{64})/g, '$1\r\n');
            var sPEM = '-----BEGIN ' + pemHeadAlg + ' PRIVATE KEY-----\r\n';
            sPEM += 'Proc-Type: 4,ENCRYPTED\r\n';
            sPEM += 'DEK-Info: ' + sharedKeyAlgName + ',' + ivsaltHex + '\r\n';
            sPEM += '\r\n';
            sPEM += pemBody;
            sPEM += '\r\n-----END ' + pemHeadAlg + ' PRIVATE KEY-----\r\n';

            return sPEM;
        },
        parseHexOfEncryptedPKCS8: function(sHEX) {
            var _ASN1HEX = ASN1HEX;
            var _getChildIdx = _ASN1HEX.getChildIdx;
            var _getV = _ASN1HEX.getV;
            var info = {};

            var a0 = _getChildIdx(sHEX, 0);
            if (a0.length != 2)
                throw 'malformed format: SEQUENCE(0).items != 2: ' + a0.length;

            info.ciphertext = _getV(sHEX, a0[1]);

            var a0_0 = _getChildIdx(sHEX, a0[0]);
            if (a0_0.length != 2)
                throw 'malformed format: SEQUENCE(0.0).items != 2: ' +
                    a0_0.length;

            if (_getV(sHEX, a0_0[0]) != '2a864886f70d01050d')
                throw 'this only supports pkcs5PBES2';

            var a0_0_1 = _getChildIdx(sHEX, a0_0[1]);
            if (a0_0.length != 2)
                throw 'malformed format: SEQUENCE(0.0.1).items != 2: ' +
                    a0_0_1.length;

            var a0_0_1_1 = _getChildIdx(sHEX, a0_0_1[1]);
            if (a0_0_1_1.length != 2)
                throw 'malformed format: SEQUENCE(0.0.1.1).items != 2: ' +
                    a0_0_1_1.length;
            if (_getV(sHEX, a0_0_1_1[0]) != '2a864886f70d0307')
                throw 'this only supports TripleDES';
            info.encryptionSchemeAlg = 'TripleDES';

            info.encryptionSchemeIV = _getV(sHEX, a0_0_1_1[1]);

            var a0_0_1_0 = _getChildIdx(sHEX, a0_0_1[0]);
            if (a0_0_1_0.length != 2)
                throw 'malformed format: SEQUENCE(0.0.1.0).items != 2: ' +
                    a0_0_1_0.length;
            if (_getV(sHEX, a0_0_1_0[0]) != '2a864886f70d01050c')
                throw 'this only supports pkcs5PBKDF2';

            var a0_0_1_0_1 = _getChildIdx(sHEX, a0_0_1_0[1]);
            if (a0_0_1_0_1.length < 2)
                throw 'malformed format: SEQUENCE(0.0.1.0.1).items < 2: ' +
                    a0_0_1_0_1.length;

            info.pbkdf2Salt = _getV(sHEX, a0_0_1_0_1[0]);

            var iterNumHex = _getV(sHEX, a0_0_1_0_1[1]);
            try {
                info.pbkdf2Iter = parseInt(iterNumHex, 16);
            } catch (ex) {
                throw 'malformed format pbkdf2Iter: ' + iterNumHex;
            }

            return info;
        },
        getPBKDF2KeyHexFromParam: function(info, passcode) {
            var pbkdf2SaltWS = CryptoJS.enc.Hex.parse(info.pbkdf2Salt);
            var pbkdf2Iter = info.pbkdf2Iter;
            var pbkdf2KeyWS = CryptoJS.PBKDF2(passcode, pbkdf2SaltWS, {
                keySize: 192 / 32,
                iterations: pbkdf2Iter
            });
            var pbkdf2KeyHex = CryptoJS.enc.Hex.stringify(pbkdf2KeyWS);
            return pbkdf2KeyHex;
        },
        _getPlainPKCS8HexFromEncryptedPKCS8PEM: function(pkcs8PEM, passcode) {
            var derHex = pemtohex(pkcs8PEM, 'ENCRYPTED PRIVATE KEY');
            var info = this.parseHexOfEncryptedPKCS8(derHex);
            var pbkdf2KeyHex = KEYUTIL.getPBKDF2KeyHexFromParam(info, passcode);
            var encrypted = {};
            encrypted.ciphertext = CryptoJS.enc.Hex.parse(info.ciphertext);
            var pbkdf2KeyWS = CryptoJS.enc.Hex.parse(pbkdf2KeyHex);
            var des3IVWS = CryptoJS.enc.Hex.parse(info.encryptionSchemeIV);
            var decWS = CryptoJS.TripleDES.decrypt(encrypted, pbkdf2KeyWS, {
                iv: des3IVWS
            });
            var decHex = CryptoJS.enc.Hex.stringify(decWS);
            return decHex;
        },
        getKeyFromEncryptedPKCS8PEM: function(pkcs8PEM, passcode) {
            var prvKeyHex = this._getPlainPKCS8HexFromEncryptedPKCS8PEM(
                pkcs8PEM,
                passcode
            );
            var key = this.getKeyFromPlainPrivatePKCS8Hex(prvKeyHex);
            return key;
        },
        parsePlainPrivatePKCS8Hex: function(pkcs8PrvHex) {
            var _ASN1HEX = ASN1HEX;
            var _getChildIdx = _ASN1HEX.getChildIdx;
            var _getV = _ASN1HEX.getV;
            var result = {};
            result.algparam = null;

            if (pkcs8PrvHex.substr(0, 2) != '30')
                throw 'malformed plain PKCS8 private key(code:001)';

            var a1 = _getChildIdx(pkcs8PrvHex, 0);
            if (a1.length != 3)
                throw 'malformed plain PKCS8 private key(code:002)';

            if (pkcs8PrvHex.substr(a1[1], 2) != '30')
                throw 'malformed PKCS8 private key(code:003)';

            var a2 = _getChildIdx(pkcs8PrvHex, a1[1]);
            if (a2.length != 2) throw 'malformed PKCS8 private key(code:004)';

            if (pkcs8PrvHex.substr(a2[0], 2) != '06')
                throw 'malformed PKCS8 private key(code:005)';

            result.algoid = _getV(pkcs8PrvHex, a2[0]);

            if (pkcs8PrvHex.substr(a2[1], 2) == '06') {
                result.algparam = _getV(pkcs8PrvHex, a2[1]);
            }

            if (pkcs8PrvHex.substr(a1[2], 2) != '04')
                throw 'malformed PKCS8 private key(code:006)';

            result.keyidx = _ASN1HEX.getVidx(pkcs8PrvHex, a1[2]);

            return result;
        },
        getKeyFromPlainPrivatePKCS8PEM: function(prvKeyPEM) {
            var prvKeyHex = pemtohex(prvKeyPEM, 'PRIVATE KEY');
            var key = this.getKeyFromPlainPrivatePKCS8Hex(prvKeyHex);
            return key;
        },
        getKeyFromPlainPrivatePKCS8Hex: function(prvKeyHex) {
            var p8 = this.parsePlainPrivatePKCS8Hex(prvKeyHex);
            var key;

            if (p8.algoid == '2a864886f70d010101') {
                // RSA
                key = new RSAKey();
            } else if (p8.algoid == '2a8648ce380401') {
                // DSA
                key = new SIGLIB.crypto.DSA();
            } else if (p8.algoid == '2a8648ce3d0201') {
                // ECC
                key = new SIGLIB.crypto.ECDSA();
            } else {
                throw 'unsupported private key algorithm';
            }

            key.readPKCS8PrvKeyHex(prvKeyHex);
            return key;
        },
        _getKeyFromPublicPKCS8Hex: function(h) {
            var key;
            var hOID = ASN1HEX.getVbyList(h, 0, [0, 0], '06');

            if (hOID === '2a864886f70d010101') {
                // oid=RSA
                key = new RSAKey();
            } else if (hOID === '2a8648ce380401') {
                // oid=DSA
                key = new SIGLIB.crypto.DSA();
            } else if (hOID === '2a8648ce3d0201') {
                // oid=ECPUB
                key = new SIGLIB.crypto.ECDSA();
            } else {
                throw 'unsupported PKCS#8 public key hex';
            }
            key.readPKCS8PubKeyHex(h);
            return key;
        },
        parsePublicRawRSAKeyHex: function(pubRawRSAHex) {
            var _ASN1HEX = ASN1HEX;
            var _getChildIdx = _ASN1HEX.getChildIdx;
            var _getV = _ASN1HEX.getV;
            var result = {};

            if (pubRawRSAHex.substr(0, 2) != '30')
                throw 'malformed RSA key(code:001)';

            var a1 = _getChildIdx(pubRawRSAHex, 0);
            if (a1.length != 2) throw 'malformed RSA key(code:002)';

            if (pubRawRSAHex.substr(a1[0], 2) != '02')
                throw 'malformed RSA key(code:003)';

            result.n = _getV(pubRawRSAHex, a1[0]);

            if (pubRawRSAHex.substr(a1[1], 2) != '02')
                throw 'malformed RSA key(code:004)';

            result.e = _getV(pubRawRSAHex, a1[1]);

            return result;
        },
        parsePublicPKCS8Hex: function(pkcs8PubHex) {
            var _ASN1HEX = ASN1HEX;
            var _getChildIdx = _ASN1HEX.getChildIdx;
            var _getV = _ASN1HEX.getV;
            var result = {};
            result.algparam = null;

            var a1 = _getChildIdx(pkcs8PubHex, 0);
            if (a1.length != 2)
                throw 'outer DERSequence shall have 2 elements: ' + a1.length;

            var idxAlgIdTLV = a1[0];
            if (pkcs8PubHex.substr(idxAlgIdTLV, 2) != '30')
                throw 'malformed PKCS8 public key(code:001)';

            var a2 = _getChildIdx(pkcs8PubHex, idxAlgIdTLV);
            if (a2.length != 2) throw 'malformed PKCS8 public key(code:002)';

            if (pkcs8PubHex.substr(a2[0], 2) != '06')
                throw 'malformed PKCS8 public key(code:003)';

            result.algoid = _getV(pkcs8PubHex, a2[0]);

            if (pkcs8PubHex.substr(a2[1], 2) == '06') {
                result.algparam = _getV(pkcs8PubHex, a2[1]);
            } else if (pkcs8PubHex.substr(a2[1], 2) == '30') {
                result.algparam = {};
                result.algparam.p = _ASN1HEX.getVbyList(
                    pkcs8PubHex,
                    a2[1],
                    [0],
                    '02'
                );
                result.algparam.q = _ASN1HEX.getVbyList(
                    pkcs8PubHex,
                    a2[1],
                    [1],
                    '02'
                );
                result.algparam.g = _ASN1HEX.getVbyList(
                    pkcs8PubHex,
                    a2[1],
                    [2],
                    '02'
                );
            }

            if (pkcs8PubHex.substr(a1[1], 2) != '03')
                throw 'malformed PKCS8 public key(code:004)';

            result.key = _getV(pkcs8PubHex, a1[1]).substr(2);

            return result;
        }
    };
})();

KEYUTIL.getKey = function(param, passcode, hextype) {
    var _ASN1HEX = ASN1HEX,
        _getChildIdx = _ASN1HEX.getChildIdx,
        _getV = _ASN1HEX.getV,
        _getVbyList = _ASN1HEX.getVbyList,
        _SIGLIB_crypto = SIGLIB.crypto,
        _SIGLIB_crypto_ECDSA = _SIGLIB_crypto.ECDSA,
        _SIGLIB_crypto_DSA = _SIGLIB_crypto.DSA,
        _RSAKey = RSAKey,
        _pemtohex = pemtohex,
        _KEYUTIL = KEYUTIL;

    if (typeof _RSAKey != 'undefined' && param instanceof _RSAKey) return param;
    if (
        typeof _SIGLIB_crypto_ECDSA != 'undefined' &&
        param instanceof _SIGLIB_crypto_ECDSA
    )
        return param;
    if (
        typeof _SIGLIB_crypto_DSA != 'undefined' &&
        param instanceof _SIGLIB_crypto_DSA
    )
        return param;

    if (
        param.curve !== undefined &&
        param.xy !== undefined &&
        param.d === undefined
    ) {
        return new _SIGLIB_crypto_ECDSA({ pub: param.xy, curve: param.curve });
    }

    if (param.curve !== undefined && param.d !== undefined) {
        return new _SIGLIB_crypto_ECDSA({ prv: param.d, curve: param.curve });
    }

    if (
        param.kty === undefined &&
        param.n !== undefined &&
        param.e !== undefined &&
        param.d === undefined
    ) {
        var key = new _RSAKey();
        key.setPublic(param.n, param.e);
        return key;
    }

    if (
        param.kty === undefined &&
        param.n !== undefined &&
        param.e !== undefined &&
        param.d !== undefined &&
        param.p !== undefined &&
        param.q !== undefined &&
        param.dp !== undefined &&
        param.dq !== undefined &&
        param.co !== undefined &&
        param.qi === undefined
    ) {
        var key = new _RSAKey();
        key.setPrivateEx(
            param.n,
            param.e,
            param.d,
            param.p,
            param.q,
            param.dp,
            param.dq,
            param.co
        );
        return key;
    }

    if (
        param.kty === undefined &&
        param.n !== undefined &&
        param.e !== undefined &&
        param.d !== undefined &&
        param.p === undefined
    ) {
        var key = new _RSAKey();
        key.setPrivate(param.n, param.e, param.d);
        return key;
    }

    if (
        param.p !== undefined &&
        param.q !== undefined &&
        param.g !== undefined &&
        param.y !== undefined &&
        param.x === undefined
    ) {
        var key = new _SIGLIB_crypto_DSA();
        key.setPublic(param.p, param.q, param.g, param.y);
        return key;
    }

    if (
        param.p !== undefined &&
        param.q !== undefined &&
        param.g !== undefined &&
        param.y !== undefined &&
        param.x !== undefined
    ) {
        var key = new _SIGLIB_crypto_DSA();
        key.setPrivate(param.p, param.q, param.g, param.y, param.x);
        return key;
    }

    if (
        param.kty === 'RSA' &&
        param.n !== undefined &&
        param.e !== undefined &&
        param.d === undefined
    ) {
        var key = new _RSAKey();
        key.setPublic(b64utohex(param.n), b64utohex(param.e));
        return key;
    }

    if (
        param.kty === 'RSA' &&
        param.n !== undefined &&
        param.e !== undefined &&
        param.d !== undefined &&
        param.p !== undefined &&
        param.q !== undefined &&
        param.dp !== undefined &&
        param.dq !== undefined &&
        param.qi !== undefined
    ) {
        var key = new _RSAKey();
        key.setPrivateEx(
            b64utohex(param.n),
            b64utohex(param.e),
            b64utohex(param.d),
            b64utohex(param.p),
            b64utohex(param.q),
            b64utohex(param.dp),
            b64utohex(param.dq),
            b64utohex(param.qi)
        );
        return key;
    }

    if (
        param.kty === 'RSA' &&
        param.n !== undefined &&
        param.e !== undefined &&
        param.d !== undefined
    ) {
        var key = new _RSAKey();
        key.setPrivate(
            b64utohex(param.n),
            b64utohex(param.e),
            b64utohex(param.d)
        );
        return key;
    }

    if (
        param.kty === 'EC' &&
        param.crv !== undefined &&
        param.x !== undefined &&
        param.y !== undefined &&
        param.d === undefined
    ) {
        var ec = new _SIGLIB_crypto_ECDSA({ curve: param.crv });
        var charlen = ec.ecparams.keylen / 4;
        var hX = ('0000000000' + b64utohex(param.x)).slice(-charlen);
        var hY = ('0000000000' + b64utohex(param.y)).slice(-charlen);
        var hPub = '04' + hX + hY;
        ec.setPublicKeyHex(hPub);
        return ec;
    }

    if (
        param.kty === 'EC' &&
        param.crv !== undefined &&
        param.x !== undefined &&
        param.y !== undefined &&
        param.d !== undefined
    ) {
        var ec = new _SIGLIB_crypto_ECDSA({ curve: param.crv });
        var charlen = ec.ecparams.keylen / 4;
        var hX = ('0000000000' + b64utohex(param.x)).slice(-charlen);
        var hY = ('0000000000' + b64utohex(param.y)).slice(-charlen);
        var hPub = '04' + hX + hY;
        var hPrv = ('0000000000' + b64utohex(param.d)).slice(-charlen);
        ec.setPublicKeyHex(hPub);
        ec.setPrivateKeyHex(hPrv);
        return ec;
    }

    if (hextype === 'pkcs5prv') {
        var h = param,
            _ASN1HEX = ASN1HEX,
            a,
            key;
        a = _getChildIdx(h, 0);
        if (a.length === 9) {
            // RSA (INT x 9)
            key = new _RSAKey();
            key.readPKCS5PrvKeyHex(h);
        } else if (a.length === 6) {
            // DSA (INT x 6)
            key = new _SIGLIB_crypto_DSA();
            key.readPKCS5PrvKeyHex(h);
        } else if (
            a.length > 2 && // ECDSA (INT, OCT prv, [0] curve, [1] pub)
            h.substr(a[1], 2) === '04'
        ) {
            key = new _SIGLIB_crypto_ECDSA();
            key.readPKCS5PrvKeyHex(h);
        } else {
            throw 'unsupported PKCS#1/5 hexadecimal key';
        }

        return key;
    }

    if (hextype === 'pkcs8prv') {
        var key = _KEYUTIL.getKeyFromPlainPrivatePKCS8Hex(param);
        return key;
    }

    if (hextype === 'pkcs8pub') {
        return _KEYUTIL._getKeyFromPublicPKCS8Hex(param);
    }

    if (hextype === 'x509pub') {
        return X509.getPublicKeyFromCertHex(param);
    }
    if (
        param.indexOf('-END RSA PRIVATE KEY-') != -1 &&
        param.indexOf('4,ENCRYPTED') == -1
    ) {
        var hex = _pemtohex(param, 'RSA PRIVATE KEY');
        return _KEYUTIL.getKey(hex, null, 'pkcs5prv');
    }
    if (
        param.indexOf('-END RSA PRIVATE KEY-') != -1 &&
        param.indexOf('4,ENCRYPTED') != -1
    ) {
        var hPKey = _KEYUTIL.getDecryptedKeyHex(param, passcode);
        var rsaKey = new RSAKey();
        rsaKey.readPKCS5PrvKeyHex(hPKey);
        return rsaKey;
    }
    if (param.indexOf('-END ENCRYPTED PRIVATE KEY-') != -1) {
        return _KEYUTIL.getKeyFromEncryptedPKCS8PEM(param, passcode);
    }

    throw 'not supported argument';
};

var _RE_HEXDECONLY = new RegExp('');
_RE_HEXDECONLY.compile('[^0-9a-f]', 'gi');

// ========================================================================
// Signature Generation
// ========================================================================

function _rsasign_getHexPaddedDigestInfoForString(s, keySize, hashAlg) {
    var hashFunc = function(s) {
        return SIGLIB.crypto.Util.hashString(s, hashAlg);
    };
    var sHashHex = hashFunc(s);

    return SIGLIB.crypto.Util.getPaddedDigestInfoHex(
        sHashHex,
        hashAlg,
        keySize
    );
}

function _zeroPaddingOfSignature(hex, bitLength) {
    var s = '';
    var nZero = bitLength / 4 - hex.length;
    for (var i = 0; i < nZero; i++) {
        s = s + '0';
    }
    return s + hex;
}

// PKCS#1 (PSS) mask generation function
function pss_mgf1_str(seed, len, hash) {
    var mask = '',
        i = 0;

    while (mask.length < len) {
        mask += hextorstr(
            hash(
                rstrtohex(
                    seed +
                        String.fromCharCode.apply(String, [
                            (i & 0xff000000) >> 24,
                            (i & 0x00ff0000) >> 16,
                            (i & 0x0000ff00) >> 8,
                            i & 0x000000ff
                        ])
                )
            )
        );
        i += 1;
    }

    return mask;
}

RSAKey.prototype.signWithMessageHashPSS = function(hHash, hashAlg, sLen) {
    var mHash = hextorstr(hHash);
    var hLen = mHash.length;
    var emBits = this.n.bitLength() - 1;
    var emLen = Math.ceil(emBits / 8);
    var i;
    var hashFunc = function(sHex) {
        return SIGLIB.crypto.Util.hashHex(sHex, hashAlg);
    };

    if (sLen === -1 || sLen === undefined) {
        sLen = hLen; // same as hash length
    } else if (sLen === -2) {
        sLen = emLen - hLen - 2; // maximum
    } else if (sLen < -2) {
        throw 'invalid salt length';
    }

    if (emLen < hLen + sLen + 2) {
        throw 'data too long';
    }

    var salt = '';

    if (sLen > 0) {
        salt = new Array(sLen);
        new SecureRandom().nextBytes(salt);
        salt = String.fromCharCode.apply(String, salt);
    }

    var H = hextorstr(
        hashFunc(rstrtohex('\x00\x00\x00\x00\x00\x00\x00\x00' + mHash + salt))
    );
    var PS = [];

    for (i = 0; i < emLen - sLen - hLen - 2; i += 1) {
        PS[i] = 0x00;
    }

    var DB = String.fromCharCode.apply(String, PS) + '\x01' + salt;
    var dbMask = pss_mgf1_str(H, DB.length, hashFunc);
    var maskedDB = [];

    for (i = 0; i < DB.length; i += 1) {
        maskedDB[i] = DB.charCodeAt(i) ^ dbMask.charCodeAt(i);
    }

    var mask = (0xff00 >> (8 * emLen - emBits)) & 0xff;
    maskedDB[0] &= ~mask;

    for (i = 0; i < hLen; i++) {
        maskedDB.push(H.charCodeAt(i));
    }

    maskedDB.push(0xbc);

    return _zeroPaddingOfSignature(
        this.doPrivate(new BigInteger(maskedDB)).toString(16),
        this.n.bitLength()
    );
};

RSAKey.SALT_LEN_HLEN = -1;
RSAKey.SALT_LEN_MAX = -2;
RSAKey.SALT_LEN_RECOVER = -2;

if (typeof SIGLIB == 'undefined' || !SIGLIB) SIGLIB = {};
if (typeof SIGLIB.crypto == 'undefined' || !SIGLIB.crypto) SIGLIB.crypto = {};

SIGLIB.crypto.Util = new (function() {
    this.DIGESTINFOHEAD = {
        sha1: '3021300906052b0e03021a05000414',
        sha224: '302d300d06096086480165030402040500041c',
        sha256: '3031300d060960864801650304020105000420',
        sha384: '3041300d060960864801650304020205000430',
        sha512: '3051300d060960864801650304020305000440',
        md2: '3020300c06082a864886f70d020205000410',
        md5: '3020300c06082a864886f70d020505000410',
        ripemd160: '3021300906052b2403020105000414'
    };

    this.DEFAULTPROVIDER = {
        md5: 'cryptojs',
        sha1: 'cryptojs',
        sha224: 'cryptojs',
        sha256: 'cryptojs',
        sha384: 'cryptojs',
        sha512: 'cryptojs',
        ripemd160: 'cryptojs',
        hmacmd5: 'cryptojs',
        hmacsha1: 'cryptojs',
        hmacsha224: 'cryptojs',
        hmacsha256: 'cryptojs',
        hmacsha384: 'cryptojs',
        hmacsha512: 'cryptojs',
        hmacripemd160: 'cryptojs',

        MD5withRSA: 'cryptojs/jsrsa',
        SHA1withRSA: 'cryptojs/jsrsa',
        SHA224withRSA: 'cryptojs/jsrsa',
        SHA256withRSA: 'cryptojs/jsrsa',
        SHA384withRSA: 'cryptojs/jsrsa',
        SHA512withRSA: 'cryptojs/jsrsa',
        RIPEMD160withRSA: 'cryptojs/jsrsa',

        MD5withECDSA: 'cryptojs/jsrsa',
        SHA1withECDSA: 'cryptojs/jsrsa',
        SHA224withECDSA: 'cryptojs/jsrsa',
        SHA256withECDSA: 'cryptojs/jsrsa',
        SHA384withECDSA: 'cryptojs/jsrsa',
        SHA512withECDSA: 'cryptojs/jsrsa',
        RIPEMD160withECDSA: 'cryptojs/jsrsa',

        SHA1withDSA: 'cryptojs/jsrsa',
        SHA224withDSA: 'cryptojs/jsrsa',
        SHA256withDSA: 'cryptojs/jsrsa',

        MD5withRSAandMGF1: 'cryptojs/jsrsa',
        SHA1withRSAandMGF1: 'cryptojs/jsrsa',
        SHA224withRSAandMGF1: 'cryptojs/jsrsa',
        SHA256withRSAandMGF1: 'cryptojs/jsrsa',
        SHA384withRSAandMGF1: 'cryptojs/jsrsa',
        SHA512withRSAandMGF1: 'cryptojs/jsrsa',
        RIPEMD160withRSAandMGF1: 'cryptojs/jsrsa'
    };

    this.CRYPTOJSMESSAGEDIGESTNAME = {
        md5: CryptoJS.algo.MD5,
        sha1: CryptoJS.algo.SHA1,
        sha224: CryptoJS.algo.SHA224,
        sha256: CryptoJS.algo.SHA256,
        sha384: CryptoJS.algo.SHA384,
        sha512: CryptoJS.algo.SHA512,
        ripemd160: CryptoJS.algo.RIPEMD160
    };

    this.getDigestInfoHex = function(hHash, alg) {
        if (typeof this.DIGESTINFOHEAD[alg] == 'undefined')
            throw 'alg not supported in Util.DIGESTINFOHEAD: ' + alg;
        return this.DIGESTINFOHEAD[alg] + hHash;
    };

    this.getPaddedDigestInfoHex = function(hHash, alg, keySize) {
        var hDigestInfo = this.getDigestInfoHex(hHash, alg);
        var pmStrLen = keySize / 4; // minimum PM length

        if (hDigestInfo.length + 22 > pmStrLen)
            // len(0001+ff(*8)+00+hDigestInfo)=22
            throw 'key is too short for SigAlg: keylen=' + keySize + ',' + alg;

        var hHead = '0001';
        var hTail = '00' + hDigestInfo;
        var hMid = '';
        var fLen = pmStrLen - hHead.length - hTail.length;
        for (var i = 0; i < fLen; i += 2) {
            hMid += 'ff';
        }
        var hPaddedMessage = hHead + hMid + hTail;
        return hPaddedMessage;
    };

    this.hashString = function(s, alg) {
        var md = new SIGLIB.crypto.MessageDigest({ alg: alg });
        return md.digestString(s);
    };

    this.hashHex = function(sHex, alg) {
        var md = new SIGLIB.crypto.MessageDigest({ alg: alg });
        return md.digestHex(sHex);
    };

    this.sha1 = function(s) {
        var md = new SIGLIB.crypto.MessageDigest({
            alg: 'sha1',
            prov: 'cryptojs'
        });
        return md.digestString(s);
    };

    this.sha256 = function(s) {
        var md = new SIGLIB.crypto.MessageDigest({
            alg: 'sha256',
            prov: 'cryptojs'
        });
        return md.digestString(s);
    };

    this.sha256Hex = function(s) {
        var md = new SIGLIB.crypto.MessageDigest({
            alg: 'sha256',
            prov: 'cryptojs'
        });
        return md.digestHex(s);
    };
})();

SIGLIB.crypto.Util.SECURERANDOMGEN = new SecureRandom();

SIGLIB.crypto.Util.getRandomHexOfNbytes = function(n) {
    var ba = new Array(n);
    SIGLIB.crypto.Util.SECURERANDOMGEN.nextBytes(ba);
    return BAtohex(ba);
};

SIGLIB.crypto.Util.getRandomBigIntegerOfNbytes = function(n) {
    return new BigInteger(SIGLIB.crypto.Util.getRandomHexOfNbytes(n), 16);
};

SIGLIB.crypto.Util.getRandomHexOfNbits = function(n) {
    var n_remainder = n % 8;
    var n_quotient = (n - n_remainder) / 8;
    var ba = new Array(n_quotient + 1);
    SIGLIB.crypto.Util.SECURERANDOMGEN.nextBytes(ba);
    ba[0] = (((255 << n_remainder) & 255) ^ 255) & ba[0];
    return BAtohex(ba);
};

SIGLIB.crypto.Util.getRandomBigIntegerOfNbits = function(n) {
    return new BigInteger(SIGLIB.crypto.Util.getRandomHexOfNbits(n), 16);
};

SIGLIB.crypto.Util.getRandomBigIntegerZeroToMax = function(biMax) {
    var bitLenMax = biMax.bitLength();
    while (1) {
        var biRand = SIGLIB.crypto.Util.getRandomBigIntegerOfNbits(bitLenMax);
        if (biMax.compareTo(biRand) != -1) return biRand;
    }
};

SIGLIB.crypto.Util.getRandomBigIntegerMinToMax = function(biMin, biMax) {
    var flagCompare = biMin.compareTo(biMax);
    if (flagCompare == 1) throw 'biMin is greater than biMax';
    if (flagCompare == 0) return biMin;

    var biDiff = biMax.subtract(biMin);
    var biRand = SIGLIB.crypto.Util.getRandomBigIntegerZeroToMax(biDiff);
    return biRand.add(biMin);
};

SIGLIB.crypto.MessageDigest = function(params) {
    var md = null;
    var algName = null;
    var provName = null;

    this.setAlgAndProvider = function(alg, prov) {
        alg = SIGLIB.crypto.MessageDigest.getCanonicalAlgName(alg);

        if (alg !== null && prov === undefined)
            prov = SIGLIB.crypto.Util.DEFAULTPROVIDER[alg];

        // for cryptojs
        if (
            ':md5:sha1:sha224:sha256:sha384:sha512:ripemd160:'.indexOf(alg) !=
                -1 &&
            prov == 'cryptojs'
        ) {
            try {
                this.md = SIGLIB.crypto.Util.CRYPTOJSMESSAGEDIGESTNAME[
                    alg
                ].create();
            } catch (ex) {
                throw 'setAlgAndProvider hash alg set fail alg=' +
                    alg +
                    '/' +
                    ex;
            }
            this.updateString = function(str) {
                this.md.update(str);
            };
            this.updateHex = function(hex) {
                var wHex = CryptoJS.enc.Hex.parse(hex);
                this.md.update(wHex);
            };
            this.digest = function() {
                var hash = this.md.finalize();
                return hash.toString(CryptoJS.enc.Hex);
            };
            this.digestString = function(str) {
                this.updateString(str);
                return this.digest();
            };
            this.digestHex = function(hex) {
                this.updateHex(hex);
                return this.digest();
            };
        }
    };
    this.updateString = function(str) {
        throw 'updateString(str) not supported for this alg/prov: ' +
            this.algName +
            '/' +
            this.provName;
    };
    this.updateHex = function(hex) {
        throw 'updateHex(hex) not supported for this alg/prov: ' +
            this.algName +
            '/' +
            this.provName;
    };
    this.digest = function() {
        throw 'digest() not supported for this alg/prov: ' +
            this.algName +
            '/' +
            this.provName;
    };
    this.digestString = function(str) {
        throw 'digestString(str) not supported for this alg/prov: ' +
            this.algName +
            '/' +
            this.provName;
    };
    this.digestHex = function(hex) {
        throw 'digestHex(hex) not supported for this alg/prov: ' +
            this.algName +
            '/' +
            this.provName;
    };
    if (params !== undefined) {
        if (params['alg'] !== undefined) {
            this.algName = params['alg'];
            if (params['prov'] === undefined)
                this.provName =
                    SIGLIB.crypto.Util.DEFAULTPROVIDER[this.algName];
            this.setAlgAndProvider(this.algName, this.provName);
        }
    }
};

//TODO: not in use
SIGLIB.crypto.MessageDigest.getCanonicalAlgName = function(alg) {
    if (typeof alg === 'string') {
        alg = alg.toLowerCase();
        alg = alg.replace(/-/, '');
    }
    return alg;
};

SIGLIB.crypto.MessageDigest.getHashLength = function(alg) {
    var MD = SIGLIB.crypto.MessageDigest;
    var alg2 = MD.getCanonicalAlgName(alg);
    if (MD.HASHLENGTH[alg2] === undefined)
        throw 'not supported algorithm: ' + alg;
    return MD.HASHLENGTH[alg2];
};

SIGLIB.crypto.MessageDigest.HASHLENGTH = {
    md5: 16,
    sha1: 20,
    sha224: 28,
    sha256: 32,
    sha384: 48,
    sha512: 64,
    ripemd160: 20
};

SIGLIB.crypto.Mac = function(params) {
    var mac = null;
    var pass = null;
    var algName = null;
    var provName = null;
    var algProv = null;

    this.setAlgAndProvider = function(alg, prov) {
        alg = alg.toLowerCase();

        if (alg == null) alg = 'hmacsha1';

        alg = alg.toLowerCase();
        if (alg.substr(0, 4) != 'hmac') {
            throw 'setAlgAndProvider unsupported HMAC alg: ' + alg;
        }

        if (prov === undefined) prov = SIGLIB.crypto.Util.DEFAULTPROVIDER[alg];
        this.algProv = alg + '/' + prov;

        var hashAlg = alg.substr(4);

        // for cryptojs
        if (
            ':md5:sha1:sha224:sha256:sha384:sha512:ripemd160:'.indexOf(
                hashAlg
            ) != -1 &&
            prov == 'cryptojs'
        ) {
            try {
                var mdObj =
                    SIGLIB.crypto.Util.CRYPTOJSMESSAGEDIGESTNAME[hashAlg];
                this.mac = CryptoJS.algo.HMAC.create(mdObj, this.pass);
            } catch (ex) {
                throw 'setAlgAndProvider hash alg set fail hashAlg=' +
                    hashAlg +
                    '/' +
                    ex;
            }
            this.updateString = function(str) {
                this.mac.update(str);
            };
            this.updateHex = function(hex) {
                var wHex = CryptoJS.enc.Hex.parse(hex);
                this.mac.update(wHex);
            };
            this.doFinal = function() {
                var hash = this.mac.finalize();
                return hash.toString(CryptoJS.enc.Hex);
            };
            this.doFinalString = function(str) {
                this.updateString(str);
                return this.doFinal();
            };
            this.doFinalHex = function(hex) {
                this.updateHex(hex);
                return this.doFinal();
            };
        }
    };
    this.updateString = function(str) {
        throw 'updateString(str) not supported for this alg/prov: ' +
            this.algProv;
    };
    this.updateHex = function(hex) {
        throw 'updateHex(hex) not supported for this alg/prov: ' + this.algProv;
    };
    this.doFinal = function() {
        throw 'digest() not supported for this alg/prov: ' + this.algProv;
    };
    this.doFinalString = function(str) {
        throw 'digestString(str) not supported for this alg/prov: ' +
            this.algProv;
    };
    this.doFinalHex = function(hex) {
        throw 'digestHex(hex) not supported for this alg/prov: ' + this.algProv;
    };
    this.setPassword = function(pass) {
        if (typeof pass == 'string') {
            var hPass = pass;
            if (pass.length % 2 == 1 || !pass.match(/^[0-9A-Fa-f]+$/)) {
                // raw str
                hPass = rstrtohex(pass);
            }
            this.pass = CryptoJS.enc.Hex.parse(hPass);
            return;
        }

        if (typeof pass != 'object')
            throw 'SIGLIB.crypto.Mac unsupported password type: ' + pass;

        var hPass = null;
        if (pass.hex !== undefined) {
            if (pass.hex.length % 2 != 0 || !pass.hex.match(/^[0-9A-Fa-f]+$/))
                throw 'Mac: wrong hex password: ' + pass.hex;
            hPass = pass.hex;
        }
        if (pass.utf8 !== undefined) hPass = utf8tohex(pass.utf8);
        if (pass.rstr !== undefined) hPass = rstrtohex(pass.rstr);
        if (pass.b64 !== undefined) hPass = b64tohex(pass.b64);
        if (pass.b64u !== undefined) hPass = b64utohex(pass.b64u);

        if (hPass == null)
            throw 'SIGLIB.crypto.Mac unsupported password type: ' + pass;

        this.pass = CryptoJS.enc.Hex.parse(hPass);
    };

    if (params !== undefined) {
        if (params.pass !== undefined) {
            this.setPassword(params.pass);
        }
        if (params.alg !== undefined) {
            this.algName = params.alg;
            if (params['prov'] === undefined)
                this.provName =
                    SIGLIB.crypto.Util.DEFAULTPROVIDER[this.algName];
            this.setAlgAndProvider(this.algName, this.provName);
        }
    }
};

exports.Signature = function Signature(params) {
    var prvKey = null;
    var pubKey = null;
    var md = null;
    var sig = null;
    var algName = null;
    var provName = null;
    var algProvName = null;
    var mdAlgName = null;
    var pubkeyAlgName = null;
    var state = null;
    var pssSaltLen = -1;
    var initParams = null;
    var sHashHex = null;
    var hDigestInfo = null;
    var hPaddedDigestInfo = null;
    var hSign = null;

    this._setAlgNames = function() {
        var matchResult = this.algName.match(/^(.+)with(.+)$/);
        if (matchResult) {
            this.mdAlgName = matchResult[1].toLowerCase();
            this.pubkeyAlgName = matchResult[2].toLowerCase();
        }
    };
    this._zeroPaddingOfSignature = function(hex, bitLength) {
        var s = '';
        var nZero = bitLength / 4 - hex.length;
        for (var i = 0; i < nZero; i++) {
            s = s + '0';
        }
        return s + hex;
    };
    this.setAlgAndProvider = function(alg, prov) {
        this._setAlgNames();
        if (prov != 'cryptojs/jsrsa') throw 'provider not supported: ' + prov;

        if (
            ':md5:sha1:sha224:sha256:sha384:sha512:ripemd160:'.indexOf(
                this.mdAlgName
            ) != -1
        ) {
            try {
                this.md = new SIGLIB.crypto.MessageDigest({
                    alg: this.mdAlgName
                });
            } catch (ex) {
                throw 'setAlgAndProvider hash alg set fail alg=' +
                    this.mdAlgName +
                    '/' +
                    ex;
            }

            this.init = function(keyparam, pass) {
                var keyObj = null;
                try {
                    if (pass === undefined) {
                        keyObj = KEYUTIL.getKey(keyparam); //main endpoint
                    } else {
                        keyObj = KEYUTIL.getKey(keyparam, pass);
                    }
                } catch (ex) {
                    throw 'init failed:' + ex;
                }

                if (keyObj.isPrivate === true) {
                    this.prvKey = keyObj;
                    this.state = 'SIGN';
                } else if (keyObj.isPublic === true) {
                    this.pubKey = keyObj;
                    this.state = 'VERIFY';
                } else {
                    throw 'init failed.:' + keyObj;
                }
            };

            this.updateString = function(str) {
                this.md.updateString(str);
            };

            this.updateHex = function(hex) {
                this.md.updateHex(hex);
            };

            this.sign = function() {
                this.sHashHex = this.md.digest();
                if (
                    this.prvKey instanceof RSAKey &&
                    this.pubkeyAlgName === 'rsaandmgf1'
                ) {
                    this.hSign = this.prvKey.signWithMessageHashPSS(
                        this.sHashHex,
                        this.mdAlgName,
                        this.pssSaltLen
                    );
                }
                return this.hSign;
            };
            this.signString = function(str) {
                this.updateString(str);
                return this.sign();
            };
            this.signHex = function(hex) {
                this.updateHex(hex);
                return this.sign();
            };
        }
    };

    this.init = function(key, pass) {
        throw 'init(key, pass) not supported for this alg:prov=' +
            this.algProvName;
    };

    this.updateString = function(str) {
        throw 'updateString(str) not supported for this alg:prov=' +
            this.algProvName;
    };

    this.updateHex = function(hex) {
        throw 'updateHex(hex) not supported for this alg:prov=' +
            this.algProvName;
    };

    this.sign = function() {
        throw 'sign() not supported for this alg:prov=' + this.algProvName;
    };

    this.signString = function(str) {
        throw 'digestString(str) not supported for this alg:prov=' +
            this.algProvName;
    };

    this.signHex = function(hex) {
        throw 'digestHex(hex) not supported for this alg:prov=' +
            this.algProvName;
    };

    this.verify = function(hSigVal) {
        throw 'verify(hSigVal) not supported for this alg:prov=' +
            this.algProvName;
    };

    this.initParams = params;

    if (params !== undefined) {
        if (params.alg !== undefined) {
            this.algName = params.alg;
            if (params.prov === undefined) {
                //main endpoint. pass the 'prov' during Signature constructor call
                this.provName =
                    SIGLIB.crypto.Util.DEFAULTPROVIDER[this.algName];
            } else {
                this.provName = params.prov;
            }
            this.algProvName = this.algName + ':' + this.provName;
            this.setAlgAndProvider(this.algName, this.provName);
            this._setAlgNames();
        }

        if (params['psssaltlen'] !== undefined)
            this.pssSaltLen = params['psssaltlen'];

        if (params.prvkeypem !== undefined) {
            if (params.prvkeypas !== undefined) {
                throw 'both prvkeypem and prvkeypas parameters not supported';
            } else {
                try {
                    var prvKey = KEYUTIL.getKey(params.prvkeypem);
                    this.init(prvKey);
                } catch (ex) {
                    throw 'fatal error to load pem private key: ' + ex;
                }
            }
        }
    }
};

SIGLIB.crypto.OID = new (function() {
    this.oidhex2name = {
        '2a864886f70d010101': 'rsaEncryption',
        '2a8648ce3d0201': 'ecPublicKey',
        '2a8648ce380401': 'dsa',
        '2a8648ce3d030107': 'secp256r1',
        '2b8104001f': 'secp192k1',
        '2b81040021': 'secp224r1',
        '2b8104000a': 'secp256k1',
        '2b81040023': 'secp521r1',
        '2b81040022': 'secp384r1',
        '2a8648ce380403': 'SHA1withDSA',
        '608648016503040301': 'SHA224withDSA',
        '608648016503040302': 'SHA256withDSA'
    };
})();
