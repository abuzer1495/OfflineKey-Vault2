/*
 * js/core/entropy-pool.js   ->   WG.entropy
 *
 * PURPOSE
 *   The ONLY source of secret randomness in the app. It mixes the browser
 *   CSPRNG with user-supplied entropy (dice, coin flips, pointer movement,
 *   key timings, free text, timer jitter) and hands out key material.
 *
 * DESIGN (all formulas are re-computed independently in the self-tests)
 *   state0   = SHA-512( "WG-pool-init-v1" || CSPRNG(64) || context )
 *   absorb   : state' = SHA-512( state || u32be(counter) || u8(len(tag)) || tag
 *                                || u32be(len(data)) || data )
 *   extract  : out = HKDF-SHA512( ikm  = CSPRNG(64) || state,
 *                                 salt = "WG-entropy-v1",
 *                                 info = "wg-extract/" || purpose, L = n )
 *              then the state is ratcheted: state' = SHA-512("WG-ratchet-v1" || state)
 *   dice-only: out = SHA-256( ASCII digits of the d6 rolls )[0..n)
 *              (same method as the Coldcard hardware wallet, so the result
 *              can be checked with `echo -n 3615... | sha256sum`)
 *
 * SECURITY PROPERTIES
 *   - User input can never weaken the result: every mixed extraction contains
 *     64 fresh CSPRNG bytes, so even all-zero or attacker-chosen user input
 *     leaves full CSPRNG strength. User input only adds protection against a
 *     broken/backdoored CSPRNG.
 *   - "Credited bits" are a deliberately conservative estimate of how much
 *     entropy the USER contributed. They are used as a policy gate (minimum
 *     before generation), never as a claim about total security.
 *   - Dice-only mode is the one exception to CSPRNG mixing; it exists so the
 *     result is verifiable with independent tools. The caller must warn the
 *     user, and the dice log is wiped after use so it cannot be reused.
 *   - Extraction refuses to run until WG.selftest.requireHealthy() passes.
 */
(function (WG, V) {
  'use strict';

  var B = WG.bytes;
  var H = V.hashes;

  /** Conservative bits credited per accepted event, by source. */
  var CREDIT = Object.freeze({
    dice: Math.log2(6),   // 2.585 bits per fair six-sided die roll
    coin: 1,              // 1 bit per fair coin flip
    pointer: 0.5,         // mouse/touch sample: coordinates + timing, heavily discounted
    keyboard: 1,          // key press timing (not the key itself)
    text: 0,              // free text is mixed in but never trusted
    jitter: 0,            // timer jitter is mixed in but never trusted
    context: 0,           // time/screen context at start-up, never trusted
  });

  /** Minimum number of d6 rolls for n output bytes in dice-only mode (ceil(8n / log2 6)). */
  function diceRollsNeeded(nBytes) {
    return Math.ceil((nBytes * 8) / Math.log2(6));
  }

  /** 4-byte big-endian encoding of a non-negative integer. */
  function u32be(n) {
    if (!(n >= 0 && n <= 0xffffffff && Math.floor(n) === n)) throw new RangeError('u32 out of range');
    return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  }

  /** Fresh bytes from the browser CSPRNG (the mandatory base layer). */
  function csprng(n) {
    var out = new Uint8Array(n);
    window.crypto.getRandomValues(out);
    return out;
  }

  /**
   * Pure absorb step (see DESIGN). Exposed so self-tests can check it.
   * @param {Uint8Array} state    64-byte current state
   * @param {number} counter      event counter (u32)
   * @param {string} tag          source name, ASCII, 1..255 chars
   * @param {Uint8Array} data     event payload
   * @returns {Uint8Array}        64-byte new state
   */
  function absorb(state, counter, tag, data) {
    B.assertBytes(state, 64, 'state');
    B.assertBytes(data, undefined, 'data');
    if (typeof tag !== 'string' || !/^[\x20-\x7e]{1,255}$/.test(tag)) throw new TypeError('tag must be 1..255 printable ASCII chars');
    var tagBytes = B.utf8ToBytes(tag);
    return H.sha512(B.concat(state, u32be(counter), new Uint8Array([tagBytes.length]), tagBytes, u32be(data.length), data));
  }

  /**
   * Pure extraction KDF (see DESIGN). Exposed so self-tests can check it.
   * @param {Uint8Array} rand     64 fresh CSPRNG bytes
   * @param {Uint8Array} state    64-byte pool state
   * @param {string} purpose      domain separation label, e.g. "bip39-entropy"
   * @param {number} nBytes       output length (1..255*64)
   */
  function derive(rand, state, purpose, nBytes) {
    B.assertBytes(rand, 64, 'rand');
    B.assertBytes(state, 64, 'state');
    if (typeof purpose !== 'string' || !purpose) throw new TypeError('purpose required');
    return H.hkdf(H.sha512, B.concat(rand, state), B.utf8ToBytes('WG-entropy-v1'), B.utf8ToBytes('wg-extract/' + purpose), nBytes);
  }

  /**
   * Pure dice-only derivation (see DESIGN).
   * @param {string} rolls   digits '1'..'6' only, one per roll
   * @param {number} nBytes  16 (128-bit) or 32 (256-bit)
   */
  function diceToEntropy(rolls, nBytes) {
    if (nBytes !== 16 && nBytes !== 32) throw new RangeError('dice-only output must be 16 or 32 bytes');
    if (typeof rolls !== 'string' || !/^[1-6]*$/.test(rolls)) throw new TypeError('rolls must contain only digits 1-6');
    var need = diceRollsNeeded(nBytes);
    if (rolls.length < need) throw new RangeError('need at least ' + need + ' dice rolls, got ' + rolls.length);
    return H.sha256(B.utf8ToBytes(rolls)).slice(0, nBytes);
  }

  /** Bytes describing the start-up context (time, timers, screen); credited 0 bits. */
  function contextBytes() {
    var dv = new DataView(new ArrayBuffer(40));
    dv.setFloat64(0, Date.now());
    dv.setFloat64(8, performance.now());
    dv.setFloat64(16, (window.screen && screen.width) || 0);
    dv.setFloat64(24, (window.screen && screen.height) || 0);
    dv.setFloat64(32, window.devicePixelRatio || 1);
    return new Uint8Array(dv.buffer);
  }

  /**
   * Create an independent pool. The app uses the shared WG.entropy.pool;
   * tests create their own so they never disturb it.
   */
  function createPool() {
    var state = H.sha512(B.concat(B.utf8ToBytes('WG-pool-init-v1'), csprng(64), contextBytes()));
    var counter = 0;
    var credits = {};      // source -> credited bits
    var counts = {};       // source -> accepted events
    var diceLog = [];      // d6 roll values, kept only for dice-only mode
    var listeners = [];

    /** Notify UI listeners (they must not throw; errors are isolated). */
    function changed() {
      listeners.forEach(function (fn) { try { fn(); } catch (e) { /* UI errors must not break the pool */ } });
    }

    /** Mix one event into the state and account for it. */
    function add(source, data, credit) {
      if (!Object.prototype.hasOwnProperty.call(CREDIT, source)) throw new Error('unknown entropy source ' + source);
      var next = absorb(state, counter, source, data);
      B.wipe(state);
      state = next;
      counter = (counter + 1) >>> 0;
      credits[source] = (credits[source] || 0) + credit;
      counts[source] = (counts[source] || 0) + 1;
      changed();
    }

    var pool = {
      /**
       * Add one die roll.
       * @param {number} value  1..6
       */
      addDie: function (value) {
        if (!(value >= 1 && value <= 6 && Math.floor(value) === value)) throw new RangeError('die value must be 1..6');
        diceLog.push(value);
        add('dice', new Uint8Array([value]), CREDIT.dice);
      },

      /** Add one coin flip (true = heads/tura, false = tails/yazı). */
      addCoin: function (heads) {
        if (typeof heads !== 'boolean') throw new TypeError('coin flip must be boolean');
        add('coin', new Uint8Array([heads ? 1 : 0]), CREDIT.coin);
      },

      /** Add one pointer sample (raw coordinates and high-resolution time). */
      addPointer: function (x, y, t, kind) {
        var dv = new DataView(new ArrayBuffer(25));
        dv.setFloat64(0, x); dv.setFloat64(8, y); dv.setFloat64(16, t);
        dv.setUint8(24, kind === 'touch' ? 1 : kind === 'pen' ? 2 : 0);
        add('pointer', new Uint8Array(dv.buffer), CREDIT.pointer);
      },

      /** Add one key-press timing sample (the key itself is never recorded). */
      addKeyTiming: function (t) {
        var dv = new DataView(new ArrayBuffer(8));
        dv.setFloat64(0, t);
        add('keyboard', new Uint8Array(dv.buffer), CREDIT.keyboard);
      },

      /** Mix in free text (credited 0 bits; human text is predictable). */
      addText: function (str) {
        if (typeof str !== 'string' || !str) return;
        add('text', B.utf8ToBytes(str), CREDIT.text);
      },

      /** Mix in timer-jitter measurements (credited 0 bits). */
      addJitter: function (samples) {
        var dv = new DataView(new ArrayBuffer(8 * samples.length));
        samples.forEach(function (s, i) { dv.setFloat64(8 * i, s); });
        add('jitter', new Uint8Array(dv.buffer), CREDIT.jitter);
      },

      /** Snapshot of credited bits and event counts for the UI. */
      stats: function () {
        var total = 0;
        Object.keys(credits).forEach(function (k) { total += credits[k]; });
        return {
          creditedBits: total,
          bySource: Object.assign({}, credits),
          counts: Object.assign({}, counts),
          diceRolls: diceLog.length,
          events: counter,
        };
      },

      /**
       * Extract n bytes of key material (CSPRNG + pool, see DESIGN).
       * @param {string} purpose                    domain separation label
       * @param {number} nBytes                     output length
       * @param {{minCreditedBits?: number}} [opts] refuse unless the user contributed this much
       */
      extract: function (purpose, nBytes, opts) {
        WG.selftest.requireHealthy();
        var min = (opts && opts.minCreditedBits) || 0;
        if (pool.stats().creditedBits < min) throw new Error('not enough user entropy: need ' + min + ' credited bits');
        var rand = csprng(64);
        var out = derive(rand, state, purpose, nBytes);
        var next = H.sha512(B.concat(B.utf8ToBytes('WG-ratchet-v1'), state));
        B.wipe(rand, state);
        state = next;
        changed();
        return out;
      },

      /**
       * Dice-only extraction (NO CSPRNG, verifiable with external tools).
       * The dice log is wiped afterwards so the same rolls are never reused.
       * @param {number} nBytes  16 or 32
       */
      extractDiceOnly: function (nBytes) {
        WG.selftest.requireHealthy();
        var rolls = diceLog.join('');
        try {
          return diceToEntropy(rolls, nBytes);
        } finally {
          if (rolls.length >= diceRollsNeeded(nBytes)) {
            diceLog.fill(0);
            diceLog.length = 0;
            changed();
          }
        }
      },

      /** Forget everything: new random state, zero credits, wiped dice log. */
      reset: function () {
        B.wipe(state);
        state = H.sha512(B.concat(B.utf8ToBytes('WG-pool-init-v1'), csprng(64), contextBytes()));
        counter = 0;
        credits = {};
        counts = {};
        diceLog.fill(0);
        diceLog.length = 0;
        changed();
      },

      /** Register fn() to be called after every change (UI refresh). Returns unsubscribe(). */
      onChange: function (fn) {
        listeners.push(fn);
        return function unsubscribe() {
          var i = listeners.indexOf(fn);
          if (i !== -1) listeners.splice(i, 1);
        };
      },
    };
    return Object.freeze(pool);
  }

  WG.define('entropy', {
    CREDIT: CREDIT,
    diceRollsNeeded: diceRollsNeeded,
    absorb: absorb,
    derive: derive,
    diceToEntropy: diceToEntropy,
    createPool: createPool,
    /** The app-wide pool used by index.html. */
    pool: createPool(),
  });
})(window.WG, window.WGVendor);
