/*
 * js/ui/dom.js   ->   WG.dom
 *
 * PURPOSE
 *   Tiny DOM builder shared by index.html and tests/test.html.
 *
 * SECURITY NOTES
 *   Text is ALWAYS inserted with textContent, never innerHTML, so no string
 *   (including keys, mnemonics or user input) can ever be parsed as HTML.
 *   This is the only place in the app that creates elements.
 */
(function (WG) {
  'use strict';

  /**
   * Create an element.
   * @param {string} tag        element name, e.g. 'div'
   * @param {object} [attrs]    attributes; 'class' and 'data-*' supported, values are strings
   * @param {...(Node|string)}  children  nodes, or strings (inserted as text nodes)
   */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (/^on/i.test(k)) throw new Error('dom.el: inline event attributes are not allowed');
        if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, String(attrs[k]));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  /** Append a child: strings become text nodes, arrays are flattened, null is skipped. */
  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(parent, c); }); return; }
    parent.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }

  /** Remove every child of a node. */
  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  WG.define('dom', { el: el, append: append, clear: clear });
})(window.WG);
