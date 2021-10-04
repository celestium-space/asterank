(function (factory) {
  "use strict";
  if (typeof define === "function" && define.amd) {
    define(["jquery"], factory);
  } else {
    factory(jQuery);
  }
})(function ($) {
  "use strict";
  var utils = (function () {
      return {
        extend: function (target, source) {
          return $.extend(target, source);
        },
        addEvent: function (element, eventType, handler) {
          if (element.addEventListener) {
            element.addEventListener(eventType, handler, false);
          } else if (element.attachEvent) {
            element.attachEvent("on" + eventType, handler);
          } else {
            throw new Error(
              "Browser doesn't support addEventListener or attachEvent"
            );
          }
        },
        removeEvent: function (element, eventType, handler) {
          if (element.removeEventListener) {
            element.removeEventListener(eventType, handler, false);
          } else if (element.detachEvent) {
            element.detachEvent("on" + eventType, handler);
          }
        },
        createNode: function (html) {
          var div = document.createElement("div");
          div.innerHTML = html;
          return div.firstChild;
        },
      };
    })(),
    keys = { ESC: 27, TAB: 9, RETURN: 13, UP: 38, DOWN: 40 };
  function Autocomplete(el, options) {
    var noop = function () {},
      that = this,
      defaults = {
        autoSelectFirst: false,
        appendTo: "body",
        serviceUrl: null,
        lookup: null,
        onSelect: null,
        width: "auto",
        minChars: 1,
        maxHeight: 300,
        deferRequestBy: 0,
        params: {},
        formatResult: Autocomplete.formatResult,
        delimiter: null,
        zIndex: 9999,
        type: "GET",
        noCache: false,
        onSearchStart: noop,
        onSearchComplete: noop,
        containerClass: "autocomplete-suggestions",
        tabDisabled: false,
        dataType: "text",
        lookupFilter: function (suggestion, originalQuery, queryLowerCase) {
          return suggestion.value.toLowerCase().indexOf(queryLowerCase) !== -1;
        },
        paramName: "query",
        transformResult: function (response) {
          return response.suggestions;
        },
      };
    that.element = el;
    that.el = $(el);
    that.suggestions = [];
    that.badQueries = [];
    that.selectedIndex = -1;
    that.currentValue = that.element.value;
    that.intervalId = 0;
    that.cachedResponse = [];
    that.onChangeInterval = null;
    that.onChange = null;
    that.ignoreValueChange = false;
    that.isLocal = false;
    that.suggestionsContainer = null;
    that.options = $.extend({}, defaults, options);
    that.classes = {
      selected: "autocomplete-selected",
      suggestion: "autocomplete-suggestion",
    };
    that.initialize();
    that.setOptions(options);
  }
  Autocomplete.utils = utils;
  $.Autocomplete = Autocomplete;
  Autocomplete.formatResult = function (suggestion, currentValue) {
    var reEscape = new RegExp(
        "(\\" +
          [
            "/",
            ".",
            "*",
            "+",
            "?",
            "|",
            "(",
            ")",
            "[",
            "]",
            "{",
            "}",
            "\\",
          ].join("|\\") +
          ")",
        "g"
      ),
      pattern = "(" + currentValue.replace(reEscape, "\\$1") + ")";
    return (
      "<span>" +
      suggestion.value.replace(
        new RegExp(pattern, "gi"),
        "<strong>$1</strong>"
      ) +
      "</span>"
    );
  };
  Autocomplete.prototype = {
    killerFn: null,
    initialize: function () {
      var that = this,
        suggestionSelector = "." + that.classes.suggestion,
        selected = that.classes.selected,
        options = that.options,
        container;
      that.element.setAttribute("autocomplete", "off");
      that.killerFn = function (e) {
        if (
          $(e.target).closest("." + that.options.containerClass).length === 0
        ) {
          that.killSuggestions();
          that.disableKillerFn();
        }
      };
      if (!options.width || options.width === "auto") {
        options.width = that.el.outerWidth();
      }
      that.suggestionsContainer = Autocomplete.utils.createNode(
        '<div class="' +
          options.containerClass +
          '" style="position: absolute; display: none;"></div>'
      );
      container = $(that.suggestionsContainer);
      container.appendTo(options.appendTo).width(options.width);
      container.on("mouseover", suggestionSelector, function () {
        that.activate($(this).data("index"));
      });
      container.on("mouseout", function () {
        that.selectedIndex = -1;
        container.children("." + selected).removeClass(selected);
      });
      container.on("click", suggestionSelector, function () {
        that.select($(this).data("index"), false);
      });
      that.fixPosition();
      if (window.opera) {
        that.el.on("keypress", function (e) {
          that.onKeyPress(e);
        });
      } else {
        that.el.on("keydown", function (e) {
          that.onKeyPress(e);
        });
      }
      that.el.on("keyup", function (e) {
        that.onKeyUp(e);
      });
      that.el.on("blur", function () {
        that.onBlur();
      });
      that.el.on("focus", function () {
        that.fixPosition();
      });
    },
    onBlur: function () {
      this.enableKillerFn();
    },
    setOptions: function (suppliedOptions) {
      var that = this,
        options = that.options;
      utils.extend(options, suppliedOptions);
      that.isLocal = $.isArray(options.lookup);
      if (that.isLocal) {
        options.lookup = that.verifySuggestionsFormat(options.lookup);
      }
      $(that.suggestionsContainer).css({
        "max-height": options.maxHeight + "px",
        width: options.width + "px",
        "z-index": options.zIndex,
      });
    },
    clearCache: function () {
      this.cachedResponse = [];
      this.badQueries = [];
    },
    disable: function () {
      this.disabled = true;
    },
    enable: function () {
      this.disabled = false;
    },
    fixPosition: function () {
      var that = this,
        offset;
      if (that.options.appendTo !== "body") {
        return;
      }
      offset = that.el.offset();
      $(that.suggestionsContainer).css({
        top: offset.top + that.el.outerHeight() + "px",
        left: offset.left + "px",
      });
    },
    enableKillerFn: function () {
      var that = this;
      $(document).on("click", that.killerFn);
    },
    disableKillerFn: function () {
      var that = this;
      $(document).off("click", that.killerFn);
    },
    killSuggestions: function () {
      var that = this;
      that.stopKillSuggestions();
      that.intervalId = window.setInterval(function () {
        that.hide();
        that.stopKillSuggestions();
      }, 300);
    },
    stopKillSuggestions: function () {
      window.clearInterval(this.intervalId);
    },
    onKeyPress: function (e) {
      var that = this;
      if (
        !that.disabled &&
        !that.visible &&
        e.keyCode === keys.DOWN &&
        that.currentValue
      ) {
        that.suggest();
        return;
      }
      if (that.disabled || !that.visible) {
        return;
      }
      switch (e.keyCode) {
        case keys.ESC:
          that.el.val(that.currentValue);
          that.hide();
          break;
        case keys.TAB:
        case keys.RETURN:
          if (that.selectedIndex === -1) {
            that.hide();
            return;
          }
          that.select(that.selectedIndex, e.keyCode === keys.RETURN);
          if (e.keyCode === keys.TAB && this.options.tabDisabled === false) {
            return;
          }
          break;
        case keys.UP:
          that.moveUp();
          break;
        case keys.DOWN:
          that.moveDown();
          break;
        default:
          return;
      }
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    onKeyUp: function (e) {
      var that = this;
      if (that.disabled) {
        return;
      }
      switch (e.keyCode) {
        case keys.UP:
        case keys.DOWN:
          return;
      }
      clearInterval(that.onChangeInterval);
      if (that.currentValue !== that.el.val()) {
        if (that.options.deferRequestBy > 0) {
          that.onChangeInterval = setInterval(function () {
            that.onValueChange();
          }, that.options.deferRequestBy);
        } else {
          that.onValueChange();
        }
      }
    },
    onValueChange: function () {
      var that = this,
        q;
      clearInterval(that.onChangeInterval);
      that.currentValue = that.element.value;
      q = that.getQuery(that.currentValue);
      that.selectedIndex = -1;
      if (that.ignoreValueChange) {
        that.ignoreValueChange = false;
        return;
      }
      if (q.length < that.options.minChars) {
        that.hide();
      } else {
        that.getSuggestions(q);
      }
    },
    getQuery: function (value) {
      var delimiter = this.options.delimiter,
        parts;
      if (!delimiter) {
        return $.trim(value);
      }
      parts = value.split(delimiter);
      return $.trim(parts[parts.length - 1]);
    },
    getSuggestionsLocal: function (query) {
      var that = this,
        queryLowerCase = query.toLowerCase(),
        filter = that.options.lookupFilter;
      return {
        suggestions: $.grep(that.options.lookup, function (suggestion) {
          return filter(suggestion, query, queryLowerCase);
        }),
      };
    },
    getSuggestions: function (q) {
      var response,
        that = this,
        options = that.options;
      response = that.isLocal
        ? that.getSuggestionsLocal(q)
        : that.cachedResponse[q];
      if (response && $.isArray(response.suggestions)) {
        that.suggestions = response.suggestions;
        that.suggest();
      } else if (!that.isBadQuery(q)) {
        options.onSearchStart.call(that.element, q);
        options.params[options.paramName] = q;
        $.ajax({
          url: options.serviceUrl,
          data: options.params,
          type: options.type,
          dataType: options.dataType,
        }).done(function (txt) {
          that.processResponse(txt);
          options.onSearchComplete.call(that.element, q);
        });
      }
    },
    isBadQuery: function (q) {
      var badQueries = this.badQueries,
        i = badQueries.length;
      while (i--) {
        if (q.indexOf(badQueries[i]) === 0) {
          return true;
        }
      }
      return false;
    },
    hide: function () {
      var that = this;
      that.visible = false;
      that.selectedIndex = -1;
      $(that.suggestionsContainer).hide();
    },
    suggest: function () {
      if (this.suggestions.length === 0) {
        this.hide();
        return;
      }
      var that = this,
        formatResult = that.options.formatResult,
        value = that.getQuery(that.currentValue),
        className = that.classes.suggestion,
        classSelected = that.classes.selected,
        container = $(that.suggestionsContainer),
        html = "";
      $.each(that.suggestions, function (i, suggestion) {
        html +=
          '<div class="' +
          className +
          '" data-index="' +
          i +
          '">' +
          formatResult(suggestion, value) +
          "</div>";
      });
      container.html(html).show();
      that.visible = true;
      if (that.options.autoSelectFirst) {
        that.selectedIndex = 0;
        container.children().first().addClass(classSelected);
      }
    },
    verifySuggestionsFormat: function (suggestions) {
      if (suggestions.length && typeof suggestions[0] === "string") {
        return $.map(suggestions, function (value) {
          return { value: value, data: null };
        });
      }
      return suggestions;
    },
    processResponse: function (text) {
      var that = this,
        response = typeof text == "string" ? $.parseJSON(text) : text;
      response.suggestions = that.verifySuggestionsFormat(
        that.options.transformResult(response)
      );
      if (!that.options.noCache) {
        that.cachedResponse[response[that.options.paramName]] = response;
        if (response.suggestions.length === 0) {
          that.badQueries.push(response[that.options.paramName]);
        }
      }
      if (
        true ||
        response[that.options.paramName] === that.getQuery(that.currentValue)
      ) {
        that.suggestions = response.suggestions;
        that.suggest();
      }
    },
    activate: function (index) {
      var that = this,
        activeItem,
        selected = that.classes.selected,
        container = $(that.suggestionsContainer),
        children = container.children();
      container.children("." + selected).removeClass(selected);
      that.selectedIndex = index;
      if (that.selectedIndex !== -1 && children.length > that.selectedIndex) {
        activeItem = children.get(that.selectedIndex);
        $(activeItem).addClass(selected);
        return activeItem;
      }
      return null;
    },
    select: function (i, shouldIgnoreNextValueChange) {
      var that = this,
        selectedValue = that.suggestions[i];
      if (selectedValue) {
        that.el.val(selectedValue);
        that.ignoreValueChange = shouldIgnoreNextValueChange;
        that.hide();
        that.onSelect(i);
      }
    },
    moveUp: function () {
      var that = this;
      if (that.selectedIndex === -1) {
        return;
      }
      if (that.selectedIndex === 0) {
        $(that.suggestionsContainer)
          .children()
          .first()
          .removeClass(that.classes.selected);
        that.selectedIndex = -1;
        that.el.val(that.currentValue);
        return;
      }
      that.adjustScroll(that.selectedIndex - 1);
    },
    moveDown: function () {
      var that = this;
      if (that.selectedIndex === that.suggestions.length - 1) {
        return;
      }
      that.adjustScroll(that.selectedIndex + 1);
    },
    adjustScroll: function (index) {
      var that = this,
        activeItem = that.activate(index),
        offsetTop,
        upperBound,
        lowerBound,
        heightDelta = 25;
      if (!activeItem) {
        return;
      }
      offsetTop = activeItem.offsetTop;
      upperBound = $(that.suggestionsContainer).scrollTop();
      lowerBound = upperBound + that.options.maxHeight - heightDelta;
      if (offsetTop < upperBound) {
        $(that.suggestionsContainer).scrollTop(offsetTop);
      } else if (offsetTop > lowerBound) {
        $(that.suggestionsContainer).scrollTop(
          offsetTop - that.options.maxHeight + heightDelta
        );
      }
      that.el.val(that.getValue(that.suggestions[index].value));
    },
    onSelect: function (index) {
      var that = this,
        onSelectCallback = that.options.onSelect,
        suggestion = that.suggestions[index];
      that.el.val(that.getValue(suggestion.value));
      if ($.isFunction(onSelectCallback)) {
        onSelectCallback.call(that.element, suggestion);
      }
    },
    getValue: function (value) {
      var that = this,
        delimiter = that.options.delimiter,
        currentValue,
        parts;
      if (!delimiter) {
        return value;
      }
      currentValue = that.currentValue;
      parts = currentValue.split(delimiter);
      if (parts.length === 1) {
        return value;
      }
      return (
        currentValue.substr(
          0,
          currentValue.length - parts[parts.length - 1].length
        ) + value
      );
    },
  };
  $.fn.autocomplete = function (options, args) {
    return this.each(function () {
      var dataKey = "autocomplete",
        inputElement = $(this),
        instance;
      if (typeof options === "string") {
        instance = inputElement.data(dataKey);
        if (typeof instance[options] === "function") {
          instance[options](args);
        }
      } else {
        instance = new Autocomplete(this, options);
        inputElement.data(dataKey, instance);
      }
    });
  };
});
!(function () {
  if (!Date.now)
    Date.now = function () {
      return +new Date();
    };
  try {
    document.createElement("div").style.setProperty("opacity", 0, "");
  } catch (error) {
    var d3_style_prototype = CSSStyleDeclaration.prototype,
      d3_style_setProperty = d3_style_prototype.setProperty;
    d3_style_prototype.setProperty = function (name, value, priority) {
      d3_style_setProperty.call(this, name, value + "", priority);
    };
  }
  d3 = { version: "2.9.6" };
  function d3_class(ctor, properties) {
    try {
      for (var key in properties) {
        Object.defineProperty(ctor.prototype, key, {
          value: properties[key],
          enumerable: false,
        });
      }
    } catch (e) {
      ctor.prototype = properties;
    }
  }
  var d3_array = d3_arraySlice;
  function d3_arrayCopy(pseudoarray) {
    var i = -1,
      n = pseudoarray.length,
      array = [];
    while (++i < n) array.push(pseudoarray[i]);
    return array;
  }
  function d3_arraySlice(pseudoarray) {
    return Array.prototype.slice.call(pseudoarray);
  }
  try {
    d3_array(document.documentElement.childNodes)[0].nodeType;
  } catch (e) {
    d3_array = d3_arrayCopy;
  }
  var d3_arraySubclass = [].__proto__
    ? function (array, prototype) {
        array.__proto__ = prototype;
      }
    : function (array, prototype) {
        for (var property in prototype) array[property] = prototype[property];
      };
  d3.map = function (object) {
    var map = new d3_Map();
    for (var key in object) map.set(key, object[key]);
    return map;
  };
  function d3_Map() {}
  d3_class(d3_Map, {
    has: function (key) {
      return d3_map_prefix + key in this;
    },
    get: function (key) {
      return this[d3_map_prefix + key];
    },
    set: function (key, value) {
      return (this[d3_map_prefix + key] = value);
    },
    remove: function (key) {
      key = d3_map_prefix + key;
      return key in this && delete this[key];
    },
    keys: function () {
      var keys = [];
      this.forEach(function (key) {
        keys.push(key);
      });
      return keys;
    },
    values: function () {
      var values = [];
      this.forEach(function (key, value) {
        values.push(value);
      });
      return values;
    },
    entries: function () {
      var entries = [];
      this.forEach(function (key, value) {
        entries.push({ key: key, value: value });
      });
      return entries;
    },
    forEach: function (f) {
      for (var key in this) {
        if (key.charCodeAt(0) === d3_map_prefixCode) {
          f.call(this, key.substring(1), this[key]);
        }
      }
    },
  });
  var d3_map_prefix = "\0",
    d3_map_prefixCode = d3_map_prefix.charCodeAt(0);
  function d3_identity(d) {
    return d;
  }
  function d3_this() {
    return this;
  }
  function d3_true() {
    return true;
  }
  function d3_functor(v) {
    return typeof v === "function"
      ? v
      : function () {
          return v;
        };
  }
  d3.functor = d3_functor;
  d3.rebind = function (target, source) {
    var i = 1,
      n = arguments.length,
      method;
    while (++i < n)
      target[(method = arguments[i])] = d3_rebind(
        target,
        source,
        source[method]
      );
    return target;
  };
  function d3_rebind(target, source, method) {
    return function () {
      var value = method.apply(source, arguments);
      return arguments.length ? target : value;
    };
  }
  d3.ascending = function (a, b) {
    return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
  };
  d3.descending = function (a, b) {
    return b < a ? -1 : b > a ? 1 : b >= a ? 0 : NaN;
  };
  d3.mean = function (array, f) {
    var n = array.length,
      a,
      m = 0,
      i = -1,
      j = 0;
    if (arguments.length === 1) {
      while (++i < n) if (d3_number((a = array[i]))) m += (a - m) / ++j;
    } else {
      while (++i < n)
        if (d3_number((a = f.call(array, array[i], i)))) m += (a - m) / ++j;
    }
    return j ? m : undefined;
  };
  d3.median = function (array, f) {
    if (arguments.length > 1) array = array.map(f);
    array = array.filter(d3_number);
    return array.length
      ? d3.quantile(array.sort(d3.ascending), 0.5)
      : undefined;
  };
  d3.min = function (array, f) {
    var i = -1,
      n = array.length,
      a,
      b;
    if (arguments.length === 1) {
      while (++i < n && ((a = array[i]) == null || a != a)) a = undefined;
      while (++i < n) if ((b = array[i]) != null && a > b) a = b;
    } else {
      while (++i < n && ((a = f.call(array, array[i], i)) == null || a != a))
        a = undefined;
      while (++i < n)
        if ((b = f.call(array, array[i], i)) != null && a > b) a = b;
    }
    return a;
  };
  d3.max = function (array, f) {
    var i = -1,
      n = array.length,
      a,
      b;
    if (arguments.length === 1) {
      while (++i < n && ((a = array[i]) == null || a != a)) a = undefined;
      while (++i < n) if ((b = array[i]) != null && b > a) a = b;
    } else {
      while (++i < n && ((a = f.call(array, array[i], i)) == null || a != a))
        a = undefined;
      while (++i < n)
        if ((b = f.call(array, array[i], i)) != null && b > a) a = b;
    }
    return a;
  };
  d3.extent = function (array, f) {
    var i = -1,
      n = array.length,
      a,
      b,
      c;
    if (arguments.length === 1) {
      while (++i < n && ((a = c = array[i]) == null || a != a))
        a = c = undefined;
      while (++i < n)
        if ((b = array[i]) != null) {
          if (a > b) a = b;
          if (c < b) c = b;
        }
    } else {
      while (
        ++i < n &&
        ((a = c = f.call(array, array[i], i)) == null || a != a)
      )
        a = undefined;
      while (++i < n)
        if ((b = f.call(array, array[i], i)) != null) {
          if (a > b) a = b;
          if (c < b) c = b;
        }
    }
    return [a, c];
  };
  d3.random = {
    normal: function (mean, deviation) {
      if (arguments.length < 2) deviation = 1;
      if (arguments.length < 1) mean = 0;
      return function () {
        var x, y, r;
        do {
          x = Math.random() * 2 - 1;
          y = Math.random() * 2 - 1;
          r = x * x + y * y;
        } while (!r || r > 1);
        return mean + deviation * x * Math.sqrt((-2 * Math.log(r)) / r);
      };
    },
  };
  function d3_number(x) {
    return x != null && !isNaN(x);
  }
  d3.sum = function (array, f) {
    var s = 0,
      n = array.length,
      a,
      i = -1;
    if (arguments.length === 1) {
      while (++i < n) if (!isNaN((a = +array[i]))) s += a;
    } else {
      while (++i < n) if (!isNaN((a = +f.call(array, array[i], i)))) s += a;
    }
    return s;
  };
  d3.quantile = function (values, p) {
    var H = (values.length - 1) * p + 1,
      h = Math.floor(H),
      v = values[h - 1],
      e = H - h;
    return e ? v + e * (values[h] - v) : v;
  };
  d3.transpose = function (matrix) {
    return d3.zip.apply(d3, matrix);
  };
  d3.zip = function () {
    if (!(n = arguments.length)) return [];
    for (
      var i = -1, m = d3.min(arguments, d3_zipLength), zips = new Array(m);
      ++i < m;

    ) {
      for (var j = -1, n, zip = (zips[i] = new Array(n)); ++j < n; ) {
        zip[j] = arguments[j][i];
      }
    }
    return zips;
  };
  function d3_zipLength(d) {
    return d.length;
  }
  d3.bisector = function (f) {
    return {
      left: function (a, x, lo, hi) {
        if (arguments.length < 3) lo = 0;
        if (arguments.length < 4) hi = a.length;
        while (lo < hi) {
          var mid = (lo + hi) >> 1;
          if (f.call(a, a[mid], mid) < x) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      },
      right: function (a, x, lo, hi) {
        if (arguments.length < 3) lo = 0;
        if (arguments.length < 4) hi = a.length;
        while (lo < hi) {
          var mid = (lo + hi) >> 1;
          if (x < f.call(a, a[mid], mid)) hi = mid;
          else lo = mid + 1;
        }
        return lo;
      },
    };
  };
  var d3_bisector = d3.bisector(function (d) {
    return d;
  });
  d3.bisectLeft = d3_bisector.left;
  d3.bisect = d3.bisectRight = d3_bisector.right;
  d3.first = function (array, f) {
    var i = 0,
      n = array.length,
      a = array[0],
      b;
    if (arguments.length === 1) f = d3.ascending;
    while (++i < n) {
      if (f.call(array, a, (b = array[i])) > 0) {
        a = b;
      }
    }
    return a;
  };
  d3.last = function (array, f) {
    var i = 0,
      n = array.length,
      a = array[0],
      b;
    if (arguments.length === 1) f = d3.ascending;
    while (++i < n) {
      if (f.call(array, a, (b = array[i])) <= 0) {
        a = b;
      }
    }
    return a;
  };
  d3.nest = function () {
    var nest = {},
      keys = [],
      sortKeys = [],
      sortValues,
      rollup;
    function map(array, depth) {
      if (depth >= keys.length)
        return rollup
          ? rollup.call(nest, array)
          : sortValues
          ? array.sort(sortValues)
          : array;
      var i = -1,
        n = array.length,
        key = keys[depth++],
        keyValue,
        object,
        valuesByKey = new d3_Map(),
        values,
        o = {};
      while (++i < n) {
        if ((values = valuesByKey.get((keyValue = key((object = array[i])))))) {
          values.push(object);
        } else {
          valuesByKey.set(keyValue, [object]);
        }
      }
      valuesByKey.forEach(function (keyValue) {
        o[keyValue] = map(valuesByKey.get(keyValue), depth);
      });
      return o;
    }
    function entries(map, depth) {
      if (depth >= keys.length) return map;
      var a = [],
        sortKey = sortKeys[depth++],
        key;
      for (key in map) {
        a.push({ key: key, values: entries(map[key], depth) });
      }
      if (sortKey)
        a.sort(function (a, b) {
          return sortKey(a.key, b.key);
        });
      return a;
    }
    nest.map = function (array) {
      return map(array, 0);
    };
    nest.entries = function (array) {
      return entries(map(array, 0), 0);
    };
    nest.key = function (d) {
      keys.push(d);
      return nest;
    };
    nest.sortKeys = function (order) {
      sortKeys[keys.length - 1] = order;
      return nest;
    };
    nest.sortValues = function (order) {
      sortValues = order;
      return nest;
    };
    nest.rollup = function (f) {
      rollup = f;
      return nest;
    };
    return nest;
  };
  d3.keys = function (map) {
    var keys = [];
    for (var key in map) keys.push(key);
    return keys;
  };
  d3.values = function (map) {
    var values = [];
    for (var key in map) values.push(map[key]);
    return values;
  };
  d3.entries = function (map) {
    var entries = [];
    for (var key in map) entries.push({ key: key, value: map[key] });
    return entries;
  };
  d3.permute = function (array, indexes) {
    var permutes = [],
      i = -1,
      n = indexes.length;
    while (++i < n) permutes[i] = array[indexes[i]];
    return permutes;
  };
  d3.merge = function (arrays) {
    return Array.prototype.concat.apply([], arrays);
  };
  d3.split = function (array, f) {
    var arrays = [],
      values = [],
      value,
      i = -1,
      n = array.length;
    if (arguments.length < 2) f = d3_splitter;
    while (++i < n) {
      if (f.call(values, (value = array[i]), i)) {
        values = [];
      } else {
        if (!values.length) arrays.push(values);
        values.push(value);
      }
    }
    return arrays;
  };
  function d3_splitter(d) {
    return d == null;
  }
  function d3_collapse(s) {
    return s.replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
  }
  d3.range = function (start, stop, step) {
    if (arguments.length < 3) {
      step = 1;
      if (arguments.length < 2) {
        stop = start;
        start = 0;
      }
    }
    if ((stop - start) / step === Infinity) throw new Error("infinite range");
    var range = [],
      k = d3_range_integerScale(Math.abs(step)),
      i = -1,
      j;
    (start *= k), (stop *= k), (step *= k);
    if (step < 0) while ((j = start + step * ++i) > stop) range.push(j / k);
    else while ((j = start + step * ++i) < stop) range.push(j / k);
    return range;
  };
  function d3_range_integerScale(x) {
    var k = 1;
    while ((x * k) % 1) k *= 10;
    return k;
  }
  d3.requote = function (s) {
    return s.replace(d3_requote_re, "\\$&");
  };
  var d3_requote_re = /[\\\^\$\*\+\?\|\[\]\(\)\.\{\}]/g;
  d3.round = function (x, n) {
    return n ? Math.round(x * (n = Math.pow(10, n))) / n : Math.round(x);
  };
  d3.xhr = function (url, mime, callback) {
    var req = new XMLHttpRequest();
    if (arguments.length < 3) (callback = mime), (mime = null);
    else if (mime && req.overrideMimeType) req.overrideMimeType(mime);
    req.open("GET", url, true);
    if (mime) req.setRequestHeader("Accept", mime);
    req.onreadystatechange = function () {
      if (req.readyState === 4) {
        var s = req.status;
        callback(
          (!s && req.response) || (s >= 200 && s < 300) || s === 304
            ? req
            : null
        );
      }
    };
    req.send(null);
  };
  d3.text = function (url, mime, callback) {
    function ready(req) {
      callback(req && req.responseText);
    }
    if (arguments.length < 3) {
      callback = mime;
      mime = null;
    }
    d3.xhr(url, mime, ready);
  };
  d3.json = function (url, callback) {
    d3.text(url, "application/json", function (text) {
      callback(text ? JSON.parse(text) : null);
    });
  };
  d3.html = function (url, callback) {
    d3.text(url, "text/html", function (text) {
      if (text != null) {
        var range = document.createRange();
        range.selectNode(document.body);
        text = range.createContextualFragment(text);
      }
      callback(text);
    });
  };
  d3.xml = function (url, mime, callback) {
    function ready(req) {
      callback(req && req.responseXML);
    }
    if (arguments.length < 3) {
      callback = mime;
      mime = null;
    }
    d3.xhr(url, mime, ready);
  };
  var d3_nsPrefix = {
    svg: "http://www.w3.org/2000/svg",
    xhtml: "http://www.w3.org/1999/xhtml",
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/XML/1998/namespace",
    xmlns: "http://www.w3.org/2000/xmlns/",
  };
  d3.ns = {
    prefix: d3_nsPrefix,
    qualify: function (name) {
      var i = name.indexOf(":"),
        prefix = name;
      if (i >= 0) {
        prefix = name.substring(0, i);
        name = name.substring(i + 1);
      }
      return d3_nsPrefix.hasOwnProperty(prefix)
        ? { space: d3_nsPrefix[prefix], local: name }
        : name;
    },
  };
  d3.dispatch = function () {
    var dispatch = new d3_dispatch(),
      i = -1,
      n = arguments.length;
    while (++i < n) dispatch[arguments[i]] = d3_dispatch_event(dispatch);
    return dispatch;
  };
  function d3_dispatch() {}
  d3_dispatch.prototype.on = function (type, listener) {
    var i = type.indexOf("."),
      name = "";
    if (i > 0) {
      name = type.substring(i + 1);
      type = type.substring(0, i);
    }
    return arguments.length < 2
      ? this[type].on(name)
      : this[type].on(name, listener);
  };
  function d3_dispatch_event(dispatch) {
    var listeners = [],
      listenerByName = new d3_Map();
    function event() {
      var z = listeners,
        i = -1,
        n = z.length,
        l;
      while (++i < n) if ((l = z[i].on)) l.apply(this, arguments);
      return dispatch;
    }
    event.on = function (name, listener) {
      var l = listenerByName.get(name),
        i;
      if (arguments.length < 2) return l && l.on;
      if (l) {
        l.on = null;
        listeners = listeners
          .slice(0, (i = listeners.indexOf(l)))
          .concat(listeners.slice(i + 1));
        listenerByName.remove(name);
      }
      if (listener) listeners.push(listenerByName.set(name, { on: listener }));
      return dispatch;
    };
    return event;
  }
  d3.format = function (specifier) {
    var match = d3_format_re.exec(specifier),
      fill = match[1] || " ",
      sign = match[3] || "",
      zfill = match[5],
      width = +match[6],
      comma = match[7],
      precision = match[8],
      type = match[9],
      scale = 1,
      suffix = "",
      integer = false;
    if (precision) precision = +precision.substring(1);
    if (zfill) {
      fill = "0";
      if (comma) width -= Math.floor((width - 1) / 4);
    }
    switch (type) {
      case "n":
        comma = true;
        type = "g";
        break;
      case "%":
        scale = 100;
        suffix = "%";
        type = "f";
        break;
      case "p":
        scale = 100;
        suffix = "%";
        type = "r";
        break;
      case "d":
        integer = true;
        precision = 0;
        break;
      case "s":
        scale = -1;
        type = "r";
        break;
    }
    if (type == "r" && !precision) type = "g";
    type = d3_format_types.get(type) || d3_format_typeDefault;
    return function (value) {
      if (integer && value % 1) return "";
      var negative = value < 0 && (value = -value) ? "\u2212" : sign;
      if (scale < 0) {
        var prefix = d3.formatPrefix(value, precision);
        value = prefix.scale(value);
        suffix = prefix.symbol;
      } else {
        value *= scale;
      }
      value = type(value, precision);
      if (zfill) {
        var length = value.length + negative.length;
        if (length < width)
          value = new Array(width - length + 1).join(fill) + value;
        if (comma) value = d3_format_group(value);
        value = negative + value;
      } else {
        if (comma) value = d3_format_group(value);
        value = negative + value;
        var length = value.length;
        if (length < width)
          value = new Array(width - length + 1).join(fill) + value;
      }
      return value + suffix;
    };
  };
  var d3_format_re =
    /(?:([^{])?([<>=^]))?([+\- ])?(#)?(0)?([0-9]+)?(,)?(\.[0-9]+)?([a-zA-Z%])?/;
  var d3_format_types = d3.map({
    g: function (x, p) {
      return x.toPrecision(p);
    },
    e: function (x, p) {
      return x.toExponential(p);
    },
    f: function (x, p) {
      return x.toFixed(p);
    },
    r: function (x, p) {
      return d3
        .round(x, (p = d3_format_precision(x, p)))
        .toFixed(Math.max(0, Math.min(20, p)));
    },
  });
  function d3_format_precision(x, p) {
    return (
      p -
      (x
        ? 1 +
          Math.floor(
            Math.log(
              x + Math.pow(10, 1 + Math.floor(Math.log(x) / Math.LN10) - p)
            ) / Math.LN10
          )
        : 1)
    );
  }
  function d3_format_typeDefault(x) {
    return x + "";
  }
  function d3_format_group(value) {
    var i = value.lastIndexOf("."),
      f = i >= 0 ? value.substring(i) : ((i = value.length), ""),
      t = [];
    while (i > 0) t.push(value.substring((i -= 3), i + 3));
    return t.reverse().join(",") + f;
  }
  var d3_formatPrefixes = [
    "y",
    "z",
    "a",
    "f",
    "p",
    "n",
    "μ",
    "m",
    "",
    "k",
    "M",
    "G",
    "T",
    "P",
    "E",
    "Z",
    "Y",
  ].map(d3_formatPrefix);
  d3.formatPrefix = function (value, precision) {
    var i = 0;
    if (value) {
      if (value < 0) value *= -1;
      if (precision)
        value = d3.round(value, d3_format_precision(value, precision));
      i = 1 + Math.floor(1e-12 + Math.log(value) / Math.LN10);
      i = Math.max(
        -24,
        Math.min(24, Math.floor((i <= 0 ? i + 1 : i - 1) / 3) * 3)
      );
    }
    return d3_formatPrefixes[8 + i / 3];
  };
  function d3_formatPrefix(d, i) {
    var k = Math.pow(10, Math.abs(8 - i) * 3);
    return {
      scale:
        i > 8
          ? function (d) {
              return d / k;
            }
          : function (d) {
              return d * k;
            },
      symbol: d,
    };
  }
  var d3_ease_quad = d3_ease_poly(2),
    d3_ease_cubic = d3_ease_poly(3),
    d3_ease_default = function () {
      return d3_ease_identity;
    };
  var d3_ease = d3.map({
    linear: d3_ease_default,
    poly: d3_ease_poly,
    quad: function () {
      return d3_ease_quad;
    },
    cubic: function () {
      return d3_ease_cubic;
    },
    sin: function () {
      return d3_ease_sin;
    },
    exp: function () {
      return d3_ease_exp;
    },
    circle: function () {
      return d3_ease_circle;
    },
    elastic: d3_ease_elastic,
    back: d3_ease_back,
    bounce: function () {
      return d3_ease_bounce;
    },
  });
  var d3_ease_mode = d3.map({
    in: d3_ease_identity,
    out: d3_ease_reverse,
    "in-out": d3_ease_reflect,
    "out-in": function (f) {
      return d3_ease_reflect(d3_ease_reverse(f));
    },
  });
  d3.ease = function (name) {
    var i = name.indexOf("-"),
      t = i >= 0 ? name.substring(0, i) : name,
      m = i >= 0 ? name.substring(i + 1) : "in";
    t = d3_ease.get(t) || d3_ease_default;
    m = d3_ease_mode.get(m) || d3_ease_identity;
    return d3_ease_clamp(
      m(t.apply(null, Array.prototype.slice.call(arguments, 1)))
    );
  };
  function d3_ease_clamp(f) {
    return function (t) {
      return t <= 0 ? 0 : t >= 1 ? 1 : f(t);
    };
  }
  function d3_ease_reverse(f) {
    return function (t) {
      return 1 - f(1 - t);
    };
  }
  function d3_ease_reflect(f) {
    return function (t) {
      return 0.5 * (t < 0.5 ? f(2 * t) : 2 - f(2 - 2 * t));
    };
  }
  function d3_ease_identity(t) {
    return t;
  }
  function d3_ease_poly(e) {
    return function (t) {
      return Math.pow(t, e);
    };
  }
  function d3_ease_sin(t) {
    return 1 - Math.cos((t * Math.PI) / 2);
  }
  function d3_ease_exp(t) {
    return Math.pow(2, 10 * (t - 1));
  }
  function d3_ease_circle(t) {
    return 1 - Math.sqrt(1 - t * t);
  }
  function d3_ease_elastic(a, p) {
    var s;
    if (arguments.length < 2) p = 0.45;
    if (arguments.length < 1) {
      a = 1;
      s = p / 4;
    } else s = (p / (2 * Math.PI)) * Math.asin(1 / a);
    return function (t) {
      return (
        1 + a * Math.pow(2, 10 * -t) * Math.sin(((t - s) * 2 * Math.PI) / p)
      );
    };
  }
  function d3_ease_back(s) {
    if (!s) s = 1.70158;
    return function (t) {
      return t * t * ((s + 1) * t - s);
    };
  }
  function d3_ease_bounce(t) {
    return t < 1 / 2.75
      ? 7.5625 * t * t
      : t < 2 / 2.75
      ? 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
      : t < 2.5 / 2.75
      ? 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
      : 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  }
  d3.event = null;
  function d3_eventCancel() {
    d3.event.stopPropagation();
    d3.event.preventDefault();
  }
  function d3_eventSource() {
    var e = d3.event,
      s;
    while ((s = e.sourceEvent)) e = s;
    return e;
  }
  function d3_eventDispatch(target) {
    var dispatch = new d3_dispatch(),
      i = 0,
      n = arguments.length;
    while (++i < n) dispatch[arguments[i]] = d3_dispatch_event(dispatch);
    dispatch.of = function (thiz, argumentz) {
      return function (e1) {
        try {
          var e0 = (e1.sourceEvent = d3.event);
          e1.target = target;
          d3.event = e1;
          dispatch[e1.type].apply(thiz, argumentz);
        } finally {
          d3.event = e0;
        }
      };
    };
    return dispatch;
  }
  d3.interpolate = function (a, b) {
    var i = d3.interpolators.length,
      f;
    while (--i >= 0 && !(f = d3.interpolators[i](a, b)));
    return f;
  };
  d3.interpolateNumber = function (a, b) {
    b -= a;
    return function (t) {
      return a + b * t;
    };
  };
  d3.interpolateRound = function (a, b) {
    b -= a;
    return function (t) {
      return Math.round(a + b * t);
    };
  };
  d3.interpolateString = function (a, b) {
    var m,
      i,
      j,
      s0 = 0,
      s1 = 0,
      s = [],
      q = [],
      n,
      o;
    d3_interpolate_number.lastIndex = 0;
    for (i = 0; (m = d3_interpolate_number.exec(b)); ++i) {
      if (m.index) s.push(b.substring(s0, (s1 = m.index)));
      q.push({ i: s.length, x: m[0] });
      s.push(null);
      s0 = d3_interpolate_number.lastIndex;
    }
    if (s0 < b.length) s.push(b.substring(s0));
    for (
      i = 0, n = q.length;
      (m = d3_interpolate_number.exec(a)) && i < n;
      ++i
    ) {
      o = q[i];
      if (o.x == m[0]) {
        if (o.i) {
          if (s[o.i + 1] == null) {
            s[o.i - 1] += o.x;
            s.splice(o.i, 1);
            for (j = i + 1; j < n; ++j) q[j].i--;
          } else {
            s[o.i - 1] += o.x + s[o.i + 1];
            s.splice(o.i, 2);
            for (j = i + 1; j < n; ++j) q[j].i -= 2;
          }
        } else {
          if (s[o.i + 1] == null) {
            s[o.i] = o.x;
          } else {
            s[o.i] = o.x + s[o.i + 1];
            s.splice(o.i + 1, 1);
            for (j = i + 1; j < n; ++j) q[j].i--;
          }
        }
        q.splice(i, 1);
        n--;
        i--;
      } else {
        o.x = d3.interpolateNumber(parseFloat(m[0]), parseFloat(o.x));
      }
    }
    while (i < n) {
      o = q.pop();
      if (s[o.i + 1] == null) {
        s[o.i] = o.x;
      } else {
        s[o.i] = o.x + s[o.i + 1];
        s.splice(o.i + 1, 1);
      }
      n--;
    }
    if (s.length === 1) {
      return s[0] == null
        ? q[0].x
        : function () {
            return b;
          };
    }
    return function (t) {
      for (i = 0; i < n; ++i) s[(o = q[i]).i] = o.x(t);
      return s.join("");
    };
  };
  d3.interpolateTransform = function (a, b) {
    var s = [],
      q = [],
      n,
      A = d3.transform(a),
      B = d3.transform(b),
      ta = A.translate,
      tb = B.translate,
      ra = A.rotate,
      rb = B.rotate,
      wa = A.skew,
      wb = B.skew,
      ka = A.scale,
      kb = B.scale;
    if (ta[0] != tb[0] || ta[1] != tb[1]) {
      s.push("translate(", null, ",", null, ")");
      q.push(
        { i: 1, x: d3.interpolateNumber(ta[0], tb[0]) },
        { i: 3, x: d3.interpolateNumber(ta[1], tb[1]) }
      );
    } else if (tb[0] || tb[1]) {
      s.push("translate(" + tb + ")");
    } else {
      s.push("");
    }
    if (ra != rb) {
      if (ra - rb > 180) rb += 360;
      else if (rb - ra > 180) ra += 360;
      q.push({
        i: s.push(s.pop() + "rotate(", null, ")") - 2,
        x: d3.interpolateNumber(ra, rb),
      });
    } else if (rb) {
      s.push(s.pop() + "rotate(" + rb + ")");
    }
    if (wa != wb) {
      q.push({
        i: s.push(s.pop() + "skewX(", null, ")") - 2,
        x: d3.interpolateNumber(wa, wb),
      });
    } else if (wb) {
      s.push(s.pop() + "skewX(" + wb + ")");
    }
    if (ka[0] != kb[0] || ka[1] != kb[1]) {
      n = s.push(s.pop() + "scale(", null, ",", null, ")");
      q.push(
        { i: n - 4, x: d3.interpolateNumber(ka[0], kb[0]) },
        { i: n - 2, x: d3.interpolateNumber(ka[1], kb[1]) }
      );
    } else if (kb[0] != 1 || kb[1] != 1) {
      s.push(s.pop() + "scale(" + kb + ")");
    }
    n = q.length;
    return function (t) {
      var i = -1,
        o;
      while (++i < n) s[(o = q[i]).i] = o.x(t);
      return s.join("");
    };
  };
  d3.interpolateRgb = function (a, b) {
    a = d3.rgb(a);
    b = d3.rgb(b);
    var ar = a.r,
      ag = a.g,
      ab = a.b,
      br = b.r - ar,
      bg = b.g - ag,
      bb = b.b - ab;
    return function (t) {
      return (
        "#" +
        d3_rgb_hex(Math.round(ar + br * t)) +
        d3_rgb_hex(Math.round(ag + bg * t)) +
        d3_rgb_hex(Math.round(ab + bb * t))
      );
    };
  };
  d3.interpolateHsl = function (a, b) {
    a = d3.hsl(a);
    b = d3.hsl(b);
    var h0 = a.h,
      s0 = a.s,
      l0 = a.l,
      h1 = b.h - h0,
      s1 = b.s - s0,
      l1 = b.l - l0;
    if (h1 > 180) h1 -= 360;
    else if (h1 < -180) h1 += 360;
    return function (t) {
      return d3_hsl_rgb(h0 + h1 * t, s0 + s1 * t, l0 + l1 * t).toString();
    };
  };
  d3.interpolateArray = function (a, b) {
    var x = [],
      c = [],
      na = a.length,
      nb = b.length,
      n0 = Math.min(a.length, b.length),
      i;
    for (i = 0; i < n0; ++i) x.push(d3.interpolate(a[i], b[i]));
    for (; i < na; ++i) c[i] = a[i];
    for (; i < nb; ++i) c[i] = b[i];
    return function (t) {
      for (i = 0; i < n0; ++i) c[i] = x[i](t);
      return c;
    };
  };
  d3.interpolateObject = function (a, b) {
    var i = {},
      c = {},
      k;
    for (k in a) {
      if (k in b) {
        i[k] = d3_interpolateByName(k)(a[k], b[k]);
      } else {
        c[k] = a[k];
      }
    }
    for (k in b) {
      if (!(k in a)) {
        c[k] = b[k];
      }
    }
    return function (t) {
      for (k in i) c[k] = i[k](t);
      return c;
    };
  };
  var d3_interpolate_number = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g;
  function d3_interpolateByName(n) {
    return n == "transform" ? d3.interpolateTransform : d3.interpolate;
  }
  d3.interpolators = [
    d3.interpolateObject,
    function (a, b) {
      return b instanceof Array && d3.interpolateArray(a, b);
    },
    function (a, b) {
      return (
        (typeof a === "string" || typeof b === "string") &&
        d3.interpolateString(a + "", b + "")
      );
    },
    function (a, b) {
      return (
        (typeof b === "string"
          ? d3_rgb_names.has(b) || /^(#|rgb\(|hsl\()/.test(b)
          : b instanceof d3_Rgb || b instanceof d3_Hsl) &&
        d3.interpolateRgb(a, b)
      );
    },
    function (a, b) {
      return !isNaN((a = +a)) && !isNaN((b = +b)) && d3.interpolateNumber(a, b);
    },
  ];
  function d3_uninterpolateNumber(a, b) {
    b = b - (a = +a) ? 1 / (b - a) : 0;
    return function (x) {
      return (x - a) * b;
    };
  }
  function d3_uninterpolateClamp(a, b) {
    b = b - (a = +a) ? 1 / (b - a) : 0;
    return function (x) {
      return Math.max(0, Math.min(1, (x - a) * b));
    };
  }
  d3.rgb = function (r, g, b) {
    return arguments.length === 1
      ? r instanceof d3_Rgb
        ? d3_rgb(r.r, r.g, r.b)
        : d3_rgb_parse("" + r, d3_rgb, d3_hsl_rgb)
      : d3_rgb(~~r, ~~g, ~~b);
  };
  function d3_rgb(r, g, b) {
    return new d3_Rgb(r, g, b);
  }
  function d3_Rgb(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
  d3_Rgb.prototype.brighter = function (k) {
    k = Math.pow(0.7, arguments.length ? k : 1);
    var r = this.r,
      g = this.g,
      b = this.b,
      i = 30;
    if (!r && !g && !b) return d3_rgb(i, i, i);
    if (r && r < i) r = i;
    if (g && g < i) g = i;
    if (b && b < i) b = i;
    return d3_rgb(
      Math.min(255, Math.floor(r / k)),
      Math.min(255, Math.floor(g / k)),
      Math.min(255, Math.floor(b / k))
    );
  };
  d3_Rgb.prototype.darker = function (k) {
    k = Math.pow(0.7, arguments.length ? k : 1);
    return d3_rgb(
      Math.floor(k * this.r),
      Math.floor(k * this.g),
      Math.floor(k * this.b)
    );
  };
  d3_Rgb.prototype.hsl = function () {
    return d3_rgb_hsl(this.r, this.g, this.b);
  };
  d3_Rgb.prototype.toString = function () {
    return "#" + d3_rgb_hex(this.r) + d3_rgb_hex(this.g) + d3_rgb_hex(this.b);
  };
  function d3_rgb_hex(v) {
    return v < 0x10
      ? "0" + Math.max(0, v).toString(16)
      : Math.min(255, v).toString(16);
  }
  function d3_rgb_parse(format, rgb, hsl) {
    var r = 0,
      g = 0,
      b = 0,
      m1,
      m2,
      name;
    m1 = /([a-z]+)\((.*)\)/i.exec(format);
    if (m1) {
      m2 = m1[2].split(",");
      switch (m1[1]) {
        case "hsl": {
          return hsl(
            parseFloat(m2[0]),
            parseFloat(m2[1]) / 100,
            parseFloat(m2[2]) / 100
          );
        }
        case "rgb": {
          return rgb(
            d3_rgb_parseNumber(m2[0]),
            d3_rgb_parseNumber(m2[1]),
            d3_rgb_parseNumber(m2[2])
          );
        }
      }
    }
    if ((name = d3_rgb_names.get(format))) return rgb(name.r, name.g, name.b);
    if (format != null && format.charAt(0) === "#") {
      if (format.length === 4) {
        r = format.charAt(1);
        r += r;
        g = format.charAt(2);
        g += g;
        b = format.charAt(3);
        b += b;
      } else if (format.length === 7) {
        r = format.substring(1, 3);
        g = format.substring(3, 5);
        b = format.substring(5, 7);
      }
      r = parseInt(r, 16);
      g = parseInt(g, 16);
      b = parseInt(b, 16);
    }
    return rgb(r, g, b);
  }
  function d3_rgb_hsl(r, g, b) {
    var min = Math.min((r /= 255), (g /= 255), (b /= 255)),
      max = Math.max(r, g, b),
      d = max - min,
      h,
      s,
      l = (max + min) / 2;
    if (d) {
      s = l < 0.5 ? d / (max + min) : d / (2 - max - min);
      if (r == max) h = (g - b) / d + (g < b ? 6 : 0);
      else if (g == max) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    } else {
      s = h = 0;
    }
    return d3_hsl(h, s, l);
  }
  function d3_rgb_parseNumber(c) {
    var f = parseFloat(c);
    return c.charAt(c.length - 1) === "%" ? Math.round(f * 2.55) : f;
  }
  var d3_rgb_names = d3.map({
    aliceblue: "#f0f8ff",
    antiquewhite: "#faebd7",
    aqua: "#00ffff",
    aquamarine: "#7fffd4",
    azure: "#f0ffff",
    beige: "#f5f5dc",
    bisque: "#ffe4c4",
    black: "#000000",
    blanchedalmond: "#ffebcd",
    blue: "#0000ff",
    blueviolet: "#8a2be2",
    brown: "#a52a2a",
    burlywood: "#deb887",
    cadetblue: "#5f9ea0",
    chartreuse: "#7fff00",
    chocolate: "#d2691e",
    coral: "#ff7f50",
    cornflowerblue: "#6495ed",
    cornsilk: "#fff8dc",
    crimson: "#dc143c",
    cyan: "#00ffff",
    darkblue: "#00008b",
    darkcyan: "#008b8b",
    darkgoldenrod: "#b8860b",
    darkgray: "#a9a9a9",
    darkgreen: "#006400",
    darkgrey: "#a9a9a9",
    darkkhaki: "#bdb76b",
    darkmagenta: "#8b008b",
    darkolivegreen: "#556b2f",
    darkorange: "#ff8c00",
    darkorchid: "#9932cc",
    darkred: "#8b0000",
    darksalmon: "#e9967a",
    darkseagreen: "#8fbc8f",
    darkslateblue: "#483d8b",
    darkslategray: "#2f4f4f",
    darkslategrey: "#2f4f4f",
    darkturquoise: "#00ced1",
    darkviolet: "#9400d3",
    deeppink: "#ff1493",
    deepskyblue: "#00bfff",
    dimgray: "#696969",
    dimgrey: "#696969",
    dodgerblue: "#1e90ff",
    firebrick: "#b22222",
    floralwhite: "#fffaf0",
    forestgreen: "#228b22",
    fuchsia: "#ff00ff",
    gainsboro: "#dcdcdc",
    ghostwhite: "#f8f8ff",
    gold: "#ffd700",
    goldenrod: "#daa520",
    gray: "#808080",
    green: "#008000",
    greenyellow: "#adff2f",
    grey: "#808080",
    honeydew: "#f0fff0",
    hotpink: "#ff69b4",
    indianred: "#cd5c5c",
    indigo: "#4b0082",
    ivory: "#fffff0",
    khaki: "#f0e68c",
    lavender: "#e6e6fa",
    lavenderblush: "#fff0f5",
    lawngreen: "#7cfc00",
    lemonchiffon: "#fffacd",
    lightblue: "#add8e6",
    lightcoral: "#f08080",
    lightcyan: "#e0ffff",
    lightgoldenrodyellow: "#fafad2",
    lightgray: "#d3d3d3",
    lightgreen: "#90ee90",
    lightgrey: "#d3d3d3",
    lightpink: "#ffb6c1",
    lightsalmon: "#ffa07a",
    lightseagreen: "#20b2aa",
    lightskyblue: "#87cefa",
    lightslategray: "#778899",
    lightslategrey: "#778899",
    lightsteelblue: "#b0c4de",
    lightyellow: "#ffffe0",
    lime: "#00ff00",
    limegreen: "#32cd32",
    linen: "#faf0e6",
    magenta: "#ff00ff",
    maroon: "#800000",
    mediumaquamarine: "#66cdaa",
    mediumblue: "#0000cd",
    mediumorchid: "#ba55d3",
    mediumpurple: "#9370db",
    mediumseagreen: "#3cb371",
    mediumslateblue: "#7b68ee",
    mediumspringgreen: "#00fa9a",
    mediumturquoise: "#48d1cc",
    mediumvioletred: "#c71585",
    midnightblue: "#191970",
    mintcream: "#f5fffa",
    mistyrose: "#ffe4e1",
    moccasin: "#ffe4b5",
    navajowhite: "#ffdead",
    navy: "#000080",
    oldlace: "#fdf5e6",
    olive: "#808000",
    olivedrab: "#6b8e23",
    orange: "#ffa500",
    orangered: "#ff4500",
    orchid: "#da70d6",
    palegoldenrod: "#eee8aa",
    palegreen: "#98fb98",
    paleturquoise: "#afeeee",
    palevioletred: "#db7093",
    papayawhip: "#ffefd5",
    peachpuff: "#ffdab9",
    peru: "#cd853f",
    pink: "#ffc0cb",
    plum: "#dda0dd",
    powderblue: "#b0e0e6",
    purple: "#800080",
    red: "#ff0000",
    rosybrown: "#bc8f8f",
    royalblue: "#4169e1",
    saddlebrown: "#8b4513",
    salmon: "#fa8072",
    sandybrown: "#f4a460",
    seagreen: "#2e8b57",
    seashell: "#fff5ee",
    sienna: "#a0522d",
    silver: "#c0c0c0",
    skyblue: "#87ceeb",
    slateblue: "#6a5acd",
    slategray: "#708090",
    slategrey: "#708090",
    snow: "#fffafa",
    springgreen: "#00ff7f",
    steelblue: "#4682b4",
    tan: "#d2b48c",
    teal: "#008080",
    thistle: "#d8bfd8",
    tomato: "#ff6347",
    turquoise: "#40e0d0",
    violet: "#ee82ee",
    wheat: "#f5deb3",
    white: "#ffffff",
    whitesmoke: "#f5f5f5",
    yellow: "#ffff00",
    yellowgreen: "#9acd32",
  });
  d3_rgb_names.forEach(function (key, value) {
    d3_rgb_names.set(key, d3_rgb_parse(value, d3_rgb, d3_hsl_rgb));
  });
  d3.hsl = function (h, s, l) {
    return arguments.length === 1
      ? h instanceof d3_Hsl
        ? d3_hsl(h.h, h.s, h.l)
        : d3_rgb_parse("" + h, d3_rgb_hsl, d3_hsl)
      : d3_hsl(+h, +s, +l);
  };
  function d3_hsl(h, s, l) {
    return new d3_Hsl(h, s, l);
  }
  function d3_Hsl(h, s, l) {
    this.h = h;
    this.s = s;
    this.l = l;
  }
  d3_Hsl.prototype.brighter = function (k) {
    k = Math.pow(0.7, arguments.length ? k : 1);
    return d3_hsl(this.h, this.s, this.l / k);
  };
  d3_Hsl.prototype.darker = function (k) {
    k = Math.pow(0.7, arguments.length ? k : 1);
    return d3_hsl(this.h, this.s, k * this.l);
  };
  d3_Hsl.prototype.rgb = function () {
    return d3_hsl_rgb(this.h, this.s, this.l);
  };
  d3_Hsl.prototype.toString = function () {
    return this.rgb().toString();
  };
  function d3_hsl_rgb(h, s, l) {
    var m1, m2;
    h = h % 360;
    if (h < 0) h += 360;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    l = l < 0 ? 0 : l > 1 ? 1 : l;
    m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s;
    m1 = 2 * l - m2;
    function v(h) {
      if (h > 360) h -= 360;
      else if (h < 0) h += 360;
      if (h < 60) return m1 + ((m2 - m1) * h) / 60;
      if (h < 180) return m2;
      if (h < 240) return m1 + ((m2 - m1) * (240 - h)) / 60;
      return m1;
    }
    function vv(h) {
      return Math.round(v(h) * 255);
    }
    return d3_rgb(vv(h + 120), vv(h), vv(h - 120));
  }
  function d3_selection(groups) {
    d3_arraySubclass(groups, d3_selectionPrototype);
    return groups;
  }
  var d3_select = function (s, n) {
      return n.querySelector(s);
    },
    d3_selectAll = function (s, n) {
      return n.querySelectorAll(s);
    },
    d3_selectRoot = document.documentElement,
    d3_selectMatcher =
      d3_selectRoot.matchesSelector ||
      d3_selectRoot.webkitMatchesSelector ||
      d3_selectRoot.mozMatchesSelector ||
      d3_selectRoot.msMatchesSelector ||
      d3_selectRoot.oMatchesSelector,
    d3_selectMatches = function (n, s) {
      return d3_selectMatcher.call(n, s);
    };
  if (typeof Sizzle === "function") {
    d3_select = function (s, n) {
      return Sizzle(s, n)[0] || null;
    };
    d3_selectAll = function (s, n) {
      return Sizzle.uniqueSort(Sizzle(s, n));
    };
    d3_selectMatches = Sizzle.matchesSelector;
  }
  var d3_selectionPrototype = [];
  d3.selection = function () {
    return d3_selectionRoot;
  };
  d3.selection.prototype = d3_selectionPrototype;
  d3_selectionPrototype.select = function (selector) {
    var subgroups = [],
      subgroup,
      subnode,
      group,
      node;
    if (typeof selector !== "function")
      selector = d3_selection_selector(selector);
    for (var j = -1, m = this.length; ++j < m; ) {
      subgroups.push((subgroup = []));
      subgroup.parentNode = (group = this[j]).parentNode;
      for (var i = -1, n = group.length; ++i < n; ) {
        if ((node = group[i])) {
          subgroup.push((subnode = selector.call(node, node.__data__, i)));
          if (subnode && "__data__" in node) subnode.__data__ = node.__data__;
        } else {
          subgroup.push(null);
        }
      }
    }
    return d3_selection(subgroups);
  };
  function d3_selection_selector(selector) {
    return function () {
      return d3_select(selector, this);
    };
  }
  d3_selectionPrototype.selectAll = function (selector) {
    var subgroups = [],
      subgroup,
      node;
    if (typeof selector !== "function")
      selector = d3_selection_selectorAll(selector);
    for (var j = -1, m = this.length; ++j < m; ) {
      for (var group = this[j], i = -1, n = group.length; ++i < n; ) {
        if ((node = group[i])) {
          subgroups.push(
            (subgroup = d3_array(selector.call(node, node.__data__, i)))
          );
          subgroup.parentNode = node;
        }
      }
    }
    return d3_selection(subgroups);
  };
  function d3_selection_selectorAll(selector) {
    return function () {
      return d3_selectAll(selector, this);
    };
  }
  d3_selectionPrototype.attr = function (name, value) {
    name = d3.ns.qualify(name);
    if (arguments.length < 2) {
      var node = this.node();
      return name.local
        ? node.getAttributeNS(name.space, name.local)
        : node.getAttribute(name);
    }
    function attrNull() {
      this.removeAttribute(name);
    }
    function attrNullNS() {
      this.removeAttributeNS(name.space, name.local);
    }
    function attrConstant() {
      this.setAttribute(name, value);
    }
    function attrConstantNS() {
      this.setAttributeNS(name.space, name.local, value);
    }
    function attrFunction() {
      var x = value.apply(this, arguments);
      if (x == null) this.removeAttribute(name);
      else this.setAttribute(name, x);
    }
    function attrFunctionNS() {
      var x = value.apply(this, arguments);
      if (x == null) this.removeAttributeNS(name.space, name.local);
      else this.setAttributeNS(name.space, name.local, x);
    }
    return this.each(
      value == null
        ? name.local
          ? attrNullNS
          : attrNull
        : typeof value === "function"
        ? name.local
          ? attrFunctionNS
          : attrFunction
        : name.local
        ? attrConstantNS
        : attrConstant
    );
  };
  d3_selectionPrototype.classed = function (name, value) {
    var names = d3_collapse(name).split(" "),
      n = names.length,
      i = -1;
    if (arguments.length > 1) {
      while (++i < n) d3_selection_classed.call(this, names[i], value);
      return this;
    } else {
      while (++i < n)
        if (!d3_selection_classed.call(this, names[i])) return false;
      return true;
    }
  };
  function d3_selection_classed(name, value) {
    var re = new RegExp("(^|\\s+)" + d3.requote(name) + "(\\s+|$)", "g");
    if (arguments.length < 2) {
      var node = this.node();
      if ((c = node.classList)) return c.contains(name);
      var c = node.className;
      re.lastIndex = 0;
      return re.test(c.baseVal != null ? c.baseVal : c);
    }
    function classedAdd() {
      if ((c = this.classList)) return c.add(name);
      var c = this.className,
        cb = c.baseVal != null,
        cv = cb ? c.baseVal : c;
      re.lastIndex = 0;
      if (!re.test(cv)) {
        cv = d3_collapse(cv + " " + name);
        if (cb) c.baseVal = cv;
        else this.className = cv;
      }
    }
    function classedRemove() {
      if ((c = this.classList)) return c.remove(name);
      var c = this.className,
        cb = c.baseVal != null,
        cv = cb ? c.baseVal : c;
      cv = d3_collapse(cv.replace(re, " "));
      if (cb) c.baseVal = cv;
      else this.className = cv;
    }
    function classedFunction() {
      (value.apply(this, arguments) ? classedAdd : classedRemove).call(this);
    }
    return this.each(
      typeof value === "function"
        ? classedFunction
        : value
        ? classedAdd
        : classedRemove
    );
  }
  d3_selectionPrototype.style = function (name, value, priority) {
    if (arguments.length < 3) priority = "";
    if (arguments.length < 2)
      return window.getComputedStyle(this.node(), null).getPropertyValue(name);
    function styleNull() {
      this.style.removeProperty(name);
    }
    function styleConstant() {
      this.style.setProperty(name, value, priority);
    }
    function styleFunction() {
      var x = value.apply(this, arguments);
      if (x == null) this.style.removeProperty(name);
      else this.style.setProperty(name, x, priority);
    }
    return this.each(
      value == null
        ? styleNull
        : typeof value === "function"
        ? styleFunction
        : styleConstant
    );
  };
  d3_selectionPrototype.property = function (name, value) {
    if (arguments.length < 2) return this.node()[name];
    function propertyNull() {
      delete this[name];
    }
    function propertyConstant() {
      this[name] = value;
    }
    function propertyFunction() {
      var x = value.apply(this, arguments);
      if (x == null) delete this[name];
      else this[name] = x;
    }
    return this.each(
      value == null
        ? propertyNull
        : typeof value === "function"
        ? propertyFunction
        : propertyConstant
    );
  };
  d3_selectionPrototype.text = function (value) {
    return arguments.length < 1
      ? this.node().textContent
      : this.each(
          typeof value === "function"
            ? function () {
                var v = value.apply(this, arguments);
                this.textContent = v == null ? "" : v;
              }
            : value == null
            ? function () {
                this.textContent = "";
              }
            : function () {
                this.textContent = value;
              }
        );
  };
  d3_selectionPrototype.html = function (value) {
    return arguments.length < 1
      ? this.node().innerHTML
      : this.each(
          typeof value === "function"
            ? function () {
                var v = value.apply(this, arguments);
                this.innerHTML = v == null ? "" : v;
              }
            : value == null
            ? function () {
                this.innerHTML = "";
              }
            : function () {
                this.innerHTML = value;
              }
        );
  };
  d3_selectionPrototype.append = function (name) {
    name = d3.ns.qualify(name);
    function append() {
      return this.appendChild(
        document.createElementNS(this.namespaceURI, name)
      );
    }
    function appendNS() {
      return this.appendChild(document.createElementNS(name.space, name.local));
    }
    return this.select(name.local ? appendNS : append);
  };
  d3_selectionPrototype.insert = function (name, before) {
    name = d3.ns.qualify(name);
    function insert() {
      return this.insertBefore(
        document.createElementNS(this.namespaceURI, name),
        d3_select(before, this)
      );
    }
    function insertNS() {
      return this.insertBefore(
        document.createElementNS(name.space, name.local),
        d3_select(before, this)
      );
    }
    return this.select(name.local ? insertNS : insert);
  };
  d3_selectionPrototype.remove = function () {
    return this.each(function () {
      var parent = this.parentNode;
      if (parent) parent.removeChild(this);
    });
  };
  d3_selectionPrototype.data = function (value, key) {
    var i = -1,
      n = this.length,
      group,
      node;
    if (!arguments.length) {
      value = new Array((n = (group = this[0]).length));
      while (++i < n) {
        if ((node = group[i])) {
          value[i] = node.__data__;
        }
      }
      return value;
    }
    function bind(group, groupData) {
      var i,
        n = group.length,
        m = groupData.length,
        n0 = Math.min(n, m),
        n1 = Math.max(n, m),
        updateNodes = [],
        enterNodes = [],
        exitNodes = [],
        node,
        nodeData;
      if (key) {
        var nodeByKeyValue = new d3_Map(),
          keyValues = [],
          keyValue,
          j = groupData.length;
        for (i = -1; ++i < n; ) {
          keyValue = key.call((node = group[i]), node.__data__, i);
          if (nodeByKeyValue.has(keyValue)) {
            exitNodes[j++] = node;
          } else {
            nodeByKeyValue.set(keyValue, node);
          }
          keyValues.push(keyValue);
        }
        for (i = -1; ++i < m; ) {
          keyValue = key.call(groupData, (nodeData = groupData[i]), i);
          if (nodeByKeyValue.has(keyValue)) {
            updateNodes[i] = node = nodeByKeyValue.get(keyValue);
            node.__data__ = nodeData;
            enterNodes[i] = exitNodes[i] = null;
          } else {
            enterNodes[i] = d3_selection_dataNode(nodeData);
            updateNodes[i] = exitNodes[i] = null;
          }
          nodeByKeyValue.remove(keyValue);
        }
        for (i = -1; ++i < n; ) {
          if (nodeByKeyValue.has(keyValues[i])) {
            exitNodes[i] = group[i];
          }
        }
      } else {
        for (i = -1; ++i < n0; ) {
          node = group[i];
          nodeData = groupData[i];
          if (node) {
            node.__data__ = nodeData;
            updateNodes[i] = node;
            enterNodes[i] = exitNodes[i] = null;
          } else {
            enterNodes[i] = d3_selection_dataNode(nodeData);
            updateNodes[i] = exitNodes[i] = null;
          }
        }
        for (; i < m; ++i) {
          enterNodes[i] = d3_selection_dataNode(groupData[i]);
          updateNodes[i] = exitNodes[i] = null;
        }
        for (; i < n1; ++i) {
          exitNodes[i] = group[i];
          enterNodes[i] = updateNodes[i] = null;
        }
      }
      enterNodes.update = updateNodes;
      enterNodes.parentNode =
        updateNodes.parentNode =
        exitNodes.parentNode =
          group.parentNode;
      enter.push(enterNodes);
      update.push(updateNodes);
      exit.push(exitNodes);
    }
    var enter = d3_selection_enter([]),
      update = d3_selection([]),
      exit = d3_selection([]);
    if (typeof value === "function") {
      while (++i < n) {
        bind(
          (group = this[i]),
          value.call(group, group.parentNode.__data__, i)
        );
      }
    } else {
      while (++i < n) {
        bind((group = this[i]), value);
      }
    }
    update.enter = function () {
      return enter;
    };
    update.exit = function () {
      return exit;
    };
    return update;
  };
  function d3_selection_dataNode(data) {
    return { __data__: data };
  }
  d3_selectionPrototype.datum = d3_selectionPrototype.map = function (value) {
    return arguments.length < 1
      ? this.property("__data__")
      : this.property("__data__", value);
  };
  d3_selectionPrototype.filter = function (filter) {
    var subgroups = [],
      subgroup,
      group,
      node;
    if (typeof filter !== "function") filter = d3_selection_filter(filter);
    for (var j = 0, m = this.length; j < m; j++) {
      subgroups.push((subgroup = []));
      subgroup.parentNode = (group = this[j]).parentNode;
      for (var i = 0, n = group.length; i < n; i++) {
        if ((node = group[i]) && filter.call(node, node.__data__, i)) {
          subgroup.push(node);
        }
      }
    }
    return d3_selection(subgroups);
  };
  function d3_selection_filter(selector) {
    return function () {
      return d3_selectMatches(this, selector);
    };
  }
  d3_selectionPrototype.order = function () {
    for (var j = -1, m = this.length; ++j < m; ) {
      for (
        var group = this[j], i = group.length - 1, next = group[i], node;
        --i >= 0;

      ) {
        if ((node = group[i])) {
          if (next && next !== node.nextSibling)
            next.parentNode.insertBefore(node, next);
          next = node;
        }
      }
    }
    return this;
  };
  d3_selectionPrototype.sort = function (comparator) {
    comparator = d3_selection_sortComparator.apply(this, arguments);
    for (var j = -1, m = this.length; ++j < m; ) this[j].sort(comparator);
    return this.order();
  };
  function d3_selection_sortComparator(comparator) {
    if (!arguments.length) comparator = d3.ascending;
    return function (a, b) {
      return comparator(a && a.__data__, b && b.__data__);
    };
  }
  d3_selectionPrototype.on = function (type, listener, capture) {
    if (arguments.length < 3) capture = false;
    var name = "__on" + type,
      i = type.indexOf(".");
    if (i > 0) type = type.substring(0, i);
    if (arguments.length < 2) return (i = this.node()[name]) && i._;
    return this.each(function (d, i) {
      var node = this,
        o = node[name];
      if (o) {
        node.removeEventListener(type, o, o.$);
        delete node[name];
      }
      if (listener) {
        node.addEventListener(type, (node[name] = l), (l.$ = capture));
        l._ = listener;
      }
      function l(e) {
        var o = d3.event;
        d3.event = e;
        try {
          listener.call(node, node.__data__, i);
        } finally {
          d3.event = o;
        }
      }
    });
  };
  d3_selectionPrototype.each = function (callback) {
    return d3_selection_each(this, function (node, i, j) {
      callback.call(node, node.__data__, i, j);
    });
  };
  function d3_selection_each(groups, callback) {
    for (var j = 0, m = groups.length; j < m; j++) {
      for (var group = groups[j], i = 0, n = group.length, node; i < n; i++) {
        if ((node = group[i])) callback(node, i, j);
      }
    }
    return groups;
  }
  d3_selectionPrototype.call = function (callback) {
    callback.apply(this, ((arguments[0] = this), arguments));
    return this;
  };
  d3_selectionPrototype.empty = function () {
    return !this.node();
  };
  d3_selectionPrototype.node = function (callback) {
    for (var j = 0, m = this.length; j < m; j++) {
      for (var group = this[j], i = 0, n = group.length; i < n; i++) {
        var node = group[i];
        if (node) return node;
      }
    }
    return null;
  };
  d3_selectionPrototype.transition = function () {
    var subgroups = [],
      subgroup,
      node;
    for (var j = -1, m = this.length; ++j < m; ) {
      subgroups.push((subgroup = []));
      for (var group = this[j], i = -1, n = group.length; ++i < n; ) {
        subgroup.push(
          (node = group[i])
            ? {
                node: node,
                delay: d3_transitionDelay,
                duration: d3_transitionDuration,
              }
            : null
        );
      }
    }
    return d3_transition(
      subgroups,
      d3_transitionId || ++d3_transitionNextId,
      Date.now()
    );
  };
  var d3_selectionRoot = d3_selection([[document]]);
  d3_selectionRoot[0].parentNode = d3_selectRoot;
  d3.select = function (selector) {
    return typeof selector === "string"
      ? d3_selectionRoot.select(selector)
      : d3_selection([[selector]]);
  };
  d3.selectAll = function (selector) {
    return typeof selector === "string"
      ? d3_selectionRoot.selectAll(selector)
      : d3_selection([d3_array(selector)]);
  };
  function d3_selection_enter(selection) {
    d3_arraySubclass(selection, d3_selection_enterPrototype);
    return selection;
  }
  var d3_selection_enterPrototype = [];
  d3.selection.enter = d3_selection_enter;
  d3.selection.enter.prototype = d3_selection_enterPrototype;
  d3_selection_enterPrototype.append = d3_selectionPrototype.append;
  d3_selection_enterPrototype.insert = d3_selectionPrototype.insert;
  d3_selection_enterPrototype.empty = d3_selectionPrototype.empty;
  d3_selection_enterPrototype.node = d3_selectionPrototype.node;
  d3_selection_enterPrototype.select = function (selector) {
    var subgroups = [],
      subgroup,
      subnode,
      upgroup,
      group,
      node;
    for (var j = -1, m = this.length; ++j < m; ) {
      upgroup = (group = this[j]).update;
      subgroups.push((subgroup = []));
      subgroup.parentNode = group.parentNode;
      for (var i = -1, n = group.length; ++i < n; ) {
        if ((node = group[i])) {
          subgroup.push(
            (upgroup[i] = subnode =
              selector.call(group.parentNode, node.__data__, i))
          );
          subnode.__data__ = node.__data__;
        } else {
          subgroup.push(null);
        }
      }
    }
    return d3_selection(subgroups);
  };
  function d3_transition(groups, id, time) {
    d3_arraySubclass(groups, d3_transitionPrototype);
    var tweens = new d3_Map(),
      event = d3.dispatch("start", "end"),
      ease = d3_transitionEase;
    groups.id = id;
    groups.time = time;
    groups.tween = function (name, tween) {
      if (arguments.length < 2) return tweens.get(name);
      if (tween == null) tweens.remove(name);
      else tweens.set(name, tween);
      return groups;
    };
    groups.ease = function (value) {
      if (!arguments.length) return ease;
      ease = typeof value === "function" ? value : d3.ease.apply(d3, arguments);
      return groups;
    };
    groups.each = function (type, listener) {
      if (arguments.length < 2) return d3_transition_each.call(groups, type);
      event.on(type, listener);
      return groups;
    };
    d3.timer(
      function (elapsed) {
        return d3_selection_each(groups, function (node, i, j) {
          var tweened = [],
            delay = node.delay,
            duration = node.duration,
            lock =
              (node = node.node).__transition__ ||
              (node.__transition__ = { active: 0, count: 0 }),
            d = node.__data__;
          ++lock.count;
          delay <= elapsed ? start(elapsed) : d3.timer(start, delay, time);
          function start(elapsed) {
            if (lock.active > id) return stop();
            lock.active = id;
            tweens.forEach(function (key, value) {
              if ((value = value.call(node, d, i))) {
                tweened.push(value);
              }
            });
            event.start.call(node, d, i);
            if (!tick(elapsed)) d3.timer(tick, 0, time);
            return 1;
          }
          function tick(elapsed) {
            if (lock.active !== id) return stop();
            var t = (elapsed - delay) / duration,
              e = ease(t),
              n = tweened.length;
            while (n > 0) {
              tweened[--n].call(node, e);
            }
            if (t >= 1) {
              stop();
              d3_transitionId = id;
              event.end.call(node, d, i);
              d3_transitionId = 0;
              return 1;
            }
          }
          function stop() {
            if (!--lock.count) delete node.__transition__;
            return 1;
          }
        });
      },
      0,
      time
    );
    return groups;
  }
  var d3_transitionRemove = {};
  function d3_transitionNull(d, i, a) {
    return a != "" && d3_transitionRemove;
  }
  function d3_transitionTween(name, b) {
    var interpolate = d3_interpolateByName(name);
    function transitionFunction(d, i, a) {
      var v = b.call(this, d, i);
      return v == null
        ? a != "" && d3_transitionRemove
        : a != v && interpolate(a, v);
    }
    function transitionString(d, i, a) {
      return a != b && interpolate(a, b);
    }
    return typeof b === "function"
      ? transitionFunction
      : b == null
      ? d3_transitionNull
      : ((b += ""), transitionString);
  }
  var d3_transitionPrototype = [],
    d3_transitionNextId = 0,
    d3_transitionId = 0,
    d3_transitionDefaultDelay = 0,
    d3_transitionDefaultDuration = 250,
    d3_transitionDefaultEase = d3.ease("cubic-in-out"),
    d3_transitionDelay = d3_transitionDefaultDelay,
    d3_transitionDuration = d3_transitionDefaultDuration,
    d3_transitionEase = d3_transitionDefaultEase;
  d3_transitionPrototype.call = d3_selectionPrototype.call;
  d3.transition = function (selection) {
    return arguments.length
      ? d3_transitionId
        ? selection.transition()
        : selection
      : d3_selectionRoot.transition();
  };
  d3.transition.prototype = d3_transitionPrototype;
  d3_transitionPrototype.select = function (selector) {
    var subgroups = [],
      subgroup,
      subnode,
      node;
    if (typeof selector !== "function")
      selector = d3_selection_selector(selector);
    for (var j = -1, m = this.length; ++j < m; ) {
      subgroups.push((subgroup = []));
      for (var group = this[j], i = -1, n = group.length; ++i < n; ) {
        if (
          (node = group[i]) &&
          (subnode = selector.call(node.node, node.node.__data__, i))
        ) {
          if ("__data__" in node.node) subnode.__data__ = node.node.__data__;
          subgroup.push({
            node: subnode,
            delay: node.delay,
            duration: node.duration,
          });
        } else {
          subgroup.push(null);
        }
      }
    }
    return d3_transition(subgroups, this.id, this.time).ease(this.ease());
  };
  d3_transitionPrototype.selectAll = function (selector) {
    var subgroups = [],
      subgroup,
      subnodes,
      node;
    if (typeof selector !== "function")
      selector = d3_selection_selectorAll(selector);
    for (var j = -1, m = this.length; ++j < m; ) {
      for (var group = this[j], i = -1, n = group.length; ++i < n; ) {
        if ((node = group[i])) {
          subnodes = selector.call(node.node, node.node.__data__, i);
          subgroups.push((subgroup = []));
          for (var k = -1, o = subnodes.length; ++k < o; ) {
            subgroup.push({
              node: subnodes[k],
              delay: node.delay,
              duration: node.duration,
            });
          }
        }
      }
    }
    return d3_transition(subgroups, this.id, this.time).ease(this.ease());
  };
  d3_transitionPrototype.attr = function (name, value) {
    return this.attrTween(name, d3_transitionTween(name, value));
  };
  d3_transitionPrototype.attrTween = function (nameNS, tween) {
    var name = d3.ns.qualify(nameNS);
    function attrTween(d, i) {
      var f = tween.call(this, d, i, this.getAttribute(name));
      return f === d3_transitionRemove
        ? (this.removeAttribute(name), null)
        : f &&
            function (t) {
              this.setAttribute(name, f(t));
            };
    }
    function attrTweenNS(d, i) {
      var f = tween.call(
        this,
        d,
        i,
        this.getAttributeNS(name.space, name.local)
      );
      return f === d3_transitionRemove
        ? (this.removeAttributeNS(name.space, name.local), null)
        : f &&
            function (t) {
              this.setAttributeNS(name.space, name.local, f(t));
            };
    }
    return this.tween("attr." + nameNS, name.local ? attrTweenNS : attrTween);
  };
  d3_transitionPrototype.style = function (name, value, priority) {
    if (arguments.length < 3) priority = "";
    return this.styleTween(name, d3_transitionTween(name, value), priority);
  };
  d3_transitionPrototype.styleTween = function (name, tween, priority) {
    if (arguments.length < 3) priority = "";
    return this.tween("style." + name, function (d, i) {
      var f = tween.call(
        this,
        d,
        i,
        window.getComputedStyle(this, null).getPropertyValue(name)
      );
      return f === d3_transitionRemove
        ? (this.style.removeProperty(name), null)
        : f &&
            function (t) {
              this.style.setProperty(name, f(t), priority);
            };
    });
  };
  d3_transitionPrototype.text = function (value) {
    return this.tween("text", function (d, i) {
      this.textContent =
        typeof value === "function" ? value.call(this, d, i) : value;
    });
  };
  d3_transitionPrototype.remove = function () {
    return this.each("end.transition", function () {
      var p;
      if (!this.__transition__ && (p = this.parentNode)) p.removeChild(this);
    });
  };
  d3_transitionPrototype.delay = function (value) {
    return d3_selection_each(
      this,
      typeof value === "function"
        ? function (node, i, j) {
            node.delay =
              value.call((node = node.node), node.__data__, i, j) | 0;
          }
        : ((value = value | 0),
          function (node) {
            node.delay = value;
          })
    );
  };
  d3_transitionPrototype.duration = function (value) {
    return d3_selection_each(
      this,
      typeof value === "function"
        ? function (node, i, j) {
            node.duration = Math.max(
              1,
              value.call((node = node.node), node.__data__, i, j) | 0
            );
          }
        : ((value = Math.max(1, value | 0)),
          function (node) {
            node.duration = value;
          })
    );
  };
  function d3_transition_each(callback) {
    var id = d3_transitionId,
      ease = d3_transitionEase,
      delay = d3_transitionDelay,
      duration = d3_transitionDuration;
    d3_transitionId = this.id;
    d3_transitionEase = this.ease();
    d3_selection_each(this, function (node, i, j) {
      d3_transitionDelay = node.delay;
      d3_transitionDuration = node.duration;
      callback.call((node = node.node), node.__data__, i, j);
    });
    d3_transitionId = id;
    d3_transitionEase = ease;
    d3_transitionDelay = delay;
    d3_transitionDuration = duration;
    return this;
  }
  d3_transitionPrototype.transition = function () {
    return this.select(d3_this);
  };
  var d3_timer_queue = null,
    d3_timer_interval,
    d3_timer_timeout;
  d3.timer = function (callback, delay, then) {
    var found = false,
      t0,
      t1 = d3_timer_queue;
    if (arguments.length < 3) {
      if (arguments.length < 2) delay = 0;
      else if (!isFinite(delay)) return;
      then = Date.now();
    }
    while (t1) {
      if (t1.callback === callback) {
        t1.then = then;
        t1.delay = delay;
        found = true;
        break;
      }
      t0 = t1;
      t1 = t1.next;
    }
    if (!found)
      d3_timer_queue = {
        callback: callback,
        then: then,
        delay: delay,
        next: d3_timer_queue,
      };
    if (!d3_timer_interval) {
      d3_timer_timeout = clearTimeout(d3_timer_timeout);
      d3_timer_interval = 1;
      d3_timer_frame(d3_timer_step);
    }
  };
  function d3_timer_step() {
    var elapsed,
      now = Date.now(),
      t1 = d3_timer_queue;
    while (t1) {
      elapsed = now - t1.then;
      if (elapsed >= t1.delay) t1.flush = t1.callback(elapsed);
      t1 = t1.next;
    }
    var delay = d3_timer_flush() - now;
    if (delay > 24) {
      if (isFinite(delay)) {
        clearTimeout(d3_timer_timeout);
        d3_timer_timeout = setTimeout(d3_timer_step, delay);
      }
      d3_timer_interval = 0;
    } else {
      d3_timer_interval = 1;
      d3_timer_frame(d3_timer_step);
    }
  }
  d3.timer.flush = function () {
    var elapsed,
      now = Date.now(),
      t1 = d3_timer_queue;
    while (t1) {
      elapsed = now - t1.then;
      if (!t1.delay) t1.flush = t1.callback(elapsed);
      t1 = t1.next;
    }
    d3_timer_flush();
  };
  function d3_timer_flush() {
    var t0 = null,
      t1 = d3_timer_queue,
      then = Infinity;
    while (t1) {
      if (t1.flush) {
        t1 = t0 ? (t0.next = t1.next) : (d3_timer_queue = t1.next);
      } else {
        then = Math.min(then, t1.then + t1.delay);
        t1 = (t0 = t1).next;
      }
    }
    return then;
  }
  var d3_timer_frame =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function (callback) {
      setTimeout(callback, 17);
    };
  d3.transform = function (string) {
    var g = document.createElementNS(d3.ns.prefix.svg, "g"),
      identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    return (d3.transform = function (string) {
      g.setAttribute("transform", string);
      var t = g.transform.baseVal.consolidate();
      return new d3_transform(t ? t.matrix : identity);
    })(string);
  };
  function d3_transform(m) {
    var r0 = [m.a, m.b],
      r1 = [m.c, m.d],
      kx = d3_transformNormalize(r0),
      kz = d3_transformDot(r0, r1),
      ky = d3_transformNormalize(d3_transformCombine(r1, r0, -kz)) || 0;
    if (r0[0] * r1[1] < r1[0] * r0[1]) {
      r0[0] *= -1;
      r0[1] *= -1;
      kx *= -1;
      kz *= -1;
    }
    this.rotate =
      (kx ? Math.atan2(r0[1], r0[0]) : Math.atan2(-r1[0], r1[1])) *
      d3_transformDegrees;
    this.translate = [m.e, m.f];
    this.scale = [kx, ky];
    this.skew = ky ? Math.atan2(kz, ky) * d3_transformDegrees : 0;
  }
  d3_transform.prototype.toString = function () {
    return (
      "translate(" +
      this.translate +
      ")rotate(" +
      this.rotate +
      ")skewX(" +
      this.skew +
      ")scale(" +
      this.scale +
      ")"
    );
  };
  function d3_transformDot(a, b) {
    return a[0] * b[0] + a[1] * b[1];
  }
  function d3_transformNormalize(a) {
    var k = Math.sqrt(d3_transformDot(a, a));
    if (k) {
      a[0] /= k;
      a[1] /= k;
    }
    return k;
  }
  function d3_transformCombine(a, b, k) {
    a[0] += k * b[0];
    a[1] += k * b[1];
    return a;
  }
  var d3_transformDegrees = 180 / Math.PI;
  d3.mouse = function (container) {
    return d3_mousePoint(container, d3_eventSource());
  };
  var d3_mouse_bug44083 = /WebKit/.test(navigator.userAgent) ? -1 : 0;
  function d3_mousePoint(container, e) {
    var svg = container.ownerSVGElement || container;
    if (svg.createSVGPoint) {
      var point = svg.createSVGPoint();
      if (d3_mouse_bug44083 < 0 && (window.scrollX || window.scrollY)) {
        svg = d3
          .select(document.body)
          .append("svg")
          .style("position", "absolute")
          .style("top", 0)
          .style("left", 0);
        var ctm = svg[0][0].getScreenCTM();
        d3_mouse_bug44083 = !(ctm.f || ctm.e);
        svg.remove();
      }
      if (d3_mouse_bug44083) {
        point.x = e.pageX;
        point.y = e.pageY;
      } else {
        point.x = e.clientX;
        point.y = e.clientY;
      }
      point = point.matrixTransform(container.getScreenCTM().inverse());
      return [point.x, point.y];
    }
    var rect = container.getBoundingClientRect();
    return [
      e.clientX - rect.left - container.clientLeft,
      e.clientY - rect.top - container.clientTop,
    ];
  }
  d3.touches = function (container, touches) {
    if (arguments.length < 2) touches = d3_eventSource().touches;
    return touches
      ? d3_array(touches).map(function (touch) {
          var point = d3_mousePoint(container, touch);
          point.identifier = touch.identifier;
          return point;
        })
      : [];
  };
  function d3_noop() {}
  d3.scale = {};
  function d3_scaleExtent(domain) {
    var start = domain[0],
      stop = domain[domain.length - 1];
    return start < stop ? [start, stop] : [stop, start];
  }
  function d3_scaleRange(scale) {
    return scale.rangeExtent
      ? scale.rangeExtent()
      : d3_scaleExtent(scale.range());
  }
  function d3_scale_nice(domain, nice) {
    var i0 = 0,
      i1 = domain.length - 1,
      x0 = domain[i0],
      x1 = domain[i1],
      dx;
    if (x1 < x0) {
      dx = i0;
      i0 = i1;
      i1 = dx;
      dx = x0;
      x0 = x1;
      x1 = dx;
    }
    if ((dx = x1 - x0)) {
      nice = nice(dx);
      domain[i0] = nice.floor(x0);
      domain[i1] = nice.ceil(x1);
    }
    return domain;
  }
  function d3_scale_niceDefault() {
    return Math;
  }
  d3.scale.linear = function () {
    return d3_scale_linear([0, 1], [0, 1], d3.interpolate, false);
  };
  function d3_scale_linear(domain, range, interpolate, clamp) {
    var output, input;
    function rescale() {
      var linear =
          Math.min(domain.length, range.length) > 2
            ? d3_scale_polylinear
            : d3_scale_bilinear,
        uninterpolate = clamp ? d3_uninterpolateClamp : d3_uninterpolateNumber;
      output = linear(domain, range, uninterpolate, interpolate);
      input = linear(range, domain, uninterpolate, d3.interpolate);
      return scale;
    }
    function scale(x) {
      return output(x);
    }
    scale.invert = function (y) {
      return input(y);
    };
    scale.domain = function (x) {
      if (!arguments.length) return domain;
      domain = x.map(Number);
      return rescale();
    };
    scale.range = function (x) {
      if (!arguments.length) return range;
      range = x;
      return rescale();
    };
    scale.rangeRound = function (x) {
      return scale.range(x).interpolate(d3.interpolateRound);
    };
    scale.clamp = function (x) {
      if (!arguments.length) return clamp;
      clamp = x;
      return rescale();
    };
    scale.interpolate = function (x) {
      if (!arguments.length) return interpolate;
      interpolate = x;
      return rescale();
    };
    scale.ticks = function (m) {
      return d3_scale_linearTicks(domain, m);
    };
    scale.tickFormat = function (m) {
      return d3_scale_linearTickFormat(domain, m);
    };
    scale.nice = function () {
      d3_scale_nice(domain, d3_scale_linearNice);
      return rescale();
    };
    scale.copy = function () {
      return d3_scale_linear(domain, range, interpolate, clamp);
    };
    return rescale();
  }
  function d3_scale_linearRebind(scale, linear) {
    return d3.rebind(
      scale,
      linear,
      "range",
      "rangeRound",
      "interpolate",
      "clamp"
    );
  }
  function d3_scale_linearNice(dx) {
    dx = Math.pow(10, Math.round(Math.log(dx) / Math.LN10) - 1);
    return {
      floor: function (x) {
        return Math.floor(x / dx) * dx;
      },
      ceil: function (x) {
        return Math.ceil(x / dx) * dx;
      },
    };
  }
  function d3_scale_linearTickRange(domain, m) {
    var extent = d3_scaleExtent(domain),
      span = extent[1] - extent[0],
      step = Math.pow(10, Math.floor(Math.log(span / m) / Math.LN10)),
      err = (m / span) * step;
    if (err <= 0.15) step *= 10;
    else if (err <= 0.35) step *= 5;
    else if (err <= 0.75) step *= 2;
    extent[0] = Math.ceil(extent[0] / step) * step;
    extent[1] = Math.floor(extent[1] / step) * step + step * 0.5;
    extent[2] = step;
    return extent;
  }
  function d3_scale_linearTicks(domain, m) {
    return d3.range.apply(d3, d3_scale_linearTickRange(domain, m));
  }
  function d3_scale_linearTickFormat(domain, m) {
    return d3.format(
      ",." +
        Math.max(
          0,
          -Math.floor(
            Math.log(d3_scale_linearTickRange(domain, m)[2]) / Math.LN10 + 0.01
          )
        ) +
        "f"
    );
  }
  function d3_scale_bilinear(domain, range, uninterpolate, interpolate) {
    var u = uninterpolate(domain[0], domain[1]),
      i = interpolate(range[0], range[1]);
    return function (x) {
      return i(u(x));
    };
  }
  function d3_scale_polylinear(domain, range, uninterpolate, interpolate) {
    var u = [],
      i = [],
      j = 0,
      k = Math.min(domain.length, range.length) - 1;
    if (domain[k] < domain[0]) {
      domain = domain.slice().reverse();
      range = range.slice().reverse();
    }
    while (++j <= k) {
      u.push(uninterpolate(domain[j - 1], domain[j]));
      i.push(interpolate(range[j - 1], range[j]));
    }
    return function (x) {
      var j = d3.bisect(domain, x, 1, k) - 1;
      return i[j](u[j](x));
    };
  }
  d3.scale.log = function () {
    return d3_scale_log(d3.scale.linear(), d3_scale_logp);
  };
  function d3_scale_log(linear, log) {
    var pow = log.pow;
    function scale(x) {
      return linear(log(x));
    }
    scale.invert = function (x) {
      return pow(linear.invert(x));
    };
    scale.domain = function (x) {
      if (!arguments.length) return linear.domain().map(pow);
      log = x[0] < 0 ? d3_scale_logn : d3_scale_logp;
      pow = log.pow;
      linear.domain(x.map(log));
      return scale;
    };
    scale.nice = function () {
      linear.domain(d3_scale_nice(linear.domain(), d3_scale_niceDefault));
      return scale;
    };
    scale.ticks = function () {
      var extent = d3_scaleExtent(linear.domain()),
        ticks = [];
      if (extent.every(isFinite)) {
        var i = Math.floor(extent[0]),
          j = Math.ceil(extent[1]),
          u = pow(extent[0]),
          v = pow(extent[1]);
        if (log === d3_scale_logn) {
          ticks.push(pow(i));
          for (; i++ < j; ) for (var k = 9; k > 0; k--) ticks.push(pow(i) * k);
        } else {
          for (; i < j; i++)
            for (var k = 1; k < 10; k++) ticks.push(pow(i) * k);
          ticks.push(pow(i));
        }
        for (i = 0; ticks[i] < u; i++) {}
        for (j = ticks.length; ticks[j - 1] > v; j--) {}
        ticks = ticks.slice(i, j);
      }
      return ticks;
    };
    scale.tickFormat = function (n, format) {
      if (arguments.length < 2) format = d3_scale_logFormat;
      if (arguments.length < 1) return format;
      var k = Math.max(0.1, n / scale.ticks().length),
        f =
          log === d3_scale_logn
            ? ((e = -1e-12), Math.floor)
            : ((e = 1e-12), Math.ceil),
        e;
      return function (d) {
        return d / pow(f(log(d) + e)) <= k ? format(d) : "";
      };
    };
    scale.copy = function () {
      return d3_scale_log(linear.copy(), log);
    };
    return d3_scale_linearRebind(scale, linear);
  }
  var d3_scale_logFormat = d3.format(".0e");
  function d3_scale_logp(x) {
    return Math.log(x < 0 ? 0 : x) / Math.LN10;
  }
  function d3_scale_logn(x) {
    return -Math.log(x > 0 ? 0 : -x) / Math.LN10;
  }
  d3_scale_logp.pow = function (x) {
    return Math.pow(10, x);
  };
  d3_scale_logn.pow = function (x) {
    return -Math.pow(10, -x);
  };
  d3.scale.pow = function () {
    return d3_scale_pow(d3.scale.linear(), 1);
  };
  function d3_scale_pow(linear, exponent) {
    var powp = d3_scale_powPow(exponent),
      powb = d3_scale_powPow(1 / exponent);
    function scale(x) {
      return linear(powp(x));
    }
    scale.invert = function (x) {
      return powb(linear.invert(x));
    };
    scale.domain = function (x) {
      if (!arguments.length) return linear.domain().map(powb);
      linear.domain(x.map(powp));
      return scale;
    };
    scale.ticks = function (m) {
      return d3_scale_linearTicks(scale.domain(), m);
    };
    scale.tickFormat = function (m) {
      return d3_scale_linearTickFormat(scale.domain(), m);
    };
    scale.nice = function () {
      return scale.domain(d3_scale_nice(scale.domain(), d3_scale_linearNice));
    };
    scale.exponent = function (x) {
      if (!arguments.length) return exponent;
      var domain = scale.domain();
      powp = d3_scale_powPow((exponent = x));
      powb = d3_scale_powPow(1 / exponent);
      return scale.domain(domain);
    };
    scale.copy = function () {
      return d3_scale_pow(linear.copy(), exponent);
    };
    return d3_scale_linearRebind(scale, linear);
  }
  function d3_scale_powPow(e) {
    return function (x) {
      return x < 0 ? -Math.pow(-x, e) : Math.pow(x, e);
    };
  }
  d3.scale.sqrt = function () {
    return d3.scale.pow().exponent(0.5);
  };
  d3.scale.ordinal = function () {
    return d3_scale_ordinal([], { t: "range", x: [] });
  };
  function d3_scale_ordinal(domain, ranger) {
    var index, range, rangeBand;
    function scale(x) {
      return range[
        ((index.get(x) || index.set(x, domain.push(x))) - 1) % range.length
      ];
    }
    function steps(start, step) {
      return d3.range(domain.length).map(function (i) {
        return start + step * i;
      });
    }
    scale.domain = function (x) {
      if (!arguments.length) return domain;
      domain = [];
      index = new d3_Map();
      var i = -1,
        n = x.length,
        xi;
      while (++i < n)
        if (!index.has((xi = x[i]))) index.set(xi, domain.push(xi));
      return scale[ranger.t](ranger.x, ranger.p);
    };
    scale.range = function (x) {
      if (!arguments.length) return range;
      range = x;
      rangeBand = 0;
      ranger = { t: "range", x: x };
      return scale;
    };
    scale.rangePoints = function (x, padding) {
      if (arguments.length < 2) padding = 0;
      var start = x[0],
        stop = x[1],
        step = (stop - start) / (domain.length - 1 + padding);
      range = steps(
        domain.length < 2 ? (start + stop) / 2 : start + (step * padding) / 2,
        step
      );
      rangeBand = 0;
      ranger = { t: "rangePoints", x: x, p: padding };
      return scale;
    };
    scale.rangeBands = function (x, padding) {
      if (arguments.length < 2) padding = 0;
      var reverse = x[1] < x[0],
        start = x[reverse - 0],
        stop = x[1 - reverse],
        step = (stop - start) / (domain.length + padding);
      range = steps(start + step * padding, step);
      if (reverse) range.reverse();
      rangeBand = step * (1 - padding);
      ranger = { t: "rangeBands", x: x, p: padding };
      return scale;
    };
    scale.rangeRoundBands = function (x, padding) {
      if (arguments.length < 2) padding = 0;
      var reverse = x[1] < x[0],
        start = x[reverse - 0],
        stop = x[1 - reverse],
        step = Math.floor((stop - start) / (domain.length + padding)),
        error = stop - start - (domain.length - padding) * step;
      range = steps(start + Math.round(error / 2), step);
      if (reverse) range.reverse();
      rangeBand = Math.round(step * (1 - padding));
      ranger = { t: "rangeRoundBands", x: x, p: padding };
      return scale;
    };
    scale.rangeBand = function () {
      return rangeBand;
    };
    scale.rangeExtent = function () {
      return d3_scaleExtent(ranger.x);
    };
    scale.copy = function () {
      return d3_scale_ordinal(domain, ranger);
    };
    return scale.domain(domain);
  }
  d3.scale.category10 = function () {
    return d3.scale.ordinal().range(d3_category10);
  };
  d3.scale.category20 = function () {
    return d3.scale.ordinal().range(d3_category20);
  };
  d3.scale.category20b = function () {
    return d3.scale.ordinal().range(d3_category20b);
  };
  d3.scale.category20c = function () {
    return d3.scale.ordinal().range(d3_category20c);
  };
  var d3_category10 = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf",
  ];
  var d3_category20 = [
    "#1f77b4",
    "#aec7e8",
    "#ff7f0e",
    "#ffbb78",
    "#2ca02c",
    "#98df8a",
    "#d62728",
    "#ff9896",
    "#9467bd",
    "#c5b0d5",
    "#8c564b",
    "#c49c94",
    "#e377c2",
    "#f7b6d2",
    "#7f7f7f",
    "#c7c7c7",
    "#bcbd22",
    "#dbdb8d",
    "#17becf",
    "#9edae5",
  ];
  var d3_category20b = [
    "#393b79",
    "#5254a3",
    "#6b6ecf",
    "#9c9ede",
    "#637939",
    "#8ca252",
    "#b5cf6b",
    "#cedb9c",
    "#8c6d31",
    "#bd9e39",
    "#e7ba52",
    "#e7cb94",
    "#843c39",
    "#ad494a",
    "#d6616b",
    "#e7969c",
    "#7b4173",
    "#a55194",
    "#ce6dbd",
    "#de9ed6",
  ];
  var d3_category20c = [
    "#3182bd",
    "#6baed6",
    "#9ecae1",
    "#c6dbef",
    "#e6550d",
    "#fd8d3c",
    "#fdae6b",
    "#fdd0a2",
    "#31a354",
    "#74c476",
    "#a1d99b",
    "#c7e9c0",
    "#756bb1",
    "#9e9ac8",
    "#bcbddc",
    "#dadaeb",
    "#636363",
    "#969696",
    "#bdbdbd",
    "#d9d9d9",
  ];
  d3.scale.quantile = function () {
    return d3_scale_quantile([], []);
  };
  function d3_scale_quantile(domain, range) {
    var thresholds;
    function rescale() {
      var k = 0,
        n = domain.length,
        q = range.length;
      thresholds = [];
      while (++k < q) thresholds[k - 1] = d3.quantile(domain, k / q);
      return scale;
    }
    function scale(x) {
      if (isNaN((x = +x))) return NaN;
      return range[d3.bisect(thresholds, x)];
    }
    scale.domain = function (x) {
      if (!arguments.length) return domain;
      domain = x
        .filter(function (d) {
          return !isNaN(d);
        })
        .sort(d3.ascending);
      return rescale();
    };
    scale.range = function (x) {
      if (!arguments.length) return range;
      range = x;
      return rescale();
    };
    scale.quantiles = function () {
      return thresholds;
    };
    scale.copy = function () {
      return d3_scale_quantile(domain, range);
    };
    return rescale();
  }
  d3.scale.quantize = function () {
    return d3_scale_quantize(0, 1, [0, 1]);
  };
  function d3_scale_quantize(x0, x1, range) {
    var kx, i;
    function scale(x) {
      return range[Math.max(0, Math.min(i, Math.floor(kx * (x - x0))))];
    }
    function rescale() {
      kx = range.length / (x1 - x0);
      i = range.length - 1;
      return scale;
    }
    scale.domain = function (x) {
      if (!arguments.length) return [x0, x1];
      x0 = +x[0];
      x1 = +x[x.length - 1];
      return rescale();
    };
    scale.range = function (x) {
      if (!arguments.length) return range;
      range = x;
      return rescale();
    };
    scale.copy = function () {
      return d3_scale_quantize(x0, x1, range);
    };
    return rescale();
  }
  d3.scale.identity = function () {
    return d3_scale_identity([0, 1]);
  };
  function d3_scale_identity(domain) {
    function identity(x) {
      return +x;
    }
    identity.invert = identity;
    identity.domain = identity.range = function (x) {
      if (!arguments.length) return domain;
      domain = x.map(identity);
      return identity;
    };
    identity.ticks = function (m) {
      return d3_scale_linearTicks(domain, m);
    };
    identity.tickFormat = function (m) {
      return d3_scale_linearTickFormat(domain, m);
    };
    identity.copy = function () {
      return d3_scale_identity(domain);
    };
    return identity;
  }
  d3.svg = {};
  d3.svg.arc = function () {
    var innerRadius = d3_svg_arcInnerRadius,
      outerRadius = d3_svg_arcOuterRadius,
      startAngle = d3_svg_arcStartAngle,
      endAngle = d3_svg_arcEndAngle;
    function arc() {
      var r0 = innerRadius.apply(this, arguments),
        r1 = outerRadius.apply(this, arguments),
        a0 = startAngle.apply(this, arguments) + d3_svg_arcOffset,
        a1 = endAngle.apply(this, arguments) + d3_svg_arcOffset,
        da = (a1 < a0 && ((da = a0), (a0 = a1), (a1 = da)), a1 - a0),
        df = da < Math.PI ? "0" : "1",
        c0 = Math.cos(a0),
        s0 = Math.sin(a0),
        c1 = Math.cos(a1),
        s1 = Math.sin(a1);
      return da >= d3_svg_arcMax
        ? r0
          ? "M0," +
            r1 +
            "A" +
            r1 +
            "," +
            r1 +
            " 0 1,1 0," +
            -r1 +
            "A" +
            r1 +
            "," +
            r1 +
            " 0 1,1 0," +
            r1 +
            "M0," +
            r0 +
            "A" +
            r0 +
            "," +
            r0 +
            " 0 1,0 0," +
            -r0 +
            "A" +
            r0 +
            "," +
            r0 +
            " 0 1,0 0," +
            r0 +
            "Z"
          : "M0," +
            r1 +
            "A" +
            r1 +
            "," +
            r1 +
            " 0 1,1 0," +
            -r1 +
            "A" +
            r1 +
            "," +
            r1 +
            " 0 1,1 0," +
            r1 +
            "Z"
        : r0
        ? "M" +
          r1 * c0 +
          "," +
          r1 * s0 +
          "A" +
          r1 +
          "," +
          r1 +
          " 0 " +
          df +
          ",1 " +
          r1 * c1 +
          "," +
          r1 * s1 +
          "L" +
          r0 * c1 +
          "," +
          r0 * s1 +
          "A" +
          r0 +
          "," +
          r0 +
          " 0 " +
          df +
          ",0 " +
          r0 * c0 +
          "," +
          r0 * s0 +
          "Z"
        : "M" +
          r1 * c0 +
          "," +
          r1 * s0 +
          "A" +
          r1 +
          "," +
          r1 +
          " 0 " +
          df +
          ",1 " +
          r1 * c1 +
          "," +
          r1 * s1 +
          "L0,0" +
          "Z";
    }
    arc.innerRadius = function (v) {
      if (!arguments.length) return innerRadius;
      innerRadius = d3_functor(v);
      return arc;
    };
    arc.outerRadius = function (v) {
      if (!arguments.length) return outerRadius;
      outerRadius = d3_functor(v);
      return arc;
    };
    arc.startAngle = function (v) {
      if (!arguments.length) return startAngle;
      startAngle = d3_functor(v);
      return arc;
    };
    arc.endAngle = function (v) {
      if (!arguments.length) return endAngle;
      endAngle = d3_functor(v);
      return arc;
    };
    arc.centroid = function () {
      var r =
          (innerRadius.apply(this, arguments) +
            outerRadius.apply(this, arguments)) /
          2,
        a =
          (startAngle.apply(this, arguments) +
            endAngle.apply(this, arguments)) /
            2 +
          d3_svg_arcOffset;
      return [Math.cos(a) * r, Math.sin(a) * r];
    };
    return arc;
  };
  var d3_svg_arcOffset = -Math.PI / 2,
    d3_svg_arcMax = 2 * Math.PI - 1e-6;
  function d3_svg_arcInnerRadius(d) {
    return d.innerRadius;
  }
  function d3_svg_arcOuterRadius(d) {
    return d.outerRadius;
  }
  function d3_svg_arcStartAngle(d) {
    return d.startAngle;
  }
  function d3_svg_arcEndAngle(d) {
    return d.endAngle;
  }
  function d3_svg_line(projection) {
    var x = d3_svg_lineX,
      y = d3_svg_lineY,
      defined = d3_true,
      interpolate = d3_svg_lineInterpolatorDefault,
      interpolator = d3_svg_lineLinear,
      tension = 0.7;
    function line(data) {
      var segments = [],
        points = [],
        i = -1,
        n = data.length,
        d,
        fx = d3_functor(x),
        fy = d3_functor(y);
      function segment() {
        segments.push("M", interpolator(projection(points), tension));
      }
      while (++i < n) {
        if (defined.call(this, (d = data[i]), i)) {
          points.push([+fx.call(this, d, i), +fy.call(this, d, i)]);
        } else if (points.length) {
          segment();
          points = [];
        }
      }
      if (points.length) segment();
      return segments.length ? segments.join("") : null;
    }
    line.x = function (_) {
      if (!arguments.length) return x;
      x = _;
      return line;
    };
    line.y = function (_) {
      if (!arguments.length) return y;
      y = _;
      return line;
    };
    line.defined = function (_) {
      if (!arguments.length) return defined;
      defined = _;
      return line;
    };
    line.interpolate = function (_) {
      if (!arguments.length) return interpolate;
      if (!d3_svg_lineInterpolators.has((_ += "")))
        _ = d3_svg_lineInterpolatorDefault;
      interpolator = d3_svg_lineInterpolators.get((interpolate = _));
      return line;
    };
    line.tension = function (_) {
      if (!arguments.length) return tension;
      tension = _;
      return line;
    };
    return line;
  }
  d3.svg.line = function () {
    return d3_svg_line(d3_identity);
  };
  function d3_svg_lineX(d) {
    return d[0];
  }
  function d3_svg_lineY(d) {
    return d[1];
  }
  var d3_svg_lineInterpolatorDefault = "linear";
  var d3_svg_lineInterpolators = d3.map({
    linear: d3_svg_lineLinear,
    "step-before": d3_svg_lineStepBefore,
    "step-after": d3_svg_lineStepAfter,
    basis: d3_svg_lineBasis,
    "basis-open": d3_svg_lineBasisOpen,
    "basis-closed": d3_svg_lineBasisClosed,
    bundle: d3_svg_lineBundle,
    cardinal: d3_svg_lineCardinal,
    "cardinal-open": d3_svg_lineCardinalOpen,
    "cardinal-closed": d3_svg_lineCardinalClosed,
    monotone: d3_svg_lineMonotone,
  });
  function d3_svg_lineLinear(points) {
    var i = 0,
      n = points.length,
      p = points[0],
      path = [p[0], ",", p[1]];
    while (++i < n) path.push("L", (p = points[i])[0], ",", p[1]);
    return path.join("");
  }
  function d3_svg_lineStepBefore(points) {
    var i = 0,
      n = points.length,
      p = points[0],
      path = [p[0], ",", p[1]];
    while (++i < n) path.push("V", (p = points[i])[1], "H", p[0]);
    return path.join("");
  }
  function d3_svg_lineStepAfter(points) {
    var i = 0,
      n = points.length,
      p = points[0],
      path = [p[0], ",", p[1]];
    while (++i < n) path.push("H", (p = points[i])[0], "V", p[1]);
    return path.join("");
  }
  function d3_svg_lineCardinalOpen(points, tension) {
    return points.length < 4
      ? d3_svg_lineLinear(points)
      : points[1] +
          d3_svg_lineHermite(
            points.slice(1, points.length - 1),
            d3_svg_lineCardinalTangents(points, tension)
          );
  }
  function d3_svg_lineCardinalClosed(points, tension) {
    return points.length < 3
      ? d3_svg_lineLinear(points)
      : points[0] +
          d3_svg_lineHermite(
            (points.push(points[0]), points),
            d3_svg_lineCardinalTangents(
              [points[points.length - 2]].concat(points, [points[1]]),
              tension
            )
          );
  }
  function d3_svg_lineCardinal(points, tension, closed) {
    return points.length < 3
      ? d3_svg_lineLinear(points)
      : points[0] +
          d3_svg_lineHermite(
            points,
            d3_svg_lineCardinalTangents(points, tension)
          );
  }
  function d3_svg_lineHermite(points, tangents) {
    if (
      tangents.length < 1 ||
      (points.length != tangents.length && points.length != tangents.length + 2)
    ) {
      return d3_svg_lineLinear(points);
    }
    var quad = points.length != tangents.length,
      path = "",
      p0 = points[0],
      p = points[1],
      t0 = tangents[0],
      t = t0,
      pi = 1;
    if (quad) {
      path +=
        "Q" +
        (p[0] - (t0[0] * 2) / 3) +
        "," +
        (p[1] - (t0[1] * 2) / 3) +
        "," +
        p[0] +
        "," +
        p[1];
      p0 = points[1];
      pi = 2;
    }
    if (tangents.length > 1) {
      t = tangents[1];
      p = points[pi];
      pi++;
      path +=
        "C" +
        (p0[0] + t0[0]) +
        "," +
        (p0[1] + t0[1]) +
        "," +
        (p[0] - t[0]) +
        "," +
        (p[1] - t[1]) +
        "," +
        p[0] +
        "," +
        p[1];
      for (var i = 2; i < tangents.length; i++, pi++) {
        p = points[pi];
        t = tangents[i];
        path +=
          "S" + (p[0] - t[0]) + "," + (p[1] - t[1]) + "," + p[0] + "," + p[1];
      }
    }
    if (quad) {
      var lp = points[pi];
      path +=
        "Q" +
        (p[0] + (t[0] * 2) / 3) +
        "," +
        (p[1] + (t[1] * 2) / 3) +
        "," +
        lp[0] +
        "," +
        lp[1];
    }
    return path;
  }
  function d3_svg_lineCardinalTangents(points, tension) {
    var tangents = [],
      a = (1 - tension) / 2,
      p0,
      p1 = points[0],
      p2 = points[1],
      i = 1,
      n = points.length;
    while (++i < n) {
      p0 = p1;
      p1 = p2;
      p2 = points[i];
      tangents.push([a * (p2[0] - p0[0]), a * (p2[1] - p0[1])]);
    }
    return tangents;
  }
  function d3_svg_lineBasis(points) {
    if (points.length < 3) return d3_svg_lineLinear(points);
    var i = 1,
      n = points.length,
      pi = points[0],
      x0 = pi[0],
      y0 = pi[1],
      px = [x0, x0, x0, (pi = points[1])[0]],
      py = [y0, y0, y0, pi[1]],
      path = [x0, ",", y0];
    d3_svg_lineBasisBezier(path, px, py);
    while (++i < n) {
      pi = points[i];
      px.shift();
      px.push(pi[0]);
      py.shift();
      py.push(pi[1]);
      d3_svg_lineBasisBezier(path, px, py);
    }
    i = -1;
    while (++i < 2) {
      px.shift();
      px.push(pi[0]);
      py.shift();
      py.push(pi[1]);
      d3_svg_lineBasisBezier(path, px, py);
    }
    return path.join("");
  }
  function d3_svg_lineBasisOpen(points) {
    if (points.length < 4) return d3_svg_lineLinear(points);
    var path = [],
      i = -1,
      n = points.length,
      pi,
      px = [0],
      py = [0];
    while (++i < 3) {
      pi = points[i];
      px.push(pi[0]);
      py.push(pi[1]);
    }
    path.push(
      d3_svg_lineDot4(d3_svg_lineBasisBezier3, px) +
        "," +
        d3_svg_lineDot4(d3_svg_lineBasisBezier3, py)
    );
    --i;
    while (++i < n) {
      pi = points[i];
      px.shift();
      px.push(pi[0]);
      py.shift();
      py.push(pi[1]);
      d3_svg_lineBasisBezier(path, px, py);
    }
    return path.join("");
  }
  function d3_svg_lineBasisClosed(points) {
    var path,
      i = -1,
      n = points.length,
      m = n + 4,
      pi,
      px = [],
      py = [];
    while (++i < 4) {
      pi = points[i % n];
      px.push(pi[0]);
      py.push(pi[1]);
    }
    path = [
      d3_svg_lineDot4(d3_svg_lineBasisBezier3, px),
      ",",
      d3_svg_lineDot4(d3_svg_lineBasisBezier3, py),
    ];
    --i;
    while (++i < m) {
      pi = points[i % n];
      px.shift();
      px.push(pi[0]);
      py.shift();
      py.push(pi[1]);
      d3_svg_lineBasisBezier(path, px, py);
    }
    return path.join("");
  }
  function d3_svg_lineBundle(points, tension) {
    var n = points.length - 1;
    if (n) {
      var x0 = points[0][0],
        y0 = points[0][1],
        dx = points[n][0] - x0,
        dy = points[n][1] - y0,
        i = -1,
        p,
        t;
      while (++i <= n) {
        p = points[i];
        t = i / n;
        p[0] = tension * p[0] + (1 - tension) * (x0 + t * dx);
        p[1] = tension * p[1] + (1 - tension) * (y0 + t * dy);
      }
    }
    return d3_svg_lineBasis(points);
  }
  function d3_svg_lineDot4(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  }
  var d3_svg_lineBasisBezier1 = [0, 2 / 3, 1 / 3, 0],
    d3_svg_lineBasisBezier2 = [0, 1 / 3, 2 / 3, 0],
    d3_svg_lineBasisBezier3 = [0, 1 / 6, 2 / 3, 1 / 6];
  function d3_svg_lineBasisBezier(path, x, y) {
    path.push(
      "C",
      d3_svg_lineDot4(d3_svg_lineBasisBezier1, x),
      ",",
      d3_svg_lineDot4(d3_svg_lineBasisBezier1, y),
      ",",
      d3_svg_lineDot4(d3_svg_lineBasisBezier2, x),
      ",",
      d3_svg_lineDot4(d3_svg_lineBasisBezier2, y),
      ",",
      d3_svg_lineDot4(d3_svg_lineBasisBezier3, x),
      ",",
      d3_svg_lineDot4(d3_svg_lineBasisBezier3, y)
    );
  }
  function d3_svg_lineSlope(p0, p1) {
    return (p1[1] - p0[1]) / (p1[0] - p0[0]);
  }
  function d3_svg_lineFiniteDifferences(points) {
    var i = 0,
      j = points.length - 1,
      m = [],
      p0 = points[0],
      p1 = points[1],
      d = (m[0] = d3_svg_lineSlope(p0, p1));
    while (++i < j) {
      m[i] = d + (d = d3_svg_lineSlope((p0 = p1), (p1 = points[i + 1])));
    }
    m[i] = d;
    return m;
  }
  function d3_svg_lineMonotoneTangents(points) {
    var tangents = [],
      d,
      a,
      b,
      s,
      m = d3_svg_lineFiniteDifferences(points),
      i = -1,
      j = points.length - 1;
    while (++i < j) {
      d = d3_svg_lineSlope(points[i], points[i + 1]);
      if (Math.abs(d) < 1e-6) {
        m[i] = m[i + 1] = 0;
      } else {
        a = m[i] / d;
        b = m[i + 1] / d;
        s = a * a + b * b;
        if (s > 9) {
          s = (d * 3) / Math.sqrt(s);
          m[i] = s * a;
          m[i + 1] = s * b;
        }
      }
    }
    i = -1;
    while (++i <= j) {
      s =
        (points[Math.min(j, i + 1)][0] - points[Math.max(0, i - 1)][0]) /
        (6 * (1 + m[i] * m[i]));
      tangents.push([s || 0, m[i] * s || 0]);
    }
    return tangents;
  }
  function d3_svg_lineMonotone(points) {
    return points.length < 3
      ? d3_svg_lineLinear(points)
      : points[0] +
          d3_svg_lineHermite(points, d3_svg_lineMonotoneTangents(points));
  }
  d3.svg.line.radial = function () {
    var line = d3_svg_line(d3_svg_lineRadial);
    (line.radius = line.x), delete line.x;
    (line.angle = line.y), delete line.y;
    return line;
  };
  function d3_svg_lineRadial(points) {
    var point,
      i = -1,
      n = points.length,
      r,
      a;
    while (++i < n) {
      point = points[i];
      r = point[0];
      a = point[1] + d3_svg_arcOffset;
      point[0] = r * Math.cos(a);
      point[1] = r * Math.sin(a);
    }
    return points;
  }
  function d3_svg_area(projection) {
    var x0 = d3_svg_lineX,
      x1 = d3_svg_lineX,
      y0 = 0,
      y1 = d3_svg_lineY,
      defined = d3_true,
      interpolate = d3_svg_lineInterpolatorDefault,
      i0 = d3_svg_lineLinear,
      i1 = d3_svg_lineLinear,
      L = "L",
      tension = 0.7;
    function area(data) {
      var segments = [],
        points0 = [],
        points1 = [],
        i = -1,
        n = data.length,
        d,
        fx0 = d3_functor(x0),
        fy0 = d3_functor(y0),
        fx1 =
          x0 === x1
            ? function () {
                return x;
              }
            : d3_functor(x1),
        fy1 =
          y0 === y1
            ? function () {
                return y;
              }
            : d3_functor(y1),
        x,
        y;
      function segment() {
        segments.push(
          "M",
          i0(projection(points1), tension),
          L,
          i1(projection(points0.reverse()), tension),
          "Z"
        );
      }
      while (++i < n) {
        if (defined.call(this, (d = data[i]), i)) {
          points0.push([
            (x = +fx0.call(this, d, i)),
            (y = +fy0.call(this, d, i)),
          ]);
          points1.push([+fx1.call(this, d, i), +fy1.call(this, d, i)]);
        } else if (points0.length) {
          segment();
          points0 = [];
          points1 = [];
        }
      }
      if (points0.length) segment();
      return segments.length ? segments.join("") : null;
    }
    area.x = function (_) {
      if (!arguments.length) return x1;
      x0 = x1 = _;
      return area;
    };
    area.x0 = function (_) {
      if (!arguments.length) return x0;
      x0 = _;
      return area;
    };
    area.x1 = function (_) {
      if (!arguments.length) return x1;
      x1 = _;
      return area;
    };
    area.y = function (_) {
      if (!arguments.length) return y1;
      y0 = y1 = _;
      return area;
    };
    area.y0 = function (_) {
      if (!arguments.length) return y0;
      y0 = _;
      return area;
    };
    area.y1 = function (_) {
      if (!arguments.length) return y1;
      y1 = _;
      return area;
    };
    area.defined = function (_) {
      if (!arguments.length) return defined;
      defined = _;
      return area;
    };
    area.interpolate = function (_) {
      if (!arguments.length) return interpolate;
      if (!d3_svg_lineInterpolators.has((_ += "")))
        _ = d3_svg_lineInterpolatorDefault;
      i0 = d3_svg_lineInterpolators.get((interpolate = _));
      i1 = i0.reverse || i0;
      L = /-closed$/.test(_) ? "M" : "L";
      return area;
    };
    area.tension = function (_) {
      if (!arguments.length) return tension;
      tension = _;
      return area;
    };
    return area;
  }
  d3_svg_lineStepBefore.reverse = d3_svg_lineStepAfter;
  d3_svg_lineStepAfter.reverse = d3_svg_lineStepBefore;
  d3.svg.area = function () {
    return d3_svg_area(Object);
  };
  d3.svg.area.radial = function () {
    var area = d3_svg_area(d3_svg_lineRadial);
    (area.radius = area.x), delete area.x;
    (area.innerRadius = area.x0), delete area.x0;
    (area.outerRadius = area.x1), delete area.x1;
    (area.angle = area.y), delete area.y;
    (area.startAngle = area.y0), delete area.y0;
    (area.endAngle = area.y1), delete area.y1;
    return area;
  };
  d3.svg.chord = function () {
    var source = d3_svg_chordSource,
      target = d3_svg_chordTarget,
      radius = d3_svg_chordRadius,
      startAngle = d3_svg_arcStartAngle,
      endAngle = d3_svg_arcEndAngle;
    function chord(d, i) {
      var s = subgroup(this, source, d, i),
        t = subgroup(this, target, d, i);
      return (
        "M" +
        s.p0 +
        arc(s.r, s.p1, s.a1 - s.a0) +
        (equals(s, t)
          ? curve(s.r, s.p1, s.r, s.p0)
          : curve(s.r, s.p1, t.r, t.p0) +
            arc(t.r, t.p1, t.a1 - t.a0) +
            curve(t.r, t.p1, s.r, s.p0)) +
        "Z"
      );
    }
    function subgroup(self, f, d, i) {
      var subgroup = f.call(self, d, i),
        r = radius.call(self, subgroup, i),
        a0 = startAngle.call(self, subgroup, i) + d3_svg_arcOffset,
        a1 = endAngle.call(self, subgroup, i) + d3_svg_arcOffset;
      return {
        r: r,
        a0: a0,
        a1: a1,
        p0: [r * Math.cos(a0), r * Math.sin(a0)],
        p1: [r * Math.cos(a1), r * Math.sin(a1)],
      };
    }
    function equals(a, b) {
      return a.a0 == b.a0 && a.a1 == b.a1;
    }
    function arc(r, p, a) {
      return "A" + r + "," + r + " 0 " + +(a > Math.PI) + ",1 " + p;
    }
    function curve(r0, p0, r1, p1) {
      return "Q 0,0 " + p1;
    }
    chord.radius = function (v) {
      if (!arguments.length) return radius;
      radius = d3_functor(v);
      return chord;
    };
    chord.source = function (v) {
      if (!arguments.length) return source;
      source = d3_functor(v);
      return chord;
    };
    chord.target = function (v) {
      if (!arguments.length) return target;
      target = d3_functor(v);
      return chord;
    };
    chord.startAngle = function (v) {
      if (!arguments.length) return startAngle;
      startAngle = d3_functor(v);
      return chord;
    };
    chord.endAngle = function (v) {
      if (!arguments.length) return endAngle;
      endAngle = d3_functor(v);
      return chord;
    };
    return chord;
  };
  function d3_svg_chordSource(d) {
    return d.source;
  }
  function d3_svg_chordTarget(d) {
    return d.target;
  }
  function d3_svg_chordRadius(d) {
    return d.radius;
  }
  function d3_svg_chordStartAngle(d) {
    return d.startAngle;
  }
  function d3_svg_chordEndAngle(d) {
    return d.endAngle;
  }
  d3.svg.diagonal = function () {
    var source = d3_svg_chordSource,
      target = d3_svg_chordTarget,
      projection = d3_svg_diagonalProjection;
    function diagonal(d, i) {
      var p0 = source.call(this, d, i),
        p3 = target.call(this, d, i),
        m = (p0.y + p3.y) / 2,
        p = [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
      p = p.map(projection);
      return "M" + p[0] + "C" + p[1] + " " + p[2] + " " + p[3];
    }
    diagonal.source = function (x) {
      if (!arguments.length) return source;
      source = d3_functor(x);
      return diagonal;
    };
    diagonal.target = function (x) {
      if (!arguments.length) return target;
      target = d3_functor(x);
      return diagonal;
    };
    diagonal.projection = function (x) {
      if (!arguments.length) return projection;
      projection = x;
      return diagonal;
    };
    return diagonal;
  };
  function d3_svg_diagonalProjection(d) {
    return [d.x, d.y];
  }
  d3.svg.diagonal.radial = function () {
    var diagonal = d3.svg.diagonal(),
      projection = d3_svg_diagonalProjection,
      projection_ = diagonal.projection;
    diagonal.projection = function (x) {
      return arguments.length
        ? projection_(d3_svg_diagonalRadialProjection((projection = x)))
        : projection;
    };
    return diagonal;
  };
  function d3_svg_diagonalRadialProjection(projection) {
    return function () {
      var d = projection.apply(this, arguments),
        r = d[0],
        a = d[1] + d3_svg_arcOffset;
      return [r * Math.cos(a), r * Math.sin(a)];
    };
  }
  d3.svg.mouse = d3.mouse;
  d3.svg.touches = d3.touches;
  d3.svg.symbol = function () {
    var type = d3_svg_symbolType,
      size = d3_svg_symbolSize;
    function symbol(d, i) {
      return (d3_svg_symbols.get(type.call(this, d, i)) || d3_svg_symbolCircle)(
        size.call(this, d, i)
      );
    }
    symbol.type = function (x) {
      if (!arguments.length) return type;
      type = d3_functor(x);
      return symbol;
    };
    symbol.size = function (x) {
      if (!arguments.length) return size;
      size = d3_functor(x);
      return symbol;
    };
    return symbol;
  };
  function d3_svg_symbolSize() {
    return 64;
  }
  function d3_svg_symbolType() {
    return "circle";
  }
  function d3_svg_symbolCircle(size) {
    var r = Math.sqrt(size / Math.PI);
    return (
      "M0," +
      r +
      "A" +
      r +
      "," +
      r +
      " 0 1,1 0," +
      -r +
      "A" +
      r +
      "," +
      r +
      " 0 1,1 0," +
      r +
      "Z"
    );
  }
  var d3_svg_symbols = d3.map({
    circle: d3_svg_symbolCircle,
    cross: function (size) {
      var r = Math.sqrt(size / 5) / 2;
      return (
        "M" +
        -3 * r +
        "," +
        -r +
        "H" +
        -r +
        "V" +
        -3 * r +
        "H" +
        r +
        "V" +
        -r +
        "H" +
        3 * r +
        "V" +
        r +
        "H" +
        r +
        "V" +
        3 * r +
        "H" +
        -r +
        "V" +
        r +
        "H" +
        -3 * r +
        "Z"
      );
    },
    diamond: function (size) {
      var ry = Math.sqrt(size / (2 * d3_svg_symbolTan30)),
        rx = ry * d3_svg_symbolTan30;
      return (
        "M0," + -ry + "L" + rx + ",0" + " 0," + ry + " " + -rx + ",0" + "Z"
      );
    },
    square: function (size) {
      var r = Math.sqrt(size) / 2;
      return (
        "M" +
        -r +
        "," +
        -r +
        "L" +
        r +
        "," +
        -r +
        " " +
        r +
        "," +
        r +
        " " +
        -r +
        "," +
        r +
        "Z"
      );
    },
    "triangle-down": function (size) {
      var rx = Math.sqrt(size / d3_svg_symbolSqrt3),
        ry = (rx * d3_svg_symbolSqrt3) / 2;
      return "M0," + ry + "L" + rx + "," + -ry + " " + -rx + "," + -ry + "Z";
    },
    "triangle-up": function (size) {
      var rx = Math.sqrt(size / d3_svg_symbolSqrt3),
        ry = (rx * d3_svg_symbolSqrt3) / 2;
      return "M0," + -ry + "L" + rx + "," + ry + " " + -rx + "," + ry + "Z";
    },
  });
  d3.svg.symbolTypes = d3_svg_symbols.keys();
  var d3_svg_symbolSqrt3 = Math.sqrt(3),
    d3_svg_symbolTan30 = Math.tan((30 * Math.PI) / 180);
  d3.svg.axis = function () {
    var scale = d3.scale.linear(),
      orient = "bottom",
      tickMajorSize = 6,
      tickMinorSize = 6,
      tickEndSize = 6,
      tickPadding = 3,
      tickArguments_ = [10],
      tickValues = null,
      tickFormat_,
      tickSubdivide = 0;
    function axis(g) {
      g.each(function () {
        var g = d3.select(this);
        var ticks =
            tickValues == null
              ? scale.ticks
                ? scale.ticks.apply(scale, tickArguments_)
                : scale.domain()
              : tickValues,
          tickFormat =
            tickFormat_ == null
              ? scale.tickFormat
                ? scale.tickFormat.apply(scale, tickArguments_)
                : String
              : tickFormat_;
        var subticks = d3_svg_axisSubdivide(scale, ticks, tickSubdivide),
          subtick = g.selectAll(".minor").data(subticks, String),
          subtickEnter = subtick
            .enter()
            .insert("line", "g")
            .attr("class", "tick minor")
            .style("opacity", 1e-6),
          subtickExit = d3
            .transition(subtick.exit())
            .style("opacity", 1e-6)
            .remove(),
          subtickUpdate = d3.transition(subtick).style("opacity", 1);
        var tick = g.selectAll("g").data(ticks, String),
          tickEnter = tick.enter().insert("g", "path").style("opacity", 1e-6),
          tickExit = d3.transition(tick.exit()).style("opacity", 1e-6).remove(),
          tickUpdate = d3.transition(tick).style("opacity", 1),
          tickTransform;
        var range = d3_scaleRange(scale),
          path = g.selectAll(".domain").data([0]),
          pathEnter = path.enter().append("path").attr("class", "domain"),
          pathUpdate = d3.transition(path);
        var scale1 = scale.copy(),
          scale0 = this.__chart__ || scale1;
        this.__chart__ = scale1;
        tickEnter.append("line").attr("class", "tick");
        tickEnter.append("text");
        var lineEnter = tickEnter.select("line"),
          lineUpdate = tickUpdate.select("line"),
          text = tick.select("text").text(tickFormat),
          textEnter = tickEnter.select("text"),
          textUpdate = tickUpdate.select("text");
        switch (orient) {
          case "bottom": {
            tickTransform = d3_svg_axisX;
            subtickEnter.attr("y2", tickMinorSize);
            subtickUpdate.attr("x2", 0).attr("y2", tickMinorSize);
            lineEnter.attr("y2", tickMajorSize);
            textEnter.attr("y", Math.max(tickMajorSize, 0) + tickPadding);
            lineUpdate.attr("x2", 0).attr("y2", tickMajorSize);
            textUpdate
              .attr("x", 0)
              .attr("y", Math.max(tickMajorSize, 0) + tickPadding);
            text.attr("dy", ".71em").attr("text-anchor", "middle");
            pathUpdate.attr(
              "d",
              "M" +
                range[0] +
                "," +
                tickEndSize +
                "V0H" +
                range[1] +
                "V" +
                tickEndSize
            );
            break;
          }
          case "top": {
            tickTransform = d3_svg_axisX;
            subtickEnter.attr("y2", -tickMinorSize);
            subtickUpdate.attr("x2", 0).attr("y2", -tickMinorSize);
            lineEnter.attr("y2", -tickMajorSize);
            textEnter.attr("y", -(Math.max(tickMajorSize, 0) + tickPadding));
            lineUpdate.attr("x2", 0).attr("y2", -tickMajorSize);
            textUpdate
              .attr("x", 0)
              .attr("y", -(Math.max(tickMajorSize, 0) + tickPadding));
            text.attr("dy", "0em").attr("text-anchor", "middle");
            pathUpdate.attr(
              "d",
              "M" +
                range[0] +
                "," +
                -tickEndSize +
                "V0H" +
                range[1] +
                "V" +
                -tickEndSize
            );
            break;
          }
          case "left": {
            tickTransform = d3_svg_axisY;
            subtickEnter.attr("x2", -tickMinorSize);
            subtickUpdate.attr("x2", -tickMinorSize).attr("y2", 0);
            lineEnter.attr("x2", -tickMajorSize);
            textEnter.attr("x", -(Math.max(tickMajorSize, 0) + tickPadding));
            lineUpdate.attr("x2", -tickMajorSize).attr("y2", 0);
            textUpdate
              .attr("x", -(Math.max(tickMajorSize, 0) + tickPadding))
              .attr("y", 0);
            text.attr("dy", ".32em").attr("text-anchor", "end");
            pathUpdate.attr(
              "d",
              "M" +
                -tickEndSize +
                "," +
                range[0] +
                "H0V" +
                range[1] +
                "H" +
                -tickEndSize
            );
            break;
          }
          case "right": {
            tickTransform = d3_svg_axisY;
            subtickEnter.attr("x2", tickMinorSize);
            subtickUpdate.attr("x2", tickMinorSize).attr("y2", 0);
            lineEnter.attr("x2", tickMajorSize);
            textEnter.attr("x", Math.max(tickMajorSize, 0) + tickPadding);
            lineUpdate.attr("x2", tickMajorSize).attr("y2", 0);
            textUpdate
              .attr("x", Math.max(tickMajorSize, 0) + tickPadding)
              .attr("y", 0);
            text.attr("dy", ".32em").attr("text-anchor", "start");
            pathUpdate.attr(
              "d",
              "M" +
                tickEndSize +
                "," +
                range[0] +
                "H0V" +
                range[1] +
                "H" +
                tickEndSize
            );
            break;
          }
        }
        if (scale.ticks) {
          tickEnter.call(tickTransform, scale0);
          tickUpdate.call(tickTransform, scale1);
          tickExit.call(tickTransform, scale1);
          subtickEnter.call(tickTransform, scale0);
          subtickUpdate.call(tickTransform, scale1);
          subtickExit.call(tickTransform, scale1);
        } else {
          var dx = scale1.rangeBand() / 2,
            x = function (d) {
              return scale1(d) + dx;
            };
          tickEnter.call(tickTransform, x);
          tickUpdate.call(tickTransform, x);
        }
      });
    }
    axis.scale = function (x) {
      if (!arguments.length) return scale;
      scale = x;
      return axis;
    };
    axis.orient = function (x) {
      if (!arguments.length) return orient;
      orient = x;
      return axis;
    };
    axis.ticks = function () {
      if (!arguments.length) return tickArguments_;
      tickArguments_ = arguments;
      return axis;
    };
    axis.tickValues = function (x) {
      if (!arguments.length) return tickValues;
      tickValues = x;
      return axis;
    };
    axis.tickFormat = function (x) {
      if (!arguments.length) return tickFormat_;
      tickFormat_ = x;
      return axis;
    };
    axis.tickSize = function (x, y, z) {
      if (!arguments.length) return tickMajorSize;
      var n = arguments.length - 1;
      tickMajorSize = +x;
      tickMinorSize = n > 1 ? +y : tickMajorSize;
      tickEndSize = n > 0 ? +arguments[n] : tickMajorSize;
      return axis;
    };
    axis.tickPadding = function (x) {
      if (!arguments.length) return tickPadding;
      tickPadding = +x;
      return axis;
    };
    axis.tickSubdivide = function (x) {
      if (!arguments.length) return tickSubdivide;
      tickSubdivide = +x;
      return axis;
    };
    return axis;
  };
  function d3_svg_axisX(selection, x) {
    selection.attr("transform", function (d) {
      return "translate(" + x(d) + ",0)";
    });
  }
  function d3_svg_axisY(selection, y) {
    selection.attr("transform", function (d) {
      return "translate(0," + y(d) + ")";
    });
  }
  function d3_svg_axisSubdivide(scale, ticks, m) {
    subticks = [];
    if (m && ticks.length > 1) {
      var extent = d3_scaleExtent(scale.domain()),
        subticks,
        i = -1,
        n = ticks.length,
        d = (ticks[1] - ticks[0]) / ++m,
        j,
        v;
      while (++i < n) {
        for (j = m; --j > 0; ) {
          if ((v = +ticks[i] - j * d) >= extent[0]) {
            subticks.push(v);
          }
        }
      }
      for (--i, j = 0; ++j < m && (v = +ticks[i] + j * d) < extent[1]; ) {
        subticks.push(v);
      }
    }
    return subticks;
  }
  d3.svg.brush = function () {
    var event = d3_eventDispatch(brush, "brushstart", "brush", "brushend"),
      x = null,
      y = null,
      resizes = d3_svg_brushResizes[0],
      extent = [
        [0, 0],
        [0, 0],
      ],
      extentDomain;
    function brush(g) {
      g.each(function () {
        var g = d3.select(this),
          bg = g.selectAll(".background").data([0]),
          fg = g.selectAll(".extent").data([0]),
          tz = g.selectAll(".resize").data(resizes, String),
          e;
        g.style("pointer-events", "all")
          .on("mousedown.brush", brushstart)
          .on("touchstart.brush", brushstart);
        bg.enter()
          .append("rect")
          .attr("class", "background")
          .style("visibility", "hidden")
          .style("cursor", "crosshair");
        fg.enter()
          .append("rect")
          .attr("class", "extent")
          .style("cursor", "move");
        tz.enter()
          .append("g")
          .attr("class", function (d) {
            return "resize " + d;
          })
          .style("cursor", function (d) {
            return d3_svg_brushCursor[d];
          })
          .append("rect")
          .attr("x", function (d) {
            return /[ew]$/.test(d) ? -3 : null;
          })
          .attr("y", function (d) {
            return /^[ns]/.test(d) ? -3 : null;
          })
          .attr("width", 6)
          .attr("height", 6)
          .style("visibility", "hidden");
        tz.style("display", brush.empty() ? "none" : null);
        tz.exit().remove();
        if (x) {
          e = d3_scaleRange(x);
          bg.attr("x", e[0]).attr("width", e[1] - e[0]);
          redrawX(g);
        }
        if (y) {
          e = d3_scaleRange(y);
          bg.attr("y", e[0]).attr("height", e[1] - e[0]);
          redrawY(g);
        }
        redraw(g);
      });
    }
    function redraw(g) {
      g.selectAll(".resize").attr("transform", function (d) {
        return (
          "translate(" +
          extent[+/e$/.test(d)][0] +
          "," +
          extent[+/^s/.test(d)][1] +
          ")"
        );
      });
    }
    function redrawX(g) {
      g.select(".extent").attr("x", extent[0][0]);
      g.selectAll(".extent,.n>rect,.s>rect").attr(
        "width",
        extent[1][0] - extent[0][0]
      );
    }
    function redrawY(g) {
      g.select(".extent").attr("y", extent[0][1]);
      g.selectAll(".extent,.e>rect,.w>rect").attr(
        "height",
        extent[1][1] - extent[0][1]
      );
    }
    function brushstart() {
      var target = this,
        eventTarget = d3.select(d3.event.target),
        event_ = event.of(target, arguments),
        g = d3.select(target),
        resizing = eventTarget.datum(),
        resizingX = !/^(n|s)$/.test(resizing) && x,
        resizingY = !/^(e|w)$/.test(resizing) && y,
        dragging = eventTarget.classed("extent"),
        center,
        origin = mouse(),
        offset;
      var w = d3
        .select(window)
        .on("mousemove.brush", brushmove)
        .on("mouseup.brush", brushend)
        .on("touchmove.brush", brushmove)
        .on("touchend.brush", brushend)
        .on("keydown.brush", keydown)
        .on("keyup.brush", keyup);
      if (dragging) {
        origin[0] = extent[0][0] - origin[0];
        origin[1] = extent[0][1] - origin[1];
      } else if (resizing) {
        var ex = +/w$/.test(resizing),
          ey = +/^n/.test(resizing);
        offset = [extent[1 - ex][0] - origin[0], extent[1 - ey][1] - origin[1]];
        origin[0] = extent[ex][0];
        origin[1] = extent[ey][1];
      } else if (d3.event.altKey) center = origin.slice();
      g.style("pointer-events", "none")
        .selectAll(".resize")
        .style("display", null);
      d3.select("body").style("cursor", eventTarget.style("cursor"));
      event_({ type: "brushstart" });
      brushmove();
      d3_eventCancel();
      function mouse() {
        var touches = d3.event.changedTouches;
        return touches ? d3.touches(target, touches)[0] : d3.mouse(target);
      }
      function keydown() {
        if (d3.event.keyCode == 32) {
          if (!dragging) {
            center = null;
            origin[0] -= extent[1][0];
            origin[1] -= extent[1][1];
            dragging = 2;
          }
          d3_eventCancel();
        }
      }
      function keyup() {
        if (d3.event.keyCode == 32 && dragging == 2) {
          origin[0] += extent[1][0];
          origin[1] += extent[1][1];
          dragging = 0;
          d3_eventCancel();
        }
      }
      function brushmove() {
        var point = mouse(),
          moved = false;
        if (offset) {
          point[0] += offset[0];
          point[1] += offset[1];
        }
        if (!dragging) {
          if (d3.event.altKey) {
            if (!center)
              center = [
                (extent[0][0] + extent[1][0]) / 2,
                (extent[0][1] + extent[1][1]) / 2,
              ];
            origin[0] = extent[+(point[0] < center[0])][0];
            origin[1] = extent[+(point[1] < center[1])][1];
          } else center = null;
        }
        if (resizingX && move1(point, x, 0)) {
          redrawX(g);
          moved = true;
        }
        if (resizingY && move1(point, y, 1)) {
          redrawY(g);
          moved = true;
        }
        if (moved) {
          redraw(g);
          event_({ type: "brush", mode: dragging ? "move" : "resize" });
        }
      }
      function move1(point, scale, i) {
        var range = d3_scaleRange(scale),
          r0 = range[0],
          r1 = range[1],
          position = origin[i],
          size = extent[1][i] - extent[0][i],
          min,
          max;
        if (dragging) {
          r0 -= position;
          r1 -= size + position;
        }
        min = Math.max(r0, Math.min(r1, point[i]));
        if (dragging) {
          max = (min += position) + size;
        } else {
          if (center)
            position = Math.max(r0, Math.min(r1, 2 * center[i] - min));
          if (position < min) {
            max = min;
            min = position;
          } else {
            max = position;
          }
        }
        if (extent[0][i] !== min || extent[1][i] !== max) {
          extentDomain = null;
          extent[0][i] = min;
          extent[1][i] = max;
          return true;
        }
      }
      function brushend() {
        brushmove();
        g.style("pointer-events", "all")
          .selectAll(".resize")
          .style("display", brush.empty() ? "none" : null);
        d3.select("body").style("cursor", null);
        w.on("mousemove.brush", null)
          .on("mouseup.brush", null)
          .on("touchmove.brush", null)
          .on("touchend.brush", null)
          .on("keydown.brush", null)
          .on("keyup.brush", null);
        event_({ type: "brushend" });
        d3_eventCancel();
      }
    }
    brush.x = function (z) {
      if (!arguments.length) return x;
      x = z;
      resizes = d3_svg_brushResizes[(!x << 1) | !y];
      return brush;
    };
    brush.y = function (z) {
      if (!arguments.length) return y;
      y = z;
      resizes = d3_svg_brushResizes[(!x << 1) | !y];
      return brush;
    };
    brush.extent = function (z) {
      var x0, x1, y0, y1, t;
      if (!arguments.length) {
        z = extentDomain || extent;
        if (x) {
          (x0 = z[0][0]), (x1 = z[1][0]);
          if (!extentDomain) {
            (x0 = extent[0][0]), (x1 = extent[1][0]);
            if (x.invert) (x0 = x.invert(x0)), (x1 = x.invert(x1));
            if (x1 < x0) (t = x0), (x0 = x1), (x1 = t);
          }
        }
        if (y) {
          (y0 = z[0][1]), (y1 = z[1][1]);
          if (!extentDomain) {
            (y0 = extent[0][1]), (y1 = extent[1][1]);
            if (y.invert) (y0 = y.invert(y0)), (y1 = y.invert(y1));
            if (y1 < y0) (t = y0), (y0 = y1), (y1 = t);
          }
        }
        return x && y
          ? [
              [x0, y0],
              [x1, y1],
            ]
          : x
          ? [x0, x1]
          : y && [y0, y1];
      }
      extentDomain = [
        [0, 0],
        [0, 0],
      ];
      if (x) {
        (x0 = z[0]), (x1 = z[1]);
        if (y) (x0 = x0[0]), (x1 = x1[0]);
        (extentDomain[0][0] = x0), (extentDomain[1][0] = x1);
        if (x.invert) (x0 = x(x0)), (x1 = x(x1));
        if (x1 < x0) (t = x0), (x0 = x1), (x1 = t);
        (extent[0][0] = x0 | 0), (extent[1][0] = x1 | 0);
      }
      if (y) {
        (y0 = z[0]), (y1 = z[1]);
        if (x) (y0 = y0[1]), (y1 = y1[1]);
        (extentDomain[0][1] = y0), (extentDomain[1][1] = y1);
        if (y.invert) (y0 = y(y0)), (y1 = y(y1));
        if (y1 < y0) (t = y0), (y0 = y1), (y1 = t);
        (extent[0][1] = y0 | 0), (extent[1][1] = y1 | 0);
      }
      return brush;
    };
    brush.clear = function () {
      extentDomain = null;
      extent[0][0] = extent[0][1] = extent[1][0] = extent[1][1] = 0;
      return brush;
    };
    brush.empty = function () {
      return (
        (x && extent[0][0] === extent[1][0]) ||
        (y && extent[0][1] === extent[1][1])
      );
    };
    return d3.rebind(brush, event, "on");
  };
  var d3_svg_brushCursor = {
    n: "ns-resize",
    e: "ew-resize",
    s: "ns-resize",
    w: "ew-resize",
    nw: "nwse-resize",
    ne: "nesw-resize",
    se: "nwse-resize",
    sw: "nesw-resize",
  };
  var d3_svg_brushResizes = [
    ["n", "e", "s", "w", "nw", "ne", "se", "sw"],
    ["e", "w"],
    ["n", "s"],
    [],
  ];
  d3.behavior = {};
  d3.behavior.drag = function () {
    var event = d3_eventDispatch(drag, "drag", "dragstart", "dragend"),
      origin = null;
    function drag() {
      this.on("mousedown.drag", mousedown).on("touchstart.drag", mousedown);
    }
    function mousedown() {
      var target = this,
        event_ = event.of(target, arguments),
        eventTarget = d3.event.target,
        offset,
        origin_ = point(),
        moved = 0;
      var w = d3
        .select(window)
        .on("mousemove.drag", dragmove)
        .on("touchmove.drag", dragmove)
        .on("mouseup.drag", dragend, true)
        .on("touchend.drag", dragend, true);
      if (origin) {
        offset = origin.apply(target, arguments);
        offset = [offset.x - origin_[0], offset.y - origin_[1]];
      } else {
        offset = [0, 0];
      }
      d3_eventCancel();
      event_({ type: "dragstart" });
      function point() {
        var p = target.parentNode,
          t = d3.event.changedTouches;
        return t ? d3.touches(p, t)[0] : d3.mouse(p);
      }
      function dragmove() {
        if (!target.parentNode) return dragend();
        var p = point(),
          dx = p[0] - origin_[0],
          dy = p[1] - origin_[1];
        moved |= dx | dy;
        origin_ = p;
        d3_eventCancel();
        event_({
          type: "drag",
          x: p[0] + offset[0],
          y: p[1] + offset[1],
          dx: dx,
          dy: dy,
        });
      }
      function dragend() {
        event_({ type: "dragend" });
        if (moved) {
          d3_eventCancel();
          if (d3.event.target === eventTarget) w.on("click.drag", click, true);
        }
        w.on("mousemove.drag", null)
          .on("touchmove.drag", null)
          .on("mouseup.drag", null)
          .on("touchend.drag", null);
      }
      function click() {
        d3_eventCancel();
        w.on("click.drag", null);
      }
    }
    drag.origin = function (x) {
      if (!arguments.length) return origin;
      origin = x;
      return drag;
    };
    return d3.rebind(drag, event, "on");
  };
  d3.behavior.zoom = function () {
    var translate = [0, 0],
      translate0,
      scale = 1,
      scale0,
      scaleExtent = d3_behavior_zoomInfinity,
      event = d3_eventDispatch(zoom, "zoom"),
      x0,
      x1,
      y0,
      y1,
      touchtime;
    function zoom() {
      this.on("mousedown.zoom", mousedown)
        .on("mousewheel.zoom", mousewheel)
        .on("mousemove.zoom", mousemove)
        .on("DOMMouseScroll.zoom", mousewheel)
        .on("dblclick.zoom", dblclick)
        .on("touchstart.zoom", touchstart)
        .on("touchmove.zoom", touchmove)
        .on("touchend.zoom", touchstart);
    }
    zoom.translate = function (x) {
      if (!arguments.length) return translate;
      translate = x.map(Number);
      return zoom;
    };
    zoom.scale = function (x) {
      if (!arguments.length) return scale;
      scale = +x;
      return zoom;
    };
    zoom.scaleExtent = function (x) {
      if (!arguments.length) return scaleExtent;
      scaleExtent = x == null ? d3_behavior_zoomInfinity : x.map(Number);
      return zoom;
    };
    zoom.x = function (z) {
      if (!arguments.length) return x1;
      x1 = z;
      x0 = z.copy();
      return zoom;
    };
    zoom.y = function (z) {
      if (!arguments.length) return y1;
      y1 = z;
      y0 = z.copy();
      return zoom;
    };
    function location(p) {
      return [(p[0] - translate[0]) / scale, (p[1] - translate[1]) / scale];
    }
    function point(l) {
      return [l[0] * scale + translate[0], l[1] * scale + translate[1]];
    }
    function scaleTo(s) {
      scale = Math.max(scaleExtent[0], Math.min(scaleExtent[1], s));
    }
    function translateTo(p, l) {
      l = point(l);
      translate[0] += p[0] - l[0];
      translate[1] += p[1] - l[1];
    }
    function dispatch(event) {
      if (x1)
        x1.domain(
          x0
            .range()
            .map(function (x) {
              return (x - translate[0]) / scale;
            })
            .map(x0.invert)
        );
      if (y1)
        y1.domain(
          y0
            .range()
            .map(function (y) {
              return (y - translate[1]) / scale;
            })
            .map(y0.invert)
        );
      d3.event.preventDefault();
      event({ type: "zoom", scale: scale, translate: translate });
    }
    function mousedown() {
      var target = this,
        event_ = event.of(target, arguments),
        eventTarget = d3.event.target,
        moved = 0,
        w = d3
          .select(window)
          .on("mousemove.zoom", mousemove)
          .on("mouseup.zoom", mouseup),
        l = location(d3.mouse(target));
      window.focus();
      d3_eventCancel();
      function mousemove() {
        moved = 1;
        translateTo(d3.mouse(target), l);
        dispatch(event_);
      }
      function mouseup() {
        if (moved) d3_eventCancel();
        w.on("mousemove.zoom", null).on("mouseup.zoom", null);
        if (moved && d3.event.target === eventTarget)
          w.on("click.zoom", click, true);
      }
      function click() {
        d3_eventCancel();
        w.on("click.zoom", null);
      }
    }
    function mousewheel() {
      if (!translate0) translate0 = location(d3.mouse(this));
      scaleTo(Math.pow(2, d3_behavior_zoomDelta() * 0.002) * scale);
      translateTo(d3.mouse(this), translate0);
      dispatch(event.of(this, arguments));
    }
    function mousemove() {
      translate0 = null;
    }
    function dblclick() {
      var p = d3.mouse(this),
        l = location(p);
      scaleTo(d3.event.shiftKey ? scale / 2 : scale * 2);
      translateTo(p, l);
      dispatch(event.of(this, arguments));
    }
    function touchstart() {
      var touches = d3.touches(this),
        now = Date.now();
      scale0 = scale;
      translate0 = {};
      touches.forEach(function (t) {
        translate0[t.identifier] = location(t);
      });
      d3_eventCancel();
      if (touches.length === 1 && now - touchtime < 500) {
        var p = touches[0],
          l = location(touches[0]);
        scaleTo(scale * 2);
        translateTo(p, l);
        dispatch(event.of(this, arguments));
      }
      touchtime = now;
    }
    function touchmove() {
      var touches = d3.touches(this),
        p0 = touches[0],
        l0 = translate0[p0.identifier];
      if ((p1 = touches[1])) {
        var p1,
          l1 = translate0[p1.identifier];
        p0 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        l0 = [(l0[0] + l1[0]) / 2, (l0[1] + l1[1]) / 2];
        scaleTo(d3.event.scale * scale0);
      }
      translateTo(p0, l0);
      dispatch(event.of(this, arguments));
    }
    return d3.rebind(zoom, event, "on");
  };
  var d3_behavior_zoomDiv,
    d3_behavior_zoomInfinity = [0, Infinity];
  function d3_behavior_zoomDelta() {
    if (!d3_behavior_zoomDiv) {
      d3_behavior_zoomDiv = d3
        .select("body")
        .append("div")
        .style("visibility", "hidden")
        .style("top", 0)
        .style("height", 0)
        .style("width", 0)
        .style("overflow-y", "scroll")
        .append("div")
        .style("height", "2000px")
        .node().parentNode;
    }
    var e = d3.event,
      delta;
    try {
      d3_behavior_zoomDiv.scrollTop = 1000;
      d3_behavior_zoomDiv.dispatchEvent(e);
      delta = 1000 - d3_behavior_zoomDiv.scrollTop;
    } catch (error) {
      delta = e.wheelDelta || -e.detail * 5;
    }
    return delta;
  }
  d3.layout = {};
  d3.layout.bundle = function () {
    return function (links) {
      var paths = [],
        i = -1,
        n = links.length;
      while (++i < n) paths.push(d3_layout_bundlePath(links[i]));
      return paths;
    };
  };
  function d3_layout_bundlePath(link) {
    var start = link.source,
      end = link.target,
      lca = d3_layout_bundleLeastCommonAncestor(start, end),
      points = [start];
    while (start !== lca) {
      start = start.parent;
      points.push(start);
    }
    var k = points.length;
    while (end !== lca) {
      points.splice(k, 0, end);
      end = end.parent;
    }
    return points;
  }
  function d3_layout_bundleAncestors(node) {
    var ancestors = [],
      parent = node.parent;
    while (parent != null) {
      ancestors.push(node);
      node = parent;
      parent = parent.parent;
    }
    ancestors.push(node);
    return ancestors;
  }
  function d3_layout_bundleLeastCommonAncestor(a, b) {
    if (a === b) return a;
    var aNodes = d3_layout_bundleAncestors(a),
      bNodes = d3_layout_bundleAncestors(b),
      aNode = aNodes.pop(),
      bNode = bNodes.pop(),
      sharedNode = null;
    while (aNode === bNode) {
      sharedNode = aNode;
      aNode = aNodes.pop();
      bNode = bNodes.pop();
    }
    return sharedNode;
  }
  d3.layout.chord = function () {
    var chord = {},
      chords,
      groups,
      matrix,
      n,
      padding = 0,
      sortGroups,
      sortSubgroups,
      sortChords;
    function relayout() {
      var subgroups = {},
        groupSums = [],
        groupIndex = d3.range(n),
        subgroupIndex = [],
        k,
        x,
        x0,
        i,
        j;
      chords = [];
      groups = [];
      (k = 0), (i = -1);
      while (++i < n) {
        (x = 0), (j = -1);
        while (++j < n) {
          x += matrix[i][j];
        }
        groupSums.push(x);
        subgroupIndex.push(d3.range(n));
        k += x;
      }
      if (sortGroups) {
        groupIndex.sort(function (a, b) {
          return sortGroups(groupSums[a], groupSums[b]);
        });
      }
      if (sortSubgroups) {
        subgroupIndex.forEach(function (d, i) {
          d.sort(function (a, b) {
            return sortSubgroups(matrix[i][a], matrix[i][b]);
          });
        });
      }
      k = (2 * Math.PI - padding * n) / k;
      (x = 0), (i = -1);
      while (++i < n) {
        (x0 = x), (j = -1);
        while (++j < n) {
          var di = groupIndex[i],
            dj = subgroupIndex[di][j],
            v = matrix[di][dj],
            a0 = x,
            a1 = (x += v * k);
          subgroups[di + "-" + dj] = {
            index: di,
            subindex: dj,
            startAngle: a0,
            endAngle: a1,
            value: v,
          };
        }
        groups[di] = {
          index: di,
          startAngle: x0,
          endAngle: x,
          value: (x - x0) / k,
        };
        x += padding;
      }
      i = -1;
      while (++i < n) {
        j = i - 1;
        while (++j < n) {
          var source = subgroups[i + "-" + j],
            target = subgroups[j + "-" + i];
          if (source.value || target.value) {
            chords.push(
              source.value < target.value
                ? { source: target, target: source }
                : { source: source, target: target }
            );
          }
        }
      }
      if (sortChords) resort();
    }
    function resort() {
      chords.sort(function (a, b) {
        return sortChords(
          (a.source.value + a.target.value) / 2,
          (b.source.value + b.target.value) / 2
        );
      });
    }
    chord.matrix = function (x) {
      if (!arguments.length) return matrix;
      n = (matrix = x) && matrix.length;
      chords = groups = null;
      return chord;
    };
    chord.padding = function (x) {
      if (!arguments.length) return padding;
      padding = x;
      chords = groups = null;
      return chord;
    };
    chord.sortGroups = function (x) {
      if (!arguments.length) return sortGroups;
      sortGroups = x;
      chords = groups = null;
      return chord;
    };
    chord.sortSubgroups = function (x) {
      if (!arguments.length) return sortSubgroups;
      sortSubgroups = x;
      chords = null;
      return chord;
    };
    chord.sortChords = function (x) {
      if (!arguments.length) return sortChords;
      sortChords = x;
      if (chords) resort();
      return chord;
    };
    chord.chords = function () {
      if (!chords) relayout();
      return chords;
    };
    chord.groups = function () {
      if (!groups) relayout();
      return groups;
    };
    return chord;
  };
  d3.layout.force = function () {
    var force = {},
      event = d3.dispatch("start", "tick", "end"),
      size = [1, 1],
      drag,
      alpha,
      friction = 0.9,
      linkDistance = d3_layout_forceLinkDistance,
      linkStrength = d3_layout_forceLinkStrength,
      charge = -30,
      gravity = 0.1,
      theta = 0.8,
      interval,
      nodes = [],
      links = [],
      distances,
      strengths,
      charges;
    function repulse(node) {
      return function (quad, x1, y1, x2, y2) {
        if (quad.point !== node) {
          var dx = quad.cx - node.x,
            dy = quad.cy - node.y,
            dn = 1 / Math.sqrt(dx * dx + dy * dy);
          if ((x2 - x1) * dn < theta) {
            var k = quad.charge * dn * dn;
            node.px -= dx * k;
            node.py -= dy * k;
            return true;
          }
          if (quad.point && isFinite(dn)) {
            var k = quad.pointCharge * dn * dn;
            node.px -= dx * k;
            node.py -= dy * k;
          }
        }
        return !quad.charge;
      };
    }
    force.tick = function () {
      if ((alpha *= 0.99) < 0.005) {
        event.end({ type: "end", alpha: (alpha = 0) });
        return true;
      }
      var n = nodes.length,
        m = links.length,
        q,
        i,
        o,
        s,
        t,
        l,
        k,
        x,
        y;
      for (i = 0; i < m; ++i) {
        o = links[i];
        s = o.source;
        t = o.target;
        x = t.x - s.x;
        y = t.y - s.y;
        if ((l = x * x + y * y)) {
          l = (alpha * strengths[i] * ((l = Math.sqrt(l)) - distances[i])) / l;
          x *= l;
          y *= l;
          t.x -= x * (k = s.weight / (t.weight + s.weight));
          t.y -= y * k;
          s.x += x * (k = 1 - k);
          s.y += y * k;
        }
      }
      if ((k = alpha * gravity)) {
        x = size[0] / 2;
        y = size[1] / 2;
        i = -1;
        if (k)
          while (++i < n) {
            o = nodes[i];
            o.x += (x - o.x) * k;
            o.y += (y - o.y) * k;
          }
      }
      if (charge) {
        d3_layout_forceAccumulate(
          (q = d3.geom.quadtree(nodes)),
          alpha,
          charges
        );
        i = -1;
        while (++i < n) {
          if (!(o = nodes[i]).fixed) {
            q.visit(repulse(o));
          }
        }
      }
      i = -1;
      while (++i < n) {
        o = nodes[i];
        if (o.fixed) {
          o.x = o.px;
          o.y = o.py;
        } else {
          o.x -= (o.px - (o.px = o.x)) * friction;
          o.y -= (o.py - (o.py = o.y)) * friction;
        }
      }
      event.tick({ type: "tick", alpha: alpha });
    };
    force.nodes = function (x) {
      if (!arguments.length) return nodes;
      nodes = x;
      return force;
    };
    force.links = function (x) {
      if (!arguments.length) return links;
      links = x;
      return force;
    };
    force.size = function (x) {
      if (!arguments.length) return size;
      size = x;
      return force;
    };
    force.linkDistance = function (x) {
      if (!arguments.length) return linkDistance;
      linkDistance = d3_functor(x);
      return force;
    };
    force.distance = force.linkDistance;
    force.linkStrength = function (x) {
      if (!arguments.length) return linkStrength;
      linkStrength = d3_functor(x);
      return force;
    };
    force.friction = function (x) {
      if (!arguments.length) return friction;
      friction = x;
      return force;
    };
    force.charge = function (x) {
      if (!arguments.length) return charge;
      charge = typeof x === "function" ? x : +x;
      return force;
    };
    force.gravity = function (x) {
      if (!arguments.length) return gravity;
      gravity = x;
      return force;
    };
    force.theta = function (x) {
      if (!arguments.length) return theta;
      theta = x;
      return force;
    };
    force.alpha = function (x) {
      if (!arguments.length) return alpha;
      if (alpha) {
        if (x > 0) alpha = x;
        else alpha = 0;
      } else if (x > 0) {
        event.start({ type: "start", alpha: (alpha = x) });
        d3.timer(force.tick);
      }
      return force;
    };
    force.start = function () {
      var i,
        j,
        n = nodes.length,
        m = links.length,
        w = size[0],
        h = size[1],
        neighbors,
        o;
      for (i = 0; i < n; ++i) {
        (o = nodes[i]).index = i;
        o.weight = 0;
      }
      distances = [];
      strengths = [];
      for (i = 0; i < m; ++i) {
        o = links[i];
        if (typeof o.source == "number") o.source = nodes[o.source];
        if (typeof o.target == "number") o.target = nodes[o.target];
        distances[i] = linkDistance.call(this, o, i);
        strengths[i] = linkStrength.call(this, o, i);
        ++o.source.weight;
        ++o.target.weight;
      }
      for (i = 0; i < n; ++i) {
        o = nodes[i];
        if (isNaN(o.x)) o.x = position("x", w);
        if (isNaN(o.y)) o.y = position("y", h);
        if (isNaN(o.px)) o.px = o.x;
        if (isNaN(o.py)) o.py = o.y;
      }
      charges = [];
      if (typeof charge === "function") {
        for (i = 0; i < n; ++i) {
          charges[i] = +charge.call(this, nodes[i], i);
        }
      } else {
        for (i = 0; i < n; ++i) {
          charges[i] = charge;
        }
      }
      function position(dimension, size) {
        var neighbors = neighbor(i),
          j = -1,
          m = neighbors.length,
          x;
        while (++j < m) if (!isNaN((x = neighbors[j][dimension]))) return x;
        return Math.random() * size;
      }
      function neighbor() {
        if (!neighbors) {
          neighbors = [];
          for (j = 0; j < n; ++j) {
            neighbors[j] = [];
          }
          for (j = 0; j < m; ++j) {
            var o = links[j];
            neighbors[o.source.index].push(o.target);
            neighbors[o.target.index].push(o.source);
          }
        }
        return neighbors[i];
      }
      return force.resume();
    };
    force.resume = function () {
      return force.alpha(0.1);
    };
    force.stop = function () {
      return force.alpha(0);
    };
    force.drag = function () {
      if (!drag)
        drag = d3.behavior
          .drag()
          .origin(d3_identity)
          .on("dragstart", dragstart)
          .on("drag", d3_layout_forceDrag)
          .on("dragend", d3_layout_forceDragEnd);
      this.on("mouseover.force", d3_layout_forceDragOver)
        .on("mouseout.force", d3_layout_forceDragOut)
        .call(drag);
    };
    function dragstart(d) {
      d3_layout_forceDragOver((d3_layout_forceDragNode = d));
      d3_layout_forceDragForce = force;
    }
    return d3.rebind(force, event, "on");
  };
  var d3_layout_forceDragForce, d3_layout_forceDragNode;
  function d3_layout_forceDragOver(d) {
    d.fixed |= 2;
  }
  function d3_layout_forceDragOut(d) {
    if (d !== d3_layout_forceDragNode) d.fixed &= 1;
  }
  function d3_layout_forceDragEnd() {
    d3_layout_forceDragNode.fixed &= 1;
    d3_layout_forceDragForce = d3_layout_forceDragNode = null;
  }
  function d3_layout_forceDrag() {
    d3_layout_forceDragNode.px = d3.event.x;
    d3_layout_forceDragNode.py = d3.event.y;
    d3_layout_forceDragForce.resume();
  }
  function d3_layout_forceAccumulate(quad, alpha, charges) {
    var cx = 0,
      cy = 0;
    quad.charge = 0;
    if (!quad.leaf) {
      var nodes = quad.nodes,
        n = nodes.length,
        i = -1,
        c;
      while (++i < n) {
        c = nodes[i];
        if (c == null) continue;
        d3_layout_forceAccumulate(c, alpha, charges);
        quad.charge += c.charge;
        cx += c.charge * c.cx;
        cy += c.charge * c.cy;
      }
    }
    if (quad.point) {
      if (!quad.leaf) {
        quad.point.x += Math.random() - 0.5;
        quad.point.y += Math.random() - 0.5;
      }
      var k = alpha * charges[quad.point.index];
      quad.charge += quad.pointCharge = k;
      cx += k * quad.point.x;
      cy += k * quad.point.y;
    }
    quad.cx = cx / quad.charge;
    quad.cy = cy / quad.charge;
  }
  function d3_layout_forceLinkDistance(link) {
    return 20;
  }
  function d3_layout_forceLinkStrength(link) {
    return 1;
  }
  d3.layout.partition = function () {
    var hierarchy = d3.layout.hierarchy(),
      size = [1, 1];
    function position(node, x, dx, dy) {
      var children = node.children;
      node.x = x;
      node.y = node.depth * dy;
      node.dx = dx;
      node.dy = dy;
      if (children && (n = children.length)) {
        var i = -1,
          n,
          c,
          d;
        dx = node.value ? dx / node.value : 0;
        while (++i < n) {
          position((c = children[i]), x, (d = c.value * dx), dy);
          x += d;
        }
      }
    }
    function depth(node) {
      var children = node.children,
        d = 0;
      if (children && (n = children.length)) {
        var i = -1,
          n;
        while (++i < n) d = Math.max(d, depth(children[i]));
      }
      return 1 + d;
    }
    function partition(d, i) {
      var nodes = hierarchy.call(this, d, i);
      position(nodes[0], 0, size[0], size[1] / depth(nodes[0]));
      return nodes;
    }
    partition.size = function (x) {
      if (!arguments.length) return size;
      size = x;
      return partition;
    };
    return d3_layout_hierarchyRebind(partition, hierarchy);
  };
  d3.layout.pie = function () {
    var value = Number,
      sort = d3_layout_pieSortByValue,
      startAngle = 0,
      endAngle = 2 * Math.PI;
    function pie(data, i) {
      var values = data.map(function (d, i) {
        return +value.call(pie, d, i);
      });
      var a = +(typeof startAngle === "function"
        ? startAngle.apply(this, arguments)
        : startAngle);
      var k =
        ((typeof endAngle === "function"
          ? endAngle.apply(this, arguments)
          : endAngle) -
          startAngle) /
        d3.sum(values);
      var index = d3.range(data.length);
      if (sort != null)
        index.sort(
          sort === d3_layout_pieSortByValue
            ? function (i, j) {
                return values[j] - values[i];
              }
            : function (i, j) {
                return sort(data[i], data[j]);
              }
        );
      var arcs = [];
      index.forEach(function (i) {
        var d;
        arcs[i] = {
          data: data[i],
          value: (d = values[i]),
          startAngle: a,
          endAngle: (a += d * k),
        };
      });
      return arcs;
    }
    pie.value = function (x) {
      if (!arguments.length) return value;
      value = x;
      return pie;
    };
    pie.sort = function (x) {
      if (!arguments.length) return sort;
      sort = x;
      return pie;
    };
    pie.startAngle = function (x) {
      if (!arguments.length) return startAngle;
      startAngle = x;
      return pie;
    };
    pie.endAngle = function (x) {
      if (!arguments.length) return endAngle;
      endAngle = x;
      return pie;
    };
    return pie;
  };
  var d3_layout_pieSortByValue = {};
  d3.layout.stack = function () {
    var values = d3_identity,
      order = d3_layout_stackOrderDefault,
      offset = d3_layout_stackOffsetZero,
      out = d3_layout_stackOut,
      x = d3_layout_stackX,
      y = d3_layout_stackY;
    function stack(data, index) {
      var series = data.map(function (d, i) {
        return values.call(stack, d, i);
      });
      var points = series.map(function (d, i) {
        return d.map(function (v, i) {
          return [x.call(stack, v, i), y.call(stack, v, i)];
        });
      });
      var orders = order.call(stack, points, index);
      series = d3.permute(series, orders);
      points = d3.permute(points, orders);
      var offsets = offset.call(stack, points, index);
      var n = series.length,
        m = series[0].length,
        i,
        j,
        o;
      for (j = 0; j < m; ++j) {
        out.call(stack, series[0][j], (o = offsets[j]), points[0][j][1]);
        for (i = 1; i < n; ++i) {
          out.call(
            stack,
            series[i][j],
            (o += points[i - 1][j][1]),
            points[i][j][1]
          );
        }
      }
      return data;
    }
    stack.values = function (x) {
      if (!arguments.length) return values;
      values = x;
      return stack;
    };
    stack.order = function (x) {
      if (!arguments.length) return order;
      order =
        typeof x === "function"
          ? x
          : d3_layout_stackOrders.get(x) || d3_layout_stackOrderDefault;
      return stack;
    };
    stack.offset = function (x) {
      if (!arguments.length) return offset;
      offset =
        typeof x === "function"
          ? x
          : d3_layout_stackOffsets.get(x) || d3_layout_stackOffsetZero;
      return stack;
    };
    stack.x = function (z) {
      if (!arguments.length) return x;
      x = z;
      return stack;
    };
    stack.y = function (z) {
      if (!arguments.length) return y;
      y = z;
      return stack;
    };
    stack.out = function (z) {
      if (!arguments.length) return out;
      out = z;
      return stack;
    };
    return stack;
  };
  function d3_layout_stackX(d) {
    return d.x;
  }
  function d3_layout_stackY(d) {
    return d.y;
  }
  function d3_layout_stackOut(d, y0, y) {
    d.y0 = y0;
    d.y = y;
  }
  var d3_layout_stackOrders = d3.map({
    "inside-out": function (data) {
      var n = data.length,
        i,
        j,
        max = data.map(d3_layout_stackMaxIndex),
        sums = data.map(d3_layout_stackReduceSum),
        index = d3.range(n).sort(function (a, b) {
          return max[a] - max[b];
        }),
        top = 0,
        bottom = 0,
        tops = [],
        bottoms = [];
      for (i = 0; i < n; ++i) {
        j = index[i];
        if (top < bottom) {
          top += sums[j];
          tops.push(j);
        } else {
          bottom += sums[j];
          bottoms.push(j);
        }
      }
      return bottoms.reverse().concat(tops);
    },
    reverse: function (data) {
      return d3.range(data.length).reverse();
    },
    default: d3_layout_stackOrderDefault,
  });
  var d3_layout_stackOffsets = d3.map({
    silhouette: function (data) {
      var n = data.length,
        m = data[0].length,
        sums = [],
        max = 0,
        i,
        j,
        o,
        y0 = [];
      for (j = 0; j < m; ++j) {
        for (i = 0, o = 0; i < n; i++) o += data[i][j][1];
        if (o > max) max = o;
        sums.push(o);
      }
      for (j = 0; j < m; ++j) {
        y0[j] = (max - sums[j]) / 2;
      }
      return y0;
    },
    wiggle: function (data) {
      var n = data.length,
        x = data[0],
        m = x.length,
        max = 0,
        i,
        j,
        k,
        s1,
        s2,
        s3,
        dx,
        o,
        o0,
        y0 = [];
      y0[0] = o = o0 = 0;
      for (j = 1; j < m; ++j) {
        for (i = 0, s1 = 0; i < n; ++i) s1 += data[i][j][1];
        for (i = 0, s2 = 0, dx = x[j][0] - x[j - 1][0]; i < n; ++i) {
          for (
            k = 0, s3 = (data[i][j][1] - data[i][j - 1][1]) / (2 * dx);
            k < i;
            ++k
          ) {
            s3 += (data[k][j][1] - data[k][j - 1][1]) / dx;
          }
          s2 += s3 * data[i][j][1];
        }
        y0[j] = o -= s1 ? (s2 / s1) * dx : 0;
        if (o < o0) o0 = o;
      }
      for (j = 0; j < m; ++j) y0[j] -= o0;
      return y0;
    },
    expand: function (data) {
      var n = data.length,
        m = data[0].length,
        k = 1 / n,
        i,
        j,
        o,
        y0 = [];
      for (j = 0; j < m; ++j) {
        for (i = 0, o = 0; i < n; i++) o += data[i][j][1];
        if (o) for (i = 0; i < n; i++) data[i][j][1] /= o;
        else for (i = 0; i < n; i++) data[i][j][1] = k;
      }
      for (j = 0; j < m; ++j) y0[j] = 0;
      return y0;
    },
    zero: d3_layout_stackOffsetZero,
  });
  function d3_layout_stackOrderDefault(data) {
    return d3.range(data.length);
  }
  function d3_layout_stackOffsetZero(data) {
    var j = -1,
      m = data[0].length,
      y0 = [];
    while (++j < m) y0[j] = 0;
    return y0;
  }
  function d3_layout_stackMaxIndex(array) {
    var i = 1,
      j = 0,
      v = array[0][1],
      k,
      n = array.length;
    for (; i < n; ++i) {
      if ((k = array[i][1]) > v) {
        j = i;
        v = k;
      }
    }
    return j;
  }
  function d3_layout_stackReduceSum(d) {
    return d.reduce(d3_layout_stackSum, 0);
  }
  function d3_layout_stackSum(p, d) {
    return p + d[1];
  }
  d3.layout.histogram = function () {
    var frequency = true,
      valuer = Number,
      ranger = d3_layout_histogramRange,
      binner = d3_layout_histogramBinSturges;
    function histogram(data, i) {
      var bins = [],
        values = data.map(valuer, this),
        range = ranger.call(this, values, i),
        thresholds = binner.call(this, range, values, i),
        bin,
        i = -1,
        n = values.length,
        m = thresholds.length - 1,
        k = frequency ? 1 : 1 / n,
        x;
      while (++i < m) {
        bin = bins[i] = [];
        bin.dx = thresholds[i + 1] - (bin.x = thresholds[i]);
        bin.y = 0;
      }
      if (m > 0) {
        i = -1;
        while (++i < n) {
          x = values[i];
          if (x >= range[0] && x <= range[1]) {
            bin = bins[d3.bisect(thresholds, x, 1, m) - 1];
            bin.y += k;
            bin.push(data[i]);
          }
        }
      }
      return bins;
    }
    histogram.value = function (x) {
      if (!arguments.length) return valuer;
      valuer = x;
      return histogram;
    };
    histogram.range = function (x) {
      if (!arguments.length) return ranger;
      ranger = d3_functor(x);
      return histogram;
    };
    histogram.bins = function (x) {
      if (!arguments.length) return binner;
      binner =
        typeof x === "number"
          ? function (range) {
              return d3_layout_histogramBinFixed(range, x);
            }
          : d3_functor(x);
      return histogram;
    };
    histogram.frequency = function (x) {
      if (!arguments.length) return frequency;
      frequency = !!x;
      return histogram;
    };
    return histogram;
  };
  function d3_layout_histogramBinSturges(range, values) {
    return d3_layout_histogramBinFixed(
      range,
      Math.ceil(Math.log(values.length) / Math.LN2 + 1)
    );
  }
  function d3_layout_histogramBinFixed(range, n) {
    var x = -1,
      b = +range[0],
      m = (range[1] - b) / n,
      f = [];
    while (++x <= n) f[x] = m * x + b;
    return f;
  }
  function d3_layout_histogramRange(values) {
    return [d3.min(values), d3.max(values)];
  }
  d3.layout.hierarchy = function () {
    var sort = d3_layout_hierarchySort,
      children = d3_layout_hierarchyChildren,
      value = d3_layout_hierarchyValue;
    function recurse(data, depth, nodes) {
      var childs = children.call(hierarchy, data, depth),
        node = d3_layout_hierarchyInline ? data : { data: data };
      node.depth = depth;
      nodes.push(node);
      if (childs && (n = childs.length)) {
        var i = -1,
          n,
          c = (node.children = []),
          v = 0,
          j = depth + 1,
          d;
        while (++i < n) {
          d = recurse(childs[i], j, nodes);
          d.parent = node;
          c.push(d);
          v += d.value;
        }
        if (sort) c.sort(sort);
        if (value) node.value = v;
      } else if (value) {
        node.value = +value.call(hierarchy, data, depth) || 0;
      }
      return node;
    }
    function revalue(node, depth) {
      var children = node.children,
        v = 0;
      if (children && (n = children.length)) {
        var i = -1,
          n,
          j = depth + 1;
        while (++i < n) v += revalue(children[i], j);
      } else if (value) {
        v =
          +value.call(
            hierarchy,
            d3_layout_hierarchyInline ? node : node.data,
            depth
          ) || 0;
      }
      if (value) node.value = v;
      return v;
    }
    function hierarchy(d) {
      var nodes = [];
      recurse(d, 0, nodes);
      return nodes;
    }
    hierarchy.sort = function (x) {
      if (!arguments.length) return sort;
      sort = x;
      return hierarchy;
    };
    hierarchy.children = function (x) {
      if (!arguments.length) return children;
      children = x;
      return hierarchy;
    };
    hierarchy.value = function (x) {
      if (!arguments.length) return value;
      value = x;
      return hierarchy;
    };
    hierarchy.revalue = function (root) {
      revalue(root, 0);
      return root;
    };
    return hierarchy;
  };
  function d3_layout_hierarchyRebind(object, hierarchy) {
    d3.rebind(object, hierarchy, "sort", "children", "value");
    object.links = d3_layout_hierarchyLinks;
    object.nodes = function (d) {
      d3_layout_hierarchyInline = true;
      return (object.nodes = object)(d);
    };
    return object;
  }
  function d3_layout_hierarchyChildren(d) {
    return d.children;
  }
  function d3_layout_hierarchyValue(d) {
    return d.value;
  }
  function d3_layout_hierarchySort(a, b) {
    return b.value - a.value;
  }
  function d3_layout_hierarchyLinks(nodes) {
    return d3.merge(
      nodes.map(function (parent) {
        return (parent.children || []).map(function (child) {
          return { source: parent, target: child };
        });
      })
    );
  }
  var d3_layout_hierarchyInline = false;
  d3.layout.pack = function () {
    var hierarchy = d3.layout.hierarchy().sort(d3_layout_packSort),
      size = [1, 1];
    function pack(d, i) {
      var nodes = hierarchy.call(this, d, i),
        root = nodes[0];
      root.x = 0;
      root.y = 0;
      d3_layout_packTree(root);
      var w = size[0],
        h = size[1],
        k = 1 / Math.max((2 * root.r) / w, (2 * root.r) / h);
      d3_layout_packTransform(root, w / 2, h / 2, k);
      return nodes;
    }
    pack.size = function (x) {
      if (!arguments.length) return size;
      size = x;
      return pack;
    };
    return d3_layout_hierarchyRebind(pack, hierarchy);
  };
  function d3_layout_packSort(a, b) {
    return a.value - b.value;
  }
  function d3_layout_packInsert(a, b) {
    var c = a._pack_next;
    a._pack_next = b;
    b._pack_prev = a;
    b._pack_next = c;
    c._pack_prev = b;
  }
  function d3_layout_packSplice(a, b) {
    a._pack_next = b;
    b._pack_prev = a;
  }
  function d3_layout_packIntersects(a, b) {
    var dx = b.x - a.x,
      dy = b.y - a.y,
      dr = a.r + b.r;
    return dr * dr - dx * dx - dy * dy > 0.001;
  }
  function d3_layout_packCircle(nodes) {
    var xMin = Infinity,
      xMax = -Infinity,
      yMin = Infinity,
      yMax = -Infinity,
      n = nodes.length,
      a,
      b,
      c,
      j,
      k;
    function bound(node) {
      xMin = Math.min(node.x - node.r, xMin);
      xMax = Math.max(node.x + node.r, xMax);
      yMin = Math.min(node.y - node.r, yMin);
      yMax = Math.max(node.y + node.r, yMax);
    }
    nodes.forEach(d3_layout_packLink);
    a = nodes[0];
    a.x = -a.r;
    a.y = 0;
    bound(a);
    if (n > 1) {
      b = nodes[1];
      b.x = b.r;
      b.y = 0;
      bound(b);
      if (n > 2) {
        c = nodes[2];
        d3_layout_packPlace(a, b, c);
        bound(c);
        d3_layout_packInsert(a, c);
        a._pack_prev = c;
        d3_layout_packInsert(c, b);
        b = a._pack_next;
        for (var i = 3; i < n; i++) {
          d3_layout_packPlace(a, b, (c = nodes[i]));
          var isect = 0,
            s1 = 1,
            s2 = 1;
          for (j = b._pack_next; j !== b; j = j._pack_next, s1++) {
            if (d3_layout_packIntersects(j, c)) {
              isect = 1;
              break;
            }
          }
          if (isect == 1) {
            for (k = a._pack_prev; k !== j._pack_prev; k = k._pack_prev, s2++) {
              if (d3_layout_packIntersects(k, c)) {
                break;
              }
            }
          }
          if (isect) {
            if (s1 < s2 || (s1 == s2 && b.r < a.r))
              d3_layout_packSplice(a, (b = j));
            else d3_layout_packSplice((a = k), b);
            i--;
          } else {
            d3_layout_packInsert(a, c);
            b = c;
            bound(c);
          }
        }
      }
    }
    var cx = (xMin + xMax) / 2,
      cy = (yMin + yMax) / 2,
      cr = 0;
    for (var i = 0; i < n; i++) {
      var node = nodes[i];
      node.x -= cx;
      node.y -= cy;
      cr = Math.max(cr, node.r + Math.sqrt(node.x * node.x + node.y * node.y));
    }
    nodes.forEach(d3_layout_packUnlink);
    return cr;
  }
  function d3_layout_packLink(node) {
    node._pack_next = node._pack_prev = node;
  }
  function d3_layout_packUnlink(node) {
    delete node._pack_next;
    delete node._pack_prev;
  }
  function d3_layout_packTree(node) {
    var children = node.children;
    if (children && children.length) {
      children.forEach(d3_layout_packTree);
      node.r = d3_layout_packCircle(children);
    } else {
      node.r = Math.sqrt(node.value);
    }
  }
  function d3_layout_packTransform(node, x, y, k) {
    var children = node.children;
    node.x = x += k * node.x;
    node.y = y += k * node.y;
    node.r *= k;
    if (children) {
      var i = -1,
        n = children.length;
      while (++i < n) d3_layout_packTransform(children[i], x, y, k);
    }
  }
  function d3_layout_packPlace(a, b, c) {
    var db = a.r + c.r,
      dx = b.x - a.x,
      dy = b.y - a.y;
    if (db && (dx || dy)) {
      var da = b.r + c.r,
        dc = Math.sqrt(dx * dx + dy * dy),
        cos = Math.max(
          -1,
          Math.min(1, (db * db + dc * dc - da * da) / (2 * db * dc))
        ),
        theta = Math.acos(cos),
        x = cos * (db /= dc),
        y = Math.sin(theta) * db;
      c.x = a.x + x * dx + y * dy;
      c.y = a.y + x * dy - y * dx;
    } else {
      c.x = a.x + db;
      c.y = a.y;
    }
  }
  d3.layout.cluster = function () {
    var hierarchy = d3.layout.hierarchy().sort(null).value(null),
      separation = d3_layout_treeSeparation,
      size = [1, 1];
    function cluster(d, i) {
      var nodes = hierarchy.call(this, d, i),
        root = nodes[0],
        previousNode,
        x = 0,
        kx,
        ky;
      d3_layout_treeVisitAfter(root, function (node) {
        var children = node.children;
        if (children && children.length) {
          node.x = d3_layout_clusterX(children);
          node.y = d3_layout_clusterY(children);
        } else {
          node.x = previousNode ? (x += separation(node, previousNode)) : 0;
          node.y = 0;
          previousNode = node;
        }
      });
      var left = d3_layout_clusterLeft(root),
        right = d3_layout_clusterRight(root),
        x0 = left.x - separation(left, right) / 2,
        x1 = right.x + separation(right, left) / 2;
      d3_layout_treeVisitAfter(root, function (node) {
        node.x = ((node.x - x0) / (x1 - x0)) * size[0];
        node.y = (1 - (root.y ? node.y / root.y : 1)) * size[1];
      });
      return nodes;
    }
    cluster.separation = function (x) {
      if (!arguments.length) return separation;
      separation = x;
      return cluster;
    };
    cluster.size = function (x) {
      if (!arguments.length) return size;
      size = x;
      return cluster;
    };
    return d3_layout_hierarchyRebind(cluster, hierarchy);
  };
  function d3_layout_clusterY(children) {
    return (
      1 +
      d3.max(children, function (child) {
        return child.y;
      })
    );
  }
  function d3_layout_clusterX(children) {
    return (
      children.reduce(function (x, child) {
        return x + child.x;
      }, 0) / children.length
    );
  }
  function d3_layout_clusterLeft(node) {
    var children = node.children;
    return children && children.length
      ? d3_layout_clusterLeft(children[0])
      : node;
  }
  function d3_layout_clusterRight(node) {
    var children = node.children,
      n;
    return children && (n = children.length)
      ? d3_layout_clusterRight(children[n - 1])
      : node;
  }
  d3.layout.tree = function () {
    var hierarchy = d3.layout.hierarchy().sort(null).value(null),
      separation = d3_layout_treeSeparation,
      size = [1, 1];
    function tree(d, i) {
      var nodes = hierarchy.call(this, d, i),
        root = nodes[0];
      function firstWalk(node, previousSibling) {
        var children = node.children,
          layout = node._tree;
        if (children && (n = children.length)) {
          var n,
            firstChild = children[0],
            previousChild,
            ancestor = firstChild,
            child,
            i = -1;
          while (++i < n) {
            child = children[i];
            firstWalk(child, previousChild);
            ancestor = apportion(child, previousChild, ancestor);
            previousChild = child;
          }
          d3_layout_treeShift(node);
          var midpoint = 0.5 * (firstChild._tree.prelim + child._tree.prelim);
          if (previousSibling) {
            layout.prelim =
              previousSibling._tree.prelim + separation(node, previousSibling);
            layout.mod = layout.prelim - midpoint;
          } else {
            layout.prelim = midpoint;
          }
        } else {
          if (previousSibling) {
            layout.prelim =
              previousSibling._tree.prelim + separation(node, previousSibling);
          }
        }
      }
      function secondWalk(node, x) {
        node.x = node._tree.prelim + x;
        var children = node.children;
        if (children && (n = children.length)) {
          var i = -1,
            n;
          x += node._tree.mod;
          while (++i < n) {
            secondWalk(children[i], x);
          }
        }
      }
      function apportion(node, previousSibling, ancestor) {
        if (previousSibling) {
          var vip = node,
            vop = node,
            vim = previousSibling,
            vom = node.parent.children[0],
            sip = vip._tree.mod,
            sop = vop._tree.mod,
            sim = vim._tree.mod,
            som = vom._tree.mod,
            shift;
          while (
            ((vim = d3_layout_treeRight(vim)),
            (vip = d3_layout_treeLeft(vip)),
            vim && vip)
          ) {
            vom = d3_layout_treeLeft(vom);
            vop = d3_layout_treeRight(vop);
            vop._tree.ancestor = node;
            shift =
              vim._tree.prelim +
              sim -
              vip._tree.prelim -
              sip +
              separation(vim, vip);
            if (shift > 0) {
              d3_layout_treeMove(
                d3_layout_treeAncestor(vim, node, ancestor),
                node,
                shift
              );
              sip += shift;
              sop += shift;
            }
            sim += vim._tree.mod;
            sip += vip._tree.mod;
            som += vom._tree.mod;
            sop += vop._tree.mod;
          }
          if (vim && !d3_layout_treeRight(vop)) {
            vop._tree.thread = vim;
            vop._tree.mod += sim - sop;
          }
          if (vip && !d3_layout_treeLeft(vom)) {
            vom._tree.thread = vip;
            vom._tree.mod += sip - som;
            ancestor = node;
          }
        }
        return ancestor;
      }
      d3_layout_treeVisitAfter(root, function (node, previousSibling) {
        node._tree = {
          ancestor: node,
          prelim: 0,
          mod: 0,
          change: 0,
          shift: 0,
          number: previousSibling ? previousSibling._tree.number + 1 : 0,
        };
      });
      firstWalk(root);
      secondWalk(root, -root._tree.prelim);
      var left = d3_layout_treeSearch(root, d3_layout_treeLeftmost),
        right = d3_layout_treeSearch(root, d3_layout_treeRightmost),
        deep = d3_layout_treeSearch(root, d3_layout_treeDeepest),
        x0 = left.x - separation(left, right) / 2,
        x1 = right.x + separation(right, left) / 2,
        y1 = deep.depth || 1;
      d3_layout_treeVisitAfter(root, function (node) {
        node.x = ((node.x - x0) / (x1 - x0)) * size[0];
        node.y = (node.depth / y1) * size[1];
        delete node._tree;
      });
      return nodes;
    }
    tree.separation = function (x) {
      if (!arguments.length) return separation;
      separation = x;
      return tree;
    };
    tree.size = function (x) {
      if (!arguments.length) return size;
      size = x;
      return tree;
    };
    return d3_layout_hierarchyRebind(tree, hierarchy);
  };
  function d3_layout_treeSeparation(a, b) {
    return a.parent == b.parent ? 1 : 2;
  }
  function d3_layout_treeLeft(node) {
    var children = node.children;
    return children && children.length ? children[0] : node._tree.thread;
  }
  function d3_layout_treeRight(node) {
    var children = node.children,
      n;
    return children && (n = children.length)
      ? children[n - 1]
      : node._tree.thread;
  }
  function d3_layout_treeSearch(node, compare) {
    var children = node.children;
    if (children && (n = children.length)) {
      var child,
        n,
        i = -1;
      while (++i < n) {
        if (
          compare((child = d3_layout_treeSearch(children[i], compare)), node) >
          0
        ) {
          node = child;
        }
      }
    }
    return node;
  }
  function d3_layout_treeRightmost(a, b) {
    return a.x - b.x;
  }
  function d3_layout_treeLeftmost(a, b) {
    return b.x - a.x;
  }
  function d3_layout_treeDeepest(a, b) {
    return a.depth - b.depth;
  }
  function d3_layout_treeVisitAfter(node, callback) {
    function visit(node, previousSibling) {
      var children = node.children;
      if (children && (n = children.length)) {
        var child,
          previousChild = null,
          i = -1,
          n;
        while (++i < n) {
          child = children[i];
          visit(child, previousChild);
          previousChild = child;
        }
      }
      callback(node, previousSibling);
    }
    visit(node, null);
  }
  function d3_layout_treeShift(node) {
    var shift = 0,
      change = 0,
      children = node.children,
      i = children.length,
      child;
    while (--i >= 0) {
      child = children[i]._tree;
      child.prelim += shift;
      child.mod += shift;
      shift += child.shift + (change += child.change);
    }
  }
  function d3_layout_treeMove(ancestor, node, shift) {
    ancestor = ancestor._tree;
    node = node._tree;
    var change = shift / (node.number - ancestor.number);
    ancestor.change += change;
    node.change -= change;
    node.shift += shift;
    node.prelim += shift;
    node.mod += shift;
  }
  function d3_layout_treeAncestor(vim, node, ancestor) {
    return vim._tree.ancestor.parent == node.parent
      ? vim._tree.ancestor
      : ancestor;
  }
  d3.layout.treemap = function () {
    var hierarchy = d3.layout.hierarchy(),
      round = Math.round,
      size = [1, 1],
      padding = null,
      pad = d3_layout_treemapPadNull,
      sticky = false,
      stickies,
      ratio = 0.5 * (1 + Math.sqrt(5));
    function scale(children, k) {
      var i = -1,
        n = children.length,
        child,
        area;
      while (++i < n) {
        area = (child = children[i]).value * (k < 0 ? 0 : k);
        child.area = isNaN(area) || area <= 0 ? 0 : area;
      }
    }
    function squarify(node) {
      var children = node.children;
      if (children && children.length) {
        var rect = pad(node),
          row = [],
          remaining = children.slice(),
          child,
          best = Infinity,
          score,
          u = Math.min(rect.dx, rect.dy),
          n;
        scale(remaining, (rect.dx * rect.dy) / node.value);
        row.area = 0;
        while ((n = remaining.length) > 0) {
          row.push((child = remaining[n - 1]));
          row.area += child.area;
          if ((score = worst(row, u)) <= best) {
            remaining.pop();
            best = score;
          } else {
            row.area -= row.pop().area;
            position(row, u, rect, false);
            u = Math.min(rect.dx, rect.dy);
            row.length = row.area = 0;
            best = Infinity;
          }
        }
        if (row.length) {
          position(row, u, rect, true);
          row.length = row.area = 0;
        }
        children.forEach(squarify);
      }
    }
    function stickify(node) {
      var children = node.children;
      if (children && children.length) {
        var rect = pad(node),
          remaining = children.slice(),
          child,
          row = [];
        scale(remaining, (rect.dx * rect.dy) / node.value);
        row.area = 0;
        while ((child = remaining.pop())) {
          row.push(child);
          row.area += child.area;
          if (child.z != null) {
            position(row, child.z ? rect.dx : rect.dy, rect, !remaining.length);
            row.length = row.area = 0;
          }
        }
        children.forEach(stickify);
      }
    }
    function worst(row, u) {
      var s = row.area,
        r,
        rmax = 0,
        rmin = Infinity,
        i = -1,
        n = row.length;
      while (++i < n) {
        if (!(r = row[i].area)) continue;
        if (r < rmin) rmin = r;
        if (r > rmax) rmax = r;
      }
      s *= s;
      u *= u;
      return s
        ? Math.max((u * rmax * ratio) / s, s / (u * rmin * ratio))
        : Infinity;
    }
    function position(row, u, rect, flush) {
      var i = -1,
        n = row.length,
        x = rect.x,
        y = rect.y,
        v = u ? round(row.area / u) : 0,
        o;
      if (u == rect.dx) {
        if (flush || v > rect.dy) v = rect.dy;
        while (++i < n) {
          o = row[i];
          o.x = x;
          o.y = y;
          o.dy = v;
          x += o.dx = Math.min(rect.x + rect.dx - x, v ? round(o.area / v) : 0);
        }
        o.z = true;
        o.dx += rect.x + rect.dx - x;
        rect.y += v;
        rect.dy -= v;
      } else {
        if (flush || v > rect.dx) v = rect.dx;
        while (++i < n) {
          o = row[i];
          o.x = x;
          o.y = y;
          o.dx = v;
          y += o.dy = Math.min(rect.y + rect.dy - y, v ? round(o.area / v) : 0);
        }
        o.z = false;
        o.dy += rect.y + rect.dy - y;
        rect.x += v;
        rect.dx -= v;
      }
    }
    function treemap(d) {
      var nodes = stickies || hierarchy(d),
        root = nodes[0];
      root.x = 0;
      root.y = 0;
      root.dx = size[0];
      root.dy = size[1];
      if (stickies) hierarchy.revalue(root);
      scale([root], (root.dx * root.dy) / root.value);
      (stickies ? stickify : squarify)(root);
      if (sticky) stickies = nodes;
      return nodes;
    }
    treemap.size = function (x) {
      if (!arguments.length) return size;
      size = x;
      return treemap;
    };
    treemap.padding = function (x) {
      if (!arguments.length) return padding;
      function padFunction(node) {
        var p = x.call(treemap, node, node.depth);
        return p == null
          ? d3_layout_treemapPadNull(node)
          : d3_layout_treemapPad(
              node,
              typeof p === "number" ? [p, p, p, p] : p
            );
      }
      function padConstant(node) {
        return d3_layout_treemapPad(node, x);
      }
      var type;
      pad =
        (padding = x) == null
          ? d3_layout_treemapPadNull
          : (type = typeof x) === "function"
          ? padFunction
          : type === "number"
          ? ((x = [x, x, x, x]), padConstant)
          : padConstant;
      return treemap;
    };
    treemap.round = function (x) {
      if (!arguments.length) return round != Number;
      round = x ? Math.round : Number;
      return treemap;
    };
    treemap.sticky = function (x) {
      if (!arguments.length) return sticky;
      sticky = x;
      stickies = null;
      return treemap;
    };
    treemap.ratio = function (x) {
      if (!arguments.length) return ratio;
      ratio = x;
      return treemap;
    };
    return d3_layout_hierarchyRebind(treemap, hierarchy);
  };
  function d3_layout_treemapPadNull(node) {
    return { x: node.x, y: node.y, dx: node.dx, dy: node.dy };
  }
  function d3_layout_treemapPad(node, padding) {
    var x = node.x + padding[3],
      y = node.y + padding[0],
      dx = node.dx - padding[1] - padding[3],
      dy = node.dy - padding[0] - padding[2];
    if (dx < 0) {
      x += dx / 2;
      dx = 0;
    }
    if (dy < 0) {
      y += dy / 2;
      dy = 0;
    }
    return { x: x, y: y, dx: dx, dy: dy };
  }
  d3.csv = function (url, callback) {
    d3.text(url, "text/csv", function (text) {
      callback(text && d3.csv.parse(text));
    });
  };
  d3.csv.parse = function (text) {
    var header;
    return d3.csv.parseRows(text, function (row, i) {
      if (i) {
        var o = {},
          j = -1,
          m = header.length;
        while (++j < m) o[header[j]] = row[j];
        return o;
      } else {
        header = row;
        return null;
      }
    });
  };
  d3.csv.parseRows = function (text, f) {
    var EOL = {},
      EOF = {},
      rows = [],
      re = /\r\n|[,\r\n]/g,
      n = 0,
      t,
      eol;
    re.lastIndex = 0;
    function token() {
      if (re.lastIndex >= text.length) return EOF;
      if (eol) {
        eol = false;
        return EOL;
      }
      var j = re.lastIndex;
      if (text.charCodeAt(j) === 34) {
        var i = j;
        while (i++ < text.length) {
          if (text.charCodeAt(i) === 34) {
            if (text.charCodeAt(i + 1) !== 34) break;
            i++;
          }
        }
        re.lastIndex = i + 2;
        var c = text.charCodeAt(i + 1);
        if (c === 13) {
          eol = true;
          if (text.charCodeAt(i + 2) === 10) re.lastIndex++;
        } else if (c === 10) {
          eol = true;
        }
        return text.substring(j + 1, i).replace(/""/g, '"');
      }
      var m = re.exec(text);
      if (m) {
        eol = m[0].charCodeAt(0) !== 44;
        return text.substring(j, m.index);
      }
      re.lastIndex = text.length;
      return text.substring(j);
    }
    while ((t = token()) !== EOF) {
      var a = [];
      while (t !== EOL && t !== EOF) {
        a.push(t);
        t = token();
      }
      if (f && !(a = f(a, n++))) continue;
      rows.push(a);
    }
    return rows;
  };
  d3.csv.format = function (rows) {
    return rows.map(d3_csv_formatRow).join("\n");
  };
  function d3_csv_formatRow(row) {
    return row.map(d3_csv_formatValue).join(",");
  }
  function d3_csv_formatValue(text) {
    return /[",\n]/.test(text) ? '"' + text.replace(/\"/g, '""') + '"' : text;
  }
  d3.geo = {};
  var d3_geo_radians = Math.PI / 180;
  d3.geo.azimuthal = function () {
    var mode = "orthographic",
      origin,
      scale = 200,
      translate = [480, 250],
      x0,
      y0,
      cy0,
      sy0;
    function azimuthal(coordinates) {
      var x1 = coordinates[0] * d3_geo_radians - x0,
        y1 = coordinates[1] * d3_geo_radians,
        cx1 = Math.cos(x1),
        sx1 = Math.sin(x1),
        cy1 = Math.cos(y1),
        sy1 = Math.sin(y1),
        cc = mode !== "orthographic" ? sy0 * sy1 + cy0 * cy1 * cx1 : null,
        c,
        k =
          mode === "stereographic"
            ? 1 / (1 + cc)
            : mode === "gnomonic"
            ? 1 / cc
            : mode === "equidistant"
            ? ((c = Math.acos(cc)), c ? c / Math.sin(c) : 0)
            : mode === "equalarea"
            ? Math.sqrt(2 / (1 + cc))
            : 1,
        x = k * cy1 * sx1,
        y = k * (sy0 * cy1 * cx1 - cy0 * sy1);
      return [scale * x + translate[0], scale * y + translate[1]];
    }
    azimuthal.invert = function (coordinates) {
      var x = (coordinates[0] - translate[0]) / scale,
        y = (coordinates[1] - translate[1]) / scale,
        p = Math.sqrt(x * x + y * y),
        c =
          mode === "stereographic"
            ? 2 * Math.atan(p)
            : mode === "gnomonic"
            ? Math.atan(p)
            : mode === "equidistant"
            ? p
            : mode === "equalarea"
            ? 2 * Math.asin(0.5 * p)
            : Math.asin(p),
        sc = Math.sin(c),
        cc = Math.cos(c);
      return [
        (x0 + Math.atan2(x * sc, p * cy0 * cc + y * sy0 * sc)) / d3_geo_radians,
        Math.asin(cc * sy0 - (p ? (y * sc * cy0) / p : 0)) / d3_geo_radians,
      ];
    };
    azimuthal.mode = function (x) {
      if (!arguments.length) return mode;
      mode = x + "";
      return azimuthal;
    };
    azimuthal.origin = function (x) {
      if (!arguments.length) return origin;
      origin = x;
      x0 = origin[0] * d3_geo_radians;
      y0 = origin[1] * d3_geo_radians;
      cy0 = Math.cos(y0);
      sy0 = Math.sin(y0);
      return azimuthal;
    };
    azimuthal.scale = function (x) {
      if (!arguments.length) return scale;
      scale = +x;
      return azimuthal;
    };
    azimuthal.translate = function (x) {
      if (!arguments.length) return translate;
      translate = [+x[0], +x[1]];
      return azimuthal;
    };
    return azimuthal.origin([0, 0]);
  };
  d3.geo.albers = function () {
    var origin = [-98, 38],
      parallels = [29.5, 45.5],
      scale = 1000,
      translate = [480, 250],
      lng0,
      n,
      C,
      p0;
    function albers(coordinates) {
      var t = n * (d3_geo_radians * coordinates[0] - lng0),
        p =
          Math.sqrt(C - 2 * n * Math.sin(d3_geo_radians * coordinates[1])) / n;
      return [
        scale * p * Math.sin(t) + translate[0],
        scale * (p * Math.cos(t) - p0) + translate[1],
      ];
    }
    albers.invert = function (coordinates) {
      var x = (coordinates[0] - translate[0]) / scale,
        y = (coordinates[1] - translate[1]) / scale,
        p0y = p0 + y,
        t = Math.atan2(x, p0y),
        p = Math.sqrt(x * x + p0y * p0y);
      return [
        (lng0 + t / n) / d3_geo_radians,
        Math.asin((C - p * p * n * n) / (2 * n)) / d3_geo_radians,
      ];
    };
    function reload() {
      var phi1 = d3_geo_radians * parallels[0],
        phi2 = d3_geo_radians * parallels[1],
        lat0 = d3_geo_radians * origin[1],
        s = Math.sin(phi1),
        c = Math.cos(phi1);
      lng0 = d3_geo_radians * origin[0];
      n = 0.5 * (s + Math.sin(phi2));
      C = c * c + 2 * n * s;
      p0 = Math.sqrt(C - 2 * n * Math.sin(lat0)) / n;
      return albers;
    }
    albers.origin = function (x) {
      if (!arguments.length) return origin;
      origin = [+x[0], +x[1]];
      return reload();
    };
    albers.parallels = function (x) {
      if (!arguments.length) return parallels;
      parallels = [+x[0], +x[1]];
      return reload();
    };
    albers.scale = function (x) {
      if (!arguments.length) return scale;
      scale = +x;
      return albers;
    };
    albers.translate = function (x) {
      if (!arguments.length) return translate;
      translate = [+x[0], +x[1]];
      return albers;
    };
    return reload();
  };
  d3.geo.albersUsa = function () {
    var lower48 = d3.geo.albers();
    var alaska = d3.geo.albers().origin([-160, 60]).parallels([55, 65]);
    var hawaii = d3.geo.albers().origin([-160, 20]).parallels([8, 18]);
    var puertoRico = d3.geo.albers().origin([-60, 10]).parallels([8, 18]);
    function albersUsa(coordinates) {
      var lon = coordinates[0],
        lat = coordinates[1];
      return (
        lat > 50
          ? alaska
          : lon < -140
          ? hawaii
          : lat < 21
          ? puertoRico
          : lower48
      )(coordinates);
    }
    albersUsa.scale = function (x) {
      if (!arguments.length) return lower48.scale();
      lower48.scale(x);
      alaska.scale(x * 0.6);
      hawaii.scale(x);
      puertoRico.scale(x * 1.5);
      return albersUsa.translate(lower48.translate());
    };
    albersUsa.translate = function (x) {
      if (!arguments.length) return lower48.translate();
      var dz = lower48.scale() / 1000,
        dx = x[0],
        dy = x[1];
      lower48.translate(x);
      alaska.translate([dx - 400 * dz, dy + 170 * dz]);
      hawaii.translate([dx - 190 * dz, dy + 200 * dz]);
      puertoRico.translate([dx + 580 * dz, dy + 430 * dz]);
      return albersUsa;
    };
    return albersUsa.scale(lower48.scale());
  };
  d3.geo.bonne = function () {
    var scale = 200,
      translate = [480, 250],
      x0,
      y0,
      y1,
      c1;
    function bonne(coordinates) {
      var x = coordinates[0] * d3_geo_radians - x0,
        y = coordinates[1] * d3_geo_radians - y0;
      if (y1) {
        var p = c1 + y1 - y,
          E = (x * Math.cos(y)) / p;
        x = p * Math.sin(E);
        y = p * Math.cos(E) - c1;
      } else {
        x *= Math.cos(y);
        y *= -1;
      }
      return [scale * x + translate[0], scale * y + translate[1]];
    }
    bonne.invert = function (coordinates) {
      var x = (coordinates[0] - translate[0]) / scale,
        y = (coordinates[1] - translate[1]) / scale;
      if (y1) {
        var c = c1 + y,
          p = Math.sqrt(x * x + c * c);
        y = c1 + y1 - p;
        x = x0 + (p * Math.atan2(x, c)) / Math.cos(y);
      } else {
        y *= -1;
        x /= Math.cos(y);
      }
      return [x / d3_geo_radians, y / d3_geo_radians];
    };
    bonne.parallel = function (x) {
      if (!arguments.length) return y1 / d3_geo_radians;
      c1 = 1 / Math.tan((y1 = x * d3_geo_radians));
      return bonne;
    };
    bonne.origin = function (x) {
      if (!arguments.length) return [x0 / d3_geo_radians, y0 / d3_geo_radians];
      x0 = x[0] * d3_geo_radians;
      y0 = x[1] * d3_geo_radians;
      return bonne;
    };
    bonne.scale = function (x) {
      if (!arguments.length) return scale;
      scale = +x;
      return bonne;
    };
    bonne.translate = function (x) {
      if (!arguments.length) return translate;
      translate = [+x[0], +x[1]];
      return bonne;
    };
    return bonne.origin([0, 0]).parallel(45);
  };
  d3.geo.equirectangular = function () {
    var scale = 500,
      translate = [480, 250];
    function equirectangular(coordinates) {
      var x = coordinates[0] / 360,
        y = -coordinates[1] / 360;
      return [scale * x + translate[0], scale * y + translate[1]];
    }
    equirectangular.invert = function (coordinates) {
      var x = (coordinates[0] - translate[0]) / scale,
        y = (coordinates[1] - translate[1]) / scale;
      return [360 * x, -360 * y];
    };
    equirectangular.scale = function (x) {
      if (!arguments.length) return scale;
      scale = +x;
      return equirectangular;
    };
    equirectangular.translate = function (x) {
      if (!arguments.length) return translate;
      translate = [+x[0], +x[1]];
      return equirectangular;
    };
    return equirectangular;
  };
  d3.geo.mercator = function () {
    var scale = 500,
      translate = [480, 250];
    function mercator(coordinates) {
      var x = coordinates[0] / 360,
        y =
          -(
            Math.log(
              Math.tan(Math.PI / 4 + (coordinates[1] * d3_geo_radians) / 2)
            ) / d3_geo_radians
          ) / 360;
      return [
        scale * x + translate[0],
        scale * Math.max(-0.5, Math.min(0.5, y)) + translate[1],
      ];
    }
    mercator.invert = function (coordinates) {
      var x = (coordinates[0] - translate[0]) / scale,
        y = (coordinates[1] - translate[1]) / scale;
      return [
        360 * x,
        (2 * Math.atan(Math.exp(-360 * y * d3_geo_radians))) / d3_geo_radians -
          90,
      ];
    };
    mercator.scale = function (x) {
      if (!arguments.length) return scale;
      scale = +x;
      return mercator;
    };
    mercator.translate = function (x) {
      if (!arguments.length) return translate;
      translate = [+x[0], +x[1]];
      return mercator;
    };
    return mercator;
  };
  function d3_geo_type(types, defaultValue) {
    return function (object) {
      return object && types.hasOwnProperty(object.type)
        ? types[object.type](object)
        : defaultValue;
    };
  }
  d3.geo.path = function () {
    var pointRadius = 4.5,
      pointCircle = d3_path_circle(pointRadius),
      projection = d3.geo.albersUsa(),
      buffer = [];
    function path(d, i) {
      if (typeof pointRadius === "function")
        pointCircle = d3_path_circle(pointRadius.apply(this, arguments));
      pathType(d);
      var result = buffer.length ? buffer.join("") : null;
      buffer = [];
      return result;
    }
    function project(coordinates) {
      return projection(coordinates).join(",");
    }
    var pathType = d3_geo_type({
      FeatureCollection: function (o) {
        var features = o.features,
          i = -1,
          n = features.length;
        while (++i < n) buffer.push(pathType(features[i].geometry));
      },
      Feature: function (o) {
        pathType(o.geometry);
      },
      Point: function (o) {
        buffer.push("M", project(o.coordinates), pointCircle);
      },
      MultiPoint: function (o) {
        var coordinates = o.coordinates,
          i = -1,
          n = coordinates.length;
        while (++i < n) buffer.push("M", project(coordinates[i]), pointCircle);
      },
      LineString: function (o) {
        var coordinates = o.coordinates,
          i = -1,
          n = coordinates.length;
        buffer.push("M");
        while (++i < n) buffer.push(project(coordinates[i]), "L");
        buffer.pop();
      },
      MultiLineString: function (o) {
        var coordinates = o.coordinates,
          i = -1,
          n = coordinates.length,
          subcoordinates,
          j,
          m;
        while (++i < n) {
          subcoordinates = coordinates[i];
          j = -1;
          m = subcoordinates.length;
          buffer.push("M");
          while (++j < m) buffer.push(project(subcoordinates[j]), "L");
          buffer.pop();
        }
      },
      Polygon: function (o) {
        var coordinates = o.coordinates,
          i = -1,
          n = coordinates.length,
          subcoordinates,
          j,
          m;
        while (++i < n) {
          subcoordinates = coordinates[i];
          j = -1;
          if ((m = subcoordinates.length - 1) > 0) {
            buffer.push("M");
            while (++j < m) buffer.push(project(subcoordinates[j]), "L");
            buffer[buffer.length - 1] = "Z";
          }
        }
      },
      MultiPolygon: function (o) {
        var coordinates = o.coordinates,
          i = -1,
          n = coordinates.length,
          subcoordinates,
          j,
          m,
          subsubcoordinates,
          k,
          p;
        while (++i < n) {
          subcoordinates = coordinates[i];
          j = -1;
          m = subcoordinates.length;
          while (++j < m) {
            subsubcoordinates = subcoordinates[j];
            k = -1;
            if ((p = subsubcoordinates.length - 1) > 0) {
              buffer.push("M");
              while (++k < p) buffer.push(project(subsubcoordinates[k]), "L");
              buffer[buffer.length - 1] = "Z";
            }
          }
        }
      },
      GeometryCollection: function (o) {
        var geometries = o.geometries,
          i = -1,
          n = geometries.length;
        while (++i < n) buffer.push(pathType(geometries[i]));
      },
    });
    var areaType = (path.area = d3_geo_type(
      {
        FeatureCollection: function (o) {
          var area = 0,
            features = o.features,
            i = -1,
            n = features.length;
          while (++i < n) area += areaType(features[i]);
          return area;
        },
        Feature: function (o) {
          return areaType(o.geometry);
        },
        Polygon: function (o) {
          return polygonArea(o.coordinates);
        },
        MultiPolygon: function (o) {
          var sum = 0,
            coordinates = o.coordinates,
            i = -1,
            n = coordinates.length;
          while (++i < n) sum += polygonArea(coordinates[i]);
          return sum;
        },
        GeometryCollection: function (o) {
          var sum = 0,
            geometries = o.geometries,
            i = -1,
            n = geometries.length;
          while (++i < n) sum += areaType(geometries[i]);
          return sum;
        },
      },
      0
    ));
    function polygonArea(coordinates) {
      var sum = area(coordinates[0]),
        i = 0,
        n = coordinates.length;
      while (++i < n) sum -= area(coordinates[i]);
      return sum;
    }
    function polygonCentroid(coordinates) {
      var polygon = d3.geom.polygon(coordinates[0].map(projection)),
        area = polygon.area(),
        centroid = polygon.centroid(area < 0 ? ((area *= -1), 1) : -1),
        x = centroid[0],
        y = centroid[1],
        z = area,
        i = 0,
        n = coordinates.length;
      while (++i < n) {
        polygon = d3.geom.polygon(coordinates[i].map(projection));
        area = polygon.area();
        centroid = polygon.centroid(area < 0 ? ((area *= -1), 1) : -1);
        x -= centroid[0];
        y -= centroid[1];
        z -= area;
      }
      return [x, y, 6 * z];
    }
    var centroidType = (path.centroid = d3_geo_type({
      Feature: function (o) {
        return centroidType(o.geometry);
      },
      Polygon: function (o) {
        var centroid = polygonCentroid(o.coordinates);
        return [centroid[0] / centroid[2], centroid[1] / centroid[2]];
      },
      MultiPolygon: function (o) {
        var area = 0,
          coordinates = o.coordinates,
          centroid,
          x = 0,
          y = 0,
          z = 0,
          i = -1,
          n = coordinates.length;
        while (++i < n) {
          centroid = polygonCentroid(coordinates[i]);
          x += centroid[0];
          y += centroid[1];
          z += centroid[2];
        }
        return [x / z, y / z];
      },
    }));
    function area(coordinates) {
      return Math.abs(d3.geom.polygon(coordinates.map(projection)).area());
    }
    path.projection = function (x) {
      projection = x;
      return path;
    };
    path.pointRadius = function (x) {
      if (typeof x === "function") pointRadius = x;
      else {
        pointRadius = +x;
        pointCircle = d3_path_circle(pointRadius);
      }
      return path;
    };
    return path;
  };
  function d3_path_circle(radius) {
    return (
      "m0," +
      radius +
      "a" +
      radius +
      "," +
      radius +
      " 0 1,1 0," +
      -2 * radius +
      "a" +
      radius +
      "," +
      radius +
      " 0 1,1 0," +
      +2 * radius +
      "z"
    );
  }
  d3.geo.bounds = function (feature) {
    var left = Infinity,
      bottom = Infinity,
      right = -Infinity,
      top = -Infinity;
    d3_geo_bounds(feature, function (x, y) {
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < bottom) bottom = y;
      if (y > top) top = y;
    });
    return [
      [left, bottom],
      [right, top],
    ];
  };
  function d3_geo_bounds(o, f) {
    if (d3_geo_boundsTypes.hasOwnProperty(o.type))
      d3_geo_boundsTypes[o.type](o, f);
  }
  var d3_geo_boundsTypes = {
    Feature: d3_geo_boundsFeature,
    FeatureCollection: d3_geo_boundsFeatureCollection,
    GeometryCollection: d3_geo_boundsGeometryCollection,
    LineString: d3_geo_boundsLineString,
    MultiLineString: d3_geo_boundsMultiLineString,
    MultiPoint: d3_geo_boundsLineString,
    MultiPolygon: d3_geo_boundsMultiPolygon,
    Point: d3_geo_boundsPoint,
    Polygon: d3_geo_boundsPolygon,
  };
  function d3_geo_boundsFeature(o, f) {
    d3_geo_bounds(o.geometry, f);
  }
  function d3_geo_boundsFeatureCollection(o, f) {
    for (var a = o.features, i = 0, n = a.length; i < n; i++) {
      d3_geo_bounds(a[i].geometry, f);
    }
  }
  function d3_geo_boundsGeometryCollection(o, f) {
    for (var a = o.geometries, i = 0, n = a.length; i < n; i++) {
      d3_geo_bounds(a[i], f);
    }
  }
  function d3_geo_boundsLineString(o, f) {
    for (var a = o.coordinates, i = 0, n = a.length; i < n; i++) {
      f.apply(null, a[i]);
    }
  }
  function d3_geo_boundsMultiLineString(o, f) {
    for (var a = o.coordinates, i = 0, n = a.length; i < n; i++) {
      for (var b = a[i], j = 0, m = b.length; j < m; j++) {
        f.apply(null, b[j]);
      }
    }
  }
  function d3_geo_boundsMultiPolygon(o, f) {
    for (var a = o.coordinates, i = 0, n = a.length; i < n; i++) {
      for (var b = a[i][0], j = 0, m = b.length; j < m; j++) {
        f.apply(null, b[j]);
      }
    }
  }
  function d3_geo_boundsPoint(o, f) {
    f.apply(null, o.coordinates);
  }
  function d3_geo_boundsPolygon(o, f) {
    for (var a = o.coordinates[0], i = 0, n = a.length; i < n; i++) {
      f.apply(null, a[i]);
    }
  }
  d3.geo.circle = function () {
    var origin = [0, 0],
      degrees = 90 - 1e-2,
      radians = degrees * d3_geo_radians,
      arc = d3.geo.greatArc().source(origin).target(d3_identity);
    function circle() {}
    function visible(point) {
      return arc.distance(point) < radians;
    }
    circle.clip = function (d) {
      if (typeof origin === "function")
        arc.source(origin.apply(this, arguments));
      return clipType(d) || null;
    };
    var clipType = d3_geo_type({
      FeatureCollection: function (o) {
        var features = o.features.map(clipType).filter(d3_identity);
        return features && ((o = Object.create(o)), (o.features = features), o);
      },
      Feature: function (o) {
        var geometry = clipType(o.geometry);
        return geometry && ((o = Object.create(o)), (o.geometry = geometry), o);
      },
      Point: function (o) {
        return visible(o.coordinates) && o;
      },
      MultiPoint: function (o) {
        var coordinates = o.coordinates.filter(visible);
        return coordinates.length && { type: o.type, coordinates: coordinates };
      },
      LineString: function (o) {
        var coordinates = clip(o.coordinates);
        return (
          coordinates.length &&
          ((o = Object.create(o)), (o.coordinates = coordinates), o)
        );
      },
      MultiLineString: function (o) {
        var coordinates = o.coordinates.map(clip).filter(function (d) {
          return d.length;
        });
        return (
          coordinates.length &&
          ((o = Object.create(o)), (o.coordinates = coordinates), o)
        );
      },
      Polygon: function (o) {
        var coordinates = o.coordinates.map(clip);
        return (
          coordinates[0].length &&
          ((o = Object.create(o)), (o.coordinates = coordinates), o)
        );
      },
      MultiPolygon: function (o) {
        var coordinates = o.coordinates
          .map(function (d) {
            return d.map(clip);
          })
          .filter(function (d) {
            return d[0].length;
          });
        return (
          coordinates.length &&
          ((o = Object.create(o)), (o.coordinates = coordinates), o)
        );
      },
      GeometryCollection: function (o) {
        var geometries = o.geometries.map(clipType).filter(d3_identity);
        return (
          geometries.length &&
          ((o = Object.create(o)), (o.geometries = geometries), o)
        );
      },
    });
    function clip(coordinates) {
      var i = -1,
        n = coordinates.length,
        clipped = [],
        p0,
        p1,
        p2,
        d0,
        d1;
      while (++i < n) {
        d1 = arc.distance((p2 = coordinates[i]));
        if (d1 < radians) {
          if (p1)
            clipped.push(
              d3_geo_greatArcInterpolate(p1, p2)((d0 - radians) / (d0 - d1))
            );
          clipped.push(p2);
          p0 = p1 = null;
        } else {
          p1 = p2;
          if (!p0 && clipped.length) {
            clipped.push(
              d3_geo_greatArcInterpolate(
                clipped[clipped.length - 1],
                p1
              )((radians - d0) / (d1 - d0))
            );
            p0 = p1;
          }
        }
        d0 = d1;
      }
      p0 = coordinates[0];
      p1 = clipped[0];
      if (
        p1 &&
        p2[0] === p0[0] &&
        p2[1] === p0[1] &&
        !(p2[0] === p1[0] && p2[1] === p1[1])
      ) {
        clipped.push(p1);
      }
      return resample(clipped);
    }
    function resample(coordinates) {
      var i = 0,
        n = coordinates.length,
        j,
        m,
        resampled = n ? [coordinates[0]] : coordinates,
        resamples,
        origin = arc.source();
      while (++i < n) {
        resamples = arc.source(coordinates[i - 1])(coordinates[i]).coordinates;
        for (j = 0, m = resamples.length; ++j < m; )
          resampled.push(resamples[j]);
      }
      arc.source(origin);
      return resampled;
    }
    circle.origin = function (x) {
      if (!arguments.length) return origin;
      origin = x;
      if (typeof origin !== "function") arc.source(origin);
      return circle;
    };
    circle.angle = function (x) {
      if (!arguments.length) return degrees;
      radians = (degrees = +x) * d3_geo_radians;
      return circle;
    };
    return d3.rebind(circle, arc, "precision");
  };
  d3.geo.greatArc = function () {
    var source = d3_geo_greatArcSource,
      p0,
      target = d3_geo_greatArcTarget,
      p1,
      precision = 6 * d3_geo_radians,
      interpolate = d3_geo_greatArcInterpolator();
    function greatArc() {
      var d = greatArc.distance.apply(this, arguments),
        t = 0,
        dt = precision / d,
        coordinates = [p0];
      while ((t += dt) < 1) coordinates.push(interpolate(t));
      coordinates.push(p1);
      return { type: "LineString", coordinates: coordinates };
    }
    greatArc.distance = function () {
      if (typeof source === "function")
        interpolate.source((p0 = source.apply(this, arguments)));
      if (typeof target === "function")
        interpolate.target((p1 = target.apply(this, arguments)));
      return interpolate.distance();
    };
    greatArc.source = function (_) {
      if (!arguments.length) return source;
      source = _;
      if (typeof source !== "function") interpolate.source((p0 = source));
      return greatArc;
    };
    greatArc.target = function (_) {
      if (!arguments.length) return target;
      target = _;
      if (typeof target !== "function") interpolate.target((p1 = target));
      return greatArc;
    };
    greatArc.precision = function (_) {
      if (!arguments.length) return precision / d3_geo_radians;
      precision = _ * d3_geo_radians;
      return greatArc;
    };
    return greatArc;
  };
  function d3_geo_greatArcSource(d) {
    return d.source;
  }
  function d3_geo_greatArcTarget(d) {
    return d.target;
  }
  function d3_geo_greatArcInterpolator() {
    var x0, y0, cy0, sy0, kx0, ky0, x1, y1, cy1, sy1, kx1, ky1, d, k;
    function interpolate(t) {
      var B = Math.sin((t *= d)) * k,
        A = Math.sin(d - t) * k,
        x = A * kx0 + B * kx1,
        y = A * ky0 + B * ky1,
        z = A * sy0 + B * sy1;
      return [
        Math.atan2(y, x) / d3_geo_radians,
        Math.atan2(z, Math.sqrt(x * x + y * y)) / d3_geo_radians,
      ];
    }
    interpolate.distance = function () {
      if (d == null)
        k =
          1 /
          Math.sin(
            (d = Math.acos(
              Math.max(
                -1,
                Math.min(1, sy0 * sy1 + cy0 * cy1 * Math.cos(x1 - x0))
              )
            ))
          );
      return d;
    };
    interpolate.source = function (_) {
      var cx0 = Math.cos((x0 = _[0] * d3_geo_radians)),
        sx0 = Math.sin(x0);
      cy0 = Math.cos((y0 = _[1] * d3_geo_radians));
      sy0 = Math.sin(y0);
      kx0 = cy0 * cx0;
      ky0 = cy0 * sx0;
      d = null;
      return interpolate;
    };
    interpolate.target = function (_) {
      var cx1 = Math.cos((x1 = _[0] * d3_geo_radians)),
        sx1 = Math.sin(x1);
      cy1 = Math.cos((y1 = _[1] * d3_geo_radians));
      sy1 = Math.sin(y1);
      kx1 = cy1 * cx1;
      ky1 = cy1 * sx1;
      d = null;
      return interpolate;
    };
    return interpolate;
  }
  function d3_geo_greatArcInterpolate(a, b) {
    var i = d3_geo_greatArcInterpolator().source(a).target(b);
    i.distance();
    return i;
  }
  d3.geo.greatCircle = d3.geo.circle;
  d3.geom = {};
  d3.geom.contour = function (grid, start) {
    var s = start || d3_geom_contourStart(grid),
      c = [],
      x = s[0],
      y = s[1],
      dx = 0,
      dy = 0,
      pdx = NaN,
      pdy = NaN,
      i = 0;
    do {
      i = 0;
      if (grid(x - 1, y - 1)) i += 1;
      if (grid(x, y - 1)) i += 2;
      if (grid(x - 1, y)) i += 4;
      if (grid(x, y)) i += 8;
      if (i === 6) {
        dx = pdy === -1 ? -1 : 1;
        dy = 0;
      } else if (i === 9) {
        dx = 0;
        dy = pdx === 1 ? -1 : 1;
      } else {
        dx = d3_geom_contourDx[i];
        dy = d3_geom_contourDy[i];
      }
      if (dx != pdx && dy != pdy) {
        c.push([x, y]);
        pdx = dx;
        pdy = dy;
      }
      x += dx;
      y += dy;
    } while (s[0] != x || s[1] != y);
    return c;
  };
  var d3_geom_contourDx = [
      1,
      0,
      1,
      1,
      -1,
      0,
      -1,
      1,
      0,
      0,
      0,
      0,
      -1,
      0,
      -1,
      NaN,
    ],
    d3_geom_contourDy = [0, -1, 0, 0, 0, -1, 0, 0, 1, -1, 1, 1, 0, -1, 0, NaN];
  function d3_geom_contourStart(grid) {
    var x = 0,
      y = 0;
    while (true) {
      if (grid(x, y)) {
        return [x, y];
      }
      if (x === 0) {
        x = y + 1;
        y = 0;
      } else {
        x = x - 1;
        y = y + 1;
      }
    }
  }
  d3.geom.hull = function (vertices) {
    if (vertices.length < 3) return [];
    var len = vertices.length,
      plen = len - 1,
      points = [],
      stack = [],
      i,
      j,
      h = 0,
      x1,
      y1,
      x2,
      y2,
      u,
      v,
      a,
      sp;
    for (i = 1; i < len; ++i) {
      if (vertices[i][1] < vertices[h][1]) {
        h = i;
      } else if (vertices[i][1] == vertices[h][1]) {
        h = vertices[i][0] < vertices[h][0] ? i : h;
      }
    }
    for (i = 0; i < len; ++i) {
      if (i === h) continue;
      y1 = vertices[i][1] - vertices[h][1];
      x1 = vertices[i][0] - vertices[h][0];
      points.push({ angle: Math.atan2(y1, x1), index: i });
    }
    points.sort(function (a, b) {
      return a.angle - b.angle;
    });
    a = points[0].angle;
    v = points[0].index;
    u = 0;
    for (i = 1; i < plen; ++i) {
      j = points[i].index;
      if (a == points[i].angle) {
        x1 = vertices[v][0] - vertices[h][0];
        y1 = vertices[v][1] - vertices[h][1];
        x2 = vertices[j][0] - vertices[h][0];
        y2 = vertices[j][1] - vertices[h][1];
        if (x1 * x1 + y1 * y1 >= x2 * x2 + y2 * y2) {
          points[i].index = -1;
        } else {
          points[u].index = -1;
          a = points[i].angle;
          u = i;
          v = j;
        }
      } else {
        a = points[i].angle;
        u = i;
        v = j;
      }
    }
    stack.push(h);
    for (i = 0, j = 0; i < 2; ++j) {
      if (points[j].index !== -1) {
        stack.push(points[j].index);
        i++;
      }
    }
    sp = stack.length;
    for (; j < plen; ++j) {
      if (points[j].index === -1) continue;
      while (
        !d3_geom_hullCCW(
          stack[sp - 2],
          stack[sp - 1],
          points[j].index,
          vertices
        )
      ) {
        --sp;
      }
      stack[sp++] = points[j].index;
    }
    var poly = [];
    for (i = 0; i < sp; ++i) {
      poly.push(vertices[stack[i]]);
    }
    return poly;
  };
  function d3_geom_hullCCW(i1, i2, i3, v) {
    var t, a, b, c, d, e, f;
    t = v[i1];
    a = t[0];
    b = t[1];
    t = v[i2];
    c = t[0];
    d = t[1];
    t = v[i3];
    e = t[0];
    f = t[1];
    return (f - b) * (c - a) - (d - b) * (e - a) > 0;
  }
  d3.geom.polygon = function (coordinates) {
    coordinates.area = function () {
      var i = 0,
        n = coordinates.length,
        a = coordinates[n - 1][0] * coordinates[0][1],
        b = coordinates[n - 1][1] * coordinates[0][0];
      while (++i < n) {
        a += coordinates[i - 1][0] * coordinates[i][1];
        b += coordinates[i - 1][1] * coordinates[i][0];
      }
      return (b - a) * 0.5;
    };
    coordinates.centroid = function (k) {
      var i = -1,
        n = coordinates.length,
        x = 0,
        y = 0,
        a,
        b = coordinates[n - 1],
        c;
      if (!arguments.length) k = -1 / (6 * coordinates.area());
      while (++i < n) {
        a = b;
        b = coordinates[i];
        c = a[0] * b[1] - b[0] * a[1];
        x += (a[0] + b[0]) * c;
        y += (a[1] + b[1]) * c;
      }
      return [x * k, y * k];
    };
    coordinates.clip = function (subject) {
      var input,
        i = -1,
        n = coordinates.length,
        j,
        m,
        a = coordinates[n - 1],
        b,
        c,
        d;
      while (++i < n) {
        input = subject.slice();
        subject.length = 0;
        b = coordinates[i];
        c = input[(m = input.length) - 1];
        j = -1;
        while (++j < m) {
          d = input[j];
          if (d3_geom_polygonInside(d, a, b)) {
            if (!d3_geom_polygonInside(c, a, b)) {
              subject.push(d3_geom_polygonIntersect(c, d, a, b));
            }
            subject.push(d);
          } else if (d3_geom_polygonInside(c, a, b)) {
            subject.push(d3_geom_polygonIntersect(c, d, a, b));
          }
          c = d;
        }
        a = b;
      }
      return subject;
    };
    return coordinates;
  };
  function d3_geom_polygonInside(p, a, b) {
    return (b[0] - a[0]) * (p[1] - a[1]) < (b[1] - a[1]) * (p[0] - a[0]);
  }
  function d3_geom_polygonIntersect(c, d, a, b) {
    var x1 = c[0],
      x2 = d[0],
      x3 = a[0],
      x4 = b[0],
      y1 = c[1],
      y2 = d[1],
      y3 = a[1],
      y4 = b[1],
      x13 = x1 - x3,
      x21 = x2 - x1,
      x43 = x4 - x3,
      y13 = y1 - y3,
      y21 = y2 - y1,
      y43 = y4 - y3,
      ua = (x43 * y13 - y43 * x13) / (y43 * x21 - x43 * y21);
    return [x1 + ua * x21, y1 + ua * y21];
  }
  d3.geom.voronoi = function (vertices) {
    var polygons = vertices.map(function () {
      return [];
    });
    d3_voronoi_tessellate(vertices, function (e) {
      var s1, s2, x1, x2, y1, y2;
      if (e.a === 1 && e.b >= 0) {
        s1 = e.ep.r;
        s2 = e.ep.l;
      } else {
        s1 = e.ep.l;
        s2 = e.ep.r;
      }
      if (e.a === 1) {
        y1 = s1 ? s1.y : -1e6;
        x1 = e.c - e.b * y1;
        y2 = s2 ? s2.y : 1e6;
        x2 = e.c - e.b * y2;
      } else {
        x1 = s1 ? s1.x : -1e6;
        y1 = e.c - e.a * x1;
        x2 = s2 ? s2.x : 1e6;
        y2 = e.c - e.a * x2;
      }
      var v1 = [x1, y1],
        v2 = [x2, y2];
      polygons[e.region.l.index].push(v1, v2);
      polygons[e.region.r.index].push(v1, v2);
    });
    return polygons.map(function (polygon, i) {
      var cx = vertices[i][0],
        cy = vertices[i][1];
      polygon.forEach(function (v) {
        v.angle = Math.atan2(v[0] - cx, v[1] - cy);
      });
      return polygon
        .sort(function (a, b) {
          return a.angle - b.angle;
        })
        .filter(function (d, i) {
          return !i || d.angle - polygon[i - 1].angle > 1e-10;
        });
    });
  };
  var d3_voronoi_opposite = { l: "r", r: "l" };
  function d3_voronoi_tessellate(vertices, callback) {
    var Sites = {
      list: vertices
        .map(function (v, i) {
          return { index: i, x: v[0], y: v[1] };
        })
        .sort(function (a, b) {
          return a.y < b.y
            ? -1
            : a.y > b.y
            ? 1
            : a.x < b.x
            ? -1
            : a.x > b.x
            ? 1
            : 0;
        }),
      bottomSite: null,
    };
    var EdgeList = {
      list: [],
      leftEnd: null,
      rightEnd: null,
      init: function () {
        EdgeList.leftEnd = EdgeList.createHalfEdge(null, "l");
        EdgeList.rightEnd = EdgeList.createHalfEdge(null, "l");
        EdgeList.leftEnd.r = EdgeList.rightEnd;
        EdgeList.rightEnd.l = EdgeList.leftEnd;
        EdgeList.list.unshift(EdgeList.leftEnd, EdgeList.rightEnd);
      },
      createHalfEdge: function (edge, side) {
        return { edge: edge, side: side, vertex: null, l: null, r: null };
      },
      insert: function (lb, he) {
        he.l = lb;
        he.r = lb.r;
        lb.r.l = he;
        lb.r = he;
      },
      leftBound: function (p) {
        var he = EdgeList.leftEnd;
        do {
          he = he.r;
        } while (he != EdgeList.rightEnd && Geom.rightOf(he, p));
        he = he.l;
        return he;
      },
      del: function (he) {
        he.l.r = he.r;
        he.r.l = he.l;
        he.edge = null;
      },
      right: function (he) {
        return he.r;
      },
      left: function (he) {
        return he.l;
      },
      leftRegion: function (he) {
        return he.edge == null ? Sites.bottomSite : he.edge.region[he.side];
      },
      rightRegion: function (he) {
        return he.edge == null
          ? Sites.bottomSite
          : he.edge.region[d3_voronoi_opposite[he.side]];
      },
    };
    var Geom = {
      bisect: function (s1, s2) {
        var newEdge = { region: { l: s1, r: s2 }, ep: { l: null, r: null } };
        var dx = s2.x - s1.x,
          dy = s2.y - s1.y,
          adx = dx > 0 ? dx : -dx,
          ady = dy > 0 ? dy : -dy;
        newEdge.c = s1.x * dx + s1.y * dy + (dx * dx + dy * dy) * 0.5;
        if (adx > ady) {
          newEdge.a = 1;
          newEdge.b = dy / dx;
          newEdge.c /= dx;
        } else {
          newEdge.b = 1;
          newEdge.a = dx / dy;
          newEdge.c /= dy;
        }
        return newEdge;
      },
      intersect: function (el1, el2) {
        var e1 = el1.edge,
          e2 = el2.edge;
        if (!e1 || !e2 || e1.region.r == e2.region.r) {
          return null;
        }
        var d = e1.a * e2.b - e1.b * e2.a;
        if (Math.abs(d) < 1e-10) {
          return null;
        }
        var xint = (e1.c * e2.b - e2.c * e1.b) / d,
          yint = (e2.c * e1.a - e1.c * e2.a) / d,
          e1r = e1.region.r,
          e2r = e2.region.r,
          el,
          e;
        if (e1r.y < e2r.y || (e1r.y == e2r.y && e1r.x < e2r.x)) {
          el = el1;
          e = e1;
        } else {
          el = el2;
          e = e2;
        }
        var rightOfSite = xint >= e.region.r.x;
        if (
          (rightOfSite && el.side === "l") ||
          (!rightOfSite && el.side === "r")
        ) {
          return null;
        }
        return { x: xint, y: yint };
      },
      rightOf: function (he, p) {
        var e = he.edge,
          topsite = e.region.r,
          rightOfSite = p.x > topsite.x;
        if (rightOfSite && he.side === "l") {
          return 1;
        }
        if (!rightOfSite && he.side === "r") {
          return 0;
        }
        if (e.a === 1) {
          var dyp = p.y - topsite.y,
            dxp = p.x - topsite.x,
            fast = 0,
            above = 0;
          if ((!rightOfSite && e.b < 0) || (rightOfSite && e.b >= 0)) {
            above = fast = dyp >= e.b * dxp;
          } else {
            above = p.x + p.y * e.b > e.c;
            if (e.b < 0) {
              above = !above;
            }
            if (!above) {
              fast = 1;
            }
          }
          if (!fast) {
            var dxs = topsite.x - e.region.l.x;
            above =
              e.b * (dxp * dxp - dyp * dyp) <
              dxs * dyp * (1 + (2 * dxp) / dxs + e.b * e.b);
            if (e.b < 0) {
              above = !above;
            }
          }
        } else {
          var yl = e.c - e.a * p.x,
            t1 = p.y - yl,
            t2 = p.x - topsite.x,
            t3 = yl - topsite.y;
          above = t1 * t1 > t2 * t2 + t3 * t3;
        }
        return he.side === "l" ? above : !above;
      },
      endPoint: function (edge, side, site) {
        edge.ep[side] = site;
        if (!edge.ep[d3_voronoi_opposite[side]]) return;
        callback(edge);
      },
      distance: function (s, t) {
        var dx = s.x - t.x,
          dy = s.y - t.y;
        return Math.sqrt(dx * dx + dy * dy);
      },
    };
    var EventQueue = {
      list: [],
      insert: function (he, site, offset) {
        he.vertex = site;
        he.ystar = site.y + offset;
        for (var i = 0, list = EventQueue.list, l = list.length; i < l; i++) {
          var next = list[i];
          if (
            he.ystar > next.ystar ||
            (he.ystar == next.ystar && site.x > next.vertex.x)
          ) {
            continue;
          } else {
            break;
          }
        }
        list.splice(i, 0, he);
      },
      del: function (he) {
        for (
          var i = 0, ls = EventQueue.list, l = ls.length;
          i < l && ls[i] != he;
          ++i
        ) {}
        ls.splice(i, 1);
      },
      empty: function () {
        return EventQueue.list.length === 0;
      },
      nextEvent: function (he) {
        for (var i = 0, ls = EventQueue.list, l = ls.length; i < l; ++i) {
          if (ls[i] == he) return ls[i + 1];
        }
        return null;
      },
      min: function () {
        var elem = EventQueue.list[0];
        return { x: elem.vertex.x, y: elem.ystar };
      },
      extractMin: function () {
        return EventQueue.list.shift();
      },
    };
    EdgeList.init();
    Sites.bottomSite = Sites.list.shift();
    var newSite = Sites.list.shift(),
      newIntStar;
    var lbnd, rbnd, llbnd, rrbnd, bisector;
    var bot, top, temp, p, v;
    var e, pm;
    while (true) {
      if (!EventQueue.empty()) {
        newIntStar = EventQueue.min();
      }
      if (
        newSite &&
        (EventQueue.empty() ||
          newSite.y < newIntStar.y ||
          (newSite.y == newIntStar.y && newSite.x < newIntStar.x))
      ) {
        lbnd = EdgeList.leftBound(newSite);
        rbnd = EdgeList.right(lbnd);
        bot = EdgeList.rightRegion(lbnd);
        e = Geom.bisect(bot, newSite);
        bisector = EdgeList.createHalfEdge(e, "l");
        EdgeList.insert(lbnd, bisector);
        p = Geom.intersect(lbnd, bisector);
        if (p) {
          EventQueue.del(lbnd);
          EventQueue.insert(lbnd, p, Geom.distance(p, newSite));
        }
        lbnd = bisector;
        bisector = EdgeList.createHalfEdge(e, "r");
        EdgeList.insert(lbnd, bisector);
        p = Geom.intersect(bisector, rbnd);
        if (p) {
          EventQueue.insert(bisector, p, Geom.distance(p, newSite));
        }
        newSite = Sites.list.shift();
      } else if (!EventQueue.empty()) {
        lbnd = EventQueue.extractMin();
        llbnd = EdgeList.left(lbnd);
        rbnd = EdgeList.right(lbnd);
        rrbnd = EdgeList.right(rbnd);
        bot = EdgeList.leftRegion(lbnd);
        top = EdgeList.rightRegion(rbnd);
        v = lbnd.vertex;
        Geom.endPoint(lbnd.edge, lbnd.side, v);
        Geom.endPoint(rbnd.edge, rbnd.side, v);
        EdgeList.del(lbnd);
        EventQueue.del(rbnd);
        EdgeList.del(rbnd);
        pm = "l";
        if (bot.y > top.y) {
          temp = bot;
          bot = top;
          top = temp;
          pm = "r";
        }
        e = Geom.bisect(bot, top);
        bisector = EdgeList.createHalfEdge(e, pm);
        EdgeList.insert(llbnd, bisector);
        Geom.endPoint(e, d3_voronoi_opposite[pm], v);
        p = Geom.intersect(llbnd, bisector);
        if (p) {
          EventQueue.del(llbnd);
          EventQueue.insert(llbnd, p, Geom.distance(p, bot));
        }
        p = Geom.intersect(bisector, rrbnd);
        if (p) {
          EventQueue.insert(bisector, p, Geom.distance(p, bot));
        }
      } else {
        break;
      }
    }
    for (
      lbnd = EdgeList.right(EdgeList.leftEnd);
      lbnd != EdgeList.rightEnd;
      lbnd = EdgeList.right(lbnd)
    ) {
      callback(lbnd.edge);
    }
  }
  d3.geom.delaunay = function (vertices) {
    var edges = vertices.map(function () {
        return [];
      }),
      triangles = [];
    d3_voronoi_tessellate(vertices, function (e) {
      edges[e.region.l.index].push(vertices[e.region.r.index]);
    });
    edges.forEach(function (edge, i) {
      var v = vertices[i],
        cx = v[0],
        cy = v[1];
      edge.forEach(function (v) {
        v.angle = Math.atan2(v[0] - cx, v[1] - cy);
      });
      edge.sort(function (a, b) {
        return a.angle - b.angle;
      });
      for (var j = 0, m = edge.length - 1; j < m; j++) {
        triangles.push([v, edge[j], edge[j + 1]]);
      }
    });
    return triangles;
  };
  d3.geom.quadtree = function (points, x1, y1, x2, y2) {
    var p,
      i = -1,
      n = points.length;
    if (n && isNaN(points[0].x)) points = points.map(d3_geom_quadtreePoint);
    if (arguments.length < 5) {
      if (arguments.length === 3) {
        y2 = x2 = y1;
        y1 = x1;
      } else {
        x1 = y1 = Infinity;
        x2 = y2 = -Infinity;
        while (++i < n) {
          p = points[i];
          if (p.x < x1) x1 = p.x;
          if (p.y < y1) y1 = p.y;
          if (p.x > x2) x2 = p.x;
          if (p.y > y2) y2 = p.y;
        }
        var dx = x2 - x1,
          dy = y2 - y1;
        if (dx > dy) y2 = y1 + dx;
        else x2 = x1 + dy;
      }
    }
    function insert(n, p, x1, y1, x2, y2) {
      if (isNaN(p.x) || isNaN(p.y)) return;
      if (n.leaf) {
        var v = n.point;
        if (v) {
          if (Math.abs(v.x - p.x) + Math.abs(v.y - p.y) < 0.01) {
            insertChild(n, p, x1, y1, x2, y2);
          } else {
            n.point = null;
            insertChild(n, v, x1, y1, x2, y2);
            insertChild(n, p, x1, y1, x2, y2);
          }
        } else {
          n.point = p;
        }
      } else {
        insertChild(n, p, x1, y1, x2, y2);
      }
    }
    function insertChild(n, p, x1, y1, x2, y2) {
      var sx = (x1 + x2) * 0.5,
        sy = (y1 + y2) * 0.5,
        right = p.x >= sx,
        bottom = p.y >= sy,
        i = (bottom << 1) + right;
      n.leaf = false;
      n = n.nodes[i] || (n.nodes[i] = d3_geom_quadtreeNode());
      if (right) x1 = sx;
      else x2 = sx;
      if (bottom) y1 = sy;
      else y2 = sy;
      insert(n, p, x1, y1, x2, y2);
    }
    var root = d3_geom_quadtreeNode();
    root.add = function (p) {
      insert(root, p, x1, y1, x2, y2);
    };
    root.visit = function (f) {
      d3_geom_quadtreeVisit(f, root, x1, y1, x2, y2);
    };
    points.forEach(root.add);
    return root;
  };
  function d3_geom_quadtreeNode() {
    return { leaf: true, nodes: [], point: null };
  }
  function d3_geom_quadtreeVisit(f, node, x1, y1, x2, y2) {
    if (!f(node, x1, y1, x2, y2)) {
      var sx = (x1 + x2) * 0.5,
        sy = (y1 + y2) * 0.5,
        children = node.nodes;
      if (children[0]) d3_geom_quadtreeVisit(f, children[0], x1, y1, sx, sy);
      if (children[1]) d3_geom_quadtreeVisit(f, children[1], sx, y1, x2, sy);
      if (children[2]) d3_geom_quadtreeVisit(f, children[2], x1, sy, sx, y2);
      if (children[3]) d3_geom_quadtreeVisit(f, children[3], sx, sy, x2, y2);
    }
  }
  function d3_geom_quadtreePoint(p) {
    return { x: p[0], y: p[1] };
  }
  d3.time = {};
  var d3_time = Date;
  function d3_time_utc() {
    this._ = new Date(
      arguments.length > 1 ? Date.UTC.apply(this, arguments) : arguments[0]
    );
  }
  d3_time_utc.prototype = {
    getDate: function () {
      return this._.getUTCDate();
    },
    getDay: function () {
      return this._.getUTCDay();
    },
    getFullYear: function () {
      return this._.getUTCFullYear();
    },
    getHours: function () {
      return this._.getUTCHours();
    },
    getMilliseconds: function () {
      return this._.getUTCMilliseconds();
    },
    getMinutes: function () {
      return this._.getUTCMinutes();
    },
    getMonth: function () {
      return this._.getUTCMonth();
    },
    getSeconds: function () {
      return this._.getUTCSeconds();
    },
    getTime: function () {
      return this._.getTime();
    },
    getTimezoneOffset: function () {
      return 0;
    },
    valueOf: function () {
      return this._.valueOf();
    },
    setDate: function () {
      d3_time_prototype.setUTCDate.apply(this._, arguments);
    },
    setDay: function () {
      d3_time_prototype.setUTCDay.apply(this._, arguments);
    },
    setFullYear: function () {
      d3_time_prototype.setUTCFullYear.apply(this._, arguments);
    },
    setHours: function () {
      d3_time_prototype.setUTCHours.apply(this._, arguments);
    },
    setMilliseconds: function () {
      d3_time_prototype.setUTCMilliseconds.apply(this._, arguments);
    },
    setMinutes: function () {
      d3_time_prototype.setUTCMinutes.apply(this._, arguments);
    },
    setMonth: function () {
      d3_time_prototype.setUTCMonth.apply(this._, arguments);
    },
    setSeconds: function () {
      d3_time_prototype.setUTCSeconds.apply(this._, arguments);
    },
    setTime: function () {
      d3_time_prototype.setTime.apply(this._, arguments);
    },
  };
  var d3_time_prototype = Date.prototype;
  d3.time.format = function (template) {
    var n = template.length;
    function format(date) {
      var string = [],
        i = -1,
        j = 0,
        c,
        f;
      while (++i < n) {
        if (template.charCodeAt(i) == 37) {
          string.push(
            template.substring(j, i),
            (f = d3_time_formats[(c = template.charAt(++i))]) ? f(date) : c
          );
          j = i + 1;
        }
      }
      string.push(template.substring(j, i));
      return string.join("");
    }
    format.parse = function (string) {
      var d = { y: 1900, m: 0, d: 1, H: 0, M: 0, S: 0, L: 0 },
        i = d3_time_parse(d, template, string, 0);
      if (i != string.length) return null;
      if ("p" in d) d.H = (d.H % 12) + d.p * 12;
      var date = new d3_time();
      date.setFullYear(d.y, d.m, d.d);
      date.setHours(d.H, d.M, d.S, d.L);
      return date;
    };
    format.toString = function () {
      return template;
    };
    return format;
  };
  function d3_time_parse(date, template, string, j) {
    var c,
      p,
      i = 0,
      n = template.length,
      m = string.length;
    while (i < n) {
      if (j >= m) return -1;
      c = template.charCodeAt(i++);
      if (c == 37) {
        p = d3_time_parsers[template.charAt(i++)];
        if (!p || (j = p(date, string, j)) < 0) return -1;
      } else if (c != string.charCodeAt(j++)) {
        return -1;
      }
    }
    return j;
  }
  var d3_time_zfill2 = d3.format("02d"),
    d3_time_zfill3 = d3.format("03d"),
    d3_time_zfill4 = d3.format("04d"),
    d3_time_sfill2 = d3.format("2d");
  var d3_time_formats = {
    a: function (d) {
      return d3_time_weekdays[d.getDay()].substring(0, 3);
    },
    A: function (d) {
      return d3_time_weekdays[d.getDay()];
    },
    b: function (d) {
      return d3_time_months[d.getMonth()].substring(0, 3);
    },
    B: function (d) {
      return d3_time_months[d.getMonth()];
    },
    c: d3.time.format("%a %b %e %H:%M:%S %Y"),
    d: function (d) {
      return d3_time_zfill2(d.getDate());
    },
    e: function (d) {
      return d3_time_sfill2(d.getDate());
    },
    H: function (d) {
      return d3_time_zfill2(d.getHours());
    },
    I: function (d) {
      return d3_time_zfill2(d.getHours() % 12 || 12);
    },
    j: function (d) {
      return d3_time_zfill3(1 + d3.time.dayOfYear(d));
    },
    L: function (d) {
      return d3_time_zfill3(d.getMilliseconds());
    },
    m: function (d) {
      return d3_time_zfill2(d.getMonth() + 1);
    },
    M: function (d) {
      return d3_time_zfill2(d.getMinutes());
    },
    p: function (d) {
      return d.getHours() >= 12 ? "PM" : "AM";
    },
    S: function (d) {
      return d3_time_zfill2(d.getSeconds());
    },
    U: function (d) {
      return d3_time_zfill2(d3.time.sundayOfYear(d));
    },
    w: function (d) {
      return d.getDay();
    },
    W: function (d) {
      return d3_time_zfill2(d3.time.mondayOfYear(d));
    },
    x: d3.time.format("%m/%d/%y"),
    X: d3.time.format("%H:%M:%S"),
    y: function (d) {
      return d3_time_zfill2(d.getFullYear() % 100);
    },
    Y: function (d) {
      return d3_time_zfill4(d.getFullYear() % 10000);
    },
    Z: d3_time_zone,
    "%": function (d) {
      return "%";
    },
  };
  var d3_time_parsers = {
    a: d3_time_parseWeekdayAbbrev,
    A: d3_time_parseWeekday,
    b: d3_time_parseMonthAbbrev,
    B: d3_time_parseMonth,
    c: d3_time_parseLocaleFull,
    d: d3_time_parseDay,
    e: d3_time_parseDay,
    H: d3_time_parseHour24,
    I: d3_time_parseHour24,
    L: d3_time_parseMilliseconds,
    m: d3_time_parseMonthNumber,
    M: d3_time_parseMinutes,
    p: d3_time_parseAmPm,
    S: d3_time_parseSeconds,
    x: d3_time_parseLocaleDate,
    X: d3_time_parseLocaleTime,
    y: d3_time_parseYear,
    Y: d3_time_parseFullYear,
  };
  function d3_time_parseWeekdayAbbrev(date, string, i) {
    return d3_time_weekdayAbbrevRe.test(string.substring(i, (i += 3))) ? i : -1;
  }
  function d3_time_parseWeekday(date, string, i) {
    d3_time_weekdayRe.lastIndex = 0;
    var n = d3_time_weekdayRe.exec(string.substring(i, i + 10));
    return n ? (i += n[0].length) : -1;
  }
  var d3_time_weekdayAbbrevRe = /^(?:sun|mon|tue|wed|thu|fri|sat)/i,
    d3_time_weekdayRe =
      /^(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i,
    d3_time_weekdays = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
  function d3_time_parseMonthAbbrev(date, string, i) {
    var n = d3_time_monthAbbrevLookup.get(
      string.substring(i, (i += 3)).toLowerCase()
    );
    return n == null ? -1 : ((date.m = n), i);
  }
  var d3_time_monthAbbrevLookup = d3.map({
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  });
  function d3_time_parseMonth(date, string, i) {
    d3_time_monthRe.lastIndex = 0;
    var n = d3_time_monthRe.exec(string.substring(i, i + 12));
    return n
      ? ((date.m = d3_time_monthLookup.get(n[0].toLowerCase())),
        (i += n[0].length))
      : -1;
  }
  var d3_time_monthRe =
    /^(?:January|February|March|April|May|June|July|August|September|October|November|December)/gi;
  var d3_time_monthLookup = d3.map({
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  });
  var d3_time_months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  function d3_time_parseLocaleFull(date, string, i) {
    return d3_time_parse(date, d3_time_formats.c.toString(), string, i);
  }
  function d3_time_parseLocaleDate(date, string, i) {
    return d3_time_parse(date, d3_time_formats.x.toString(), string, i);
  }
  function d3_time_parseLocaleTime(date, string, i) {
    return d3_time_parse(date, d3_time_formats.X.toString(), string, i);
  }
  function d3_time_parseFullYear(date, string, i) {
    d3_time_numberRe.lastIndex = 0;
    var n = d3_time_numberRe.exec(string.substring(i, i + 4));
    return n ? ((date.y = +n[0]), (i += n[0].length)) : -1;
  }
  function d3_time_parseYear(date, string, i) {
    d3_time_numberRe.lastIndex = 0;
    var n = d3_time_numberRe.exec(string.substring(i, i + 2));
    return n ? ((date.y = d3_time_century() + +n[0]), (i += n[0].length)) : -1;
  }
  function d3_time_century() {
    return ~~(new Date().getFullYear() / 1000) * 1000;
  }
  function d3_time_parseMonthNumber(date, string, i) {
    d3_time_numberRe.lastIndex = 0;
    var n = d3_time_numberRe.exec(string.substring(i, i + 2));
    return n ? ((date.m = n[0] - 1), (i += n[0].length)) : -1;
  }
  function d3_time_parseDay(date, string, i) {
    d3_time_numberRe.lastIndex = 0;
    var n = d3_time_numberRe.exec(string.substring(i, i + 2));
    return n ? ((date.d = +n[0]), (i += n[0].length)) : -1;
  }
  function d3_time_parseHour24(date, string, i) {
    d3_time_numberRe.lastIndex = 0;
    var n = d3_time_numberRe.exec(string.substring(i, i + 2));
    return n ? ((date.H = +n[0]), (i += n[0].length)) : -1;
  }
  function d3_time_parseMinutes(date, string, i) {
    d3_time_numberRe.lastIndex = 0;
    var n = d3_time_numberRe.exec(string.substring(i, i + 2));
    return n ? ((date.M = +n[0]), (i += n[0].length)) : -1;
  }
  function d3_time_parseSeconds(date, string, i) {
    d3_time_numberRe.lastIndex = 0;
    var n = d3_time_numberRe.exec(string.substring(i, i + 2));
    return n ? ((date.S = +n[0]), (i += n[0].length)) : -1;
  }
  function d3_time_parseMilliseconds(date, string, i) {
    d3_time_numberRe.lastIndex = 0;
    var n = d3_time_numberRe.exec(string.substring(i, i + 3));
    return n ? ((date.L = +n[0]), (i += n[0].length)) : -1;
  }
  var d3_time_numberRe = /\s*\d+/;
  function d3_time_parseAmPm(date, string, i) {
    var n = d3_time_amPmLookup.get(string.substring(i, (i += 2)).toLowerCase());
    return n == null ? -1 : ((date.p = n), i);
  }
  var d3_time_amPmLookup = d3.map({ am: 0, pm: 1 });
  function d3_time_zone(d) {
    var z = d.getTimezoneOffset(),
      zs = z > 0 ? "-" : "+",
      zh = ~~(Math.abs(z) / 60),
      zm = Math.abs(z) % 60;
    return zs + d3_time_zfill2(zh) + d3_time_zfill2(zm);
  }
  d3.time.format.utc = function (template) {
    var local = d3.time.format(template);
    function format(date) {
      try {
        d3_time = d3_time_utc;
        var utc = new d3_time();
        utc._ = date;
        return local(utc);
      } finally {
        d3_time = Date;
      }
    }
    format.parse = function (string) {
      try {
        d3_time = d3_time_utc;
        var date = local.parse(string);
        return date && date._;
      } finally {
        d3_time = Date;
      }
    };
    format.toString = local.toString;
    return format;
  };
  var d3_time_formatIso = d3.time.format.utc("%Y-%m-%dT%H:%M:%S.%LZ");
  d3.time.format.iso = Date.prototype.toISOString
    ? d3_time_formatIsoNative
    : d3_time_formatIso;
  function d3_time_formatIsoNative(date) {
    return date.toISOString();
  }
  d3_time_formatIsoNative.parse = function (string) {
    var date = new Date(string);
    return isNaN(date) ? null : date;
  };
  d3_time_formatIsoNative.toString = d3_time_formatIso.toString;
  function d3_time_interval(local, step, number) {
    function round(date) {
      var d0 = local(date),
        d1 = offset(d0, 1);
      return date - d0 < d1 - date ? d0 : d1;
    }
    function ceil(date) {
      step((date = local(new d3_time(date - 1))), 1);
      return date;
    }
    function offset(date, k) {
      step((date = new d3_time(+date)), k);
      return date;
    }
    function range(t0, t1, dt) {
      var time = ceil(t0),
        times = [];
      if (dt > 1) {
        while (time < t1) {
          if (!(number(time) % dt)) times.push(new Date(+time));
          step(time, 1);
        }
      } else {
        while (time < t1) times.push(new Date(+time)), step(time, 1);
      }
      return times;
    }
    function range_utc(t0, t1, dt) {
      try {
        d3_time = d3_time_utc;
        var utc = new d3_time_utc();
        utc._ = t0;
        return range(utc, t1, dt);
      } finally {
        d3_time = Date;
      }
    }
    local.floor = local;
    local.round = round;
    local.ceil = ceil;
    local.offset = offset;
    local.range = range;
    var utc = (local.utc = d3_time_interval_utc(local));
    utc.floor = utc;
    utc.round = d3_time_interval_utc(round);
    utc.ceil = d3_time_interval_utc(ceil);
    utc.offset = d3_time_interval_utc(offset);
    utc.range = range_utc;
    return local;
  }
  function d3_time_interval_utc(method) {
    return function (date, k) {
      try {
        d3_time = d3_time_utc;
        var utc = new d3_time_utc();
        utc._ = date;
        return method(utc, k)._;
      } finally {
        d3_time = Date;
      }
    };
  }
  d3.time.second = d3_time_interval(
    function (date) {
      return new d3_time(Math.floor(date / 1e3) * 1e3);
    },
    function (date, offset) {
      date.setTime(date.getTime() + Math.floor(offset) * 1e3);
    },
    function (date) {
      return date.getSeconds();
    }
  );
  d3.time.seconds = d3.time.second.range;
  d3.time.seconds.utc = d3.time.second.utc.range;
  d3.time.minute = d3_time_interval(
    function (date) {
      return new d3_time(Math.floor(date / 6e4) * 6e4);
    },
    function (date, offset) {
      date.setTime(date.getTime() + Math.floor(offset) * 6e4);
    },
    function (date) {
      return date.getMinutes();
    }
  );
  d3.time.minutes = d3.time.minute.range;
  d3.time.minutes.utc = d3.time.minute.utc.range;
  d3.time.hour = d3_time_interval(
    function (date) {
      var timezone = date.getTimezoneOffset() / 60;
      return new d3_time(
        (Math.floor(date / 36e5 - timezone) + timezone) * 36e5
      );
    },
    function (date, offset) {
      date.setTime(date.getTime() + Math.floor(offset) * 36e5);
    },
    function (date) {
      return date.getHours();
    }
  );
  d3.time.hours = d3.time.hour.range;
  d3.time.hours.utc = d3.time.hour.utc.range;
  d3.time.day = d3_time_interval(
    function (date) {
      return new d3_time(date.getFullYear(), date.getMonth(), date.getDate());
    },
    function (date, offset) {
      date.setDate(date.getDate() + offset);
    },
    function (date) {
      return date.getDate() - 1;
    }
  );
  d3.time.days = d3.time.day.range;
  d3.time.days.utc = d3.time.day.utc.range;
  d3.time.dayOfYear = function (date) {
    var year = d3.time.year(date);
    return Math.floor(
      (date - year) / 864e5 -
        (date.getTimezoneOffset() - year.getTimezoneOffset()) / 1440
    );
  };
  d3_time_weekdays.forEach(function (day, i) {
    day = day.toLowerCase();
    i = 7 - i;
    var interval = (d3.time[day] = d3_time_interval(
      function (date) {
        (date = d3.time.day(date)).setDate(
          date.getDate() - ((date.getDay() + i) % 7)
        );
        return date;
      },
      function (date, offset) {
        date.setDate(date.getDate() + Math.floor(offset) * 7);
      },
      function (date) {
        var day = d3.time.year(date).getDay();
        return (
          Math.floor((d3.time.dayOfYear(date) + ((day + i) % 7)) / 7) -
          (day !== i)
        );
      }
    ));
    d3.time[day + "s"] = interval.range;
    d3.time[day + "s"].utc = interval.utc.range;
    d3.time[day + "OfYear"] = function (date) {
      var day = d3.time.year(date).getDay();
      return Math.floor((d3.time.dayOfYear(date) + ((day + i) % 7)) / 7);
    };
  });
  d3.time.week = d3.time.sunday;
  d3.time.weeks = d3.time.sunday.range;
  d3.time.weeks.utc = d3.time.sunday.utc.range;
  d3.time.weekOfYear = d3.time.sundayOfYear;
  d3.time.month = d3_time_interval(
    function (date) {
      return new d3_time(date.getFullYear(), date.getMonth(), 1);
    },
    function (date, offset) {
      date.setMonth(date.getMonth() + offset);
    },
    function (date) {
      return date.getMonth();
    }
  );
  d3.time.months = d3.time.month.range;
  d3.time.months.utc = d3.time.month.utc.range;
  d3.time.year = d3_time_interval(
    function (date) {
      return new d3_time(date.getFullYear(), 0, 1);
    },
    function (date, offset) {
      date.setFullYear(date.getFullYear() + offset);
    },
    function (date) {
      return date.getFullYear();
    }
  );
  d3.time.years = d3.time.year.range;
  d3.time.years.utc = d3.time.year.utc.range;
  function d3_time_scale(linear, methods, format) {
    function scale(x) {
      return linear(x);
    }
    scale.invert = function (x) {
      return d3_time_scaleDate(linear.invert(x));
    };
    scale.domain = function (x) {
      if (!arguments.length) return linear.domain().map(d3_time_scaleDate);
      linear.domain(x);
      return scale;
    };
    scale.nice = function (m) {
      var extent = d3_time_scaleExtent(scale.domain());
      return scale.domain([m.floor(extent[0]), m.ceil(extent[1])]);
    };
    scale.ticks = function (m, k) {
      var extent = d3_time_scaleExtent(scale.domain());
      if (typeof m !== "function") {
        var span = extent[1] - extent[0],
          target = span / m,
          i = d3.bisect(d3_time_scaleSteps, target);
        if (i == d3_time_scaleSteps.length) return methods.year(extent, m);
        if (!i) return linear.ticks(m).map(d3_time_scaleDate);
        if (
          Math.log(target / d3_time_scaleSteps[i - 1]) <
          Math.log(d3_time_scaleSteps[i] / target)
        )
          --i;
        m = methods[i];
        k = m[1];
        m = m[0].range;
      }
      return m(extent[0], new Date(+extent[1] + 1), k);
    };
    scale.tickFormat = function () {
      return format;
    };
    scale.copy = function () {
      return d3_time_scale(linear.copy(), methods, format);
    };
    return d3.rebind(
      scale,
      linear,
      "range",
      "rangeRound",
      "interpolate",
      "clamp"
    );
  }
  function d3_time_scaleExtent(domain) {
    var start = domain[0],
      stop = domain[domain.length - 1];
    return start < stop ? [start, stop] : [stop, start];
  }
  function d3_time_scaleDate(t) {
    return new Date(t);
  }
  function d3_time_scaleFormat(formats) {
    return function (date) {
      var i = formats.length - 1,
        f = formats[i];
      while (!f[1](date)) f = formats[--i];
      return f[0](date);
    };
  }
  function d3_time_scaleSetYear(y) {
    var d = new Date(y, 0, 1);
    d.setFullYear(y);
    return d;
  }
  function d3_time_scaleGetYear(d) {
    var y = d.getFullYear(),
      d0 = d3_time_scaleSetYear(y),
      d1 = d3_time_scaleSetYear(y + 1);
    return y + (d - d0) / (d1 - d0);
  }
  var d3_time_scaleSteps = [
    1e3, 5e3, 15e3, 3e4, 6e4, 3e5, 9e5, 18e5, 36e5, 108e5, 216e5, 432e5, 864e5,
    1728e5, 6048e5, 2592e6, 7776e6, 31536e6,
  ];
  var d3_time_scaleLocalMethods = [
    [d3.time.second, 1],
    [d3.time.second, 5],
    [d3.time.second, 15],
    [d3.time.second, 30],
    [d3.time.minute, 1],
    [d3.time.minute, 5],
    [d3.time.minute, 15],
    [d3.time.minute, 30],
    [d3.time.hour, 1],
    [d3.time.hour, 3],
    [d3.time.hour, 6],
    [d3.time.hour, 12],
    [d3.time.day, 1],
    [d3.time.day, 2],
    [d3.time.week, 1],
    [d3.time.month, 1],
    [d3.time.month, 3],
    [d3.time.year, 1],
  ];
  var d3_time_scaleLocalFormats = [
    [
      d3.time.format("%Y"),
      function (d) {
        return true;
      },
    ],
    [
      d3.time.format("%B"),
      function (d) {
        return d.getMonth();
      },
    ],
    [
      d3.time.format("%b %d"),
      function (d) {
        return d.getDate() != 1;
      },
    ],
    [
      d3.time.format("%a %d"),
      function (d) {
        return d.getDay() && d.getDate() != 1;
      },
    ],
    [
      d3.time.format("%I %p"),
      function (d) {
        return d.getHours();
      },
    ],
    [
      d3.time.format("%I:%M"),
      function (d) {
        return d.getMinutes();
      },
    ],
    [
      d3.time.format(":%S"),
      function (d) {
        return d.getSeconds();
      },
    ],
    [
      d3.time.format(".%L"),
      function (d) {
        return d.getMilliseconds();
      },
    ],
  ];
  var d3_time_scaleLinear = d3.scale.linear(),
    d3_time_scaleLocalFormat = d3_time_scaleFormat(d3_time_scaleLocalFormats);
  d3_time_scaleLocalMethods.year = function (extent, m) {
    return d3_time_scaleLinear
      .domain(extent.map(d3_time_scaleGetYear))
      .ticks(m)
      .map(d3_time_scaleSetYear);
  };
  d3.time.scale = function () {
    return d3_time_scale(
      d3.scale.linear(),
      d3_time_scaleLocalMethods,
      d3_time_scaleLocalFormat
    );
  };
  var d3_time_scaleUTCMethods = d3_time_scaleLocalMethods.map(function (m) {
    return [m[0].utc, m[1]];
  });
  var d3_time_scaleUTCFormats = [
    [
      d3.time.format.utc("%Y"),
      function (d) {
        return true;
      },
    ],
    [
      d3.time.format.utc("%B"),
      function (d) {
        return d.getUTCMonth();
      },
    ],
    [
      d3.time.format.utc("%b %d"),
      function (d) {
        return d.getUTCDate() != 1;
      },
    ],
    [
      d3.time.format.utc("%a %d"),
      function (d) {
        return d.getUTCDay() && d.getUTCDate() != 1;
      },
    ],
    [
      d3.time.format.utc("%I %p"),
      function (d) {
        return d.getUTCHours();
      },
    ],
    [
      d3.time.format.utc("%I:%M"),
      function (d) {
        return d.getUTCMinutes();
      },
    ],
    [
      d3.time.format.utc(":%S"),
      function (d) {
        return d.getUTCSeconds();
      },
    ],
    [
      d3.time.format.utc(".%L"),
      function (d) {
        return d.getUTCMilliseconds();
      },
    ],
  ];
  var d3_time_scaleUTCFormat = d3_time_scaleFormat(d3_time_scaleUTCFormats);
  function d3_time_scaleUTCSetYear(y) {
    var d = new Date(Date.UTC(y, 0, 1));
    d.setUTCFullYear(y);
    return d;
  }
  function d3_time_scaleUTCGetYear(d) {
    var y = d.getUTCFullYear(),
      d0 = d3_time_scaleUTCSetYear(y),
      d1 = d3_time_scaleUTCSetYear(y + 1);
    return y + (d - d0) / (d1 - d0);
  }
  d3_time_scaleUTCMethods.year = function (extent, m) {
    return d3_time_scaleLinear
      .domain(extent.map(d3_time_scaleUTCGetYear))
      .ticks(m)
      .map(d3_time_scaleUTCSetYear);
  };
  d3.time.scale.utc = function () {
    return d3_time_scale(
      d3.scale.linear(),
      d3_time_scaleUTCMethods,
      d3_time_scaleUTCFormat
    );
  };
})();
(function () {
  "use strict";
  var bindonceModule = angular.module("pasvaz.bindonce", []);
  bindonceModule.directive("bindonce", function () {
    var toBoolean = function (value) {
      if (value && value.length !== 0) {
        var v = angular.lowercase("" + value);
        value = !(
          v === "f" ||
          v === "0" ||
          v === "false" ||
          v === "no" ||
          v === "n" ||
          v === "[]"
        );
      } else {
        value = false;
      }
      return value;
    };
    var msie = parseInt(
      (/msie (\d+)/.exec(angular.lowercase(navigator.userAgent)) || [])[1],
      10
    );
    if (isNaN(msie)) {
      msie = parseInt(
        (/trident\/.*; rv:(\d+)/.exec(angular.lowercase(navigator.userAgent)) ||
          [])[1],
        10
      );
    }
    var bindonceDirective = {
      restrict: "AM",
      controller: [
        "$scope",
        "$element",
        "$attrs",
        "$interpolate",
        function ($scope, $element, $attrs, $interpolate) {
          var showHideBinder = function (elm, attr, value) {
            var show = attr === "show" ? "" : "none";
            var hide = attr === "hide" ? "" : "none";
            elm.css("display", toBoolean(value) ? show : hide);
          };
          var classBinder = function (elm, value) {
            if (angular.isObject(value) && !angular.isArray(value)) {
              var results = [];
              angular.forEach(value, function (value, index) {
                if (value) results.push(index);
              });
              value = results;
            }
            if (value) {
              elm.addClass(angular.isArray(value) ? value.join(" ") : value);
            }
          };
          var ctrl = {
            watcherRemover: undefined,
            binders: [],
            group: $attrs.boName,
            element: $element,
            ran: false,
            addBinder: function (binder) {
              this.binders.push(binder);
              if (this.ran) {
                this.runBinders();
              }
            },
            setupWatcher: function (bindonceValue) {
              var that = this;
              this.watcherRemover = $scope.$watch(
                bindonceValue,
                function (newValue) {
                  if (newValue === undefined) return;
                  that.removeWatcher();
                  that.runBinders();
                },
                true
              );
            },
            removeWatcher: function () {
              if (this.watcherRemover !== undefined) {
                this.watcherRemover();
                this.watcherRemover = undefined;
              }
            },
            runBinders: function () {
              while (this.binders.length > 0) {
                var binder = this.binders.shift();
                if (this.group && this.group != binder.group) continue;
                var value = binder.scope.$eval(
                  binder.interpolate ? $interpolate(binder.value) : binder.value
                );
                switch (binder.attr) {
                  case "boIf":
                    if (toBoolean(value)) {
                      binder.transclude(binder.scope.$new(), function (clone) {
                        var parent = binder.element.parent();
                        var afterNode =
                          binder.element &&
                          binder.element[binder.element.length - 1];
                        var parentNode =
                          (parent && parent[0]) ||
                          (afterNode && afterNode.parentNode);
                        var afterNextSibling =
                          (afterNode && afterNode.nextSibling) || null;
                        angular.forEach(clone, function (node) {
                          parentNode.insertBefore(node, afterNextSibling);
                        });
                      });
                    }
                    break;
                  case "boSwitch":
                    var selectedTranscludes,
                      switchCtrl = binder.controller[0];
                    if (
                      (selectedTranscludes =
                        switchCtrl.cases["!" + value] || switchCtrl.cases["?"])
                    ) {
                      binder.scope.$eval(binder.attrs.change);
                      angular.forEach(
                        selectedTranscludes,
                        function (selectedTransclude) {
                          selectedTransclude.transclude(
                            binder.scope.$new(),
                            function (clone) {
                              var parent = selectedTransclude.element.parent();
                              var afterNode =
                                selectedTransclude.element &&
                                selectedTransclude.element[
                                  selectedTransclude.element.length - 1
                                ];
                              var parentNode =
                                (parent && parent[0]) ||
                                (afterNode && afterNode.parentNode);
                              var afterNextSibling =
                                (afterNode && afterNode.nextSibling) || null;
                              angular.forEach(clone, function (node) {
                                parentNode.insertBefore(node, afterNextSibling);
                              });
                            }
                          );
                        }
                      );
                    }
                    break;
                  case "boSwitchWhen":
                    var ctrl = binder.controller[0];
                    ctrl.cases["!" + binder.attrs.boSwitchWhen] =
                      ctrl.cases["!" + binder.attrs.boSwitchWhen] || [];
                    ctrl.cases["!" + binder.attrs.boSwitchWhen].push({
                      transclude: binder.transclude,
                      element: binder.element,
                    });
                    break;
                  case "boSwitchDefault":
                    var ctrl = binder.controller[0];
                    ctrl.cases["?"] = ctrl.cases["?"] || [];
                    ctrl.cases["?"].push({
                      transclude: binder.transclude,
                      element: binder.element,
                    });
                    break;
                  case "hide":
                  case "show":
                    showHideBinder(binder.element, binder.attr, value);
                    break;
                  case "class":
                    classBinder(binder.element, value);
                    break;
                  case "text":
                    binder.element.text(value);
                    break;
                  case "html":
                    binder.element.html(value);
                    break;
                  case "style":
                    binder.element.css(value);
                    break;
                  case "src":
                    binder.element.attr(binder.attr, value);
                    if (msie) binder.element.prop("src", value);
                    break;
                  case "attr":
                    angular.forEach(
                      binder.attrs,
                      function (attrValue, attrKey) {
                        var newAttr, newValue;
                        if (
                          attrKey.match(/^boAttr./) &&
                          binder.attrs[attrKey]
                        ) {
                          newAttr = attrKey
                            .replace(/^boAttr/, "")
                            .replace(/([a-z])([A-Z])/g, "$1-$2")
                            .toLowerCase();
                          newValue = binder.scope.$eval(binder.attrs[attrKey]);
                          binder.element.attr(newAttr, newValue);
                        }
                      }
                    );
                    break;
                  case "href":
                  case "alt":
                  case "title":
                  case "id":
                  case "value":
                    binder.element.attr(binder.attr, value);
                    break;
                }
              }
              this.ran = true;
            },
          };
          return ctrl;
        },
      ],
      link: function (scope, elm, attrs, bindonceController) {
        var value = attrs.bindonce ? scope.$eval(attrs.bindonce) : true;
        if (value !== undefined) {
          bindonceController.runBinders();
        } else {
          bindonceController.setupWatcher(attrs.bindonce);
          elm.bind("$destroy", bindonceController.removeWatcher);
        }
      },
    };
    return bindonceDirective;
  });
  angular.forEach(
    [
      { directiveName: "boShow", attribute: "show" },
      { directiveName: "boHide", attribute: "hide" },
      { directiveName: "boClass", attribute: "class" },
      { directiveName: "boText", attribute: "text" },
      { directiveName: "boHtml", attribute: "html" },
      { directiveName: "boSrcI", attribute: "src", interpolate: true },
      { directiveName: "boSrc", attribute: "src" },
      { directiveName: "boHrefI", attribute: "href", interpolate: true },
      { directiveName: "boHref", attribute: "href" },
      { directiveName: "boAlt", attribute: "alt" },
      { directiveName: "boTitle", attribute: "title" },
      { directiveName: "boId", attribute: "id" },
      { directiveName: "boStyle", attribute: "style" },
      { directiveName: "boValue", attribute: "value" },
      { directiveName: "boAttr", attribute: "attr" },
      {
        directiveName: "boIf",
        transclude: "element",
        terminal: true,
        priority: 1e3,
      },
      {
        directiveName: "boSwitch",
        require: "boSwitch",
        controller: function () {
          this.cases = {};
        },
      },
      {
        directiveName: "boSwitchWhen",
        transclude: "element",
        priority: 800,
        require: "^boSwitch",
      },
      {
        directiveName: "boSwitchDefault",
        transclude: "element",
        priority: 800,
        require: "^boSwitch",
      },
    ],
    function (boDirective) {
      var childPriority = 200;
      return bindonceModule.directive(boDirective.directiveName, function () {
        var bindonceDirective = {
          priority: boDirective.priority || childPriority,
          transclude: boDirective.transclude || false,
          terminal: boDirective.terminal || false,
          require: ["^bindonce"].concat(boDirective.require || []),
          controller: boDirective.controller,
          compile: function (tElement, tAttrs, transclude) {
            return function (scope, elm, attrs, controllers) {
              var bindonceController = controllers[0];
              var name = attrs.boParent;
              if (name && bindonceController.group !== name) {
                var element = bindonceController.element.parent();
                bindonceController = undefined;
                var parentValue;
                while (element[0].nodeType !== 9 && element.length) {
                  if (
                    (parentValue = element.data("$bindonceController")) &&
                    parentValue.group === name
                  ) {
                    bindonceController = parentValue;
                    break;
                  }
                  element = element.parent();
                }
                if (!bindonceController) {
                  throw new Error("No bindonce controller: " + name);
                }
              }
              bindonceController.addBinder({
                element: elm,
                attr: boDirective.attribute || boDirective.directiveName,
                attrs: attrs,
                value: attrs[boDirective.directiveName],
                interpolate: boDirective.interpolate,
                group: name,
                transclude: transclude,
                controller: controllers.slice(1),
                scope: scope,
              });
            };
          },
        };
        return bindonceDirective;
      });
    }
  );
})();
window.OrbitDiagram = (function () {
  "use strict";
  function OrbitDiagram(selector, options) {
    this.$e = $(selector);
    this.selector = selector;
    this.orbit_svg = null;
    options = options || {};
    this.DIAGRAM_HEIGHT = options.diagram_height || 170;
    this.DIAGRAM_WIDTH = options.diagram_width || 300;
    this.SUN_X = options.sun_x || this.DIAGRAM_WIDTH / 2;
    this.SUN_Y = options.sun_y || this.DIAGRAM_HEIGHT / 2 - 10;
    this.DIAGRAM_AU_FACTOR = options.diagram_au_factor || 50;
  }
  OrbitDiagram.prototype.prepareRender = function () {
    this.$e.empty();
    this.orbit_svg = d3
      .select(this.selector)
      .append("svg:svg")
      .attr("width", this.DIAGRAM_WIDTH)
      .attr("height", this.DIAGRAM_HEIGHT);
    this.plotSun();
  };
  OrbitDiagram.prototype.renderPlanets = function () {
    this.plotEarth();
    this.plotVenus();
    this.plotMercury();
    this.plotMars();
  };
  OrbitDiagram.prototype.render = function (a, e, w) {
    this.prepareRender();
    this.renderPlanets();
    return this.renderAnother(a, e, w);
  };
  OrbitDiagram.prototype.renderAnother = function (a, e, w) {
    return this.plotOrbit(a, e, w, "white");
  };
  OrbitDiagram.prototype.plotOrbit = function (a, e, w, color) {
    var sqrtme = 1 - e * e;
    var b = a * Math.sqrt(Math.max(0, sqrtme));
    var f = a * e;
    var rx = b * this.DIAGRAM_AU_FACTOR;
    var ry = Math.abs(a * this.DIAGRAM_AU_FACTOR);
    var foci = f * this.DIAGRAM_AU_FACTOR;
    return this.plotCoords(rx, ry, foci, w, color);
  };
  OrbitDiagram.prototype.plotCoords = function (rx, ry, f, rotate_deg, color) {
    color = color || "white";
    var cx = this.SUN_X;
    var cy = this.SUN_Y + f;
    return this.orbit_svg
      .append("svg:ellipse")
      .style("stroke", color)
      .style("fill", "none")
      .attr("rx", rx)
      .attr("ry", ry)
      .attr("cx", cx)
      .attr("cy", cy)
      .attr(
        "transform",
        "rotate(" + rotate_deg + ", " + this.SUN_X + ", " + this.SUN_Y + ")"
      );
  };
  OrbitDiagram.prototype.plotSun = function () {
    this.orbit_svg
      .append("svg:ellipse")
      .style("stroke", "yellow")
      .style("fill", "yellow")
      .attr("rx", 2)
      .attr("ry", 2)
      .attr("cx", this.SUN_X)
      .attr("cy", this.SUN_Y);
  };
  OrbitDiagram.prototype.plotEarth = function () {
    this.plotOrbit(1.00000011, 0.01671022, 102.93768193, "cyan");
  };
  OrbitDiagram.prototype.plotJupiter = function () {
    this.plotOrbit(5.20336301, 0.04839266, 14.72847983, "orange");
  };
  OrbitDiagram.prototype.plotMars = function () {
    this.plotOrbit(1.52366231, 0.0935, 336.04084, "red");
  };
  OrbitDiagram.prototype.plotVenus = function () {
    this.plotOrbit(0.72333199, 0.00677323, 131.60246718, "orange");
  };
  OrbitDiagram.prototype.plotMercury = function () {
    this.plotOrbit(0.38709893, 0.20563069, 77.45779628, "purple");
  };
  return OrbitDiagram;
})();
function SimpleCache(hash_fn) {
  var me = this;
  hash_fn =
    hash_fn ||
    function (x) {
      return x;
    };
  var cache = {};
  me.Get = function (key) {
    var result = cache[hash_fn(key)];
    return result ? result : false;
  };
  me.Set = function (key, val) {
    cache[hash_fn(key)] = val;
  };
}
if (!Object.keys) {
  Object.keys = (function () {
    var hasOwnProperty = Object.prototype.hasOwnProperty,
      hasDontEnumBug = !{ toString: null }.propertyIsEnumerable("toString"),
      dontEnums = [
        "toString",
        "toLocaleString",
        "valueOf",
        "hasOwnProperty",
        "isPrototypeOf",
        "propertyIsEnumerable",
        "constructor",
      ],
      dontEnumsLength = dontEnums.length;
    return function (obj) {
      if (
        (typeof obj !== "object" && typeof obj !== "function") ||
        obj === null
      )
        throw new TypeError("Object.keys called on non-object");
      var result = [];
      for (var prop in obj) {
        if (hasOwnProperty.call(obj, prop)) result.push(prop);
      }
      if (hasDontEnumBug) {
        for (var i = 0; i < dontEnumsLength; i++) {
          if (hasOwnProperty.call(obj, dontEnums[i])) result.push(dontEnums[i]);
        }
      }
      return result;
    };
  })();
}
function getURLParameter(name) {
  return (
    decodeURIComponent(
      (new RegExp("[?|&]" + name + "=" + "([^&;]+?)(&|#|;|$)").exec(
        location.search
      ) || [, ""])[1].replace(/\+/g, "%20")
    ) || null
  );
}
(function () {
  "use strict";
  var fuzzes = [
    { word: "trillion", num: 1000000000000 },
    { word: "billion", num: 1000000000 },
    { word: "million", num: 1000000 },
  ];
  function toFuzz(n) {
    if (n < 0.1) {
      return 0;
    }
    for (var i = 0; i < fuzzes.length; i++) {
      var x = fuzzes[i];
      if (n / x.num >= 1) {
        var prefix = n / x.num;
        if (i == 0 && prefix > 100) return ">100 " + x.word;
        return prefix.toFixed(2) + " " + x.word;
      }
    }
    return n;
  }
  function truncateText(txt, len) {
    if (txt.length > len) {
      txt = txt.substring(0, len - 3) + "...";
    }
    return txt;
  }
  function sizeContainers() {
    var $tc = $("#top-container");
    var $bc = $("#bottom-container");
    var wh = $(window).height();
    var tch = wh / 2 - $tc.offset().top - 25;
    $tc.height(tch);
    var bch = wh - $tc.height() - $tc.offset().top - 25;
    $bc.height(bch);
    var $rs = $("#right-side");
    var $ls = $("#left-side");
    var ww = $(window).width();
    $("#webgl-container").height(bch).width(ww);
    $ls.width(ww * 0.3);
    $rs.width(ww - $ls.width() - 75);
    $rs.height(tch);
    $ls.height(tch);
    $("#results-table-container").height($ls.height() - 15);
  }
  sizeContainers();
  $(window).on("resize", function () {
    sizeContainers();
  });
  var mod = angular
    .module("AsterankApp", [
      "asterank.filters",
      "asterank.directives",
      "ui.bootstrap",
      "pasvaz.bindonce",
    ])
    .config(function ($interpolateProvider) {
      $interpolateProvider.startSymbol("[[").endSymbol("]]");
    });
  angular
    .module("asterank.filters", [])
    .filter("fuzzynum", function () {
      return function (num) {
        return toFuzz(num);
      };
    })
    .filter("truncate", function () {
      return function (txt) {
        return truncateText(txt);
      };
    })
    .filter("ifempty", function () {
      return function (s1, s2) {
        if (!s1) return s2;
        return s1;
      };
    });
  angular.module("asterank.directives", []).directive("bsTooltip", function () {
    return {
      link: function (scope, elt, attrs) {
        $(elt).tooltip();
      },
    };
  });
  mod.factory("pubsub", function () {
    var cache = {};
    return {
      publish: function (topic, args) {
        cache[topic] &&
          $.each(cache[topic], function () {
            this.apply(null, args || []);
          });
      },
      subscribe: function (topic, callback) {
        if (!cache[topic]) {
          cache[topic] = [];
        }
        cache[topic].push(callback);
        return [topic, callback];
      },
      unsubscribe: function (handle) {
        var t = handle[0];
        cache[t] &&
          d.each(cache[t], function (idx) {
            if (this == handle[1]) {
              cache[t].splice(idx, 1);
            }
          });
      },
    };
  });
  mod.directive("autocomplete", function () {
    return {
      restrict: "A",
      replace: true,
      transclude: true,
      template:
        '<div style="display:inline"><input class="input" type="text" placeholder="eg. 433 Eros" style="height:15px;font-size:12px;"/>' +
        '<div id="asteroid-lookup-suggestions"></div></div>',
      link: function ($scope, element, attrs) {
        var $el = $(element).find("input");
        $el.autocomplete({
          minChars: 3,
          serviceUrl: "/asterank/api/autocomplete",
          paramName: "query",
          transformResult: function (resp) {
            return $.map(resp, function (item) {
              return { value: item.full_name, data: item };
            });
          },
          onSelect: function (suggestion) {
            $scope.Lookup(suggestion);
          },
          appendTo: "#asteroid-lookup-suggestions",
        });
      },
    };
  });
})();
angular.module("ui.bootstrap", ["ui.bootstrap.tpls", "ui.bootstrap.modal"]);
angular.module("ui.bootstrap.tpls", []);
angular
  .module("ui.bootstrap.modal", ["ui.bootstrap.dialog"])
  .directive("modal", [
    "$parse",
    "$dialog",
    function ($parse, $dialog) {
      return {
        restrict: "EA",
        terminal: true,
        link: function (scope, elm, attrs) {
          var opts = angular.extend(
            {},
            scope.$eval(attrs.uiOptions || attrs.bsOptions || attrs.options)
          );
          var shownExpr = attrs.modal || attrs.show;
          var setClosed;
          opts = angular.extend(opts, {
            template: elm.html(),
            resolve: {
              $scope: function () {
                return scope;
              },
            },
          });
          var dialog = $dialog.dialog(opts);
          elm.remove();
          if (attrs.close) {
            setClosed = function () {
              $parse(attrs.close)(scope);
            };
          } else {
            setClosed = function () {
              if (angular.isFunction($parse(shownExpr).assign)) {
                $parse(shownExpr).assign(scope, false);
              }
            };
          }
          scope.$watch(shownExpr, function (isShown, oldShown) {
            if (isShown) {
              dialog.open().then(function () {
                setClosed();
              });
            } else {
              if (dialog.isOpen()) {
                dialog.close();
              }
            }
          });
        },
      };
    },
  ]);
var dialogModule = angular.module("ui.bootstrap.dialog", [
  "ui.bootstrap.transition",
]);
dialogModule.controller("MessageBoxController", [
  "$scope",
  "dialog",
  "model",
  function ($scope, dialog, model) {
    $scope.title = model.title;
    $scope.message = model.message;
    $scope.buttons = model.buttons;
    $scope.close = function (res) {
      dialog.close(res);
    };
  },
]);
dialogModule.provider("$dialog", function () {
  var defaults = {
    backdrop: true,
    dialogClass: "modal",
    backdropClass: "modal-backdrop",
    transitionClass: "fade",
    triggerClass: "in",
    dialogOpenClass: "modal-open",
    resolve: {},
    backdropFade: false,
    dialogFade: false,
    keyboard: true,
    backdropClick: true,
  };
  var globalOptions = {};
  var activeBackdrops = { value: 0 };
  this.options = function (value) {
    globalOptions = value;
  };
  this.$get = [
    "$http",
    "$document",
    "$compile",
    "$rootScope",
    "$controller",
    "$templateCache",
    "$q",
    "$transition",
    "$injector",
    function (
      $http,
      $document,
      $compile,
      $rootScope,
      $controller,
      $templateCache,
      $q,
      $transition,
      $injector
    ) {
      var body = $document.find("body");
      function createElement(clazz) {
        var el = angular.element("<div>");
        el.addClass(clazz);
        return el;
      }
      function Dialog(opts) {
        var self = this,
          options = (this.options = angular.extend(
            {},
            defaults,
            globalOptions,
            opts
          ));
        this._open = false;
        this.backdropEl = createElement(options.backdropClass);
        if (options.backdropFade) {
          this.backdropEl.addClass(options.transitionClass);
          this.backdropEl.removeClass(options.triggerClass);
        }
        this.modalEl = createElement(options.dialogClass);
        if (options.dialogFade) {
          this.modalEl.addClass(options.transitionClass);
          this.modalEl.removeClass(options.triggerClass);
        }
        this.handledEscapeKey = function (e) {
          if (e.which === 27) {
            self.close();
            e.preventDefault();
            self.$scope.$apply();
          }
        };
        this.handleBackDropClick = function (e) {
          self.close();
          e.preventDefault();
          self.$scope.$apply();
        };
      }
      Dialog.prototype.isOpen = function () {
        return this._open;
      };
      Dialog.prototype.open = function (templateUrl, controller) {
        var self = this,
          options = this.options;
        if (templateUrl) {
          options.templateUrl = templateUrl;
        }
        if (controller) {
          options.controller = controller;
        }
        if (!(options.template || options.templateUrl)) {
          throw new Error(
            "Dialog.open expected template or templateUrl, neither found. Use options or open method to specify them."
          );
        }
        this._loadResolves().then(function (locals) {
          var $scope =
            (locals.$scope =
            self.$scope =
              locals.$scope ? locals.$scope : $rootScope.$new());
          self.modalEl.html(locals.$template);
          if (self.options.controller) {
            var ctrl = $controller(self.options.controller, locals);
            self.modalEl.contents().data("ngControllerController", ctrl);
          }
          $compile(self.modalEl)($scope);
          self._addElementsToDom();
          body.addClass(self.options.dialogOpenClass);
          setTimeout(function () {
            if (self.options.dialogFade) {
              self.modalEl.addClass(self.options.triggerClass);
            }
            if (self.options.backdropFade) {
              self.backdropEl.addClass(self.options.triggerClass);
            }
          });
          self._bindEvents();
        });
        this.deferred = $q.defer();
        return this.deferred.promise;
      };
      Dialog.prototype.close = function (result) {
        var self = this;
        var fadingElements = this._getFadingElements();
        body.removeClass(self.options.dialogOpenClass);
        if (fadingElements.length > 0) {
          for (var i = fadingElements.length - 1; i >= 0; i--) {
            $transition(fadingElements[i], removeTriggerClass).then(
              onCloseComplete
            );
          }
          return;
        }
        this._onCloseComplete(result);
        function removeTriggerClass(el) {
          el.removeClass(self.options.triggerClass);
        }
        function onCloseComplete() {
          if (self._open) {
            self._onCloseComplete(result);
          }
        }
      };
      Dialog.prototype._getFadingElements = function () {
        var elements = [];
        if (this.options.dialogFade) {
          elements.push(this.modalEl);
        }
        if (this.options.backdropFade) {
          elements.push(this.backdropEl);
        }
        return elements;
      };
      Dialog.prototype._bindEvents = function () {
        if (this.options.keyboard) {
          body.bind("keydown", this.handledEscapeKey);
        }
        if (this.options.backdrop && this.options.backdropClick) {
          this.backdropEl.bind("click", this.handleBackDropClick);
        }
      };
      Dialog.prototype._unbindEvents = function () {
        if (this.options.keyboard) {
          body.unbind("keydown", this.handledEscapeKey);
        }
        if (this.options.backdrop && this.options.backdropClick) {
          this.backdropEl.unbind("click", this.handleBackDropClick);
        }
      };
      Dialog.prototype._onCloseComplete = function (result) {
        this._removeElementsFromDom();
        this._unbindEvents();
        this.deferred.resolve(result);
      };
      Dialog.prototype._addElementsToDom = function () {
        body.append(this.modalEl);
        if (this.options.backdrop) {
          if (activeBackdrops.value === 0) {
            body.append(this.backdropEl);
          }
          activeBackdrops.value++;
        }
        this._open = true;
      };
      Dialog.prototype._removeElementsFromDom = function () {
        this.modalEl.remove();
        if (this.options.backdrop) {
          activeBackdrops.value--;
          if (activeBackdrops.value === 0) {
            this.backdropEl.remove();
          }
        }
        this._open = false;
      };
      Dialog.prototype._loadResolves = function () {
        var values = [],
          keys = [],
          templatePromise,
          self = this;
        if (this.options.template) {
          templatePromise = $q.when(this.options.template);
        } else if (this.options.templateUrl) {
          templatePromise = $http
            .get(this.options.templateUrl, { cache: $templateCache })
            .then(function (response) {
              return response.data;
            });
        }
        angular.forEach(this.options.resolve || [], function (value, key) {
          keys.push(key);
          values.push(
            angular.isString(value)
              ? $injector.get(value)
              : $injector.invoke(value)
          );
        });
        keys.push("$template");
        values.push(templatePromise);
        return $q.all(values).then(function (values) {
          var locals = {};
          angular.forEach(values, function (value, index) {
            locals[keys[index]] = value;
          });
          locals.dialog = self;
          return locals;
        });
      };
      return {
        dialog: function (opts) {
          return new Dialog(opts);
        },
        messageBox: function (title, message, buttons) {
          return new Dialog({
            templateUrl: "template/dialog/message.html",
            controller: "MessageBoxController",
            resolve: {
              model: function () {
                return { title: title, message: message, buttons: buttons };
              },
            },
          });
        },
      };
    },
  ];
});
angular.module("ui.bootstrap.transition", []).factory("$transition", [
  "$q",
  "$timeout",
  "$rootScope",
  function ($q, $timeout, $rootScope) {
    var $transition = function (element, trigger, options) {
      options = options || {};
      var deferred = $q.defer();
      var endEventName =
        $transition[
          options.animation ? "animationEndEventName" : "transitionEndEventName"
        ];
      var transitionEndHandler = function (event) {
        $rootScope.$apply(function () {
          element.unbind(endEventName, transitionEndHandler);
          deferred.resolve(element);
        });
      };
      if (endEventName) {
        element.bind(endEventName, transitionEndHandler);
      }
      $timeout(function () {
        if (angular.isString(trigger)) {
          element.addClass(trigger);
        } else if (angular.isFunction(trigger)) {
          trigger(element);
        } else if (angular.isObject(trigger)) {
          element.css(trigger);
        }
        if (!endEventName) {
          deferred.resolve(element);
        }
      });
      deferred.promise.cancel = function () {
        if (endEventName) {
          element.unbind(endEventName, transitionEndHandler);
        }
        deferred.reject("Transition cancelled");
      };
      return deferred.promise;
    };
    var transElement = document.createElement("trans");
    var transitionEndEventNames = {
      WebkitTransition: "webkitTransitionEnd",
      MozTransition: "transitionend",
      OTransition: "oTransitionEnd",
      transition: "transitionend",
    };
    var animationEndEventNames = {
      WebkitTransition: "webkitAnimationEnd",
      MozTransition: "animationend",
      OTransition: "oAnimationEnd",
      transition: "animationend",
    };
    function findEndEventName(endEventNames) {
      for (var name in endEventNames) {
        if (transElement.style[name] !== undefined) {
          return endEventNames[name];
        }
      }
    }
    $transition.transitionEndEventName = findEndEventName(
      transitionEndEventNames
    );
    $transition.animationEndEventName = findEndEventName(
      animationEndEventNames
    );
    return $transition;
  },
]);
angular.module("template/dialog/message.html", []).run([
  "$templateCache",
  function ($templateCache) {
    $templateCache.put(
      "template/dialog/message.html",
      '<div class="modal-header">' +
        "	<h1>{{ title }}</h1>" +
        "</div>" +
        '<div class="modal-body">' +
        "	<p>{{ message }}</p>" +
        "</div>" +
        '<div class="modal-footer">' +
        '	<button ng-repeat="btn in buttons" ng-click="close(btn.result)" class=btn ng-class="btn.cssClass">{{ btn.label }}</button>' +
        "</div>" +
        ""
    );
  },
]);
function Asterank3DCtrl($scope, pubsub) {
  $scope.running = true;
  $scope.Init = function () {
    asterank3d = new Asterank3D({
      container: document.getElementById("webgl-container"),
      not_supported_callback: function () {
        if (typeof mixpanel !== "undefined") mixpanel.track("not supported");
        $("#webgl-not-supported").show();
        var $tc = $("#top-container");
        var $bc = $("#bottom-container");
        $tc.height($tc.height() + ($bc.height() - 250));
        $bc.height(250);
        var $rs = $("#right-side");
        var $ls = $("#left-side");
        $("#results-table-container").height($rs.height() + 250);
        $rs.height($rs.height() + 250);
        $ls.height($ls.height() + 250);
      },
      top_object_color: 0xffffff,
    });
  };
  $scope.SunView = function () {
    asterank3d.clearLock();
  };
  $scope.EarthView = function () {
    asterank3d.setLock("earth");
  };
  $scope.Pause = function () {
    asterank3d.pause();
    $scope.running = false;
  };
  $scope.Play = function () {
    asterank3d.play();
    $scope.running = true;
  };
  $scope.FullView = function () {
    window.location.href = "http://asterank.com/3d";
  };
  pubsub.subscribe("Lock3DView", function (asteroid) {
    if (asterank3d.isWebGLSupported()) {
      asterank3d.setLock(asteroid.full_name);
    }
  });
  pubsub.subscribe("NewAsteroidRanking", function (rankings) {
    asterank3d.clearRankings();
    if (asterank3d.isWebGLSupported()) {
      asterank3d.processAsteroidRankings(rankings);
    }
  });
  pubsub.subscribe("Default3DView", function () {
    if (asterank3d.isWebGLSupported()) {
      asterank3d.clearLock();
    }
  });
}
function AsteroidDetailsCtrl($scope, $http, pubsub) {
  "use strict";
  var MPC_FIELDS_TO_INCLUDE = {
    e: { name: "Eccentricity" },
    epoch: { name: "Epoch" },
    dv: { name: "Delta-v", units: "km/s" },
    diameter: { name: "Diameter", units: "km" },
    ma: { name: "Mean Anomaly", units: "deg @ epoch" },
    om: { name: "Longitude of Ascending Node", units: "deg @ J2000" },
    w: { name: "Argument of Perihelion", units: "deg @ J2000" },
  };
  $scope.asteroid = null;
  $scope.asteroid_details = null;
  $scope.Init = function () {
    $scope.ResetView();
  };
  $scope.ResetView = function () {
    $scope.showing_stats = [];
    $scope.approaches = [];
    $scope.composition = [];
    $scope.images = [];
    $scope.images_loading = true;
    $scope.blinkData = { currentImage: 0 };
    $scope.stopBlinking();
  };
  var jpl_cache = new SimpleCache();
  var compositions_map = null;
  var blinkInterval = undefined;
  $scope.startBlinking = function startBlinkings() {
    $scope.stopBlinking();
    $scope.blinkData.blinkingNow = true;
    blinkInterval = setInterval(function () {
      $scope.$apply($scope.nextImage);
    }, 1000);
  };
  $scope.stopBlinking = function stopBlinking() {
    if (blinkInterval) clearInterval(blinkInterval);
    $scope.blinkData.blinkingNow = false;
    blinkInterval = undefined;
  };
  $scope.checkAll = function checkAll(value) {
    var images = $scope.images;
    value = !!value;
    for (var i in images)
      if (images.hasOwnProperty(i)) images[i].checked = value;
  };
  $scope.nextImage = function nextImage() {
    changeImage(forwardDirection);
  };
  $scope.prevImage = function prevImage() {
    changeImage(backwardDirection);
  };
  function forwardDirection(currentImage, n) {
    return (currentImage + 1) % n;
  }
  function backwardDirection(currentImage, n) {
    return (currentImage - 1 + n) % n;
  }
  function changeImage(directionFn) {
    var images = $scope.images;
    var i = 0,
      n = images.length;
    var currentImage = $scope.blinkData.currentImage | 0;
    do {
      currentImage = directionFn(currentImage, n);
      i++;
    } while (!images[currentImage].checked && i < n);
    $scope.blinkData.currentImage = currentImage;
  }
  pubsub.subscribe("AsteroidDetailsClick", function (asteroid) {
    if ($scope.asteroid && asteroid.full_name === $scope.asteroid.full_name) {
      $scope.asteroid = null;
      $scope.ResetView();
      pubsub.publish("ShowIntroStatement");
      pubsub.publish("Default3DView");
      return;
    }
    $scope.asteroid = asteroid;
    $scope.ResetView();
    $scope.stats = [];
    pubsub.publish("HideIntroStatement");
    var query = $scope.asteroid.prov_des || $scope.asteroid.full_name;
    var cache_result = jpl_cache.Get(query);
    if (cache_result) {
      ShowData(cache_result);
    } else {
      $http.get("/asterank/jpl/lookup?query=" + query).success(function (data) {
        ShowData(data);
        jpl_cache.Set($scope.asteroid.full_name, data);
      });
    }
    ShowOrbitalDiagram();
    pubsub.publish("Lock3DView", [asteroid]);
  });
  function ShowData(data) {
    for (var attr in data) {
      if (!data.hasOwnProperty(attr)) continue;
      if (typeof data[attr] !== "object") {
        if (data[attr] != -1) {
          $scope.stats.push({
            name: attr.replace(/(.*?)\(.*?\)/, "$1"),
            units: attr.replace(/.*?\((.*?)\)/, "$1"),
            value: data[attr],
          });
        }
      }
    }
    for (var attr in MPC_FIELDS_TO_INCLUDE) {
      if (!MPC_FIELDS_TO_INCLUDE.hasOwnProperty(attr)) continue;
      var val = MPC_FIELDS_TO_INCLUDE[attr];
      $scope.stats.push({
        name: attr,
        units: val.units,
        value: $scope.asteroid[attr],
      });
    }
    $scope.approaches = data["Close Approaches"];
    if ($scope.asteroid.custom_object) {
      $scope.images = [];
      $scope.images_loading = false;
    } else {
      if (compositions_map) {
        $scope.composition = Object.keys(
          compositions_map[$scope.asteroid.spec]
        );
      } else if ($scope.asteroid.spec) {
        $http.get("/asterank/api/compositions").success(function (data) {
          var compositions_map = data;
          $scope.composition = Object.keys(
            compositions_map[$scope.asteroid.spec]
          );
        });
      }
      var imagery_req_url =
        "/asterank/api/skymorph/images_for?target=" + $scope.asteroid.prov_des;
      var requesting_images_for = $scope.asteroid.prov_des;
      $http.get(imagery_req_url).success(function (data) {
        if ($scope.asteroid.prov_des == requesting_images_for) {
          $scope.images = data.images;
          $scope.images_loading = false;
          $scope.checkAll(true);
        }
      });
    }
  }
  function ShowOrbitalDiagram() {
    var orbit_diagram = new OrbitDiagram("#orbit-2d-diagram", {});
    orbit_diagram.render(
      $scope.asteroid.a,
      $scope.asteroid.e,
      $scope.asteroid.w
    );
  }
}
function AsteroidLookupCtrl($scope, $http, pubsub) {
  "use strict";
  var PRESELECT_URL_PARAM = "lookup";
  $scope.lookup_query = "";
  $scope.Init = function () {
    var preselected = getURLParameter(PRESELECT_URL_PARAM);
    if (preselected) {
      $scope.autocomplete_default_text = preselected;
      $http
        .get("/asterank/api/autocomplete?query=" + preselected)
        .success(function (data) {
          if (!data.length || data.length < 1) {
            alert('Sorry, could not load object "' + preselected + '"');
            return;
          }
          setTimeout(function () {
            pubsub.publish("UpdateRankingsWithFeaturedAsteroid", [data[0]]);
          }, 100);
        });
    }
  };
  $scope.Lookup = function (suggestion) {
    pubsub.publish("UpdateRankingsWithFeaturedAsteroid", [suggestion.data]);
  };
}
function AsteroidTableCtrl($scope, $http, pubsub) {
  "use strict";
  $scope.rankings = [];
  $scope.loading_initial_rankings = true;
  $scope.sort_orders = [
    { text: "most cost effective", search_value: "score" },
    { text: "most valuable", search_value: "value" },
    { text: "most accessible", search_value: "accessibility" },
    { text: "upcoming passes", search_value: "upcoming" },
    { text: "smallest", search_value: "smallest" },
    { text: "closest approaching", search_value: "moid" },
  ];
  $scope.limit_options = [10, 100, 300, 500, 1000, 4000];
  $scope.Init = function () {
    $scope.limit = $scope.limit_options[2];
    $scope.sort_by = $scope.sort_orders[0];
    $scope.UpdateRankings();
  };
  var rankings_cache = new SimpleCache(function (item) {
    return item.sort_by + "|" + item.limit;
  });
  $scope.UpdateRankings = function () {
    var params = { sort_by: $scope.sort_by.search_value, limit: $scope.limit };
    var cache_result = rankings_cache.Get(params);
    if (cache_result) {
      $scope.rankings = cache_result;
      pubsub.publish("NewAsteroidRanking", [$scope.rankings]);
      BroadcastInitialRankingsLoaded();
    } else {
      $("#results-table-loader").show();
      $scope.rankings = [];
      $http
        .get(
          "/asterank/api/rankings?sort_by=" +
            params.sort_by +
            "&limit=" +
            params.limit
        )
        .success(function (data) {
          $scope.rankings = data;
          rankings_cache.Set(params, data);
          $("#results-table-loader").hide();
          pubsub.publish("NewAsteroidRanking", [$scope.rankings]);
          BroadcastInitialRankingsLoaded();
        });
    }
  };
  $scope.AsteroidClick = function (obj) {
    if (obj === $scope.selected) {
      $scope.selected = null;
    } else {
      $scope.selected = obj;
    }
    pubsub.publish("AsteroidDetailsClick", [obj]);
  };
  var inserted_asteroids = {};
  pubsub.subscribe("UpdateRankingsWithFeaturedAsteroid", function (asteroid) {
    $scope.selected = asteroid;
    if (!inserted_asteroids[asteroid.full_name]) {
      $scope.rankings.unshift(asteroid);
      pubsub.publish("NewAsteroidRanking", [$scope.rankings]);
      inserted_asteroids[asteroid.full_name] = true;
    }
    pubsub.publish("AsteroidDetailsClick", [asteroid]);
  });
  function BroadcastInitialRankingsLoaded() {
    if ($scope.loading_initial_rankings) {
      pubsub.publish("InitialRankingsLoaded");
      $scope.loading_initial_rankings = false;
    }
  }
}
function CustomInputCtrl($scope, $http, pubsub) {
  var SERIALIZED_URL_PARAM = "s";
  $scope.object = {
    a: Ephemeris.earth.a,
    e: Ephemeris.earth.e,
    i: Ephemeris.earth.i,
    om: Ephemeris.earth.om,
    w: Ephemeris.earth.w_bar,
    ma: Ephemeris.earth.ma,
    epoch: Ephemeris.earth.epoch,
    per: Ephemeris.earth.P,
    spec: "?",
    custom_object: true,
  };
  $scope.num_custom_objects = 1;
  $scope.Init = function () {
    pubsub.subscribe("ShowCustomInputCtrl", function () {
      $scope.StartCustomOrbit();
    });
    $scope.$watch(
      "object",
      function (oldVal, newVal) {
        $scope.direct_url =
          "http://asterank.com/?s=" +
          encodeURIComponent(JSON.stringify($scope.object));
      },
      true
    );
    var serialized = getURLParameter(SERIALIZED_URL_PARAM);
    if (serialized) {
      pubsub.subscribe("InitialRankingsLoaded", function () {
        var parsed_obj = JSON.parse(decodeURIComponent(serialized));
        $scope.obj = parsed_obj;
        $scope.UseCustomInput();
      });
    }
  };
  $scope.StartCustomOrbit = function () {
    $scope.show_custom_input = true;
    setTimeout(function () {
      var element = document.getElementById("filepicker-widget");
      filepicker.constructWidget(element);
    }, 0);
  };
  $scope.UseCustomInput = function () {
    var custom_obj = $.extend({}, $scope.object);
    custom_obj.name =
      custom_obj.full_name =
      custom_obj.prov_des =
        "Custom Object " + $scope.num_custom_objects;
    custom_obj.P = $scope.object.per;
    $scope.num_custom_objects++;
    pubsub.publish("UpdateRankingsWithFeaturedAsteroid", [custom_obj]);
    $scope.CloseCustomInput();
  };
  $scope.SaveAndUseCustomInput = function () {
    $http
      .post("/asterank/api/user_objects", {
        object: $scope.object,
        keys: $scope.image_keys,
      })
      .success(function (data) {
        console.log("Object saved", data);
      });
    $scope.UseCustomInput();
  };
  $scope.CloseCustomInput = function () {
    $scope.show_custom_input = false;
  };
  $scope.OrbitLinkFocused = function () {
    $("#link-orbit-container input").select();
  };
  $scope.FilepickerCallback = function (e) {
    if (!e.fpfiles) return;
    var keys = [];
    for (var i = 0; i < e.fpfiles.length; i++) {
      var file = e.fpfiles[i];
      keys.push(file.key);
    }
    $scope.image_keys = keys;
  };
}
function IntroStatementCtrl($scope, pubsub) {
  "use strict";
  $scope.show = true;
  pubsub.subscribe("HideIntroStatement", function () {
    $scope.show = false;
  });
  pubsub.subscribe("ShowIntroStatement", function () {
    $scope.show = true;
  });
}
("use strict");
var THREE = { REVISION: "62" };
self.console = self.console || {
  info: function () {},
  log: function () {},
  debug: function () {},
  warn: function () {},
  error: function () {},
};
String.prototype.trim =
  String.prototype.trim ||
  function () {
    return this.replace(/^\s+|\s+$/g, "");
  };
THREE.extend = function (a, b) {
  if (Object.keys)
    for (var c = Object.keys(b), d = 0, e = c.length; d < e; d++) {
      var f = c[d];
      Object.defineProperty(a, f, Object.getOwnPropertyDescriptor(b, f));
    }
  else for (f in ((c = {}.hasOwnProperty), b)) c.call(b, f) && (a[f] = b[f]);
  return a;
};
(function () {
  for (
    var a = 0, b = ["ms", "moz", "webkit", "o"], c = 0;
    c < b.length && !self.requestAnimationFrame;
    ++c
  )
    (self.requestAnimationFrame = self[b[c] + "RequestAnimationFrame"]),
      (self.cancelAnimationFrame =
        self[b[c] + "CancelAnimationFrame"] ||
        self[b[c] + "CancelRequestAnimationFrame"]);
  void 0 === self.requestAnimationFrame &&
    void 0 !== self.setTimeout &&
    (self.requestAnimationFrame = function (b) {
      var c = Date.now(),
        f = Math.max(0, 16 - (c - a)),
        h = self.setTimeout(function () {
          b(c + f);
        }, f);
      a = c + f;
      return h;
    });
  void 0 === self.cancelAnimationFrame &&
    void 0 !== self.clearTimeout &&
    (self.cancelAnimationFrame = function (a) {
      self.clearTimeout(a);
    });
})();
THREE.CullFaceNone = 0;
THREE.CullFaceBack = 1;
THREE.CullFaceFront = 2;
THREE.CullFaceFrontBack = 3;
THREE.FrontFaceDirectionCW = 0;
THREE.FrontFaceDirectionCCW = 1;
THREE.BasicShadowMap = 0;
THREE.PCFShadowMap = 1;
THREE.PCFSoftShadowMap = 2;
THREE.FrontSide = 0;
THREE.BackSide = 1;
THREE.DoubleSide = 2;
THREE.NoShading = 0;
THREE.FlatShading = 1;
THREE.SmoothShading = 2;
THREE.NoColors = 0;
THREE.FaceColors = 1;
THREE.VertexColors = 2;
THREE.NoBlending = 0;
THREE.NormalBlending = 1;
THREE.AdditiveBlending = 2;
THREE.SubtractiveBlending = 3;
THREE.MultiplyBlending = 4;
THREE.CustomBlending = 5;
THREE.AddEquation = 100;
THREE.SubtractEquation = 101;
THREE.ReverseSubtractEquation = 102;
THREE.ZeroFactor = 200;
THREE.OneFactor = 201;
THREE.SrcColorFactor = 202;
THREE.OneMinusSrcColorFactor = 203;
THREE.SrcAlphaFactor = 204;
THREE.OneMinusSrcAlphaFactor = 205;
THREE.DstAlphaFactor = 206;
THREE.OneMinusDstAlphaFactor = 207;
THREE.DstColorFactor = 208;
THREE.OneMinusDstColorFactor = 209;
THREE.SrcAlphaSaturateFactor = 210;
THREE.MultiplyOperation = 0;
THREE.MixOperation = 1;
THREE.AddOperation = 2;
THREE.UVMapping = function () {};
THREE.CubeReflectionMapping = function () {};
THREE.CubeRefractionMapping = function () {};
THREE.SphericalReflectionMapping = function () {};
THREE.SphericalRefractionMapping = function () {};
THREE.RepeatWrapping = 1e3;
THREE.ClampToEdgeWrapping = 1001;
THREE.MirroredRepeatWrapping = 1002;
THREE.NearestFilter = 1003;
THREE.NearestMipMapNearestFilter = 1004;
THREE.NearestMipMapLinearFilter = 1005;
THREE.LinearFilter = 1006;
THREE.LinearMipMapNearestFilter = 1007;
THREE.LinearMipMapLinearFilter = 1008;
THREE.UnsignedByteType = 1009;
THREE.ByteType = 1010;
THREE.ShortType = 1011;
THREE.UnsignedShortType = 1012;
THREE.IntType = 1013;
THREE.UnsignedIntType = 1014;
THREE.FloatType = 1015;
THREE.UnsignedShort4444Type = 1016;
THREE.UnsignedShort5551Type = 1017;
THREE.UnsignedShort565Type = 1018;
THREE.AlphaFormat = 1019;
THREE.RGBFormat = 1020;
THREE.RGBAFormat = 1021;
THREE.LuminanceFormat = 1022;
THREE.LuminanceAlphaFormat = 1023;
THREE.RGB_S3TC_DXT1_Format = 2001;
THREE.RGBA_S3TC_DXT1_Format = 2002;
THREE.RGBA_S3TC_DXT3_Format = 2003;
THREE.RGBA_S3TC_DXT5_Format = 2004;
THREE.Color = function (a) {
  void 0 !== a && this.set(a);
  return this;
};
THREE.Color.prototype = {
  constructor: THREE.Color,
  r: 1,
  g: 1,
  b: 1,
  set: function (a) {
    a instanceof THREE.Color
      ? this.copy(a)
      : "number" === typeof a
      ? this.setHex(a)
      : "string" === typeof a && this.setStyle(a);
    return this;
  },
  setHex: function (a) {
    a = Math.floor(a);
    this.r = ((a >> 16) & 255) / 255;
    this.g = ((a >> 8) & 255) / 255;
    this.b = (a & 255) / 255;
    return this;
  },
  setRGB: function (a, b, c) {
    this.r = a;
    this.g = b;
    this.b = c;
    return this;
  },
  setHSL: function (a, b, c) {
    if (0 === b) this.r = this.g = this.b = c;
    else {
      var d = function (a, b, c) {
          0 > c && (c += 1);
          1 < c && (c -= 1);
          return c < 1 / 6
            ? a + 6 * (b - a) * c
            : 0.5 > c
            ? b
            : c < 2 / 3
            ? a + 6 * (b - a) * (2 / 3 - c)
            : a;
        },
        b = 0.5 >= c ? c * (1 + b) : c + b - c * b,
        c = 2 * c - b;
      this.r = d(c, b, a + 1 / 3);
      this.g = d(c, b, a);
      this.b = d(c, b, a - 1 / 3);
    }
    return this;
  },
  setStyle: function (a) {
    if (/^rgb\((\d+), ?(\d+), ?(\d+)\)$/i.test(a))
      return (
        (a = /^rgb\((\d+), ?(\d+), ?(\d+)\)$/i.exec(a)),
        (this.r = Math.min(255, parseInt(a[1], 10)) / 255),
        (this.g = Math.min(255, parseInt(a[2], 10)) / 255),
        (this.b = Math.min(255, parseInt(a[3], 10)) / 255),
        this
      );
    if (/^rgb\((\d+)\%, ?(\d+)\%, ?(\d+)\%\)$/i.test(a))
      return (
        (a = /^rgb\((\d+)\%, ?(\d+)\%, ?(\d+)\%\)$/i.exec(a)),
        (this.r = Math.min(100, parseInt(a[1], 10)) / 100),
        (this.g = Math.min(100, parseInt(a[2], 10)) / 100),
        (this.b = Math.min(100, parseInt(a[3], 10)) / 100),
        this
      );
    if (/^\#([0-9a-f]{6})$/i.test(a))
      return (
        (a = /^\#([0-9a-f]{6})$/i.exec(a)),
        this.setHex(parseInt(a[1], 16)),
        this
      );
    if (/^\#([0-9a-f])([0-9a-f])([0-9a-f])$/i.test(a))
      return (
        (a = /^\#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(a)),
        this.setHex(parseInt(a[1] + a[1] + a[2] + a[2] + a[3] + a[3], 16)),
        this
      );
    if (/^(\w+)$/i.test(a)) return this.setHex(THREE.ColorKeywords[a]), this;
  },
  copy: function (a) {
    this.r = a.r;
    this.g = a.g;
    this.b = a.b;
    return this;
  },
  copyGammaToLinear: function (a) {
    this.r = a.r * a.r;
    this.g = a.g * a.g;
    this.b = a.b * a.b;
    return this;
  },
  copyLinearToGamma: function (a) {
    this.r = Math.sqrt(a.r);
    this.g = Math.sqrt(a.g);
    this.b = Math.sqrt(a.b);
    return this;
  },
  convertGammaToLinear: function () {
    var a = this.r,
      b = this.g,
      c = this.b;
    this.r = a * a;
    this.g = b * b;
    this.b = c * c;
    return this;
  },
  convertLinearToGamma: function () {
    this.r = Math.sqrt(this.r);
    this.g = Math.sqrt(this.g);
    this.b = Math.sqrt(this.b);
    return this;
  },
  getHex: function () {
    return (
      ((255 * this.r) << 16) ^ ((255 * this.g) << 8) ^ ((255 * this.b) << 0)
    );
  },
  getHexString: function () {
    return ("000000" + this.getHex().toString(16)).slice(-6);
  },
  getHSL: (function () {
    var a = { h: 0, s: 0, l: 0 };
    return function () {
      var b = this.r,
        c = this.g,
        d = this.b,
        e = Math.max(b, c, d),
        f = Math.min(b, c, d),
        h,
        g = (f + e) / 2;
      if (f === e) f = h = 0;
      else {
        var i = e - f,
          f = 0.5 >= g ? i / (e + f) : i / (2 - e - f);
        switch (e) {
          case b:
            h = (c - d) / i + (c < d ? 6 : 0);
            break;
          case c:
            h = (d - b) / i + 2;
            break;
          case d:
            h = (b - c) / i + 4;
        }
        h /= 6;
      }
      a.h = h;
      a.s = f;
      a.l = g;
      return a;
    };
  })(),
  getStyle: function () {
    return (
      "rgb(" +
      ((255 * this.r) | 0) +
      "," +
      ((255 * this.g) | 0) +
      "," +
      ((255 * this.b) | 0) +
      ")"
    );
  },
  offsetHSL: function (a, b, c) {
    var d = this.getHSL();
    d.h += a;
    d.s += b;
    d.l += c;
    this.setHSL(d.h, d.s, d.l);
    return this;
  },
  add: function (a) {
    this.r += a.r;
    this.g += a.g;
    this.b += a.b;
    return this;
  },
  addColors: function (a, b) {
    this.r = a.r + b.r;
    this.g = a.g + b.g;
    this.b = a.b + b.b;
    return this;
  },
  addScalar: function (a) {
    this.r += a;
    this.g += a;
    this.b += a;
    return this;
  },
  multiply: function (a) {
    this.r *= a.r;
    this.g *= a.g;
    this.b *= a.b;
    return this;
  },
  multiplyScalar: function (a) {
    this.r *= a;
    this.g *= a;
    this.b *= a;
    return this;
  },
  lerp: function (a, b) {
    this.r += (a.r - this.r) * b;
    this.g += (a.g - this.g) * b;
    this.b += (a.b - this.b) * b;
    return this;
  },
  equals: function (a) {
    return a.r === this.r && a.g === this.g && a.b === this.b;
  },
  fromArray: function (a) {
    this.r = a[0];
    this.g = a[1];
    this.b = a[2];
    return this;
  },
  toArray: function () {
    return [this.r, this.g, this.b];
  },
  clone: function () {
    return new THREE.Color().setRGB(this.r, this.g, this.b);
  },
};
THREE.ColorKeywords = {
  aliceblue: 15792383,
  antiquewhite: 16444375,
  aqua: 65535,
  aquamarine: 8388564,
  azure: 15794175,
  beige: 16119260,
  bisque: 16770244,
  black: 0,
  blanchedalmond: 16772045,
  blue: 255,
  blueviolet: 9055202,
  brown: 10824234,
  burlywood: 14596231,
  cadetblue: 6266528,
  chartreuse: 8388352,
  chocolate: 13789470,
  coral: 16744272,
  cornflowerblue: 6591981,
  cornsilk: 16775388,
  crimson: 14423100,
  cyan: 65535,
  darkblue: 139,
  darkcyan: 35723,
  darkgoldenrod: 12092939,
  darkgray: 11119017,
  darkgreen: 25600,
  darkgrey: 11119017,
  darkkhaki: 12433259,
  darkmagenta: 9109643,
  darkolivegreen: 5597999,
  darkorange: 16747520,
  darkorchid: 10040012,
  darkred: 9109504,
  darksalmon: 15308410,
  darkseagreen: 9419919,
  darkslateblue: 4734347,
  darkslategray: 3100495,
  darkslategrey: 3100495,
  darkturquoise: 52945,
  darkviolet: 9699539,
  deeppink: 16716947,
  deepskyblue: 49151,
  dimgray: 6908265,
  dimgrey: 6908265,
  dodgerblue: 2003199,
  firebrick: 11674146,
  floralwhite: 16775920,
  forestgreen: 2263842,
  fuchsia: 16711935,
  gainsboro: 14474460,
  ghostwhite: 16316671,
  gold: 16766720,
  goldenrod: 14329120,
  gray: 8421504,
  green: 32768,
  greenyellow: 11403055,
  grey: 8421504,
  honeydew: 15794160,
  hotpink: 16738740,
  indianred: 13458524,
  indigo: 4915330,
  ivory: 16777200,
  khaki: 15787660,
  lavender: 15132410,
  lavenderblush: 16773365,
  lawngreen: 8190976,
  lemonchiffon: 16775885,
  lightblue: 11393254,
  lightcoral: 15761536,
  lightcyan: 14745599,
  lightgoldenrodyellow: 16448210,
  lightgray: 13882323,
  lightgreen: 9498256,
  lightgrey: 13882323,
  lightpink: 16758465,
  lightsalmon: 16752762,
  lightseagreen: 2142890,
  lightskyblue: 8900346,
  lightslategray: 7833753,
  lightslategrey: 7833753,
  lightsteelblue: 11584734,
  lightyellow: 16777184,
  lime: 65280,
  limegreen: 3329330,
  linen: 16445670,
  magenta: 16711935,
  maroon: 8388608,
  mediumaquamarine: 6737322,
  mediumblue: 205,
  mediumorchid: 12211667,
  mediumpurple: 9662683,
  mediumseagreen: 3978097,
  mediumslateblue: 8087790,
  mediumspringgreen: 64154,
  mediumturquoise: 4772300,
  mediumvioletred: 13047173,
  midnightblue: 1644912,
  mintcream: 16121850,
  mistyrose: 16770273,
  moccasin: 16770229,
  navajowhite: 16768685,
  navy: 128,
  oldlace: 16643558,
  olive: 8421376,
  olivedrab: 7048739,
  orange: 16753920,
  orangered: 16729344,
  orchid: 14315734,
  palegoldenrod: 15657130,
  palegreen: 10025880,
  paleturquoise: 11529966,
  palevioletred: 14381203,
  papayawhip: 16773077,
  peachpuff: 16767673,
  peru: 13468991,
  pink: 16761035,
  plum: 14524637,
  powderblue: 11591910,
  purple: 8388736,
  red: 16711680,
  rosybrown: 12357519,
  royalblue: 4286945,
  saddlebrown: 9127187,
  salmon: 16416882,
  sandybrown: 16032864,
  seagreen: 3050327,
  seashell: 16774638,
  sienna: 10506797,
  silver: 12632256,
  skyblue: 8900331,
  slateblue: 6970061,
  slategray: 7372944,
  slategrey: 7372944,
  snow: 16775930,
  springgreen: 65407,
  steelblue: 4620980,
  tan: 13808780,
  teal: 32896,
  thistle: 14204888,
  tomato: 16737095,
  turquoise: 4251856,
  violet: 15631086,
  wheat: 16113331,
  white: 16777215,
  whitesmoke: 16119285,
  yellow: 16776960,
  yellowgreen: 10145074,
};
THREE.Quaternion = function (a, b, c, d) {
  this._x = a || 0;
  this._y = b || 0;
  this._z = c || 0;
  this._w = void 0 !== d ? d : 1;
};
THREE.Quaternion.prototype = {
  constructor: THREE.Quaternion,
  _x: 0,
  _y: 0,
  _z: 0,
  _w: 0,
  _euler: void 0,
  _updateEuler: function () {
    void 0 !== this._euler && this._euler.setFromQuaternion(this, void 0, !1);
  },
  get x() {
    return this._x;
  },
  set x(a) {
    this._x = a;
    this._updateEuler();
  },
  get y() {
    return this._y;
  },
  set y(a) {
    this._y = a;
    this._updateEuler();
  },
  get z() {
    return this._z;
  },
  set z(a) {
    this._z = a;
    this._updateEuler();
  },
  get w() {
    return this._w;
  },
  set w(a) {
    this._w = a;
    this._updateEuler();
  },
  set: function (a, b, c, d) {
    this._x = a;
    this._y = b;
    this._z = c;
    this._w = d;
    this._updateEuler();
    return this;
  },
  copy: function (a) {
    this._x = a._x;
    this._y = a._y;
    this._z = a._z;
    this._w = a._w;
    this._updateEuler();
    return this;
  },
  setFromEuler: function (a, b) {
    if (!1 === a instanceof THREE.Euler)
      throw Error(
        "ERROR: Quaternion's .setFromEuler() now expects a Euler rotation rather than a Vector3 and order.  Please update your code."
      );
    var c = Math.cos(a._x / 2),
      d = Math.cos(a._y / 2),
      e = Math.cos(a._z / 2),
      f = Math.sin(a._x / 2),
      h = Math.sin(a._y / 2),
      g = Math.sin(a._z / 2);
    "XYZ" === a.order
      ? ((this._x = f * d * e + c * h * g),
        (this._y = c * h * e - f * d * g),
        (this._z = c * d * g + f * h * e),
        (this._w = c * d * e - f * h * g))
      : "YXZ" === a.order
      ? ((this._x = f * d * e + c * h * g),
        (this._y = c * h * e - f * d * g),
        (this._z = c * d * g - f * h * e),
        (this._w = c * d * e + f * h * g))
      : "ZXY" === a.order
      ? ((this._x = f * d * e - c * h * g),
        (this._y = c * h * e + f * d * g),
        (this._z = c * d * g + f * h * e),
        (this._w = c * d * e - f * h * g))
      : "ZYX" === a.order
      ? ((this._x = f * d * e - c * h * g),
        (this._y = c * h * e + f * d * g),
        (this._z = c * d * g - f * h * e),
        (this._w = c * d * e + f * h * g))
      : "YZX" === a.order
      ? ((this._x = f * d * e + c * h * g),
        (this._y = c * h * e + f * d * g),
        (this._z = c * d * g - f * h * e),
        (this._w = c * d * e - f * h * g))
      : "XZY" === a.order &&
        ((this._x = f * d * e - c * h * g),
        (this._y = c * h * e - f * d * g),
        (this._z = c * d * g + f * h * e),
        (this._w = c * d * e + f * h * g));
    !1 !== b && this._updateEuler();
    return this;
  },
  setFromAxisAngle: function (a, b) {
    var c = b / 2,
      d = Math.sin(c);
    this._x = a.x * d;
    this._y = a.y * d;
    this._z = a.z * d;
    this._w = Math.cos(c);
    this._updateEuler();
    return this;
  },
  setFromRotationMatrix: function (a) {
    var b = a.elements,
      c = b[0],
      a = b[4],
      d = b[8],
      e = b[1],
      f = b[5],
      h = b[9],
      g = b[2],
      i = b[6],
      b = b[10],
      k = c + f + b;
    0 < k
      ? ((c = 0.5 / Math.sqrt(k + 1)),
        (this._w = 0.25 / c),
        (this._x = (i - h) * c),
        (this._y = (d - g) * c),
        (this._z = (e - a) * c))
      : c > f && c > b
      ? ((c = 2 * Math.sqrt(1 + c - f - b)),
        (this._w = (i - h) / c),
        (this._x = 0.25 * c),
        (this._y = (a + e) / c),
        (this._z = (d + g) / c))
      : f > b
      ? ((c = 2 * Math.sqrt(1 + f - c - b)),
        (this._w = (d - g) / c),
        (this._x = (a + e) / c),
        (this._y = 0.25 * c),
        (this._z = (h + i) / c))
      : ((c = 2 * Math.sqrt(1 + b - c - f)),
        (this._w = (e - a) / c),
        (this._x = (d + g) / c),
        (this._y = (h + i) / c),
        (this._z = 0.25 * c));
    this._updateEuler();
    return this;
  },
  inverse: function () {
    this.conjugate().normalize();
    return this;
  },
  conjugate: function () {
    this._x *= -1;
    this._y *= -1;
    this._z *= -1;
    this._updateEuler();
    return this;
  },
  lengthSq: function () {
    return (
      this._x * this._x +
      this._y * this._y +
      this._z * this._z +
      this._w * this._w
    );
  },
  length: function () {
    return Math.sqrt(
      this._x * this._x +
        this._y * this._y +
        this._z * this._z +
        this._w * this._w
    );
  },
  normalize: function () {
    var a = this.length();
    0 === a
      ? ((this._z = this._y = this._x = 0), (this._w = 1))
      : ((a = 1 / a),
        (this._x *= a),
        (this._y *= a),
        (this._z *= a),
        (this._w *= a));
    return this;
  },
  multiply: function (a, b) {
    return void 0 !== b
      ? (console.warn(
          "DEPRECATED: Quaternion's .multiply() now only accepts one argument. Use .multiplyQuaternions( a, b ) instead."
        ),
        this.multiplyQuaternions(a, b))
      : this.multiplyQuaternions(this, a);
  },
  multiplyQuaternions: function (a, b) {
    var c = a._x,
      d = a._y,
      e = a._z,
      f = a._w,
      h = b._x,
      g = b._y,
      i = b._z,
      k = b._w;
    this._x = c * k + f * h + d * i - e * g;
    this._y = d * k + f * g + e * h - c * i;
    this._z = e * k + f * i + c * g - d * h;
    this._w = f * k - c * h - d * g - e * i;
    this._updateEuler();
    return this;
  },
  multiplyVector3: function (a) {
    console.warn(
      "DEPRECATED: Quaternion's .multiplyVector3() has been removed. Use is now vector.applyQuaternion( quaternion ) instead."
    );
    return a.applyQuaternion(this);
  },
  slerp: function (a, b) {
    var c = this._x,
      d = this._y,
      e = this._z,
      f = this._w,
      h = f * a._w + c * a._x + d * a._y + e * a._z;
    0 > h
      ? ((this._w = -a._w),
        (this._x = -a._x),
        (this._y = -a._y),
        (this._z = -a._z),
        (h = -h))
      : this.copy(a);
    if (1 <= h)
      return (this._w = f), (this._x = c), (this._y = d), (this._z = e), this;
    var g = Math.acos(h),
      i = Math.sqrt(1 - h * h);
    if (0.001 > Math.abs(i))
      return (
        (this._w = 0.5 * (f + this._w)),
        (this._x = 0.5 * (c + this._x)),
        (this._y = 0.5 * (d + this._y)),
        (this._z = 0.5 * (e + this._z)),
        this
      );
    h = Math.sin((1 - b) * g) / i;
    g = Math.sin(b * g) / i;
    this._w = f * h + this._w * g;
    this._x = c * h + this._x * g;
    this._y = d * h + this._y * g;
    this._z = e * h + this._z * g;
    this._updateEuler();
    return this;
  },
  equals: function (a) {
    return (
      a._x === this._x &&
      a._y === this._y &&
      a._z === this._z &&
      a._w === this._w
    );
  },
  fromArray: function (a) {
    this._x = a[0];
    this._y = a[1];
    this._z = a[2];
    this._w = a[3];
    this._updateEuler();
    return this;
  },
  toArray: function () {
    return [this._x, this._y, this._z, this._w];
  },
  clone: function () {
    return new THREE.Quaternion(this._x, this._y, this._z, this._w);
  },
};
THREE.Quaternion.slerp = function (a, b, c, d) {
  return c.copy(a).slerp(b, d);
};
THREE.Vector2 = function (a, b) {
  this.x = a || 0;
  this.y = b || 0;
};
THREE.Vector2.prototype = {
  constructor: THREE.Vector2,
  set: function (a, b) {
    this.x = a;
    this.y = b;
    return this;
  },
  setX: function (a) {
    this.x = a;
    return this;
  },
  setY: function (a) {
    this.y = a;
    return this;
  },
  setComponent: function (a, b) {
    switch (a) {
      case 0:
        this.x = b;
        break;
      case 1:
        this.y = b;
        break;
      default:
        throw Error("index is out of range: " + a);
    }
  },
  getComponent: function (a) {
    switch (a) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      default:
        throw Error("index is out of range: " + a);
    }
  },
  copy: function (a) {
    this.x = a.x;
    this.y = a.y;
    return this;
  },
  add: function (a, b) {
    if (void 0 !== b)
      return (
        console.warn(
          "DEPRECATED: Vector2's .add() now only accepts one argument. Use .addVectors( a, b ) instead."
        ),
        this.addVectors(a, b)
      );
    this.x += a.x;
    this.y += a.y;
    return this;
  },
  addVectors: function (a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    return this;
  },
  addScalar: function (a) {
    this.x += a;
    this.y += a;
    return this;
  },
  sub: function (a, b) {
    if (void 0 !== b)
      return (
        console.warn(
          "DEPRECATED: Vector2's .sub() now only accepts one argument. Use .subVectors( a, b ) instead."
        ),
        this.subVectors(a, b)
      );
    this.x -= a.x;
    this.y -= a.y;
    return this;
  },
  subVectors: function (a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    return this;
  },
  multiplyScalar: function (a) {
    this.x *= a;
    this.y *= a;
    return this;
  },
  divideScalar: function (a) {
    0 !== a
      ? ((a = 1 / a), (this.x *= a), (this.y *= a))
      : (this.y = this.x = 0);
    return this;
  },
  min: function (a) {
    this.x > a.x && (this.x = a.x);
    this.y > a.y && (this.y = a.y);
    return this;
  },
  max: function (a) {
    this.x < a.x && (this.x = a.x);
    this.y < a.y && (this.y = a.y);
    return this;
  },
  clamp: function (a, b) {
    this.x < a.x ? (this.x = a.x) : this.x > b.x && (this.x = b.x);
    this.y < a.y ? (this.y = a.y) : this.y > b.y && (this.y = b.y);
    return this;
  },
  negate: function () {
    return this.multiplyScalar(-1);
  },
  dot: function (a) {
    return this.x * a.x + this.y * a.y;
  },
  lengthSq: function () {
    return this.x * this.x + this.y * this.y;
  },
  length: function () {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  },
  normalize: function () {
    return this.divideScalar(this.length());
  },
  distanceTo: function (a) {
    return Math.sqrt(this.distanceToSquared(a));
  },
  distanceToSquared: function (a) {
    var b = this.x - a.x,
      a = this.y - a.y;
    return b * b + a * a;
  },
  setLength: function (a) {
    var b = this.length();
    0 !== b && a !== b && this.multiplyScalar(a / b);
    return this;
  },
  lerp: function (a, b) {
    this.x += (a.x - this.x) * b;
    this.y += (a.y - this.y) * b;
    return this;
  },
  equals: function (a) {
    return a.x === this.x && a.y === this.y;
  },
  fromArray: function (a) {
    this.x = a[0];
    this.y = a[1];
    return this;
  },
  toArray: function () {
    return [this.x, this.y];
  },
  clone: function () {
    return new THREE.Vector2(this.x, this.y);
  },
};
THREE.Vector3 = function (a, b, c) {
  this.x = a || 0;
  this.y = b || 0;
  this.z = c || 0;
};
THREE.Vector3.prototype = {
  constructor: THREE.Vector3,
  set: function (a, b, c) {
    this.x = a;
    this.y = b;
    this.z = c;
    return this;
  },
  setX: function (a) {
    this.x = a;
    return this;
  },
  setY: function (a) {
    this.y = a;
    return this;
  },
  setZ: function (a) {
    this.z = a;
    return this;
  },
  setComponent: function (a, b) {
    switch (a) {
      case 0:
        this.x = b;
        break;
      case 1:
        this.y = b;
        break;
      case 2:
        this.z = b;
        break;
      default:
        throw Error("index is out of range: " + a);
    }
  },
  getComponent: function (a) {
    switch (a) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      case 2:
        return this.z;
      default:
        throw Error("index is out of range: " + a);
    }
  },
  copy: function (a) {
    this.x = a.x;
    this.y = a.y;
    this.z = a.z;
    return this;
  },
  add: function (a, b) {
    if (void 0 !== b)
      return (
        console.warn(
          "DEPRECATED: Vector3's .add() now only accepts one argument. Use .addVectors( a, b ) instead."
        ),
        this.addVectors(a, b)
      );
    this.x += a.x;
    this.y += a.y;
    this.z += a.z;
    return this;
  },
  addScalar: function (a) {
    this.x += a;
    this.y += a;
    this.z += a;
    return this;
  },
  addVectors: function (a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    return this;
  },
  sub: function (a, b) {
    if (void 0 !== b)
      return (
        console.warn(
          "DEPRECATED: Vector3's .sub() now only accepts one argument. Use .subVectors( a, b ) instead."
        ),
        this.subVectors(a, b)
      );
    this.x -= a.x;
    this.y -= a.y;
    this.z -= a.z;
    return this;
  },
  subVectors: function (a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  },
  multiply: function (a, b) {
    if (void 0 !== b)
      return (
        console.warn(
          "DEPRECATED: Vector3's .multiply() now only accepts one argument. Use .multiplyVectors( a, b ) instead."
        ),
        this.multiplyVectors(a, b)
      );
    this.x *= a.x;
    this.y *= a.y;
    this.z *= a.z;
    return this;
  },
  multiplyScalar: function (a) {
    this.x *= a;
    this.y *= a;
    this.z *= a;
    return this;
  },
  multiplyVectors: function (a, b) {
    this.x = a.x * b.x;
    this.y = a.y * b.y;
    this.z = a.z * b.z;
    return this;
  },
  applyMatrix3: function (a) {
    var b = this.x,
      c = this.y,
      d = this.z,
      a = a.elements;
    this.x = a[0] * b + a[3] * c + a[6] * d;
    this.y = a[1] * b + a[4] * c + a[7] * d;
    this.z = a[2] * b + a[5] * c + a[8] * d;
    return this;
  },
  applyMatrix4: function (a) {
    var b = this.x,
      c = this.y,
      d = this.z,
      a = a.elements;
    this.x = a[0] * b + a[4] * c + a[8] * d + a[12];
    this.y = a[1] * b + a[5] * c + a[9] * d + a[13];
    this.z = a[2] * b + a[6] * c + a[10] * d + a[14];
    return this;
  },
  applyProjection: function (a) {
    var b = this.x,
      c = this.y,
      d = this.z,
      a = a.elements,
      e = 1 / (a[3] * b + a[7] * c + a[11] * d + a[15]);
    this.x = (a[0] * b + a[4] * c + a[8] * d + a[12]) * e;
    this.y = (a[1] * b + a[5] * c + a[9] * d + a[13]) * e;
    this.z = (a[2] * b + a[6] * c + a[10] * d + a[14]) * e;
    return this;
  },
  applyQuaternion: function (a) {
    var b = this.x,
      c = this.y,
      d = this.z,
      e = a.x,
      f = a.y,
      h = a.z,
      a = a.w,
      g = a * b + f * d - h * c,
      i = a * c + h * b - e * d,
      k = a * d + e * c - f * b,
      b = -e * b - f * c - h * d;
    this.x = g * a + b * -e + i * -h - k * -f;
    this.y = i * a + b * -f + k * -e - g * -h;
    this.z = k * a + b * -h + g * -f - i * -e;
    return this;
  },
  transformDirection: function (a) {
    var b = this.x,
      c = this.y,
      d = this.z,
      a = a.elements;
    this.x = a[0] * b + a[4] * c + a[8] * d;
    this.y = a[1] * b + a[5] * c + a[9] * d;
    this.z = a[2] * b + a[6] * c + a[10] * d;
    this.normalize();
    return this;
  },
  divide: function (a) {
    this.x /= a.x;
    this.y /= a.y;
    this.z /= a.z;
    return this;
  },
  divideScalar: function (a) {
    0 !== a
      ? ((a = 1 / a), (this.x *= a), (this.y *= a), (this.z *= a))
      : (this.z = this.y = this.x = 0);
    return this;
  },
  min: function (a) {
    this.x > a.x && (this.x = a.x);
    this.y > a.y && (this.y = a.y);
    this.z > a.z && (this.z = a.z);
    return this;
  },
  max: function (a) {
    this.x < a.x && (this.x = a.x);
    this.y < a.y && (this.y = a.y);
    this.z < a.z && (this.z = a.z);
    return this;
  },
  clamp: function (a, b) {
    this.x < a.x ? (this.x = a.x) : this.x > b.x && (this.x = b.x);
    this.y < a.y ? (this.y = a.y) : this.y > b.y && (this.y = b.y);
    this.z < a.z ? (this.z = a.z) : this.z > b.z && (this.z = b.z);
    return this;
  },
  negate: function () {
    return this.multiplyScalar(-1);
  },
  dot: function (a) {
    return this.x * a.x + this.y * a.y + this.z * a.z;
  },
  lengthSq: function () {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  },
  length: function () {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  },
  lengthManhattan: function () {
    return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
  },
  normalize: function () {
    return this.divideScalar(this.length());
  },
  setLength: function (a) {
    var b = this.length();
    0 !== b && a !== b && this.multiplyScalar(a / b);
    return this;
  },
  lerp: function (a, b) {
    this.x += (a.x - this.x) * b;
    this.y += (a.y - this.y) * b;
    this.z += (a.z - this.z) * b;
    return this;
  },
  cross: function (a, b) {
    if (void 0 !== b)
      return (
        console.warn(
          "DEPRECATED: Vector3's .cross() now only accepts one argument. Use .crossVectors( a, b ) instead."
        ),
        this.crossVectors(a, b)
      );
    var c = this.x,
      d = this.y,
      e = this.z;
    this.x = d * a.z - e * a.y;
    this.y = e * a.x - c * a.z;
    this.z = c * a.y - d * a.x;
    return this;
  },
  crossVectors: function (a, b) {
    var c = a.x,
      d = a.y,
      e = a.z,
      f = b.x,
      h = b.y,
      g = b.z;
    this.x = d * g - e * h;
    this.y = e * f - c * g;
    this.z = c * h - d * f;
    return this;
  },
  angleTo: function (a) {
    a = this.dot(a) / (this.length() * a.length());
    return Math.acos(THREE.Math.clamp(a, -1, 1));
  },
  distanceTo: function (a) {
    return Math.sqrt(this.distanceToSquared(a));
  },
  distanceToSquared: function (a) {
    var b = this.x - a.x,
      c = this.y - a.y,
      a = this.z - a.z;
    return b * b + c * c + a * a;
  },
  setEulerFromRotationMatrix: function () {
    console.error(
      "REMOVED: Vector3's setEulerFromRotationMatrix has been removed in favor of Euler.setFromRotationMatrix(), please update your code."
    );
  },
  setEulerFromQuaternion: function () {
    console.error(
      "REMOVED: Vector3's setEulerFromQuaternion: has been removed in favor of Euler.setFromQuaternion(), please update your code."
    );
  },
  getPositionFromMatrix: function (a) {
    this.x = a.elements[12];
    this.y = a.elements[13];
    this.z = a.elements[14];
    return this;
  },
  getScaleFromMatrix: function (a) {
    var b = this.set(a.elements[0], a.elements[1], a.elements[2]).length(),
      c = this.set(a.elements[4], a.elements[5], a.elements[6]).length(),
      a = this.set(a.elements[8], a.elements[9], a.elements[10]).length();
    this.x = b;
    this.y = c;
    this.z = a;
    return this;
  },
  getColumnFromMatrix: function (a, b) {
    var c = 4 * a,
      d = b.elements;
    this.x = d[c];
    this.y = d[c + 1];
    this.z = d[c + 2];
    return this;
  },
  equals: function (a) {
    return a.x === this.x && a.y === this.y && a.z === this.z;
  },
  fromArray: function (a) {
    this.x = a[0];
    this.y = a[1];
    this.z = a[2];
    return this;
  },
  toArray: function () {
    return [this.x, this.y, this.z];
  },
  clone: function () {
    return new THREE.Vector3(this.x, this.y, this.z);
  },
};
THREE.extend(THREE.Vector3.prototype, {
  applyEuler: (function () {
    var a = new THREE.Quaternion();
    return function (b) {
      !1 === b instanceof THREE.Euler &&
        console.error(
          "ERROR: Vector3's .applyEuler() now expects a Euler rotation rather than a Vector3 and order.  Please update your code."
        );
      this.applyQuaternion(a.setFromEuler(b));
      return this;
    };
  })(),
  applyAxisAngle: (function () {
    var a = new THREE.Quaternion();
    return function (b, c) {
      this.applyQuaternion(a.setFromAxisAngle(b, c));
      return this;
    };
  })(),
  projectOnVector: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      a.copy(b).normalize();
      b = this.dot(a);
      return this.copy(a).multiplyScalar(b);
    };
  })(),
  projectOnPlane: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      a.copy(this).projectOnVector(b);
      return this.sub(a);
    };
  })(),
  reflect: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      a.copy(this).projectOnVector(b).multiplyScalar(2);
      return this.subVectors(a, this);
    };
  })(),
});
THREE.Vector4 = function (a, b, c, d) {
  this.x = a || 0;
  this.y = b || 0;
  this.z = c || 0;
  this.w = void 0 !== d ? d : 1;
};
THREE.Vector4.prototype = {
  constructor: THREE.Vector4,
  set: function (a, b, c, d) {
    this.x = a;
    this.y = b;
    this.z = c;
    this.w = d;
    return this;
  },
  setX: function (a) {
    this.x = a;
    return this;
  },
  setY: function (a) {
    this.y = a;
    return this;
  },
  setZ: function (a) {
    this.z = a;
    return this;
  },
  setW: function (a) {
    this.w = a;
    return this;
  },
  setComponent: function (a, b) {
    switch (a) {
      case 0:
        this.x = b;
        break;
      case 1:
        this.y = b;
        break;
      case 2:
        this.z = b;
        break;
      case 3:
        this.w = b;
        break;
      default:
        throw Error("index is out of range: " + a);
    }
  },
  getComponent: function (a) {
    switch (a) {
      case 0:
        return this.x;
      case 1:
        return this.y;
      case 2:
        return this.z;
      case 3:
        return this.w;
      default:
        throw Error("index is out of range: " + a);
    }
  },
  copy: function (a) {
    this.x = a.x;
    this.y = a.y;
    this.z = a.z;
    this.w = void 0 !== a.w ? a.w : 1;
    return this;
  },
  add: function (a, b) {
    if (void 0 !== b)
      return (
        console.warn(
          "DEPRECATED: Vector4's .add() now only accepts one argument. Use .addVectors( a, b ) instead."
        ),
        this.addVectors(a, b)
      );
    this.x += a.x;
    this.y += a.y;
    this.z += a.z;
    this.w += a.w;
    return this;
  },
  addScalar: function (a) {
    this.x += a;
    this.y += a;
    this.z += a;
    this.w += a;
    return this;
  },
  addVectors: function (a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    this.w = a.w + b.w;
    return this;
  },
  sub: function (a, b) {
    if (void 0 !== b)
      return (
        console.warn(
          "DEPRECATED: Vector4's .sub() now only accepts one argument. Use .subVectors( a, b ) instead."
        ),
        this.subVectors(a, b)
      );
    this.x -= a.x;
    this.y -= a.y;
    this.z -= a.z;
    this.w -= a.w;
    return this;
  },
  subVectors: function (a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    this.w = a.w - b.w;
    return this;
  },
  multiplyScalar: function (a) {
    this.x *= a;
    this.y *= a;
    this.z *= a;
    this.w *= a;
    return this;
  },
  applyMatrix4: function (a) {
    var b = this.x,
      c = this.y,
      d = this.z,
      e = this.w,
      a = a.elements;
    this.x = a[0] * b + a[4] * c + a[8] * d + a[12] * e;
    this.y = a[1] * b + a[5] * c + a[9] * d + a[13] * e;
    this.z = a[2] * b + a[6] * c + a[10] * d + a[14] * e;
    this.w = a[3] * b + a[7] * c + a[11] * d + a[15] * e;
    return this;
  },
  divideScalar: function (a) {
    0 !== a
      ? ((a = 1 / a),
        (this.x *= a),
        (this.y *= a),
        (this.z *= a),
        (this.w *= a))
      : ((this.z = this.y = this.x = 0), (this.w = 1));
    return this;
  },
  setAxisAngleFromQuaternion: function (a) {
    this.w = 2 * Math.acos(a.w);
    var b = Math.sqrt(1 - a.w * a.w);
    1e-4 > b
      ? ((this.x = 1), (this.z = this.y = 0))
      : ((this.x = a.x / b), (this.y = a.y / b), (this.z = a.z / b));
    return this;
  },
  setAxisAngleFromRotationMatrix: function (a) {
    var b,
      c,
      d,
      a = a.elements,
      e = a[0];
    d = a[4];
    var f = a[8],
      h = a[1],
      g = a[5],
      i = a[9];
    c = a[2];
    b = a[6];
    var k = a[10];
    if (
      0.01 > Math.abs(d - h) &&
      0.01 > Math.abs(f - c) &&
      0.01 > Math.abs(i - b)
    ) {
      if (
        0.1 > Math.abs(d + h) &&
        0.1 > Math.abs(f + c) &&
        0.1 > Math.abs(i + b) &&
        0.1 > Math.abs(e + g + k - 3)
      )
        return this.set(1, 0, 0, 0), this;
      a = Math.PI;
      e = (e + 1) / 2;
      g = (g + 1) / 2;
      k = (k + 1) / 2;
      d = (d + h) / 4;
      f = (f + c) / 4;
      i = (i + b) / 4;
      e > g && e > k
        ? 0.01 > e
          ? ((b = 0), (d = c = 0.707106781))
          : ((b = Math.sqrt(e)), (c = d / b), (d = f / b))
        : g > k
        ? 0.01 > g
          ? ((b = 0.707106781), (c = 0), (d = 0.707106781))
          : ((c = Math.sqrt(g)), (b = d / c), (d = i / c))
        : 0.01 > k
        ? ((c = b = 0.707106781), (d = 0))
        : ((d = Math.sqrt(k)), (b = f / d), (c = i / d));
      this.set(b, c, d, a);
      return this;
    }
    a = Math.sqrt((b - i) * (b - i) + (f - c) * (f - c) + (h - d) * (h - d));
    0.001 > Math.abs(a) && (a = 1);
    this.x = (b - i) / a;
    this.y = (f - c) / a;
    this.z = (h - d) / a;
    this.w = Math.acos((e + g + k - 1) / 2);
    return this;
  },
  min: function (a) {
    this.x > a.x && (this.x = a.x);
    this.y > a.y && (this.y = a.y);
    this.z > a.z && (this.z = a.z);
    this.w > a.w && (this.w = a.w);
    return this;
  },
  max: function (a) {
    this.x < a.x && (this.x = a.x);
    this.y < a.y && (this.y = a.y);
    this.z < a.z && (this.z = a.z);
    this.w < a.w && (this.w = a.w);
    return this;
  },
  clamp: function (a, b) {
    this.x < a.x ? (this.x = a.x) : this.x > b.x && (this.x = b.x);
    this.y < a.y ? (this.y = a.y) : this.y > b.y && (this.y = b.y);
    this.z < a.z ? (this.z = a.z) : this.z > b.z && (this.z = b.z);
    this.w < a.w ? (this.w = a.w) : this.w > b.w && (this.w = b.w);
    return this;
  },
  negate: function () {
    return this.multiplyScalar(-1);
  },
  dot: function (a) {
    return this.x * a.x + this.y * a.y + this.z * a.z + this.w * a.w;
  },
  lengthSq: function () {
    return (
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    );
  },
  length: function () {
    return Math.sqrt(
      this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    );
  },
  lengthManhattan: function () {
    return (
      Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z) + Math.abs(this.w)
    );
  },
  normalize: function () {
    return this.divideScalar(this.length());
  },
  setLength: function (a) {
    var b = this.length();
    0 !== b && a !== b && this.multiplyScalar(a / b);
    return this;
  },
  lerp: function (a, b) {
    this.x += (a.x - this.x) * b;
    this.y += (a.y - this.y) * b;
    this.z += (a.z - this.z) * b;
    this.w += (a.w - this.w) * b;
    return this;
  },
  equals: function (a) {
    return a.x === this.x && a.y === this.y && a.z === this.z && a.w === this.w;
  },
  fromArray: function (a) {
    this.x = a[0];
    this.y = a[1];
    this.z = a[2];
    this.w = a[3];
    return this;
  },
  toArray: function () {
    return [this.x, this.y, this.z, this.w];
  },
  clone: function () {
    return new THREE.Vector4(this.x, this.y, this.z, this.w);
  },
};
THREE.Euler = function (a, b, c, d) {
  this._x = a || 0;
  this._y = b || 0;
  this._z = c || 0;
  this._order = d || THREE.Euler.DefaultOrder;
};
THREE.Euler.RotationOrders = "XYZ YZX ZXY XZY YXZ ZYX".split(" ");
THREE.Euler.DefaultOrder = "XYZ";
THREE.Euler.prototype = {
  constructor: THREE.Euler,
  _x: 0,
  _y: 0,
  _z: 0,
  _order: THREE.Euler.DefaultOrder,
  _quaternion: void 0,
  _updateQuaternion: function () {
    void 0 !== this._quaternion && this._quaternion.setFromEuler(this, !1);
  },
  get x() {
    return this._x;
  },
  set x(a) {
    this._x = a;
    this._updateQuaternion();
  },
  get y() {
    return this._y;
  },
  set y(a) {
    this._y = a;
    this._updateQuaternion();
  },
  get z() {
    return this._z;
  },
  set z(a) {
    this._z = a;
    this._updateQuaternion();
  },
  get order() {
    return this._order;
  },
  set order(a) {
    this._order = a;
    this._updateQuaternion();
  },
  set: function (a, b, c, d) {
    this._x = a;
    this._y = b;
    this._z = c;
    this._order = d || this._order;
    this._updateQuaternion();
    return this;
  },
  copy: function (a) {
    this._x = a._x;
    this._y = a._y;
    this._z = a._z;
    this._order = a._order;
    this._updateQuaternion();
    return this;
  },
  setFromRotationMatrix: function (a, b) {
    function c(a) {
      return Math.min(Math.max(a, -1), 1);
    }
    var d = a.elements,
      e = d[0],
      f = d[4],
      h = d[8],
      g = d[1],
      i = d[5],
      k = d[9],
      m = d[2],
      l = d[6],
      d = d[10],
      b = b || this._order;
    "XYZ" === b
      ? ((this._y = Math.asin(c(h))),
        0.99999 > Math.abs(h)
          ? ((this._x = Math.atan2(-k, d)), (this._z = Math.atan2(-f, e)))
          : ((this._x = Math.atan2(l, i)), (this._z = 0)))
      : "YXZ" === b
      ? ((this._x = Math.asin(-c(k))),
        0.99999 > Math.abs(k)
          ? ((this._y = Math.atan2(h, d)), (this._z = Math.atan2(g, i)))
          : ((this._y = Math.atan2(-m, e)), (this._z = 0)))
      : "ZXY" === b
      ? ((this._x = Math.asin(c(l))),
        0.99999 > Math.abs(l)
          ? ((this._y = Math.atan2(-m, d)), (this._z = Math.atan2(-f, i)))
          : ((this._y = 0), (this._z = Math.atan2(g, e))))
      : "ZYX" === b
      ? ((this._y = Math.asin(-c(m))),
        0.99999 > Math.abs(m)
          ? ((this._x = Math.atan2(l, d)), (this._z = Math.atan2(g, e)))
          : ((this._x = 0), (this._z = Math.atan2(-f, i))))
      : "YZX" === b
      ? ((this._z = Math.asin(c(g))),
        0.99999 > Math.abs(g)
          ? ((this._x = Math.atan2(-k, i)), (this._y = Math.atan2(-m, e)))
          : ((this._x = 0), (this._y = Math.atan2(h, d))))
      : "XZY" === b
      ? ((this._z = Math.asin(-c(f))),
        0.99999 > Math.abs(f)
          ? ((this._x = Math.atan2(l, i)), (this._y = Math.atan2(h, e)))
          : ((this._x = Math.atan2(-k, d)), (this._y = 0)))
      : console.warn(
          "WARNING: Euler.setFromRotationMatrix() given unsupported order: " + b
        );
    this._order = b;
    this._updateQuaternion();
    return this;
  },
  setFromQuaternion: function (a, b, c) {
    function d(a) {
      return Math.min(Math.max(a, -1), 1);
    }
    var e = a.x * a.x,
      f = a.y * a.y,
      h = a.z * a.z,
      g = a.w * a.w,
      b = b || this._order;
    "XYZ" === b
      ? ((this._x = Math.atan2(2 * (a.x * a.w - a.y * a.z), g - e - f + h)),
        (this._y = Math.asin(d(2 * (a.x * a.z + a.y * a.w)))),
        (this._z = Math.atan2(2 * (a.z * a.w - a.x * a.y), g + e - f - h)))
      : "YXZ" === b
      ? ((this._x = Math.asin(d(2 * (a.x * a.w - a.y * a.z)))),
        (this._y = Math.atan2(2 * (a.x * a.z + a.y * a.w), g - e - f + h)),
        (this._z = Math.atan2(2 * (a.x * a.y + a.z * a.w), g - e + f - h)))
      : "ZXY" === b
      ? ((this._x = Math.asin(d(2 * (a.x * a.w + a.y * a.z)))),
        (this._y = Math.atan2(2 * (a.y * a.w - a.z * a.x), g - e - f + h)),
        (this._z = Math.atan2(2 * (a.z * a.w - a.x * a.y), g - e + f - h)))
      : "ZYX" === b
      ? ((this._x = Math.atan2(2 * (a.x * a.w + a.z * a.y), g - e - f + h)),
        (this._y = Math.asin(d(2 * (a.y * a.w - a.x * a.z)))),
        (this._z = Math.atan2(2 * (a.x * a.y + a.z * a.w), g + e - f - h)))
      : "YZX" === b
      ? ((this._x = Math.atan2(2 * (a.x * a.w - a.z * a.y), g - e + f - h)),
        (this._y = Math.atan2(2 * (a.y * a.w - a.x * a.z), g + e - f - h)),
        (this._z = Math.asin(d(2 * (a.x * a.y + a.z * a.w)))))
      : "XZY" === b
      ? ((this._x = Math.atan2(2 * (a.x * a.w + a.y * a.z), g - e + f - h)),
        (this._y = Math.atan2(2 * (a.x * a.z + a.y * a.w), g + e - f - h)),
        (this._z = Math.asin(d(2 * (a.z * a.w - a.x * a.y)))))
      : console.warn(
          "WARNING: Euler.setFromQuaternion() given unsupported order: " + b
        );
    this._order = b;
    !1 !== c && this._updateQuaternion();
    return this;
  },
  reorder: (function () {
    var a = new THREE.Quaternion();
    return function (b) {
      a.setFromEuler(this);
      this.setFromQuaternion(a, b);
    };
  })(),
  fromArray: function (a) {
    this._x = a[0];
    this._y = a[1];
    this._z = a[2];
    void 0 !== a[3] && (this._order = a[3]);
    this._updateQuaternion();
    return this;
  },
  toArray: function () {
    return [this._x, this._y, this._z, this._order];
  },
  equals: function (a) {
    return (
      a._x === this._x &&
      a._y === this._y &&
      a._z === this._z &&
      a._order === this._order
    );
  },
  clone: function () {
    return new THREE.Euler(this._x, this._y, this._z, this._order);
  },
};
THREE.Line3 = function (a, b) {
  this.start = void 0 !== a ? a : new THREE.Vector3();
  this.end = void 0 !== b ? b : new THREE.Vector3();
};
THREE.Line3.prototype = {
  constructor: THREE.Line3,
  set: function (a, b) {
    this.start.copy(a);
    this.end.copy(b);
    return this;
  },
  copy: function (a) {
    this.start.copy(a.start);
    this.end.copy(a.end);
    return this;
  },
  center: function (a) {
    return (a || new THREE.Vector3())
      .addVectors(this.start, this.end)
      .multiplyScalar(0.5);
  },
  delta: function (a) {
    return (a || new THREE.Vector3()).subVectors(this.end, this.start);
  },
  distanceSq: function () {
    return this.start.distanceToSquared(this.end);
  },
  distance: function () {
    return this.start.distanceTo(this.end);
  },
  at: function (a, b) {
    var c = b || new THREE.Vector3();
    return this.delta(c).multiplyScalar(a).add(this.start);
  },
  closestPointToPointParameter: (function () {
    var a = new THREE.Vector3(),
      b = new THREE.Vector3();
    return function (c, d) {
      a.subVectors(c, this.start);
      b.subVectors(this.end, this.start);
      var e = b.dot(b),
        e = b.dot(a) / e;
      d && (e = THREE.Math.clamp(e, 0, 1));
      return e;
    };
  })(),
  closestPointToPoint: function (a, b, c) {
    a = this.closestPointToPointParameter(a, b);
    c = c || new THREE.Vector3();
    return this.delta(c).multiplyScalar(a).add(this.start);
  },
  applyMatrix4: function (a) {
    this.start.applyMatrix4(a);
    this.end.applyMatrix4(a);
    return this;
  },
  equals: function (a) {
    return a.start.equals(this.start) && a.end.equals(this.end);
  },
  clone: function () {
    return new THREE.Line3().copy(this);
  },
};
THREE.Box2 = function (a, b) {
  this.min = void 0 !== a ? a : new THREE.Vector2(Infinity, Infinity);
  this.max = void 0 !== b ? b : new THREE.Vector2(-Infinity, -Infinity);
};
THREE.Box2.prototype = {
  constructor: THREE.Box2,
  set: function (a, b) {
    this.min.copy(a);
    this.max.copy(b);
    return this;
  },
  setFromPoints: function (a) {
    if (0 < a.length) {
      var b = a[0];
      this.min.copy(b);
      this.max.copy(b);
      for (var c = 1, d = a.length; c < d; c++)
        (b = a[c]),
          b.x < this.min.x
            ? (this.min.x = b.x)
            : b.x > this.max.x && (this.max.x = b.x),
          b.y < this.min.y
            ? (this.min.y = b.y)
            : b.y > this.max.y && (this.max.y = b.y);
    } else this.makeEmpty();
    return this;
  },
  setFromCenterAndSize: (function () {
    var a = new THREE.Vector2();
    return function (b, c) {
      var d = a.copy(c).multiplyScalar(0.5);
      this.min.copy(b).sub(d);
      this.max.copy(b).add(d);
      return this;
    };
  })(),
  copy: function (a) {
    this.min.copy(a.min);
    this.max.copy(a.max);
    return this;
  },
  makeEmpty: function () {
    this.min.x = this.min.y = Infinity;
    this.max.x = this.max.y = -Infinity;
    return this;
  },
  empty: function () {
    return this.max.x < this.min.x || this.max.y < this.min.y;
  },
  center: function (a) {
    return (a || new THREE.Vector2())
      .addVectors(this.min, this.max)
      .multiplyScalar(0.5);
  },
  size: function (a) {
    return (a || new THREE.Vector2()).subVectors(this.max, this.min);
  },
  expandByPoint: function (a) {
    this.min.min(a);
    this.max.max(a);
    return this;
  },
  expandByVector: function (a) {
    this.min.sub(a);
    this.max.add(a);
    return this;
  },
  expandByScalar: function (a) {
    this.min.addScalar(-a);
    this.max.addScalar(a);
    return this;
  },
  containsPoint: function (a) {
    return a.x < this.min.x ||
      a.x > this.max.x ||
      a.y < this.min.y ||
      a.y > this.max.y
      ? !1
      : !0;
  },
  containsBox: function (a) {
    return this.min.x <= a.min.x &&
      a.max.x <= this.max.x &&
      this.min.y <= a.min.y &&
      a.max.y <= this.max.y
      ? !0
      : !1;
  },
  getParameter: function (a) {
    return new THREE.Vector2(
      (a.x - this.min.x) / (this.max.x - this.min.x),
      (a.y - this.min.y) / (this.max.y - this.min.y)
    );
  },
  isIntersectionBox: function (a) {
    return a.max.x < this.min.x ||
      a.min.x > this.max.x ||
      a.max.y < this.min.y ||
      a.min.y > this.max.y
      ? !1
      : !0;
  },
  clampPoint: function (a, b) {
    return (b || new THREE.Vector2()).copy(a).clamp(this.min, this.max);
  },
  distanceToPoint: (function () {
    var a = new THREE.Vector2();
    return function (b) {
      return a.copy(b).clamp(this.min, this.max).sub(b).length();
    };
  })(),
  intersect: function (a) {
    this.min.max(a.min);
    this.max.min(a.max);
    return this;
  },
  union: function (a) {
    this.min.min(a.min);
    this.max.max(a.max);
    return this;
  },
  translate: function (a) {
    this.min.add(a);
    this.max.add(a);
    return this;
  },
  equals: function (a) {
    return a.min.equals(this.min) && a.max.equals(this.max);
  },
  clone: function () {
    return new THREE.Box2().copy(this);
  },
};
THREE.Box3 = function (a, b) {
  this.min = void 0 !== a ? a : new THREE.Vector3(Infinity, Infinity, Infinity);
  this.max =
    void 0 !== b ? b : new THREE.Vector3(-Infinity, -Infinity, -Infinity);
};
THREE.Box3.prototype = {
  constructor: THREE.Box3,
  set: function (a, b) {
    this.min.copy(a);
    this.max.copy(b);
    return this;
  },
  addPoint: function (a) {
    a.x < this.min.x
      ? (this.min.x = a.x)
      : a.x > this.max.x && (this.max.x = a.x);
    a.y < this.min.y
      ? (this.min.y = a.y)
      : a.y > this.max.y && (this.max.y = a.y);
    a.z < this.min.z
      ? (this.min.z = a.z)
      : a.z > this.max.z && (this.max.z = a.z);
  },
  setFromPoints: function (a) {
    if (0 < a.length) {
      var b = a[0];
      this.min.copy(b);
      this.max.copy(b);
      for (var b = 1, c = a.length; b < c; b++) this.addPoint(a[b]);
    } else this.makeEmpty();
    return this;
  },
  setFromCenterAndSize: (function () {
    var a = new THREE.Vector3();
    return function (b, c) {
      var d = a.copy(c).multiplyScalar(0.5);
      this.min.copy(b).sub(d);
      this.max.copy(b).add(d);
      return this;
    };
  })(),
  setFromObject: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      var c = this;
      b.updateMatrixWorld(!0);
      this.makeEmpty();
      b.traverse(function (b) {
        if (void 0 !== b.geometry && void 0 !== b.geometry.vertices)
          for (var e = b.geometry.vertices, f = 0, h = e.length; f < h; f++)
            a.copy(e[f]), a.applyMatrix4(b.matrixWorld), c.expandByPoint(a);
      });
      return this;
    };
  })(),
  copy: function (a) {
    this.min.copy(a.min);
    this.max.copy(a.max);
    return this;
  },
  makeEmpty: function () {
    this.min.x = this.min.y = this.min.z = Infinity;
    this.max.x = this.max.y = this.max.z = -Infinity;
    return this;
  },
  empty: function () {
    return (
      this.max.x < this.min.x ||
      this.max.y < this.min.y ||
      this.max.z < this.min.z
    );
  },
  center: function (a) {
    return (a || new THREE.Vector3())
      .addVectors(this.min, this.max)
      .multiplyScalar(0.5);
  },
  size: function (a) {
    return (a || new THREE.Vector3()).subVectors(this.max, this.min);
  },
  expandByPoint: function (a) {
    this.min.min(a);
    this.max.max(a);
    return this;
  },
  expandByVector: function (a) {
    this.min.sub(a);
    this.max.add(a);
    return this;
  },
  expandByScalar: function (a) {
    this.min.addScalar(-a);
    this.max.addScalar(a);
    return this;
  },
  containsPoint: function (a) {
    return a.x < this.min.x ||
      a.x > this.max.x ||
      a.y < this.min.y ||
      a.y > this.max.y ||
      a.z < this.min.z ||
      a.z > this.max.z
      ? !1
      : !0;
  },
  containsBox: function (a) {
    return this.min.x <= a.min.x &&
      a.max.x <= this.max.x &&
      this.min.y <= a.min.y &&
      a.max.y <= this.max.y &&
      this.min.z <= a.min.z &&
      a.max.z <= this.max.z
      ? !0
      : !1;
  },
  getParameter: function (a) {
    return new THREE.Vector3(
      (a.x - this.min.x) / (this.max.x - this.min.x),
      (a.y - this.min.y) / (this.max.y - this.min.y),
      (a.z - this.min.z) / (this.max.z - this.min.z)
    );
  },
  isIntersectionBox: function (a) {
    return a.max.x < this.min.x ||
      a.min.x > this.max.x ||
      a.max.y < this.min.y ||
      a.min.y > this.max.y ||
      a.max.z < this.min.z ||
      a.min.z > this.max.z
      ? !1
      : !0;
  },
  clampPoint: function (a, b) {
    return (b || new THREE.Vector3()).copy(a).clamp(this.min, this.max);
  },
  distanceToPoint: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      return a.copy(b).clamp(this.min, this.max).sub(b).length();
    };
  })(),
  getBoundingSphere: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      b = b || new THREE.Sphere();
      b.center = this.center();
      b.radius = 0.5 * this.size(a).length();
      return b;
    };
  })(),
  intersect: function (a) {
    this.min.max(a.min);
    this.max.min(a.max);
    return this;
  },
  union: function (a) {
    this.min.min(a.min);
    this.max.max(a.max);
    return this;
  },
  applyMatrix4: (function () {
    var a = [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ];
    return function (b) {
      a[0].set(this.min.x, this.min.y, this.min.z).applyMatrix4(b);
      a[1].set(this.min.x, this.min.y, this.max.z).applyMatrix4(b);
      a[2].set(this.min.x, this.max.y, this.min.z).applyMatrix4(b);
      a[3].set(this.min.x, this.max.y, this.max.z).applyMatrix4(b);
      a[4].set(this.max.x, this.min.y, this.min.z).applyMatrix4(b);
      a[5].set(this.max.x, this.min.y, this.max.z).applyMatrix4(b);
      a[6].set(this.max.x, this.max.y, this.min.z).applyMatrix4(b);
      a[7].set(this.max.x, this.max.y, this.max.z).applyMatrix4(b);
      this.makeEmpty();
      this.setFromPoints(a);
      return this;
    };
  })(),
  translate: function (a) {
    this.min.add(a);
    this.max.add(a);
    return this;
  },
  equals: function (a) {
    return a.min.equals(this.min) && a.max.equals(this.max);
  },
  clone: function () {
    return new THREE.Box3().copy(this);
  },
};
THREE.Matrix3 = function (a, b, c, d, e, f, h, g, i) {
  this.elements = new Float32Array(9);
  this.set(
    void 0 !== a ? a : 1,
    b || 0,
    c || 0,
    d || 0,
    void 0 !== e ? e : 1,
    f || 0,
    h || 0,
    g || 0,
    void 0 !== i ? i : 1
  );
};
THREE.Matrix3.prototype = {
  constructor: THREE.Matrix3,
  set: function (a, b, c, d, e, f, h, g, i) {
    var k = this.elements;
    k[0] = a;
    k[3] = b;
    k[6] = c;
    k[1] = d;
    k[4] = e;
    k[7] = f;
    k[2] = h;
    k[5] = g;
    k[8] = i;
    return this;
  },
  identity: function () {
    this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
    return this;
  },
  copy: function (a) {
    a = a.elements;
    this.set(a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]);
    return this;
  },
  multiplyVector3: function (a) {
    console.warn(
      "DEPRECATED: Matrix3's .multiplyVector3() has been removed. Use vector.applyMatrix3( matrix ) instead."
    );
    return a.applyMatrix3(this);
  },
  multiplyVector3Array: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      for (var c = 0, d = b.length; c < d; c += 3)
        (a.x = b[c]),
          (a.y = b[c + 1]),
          (a.z = b[c + 2]),
          a.applyMatrix3(this),
          (b[c] = a.x),
          (b[c + 1] = a.y),
          (b[c + 2] = a.z);
      return b;
    };
  })(),
  multiplyScalar: function (a) {
    var b = this.elements;
    b[0] *= a;
    b[3] *= a;
    b[6] *= a;
    b[1] *= a;
    b[4] *= a;
    b[7] *= a;
    b[2] *= a;
    b[5] *= a;
    b[8] *= a;
    return this;
  },
  determinant: function () {
    var a = this.elements,
      b = a[0],
      c = a[1],
      d = a[2],
      e = a[3],
      f = a[4],
      h = a[5],
      g = a[6],
      i = a[7],
      a = a[8];
    return (
      b * f * a - b * h * i - c * e * a + c * h * g + d * e * i - d * f * g
    );
  },
  getInverse: function (a, b) {
    var c = a.elements,
      d = this.elements;
    d[0] = c[10] * c[5] - c[6] * c[9];
    d[1] = -c[10] * c[1] + c[2] * c[9];
    d[2] = c[6] * c[1] - c[2] * c[5];
    d[3] = -c[10] * c[4] + c[6] * c[8];
    d[4] = c[10] * c[0] - c[2] * c[8];
    d[5] = -c[6] * c[0] + c[2] * c[4];
    d[6] = c[9] * c[4] - c[5] * c[8];
    d[7] = -c[9] * c[0] + c[1] * c[8];
    d[8] = c[5] * c[0] - c[1] * c[4];
    c = c[0] * d[0] + c[1] * d[3] + c[2] * d[6];
    if (0 === c) {
      if (b)
        throw Error(
          "Matrix3.getInverse(): can't invert matrix, determinant is 0"
        );
      console.warn(
        "Matrix3.getInverse(): can't invert matrix, determinant is 0"
      );
      this.identity();
      return this;
    }
    this.multiplyScalar(1 / c);
    return this;
  },
  transpose: function () {
    var a,
      b = this.elements;
    a = b[1];
    b[1] = b[3];
    b[3] = a;
    a = b[2];
    b[2] = b[6];
    b[6] = a;
    a = b[5];
    b[5] = b[7];
    b[7] = a;
    return this;
  },
  getNormalMatrix: function (a) {
    this.getInverse(a).transpose();
    return this;
  },
  transposeIntoArray: function (a) {
    var b = this.elements;
    a[0] = b[0];
    a[1] = b[3];
    a[2] = b[6];
    a[3] = b[1];
    a[4] = b[4];
    a[5] = b[7];
    a[6] = b[2];
    a[7] = b[5];
    a[8] = b[8];
    return this;
  },
  clone: function () {
    var a = this.elements;
    return new THREE.Matrix3(
      a[0],
      a[3],
      a[6],
      a[1],
      a[4],
      a[7],
      a[2],
      a[5],
      a[8]
    );
  },
};
THREE.Matrix4 = function (a, b, c, d, e, f, h, g, i, k, m, l, p, s, t, n) {
  var r = (this.elements = new Float32Array(16));
  r[0] = void 0 !== a ? a : 1;
  r[4] = b || 0;
  r[8] = c || 0;
  r[12] = d || 0;
  r[1] = e || 0;
  r[5] = void 0 !== f ? f : 1;
  r[9] = h || 0;
  r[13] = g || 0;
  r[2] = i || 0;
  r[6] = k || 0;
  r[10] = void 0 !== m ? m : 1;
  r[14] = l || 0;
  r[3] = p || 0;
  r[7] = s || 0;
  r[11] = t || 0;
  r[15] = void 0 !== n ? n : 1;
};
THREE.Matrix4.prototype = {
  constructor: THREE.Matrix4,
  set: function (a, b, c, d, e, f, h, g, i, k, m, l, p, s, t, n) {
    var r = this.elements;
    r[0] = a;
    r[4] = b;
    r[8] = c;
    r[12] = d;
    r[1] = e;
    r[5] = f;
    r[9] = h;
    r[13] = g;
    r[2] = i;
    r[6] = k;
    r[10] = m;
    r[14] = l;
    r[3] = p;
    r[7] = s;
    r[11] = t;
    r[15] = n;
    return this;
  },
  identity: function () {
    this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    return this;
  },
  copy: function (a) {
    this.elements.set(a.elements);
    return this;
  },
  extractPosition: function (a) {
    console.warn(
      "DEPRECATED: Matrix4's .extractPosition() has been renamed to .copyPosition()."
    );
    return this.copyPosition(a);
  },
  copyPosition: function (a) {
    var b = this.elements,
      a = a.elements;
    b[12] = a[12];
    b[13] = a[13];
    b[14] = a[14];
    return this;
  },
  extractRotation: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      var c = this.elements,
        b = b.elements,
        d = 1 / a.set(b[0], b[1], b[2]).length(),
        e = 1 / a.set(b[4], b[5], b[6]).length(),
        f = 1 / a.set(b[8], b[9], b[10]).length();
      c[0] = b[0] * d;
      c[1] = b[1] * d;
      c[2] = b[2] * d;
      c[4] = b[4] * e;
      c[5] = b[5] * e;
      c[6] = b[6] * e;
      c[8] = b[8] * f;
      c[9] = b[9] * f;
      c[10] = b[10] * f;
      return this;
    };
  })(),
  makeRotationFromEuler: function (a) {
    !1 === a instanceof THREE.Euler &&
      console.error(
        "ERROR: Matrix's .makeRotationFromEuler() now expects a Euler rotation rather than a Vector3 and order.  Please update your code."
      );
    var b = this.elements,
      c = a.x,
      d = a.y,
      e = a.z,
      f = Math.cos(c),
      c = Math.sin(c),
      h = Math.cos(d),
      d = Math.sin(d),
      g = Math.cos(e),
      e = Math.sin(e);
    if ("XYZ" === a.order) {
      var a = f * g,
        i = f * e,
        k = c * g,
        m = c * e;
      b[0] = h * g;
      b[4] = -h * e;
      b[8] = d;
      b[1] = i + k * d;
      b[5] = a - m * d;
      b[9] = -c * h;
      b[2] = m - a * d;
      b[6] = k + i * d;
      b[10] = f * h;
    } else
      "YXZ" === a.order
        ? ((a = h * g),
          (i = h * e),
          (k = d * g),
          (m = d * e),
          (b[0] = a + m * c),
          (b[4] = k * c - i),
          (b[8] = f * d),
          (b[1] = f * e),
          (b[5] = f * g),
          (b[9] = -c),
          (b[2] = i * c - k),
          (b[6] = m + a * c),
          (b[10] = f * h))
        : "ZXY" === a.order
        ? ((a = h * g),
          (i = h * e),
          (k = d * g),
          (m = d * e),
          (b[0] = a - m * c),
          (b[4] = -f * e),
          (b[8] = k + i * c),
          (b[1] = i + k * c),
          (b[5] = f * g),
          (b[9] = m - a * c),
          (b[2] = -f * d),
          (b[6] = c),
          (b[10] = f * h))
        : "ZYX" === a.order
        ? ((a = f * g),
          (i = f * e),
          (k = c * g),
          (m = c * e),
          (b[0] = h * g),
          (b[4] = k * d - i),
          (b[8] = a * d + m),
          (b[1] = h * e),
          (b[5] = m * d + a),
          (b[9] = i * d - k),
          (b[2] = -d),
          (b[6] = c * h),
          (b[10] = f * h))
        : "YZX" === a.order
        ? ((a = f * h),
          (i = f * d),
          (k = c * h),
          (m = c * d),
          (b[0] = h * g),
          (b[4] = m - a * e),
          (b[8] = k * e + i),
          (b[1] = e),
          (b[5] = f * g),
          (b[9] = -c * g),
          (b[2] = -d * g),
          (b[6] = i * e + k),
          (b[10] = a - m * e))
        : "XZY" === a.order &&
          ((a = f * h),
          (i = f * d),
          (k = c * h),
          (m = c * d),
          (b[0] = h * g),
          (b[4] = -e),
          (b[8] = d * g),
          (b[1] = a * e + m),
          (b[5] = f * g),
          (b[9] = i * e - k),
          (b[2] = k * e - i),
          (b[6] = c * g),
          (b[10] = m * e + a));
    b[3] = 0;
    b[7] = 0;
    b[11] = 0;
    b[12] = 0;
    b[13] = 0;
    b[14] = 0;
    b[15] = 1;
    return this;
  },
  setRotationFromQuaternion: function (a) {
    console.warn(
      "DEPRECATED: Matrix4's .setRotationFromQuaternion() has been deprecated in favor of makeRotationFromQuaternion.  Please update your code."
    );
    return this.makeRotationFromQuaternion(a);
  },
  makeRotationFromQuaternion: function (a) {
    var b = this.elements,
      c = a.x,
      d = a.y,
      e = a.z,
      f = a.w,
      h = c + c,
      g = d + d,
      i = e + e,
      a = c * h,
      k = c * g,
      c = c * i,
      m = d * g,
      d = d * i,
      e = e * i,
      h = f * h,
      g = f * g,
      f = f * i;
    b[0] = 1 - (m + e);
    b[4] = k - f;
    b[8] = c + g;
    b[1] = k + f;
    b[5] = 1 - (a + e);
    b[9] = d - h;
    b[2] = c - g;
    b[6] = d + h;
    b[10] = 1 - (a + m);
    b[3] = 0;
    b[7] = 0;
    b[11] = 0;
    b[12] = 0;
    b[13] = 0;
    b[14] = 0;
    b[15] = 1;
    return this;
  },
  lookAt: (function () {
    var a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    return function (d, e, f) {
      var h = this.elements;
      c.subVectors(d, e).normalize();
      0 === c.length() && (c.z = 1);
      a.crossVectors(f, c).normalize();
      0 === a.length() && ((c.x += 1e-4), a.crossVectors(f, c).normalize());
      b.crossVectors(c, a);
      h[0] = a.x;
      h[4] = b.x;
      h[8] = c.x;
      h[1] = a.y;
      h[5] = b.y;
      h[9] = c.y;
      h[2] = a.z;
      h[6] = b.z;
      h[10] = c.z;
      return this;
    };
  })(),
  multiply: function (a, b) {
    return void 0 !== b
      ? (console.warn(
          "DEPRECATED: Matrix4's .multiply() now only accepts one argument. Use .multiplyMatrices( a, b ) instead."
        ),
        this.multiplyMatrices(a, b))
      : this.multiplyMatrices(this, a);
  },
  multiplyMatrices: function (a, b) {
    var c = a.elements,
      d = b.elements,
      e = this.elements,
      f = c[0],
      h = c[4],
      g = c[8],
      i = c[12],
      k = c[1],
      m = c[5],
      l = c[9],
      p = c[13],
      s = c[2],
      t = c[6],
      n = c[10],
      r = c[14],
      q = c[3],
      u = c[7],
      w = c[11],
      c = c[15],
      z = d[0],
      B = d[4],
      D = d[8],
      x = d[12],
      F = d[1],
      A = d[5],
      O = d[9],
      C = d[13],
      E = d[2],
      I = d[6],
      y = d[10],
      v = d[14],
      G = d[3],
      R = d[7],
      J = d[11],
      d = d[15];
    e[0] = f * z + h * F + g * E + i * G;
    e[4] = f * B + h * A + g * I + i * R;
    e[8] = f * D + h * O + g * y + i * J;
    e[12] = f * x + h * C + g * v + i * d;
    e[1] = k * z + m * F + l * E + p * G;
    e[5] = k * B + m * A + l * I + p * R;
    e[9] = k * D + m * O + l * y + p * J;
    e[13] = k * x + m * C + l * v + p * d;
    e[2] = s * z + t * F + n * E + r * G;
    e[6] = s * B + t * A + n * I + r * R;
    e[10] = s * D + t * O + n * y + r * J;
    e[14] = s * x + t * C + n * v + r * d;
    e[3] = q * z + u * F + w * E + c * G;
    e[7] = q * B + u * A + w * I + c * R;
    e[11] = q * D + u * O + w * y + c * J;
    e[15] = q * x + u * C + w * v + c * d;
    return this;
  },
  multiplyToArray: function (a, b, c) {
    var d = this.elements;
    this.multiplyMatrices(a, b);
    c[0] = d[0];
    c[1] = d[1];
    c[2] = d[2];
    c[3] = d[3];
    c[4] = d[4];
    c[5] = d[5];
    c[6] = d[6];
    c[7] = d[7];
    c[8] = d[8];
    c[9] = d[9];
    c[10] = d[10];
    c[11] = d[11];
    c[12] = d[12];
    c[13] = d[13];
    c[14] = d[14];
    c[15] = d[15];
    return this;
  },
  multiplyScalar: function (a) {
    var b = this.elements;
    b[0] *= a;
    b[4] *= a;
    b[8] *= a;
    b[12] *= a;
    b[1] *= a;
    b[5] *= a;
    b[9] *= a;
    b[13] *= a;
    b[2] *= a;
    b[6] *= a;
    b[10] *= a;
    b[14] *= a;
    b[3] *= a;
    b[7] *= a;
    b[11] *= a;
    b[15] *= a;
    return this;
  },
  multiplyVector3: function (a) {
    console.warn(
      "DEPRECATED: Matrix4's .multiplyVector3() has been removed. Use vector.applyMatrix4( matrix ) or vector.applyProjection( matrix ) instead."
    );
    return a.applyProjection(this);
  },
  multiplyVector4: function (a) {
    console.warn(
      "DEPRECATED: Matrix4's .multiplyVector4() has been removed. Use vector.applyMatrix4( matrix ) instead."
    );
    return a.applyMatrix4(this);
  },
  multiplyVector3Array: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      for (var c = 0, d = b.length; c < d; c += 3)
        (a.x = b[c]),
          (a.y = b[c + 1]),
          (a.z = b[c + 2]),
          a.applyProjection(this),
          (b[c] = a.x),
          (b[c + 1] = a.y),
          (b[c + 2] = a.z);
      return b;
    };
  })(),
  rotateAxis: function (a) {
    console.warn(
      "DEPRECATED: Matrix4's .rotateAxis() has been removed. Use Vector3.transformDirection( matrix ) instead."
    );
    a.transformDirection(this);
  },
  crossVector: function (a) {
    console.warn(
      "DEPRECATED: Matrix4's .crossVector() has been removed. Use vector.applyMatrix4( matrix ) instead."
    );
    return a.applyMatrix4(this);
  },
  determinant: function () {
    var a = this.elements,
      b = a[0],
      c = a[4],
      d = a[8],
      e = a[12],
      f = a[1],
      h = a[5],
      g = a[9],
      i = a[13],
      k = a[2],
      m = a[6],
      l = a[10],
      p = a[14];
    return (
      a[3] *
        (+e * g * m -
          d * i * m -
          e * h * l +
          c * i * l +
          d * h * p -
          c * g * p) +
      a[7] *
        (+b * g * p -
          b * i * l +
          e * f * l -
          d * f * p +
          d * i * k -
          e * g * k) +
      a[11] *
        (+b * i * m -
          b * h * p -
          e * f * m +
          c * f * p +
          e * h * k -
          c * i * k) +
      a[15] *
        (-d * h * k - b * g * m + b * h * l + d * f * m - c * f * l + c * g * k)
    );
  },
  transpose: function () {
    var a = this.elements,
      b;
    b = a[1];
    a[1] = a[4];
    a[4] = b;
    b = a[2];
    a[2] = a[8];
    a[8] = b;
    b = a[6];
    a[6] = a[9];
    a[9] = b;
    b = a[3];
    a[3] = a[12];
    a[12] = b;
    b = a[7];
    a[7] = a[13];
    a[13] = b;
    b = a[11];
    a[11] = a[14];
    a[14] = b;
    return this;
  },
  flattenToArray: function (a) {
    var b = this.elements;
    a[0] = b[0];
    a[1] = b[1];
    a[2] = b[2];
    a[3] = b[3];
    a[4] = b[4];
    a[5] = b[5];
    a[6] = b[6];
    a[7] = b[7];
    a[8] = b[8];
    a[9] = b[9];
    a[10] = b[10];
    a[11] = b[11];
    a[12] = b[12];
    a[13] = b[13];
    a[14] = b[14];
    a[15] = b[15];
    return a;
  },
  flattenToArrayOffset: function (a, b) {
    var c = this.elements;
    a[b] = c[0];
    a[b + 1] = c[1];
    a[b + 2] = c[2];
    a[b + 3] = c[3];
    a[b + 4] = c[4];
    a[b + 5] = c[5];
    a[b + 6] = c[6];
    a[b + 7] = c[7];
    a[b + 8] = c[8];
    a[b + 9] = c[9];
    a[b + 10] = c[10];
    a[b + 11] = c[11];
    a[b + 12] = c[12];
    a[b + 13] = c[13];
    a[b + 14] = c[14];
    a[b + 15] = c[15];
    return a;
  },
  getPosition: (function () {
    var a = new THREE.Vector3();
    return function () {
      console.warn(
        "DEPRECATED: Matrix4's .getPosition() has been removed. Use Vector3.getPositionFromMatrix( matrix ) instead."
      );
      var b = this.elements;
      return a.set(b[12], b[13], b[14]);
    };
  })(),
  setPosition: function (a) {
    var b = this.elements;
    b[12] = a.x;
    b[13] = a.y;
    b[14] = a.z;
    return this;
  },
  getInverse: function (a, b) {
    var c = this.elements,
      d = a.elements,
      e = d[0],
      f = d[4],
      h = d[8],
      g = d[12],
      i = d[1],
      k = d[5],
      m = d[9],
      l = d[13],
      p = d[2],
      s = d[6],
      t = d[10],
      n = d[14],
      r = d[3],
      q = d[7],
      u = d[11],
      d = d[15];
    c[0] =
      m * n * q - l * t * q + l * s * u - k * n * u - m * s * d + k * t * d;
    c[4] =
      g * t * q - h * n * q - g * s * u + f * n * u + h * s * d - f * t * d;
    c[8] =
      h * l * q - g * m * q + g * k * u - f * l * u - h * k * d + f * m * d;
    c[12] =
      g * m * s - h * l * s - g * k * t + f * l * t + h * k * n - f * m * n;
    c[1] =
      l * t * r - m * n * r - l * p * u + i * n * u + m * p * d - i * t * d;
    c[5] =
      h * n * r - g * t * r + g * p * u - e * n * u - h * p * d + e * t * d;
    c[9] =
      g * m * r - h * l * r - g * i * u + e * l * u + h * i * d - e * m * d;
    c[13] =
      h * l * p - g * m * p + g * i * t - e * l * t - h * i * n + e * m * n;
    c[2] =
      k * n * r - l * s * r + l * p * q - i * n * q - k * p * d + i * s * d;
    c[6] =
      g * s * r - f * n * r - g * p * q + e * n * q + f * p * d - e * s * d;
    c[10] =
      f * l * r - g * k * r + g * i * q - e * l * q - f * i * d + e * k * d;
    c[14] =
      g * k * p - f * l * p - g * i * s + e * l * s + f * i * n - e * k * n;
    c[3] =
      m * s * r - k * t * r - m * p * q + i * t * q + k * p * u - i * s * u;
    c[7] =
      f * t * r - h * s * r + h * p * q - e * t * q - f * p * u + e * s * u;
    c[11] =
      h * k * r - f * m * r - h * i * q + e * m * q + f * i * u - e * k * u;
    c[15] =
      f * m * p - h * k * p + h * i * s - e * m * s - f * i * t + e * k * t;
    c = e * c[0] + i * c[4] + p * c[8] + r * c[12];
    if (0 == c) {
      if (b)
        throw Error(
          "Matrix4.getInverse(): can't invert matrix, determinant is 0"
        );
      console.warn(
        "Matrix4.getInverse(): can't invert matrix, determinant is 0"
      );
      this.identity();
      return this;
    }
    this.multiplyScalar(1 / c);
    return this;
  },
  translate: function () {
    console.warn("DEPRECATED: Matrix4's .translate() has been removed.");
  },
  rotateX: function () {
    console.warn("DEPRECATED: Matrix4's .rotateX() has been removed.");
  },
  rotateY: function () {
    console.warn("DEPRECATED: Matrix4's .rotateY() has been removed.");
  },
  rotateZ: function () {
    console.warn("DEPRECATED: Matrix4's .rotateZ() has been removed.");
  },
  rotateByAxis: function () {
    console.warn("DEPRECATED: Matrix4's .rotateByAxis() has been removed.");
  },
  scale: function (a) {
    var b = this.elements,
      c = a.x,
      d = a.y,
      a = a.z;
    b[0] *= c;
    b[4] *= d;
    b[8] *= a;
    b[1] *= c;
    b[5] *= d;
    b[9] *= a;
    b[2] *= c;
    b[6] *= d;
    b[10] *= a;
    b[3] *= c;
    b[7] *= d;
    b[11] *= a;
    return this;
  },
  getMaxScaleOnAxis: function () {
    var a = this.elements;
    return Math.sqrt(
      Math.max(
        a[0] * a[0] + a[1] * a[1] + a[2] * a[2],
        Math.max(
          a[4] * a[4] + a[5] * a[5] + a[6] * a[6],
          a[8] * a[8] + a[9] * a[9] + a[10] * a[10]
        )
      )
    );
  },
  makeTranslation: function (a, b, c) {
    this.set(1, 0, 0, a, 0, 1, 0, b, 0, 0, 1, c, 0, 0, 0, 1);
    return this;
  },
  makeRotationX: function (a) {
    var b = Math.cos(a),
      a = Math.sin(a);
    this.set(1, 0, 0, 0, 0, b, -a, 0, 0, a, b, 0, 0, 0, 0, 1);
    return this;
  },
  makeRotationY: function (a) {
    var b = Math.cos(a),
      a = Math.sin(a);
    this.set(b, 0, a, 0, 0, 1, 0, 0, -a, 0, b, 0, 0, 0, 0, 1);
    return this;
  },
  makeRotationZ: function (a) {
    var b = Math.cos(a),
      a = Math.sin(a);
    this.set(b, -a, 0, 0, a, b, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    return this;
  },
  makeRotationAxis: function (a, b) {
    var c = Math.cos(b),
      d = Math.sin(b),
      e = 1 - c,
      f = a.x,
      h = a.y,
      g = a.z,
      i = e * f,
      k = e * h;
    this.set(
      i * f + c,
      i * h - d * g,
      i * g + d * h,
      0,
      i * h + d * g,
      k * h + c,
      k * g - d * f,
      0,
      i * g - d * h,
      k * g + d * f,
      e * g * g + c,
      0,
      0,
      0,
      0,
      1
    );
    return this;
  },
  makeScale: function (a, b, c) {
    this.set(a, 0, 0, 0, 0, b, 0, 0, 0, 0, c, 0, 0, 0, 0, 1);
    return this;
  },
  compose: function (a, b, c) {
    this.makeRotationFromQuaternion(b);
    this.scale(c);
    this.setPosition(a);
    return this;
  },
  decompose: (function () {
    var a = new THREE.Vector3(),
      b = new THREE.Matrix4();
    return function (c, d, e) {
      var f = this.elements,
        h = a.set(f[0], f[1], f[2]).length(),
        g = a.set(f[4], f[5], f[6]).length(),
        i = a.set(f[8], f[9], f[10]).length();
      c.x = f[12];
      c.y = f[13];
      c.z = f[14];
      b.elements.set(this.elements);
      var c = 1 / h,
        f = 1 / g,
        k = 1 / i;
      b.elements[0] *= c;
      b.elements[1] *= c;
      b.elements[2] *= c;
      b.elements[4] *= f;
      b.elements[5] *= f;
      b.elements[6] *= f;
      b.elements[8] *= k;
      b.elements[9] *= k;
      b.elements[10] *= k;
      d.setFromRotationMatrix(b);
      e.x = h;
      e.y = g;
      e.z = i;
      return this;
    };
  })(),
  makeFrustum: function (a, b, c, d, e, f) {
    var h = this.elements;
    h[0] = (2 * e) / (b - a);
    h[4] = 0;
    h[8] = (b + a) / (b - a);
    h[12] = 0;
    h[1] = 0;
    h[5] = (2 * e) / (d - c);
    h[9] = (d + c) / (d - c);
    h[13] = 0;
    h[2] = 0;
    h[6] = 0;
    h[10] = -(f + e) / (f - e);
    h[14] = (-2 * f * e) / (f - e);
    h[3] = 0;
    h[7] = 0;
    h[11] = -1;
    h[15] = 0;
    return this;
  },
  makePerspective: function (a, b, c, d) {
    var a = c * Math.tan(THREE.Math.degToRad(0.5 * a)),
      e = -a;
    return this.makeFrustum(e * b, a * b, e, a, c, d);
  },
  makeOrthographic: function (a, b, c, d, e, f) {
    var h = this.elements,
      g = b - a,
      i = c - d,
      k = f - e;
    h[0] = 2 / g;
    h[4] = 0;
    h[8] = 0;
    h[12] = -((b + a) / g);
    h[1] = 0;
    h[5] = 2 / i;
    h[9] = 0;
    h[13] = -((c + d) / i);
    h[2] = 0;
    h[6] = 0;
    h[10] = -2 / k;
    h[14] = -((f + e) / k);
    h[3] = 0;
    h[7] = 0;
    h[11] = 0;
    h[15] = 1;
    return this;
  },
  fromArray: function (a) {
    this.elements.set(a);
    return this;
  },
  toArray: function () {
    var a = this.elements;
    return [
      a[0],
      a[1],
      a[2],
      a[3],
      a[4],
      a[5],
      a[6],
      a[7],
      a[8],
      a[9],
      a[10],
      a[11],
      a[12],
      a[13],
      a[14],
      a[15],
    ];
  },
  clone: function () {
    var a = this.elements;
    return new THREE.Matrix4(
      a[0],
      a[4],
      a[8],
      a[12],
      a[1],
      a[5],
      a[9],
      a[13],
      a[2],
      a[6],
      a[10],
      a[14],
      a[3],
      a[7],
      a[11],
      a[15]
    );
  },
};
THREE.Ray = function (a, b) {
  this.origin = void 0 !== a ? a : new THREE.Vector3();
  this.direction = void 0 !== b ? b : new THREE.Vector3();
};
THREE.Ray.prototype = {
  constructor: THREE.Ray,
  set: function (a, b) {
    this.origin.copy(a);
    this.direction.copy(b);
    return this;
  },
  copy: function (a) {
    this.origin.copy(a.origin);
    this.direction.copy(a.direction);
    return this;
  },
  at: function (a, b) {
    return (b || new THREE.Vector3())
      .copy(this.direction)
      .multiplyScalar(a)
      .add(this.origin);
  },
  recast: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      this.origin.copy(this.at(b, a));
      return this;
    };
  })(),
  closestPointToPoint: function (a, b) {
    var c = b || new THREE.Vector3();
    c.subVectors(a, this.origin);
    var d = c.dot(this.direction);
    return 0 > d
      ? c.copy(this.origin)
      : c.copy(this.direction).multiplyScalar(d).add(this.origin);
  },
  distanceToPoint: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      var c = a.subVectors(b, this.origin).dot(this.direction);
      if (0 > c) return this.origin.distanceTo(b);
      a.copy(this.direction).multiplyScalar(c).add(this.origin);
      return a.distanceTo(b);
    };
  })(),
  distanceSqToSegment: function (a, b, c, d) {
    var e = a.clone().add(b).multiplyScalar(0.5),
      f = b.clone().sub(a).normalize(),
      h = 0.5 * a.distanceTo(b),
      g = this.origin.clone().sub(e),
      a = -this.direction.dot(f),
      b = g.dot(this.direction),
      i = -g.dot(f),
      k = g.lengthSq(),
      m = Math.abs(1 - a * a),
      l,
      p;
    0 <= m
      ? ((g = a * i - b),
        (l = a * b - i),
        (p = h * m),
        0 <= g
          ? l >= -p
            ? l <= p
              ? ((h = 1 / m),
                (g *= h),
                (l *= h),
                (a = g * (g + a * l + 2 * b) + l * (a * g + l + 2 * i) + k))
              : ((l = h),
                (g = Math.max(0, -(a * l + b))),
                (a = -g * g + l * (l + 2 * i) + k))
            : ((l = -h),
              (g = Math.max(0, -(a * l + b))),
              (a = -g * g + l * (l + 2 * i) + k))
          : l <= -p
          ? ((g = Math.max(0, -(-a * h + b))),
            (l = 0 < g ? -h : Math.min(Math.max(-h, -i), h)),
            (a = -g * g + l * (l + 2 * i) + k))
          : l <= p
          ? ((g = 0),
            (l = Math.min(Math.max(-h, -i), h)),
            (a = l * (l + 2 * i) + k))
          : ((g = Math.max(0, -(a * h + b))),
            (l = 0 < g ? h : Math.min(Math.max(-h, -i), h)),
            (a = -g * g + l * (l + 2 * i) + k)))
      : ((l = 0 < a ? -h : h),
        (g = Math.max(0, -(a * l + b))),
        (a = -g * g + l * (l + 2 * i) + k));
    c && c.copy(this.direction.clone().multiplyScalar(g).add(this.origin));
    d && d.copy(f.clone().multiplyScalar(l).add(e));
    return a;
  },
  isIntersectionSphere: function (a) {
    return this.distanceToPoint(a.center) <= a.radius;
  },
  isIntersectionPlane: function (a) {
    var b = a.distanceToPoint(this.origin);
    return 0 === b || 0 > a.normal.dot(this.direction) * b ? !0 : !1;
  },
  distanceToPlane: function (a) {
    var b = a.normal.dot(this.direction);
    if (0 == b) return 0 == a.distanceToPoint(this.origin) ? 0 : null;
    a = -(this.origin.dot(a.normal) + a.constant) / b;
    return 0 <= a ? a : null;
  },
  intersectPlane: function (a, b) {
    var c = this.distanceToPlane(a);
    return null === c ? null : this.at(c, b);
  },
  isIntersectionBox: (function () {
    var a = new THREE.Vector3();
    return function (b) {
      return null !== this.intersectBox(b, a);
    };
  })(),
  intersectBox: function (a, b) {
    var c, d, e, f, h;
    d = 1 / this.direction.x;
    f = 1 / this.direction.y;
    h = 1 / this.direction.z;
    var g = this.origin;
    0 <= d
      ? ((c = (a.min.x - g.x) * d), (d *= a.max.x - g.x))
      : ((c = (a.max.x - g.x) * d), (d *= a.min.x - g.x));
    0 <= f
      ? ((e = (a.min.y - g.y) * f), (f *= a.max.y - g.y))
      : ((e = (a.max.y - g.y) * f), (f *= a.min.y - g.y));
    if (c > f || e > d) return null;
    if (e > c || c !== c) c = e;
    if (f < d || d !== d) d = f;
    0 <= h
      ? ((e = (a.min.z - g.z) * h), (h *= a.max.z - g.z))
      : ((e = (a.max.z - g.z) * h), (h *= a.min.z - g.z));
    if (c > h || e > d) return null;
    if (e > c || c !== c) c = e;
    if (h < d || d !== d) d = h;
    return 0 > d ? null : this.at(0 <= c ? c : d, b);
  },
  intersectTriangle: (function () {
    var a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      d = new THREE.Vector3();
    return function (e, f, h, g, i) {
      b.subVectors(f, e);
      c.subVectors(h, e);
      d.crossVectors(b, c);
      f = this.direction.dot(d);
      if (0 < f) {
        if (g) return null;
        g = 1;
      } else if (0 > f) (g = -1), (f = -f);
      else return null;
      a.subVectors(this.origin, e);
      e = g * this.direction.dot(c.crossVectors(a, c));
      if (0 > e) return null;
      h = g * this.direction.dot(b.cross(a));
      if (0 > h || e + h > f) return null;
      e = -g * a.dot(d);
      return 0 > e ? null : this.at(e / f, i);
    };
  })(),
  applyMatrix4: function (a) {
    this.direction.add(this.origin).applyMatrix4(a);
    this.origin.applyMatrix4(a);
    this.direction.sub(this.origin);
    this.direction.normalize();
    return this;
  },
  equals: function (a) {
    return a.origin.equals(this.origin) && a.direction.equals(this.direction);
  },
  clone: function () {
    return new THREE.Ray().copy(this);
  },
};
THREE.Sphere = function (a, b) {
  this.center = void 0 !== a ? a : new THREE.Vector3();
  this.radius = void 0 !== b ? b : 0;
};
THREE.Sphere.prototype = {
  constructor: THREE.Sphere,
  set: function (a, b) {
    this.center.copy(a);
    this.radius = b;
    return this;
  },
  setFromPoints: (function () {
    var a = new THREE.Box3();
    return function (b, c) {
      var d = this.center;
      void 0 !== c ? d.copy(c) : a.setFromPoints(b).center(d);
      for (var e = 0, f = 0, h = b.length; f < h; f++)
        e = Math.max(e, d.distanceToSquared(b[f]));
      this.radius = Math.sqrt(e);
      return this;
    };
  })(),
  copy: function (a) {
    this.center.copy(a.center);
    this.radius = a.radius;
    return this;
  },
  empty: function () {
    return 0 >= this.radius;
  },
  containsPoint: function (a) {
    return a.distanceToSquared(this.center) <= this.radius * this.radius;
  },
  distanceToPoint: function (a) {
    return a.distanceTo(this.center) - this.radius;
  },
  intersectsSphere: function (a) {
    var b = this.radius + a.radius;
    return a.center.distanceToSquared(this.center) <= b * b;
  },
  clampPoint: function (a, b) {
    var c = this.center.distanceToSquared(a),
      d = b || new THREE.Vector3();
    d.copy(a);
    c > this.radius * this.radius &&
      (d.sub(this.center).normalize(),
      d.multiplyScalar(this.radius).add(this.center));
    return d;
  },
  getBoundingBox: function (a) {
    a = a || new THREE.Box3();
    a.set(this.center, this.center);
    a.expandByScalar(this.radius);
    return a;
  },
  applyMatrix4: function (a) {
    this.center.applyMatrix4(a);
    this.radius *= a.getMaxScaleOnAxis();
    return this;
  },
  translate: function (a) {
    this.center.add(a);
    return this;
  },
  equals: function (a) {
    return a.center.equals(this.center) && a.radius === this.radius;
  },
  clone: function () {
    return new THREE.Sphere().copy(this);
  },
};
THREE.Frustum = function (a, b, c, d, e, f) {
  this.planes = [
    void 0 !== a ? a : new THREE.Plane(),
    void 0 !== b ? b : new THREE.Plane(),
    void 0 !== c ? c : new THREE.Plane(),
    void 0 !== d ? d : new THREE.Plane(),
    void 0 !== e ? e : new THREE.Plane(),
    void 0 !== f ? f : new THREE.Plane(),
  ];
};
THREE.Frustum.prototype = {
  constructor: THREE.Frustum,
  set: function (a, b, c, d, e, f) {
    var h = this.planes;
    h[0].copy(a);
    h[1].copy(b);
    h[2].copy(c);
    h[3].copy(d);
    h[4].copy(e);
    h[5].copy(f);
    return this;
  },
  copy: function (a) {
    for (var b = this.planes, c = 0; 6 > c; c++) b[c].copy(a.planes[c]);
    return this;
  },
  setFromMatrix: function (a) {
    var b = this.planes,
      c = a.elements,
      a = c[0],
      d = c[1],
      e = c[2],
      f = c[3],
      h = c[4],
      g = c[5],
      i = c[6],
      k = c[7],
      m = c[8],
      l = c[9],
      p = c[10],
      s = c[11],
      t = c[12],
      n = c[13],
      r = c[14],
      c = c[15];
    b[0].setComponents(f - a, k - h, s - m, c - t).normalize();
    b[1].setComponents(f + a, k + h, s + m, c + t).normalize();
    b[2].setComponents(f + d, k + g, s + l, c + n).normalize();
    b[3].setComponents(f - d, k - g, s - l, c - n).normalize();
    b[4].setComponents(f - e, k - i, s - p, c - r).normalize();
    b[5].setComponents(f + e, k + i, s + p, c + r).normalize();
    return this;
  },
  intersectsObject: (function () {
    var a = new THREE.Sphere();
    return function (b) {
      var c = b.geometry;
      null === c.boundingSphere && c.computeBoundingSphere();
      a.copy(c.boundingSphere);
      a.applyMatrix4(b.matrixWorld);
      return this.intersectsSphere(a);
    };
  })(),
  intersectsSphere: function (a) {
    for (var b = this.planes, c = a.center, a = -a.radius, d = 0; 6 > d; d++)
      if (b[d].distanceToPoint(c) < a) return !1;
    return !0;
  },
  intersectsBox: (function () {
    var a = new THREE.Vector3(),
      b = new THREE.Vector3();
    return function (c) {
      for (var d = this.planes, e = 0; 6 > e; e++) {
        var f = d[e];
        a.x = 0 < f.normal.x ? c.min.x : c.max.x;
        b.x = 0 < f.normal.x ? c.max.x : c.min.x;
        a.y = 0 < f.normal.y ? c.min.y : c.max.y;
        b.y = 0 < f.normal.y ? c.max.y : c.min.y;
        a.z = 0 < f.normal.z ? c.min.z : c.max.z;
        b.z = 0 < f.normal.z ? c.max.z : c.min.z;
        var h = f.distanceToPoint(a),
          f = f.distanceToPoint(b);
        if (0 > h && 0 > f) return !1;
      }
      return !0;
    };
  })(),
  containsPoint: function (a) {
    for (var b = this.planes, c = 0; 6 > c; c++)
      if (0 > b[c].distanceToPoint(a)) return !1;
    return !0;
  },
  clone: function () {
    return new THREE.Frustum().copy(this);
  },
};
THREE.Plane = function (a, b) {
  this.normal = void 0 !== a ? a : new THREE.Vector3(1, 0, 0);
  this.constant = void 0 !== b ? b : 0;
};
THREE.Plane.prototype = {
  constructor: THREE.Plane,
  set: function (a, b) {
    this.normal.copy(a);
    this.constant = b;
    return this;
  },
  setComponents: function (a, b, c, d) {
    this.normal.set(a, b, c);
    this.constant = d;
    return this;
  },
  setFromNormalAndCoplanarPoint: function (a, b) {
    this.normal.copy(a);
    this.constant = -b.dot(this.normal);
    return this;
  },
  setFromCoplanarPoints: (function () {
    var a = new THREE.Vector3(),
      b = new THREE.Vector3();
    return function (c, d, e) {
      d = a.subVectors(e, d).cross(b.subVectors(c, d)).normalize();
      this.setFromNormalAndCoplanarPoint(d, c);
      return this;
    };
  })(),
  copy: function (a) {
    this.normal.copy(a.normal);
    this.constant = a.constant;
    return this;
  },
  normalize: function () {
    var a = 1 / this.normal.length();
    this.normal.multiplyScalar(a);
    this.constant *= a;
    return this;
  },
  negate: function () {
    this.constant *= -1;
    this.normal.negate();
    return this;
  },
  distanceToPoint: function (a) {
    return this.normal.dot(a) + this.constant;
  },
  distanceToSphere: function (a) {
    return this.distanceToPoint(a.center) - a.radius;
  },
  projectPoint: function (a, b) {
    return this.orthoPoint(a, b).sub(a).negate();
  },
  orthoPoint: function (a, b) {
    var c = this.distanceToPoint(a);
    return (b || new THREE.Vector3()).copy(this.normal).multiplyScalar(c);
  },
  isIntersectionLine: function (a) {
    var b = this.distanceToPoint(a.start),
      a = this.distanceToPoint(a.end);
    return (0 > b && 0 < a) || (0 > a && 0 < b);
  },
  intersectLine: (function () {
    var a = new THREE.Vector3();
    return function (b, c) {
      var d = c || new THREE.Vector3(),
        e = b.delta(a),
        f = this.normal.dot(e);
      if (0 == f) {
        if (0 == this.distanceToPoint(b.start)) return d.copy(b.start);
      } else
        return (
          (f = -(b.start.dot(this.normal) + this.constant) / f),
          0 > f || 1 < f ? void 0 : d.copy(e).multiplyScalar(f).add(b.start)
        );
    };
  })(),
  coplanarPoint: function (a) {
    return (a || new THREE.Vector3())
      .copy(this.normal)
      .multiplyScalar(-this.constant);
  },
  applyMatrix4: (function () {
    var a = new THREE.Vector3(),
      b = new THREE.Vector3();
    return function (c, d) {
      var d = d || new THREE.Matrix3().getNormalMatrix(c),
        e = a.copy(this.normal).applyMatrix3(d),
        f = this.coplanarPoint(b);
      f.applyMatrix4(c);
      this.setFromNormalAndCoplanarPoint(e, f);
      return this;
    };
  })(),
  translate: function (a) {
    this.constant -= a.dot(this.normal);
    return this;
  },
  equals: function (a) {
    return a.normal.equals(this.normal) && a.constant == this.constant;
  },
  clone: function () {
    return new THREE.Plane().copy(this);
  },
};
THREE.Math = {
  PI2: 2 * Math.PI,
  generateUUID: (function () {
    var a =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split(
          ""
        ),
      b = Array(36),
      c = 0,
      d;
    return function () {
      for (var e = 0; 36 > e; e++)
        8 == e || 13 == e || 18 == e || 23 == e
          ? (b[e] = "-")
          : 14 == e
          ? (b[e] = "4")
          : (2 >= c && (c = (33554432 + 16777216 * Math.random()) | 0),
            (d = c & 15),
            (c >>= 4),
            (b[e] = a[19 == e ? (d & 3) | 8 : d]));
      return b.join("");
    };
  })(),
  clamp: function (a, b, c) {
    return a < b ? b : a > c ? c : a;
  },
  clampBottom: function (a, b) {
    return a < b ? b : a;
  },
  mapLinear: function (a, b, c, d, e) {
    return d + ((a - b) * (e - d)) / (c - b);
  },
  smoothstep: function (a, b, c) {
    if (a <= b) return 0;
    if (a >= c) return 1;
    a = (a - b) / (c - b);
    return a * a * (3 - 2 * a);
  },
  smootherstep: function (a, b, c) {
    if (a <= b) return 0;
    if (a >= c) return 1;
    a = (a - b) / (c - b);
    return a * a * a * (a * (6 * a - 15) + 10);
  },
  random16: function () {
    return (65280 * Math.random() + 255 * Math.random()) / 65535;
  },
  randInt: function (a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  },
  randFloat: function (a, b) {
    return a + Math.random() * (b - a);
  },
  randFloatSpread: function (a) {
    return a * (0.5 - Math.random());
  },
  sign: function (a) {
    return 0 > a ? -1 : 0 < a ? 1 : 0;
  },
  degToRad: (function () {
    var a = Math.PI / 180;
    return function (b) {
      return b * a;
    };
  })(),
  radToDeg: (function () {
    var a = 180 / Math.PI;
    return function (b) {
      return b * a;
    };
  })(),
};
THREE.Spline = function (a) {
  function b(a, b, c, d, e, f, h) {
    a = 0.5 * (c - a);
    d = 0.5 * (d - b);
    return (
      (2 * (b - c) + a + d) * h + (-3 * (b - c) - 2 * a - d) * f + a * e + b
    );
  }
  this.points = a;
  var c = [],
    d = { x: 0, y: 0, z: 0 },
    e,
    f,
    h,
    g,
    i,
    k,
    m,
    l,
    p;
  this.initFromArray = function (a) {
    this.points = [];
    for (var b = 0; b < a.length; b++)
      this.points[b] = { x: a[b][0], y: a[b][1], z: a[b][2] };
  };
  this.getPoint = function (a) {
    e = (this.points.length - 1) * a;
    f = Math.floor(e);
    h = e - f;
    c[0] = 0 === f ? f : f - 1;
    c[1] = f;
    c[2] = f > this.points.length - 2 ? this.points.length - 1 : f + 1;
    c[3] = f > this.points.length - 3 ? this.points.length - 1 : f + 2;
    k = this.points[c[0]];
    m = this.points[c[1]];
    l = this.points[c[2]];
    p = this.points[c[3]];
    g = h * h;
    i = h * g;
    d.x = b(k.x, m.x, l.x, p.x, h, g, i);
    d.y = b(k.y, m.y, l.y, p.y, h, g, i);
    d.z = b(k.z, m.z, l.z, p.z, h, g, i);
    return d;
  };
  this.getControlPointsArray = function () {
    var a,
      b,
      c = this.points.length,
      d = [];
    for (a = 0; a < c; a++) (b = this.points[a]), (d[a] = [b.x, b.y, b.z]);
    return d;
  };
  this.getLength = function (a) {
    var b,
      c,
      d,
      e = (b = b = 0),
      f = new THREE.Vector3(),
      h = new THREE.Vector3(),
      g = [],
      i = 0;
    g[0] = 0;
    a || (a = 100);
    c = this.points.length * a;
    f.copy(this.points[0]);
    for (a = 1; a < c; a++)
      (b = a / c),
        (d = this.getPoint(b)),
        h.copy(d),
        (i += h.distanceTo(f)),
        f.copy(d),
        (b *= this.points.length - 1),
        (b = Math.floor(b)),
        b != e && ((g[b] = i), (e = b));
    g[g.length] = i;
    return { chunks: g, total: i };
  };
  this.reparametrizeByArcLength = function (a) {
    var b,
      c,
      d,
      e,
      f,
      h,
      g = [],
      i = new THREE.Vector3(),
      k = this.getLength();
    g.push(i.copy(this.points[0]).clone());
    for (b = 1; b < this.points.length; b++) {
      c = k.chunks[b] - k.chunks[b - 1];
      h = Math.ceil((a * c) / k.total);
      e = (b - 1) / (this.points.length - 1);
      f = b / (this.points.length - 1);
      for (c = 1; c < h - 1; c++)
        (d = e + c * (1 / h) * (f - e)),
          (d = this.getPoint(d)),
          g.push(i.copy(d).clone());
      g.push(i.copy(this.points[b]).clone());
    }
    this.points = g;
  };
};
THREE.Triangle = function (a, b, c) {
  this.a = void 0 !== a ? a : new THREE.Vector3();
  this.b = void 0 !== b ? b : new THREE.Vector3();
  this.c = void 0 !== c ? c : new THREE.Vector3();
};
THREE.Triangle.normal = (function () {
  var a = new THREE.Vector3();
  return function (b, c, d, e) {
    e = e || new THREE.Vector3();
    e.subVectors(d, c);
    a.subVectors(b, c);
    e.cross(a);
    b = e.lengthSq();
    return 0 < b ? e.multiplyScalar(1 / Math.sqrt(b)) : e.set(0, 0, 0);
  };
})();
THREE.Triangle.barycoordFromPoint = (function () {
  var a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  return function (d, e, f, h, g) {
    a.subVectors(h, e);
    b.subVectors(f, e);
    c.subVectors(d, e);
    var d = a.dot(a),
      e = a.dot(b),
      f = a.dot(c),
      i = b.dot(b),
      h = b.dot(c),
      k = d * i - e * e,
      g = g || new THREE.Vector3();
    if (0 == k) return g.set(-2, -1, -1);
    k = 1 / k;
    i = (i * f - e * h) * k;
    d = (d * h - e * f) * k;
    return g.set(1 - i - d, d, i);
  };
})();
THREE.Triangle.containsPoint = (function () {
  var a = new THREE.Vector3();
  return function (b, c, d, e) {
    b = THREE.Triangle.barycoordFromPoint(b, c, d, e, a);
    return 0 <= b.x && 0 <= b.y && 1 >= b.x + b.y;
  };
})();
THREE.Triangle.prototype = {
  constructor: THREE.Triangle,
  set: function (a, b, c) {
    this.a.copy(a);
    this.b.copy(b);
    this.c.copy(c);
    return this;
  },
  setFromPointsAndIndices: function (a, b, c, d) {
    this.a.copy(a[b]);
    this.b.copy(a[c]);
    this.c.copy(a[d]);
    return this;
  },
  copy: function (a) {
    this.a.copy(a.a);
    this.b.copy(a.b);
    this.c.copy(a.c);
    return this;
  },
  area: (function () {
    var a = new THREE.Vector3(),
      b = new THREE.Vector3();
    return function () {
      a.subVectors(this.c, this.b);
      b.subVectors(this.a, this.b);
      return 0.5 * a.cross(b).length();
    };
  })(),
  midpoint: function (a) {
    return (a || new THREE.Vector3())
      .addVectors(this.a, this.b)
      .add(this.c)
      .multiplyScalar(1 / 3);
  },
  normal: function (a) {
    return THREE.Triangle.normal(this.a, this.b, this.c, a);
  },
  plane: function (a) {
    return (a || new THREE.Plane()).setFromCoplanarPoints(
      this.a,
      this.b,
      this.c
    );
  },
  barycoordFromPoint: function (a, b) {
    return THREE.Triangle.barycoordFromPoint(a, this.a, this.b, this.c, b);
  },
  containsPoint: function (a) {
    return THREE.Triangle.containsPoint(a, this.a, this.b, this.c);
  },
  equals: function (a) {
    return a.a.equals(this.a) && a.b.equals(this.b) && a.c.equals(this.c);
  },
  clone: function () {
    return new THREE.Triangle().copy(this);
  },
};
THREE.Vertex = function (a) {
  console.warn("THREE.Vertex has been DEPRECATED. Use THREE.Vector3 instead.");
  return a;
};
THREE.UV = function (a, b) {
  console.warn("THREE.UV has been DEPRECATED. Use THREE.Vector2 instead.");
  return new THREE.Vector2(a, b);
};
THREE.Clock = function (a) {
  this.autoStart = void 0 !== a ? a : !0;
  this.elapsedTime = this.oldTime = this.startTime = 0;
  this.running = !1;
};
THREE.Clock.prototype = {
  constructor: THREE.Clock,
  start: function () {
    this.oldTime = this.startTime =
      void 0 !== self.performance && void 0 !== self.performance.now
        ? self.performance.now()
        : Date.now();
    this.running = !0;
  },
  stop: function () {
    this.getElapsedTime();
    this.running = !1;
  },
  getElapsedTime: function () {
    this.getDelta();
    return this.elapsedTime;
  },
  getDelta: function () {
    var a = 0;
    this.autoStart && !this.running && this.start();
    if (this.running) {
      var b =
          void 0 !== self.performance && void 0 !== self.performance.now
            ? self.performance.now()
            : Date.now(),
        a = 0.001 * (b - this.oldTime);
      this.oldTime = b;
      this.elapsedTime += a;
    }
    return a;
  },
};
THREE.EventDispatcher = function () {};
THREE.EventDispatcher.prototype = {
  constructor: THREE.EventDispatcher,
  apply: function (a) {
    a.addEventListener = THREE.EventDispatcher.prototype.addEventListener;
    a.hasEventListener = THREE.EventDispatcher.prototype.hasEventListener;
    a.removeEventListener = THREE.EventDispatcher.prototype.removeEventListener;
    a.dispatchEvent = THREE.EventDispatcher.prototype.dispatchEvent;
  },
  addEventListener: function (a, b) {
    void 0 === this._listeners && (this._listeners = {});
    var c = this._listeners;
    void 0 === c[a] && (c[a] = []);
    -1 === c[a].indexOf(b) && c[a].push(b);
  },
  hasEventListener: function (a, b) {
    if (void 0 === this._listeners) return !1;
    var c = this._listeners;
    return void 0 !== c[a] && -1 !== c[a].indexOf(b) ? !0 : !1;
  },
  removeEventListener: function (a, b) {
    if (void 0 !== this._listeners) {
      var c = this._listeners,
        d = c[a].indexOf(b);
      -1 !== d && c[a].splice(d, 1);
    }
  },
  dispatchEvent: (function () {
    var a = [];
    return function (b) {
      if (void 0 !== this._listeners) {
        var c = this._listeners[b.type];
        if (void 0 !== c) {
          b.target = this;
          for (var d = c.length, e = 0; e < d; e++) a[e] = c[e];
          for (e = 0; e < d; e++) a[e].call(this, b);
        }
      }
    };
  })(),
};
(function (a) {
  a.Raycaster = function (b, c, d, e) {
    this.ray = new a.Ray(b, c);
    this.near = d || 0;
    this.far = e || Infinity;
  };
  var b = new a.Sphere(),
    c = new a.Ray();
  new a.Plane();
  new a.Vector3();
  var d = new a.Vector3(),
    e = new a.Matrix4(),
    f = function (a, b) {
      return a.distance - b.distance;
    },
    h = new a.Vector3(),
    g = new a.Vector3(),
    i = new a.Vector3(),
    k = function (f, m, s) {
      if (f instanceof a.Sprite) {
        d.getPositionFromMatrix(f.matrixWorld);
        var t = m.ray.distanceToPoint(d);
        if (t > f.scale.x) return s;
        s.push({ distance: t, point: f.position, face: null, object: f });
      } else if (f instanceof a.LOD)
        d.getPositionFromMatrix(f.matrixWorld),
          (t = m.ray.origin.distanceTo(d)),
          k(f.getObjectForDistance(t), m, s);
      else if (f instanceof a.Mesh) {
        var n = f.geometry;
        null === n.boundingSphere && n.computeBoundingSphere();
        b.copy(n.boundingSphere);
        b.applyMatrix4(f.matrixWorld);
        if (!1 === m.ray.isIntersectionSphere(b)) return s;
        e.getInverse(f.matrixWorld);
        c.copy(m.ray).applyMatrix4(e);
        if (null !== n.boundingBox && !1 === c.isIntersectionBox(n.boundingBox))
          return s;
        if (n instanceof a.BufferGeometry) {
          var r = f.material;
          if (void 0 === r || !1 === n.dynamic) return s;
          var q,
            u,
            w = m.precision;
          if (void 0 !== n.attributes.index)
            for (
              var z = n.offsets,
                B = n.attributes.index.array,
                D = n.attributes.position.array,
                x = n.offsets.length,
                F = n.attributes.index.array.length / 3,
                F = 0;
              F < x;
              ++F
            )
              for (
                var t = z[F].start, A = z[F].index, n = t, O = t + z[F].count;
                n < O;
                n += 3
              )
                (t = A + B[n]),
                  (q = A + B[n + 1]),
                  (u = A + B[n + 2]),
                  h.set(D[3 * t], D[3 * t + 1], D[3 * t + 2]),
                  g.set(D[3 * q], D[3 * q + 1], D[3 * q + 2]),
                  i.set(D[3 * u], D[3 * u + 1], D[3 * u + 2]),
                  (q =
                    r.side === a.BackSide
                      ? c.intersectTriangle(i, g, h, !0)
                      : c.intersectTriangle(h, g, i, r.side !== a.DoubleSide)),
                  null !== q &&
                    (q.applyMatrix4(f.matrixWorld),
                    (t = m.ray.origin.distanceTo(q)),
                    t < w ||
                      t < m.near ||
                      t > m.far ||
                      s.push({
                        distance: t,
                        point: q,
                        face: null,
                        faceIndex: null,
                        object: f,
                      }));
          else {
            D = n.attributes.position.array;
            F = n.attributes.position.array.length;
            for (n = 0; n < F; n += 3)
              (t = n),
                (q = n + 1),
                (u = n + 2),
                h.set(D[3 * t], D[3 * t + 1], D[3 * t + 2]),
                g.set(D[3 * q], D[3 * q + 1], D[3 * q + 2]),
                i.set(D[3 * u], D[3 * u + 1], D[3 * u + 2]),
                (q =
                  r.side === a.BackSide
                    ? c.intersectTriangle(i, g, h, !0)
                    : c.intersectTriangle(h, g, i, r.side !== a.DoubleSide)),
                null !== q &&
                  (q.applyMatrix4(f.matrixWorld),
                  (t = m.ray.origin.distanceTo(q)),
                  t < w ||
                    t < m.near ||
                    t > m.far ||
                    s.push({
                      distance: t,
                      point: q,
                      face: null,
                      faceIndex: null,
                      object: f,
                    }));
          }
        } else if (n instanceof a.Geometry) {
          B = f.material instanceof a.MeshFaceMaterial;
          D = !0 === B ? f.material.materials : null;
          w = m.precision;
          z = n.vertices;
          x = 0;
          for (F = n.faces.length; x < F; x++)
            (A = n.faces[x]),
              (r = !0 === B ? D[A.materialIndex] : f.material),
              void 0 !== r &&
                ((t = z[A.a]),
                (q = z[A.b]),
                (u = z[A.c]),
                (q =
                  r.side === a.BackSide
                    ? c.intersectTriangle(u, q, t, !0)
                    : c.intersectTriangle(t, q, u, r.side !== a.DoubleSide)),
                null !== q &&
                  (q.applyMatrix4(f.matrixWorld),
                  (t = m.ray.origin.distanceTo(q)),
                  t < w ||
                    t < m.near ||
                    t > m.far ||
                    s.push({
                      distance: t,
                      point: q,
                      face: A,
                      faceIndex: x,
                      object: f,
                    })));
        }
      } else if (f instanceof a.Line) {
        w = m.linePrecision;
        r = w * w;
        n = f.geometry;
        null === n.boundingSphere && n.computeBoundingSphere();
        b.copy(n.boundingSphere);
        b.applyMatrix4(f.matrixWorld);
        if (!1 === m.ray.isIntersectionSphere(b)) return s;
        e.getInverse(f.matrixWorld);
        c.copy(m.ray).applyMatrix4(e);
        if (n instanceof a.Geometry) {
          z = n.vertices;
          w = z.length;
          q = new a.Vector3();
          u = new a.Vector3();
          F = f.type === a.LineStrip ? 1 : 2;
          for (n = 0; n < w - 1; n += F)
            c.distanceSqToSegment(z[n], z[n + 1], u, q) > r ||
              ((t = c.origin.distanceTo(u)),
              t < m.near ||
                t > m.far ||
                s.push({
                  distance: t,
                  point: q.clone().applyMatrix4(f.matrixWorld),
                  face: null,
                  faceIndex: null,
                  object: f,
                }));
        }
      }
    },
    m = function (a, b, c) {
      for (var a = a.getDescendants(), d = 0, e = a.length; d < e; d++)
        k(a[d], b, c);
    };
  a.Raycaster.prototype.precision = 1e-4;
  a.Raycaster.prototype.linePrecision = 1;
  a.Raycaster.prototype.set = function (a, b) {
    this.ray.set(a, b);
  };
  a.Raycaster.prototype.intersectObject = function (a, b) {
    var c = [];
    !0 === b && m(a, this, c);
    k(a, this, c);
    c.sort(f);
    return c;
  };
  a.Raycaster.prototype.intersectObjects = function (a, b) {
    for (var c = [], d = 0, e = a.length; d < e; d++)
      k(a[d], this, c), !0 === b && m(a[d], this, c);
    c.sort(f);
    return c;
  };
})(THREE);
THREE.Object3D = function () {
  this.id = THREE.Object3DIdCount++;
  this.uuid = THREE.Math.generateUUID();
  this.name = "";
  this.parent = void 0;
  this.children = [];
  this.up = new THREE.Vector3(0, 1, 0);
  this.position = new THREE.Vector3();
  this.rotation = new THREE.Euler();
  this.quaternion = new THREE.Quaternion();
  this.scale = new THREE.Vector3(1, 1, 1);
  this.rotation._quaternion = this.quaternion;
  this.quaternion._euler = this.rotation;
  this.renderDepth = null;
  this.rotationAutoUpdate = !0;
  this.matrix = new THREE.Matrix4();
  this.matrixWorld = new THREE.Matrix4();
  this.visible = this.matrixWorldNeedsUpdate = this.matrixAutoUpdate = !0;
  this.receiveShadow = this.castShadow = !1;
  this.frustumCulled = !0;
  this.userData = {};
};
THREE.Object3D.prototype = {
  constructor: THREE.Object3D,
  get eulerOrder() {
    console.warn(
      "DEPRECATED: Object3D's .eulerOrder has been moved to Object3D's .rotation.order."
    );
    return this.rotation.order;
  },
  set eulerOrder(a) {
    console.warn(
      "DEPRECATED: Object3D's .eulerOrder has been moved to Object3D's .rotation.order."
    );
    this.rotation.order = a;
  },
  get useQuaternion() {
    console.warn(
      "DEPRECATED: Object3D's .useQuaternion has been removed. The library now uses quaternions by default."
    );
  },
  set useQuaternion(a) {
    console.warn(
      "DEPRECATED: Object3D's .useQuaternion has been removed. The library now uses quaternions by default."
    );
  },
  applyMatrix: (function () {
    var a = new THREE.Matrix4();
    return function (b) {
      this.matrix.multiplyMatrices(b, this.matrix);
      this.position.getPositionFromMatrix(this.matrix);
      this.scale.getScaleFromMatrix(this.matrix);
      a.extractRotation(this.matrix);
      this.quaternion.setFromRotationMatrix(a);
    };
  })(),
  setRotationFromAxisAngle: function (a, b) {
    this.quaternion.setFromAxisAngle(a, b);
  },
  setRotationFromEuler: function (a) {
    this.quaternion.setFromEuler(a, !0);
  },
  setRotationFromMatrix: function (a) {
    this.quaternion.setFromRotationMatrix(a);
  },
  setRotationFromQuaternion: function (a) {
    this.quaternion.copy(a);
  },
  rotateOnAxis: (function () {
    var a = new THREE.Quaternion();
    return function (b, c) {
      a.setFromAxisAngle(b, c);
      this.quaternion.multiply(a);
      return this;
    };
  })(),
  rotateX: (function () {
    var a = new THREE.Vector3(1, 0, 0);
    return function (b) {
      return this.rotateOnAxis(a, b);
    };
  })(),
  rotateY: (function () {
    var a = new THREE.Vector3(0, 1, 0);
    return function (b) {
      return this.rotateOnAxis(a, b);
    };
  })(),
  rotateZ: (function () {
    var a = new THREE.Vector3(0, 0, 1);
    return function (b) {
      return this.rotateOnAxis(a, b);
    };
  })(),
  translateOnAxis: (function () {
    var a = new THREE.Vector3();
    return function (b, c) {
      a.copy(b);
      a.applyQuaternion(this.quaternion);
      this.position.add(a.multiplyScalar(c));
      return this;
    };
  })(),
  translate: function (a, b) {
    console.warn(
      "DEPRECATED: Object3D's .translate() has been removed. Use .translateOnAxis( axis, distance ) instead. Note args have been changed."
    );
    return this.translateOnAxis(b, a);
  },
  translateX: (function () {
    var a = new THREE.Vector3(1, 0, 0);
    return function (b) {
      return this.translateOnAxis(a, b);
    };
  })(),
  translateY: (function () {
    var a = new THREE.Vector3(0, 1, 0);
    return function (b) {
      return this.translateOnAxis(a, b);
    };
  })(),
  translateZ: (function () {
    var a = new THREE.Vector3(0, 0, 1);
    return function (b) {
      return this.translateOnAxis(a, b);
    };
  })(),
  localToWorld: function (a) {
    return a.applyMatrix4(this.matrixWorld);
  },
  worldToLocal: (function () {
    var a = new THREE.Matrix4();
    return function (b) {
      return b.applyMatrix4(a.getInverse(this.matrixWorld));
    };
  })(),
  lookAt: (function () {
    var a = new THREE.Matrix4();
    return function (b) {
      a.lookAt(b, this.position, this.up);
      this.quaternion.setFromRotationMatrix(a);
    };
  })(),
  add: function (a) {
    if (a === this)
      console.warn(
        "THREE.Object3D.add: An object can't be added as a child of itself."
      );
    else if (a instanceof THREE.Object3D) {
      void 0 !== a.parent && a.parent.remove(a);
      a.parent = this;
      a.dispatchEvent({ type: "added" });
      this.children.push(a);
      for (var b = this; void 0 !== b.parent; ) b = b.parent;
      void 0 !== b && b instanceof THREE.Scene && b.__addObject(a);
    }
  },
  remove: function (a) {
    var b = this.children.indexOf(a);
    if (-1 !== b) {
      a.parent = void 0;
      a.dispatchEvent({ type: "removed" });
      this.children.splice(b, 1);
      for (b = this; void 0 !== b.parent; ) b = b.parent;
      void 0 !== b && b instanceof THREE.Scene && b.__removeObject(a);
    }
  },
  traverse: function (a) {
    a(this);
    for (var b = 0, c = this.children.length; b < c; b++)
      this.children[b].traverse(a);
  },
  getObjectById: function (a, b) {
    for (var c = 0, d = this.children.length; c < d; c++) {
      var e = this.children[c];
      if (
        e.id === a ||
        (!0 === b && ((e = e.getObjectById(a, b)), void 0 !== e))
      )
        return e;
    }
  },
  getObjectByName: function (a, b) {
    for (var c = 0, d = this.children.length; c < d; c++) {
      var e = this.children[c];
      if (
        e.name === a ||
        (!0 === b && ((e = e.getObjectByName(a, b)), void 0 !== e))
      )
        return e;
    }
  },
  getChildByName: function (a, b) {
    console.warn(
      "DEPRECATED: Object3D's .getChildByName() has been renamed to .getObjectByName()."
    );
    return this.getObjectByName(a, b);
  },
  getDescendants: function (a) {
    void 0 === a && (a = []);
    Array.prototype.push.apply(a, this.children);
    for (var b = 0, c = this.children.length; b < c; b++)
      this.children[b].getDescendants(a);
    return a;
  },
  updateMatrix: function () {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.matrixWorldNeedsUpdate = !0;
  },
  updateMatrixWorld: function (a) {
    !0 === this.matrixAutoUpdate && this.updateMatrix();
    if (!0 === this.matrixWorldNeedsUpdate || !0 === a)
      void 0 === this.parent
        ? this.matrixWorld.copy(this.matrix)
        : this.matrixWorld.multiplyMatrices(
            this.parent.matrixWorld,
            this.matrix
          ),
        (this.matrixWorldNeedsUpdate = !1),
        (a = !0);
    for (var b = 0, c = this.children.length; b < c; b++)
      this.children[b].updateMatrixWorld(a);
  },
  clone: function (a, b) {
    void 0 === a && (a = new THREE.Object3D());
    void 0 === b && (b = !0);
    a.name = this.name;
    a.up.copy(this.up);
    a.position.copy(this.position);
    a.quaternion.copy(this.quaternion);
    a.scale.copy(this.scale);
    a.renderDepth = this.renderDepth;
    a.rotationAutoUpdate = this.rotationAutoUpdate;
    a.matrix.copy(this.matrix);
    a.matrixWorld.copy(this.matrixWorld);
    a.matrixAutoUpdate = this.matrixAutoUpdate;
    a.matrixWorldNeedsUpdate = this.matrixWorldNeedsUpdate;
    a.visible = this.visible;
    a.castShadow = this.castShadow;
    a.receiveShadow = this.receiveShadow;
    a.frustumCulled = this.frustumCulled;
    a.userData = JSON.parse(JSON.stringify(this.userData));
    if (!0 === b)
      for (var c = 0; c < this.children.length; c++)
        a.add(this.children[c].clone());
    return a;
  },
};
THREE.EventDispatcher.prototype.apply(THREE.Object3D.prototype);
THREE.Object3DIdCount = 0;
THREE.Projector = function () {
  function a() {
    if (i === m) {
      var a = new THREE.RenderableVertex();
      k.push(a);
      m++;
      i++;
      return a;
    }
    return k[i++];
  }
  function b(a, b) {
    return a.z !== b.z ? b.z - a.z : a.id !== b.id ? a.id - b.id : 0;
  }
  function c(a, b) {
    var c = 0,
      d = 1,
      e = a.z + a.w,
      f = b.z + b.w,
      h = -a.z + a.w,
      g = -b.z + b.w;
    if (0 <= e && 0 <= f && 0 <= h && 0 <= g) return !0;
    if ((0 > e && 0 > f) || (0 > h && 0 > g)) return !1;
    0 > e
      ? (c = Math.max(c, e / (e - f)))
      : 0 > f && (d = Math.min(d, e / (e - f)));
    0 > h
      ? (c = Math.max(c, h / (h - g)))
      : 0 > g && (d = Math.min(d, h / (h - g)));
    if (d < c) return !1;
    a.lerp(b, c);
    b.lerp(a, 1 - d);
    return !0;
  }
  var d,
    e,
    f = [],
    h = 0,
    g,
    i,
    k = [],
    m = 0,
    l,
    p,
    s = [],
    t = 0,
    n,
    r,
    q = [],
    u = 0,
    w,
    z,
    B = [],
    D = 0,
    x = { objects: [], sprites: [], lights: [], elements: [] },
    F = new THREE.Vector3(),
    A = new THREE.Vector4(),
    O = new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1)
    ),
    C = new THREE.Box3(),
    E = Array(3),
    I = new THREE.Matrix4(),
    y = new THREE.Matrix4(),
    v,
    G = new THREE.Matrix4(),
    R = new THREE.Matrix3(),
    J = new THREE.Matrix3(),
    ba = new THREE.Vector3(),
    oa = new THREE.Frustum(),
    pa = new THREE.Vector4(),
    N = new THREE.Vector4();
  this.projectVector = function (a, b) {
    b.matrixWorldInverse.getInverse(b.matrixWorld);
    y.multiplyMatrices(b.projectionMatrix, b.matrixWorldInverse);
    return a.applyProjection(y);
  };
  this.unprojectVector = function (a, b) {
    b.projectionMatrixInverse.getInverse(b.projectionMatrix);
    y.multiplyMatrices(b.matrixWorld, b.projectionMatrixInverse);
    return a.applyProjection(y);
  };
  this.pickingRay = function (a, b) {
    a.z = -1;
    var c = new THREE.Vector3(a.x, a.y, 1);
    this.unprojectVector(a, b);
    this.unprojectVector(c, b);
    c.sub(a).normalize();
    return new THREE.Raycaster(a, c);
  };
  var M = function (a) {
      if (e === h) {
        var b = new THREE.RenderableObject();
        f.push(b);
        h++;
        e++;
        d = b;
      } else d = f[e++];
      d.id = a.id;
      d.object = a;
      null !== a.renderDepth
        ? (d.z = a.renderDepth)
        : (F.getPositionFromMatrix(a.matrixWorld),
          F.applyProjection(y),
          (d.z = F.z));
      return d;
    },
    Q = function (a) {
      if (!1 !== a.visible) {
        a instanceof THREE.Light
          ? x.lights.push(a)
          : a instanceof THREE.Mesh || a instanceof THREE.Line
          ? (!1 === a.frustumCulled || !0 === oa.intersectsObject(a)) &&
            x.objects.push(M(a))
          : a instanceof THREE.Sprite && x.sprites.push(M(a));
        for (var b = 0, c = a.children.length; b < c; b++) Q(a.children[b]);
      }
    };
  this.projectScene = function (d, f, h, m) {
    var da = !1,
      F,
      M,
      ea,
      V,
      P,
      Z,
      U,
      ka,
      ta,
      ia,
      La,
      Ga;
    z = r = p = 0;
    x.elements.length = 0;
    !0 === d.autoUpdate && d.updateMatrixWorld();
    void 0 === f.parent && f.updateMatrixWorld();
    I.copy(f.matrixWorldInverse.getInverse(f.matrixWorld));
    y.multiplyMatrices(f.projectionMatrix, I);
    J.getNormalMatrix(I);
    oa.setFromMatrix(y);
    e = 0;
    x.objects.length = 0;
    x.sprites.length = 0;
    x.lights.length = 0;
    Q(d);
    !0 === h && x.objects.sort(b);
    d = 0;
    for (h = x.objects.length; d < h; d++)
      if (
        ((U = x.objects[d].object),
        (v = U.matrixWorld),
        (i = 0),
        U instanceof THREE.Mesh)
      ) {
        ka = U.geometry;
        ea = ka.vertices;
        ta = ka.faces;
        ka = ka.faceVertexUvs;
        R.getNormalMatrix(v);
        La = U.material instanceof THREE.MeshFaceMaterial;
        Ga = !0 === La ? U.material : null;
        F = 0;
        for (M = ea.length; F < M; F++) {
          g = a();
          g.positionWorld.copy(ea[F]).applyMatrix4(v);
          g.positionScreen.copy(g.positionWorld).applyMatrix4(y);
          var fa = 1 / g.positionScreen.w;
          g.positionScreen.x *= fa;
          g.positionScreen.y *= fa;
          g.positionScreen.z *= fa;
          g.visible = !(
            -1 > g.positionScreen.x ||
            1 < g.positionScreen.x ||
            -1 > g.positionScreen.y ||
            1 < g.positionScreen.y ||
            -1 > g.positionScreen.z ||
            1 < g.positionScreen.z
          );
        }
        ea = 0;
        for (F = ta.length; ea < F; ea++)
          if (
            ((M = ta[ea]),
            (fa = !0 === La ? Ga.materials[M.materialIndex] : U.material),
            void 0 !== fa &&
              ((Z = fa.side),
              (V = k[M.a]),
              (P = k[M.b]),
              (ia = k[M.c]),
              (E[0] = V.positionScreen),
              (E[1] = P.positionScreen),
              (E[2] = ia.positionScreen),
              !0 === V.visible ||
                !0 === P.visible ||
                !0 === ia.visible ||
                O.isIntersectionBox(C.setFromPoints(E))))
          )
            if (
              ((da =
                0 >
                (ia.positionScreen.x - V.positionScreen.x) *
                  (P.positionScreen.y - V.positionScreen.y) -
                  (ia.positionScreen.y - V.positionScreen.y) *
                    (P.positionScreen.x - V.positionScreen.x)),
              Z === THREE.DoubleSide || da === (Z === THREE.FrontSide))
            ) {
              if (p === t) {
                var Da = new THREE.RenderableFace3();
                s.push(Da);
                t++;
                p++;
                l = Da;
              } else l = s[p++];
              l.id = U.id;
              l.v1.copy(V);
              l.v2.copy(P);
              l.v3.copy(ia);
              l.normalModel.copy(M.normal);
              !1 === da &&
                (Z === THREE.BackSide || Z === THREE.DoubleSide) &&
                l.normalModel.negate();
              l.normalModel.applyMatrix3(R).normalize();
              l.normalModelView.copy(l.normalModel).applyMatrix3(J);
              l.centroidModel.copy(M.centroid).applyMatrix4(v);
              ia = M.vertexNormals;
              V = 0;
              for (P = Math.min(ia.length, 3); V < P; V++)
                (Da = l.vertexNormalsModel[V]),
                  Da.copy(ia[V]),
                  !1 === da &&
                    (Z === THREE.BackSide || Z === THREE.DoubleSide) &&
                    Da.negate(),
                  Da.applyMatrix3(R).normalize(),
                  l.vertexNormalsModelView[V].copy(Da).applyMatrix3(J);
              l.vertexNormalsLength = ia.length;
              da = 0;
              for (V = Math.min(ka.length, 3); da < V; da++)
                if (((ia = ka[da][ea]), void 0 !== ia)) {
                  P = 0;
                  for (Z = ia.length; P < Z; P++) l.uvs[da][P] = ia[P];
                }
              l.color = M.color;
              l.material = fa;
              ba.copy(l.centroidModel).applyProjection(y);
              l.z = ba.z;
              x.elements.push(l);
            }
      } else if (U instanceof THREE.Line) {
        G.multiplyMatrices(y, v);
        ea = U.geometry.vertices;
        V = a();
        V.positionScreen.copy(ea[0]).applyMatrix4(G);
        ta = U.type === THREE.LinePieces ? 2 : 1;
        F = 1;
        for (M = ea.length; F < M; F++)
          (V = a()),
            V.positionScreen.copy(ea[F]).applyMatrix4(G),
            0 < (F + 1) % ta ||
              ((P = k[i - 2]),
              pa.copy(V.positionScreen),
              N.copy(P.positionScreen),
              !0 === c(pa, N) &&
                (pa.multiplyScalar(1 / pa.w),
                N.multiplyScalar(1 / N.w),
                r === u
                  ? ((ka = new THREE.RenderableLine()),
                    q.push(ka),
                    u++,
                    r++,
                    (n = ka))
                  : (n = q[r++]),
                (n.id = U.id),
                n.v1.positionScreen.copy(pa),
                n.v2.positionScreen.copy(N),
                (n.z = Math.max(pa.z, N.z)),
                (n.material = U.material),
                U.material.vertexColors === THREE.VertexColors &&
                  (n.vertexColors[0].copy(U.geometry.colors[F]),
                  n.vertexColors[1].copy(U.geometry.colors[F - 1])),
                x.elements.push(n)));
      }
    d = 0;
    for (h = x.sprites.length; d < h; d++)
      (U = x.sprites[d].object),
        (v = U.matrixWorld),
        U instanceof THREE.Sprite &&
          (A.set(v.elements[12], v.elements[13], v.elements[14], 1),
          A.applyMatrix4(y),
          (fa = 1 / A.w),
          (A.z *= fa),
          -1 < A.z &&
            1 > A.z &&
            (z === D
              ? ((ta = new THREE.RenderableSprite()),
                B.push(ta),
                D++,
                z++,
                (w = ta))
              : (w = B[z++]),
            (w.id = U.id),
            (w.x = A.x * fa),
            (w.y = A.y * fa),
            (w.z = A.z),
            (w.object = U),
            (w.rotation = U.rotation),
            (w.scale.x =
              U.scale.x *
              Math.abs(
                w.x -
                  (A.x + f.projectionMatrix.elements[0]) /
                    (A.w + f.projectionMatrix.elements[12])
              )),
            (w.scale.y =
              U.scale.y *
              Math.abs(
                w.y -
                  (A.y + f.projectionMatrix.elements[5]) /
                    (A.w + f.projectionMatrix.elements[13])
              )),
            (w.material = U.material),
            x.elements.push(w)));
    !0 === m && x.elements.sort(b);
    return x;
  };
};
THREE.Face3 = function (a, b, c, d, e, f) {
  this.a = a;
  this.b = b;
  this.c = c;
  this.normal = d instanceof THREE.Vector3 ? d : new THREE.Vector3();
  this.vertexNormals = d instanceof Array ? d : [];
  this.color = e instanceof THREE.Color ? e : new THREE.Color();
  this.vertexColors = e instanceof Array ? e : [];
  this.vertexTangents = [];
  this.materialIndex = void 0 !== f ? f : 0;
  this.centroid = new THREE.Vector3();
};
THREE.Face3.prototype = {
  constructor: THREE.Face3,
  clone: function () {
    var a = new THREE.Face3(this.a, this.b, this.c);
    a.normal.copy(this.normal);
    a.color.copy(this.color);
    a.centroid.copy(this.centroid);
    a.materialIndex = this.materialIndex;
    var b, c;
    b = 0;
    for (c = this.vertexNormals.length; b < c; b++)
      a.vertexNormals[b] = this.vertexNormals[b].clone();
    b = 0;
    for (c = this.vertexColors.length; b < c; b++)
      a.vertexColors[b] = this.vertexColors[b].clone();
    b = 0;
    for (c = this.vertexTangents.length; b < c; b++)
      a.vertexTangents[b] = this.vertexTangents[b].clone();
    return a;
  },
};
THREE.Face4 = function (a, b, c, d, e, f, h) {
  console.warn(
    "THREE.Face4 has been removed. A THREE.Face3 will be created instead."
  );
  return new THREE.Face3(a, b, c, e, f, h);
};
THREE.Geometry = function () {
  this.id = THREE.GeometryIdCount++;
  this.uuid = THREE.Math.generateUUID();
  this.name = "";
  this.vertices = [];
  this.colors = [];
  this.faces = [];
  this.faceVertexUvs = [[]];
  this.morphTargets = [];
  this.morphColors = [];
  this.morphNormals = [];
  this.skinWeights = [];
  this.skinIndices = [];
  this.lineDistances = [];
  this.boundingSphere = this.boundingBox = null;
  this.hasTangents = !1;
  this.dynamic = !0;
  this.buffersNeedUpdate =
    this.lineDistancesNeedUpdate =
    this.colorsNeedUpdate =
    this.tangentsNeedUpdate =
    this.normalsNeedUpdate =
    this.uvsNeedUpdate =
    this.elementsNeedUpdate =
    this.verticesNeedUpdate =
      !1;
};
THREE.Geometry.prototype = {
  constructor: THREE.Geometry,
  applyMatrix: function (a) {
    for (
      var b = new THREE.Matrix3().getNormalMatrix(a),
        c = 0,
        d = this.vertices.length;
      c < d;
      c++
    )
      this.vertices[c].applyMatrix4(a);
    c = 0;
    for (d = this.faces.length; c < d; c++) {
      var e = this.faces[c];
      e.normal.applyMatrix3(b).normalize();
      for (var f = 0, h = e.vertexNormals.length; f < h; f++)
        e.vertexNormals[f].applyMatrix3(b).normalize();
      e.centroid.applyMatrix4(a);
    }
    this.boundingBox instanceof THREE.Box3 && this.computeBoundingBox();
    this.boundingSphere instanceof THREE.Sphere && this.computeBoundingSphere();
  },
  computeCentroids: function () {
    var a, b, c;
    a = 0;
    for (b = this.faces.length; a < b; a++)
      (c = this.faces[a]),
        c.centroid.set(0, 0, 0),
        c.centroid.add(this.vertices[c.a]),
        c.centroid.add(this.vertices[c.b]),
        c.centroid.add(this.vertices[c.c]),
        c.centroid.divideScalar(3);
  },
  computeFaceNormals: function () {
    for (
      var a = new THREE.Vector3(),
        b = new THREE.Vector3(),
        c = 0,
        d = this.faces.length;
      c < d;
      c++
    ) {
      var e = this.faces[c],
        f = this.vertices[e.a],
        h = this.vertices[e.b];
      a.subVectors(this.vertices[e.c], h);
      b.subVectors(f, h);
      a.cross(b);
      a.normalize();
      e.normal.copy(a);
    }
  },
  computeVertexNormals: function (a) {
    var b, c, d, e;
    if (void 0 === this.__tmpVertices) {
      e = this.__tmpVertices = Array(this.vertices.length);
      b = 0;
      for (c = this.vertices.length; b < c; b++) e[b] = new THREE.Vector3();
      b = 0;
      for (c = this.faces.length; b < c; b++)
        (d = this.faces[b]),
          (d.vertexNormals = [
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3(),
          ]);
    } else {
      e = this.__tmpVertices;
      b = 0;
      for (c = this.vertices.length; b < c; b++) e[b].set(0, 0, 0);
    }
    if (a) {
      var f,
        h,
        g = new THREE.Vector3(),
        i = new THREE.Vector3();
      new THREE.Vector3();
      new THREE.Vector3();
      new THREE.Vector3();
      b = 0;
      for (c = this.faces.length; b < c; b++)
        (d = this.faces[b]),
          (a = this.vertices[d.a]),
          (f = this.vertices[d.b]),
          (h = this.vertices[d.c]),
          g.subVectors(h, f),
          i.subVectors(a, f),
          g.cross(i),
          e[d.a].add(g),
          e[d.b].add(g),
          e[d.c].add(g);
    } else {
      b = 0;
      for (c = this.faces.length; b < c; b++)
        (d = this.faces[b]),
          e[d.a].add(d.normal),
          e[d.b].add(d.normal),
          e[d.c].add(d.normal);
    }
    b = 0;
    for (c = this.vertices.length; b < c; b++) e[b].normalize();
    b = 0;
    for (c = this.faces.length; b < c; b++)
      (d = this.faces[b]),
        d.vertexNormals[0].copy(e[d.a]),
        d.vertexNormals[1].copy(e[d.b]),
        d.vertexNormals[2].copy(e[d.c]);
  },
  computeMorphNormals: function () {
    var a, b, c, d, e;
    c = 0;
    for (d = this.faces.length; c < d; c++) {
      e = this.faces[c];
      e.__originalFaceNormal
        ? e.__originalFaceNormal.copy(e.normal)
        : (e.__originalFaceNormal = e.normal.clone());
      e.__originalVertexNormals || (e.__originalVertexNormals = []);
      a = 0;
      for (b = e.vertexNormals.length; a < b; a++)
        e.__originalVertexNormals[a]
          ? e.__originalVertexNormals[a].copy(e.vertexNormals[a])
          : (e.__originalVertexNormals[a] = e.vertexNormals[a].clone());
    }
    var f = new THREE.Geometry();
    f.faces = this.faces;
    a = 0;
    for (b = this.morphTargets.length; a < b; a++) {
      if (!this.morphNormals[a]) {
        this.morphNormals[a] = {};
        this.morphNormals[a].faceNormals = [];
        this.morphNormals[a].vertexNormals = [];
        e = this.morphNormals[a].faceNormals;
        var h = this.morphNormals[a].vertexNormals,
          g,
          i;
        c = 0;
        for (d = this.faces.length; c < d; c++)
          (g = new THREE.Vector3()),
            (i = {
              a: new THREE.Vector3(),
              b: new THREE.Vector3(),
              c: new THREE.Vector3(),
            }),
            e.push(g),
            h.push(i);
      }
      h = this.morphNormals[a];
      f.vertices = this.morphTargets[a].vertices;
      f.computeFaceNormals();
      f.computeVertexNormals();
      c = 0;
      for (d = this.faces.length; c < d; c++)
        (e = this.faces[c]),
          (g = h.faceNormals[c]),
          (i = h.vertexNormals[c]),
          g.copy(e.normal),
          i.a.copy(e.vertexNormals[0]),
          i.b.copy(e.vertexNormals[1]),
          i.c.copy(e.vertexNormals[2]);
    }
    c = 0;
    for (d = this.faces.length; c < d; c++)
      (e = this.faces[c]),
        (e.normal = e.__originalFaceNormal),
        (e.vertexNormals = e.__originalVertexNormals);
  },
  computeTangents: function () {
    var a,
      b,
      c,
      d,
      e,
      f,
      h,
      g,
      i,
      k,
      m,
      l,
      p,
      s,
      t,
      n,
      r,
      q = [],
      u = [];
    c = new THREE.Vector3();
    var w = new THREE.Vector3(),
      z = new THREE.Vector3(),
      B = new THREE.Vector3(),
      D = new THREE.Vector3();
    a = 0;
    for (b = this.vertices.length; a < b; a++)
      (q[a] = new THREE.Vector3()), (u[a] = new THREE.Vector3());
    a = 0;
    for (b = this.faces.length; a < b; a++)
      (e = this.faces[a]),
        (f = this.faceVertexUvs[0][a]),
        (d = e.a),
        (r = e.b),
        (e = e.c),
        (h = this.vertices[d]),
        (g = this.vertices[r]),
        (i = this.vertices[e]),
        (k = f[0]),
        (m = f[1]),
        (l = f[2]),
        (f = g.x - h.x),
        (p = i.x - h.x),
        (s = g.y - h.y),
        (t = i.y - h.y),
        (g = g.z - h.z),
        (h = i.z - h.z),
        (i = m.x - k.x),
        (n = l.x - k.x),
        (m = m.y - k.y),
        (k = l.y - k.y),
        (l = 1 / (i * k - n * m)),
        c.set((k * f - m * p) * l, (k * s - m * t) * l, (k * g - m * h) * l),
        w.set((i * p - n * f) * l, (i * t - n * s) * l, (i * h - n * g) * l),
        q[d].add(c),
        q[r].add(c),
        q[e].add(c),
        u[d].add(w),
        u[r].add(w),
        u[e].add(w);
    w = ["a", "b", "c", "d"];
    a = 0;
    for (b = this.faces.length; a < b; a++) {
      e = this.faces[a];
      for (c = 0; c < Math.min(e.vertexNormals.length, 3); c++)
        D.copy(e.vertexNormals[c]),
          (d = e[w[c]]),
          (r = q[d]),
          z.copy(r),
          z.sub(D.multiplyScalar(D.dot(r))).normalize(),
          B.crossVectors(e.vertexNormals[c], r),
          (d = B.dot(u[d])),
          (d = 0 > d ? -1 : 1),
          (e.vertexTangents[c] = new THREE.Vector4(z.x, z.y, z.z, d));
    }
    this.hasTangents = !0;
  },
  computeLineDistances: function () {
    for (var a = 0, b = this.vertices, c = 0, d = b.length; c < d; c++)
      0 < c && (a += b[c].distanceTo(b[c - 1])), (this.lineDistances[c] = a);
  },
  computeBoundingBox: function () {
    null === this.boundingBox && (this.boundingBox = new THREE.Box3());
    this.boundingBox.setFromPoints(this.vertices);
  },
  computeBoundingSphere: function () {
    null === this.boundingSphere && (this.boundingSphere = new THREE.Sphere());
    this.boundingSphere.setFromPoints(this.vertices);
  },
  mergeVertices: function () {
    var a = {},
      b = [],
      c = [],
      d,
      e = Math.pow(10, 4),
      f,
      h;
    this.__tmpVertices = void 0;
    f = 0;
    for (h = this.vertices.length; f < h; f++)
      (d = this.vertices[f]),
        (d =
          Math.round(d.x * e) +
          "_" +
          Math.round(d.y * e) +
          "_" +
          Math.round(d.z * e)),
        void 0 === a[d]
          ? ((a[d] = f), b.push(this.vertices[f]), (c[f] = b.length - 1))
          : (c[f] = c[a[d]]);
    a = [];
    f = 0;
    for (h = this.faces.length; f < h; f++) {
      e = this.faces[f];
      e.a = c[e.a];
      e.b = c[e.b];
      e.c = c[e.c];
      e = [e.a, e.b, e.c];
      for (d = 0; 3 > d; d++)
        if (e[d] == e[(d + 1) % 3]) {
          a.push(f);
          break;
        }
    }
    for (f = a.length - 1; 0 <= f; f--) {
      e = a[f];
      this.faces.splice(e, 1);
      c = 0;
      for (h = this.faceVertexUvs.length; c < h; c++)
        this.faceVertexUvs[c].splice(e, 1);
    }
    f = this.vertices.length - b.length;
    this.vertices = b;
    return f;
  },
  clone: function () {
    for (
      var a = new THREE.Geometry(), b = this.vertices, c = 0, d = b.length;
      c < d;
      c++
    )
      a.vertices.push(b[c].clone());
    b = this.faces;
    c = 0;
    for (d = b.length; c < d; c++) a.faces.push(b[c].clone());
    b = this.faceVertexUvs[0];
    c = 0;
    for (d = b.length; c < d; c++) {
      for (var e = b[c], f = [], h = 0, g = e.length; h < g; h++)
        f.push(new THREE.Vector2(e[h].x, e[h].y));
      a.faceVertexUvs[0].push(f);
    }
    return a;
  },
  dispose: function () {
    this.dispatchEvent({ type: "dispose" });
  },
};
THREE.EventDispatcher.prototype.apply(THREE.Geometry.prototype);
THREE.GeometryIdCount = 0;
THREE.BufferGeometry = function () {
  this.id = THREE.GeometryIdCount++;
  this.uuid = THREE.Math.generateUUID();
  this.name = "";
  this.attributes = {};
  this.dynamic = !0;
  this.offsets = [];
  this.boundingSphere = this.boundingBox = null;
  this.hasTangents = !1;
  this.morphTargets = [];
};
THREE.BufferGeometry.prototype = {
  constructor: THREE.BufferGeometry,
  addAttribute: function (a, b, c, d) {
    this.attributes[a] = { itemSize: d, array: new b(c * d) };
  },
  applyMatrix: function (a) {
    var b, c;
    this.attributes.position && (b = this.attributes.position.array);
    this.attributes.normal && (c = this.attributes.normal.array);
    void 0 !== b && (a.multiplyVector3Array(b), (this.verticesNeedUpdate = !0));
    void 0 !== c &&
      (new THREE.Matrix3().getNormalMatrix(a).multiplyVector3Array(c),
      this.normalizeNormals(),
      (this.normalsNeedUpdate = !0));
  },
  computeBoundingBox: function () {
    null === this.boundingBox && (this.boundingBox = new THREE.Box3());
    var a = this.attributes.position.array;
    if (a) {
      var b = this.boundingBox,
        c,
        d,
        e;
      3 <= a.length &&
        ((b.min.x = b.max.x = a[0]),
        (b.min.y = b.max.y = a[1]),
        (b.min.z = b.max.z = a[2]));
      for (var f = 3, h = a.length; f < h; f += 3)
        (c = a[f]),
          (d = a[f + 1]),
          (e = a[f + 2]),
          c < b.min.x ? (b.min.x = c) : c > b.max.x && (b.max.x = c),
          d < b.min.y ? (b.min.y = d) : d > b.max.y && (b.max.y = d),
          e < b.min.z ? (b.min.z = e) : e > b.max.z && (b.max.z = e);
    }
    if (void 0 === a || 0 === a.length)
      this.boundingBox.min.set(0, 0, 0), this.boundingBox.max.set(0, 0, 0);
  },
  computeBoundingSphere: (function () {
    var a = new THREE.Box3(),
      b = new THREE.Vector3();
    return function () {
      null === this.boundingSphere &&
        (this.boundingSphere = new THREE.Sphere());
      var c = this.attributes.position.array;
      if (c) {
        for (
          var d = this.boundingSphere.center, e = 0, f = c.length;
          e < f;
          e += 3
        )
          b.set(c[e], c[e + 1], c[e + 2]), a.addPoint(b);
        a.center(d);
        for (var h = 0, e = 0, f = c.length; e < f; e += 3)
          b.set(c[e], c[e + 1], c[e + 2]),
            (h = Math.max(h, d.distanceToSquared(b)));
        this.boundingSphere.radius = Math.sqrt(h);
      }
    };
  })(),
  computeVertexNormals: function () {
    if (this.attributes.position) {
      var a, b, c, d;
      a = this.attributes.position.array.length;
      if (void 0 === this.attributes.normal)
        this.attributes.normal = { itemSize: 3, array: new Float32Array(a) };
      else {
        a = 0;
        for (b = this.attributes.normal.array.length; a < b; a++)
          this.attributes.normal.array[a] = 0;
      }
      var e = this.attributes.position.array,
        f = this.attributes.normal.array,
        h,
        g,
        i,
        k,
        m,
        l,
        p = new THREE.Vector3(),
        s = new THREE.Vector3(),
        t = new THREE.Vector3(),
        n = new THREE.Vector3(),
        r = new THREE.Vector3();
      if (this.attributes.index) {
        var q = this.attributes.index.array,
          u = this.offsets;
        c = 0;
        for (d = u.length; c < d; ++c) {
          b = u[c].start;
          h = u[c].count;
          var w = u[c].index;
          a = b;
          for (b += h; a < b; a += 3)
            (h = w + q[a]),
              (g = w + q[a + 1]),
              (i = w + q[a + 2]),
              (k = e[3 * h]),
              (m = e[3 * h + 1]),
              (l = e[3 * h + 2]),
              p.set(k, m, l),
              (k = e[3 * g]),
              (m = e[3 * g + 1]),
              (l = e[3 * g + 2]),
              s.set(k, m, l),
              (k = e[3 * i]),
              (m = e[3 * i + 1]),
              (l = e[3 * i + 2]),
              t.set(k, m, l),
              n.subVectors(t, s),
              r.subVectors(p, s),
              n.cross(r),
              (f[3 * h] += n.x),
              (f[3 * h + 1] += n.y),
              (f[3 * h + 2] += n.z),
              (f[3 * g] += n.x),
              (f[3 * g + 1] += n.y),
              (f[3 * g + 2] += n.z),
              (f[3 * i] += n.x),
              (f[3 * i + 1] += n.y),
              (f[3 * i + 2] += n.z);
        }
      } else {
        a = 0;
        for (b = e.length; a < b; a += 9)
          (k = e[a]),
            (m = e[a + 1]),
            (l = e[a + 2]),
            p.set(k, m, l),
            (k = e[a + 3]),
            (m = e[a + 4]),
            (l = e[a + 5]),
            s.set(k, m, l),
            (k = e[a + 6]),
            (m = e[a + 7]),
            (l = e[a + 8]),
            t.set(k, m, l),
            n.subVectors(t, s),
            r.subVectors(p, s),
            n.cross(r),
            (f[a] = n.x),
            (f[a + 1] = n.y),
            (f[a + 2] = n.z),
            (f[a + 3] = n.x),
            (f[a + 4] = n.y),
            (f[a + 5] = n.z),
            (f[a + 6] = n.x),
            (f[a + 7] = n.y),
            (f[a + 8] = n.z);
      }
      this.normalizeNormals();
      this.normalsNeedUpdate = !0;
    }
  },
  normalizeNormals: function () {
    for (
      var a = this.attributes.normal.array, b, c, d, e = 0, f = a.length;
      e < f;
      e += 3
    )
      (b = a[e]),
        (c = a[e + 1]),
        (d = a[e + 2]),
        (b = 1 / Math.sqrt(b * b + c * c + d * d)),
        (a[e] *= b),
        (a[e + 1] *= b),
        (a[e + 2] *= b);
  },
  computeTangents: function () {
    function a(a) {
      oa.x = d[3 * a];
      oa.y = d[3 * a + 1];
      oa.z = d[3 * a + 2];
      pa.copy(oa);
      M = g[a];
      J.copy(M);
      J.sub(oa.multiplyScalar(oa.dot(M))).normalize();
      ba.crossVectors(pa, M);
      Q = ba.dot(i[a]);
      N = 0 > Q ? -1 : 1;
      h[4 * a] = J.x;
      h[4 * a + 1] = J.y;
      h[4 * a + 2] = J.z;
      h[4 * a + 3] = N;
    }
    if (
      void 0 === this.attributes.index ||
      void 0 === this.attributes.position ||
      void 0 === this.attributes.normal ||
      void 0 === this.attributes.uv
    )
      console.warn(
        "Missing required attributes (index, position, normal or uv) in BufferGeometry.computeTangents()"
      );
    else {
      var b = this.attributes.index.array,
        c = this.attributes.position.array,
        d = this.attributes.normal.array,
        e = this.attributes.uv.array,
        f = c.length / 3;
      void 0 === this.attributes.tangent &&
        (this.attributes.tangent = {
          itemSize: 4,
          array: new Float32Array(4 * f),
        });
      for (
        var h = this.attributes.tangent.array, g = [], i = [], k = 0;
        k < f;
        k++
      )
        (g[k] = new THREE.Vector3()), (i[k] = new THREE.Vector3());
      var m,
        l,
        p,
        s,
        t,
        n,
        r,
        q,
        u,
        w,
        z,
        B,
        D,
        x,
        F,
        f = new THREE.Vector3(),
        k = new THREE.Vector3(),
        A,
        O,
        C,
        E,
        I,
        y,
        v,
        G = this.offsets;
      C = 0;
      for (E = G.length; C < E; ++C) {
        O = G[C].start;
        I = G[C].count;
        var R = G[C].index;
        A = O;
        for (O += I; A < O; A += 3)
          (I = R + b[A]),
            (y = R + b[A + 1]),
            (v = R + b[A + 2]),
            (m = c[3 * I]),
            (l = c[3 * I + 1]),
            (p = c[3 * I + 2]),
            (s = c[3 * y]),
            (t = c[3 * y + 1]),
            (n = c[3 * y + 2]),
            (r = c[3 * v]),
            (q = c[3 * v + 1]),
            (u = c[3 * v + 2]),
            (w = e[2 * I]),
            (z = e[2 * I + 1]),
            (B = e[2 * y]),
            (D = e[2 * y + 1]),
            (x = e[2 * v]),
            (F = e[2 * v + 1]),
            (s -= m),
            (m = r - m),
            (t -= l),
            (l = q - l),
            (n -= p),
            (p = u - p),
            (B -= w),
            (w = x - w),
            (D -= z),
            (z = F - z),
            (F = 1 / (B * z - w * D)),
            f.set(
              (z * s - D * m) * F,
              (z * t - D * l) * F,
              (z * n - D * p) * F
            ),
            k.set(
              (B * m - w * s) * F,
              (B * l - w * t) * F,
              (B * p - w * n) * F
            ),
            g[I].add(f),
            g[y].add(f),
            g[v].add(f),
            i[I].add(k),
            i[y].add(k),
            i[v].add(k);
      }
      var J = new THREE.Vector3(),
        ba = new THREE.Vector3(),
        oa = new THREE.Vector3(),
        pa = new THREE.Vector3(),
        N,
        M,
        Q;
      C = 0;
      for (E = G.length; C < E; ++C) {
        O = G[C].start;
        I = G[C].count;
        R = G[C].index;
        A = O;
        for (O += I; A < O; A += 3)
          (I = R + b[A]),
            (y = R + b[A + 1]),
            (v = R + b[A + 2]),
            a(I),
            a(y),
            a(v);
      }
      this.tangentsNeedUpdate = this.hasTangents = !0;
    }
  },
  clone: function () {
    var a = new THREE.BufferGeometry(),
      b = [
        Int8Array,
        Uint8Array,
        Uint8ClampedArray,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array,
      ],
      c;
    for (c in this.attributes) {
      for (
        var d = this.attributes[c],
          e = d.array,
          f = { itemSize: d.itemSize, numItems: d.numItems, array: null },
          d = 0,
          h = b.length;
        d < h;
        d++
      ) {
        var g = b[d];
        if (e instanceof g) {
          f.array = new g(e);
          break;
        }
      }
      a.attributes[c] = f;
    }
    d = 0;
    for (h = this.offsets.length; d < h; d++)
      (b = this.offsets[d]),
        a.offsets.push({ start: b.start, index: b.index, count: b.count });
    return a;
  },
  dispose: function () {
    this.dispatchEvent({ type: "dispose" });
  },
};
THREE.EventDispatcher.prototype.apply(THREE.BufferGeometry.prototype);
THREE.Camera = function () {
  THREE.Object3D.call(this);
  this.matrixWorldInverse = new THREE.Matrix4();
  this.projectionMatrix = new THREE.Matrix4();
  this.projectionMatrixInverse = new THREE.Matrix4();
};
THREE.Camera.prototype = Object.create(THREE.Object3D.prototype);
THREE.Camera.prototype.lookAt = (function () {
  var a = new THREE.Matrix4();
  return function (b) {
    a.lookAt(this.position, b, this.up);
    this.quaternion.setFromRotationMatrix(a);
  };
})();
THREE.Camera.prototype.clone = function (a) {
  void 0 === a && (a = new THREE.Camera());
  THREE.Object3D.prototype.clone.call(this, a);
  a.matrixWorldInverse.copy(this.matrixWorldInverse);
  a.projectionMatrix.copy(this.projectionMatrix);
  a.projectionMatrixInverse.copy(this.projectionMatrixInverse);
  return a;
};
THREE.OrthographicCamera = function (a, b, c, d, e, f) {
  THREE.Camera.call(this);
  this.left = a;
  this.right = b;
  this.top = c;
  this.bottom = d;
  this.near = void 0 !== e ? e : 0.1;
  this.far = void 0 !== f ? f : 2e3;
  this.updateProjectionMatrix();
};
THREE.OrthographicCamera.prototype = Object.create(THREE.Camera.prototype);
THREE.OrthographicCamera.prototype.updateProjectionMatrix = function () {
  this.projectionMatrix.makeOrthographic(
    this.left,
    this.right,
    this.top,
    this.bottom,
    this.near,
    this.far
  );
};
THREE.OrthographicCamera.prototype.clone = function () {
  var a = new THREE.OrthographicCamera();
  THREE.Camera.prototype.clone.call(this, a);
  a.left = this.left;
  a.right = this.right;
  a.top = this.top;
  a.bottom = this.bottom;
  a.near = this.near;
  a.far = this.far;
  return a;
};
THREE.PerspectiveCamera = function (a, b, c, d) {
  THREE.Camera.call(this);
  this.fov = void 0 !== a ? a : 50;
  this.aspect = void 0 !== b ? b : 1;
  this.near = void 0 !== c ? c : 0.1;
  this.far = void 0 !== d ? d : 2e3;
  this.updateProjectionMatrix();
};
THREE.PerspectiveCamera.prototype = Object.create(THREE.Camera.prototype);
THREE.PerspectiveCamera.prototype.setLens = function (a, b) {
  void 0 === b && (b = 24);
  this.fov = 2 * THREE.Math.radToDeg(Math.atan(b / (2 * a)));
  this.updateProjectionMatrix();
};
THREE.PerspectiveCamera.prototype.setViewOffset = function (a, b, c, d, e, f) {
  this.fullWidth = a;
  this.fullHeight = b;
  this.x = c;
  this.y = d;
  this.width = e;
  this.height = f;
  this.updateProjectionMatrix();
};
THREE.PerspectiveCamera.prototype.updateProjectionMatrix = function () {
  if (this.fullWidth) {
    var a = this.fullWidth / this.fullHeight,
      b = Math.tan(THREE.Math.degToRad(0.5 * this.fov)) * this.near,
      c = -b,
      d = a * c,
      a = Math.abs(a * b - d),
      c = Math.abs(b - c);
    this.projectionMatrix.makeFrustum(
      d + (this.x * a) / this.fullWidth,
      d + ((this.x + this.width) * a) / this.fullWidth,
      b - ((this.y + this.height) * c) / this.fullHeight,
      b - (this.y * c) / this.fullHeight,
      this.near,
      this.far
    );
  } else
    this.projectionMatrix.makePerspective(
      this.fov,
      this.aspect,
      this.near,
      this.far
    );
};
THREE.PerspectiveCamera.prototype.clone = function () {
  var a = new THREE.PerspectiveCamera();
  THREE.Camera.prototype.clone.call(this, a);
  a.fov = this.fov;
  a.aspect = this.aspect;
  a.near = this.near;
  a.far = this.far;
  return a;
};
THREE.Light = function (a) {
  THREE.Object3D.call(this);
  this.color = new THREE.Color(a);
};
THREE.Light.prototype = Object.create(THREE.Object3D.prototype);
THREE.Light.prototype.clone = function (a) {
  void 0 === a && (a = new THREE.Light());
  THREE.Object3D.prototype.clone.call(this, a);
  a.color.copy(this.color);
  return a;
};
THREE.AmbientLight = function (a) {
  THREE.Light.call(this, a);
};
THREE.AmbientLight.prototype = Object.create(THREE.Light.prototype);
THREE.AmbientLight.prototype.clone = function () {
  var a = new THREE.AmbientLight();
  THREE.Light.prototype.clone.call(this, a);
  return a;
};
THREE.AreaLight = function (a, b) {
  THREE.Light.call(this, a);
  this.normal = new THREE.Vector3(0, -1, 0);
  this.right = new THREE.Vector3(1, 0, 0);
  this.intensity = void 0 !== b ? b : 1;
  this.height = this.width = 1;
  this.constantAttenuation = 1.5;
  this.linearAttenuation = 0.5;
  this.quadraticAttenuation = 0.1;
};
THREE.AreaLight.prototype = Object.create(THREE.Light.prototype);
THREE.DirectionalLight = function (a, b) {
  THREE.Light.call(this, a);
  this.position.set(0, 1, 0);
  this.target = new THREE.Object3D();
  this.intensity = void 0 !== b ? b : 1;
  this.onlyShadow = this.castShadow = !1;
  this.shadowCameraNear = 50;
  this.shadowCameraFar = 5e3;
  this.shadowCameraLeft = -500;
  this.shadowCameraTop = this.shadowCameraRight = 500;
  this.shadowCameraBottom = -500;
  this.shadowCameraVisible = !1;
  this.shadowBias = 0;
  this.shadowDarkness = 0.5;
  this.shadowMapHeight = this.shadowMapWidth = 512;
  this.shadowCascade = !1;
  this.shadowCascadeOffset = new THREE.Vector3(0, 0, -1e3);
  this.shadowCascadeCount = 2;
  this.shadowCascadeBias = [0, 0, 0];
  this.shadowCascadeWidth = [512, 512, 512];
  this.shadowCascadeHeight = [512, 512, 512];
  this.shadowCascadeNearZ = [-1, 0.99, 0.998];
  this.shadowCascadeFarZ = [0.99, 0.998, 1];
  this.shadowCascadeArray = [];
  this.shadowMatrix =
    this.shadowCamera =
    this.shadowMapSize =
    this.shadowMap =
      null;
};
THREE.DirectionalLight.prototype = Object.create(THREE.Light.prototype);
THREE.DirectionalLight.prototype.clone = function () {
  var a = new THREE.DirectionalLight();
  THREE.Light.prototype.clone.call(this, a);
  a.target = this.target.clone();
  a.intensity = this.intensity;
  a.castShadow = this.castShadow;
  a.onlyShadow = this.onlyShadow;
  return a;
};
THREE.HemisphereLight = function (a, b, c) {
  THREE.Light.call(this, a);
  this.position.set(0, 100, 0);
  this.groundColor = new THREE.Color(b);
  this.intensity = void 0 !== c ? c : 1;
};
THREE.HemisphereLight.prototype = Object.create(THREE.Light.prototype);
THREE.HemisphereLight.prototype.clone = function () {
  var a = new THREE.HemisphereLight();
  THREE.Light.prototype.clone.call(this, a);
  a.groundColor.copy(this.groundColor);
  a.intensity = this.intensity;
  return a;
};
THREE.PointLight = function (a, b, c) {
  THREE.Light.call(this, a);
  this.intensity = void 0 !== b ? b : 1;
  this.distance = void 0 !== c ? c : 0;
};
THREE.PointLight.prototype = Object.create(THREE.Light.prototype);
THREE.PointLight.prototype.clone = function () {
  var a = new THREE.PointLight();
  THREE.Light.prototype.clone.call(this, a);
  a.intensity = this.intensity;
  a.distance = this.distance;
  return a;
};
THREE.SpotLight = function (a, b, c, d, e) {
  THREE.Light.call(this, a);
  this.position.set(0, 1, 0);
  this.target = new THREE.Object3D();
  this.intensity = void 0 !== b ? b : 1;
  this.distance = void 0 !== c ? c : 0;
  this.angle = void 0 !== d ? d : Math.PI / 3;
  this.exponent = void 0 !== e ? e : 10;
  this.onlyShadow = this.castShadow = !1;
  this.shadowCameraNear = 50;
  this.shadowCameraFar = 5e3;
  this.shadowCameraFov = 50;
  this.shadowCameraVisible = !1;
  this.shadowBias = 0;
  this.shadowDarkness = 0.5;
  this.shadowMapHeight = this.shadowMapWidth = 512;
  this.shadowMatrix =
    this.shadowCamera =
    this.shadowMapSize =
    this.shadowMap =
      null;
};
THREE.SpotLight.prototype = Object.create(THREE.Light.prototype);
THREE.SpotLight.prototype.clone = function () {
  var a = new THREE.SpotLight();
  THREE.Light.prototype.clone.call(this, a);
  a.target = this.target.clone();
  a.intensity = this.intensity;
  a.distance = this.distance;
  a.angle = this.angle;
  a.exponent = this.exponent;
  a.castShadow = this.castShadow;
  a.onlyShadow = this.onlyShadow;
  return a;
};
THREE.Loader = function (a) {
  this.statusDomElement = (this.showStatus = a)
    ? THREE.Loader.prototype.addStatusElement()
    : null;
  this.onLoadStart = function () {};
  this.onLoadProgress = function () {};
  this.onLoadComplete = function () {};
};
THREE.Loader.prototype = {
  constructor: THREE.Loader,
  crossOrigin: "anonymous",
  addStatusElement: function () {
    var a = document.createElement("div");
    a.style.position = "absolute";
    a.style.right = "0px";
    a.style.top = "0px";
    a.style.fontSize = "0.8em";
    a.style.textAlign = "left";
    a.style.background = "rgba(0,0,0,0.25)";
    a.style.color = "#fff";
    a.style.width = "120px";
    a.style.padding = "0.5em 0.5em 0.5em 0.5em";
    a.style.zIndex = 1e3;
    a.innerHTML = "Loading ...";
    return a;
  },
  updateProgress: function (a) {
    var b = "Loaded ",
      b = a.total
        ? b + (((100 * a.loaded) / a.total).toFixed(0) + "%")
        : b + ((a.loaded / 1e3).toFixed(2) + " KB");
    this.statusDomElement.innerHTML = b;
  },
  extractUrlBase: function (a) {
    a = a.split("/");
    a.pop();
    return (1 > a.length ? "." : a.join("/")) + "/";
  },
  initMaterials: function (a, b) {
    for (var c = [], d = 0; d < a.length; ++d)
      c[d] = THREE.Loader.prototype.createMaterial(a[d], b);
    return c;
  },
  needsTangents: function (a) {
    for (var b = 0, c = a.length; b < c; b++)
      if (a[b] instanceof THREE.ShaderMaterial) return !0;
    return !1;
  },
  createMaterial: function (a, b) {
    function c(a) {
      a = Math.log(a) / Math.LN2;
      return Math.floor(a) == a;
    }
    function d(a) {
      a = Math.log(a) / Math.LN2;
      return Math.pow(2, Math.round(a));
    }
    function e(a, e, f, g, i, k, r) {
      var q = /\.dds$/i.test(f),
        u = b + "/" + f;
      if (q) {
        var w = THREE.ImageUtils.loadCompressedTexture(u);
        a[e] = w;
      } else
        (w = document.createElement("canvas")), (a[e] = new THREE.Texture(w));
      a[e].sourceFile = f;
      g &&
        (a[e].repeat.set(g[0], g[1]),
        1 !== g[0] && (a[e].wrapS = THREE.RepeatWrapping),
        1 !== g[1] && (a[e].wrapT = THREE.RepeatWrapping));
      i && a[e].offset.set(i[0], i[1]);
      k &&
        ((f = {
          repeat: THREE.RepeatWrapping,
          mirror: THREE.MirroredRepeatWrapping,
        }),
        void 0 !== f[k[0]] && (a[e].wrapS = f[k[0]]),
        void 0 !== f[k[1]] && (a[e].wrapT = f[k[1]]));
      r && (a[e].anisotropy = r);
      if (!q) {
        var z = a[e],
          a = new Image();
        a.onload = function () {
          if (!c(this.width) || !c(this.height)) {
            var a = d(this.width),
              b = d(this.height);
            z.image.width = a;
            z.image.height = b;
            z.image.getContext("2d").drawImage(this, 0, 0, a, b);
          } else z.image = this;
          z.needsUpdate = !0;
        };
        a.crossOrigin = h.crossOrigin;
        a.src = u;
      }
    }
    function f(a) {
      return ((255 * a[0]) << 16) + ((255 * a[1]) << 8) + 255 * a[2];
    }
    var h = this,
      g = "MeshLambertMaterial",
      i = {
        color: 15658734,
        opacity: 1,
        map: null,
        lightMap: null,
        normalMap: null,
        bumpMap: null,
        wireframe: !1,
      };
    if (a.shading) {
      var k = a.shading.toLowerCase();
      "phong" === k
        ? (g = "MeshPhongMaterial")
        : "basic" === k && (g = "MeshBasicMaterial");
    }
    void 0 !== a.blending &&
      void 0 !== THREE[a.blending] &&
      (i.blending = THREE[a.blending]);
    if (void 0 !== a.transparent || 1 > a.opacity)
      i.transparent = a.transparent;
    void 0 !== a.depthTest && (i.depthTest = a.depthTest);
    void 0 !== a.depthWrite && (i.depthWrite = a.depthWrite);
    void 0 !== a.visible && (i.visible = a.visible);
    void 0 !== a.flipSided && (i.side = THREE.BackSide);
    void 0 !== a.doubleSided && (i.side = THREE.DoubleSide);
    void 0 !== a.wireframe && (i.wireframe = a.wireframe);
    void 0 !== a.vertexColors &&
      ("face" === a.vertexColors
        ? (i.vertexColors = THREE.FaceColors)
        : a.vertexColors && (i.vertexColors = THREE.VertexColors));
    a.colorDiffuse
      ? (i.color = f(a.colorDiffuse))
      : a.DbgColor && (i.color = a.DbgColor);
    a.colorSpecular && (i.specular = f(a.colorSpecular));
    a.colorAmbient && (i.ambient = f(a.colorAmbient));
    a.transparency && (i.opacity = a.transparency);
    a.specularCoef && (i.shininess = a.specularCoef);
    a.mapDiffuse &&
      b &&
      e(
        i,
        "map",
        a.mapDiffuse,
        a.mapDiffuseRepeat,
        a.mapDiffuseOffset,
        a.mapDiffuseWrap,
        a.mapDiffuseAnisotropy
      );
    a.mapLight &&
      b &&
      e(
        i,
        "lightMap",
        a.mapLight,
        a.mapLightRepeat,
        a.mapLightOffset,
        a.mapLightWrap,
        a.mapLightAnisotropy
      );
    a.mapBump &&
      b &&
      e(
        i,
        "bumpMap",
        a.mapBump,
        a.mapBumpRepeat,
        a.mapBumpOffset,
        a.mapBumpWrap,
        a.mapBumpAnisotropy
      );
    a.mapNormal &&
      b &&
      e(
        i,
        "normalMap",
        a.mapNormal,
        a.mapNormalRepeat,
        a.mapNormalOffset,
        a.mapNormalWrap,
        a.mapNormalAnisotropy
      );
    a.mapSpecular &&
      b &&
      e(
        i,
        "specularMap",
        a.mapSpecular,
        a.mapSpecularRepeat,
        a.mapSpecularOffset,
        a.mapSpecularWrap,
        a.mapSpecularAnisotropy
      );
    a.mapBumpScale && (i.bumpScale = a.mapBumpScale);
    a.mapNormal
      ? ((g = THREE.ShaderLib.normalmap),
        (k = THREE.UniformsUtils.clone(g.uniforms)),
        (k.tNormal.value = i.normalMap),
        a.mapNormalFactor &&
          k.uNormalScale.value.set(a.mapNormalFactor, a.mapNormalFactor),
        i.map && ((k.tDiffuse.value = i.map), (k.enableDiffuse.value = !0)),
        i.specularMap &&
          ((k.tSpecular.value = i.specularMap), (k.enableSpecular.value = !0)),
        i.lightMap && ((k.tAO.value = i.lightMap), (k.enableAO.value = !0)),
        k.uDiffuseColor.value.setHex(i.color),
        k.uSpecularColor.value.setHex(i.specular),
        k.uAmbientColor.value.setHex(i.ambient),
        (k.uShininess.value = i.shininess),
        void 0 !== i.opacity && (k.uOpacity.value = i.opacity),
        (g = new THREE.ShaderMaterial({
          fragmentShader: g.fragmentShader,
          vertexShader: g.vertexShader,
          uniforms: k,
          lights: !0,
          fog: !0,
        })),
        i.transparent && (g.transparent = !0))
      : (g = new THREE[g](i));
    void 0 !== a.DbgName && (g.name = a.DbgName);
    return g;
  },
};
THREE.XHRLoader = function (a) {
  this.manager = void 0 !== a ? a : THREE.DefaultLoadingManager;
};
THREE.XHRLoader.prototype = {
  constructor: THREE.XHRLoader,
  load: function (a, b, c, d) {
    var e = this,
      f = new XMLHttpRequest();
    void 0 !== b &&
      f.addEventListener(
        "load",
        function (c) {
          b(c.target.responseText);
          e.manager.itemEnd(a);
        },
        !1
      );
    void 0 !== c &&
      f.addEventListener(
        "progress",
        function (a) {
          c(a);
        },
        !1
      );
    void 0 !== d &&
      f.addEventListener(
        "error",
        function (a) {
          d(a);
        },
        !1
      );
    void 0 !== this.crossOrigin && (f.crossOrigin = this.crossOrigin);
    f.open("GET", a, !0);
    f.send(null);
    e.manager.itemStart(a);
  },
  setCrossOrigin: function (a) {
    this.crossOrigin = a;
  },
};
THREE.ImageLoader = function (a) {
  this.manager = void 0 !== a ? a : THREE.DefaultLoadingManager;
};
THREE.ImageLoader.prototype = {
  constructor: THREE.ImageLoader,
  load: function (a, b, c, d) {
    var e = this,
      f = document.createElement("img");
    void 0 !== b &&
      f.addEventListener(
        "load",
        function () {
          e.manager.itemEnd(a);
          b(this);
        },
        !1
      );
    void 0 !== c &&
      f.addEventListener(
        "progress",
        function (a) {
          c(a);
        },
        !1
      );
    void 0 !== d &&
      f.addEventListener(
        "error",
        function (a) {
          d(a);
        },
        !1
      );
    void 0 !== this.crossOrigin && (f.crossOrigin = this.crossOrigin);
    f.src = a;
    e.manager.itemStart(a);
    return f;
  },
  setCrossOrigin: function (a) {
    this.crossOrigin = a;
  },
};
THREE.JSONLoader = function (a) {
  THREE.Loader.call(this, a);
  this.withCredentials = !1;
};
THREE.JSONLoader.prototype = Object.create(THREE.Loader.prototype);
THREE.JSONLoader.prototype.load = function (a, b, c) {
  c = c && "string" === typeof c ? c : this.extractUrlBase(a);
  this.onLoadStart();
  this.loadAjaxJSON(this, a, b, c);
};
THREE.JSONLoader.prototype.loadAjaxJSON = function (a, b, c, d, e) {
  var f = new XMLHttpRequest(),
    h = 0;
  f.onreadystatechange = function () {
    if (f.readyState === f.DONE)
      if (200 === f.status || 0 === f.status) {
        if (f.responseText) {
          var g = JSON.parse(f.responseText),
            g = a.parse(g, d);
          c(g.geometry, g.materials);
        } else
          console.warn(
            "THREE.JSONLoader: [" +
              b +
              "] seems to be unreachable or file there is empty"
          );
        a.onLoadComplete();
      } else
        console.error(
          "THREE.JSONLoader: Couldn't load [" + b + "] [" + f.status + "]"
        );
    else
      f.readyState === f.LOADING
        ? e &&
          (0 === h && (h = f.getResponseHeader("Content-Length")),
          e({ total: h, loaded: f.responseText.length }))
        : f.readyState === f.HEADERS_RECEIVED &&
          void 0 !== e &&
          (h = f.getResponseHeader("Content-Length"));
  };
  f.open("GET", b, !0);
  f.withCredentials = this.withCredentials;
  f.send(null);
};
THREE.JSONLoader.prototype.parse = function (a, b) {
  var c = new THREE.Geometry(),
    d = void 0 !== a.scale ? 1 / a.scale : 1,
    e,
    f,
    h,
    g,
    i,
    k,
    m,
    l,
    p,
    s,
    t,
    n,
    r,
    q,
    u = a.faces;
  p = a.vertices;
  var w = a.normals,
    z = a.colors,
    B = 0;
  if (void 0 !== a.uvs) {
    for (e = 0; e < a.uvs.length; e++) a.uvs[e].length && B++;
    for (e = 0; e < B; e++) c.faceVertexUvs[e] = [];
  }
  g = 0;
  for (i = p.length; g < i; )
    (k = new THREE.Vector3()),
      (k.x = p[g++] * d),
      (k.y = p[g++] * d),
      (k.z = p[g++] * d),
      c.vertices.push(k);
  g = 0;
  for (i = u.length; g < i; )
    if (
      ((p = u[g++]),
      (s = p & 1),
      (h = p & 2),
      (e = p & 8),
      (m = p & 16),
      (t = p & 32),
      (k = p & 64),
      (p &= 128),
      s)
    ) {
      s = new THREE.Face3();
      s.a = u[g];
      s.b = u[g + 1];
      s.c = u[g + 3];
      n = new THREE.Face3();
      n.a = u[g + 1];
      n.b = u[g + 2];
      n.c = u[g + 3];
      g += 4;
      h && ((h = u[g++]), (s.materialIndex = h), (n.materialIndex = h));
      h = c.faces.length;
      if (e)
        for (e = 0; e < B; e++) {
          r = a.uvs[e];
          c.faceVertexUvs[e][h] = [];
          c.faceVertexUvs[e][h + 1] = [];
          for (f = 0; 4 > f; f++)
            (l = u[g++]),
              (q = r[2 * l]),
              (l = r[2 * l + 1]),
              (q = new THREE.Vector2(q, l)),
              2 !== f && c.faceVertexUvs[e][h].push(q),
              0 !== f && c.faceVertexUvs[e][h + 1].push(q);
        }
      m &&
        ((m = 3 * u[g++]),
        s.normal.set(w[m++], w[m++], w[m]),
        n.normal.copy(s.normal));
      if (t)
        for (e = 0; 4 > e; e++)
          (m = 3 * u[g++]),
            (t = new THREE.Vector3(w[m++], w[m++], w[m])),
            2 !== e && s.vertexNormals.push(t),
            0 !== e && n.vertexNormals.push(t);
      k && ((k = u[g++]), (k = z[k]), s.color.setHex(k), n.color.setHex(k));
      if (p)
        for (e = 0; 4 > e; e++)
          (k = u[g++]),
            (k = z[k]),
            2 !== e && s.vertexColors.push(new THREE.Color(k)),
            0 !== e && n.vertexColors.push(new THREE.Color(k));
      c.faces.push(s);
      c.faces.push(n);
    } else {
      s = new THREE.Face3();
      s.a = u[g++];
      s.b = u[g++];
      s.c = u[g++];
      h && ((h = u[g++]), (s.materialIndex = h));
      h = c.faces.length;
      if (e)
        for (e = 0; e < B; e++) {
          r = a.uvs[e];
          c.faceVertexUvs[e][h] = [];
          for (f = 0; 3 > f; f++)
            (l = u[g++]),
              (q = r[2 * l]),
              (l = r[2 * l + 1]),
              (q = new THREE.Vector2(q, l)),
              c.faceVertexUvs[e][h].push(q);
        }
      m && ((m = 3 * u[g++]), s.normal.set(w[m++], w[m++], w[m]));
      if (t)
        for (e = 0; 3 > e; e++)
          (m = 3 * u[g++]),
            (t = new THREE.Vector3(w[m++], w[m++], w[m])),
            s.vertexNormals.push(t);
      k && ((k = u[g++]), s.color.setHex(z[k]));
      if (p)
        for (e = 0; 3 > e; e++)
          (k = u[g++]), s.vertexColors.push(new THREE.Color(z[k]));
      c.faces.push(s);
    }
  if (a.skinWeights) {
    g = 0;
    for (i = a.skinWeights.length; g < i; g += 2)
      (u = a.skinWeights[g]),
        (w = a.skinWeights[g + 1]),
        c.skinWeights.push(new THREE.Vector4(u, w, 0, 0));
  }
  if (a.skinIndices) {
    g = 0;
    for (i = a.skinIndices.length; g < i; g += 2)
      (u = a.skinIndices[g]),
        (w = a.skinIndices[g + 1]),
        c.skinIndices.push(new THREE.Vector4(u, w, 0, 0));
  }
  c.bones = a.bones;
  c.animation = a.animation;
  c.animations = a.animations;
  if (void 0 !== a.morphTargets) {
    g = 0;
    for (i = a.morphTargets.length; g < i; g++) {
      c.morphTargets[g] = {};
      c.morphTargets[g].name = a.morphTargets[g].name;
      c.morphTargets[g].vertices = [];
      z = c.morphTargets[g].vertices;
      B = a.morphTargets[g].vertices;
      u = 0;
      for (w = B.length; u < w; u += 3)
        (p = new THREE.Vector3()),
          (p.x = B[u] * d),
          (p.y = B[u + 1] * d),
          (p.z = B[u + 2] * d),
          z.push(p);
    }
  }
  if (void 0 !== a.morphColors) {
    g = 0;
    for (i = a.morphColors.length; g < i; g++) {
      c.morphColors[g] = {};
      c.morphColors[g].name = a.morphColors[g].name;
      c.morphColors[g].colors = [];
      w = c.morphColors[g].colors;
      z = a.morphColors[g].colors;
      d = 0;
      for (u = z.length; d < u; d += 3)
        (B = new THREE.Color(16755200)),
          B.setRGB(z[d], z[d + 1], z[d + 2]),
          w.push(B);
    }
  }
  c.computeCentroids();
  c.computeFaceNormals();
  c.computeBoundingSphere();
  if (void 0 === a.materials) return { geometry: c };
  d = this.initMaterials(a.materials, b);
  this.needsTangents(d) && c.computeTangents();
  return { geometry: c, materials: d };
};
THREE.LoadingManager = function (a, b, c) {
  var d = this,
    e = 0,
    f = 0;
  this.onLoad = a;
  this.onProgress = b;
  this.onError = c;
  this.itemStart = function () {
    f++;
  };
  this.itemEnd = function (a) {
    e++;
    if (void 0 !== d.onProgress) d.onProgress(a, e, f);
    if (e === f && void 0 !== d.onLoad) d.onLoad();
  };
};
THREE.DefaultLoadingManager = new THREE.LoadingManager();
THREE.BufferGeometryLoader = function (a) {
  this.manager = void 0 !== a ? a : THREE.DefaultLoadingManager;
};
THREE.BufferGeometryLoader.prototype = {
  constructor: THREE.BufferGeometryLoader,
  load: function (a, b) {
    var c = this,
      d = new THREE.XHRLoader();
    d.setCrossOrigin(this.crossOrigin);
    d.load(a, function (a) {
      b(c.parse(JSON.parse(a)));
    });
  },
  setCrossOrigin: function (a) {
    this.crossOrigin = a;
  },
  parse: function (a) {
    var b = new THREE.BufferGeometry(),
      c = a.attributes,
      d = a.offsets,
      a = a.boundingSphere,
      e;
    for (e in c) {
      var f = c[e];
      b.attributes[e] = {
        itemSize: f.itemSize,
        array: new self[f.type](f.array),
      };
    }
    void 0 !== d && (b.offsets = JSON.parse(JSON.stringify(d)));
    void 0 !== a &&
      (b.boundingSphere = new THREE.Sphere(
        new THREE.Vector3().fromArray(
          void 0 !== a.center ? a.center : [0, 0, 0]
        ),
        a.radius
      ));
    return b;
  },
};
THREE.GeometryLoader = function (a) {
  this.manager = void 0 !== a ? a : THREE.DefaultLoadingManager;
};
THREE.GeometryLoader.prototype = {
  constructor: THREE.GeometryLoader,
  load: function (a, b) {
    var c = this,
      d = new THREE.XHRLoader();
    d.setCrossOrigin(this.crossOrigin);
    d.load(a, function (a) {
      b(c.parse(JSON.parse(a)));
    });
  },
  setCrossOrigin: function (a) {
    this.crossOrigin = a;
  },
  parse: function () {},
};
THREE.MaterialLoader = function (a) {
  this.manager = void 0 !== a ? a : THREE.DefaultLoadingManager;
};
THREE.MaterialLoader.prototype = {
  constructor: THREE.MaterialLoader,
  load: function (a, b) {
    var c = this,
      d = new THREE.XHRLoader();
    d.setCrossOrigin(this.crossOrigin);
    d.load(a, function (a) {
      b(c.parse(JSON.parse(a)));
    });
  },
  setCrossOrigin: function (a) {
    this.crossOrigin = a;
  },
  parse: function (a) {
    var b = new THREE[a.type]();
    void 0 !== a.color && b.color.setHex(a.color);
    void 0 !== a.ambient && b.ambient.setHex(a.ambient);
    void 0 !== a.emissive && b.emissive.setHex(a.emissive);
    void 0 !== a.specular && b.specular.setHex(a.specular);
    void 0 !== a.shininess && (b.shininess = a.shininess);
    void 0 !== a.vertexColors && (b.vertexColors = a.vertexColors);
    void 0 !== a.blending && (b.blending = a.blending);
    void 0 !== a.opacity && (b.opacity = a.opacity);
    void 0 !== a.transparent && (b.transparent = a.transparent);
    void 0 !== a.wireframe && (b.wireframe = a.wireframe);
    if (void 0 !== a.materials)
      for (var c = 0, d = a.materials.length; c < d; c++)
        b.materials.push(this.parse(a.materials[c]));
    return b;
  },
};
THREE.ObjectLoader = function (a) {
  this.manager = void 0 !== a ? a : THREE.DefaultLoadingManager;
};
THREE.ObjectLoader.prototype = {
  constructor: THREE.ObjectLoader,
  load: function (a, b) {
    var c = this,
      d = new THREE.XHRLoader(c.manager);
    d.setCrossOrigin(this.crossOrigin);
    d.load(a, function (a) {
      b(c.parse(JSON.parse(a)));
    });
  },
  setCrossOrigin: function (a) {
    this.crossOrigin = a;
  },
  parse: function (a) {
    var b = this.parseGeometries(a.geometries),
      c = this.parseMaterials(a.materials);
    return this.parseObject(a.object, b, c);
  },
  parseGeometries: function (a) {
    var b = {};
    if (void 0 !== a)
      for (
        var c = new THREE.JSONLoader(),
          d = new THREE.BufferGeometryLoader(),
          e = 0,
          f = a.length;
        e < f;
        e++
      ) {
        var h,
          g = a[e];
        switch (g.type) {
          case "PlaneGeometry":
            h = new THREE.PlaneGeometry(
              g.width,
              g.height,
              g.widthSegments,
              g.heightSegments
            );
            break;
          case "CircleGeometry":
            h = new THREE.CircleGeometry(g.radius, g.segments);
            break;
          case "CubeGeometry":
            h = new THREE.CubeGeometry(
              g.width,
              g.height,
              g.depth,
              g.widthSegments,
              g.heightSegments,
              g.depthSegments
            );
            break;
          case "CylinderGeometry":
            h = new THREE.CylinderGeometry(
              g.radiusTop,
              g.radiusBottom,
              g.height,
              g.radiusSegments,
              g.heightSegments,
              g.openEnded
            );
            break;
          case "SphereGeometry":
            h = new THREE.SphereGeometry(
              g.radius,
              g.widthSegments,
              g.heightSegments,
              g.phiStart,
              g.phiLength,
              g.thetaStart,
              g.thetaLength
            );
            break;
          case "IcosahedronGeometry":
            h = new THREE.IcosahedronGeometry(g.radius, g.detail);
            break;
          case "TorusGeometry":
            h = new THREE.TorusGeometry(
              g.radius,
              g.tube,
              g.radialSegments,
              g.tubularSegments,
              g.arc
            );
            break;
          case "TorusKnotGeometry":
            h = new THREE.TorusKnotGeometry(
              g.radius,
              g.tube,
              g.radialSegments,
              g.tubularSegments,
              g.p,
              g.q,
              g.heightScale
            );
            break;
          case "BufferGeometry":
            h = d.parse(g.data);
            break;
          case "Geometry":
            h = c.parse(g.data).geometry;
        }
        h.uuid = g.uuid;
        void 0 !== g.name && (h.name = g.name);
        b[g.uuid] = h;
      }
    return b;
  },
  parseMaterials: function (a) {
    var b = {};
    if (void 0 !== a)
      for (
        var c = new THREE.MaterialLoader(), d = 0, e = a.length;
        d < e;
        d++
      ) {
        var f = a[d],
          h = c.parse(f);
        h.uuid = f.uuid;
        void 0 !== f.name && (h.name = f.name);
        b[f.uuid] = h;
      }
    return b;
  },
  parseObject: (function () {
    var a = new THREE.Matrix4();
    return function (b, c, d) {
      var e;
      switch (b.type) {
        case "Scene":
          e = new THREE.Scene();
          break;
        case "PerspectiveCamera":
          e = new THREE.PerspectiveCamera(b.fov, b.aspect, b.near, b.far);
          break;
        case "OrthographicCamera":
          e = new THREE.OrthographicCamera(
            b.left,
            b.right,
            b.top,
            b.bottom,
            b.near,
            b.far
          );
          break;
        case "AmbientLight":
          e = new THREE.AmbientLight(b.color);
          break;
        case "DirectionalLight":
          e = new THREE.DirectionalLight(b.color, b.intensity);
          break;
        case "PointLight":
          e = new THREE.PointLight(b.color, b.intensity, b.distance);
          break;
        case "SpotLight":
          e = new THREE.SpotLight(
            b.color,
            b.intensity,
            b.distance,
            b.angle,
            b.exponent
          );
          break;
        case "HemisphereLight":
          e = new THREE.HemisphereLight(b.color, b.groundColor, b.intensity);
          break;
        case "Mesh":
          e = c[b.geometry];
          var f = d[b.material];
          void 0 === e &&
            console.error(
              "THREE.ObjectLoader: Undefined geometry " + b.geometry
            );
          void 0 === f &&
            console.error(
              "THREE.ObjectLoader: Undefined material " + b.material
            );
          e = new THREE.Mesh(e, f);
          break;
        default:
          e = new THREE.Object3D();
      }
      e.uuid = b.uuid;
      void 0 !== b.name && (e.name = b.name);
      void 0 !== b.matrix
        ? (a.fromArray(b.matrix),
          a.decompose(e.position, e.quaternion, e.scale))
        : (void 0 !== b.position && e.position.fromArray(b.position),
          void 0 !== b.rotation && e.rotation.fromArray(b.rotation),
          void 0 !== b.scale && e.scale.fromArray(b.scale));
      void 0 !== b.visible && (e.visible = b.visible);
      void 0 !== b.userData && (e.userData = b.userData);
      if (void 0 !== b.children)
        for (var h in b.children) e.add(this.parseObject(b.children[h], c, d));
      return e;
    };
  })(),
};
THREE.SceneLoader = function () {
  this.onLoadStart = function () {};
  this.onLoadProgress = function () {};
  this.onLoadComplete = function () {};
  this.callbackSync = function () {};
  this.callbackProgress = function () {};
  this.geometryHandlers = {};
  this.hierarchyHandlers = {};
  this.addGeometryHandler("ascii", THREE.JSONLoader);
};
THREE.SceneLoader.prototype = {
  constructor: THREE.SceneLoader,
  load: function (a, b) {
    var c = this,
      d = new THREE.XHRLoader(c.manager);
    d.setCrossOrigin(this.crossOrigin);
    d.load(a, function (d) {
      c.parse(JSON.parse(d), b, a);
    });
  },
  setCrossOrigin: function (a) {
    this.crossOrigin = a;
  },
  addGeometryHandler: function (a, b) {
    this.geometryHandlers[a] = { loaderClass: b };
  },
  addHierarchyHandler: function (a, b) {
    this.hierarchyHandlers[a] = { loaderClass: b };
  },
  parse: function (a, b, c) {
    function d(a, b) {
      return "relativeToHTML" == b ? a : p + "/" + a;
    }
    function e() {
      f(A.scene, C.objects);
    }
    function f(a, b) {
      var c, e, h, i, k, m, p;
      for (p in b) {
        var r = A.objects[p],
          q = b[p];
        if (void 0 === r) {
          if (q.type && q.type in l.hierarchyHandlers) {
            if (void 0 === q.loading) {
              e = {
                type: 1,
                url: 1,
                material: 1,
                position: 1,
                rotation: 1,
                scale: 1,
                visible: 1,
                children: 1,
                userData: 1,
                skin: 1,
                morph: 1,
                mirroredLoop: 1,
                duration: 1,
              };
              h = {};
              for (var B in q) B in e || (h[B] = q[B]);
              t = A.materials[q.material];
              q.loading = !0;
              e = l.hierarchyHandlers[q.type].loaderObject;
              e.options
                ? e.load(d(q.url, C.urlBaseType), g(p, a, t, q))
                : e.load(d(q.url, C.urlBaseType), g(p, a, t, q), h);
            }
          } else if (void 0 !== q.geometry) {
            if ((s = A.geometries[q.geometry])) {
              r = !1;
              t = A.materials[q.material];
              r = t instanceof THREE.ShaderMaterial;
              h = q.position;
              i = q.rotation;
              k = q.scale;
              c = q.matrix;
              m = q.quaternion;
              q.material ||
                (t = new THREE.MeshFaceMaterial(A.face_materials[q.geometry]));
              t instanceof THREE.MeshFaceMaterial &&
                0 === t.materials.length &&
                (t = new THREE.MeshFaceMaterial(A.face_materials[q.geometry]));
              if (t instanceof THREE.MeshFaceMaterial)
                for (e = 0; e < t.materials.length; e++)
                  r = r || t.materials[e] instanceof THREE.ShaderMaterial;
              r && s.computeTangents();
              q.skin
                ? (r = new THREE.SkinnedMesh(s, t))
                : q.morph
                ? ((r = new THREE.MorphAnimMesh(s, t)),
                  void 0 !== q.duration && (r.duration = q.duration),
                  void 0 !== q.time && (r.time = q.time),
                  void 0 !== q.mirroredLoop &&
                    (r.mirroredLoop = q.mirroredLoop),
                  t.morphNormals && s.computeMorphNormals())
                : (r = new THREE.Mesh(s, t));
              r.name = p;
              c
                ? ((r.matrixAutoUpdate = !1),
                  r.matrix.set(
                    c[0],
                    c[1],
                    c[2],
                    c[3],
                    c[4],
                    c[5],
                    c[6],
                    c[7],
                    c[8],
                    c[9],
                    c[10],
                    c[11],
                    c[12],
                    c[13],
                    c[14],
                    c[15]
                  ))
                : (r.position.fromArray(h),
                  m ? r.quaternion.fromArray(m) : r.rotation.fromArray(i),
                  r.scale.fromArray(k));
              r.visible = q.visible;
              r.castShadow = q.castShadow;
              r.receiveShadow = q.receiveShadow;
              a.add(r);
              A.objects[p] = r;
            }
          } else
            "DirectionalLight" === q.type ||
            "PointLight" === q.type ||
            "AmbientLight" === q.type
              ? ((w = void 0 !== q.color ? q.color : 16777215),
                (z = void 0 !== q.intensity ? q.intensity : 1),
                "DirectionalLight" === q.type
                  ? ((h = q.direction),
                    (u = new THREE.DirectionalLight(w, z)),
                    u.position.fromArray(h),
                    q.target &&
                      (O.push({ object: u, targetName: q.target }),
                      (u.target = null)))
                  : "PointLight" === q.type
                  ? ((h = q.position),
                    (e = q.distance),
                    (u = new THREE.PointLight(w, z, e)),
                    u.position.fromArray(h))
                  : "AmbientLight" === q.type &&
                    (u = new THREE.AmbientLight(w)),
                a.add(u),
                (u.name = p),
                (A.lights[p] = u),
                (A.objects[p] = u))
              : "PerspectiveCamera" === q.type ||
                "OrthographicCamera" === q.type
              ? ((h = q.position),
                (i = q.rotation),
                (m = q.quaternion),
                "PerspectiveCamera" === q.type
                  ? (n = new THREE.PerspectiveCamera(
                      q.fov,
                      q.aspect,
                      q.near,
                      q.far
                    ))
                  : "OrthographicCamera" === q.type &&
                    (n = new THREE.OrthographicCamera(
                      q.left,
                      q.right,
                      q.top,
                      q.bottom,
                      q.near,
                      q.far
                    )),
                (n.name = p),
                n.position.fromArray(h),
                void 0 !== m
                  ? n.quaternion.fromArray(m)
                  : void 0 !== i && n.rotation.fromArray(i),
                a.add(n),
                (A.cameras[p] = n),
                (A.objects[p] = n))
              : ((h = q.position),
                (i = q.rotation),
                (k = q.scale),
                (m = q.quaternion),
                (r = new THREE.Object3D()),
                (r.name = p),
                r.position.fromArray(h),
                m ? r.quaternion.fromArray(m) : r.rotation.fromArray(i),
                r.scale.fromArray(k),
                (r.visible = void 0 !== q.visible ? q.visible : !1),
                a.add(r),
                (A.objects[p] = r),
                (A.empties[p] = r));
          if (r) {
            if (void 0 !== q.userData)
              for (var D in q.userData) r.userData[D] = q.userData[D];
            if (void 0 !== q.groups)
              for (e = 0; e < q.groups.length; e++)
                (h = q.groups[e]),
                  void 0 === A.groups[h] && (A.groups[h] = []),
                  A.groups[h].push(p);
          }
        }
        void 0 !== r && void 0 !== q.children && f(r, q.children);
      }
    }
    function h(a) {
      return function (b, c) {
        b.name = a;
        A.geometries[a] = b;
        A.face_materials[a] = c;
        e();
        B -= 1;
        l.onLoadComplete();
        k();
      };
    }
    function g(a, b, c, d) {
      return function (f) {
        var f = f.content ? f.content : f.dae ? f.scene : f,
          h = d.rotation,
          g = d.quaternion,
          i = d.scale;
        f.position.fromArray(d.position);
        g ? f.quaternion.fromArray(g) : f.rotation.fromArray(h);
        f.scale.fromArray(i);
        c &&
          f.traverse(function (a) {
            a.material = c;
          });
        var m = void 0 !== d.visible ? d.visible : !0;
        f.traverse(function (a) {
          a.visible = m;
        });
        b.add(f);
        f.name = a;
        A.objects[a] = f;
        e();
        B -= 1;
        l.onLoadComplete();
        k();
      };
    }
    function i(a) {
      return function (b, c) {
        b.name = a;
        A.geometries[a] = b;
        A.face_materials[a] = c;
      };
    }
    function k() {
      l.callbackProgress(
        {
          totalModels: x,
          totalTextures: F,
          loadedModels: x - B,
          loadedTextures: F - D,
        },
        A
      );
      l.onLoadProgress();
      if (0 === B && 0 === D) {
        for (var a = 0; a < O.length; a++) {
          var c = O[a],
            d = A.objects[c.targetName];
          d
            ? (c.object.target = d)
            : ((c.object.target = new THREE.Object3D()),
              A.scene.add(c.object.target));
          c.object.target.userData.targetInverse = c.object;
        }
        b(A);
      }
    }
    function m(a, b) {
      b(a);
      if (void 0 !== a.children) for (var c in a.children) m(a.children[c], b);
    }
    var l = this,
      p = THREE.Loader.prototype.extractUrlBase(c),
      s,
      t,
      n,
      r,
      q,
      u,
      w,
      z,
      B,
      D,
      x,
      F,
      A,
      O = [],
      C = a,
      E;
    for (E in this.geometryHandlers)
      (a = this.geometryHandlers[E].loaderClass),
        (this.geometryHandlers[E].loaderObject = new a());
    for (E in this.hierarchyHandlers)
      (a = this.hierarchyHandlers[E].loaderClass),
        (this.hierarchyHandlers[E].loaderObject = new a());
    D = B = 0;
    A = {
      scene: new THREE.Scene(),
      geometries: {},
      face_materials: {},
      materials: {},
      textures: {},
      objects: {},
      cameras: {},
      lights: {},
      fogs: {},
      empties: {},
      groups: {},
    };
    if (
      C.transform &&
      ((E = C.transform.position),
      (a = C.transform.rotation),
      (c = C.transform.scale),
      E && A.scene.position.fromArray(E),
      a && A.scene.rotation.fromArray(a),
      c && A.scene.scale.fromArray(c),
      E || a || c)
    )
      A.scene.updateMatrix(), A.scene.updateMatrixWorld();
    E = function (a) {
      return function () {
        D -= a;
        k();
        l.onLoadComplete();
      };
    };
    for (var I in C.fogs)
      (a = C.fogs[I]),
        "linear" === a.type
          ? (r = new THREE.Fog(0, a.near, a.far))
          : "exp2" === a.type && (r = new THREE.FogExp2(0, a.density)),
        (a = a.color),
        r.color.setRGB(a[0], a[1], a[2]),
        (A.fogs[I] = r);
    for (var y in C.geometries)
      (r = C.geometries[y]),
        r.type in this.geometryHandlers && ((B += 1), l.onLoadStart());
    for (var v in C.objects)
      m(C.objects[v], function (a) {
        a.type && a.type in l.hierarchyHandlers && ((B += 1), l.onLoadStart());
      });
    x = B;
    for (y in C.geometries)
      if (((r = C.geometries[y]), "cube" === r.type))
        (s = new THREE.CubeGeometry(
          r.width,
          r.height,
          r.depth,
          r.widthSegments,
          r.heightSegments,
          r.depthSegments
        )),
          (s.name = y),
          (A.geometries[y] = s);
      else if ("plane" === r.type)
        (s = new THREE.PlaneGeometry(
          r.width,
          r.height,
          r.widthSegments,
          r.heightSegments
        )),
          (s.name = y),
          (A.geometries[y] = s);
      else if ("sphere" === r.type)
        (s = new THREE.SphereGeometry(
          r.radius,
          r.widthSegments,
          r.heightSegments
        )),
          (s.name = y),
          (A.geometries[y] = s);
      else if ("cylinder" === r.type)
        (s = new THREE.CylinderGeometry(
          r.topRad,
          r.botRad,
          r.height,
          r.radSegs,
          r.heightSegs
        )),
          (s.name = y),
          (A.geometries[y] = s);
      else if ("torus" === r.type)
        (s = new THREE.TorusGeometry(
          r.radius,
          r.tube,
          r.segmentsR,
          r.segmentsT
        )),
          (s.name = y),
          (A.geometries[y] = s);
      else if ("icosahedron" === r.type)
        (s = new THREE.IcosahedronGeometry(r.radius, r.subdivisions)),
          (s.name = y),
          (A.geometries[y] = s);
      else if (r.type in this.geometryHandlers) {
        v = {};
        for (q in r) "type" !== q && "url" !== q && (v[q] = r[q]);
        this.geometryHandlers[r.type].loaderObject.load(
          d(r.url, C.urlBaseType),
          h(y),
          v
        );
      } else
        "embedded" === r.type &&
          ((v = C.embeds[r.id]),
          (v.metadata = C.metadata),
          v &&
            ((v = this.geometryHandlers.ascii.loaderObject.parse(v, "")),
            i(y)(v.geometry, v.materials)));
    for (var G in C.textures)
      if (((y = C.textures[G]), y.url instanceof Array)) {
        D += y.url.length;
        for (q = 0; q < y.url.length; q++) l.onLoadStart();
      } else (D += 1), l.onLoadStart();
    F = D;
    for (G in C.textures) {
      y = C.textures[G];
      void 0 !== y.mapping &&
        void 0 !== THREE[y.mapping] &&
        (y.mapping = new THREE[y.mapping]());
      if (y.url instanceof Array) {
        v = y.url.length;
        r = [];
        for (q = 0; q < v; q++) r[q] = d(y.url[q], C.urlBaseType);
        q = (q = /\.dds$/i.test(r[0]))
          ? THREE.ImageUtils.loadCompressedTextureCube(r, y.mapping, E(v))
          : THREE.ImageUtils.loadTextureCube(r, y.mapping, E(v));
      } else
        (q = /\.dds$/i.test(y.url)),
          (v = d(y.url, C.urlBaseType)),
          (r = E(1)),
          (q = q
            ? THREE.ImageUtils.loadCompressedTexture(v, y.mapping, r)
            : THREE.ImageUtils.loadTexture(v, y.mapping, r)),
          void 0 !== THREE[y.minFilter] && (q.minFilter = THREE[y.minFilter]),
          void 0 !== THREE[y.magFilter] && (q.magFilter = THREE[y.magFilter]),
          y.anisotropy && (q.anisotropy = y.anisotropy),
          y.repeat &&
            (q.repeat.set(y.repeat[0], y.repeat[1]),
            1 !== y.repeat[0] && (q.wrapS = THREE.RepeatWrapping),
            1 !== y.repeat[1] && (q.wrapT = THREE.RepeatWrapping)),
          y.offset && q.offset.set(y.offset[0], y.offset[1]),
          y.wrap &&
            ((v = {
              repeat: THREE.RepeatWrapping,
              mirror: THREE.MirroredRepeatWrapping,
            }),
            void 0 !== v[y.wrap[0]] && (q.wrapS = v[y.wrap[0]]),
            void 0 !== v[y.wrap[1]] && (q.wrapT = v[y.wrap[1]]));
      A.textures[G] = q;
    }
    var R, J;
    for (R in C.materials) {
      G = C.materials[R];
      for (J in G.parameters)
        "envMap" === J || "map" === J || "lightMap" === J || "bumpMap" === J
          ? (G.parameters[J] = A.textures[G.parameters[J]])
          : "shading" === J
          ? (G.parameters[J] =
              "flat" === G.parameters[J]
                ? THREE.FlatShading
                : THREE.SmoothShading)
          : "side" === J
          ? (G.parameters[J] =
              "double" == G.parameters[J]
                ? THREE.DoubleSide
                : "back" == G.parameters[J]
                ? THREE.BackSide
                : THREE.FrontSide)
          : "blending" === J
          ? (G.parameters[J] =
              G.parameters[J] in THREE
                ? THREE[G.parameters[J]]
                : THREE.NormalBlending)
          : "combine" === J
          ? (G.parameters[J] =
              G.parameters[J] in THREE
                ? THREE[G.parameters[J]]
                : THREE.MultiplyOperation)
          : "vertexColors" === J
          ? "face" == G.parameters[J]
            ? (G.parameters[J] = THREE.FaceColors)
            : G.parameters[J] && (G.parameters[J] = THREE.VertexColors)
          : "wrapRGB" === J &&
            ((E = G.parameters[J]),
            (G.parameters[J] = new THREE.Vector3(E[0], E[1], E[2])));
      void 0 !== G.parameters.opacity &&
        1 > G.parameters.opacity &&
        (G.parameters.transparent = !0);
      G.parameters.normalMap
        ? ((E = THREE.ShaderLib.normalmap),
          (y = THREE.UniformsUtils.clone(E.uniforms)),
          (q = G.parameters.color),
          (v = G.parameters.specular),
          (r = G.parameters.ambient),
          (I = G.parameters.shininess),
          (y.tNormal.value = A.textures[G.parameters.normalMap]),
          G.parameters.normalScale &&
            y.uNormalScale.value.set(
              G.parameters.normalScale[0],
              G.parameters.normalScale[1]
            ),
          G.parameters.map &&
            ((y.tDiffuse.value = G.parameters.map),
            (y.enableDiffuse.value = !0)),
          G.parameters.envMap &&
            ((y.tCube.value = G.parameters.envMap),
            (y.enableReflection.value = !0),
            (y.uReflectivity.value = G.parameters.reflectivity)),
          G.parameters.lightMap &&
            ((y.tAO.value = G.parameters.lightMap), (y.enableAO.value = !0)),
          G.parameters.specularMap &&
            ((y.tSpecular.value = A.textures[G.parameters.specularMap]),
            (y.enableSpecular.value = !0)),
          G.parameters.displacementMap &&
            ((y.tDisplacement.value = A.textures[G.parameters.displacementMap]),
            (y.enableDisplacement.value = !0),
            (y.uDisplacementBias.value = G.parameters.displacementBias),
            (y.uDisplacementScale.value = G.parameters.displacementScale)),
          y.uDiffuseColor.value.setHex(q),
          y.uSpecularColor.value.setHex(v),
          y.uAmbientColor.value.setHex(r),
          (y.uShininess.value = I),
          G.parameters.opacity && (y.uOpacity.value = G.parameters.opacity),
          (t = new THREE.ShaderMaterial({
            fragmentShader: E.fragmentShader,
            vertexShader: E.vertexShader,
            uniforms: y,
            lights: !0,
            fog: !0,
          })))
        : (t = new THREE[G.type](G.parameters));
      t.name = R;
      A.materials[R] = t;
    }
    for (R in C.materials)
      if (((G = C.materials[R]), G.parameters.materials)) {
        J = [];
        for (q = 0; q < G.parameters.materials.length; q++)
          J.push(A.materials[G.parameters.materials[q]]);
        A.materials[R].materials = J;
      }
    e();
    A.cameras &&
      C.defaults.camera &&
      (A.currentCamera = A.cameras[C.defaults.camera]);
    A.fogs && C.defaults.fog && (A.scene.fog = A.fogs[C.defaults.fog]);
    l.callbackSync(A);
    k();
  },
};
THREE.TextureLoader = function (a) {
  this.manager = void 0 !== a ? a : THREE.DefaultLoadingManager;
};
THREE.TextureLoader.prototype = {
  constructor: THREE.TextureLoader,
  load: function (a, b) {
    var c = new THREE.ImageLoader(this.manager);
    c.setCrossOrigin(this.crossOrigin);
    c.load(a, function (a) {
      a = new THREE.Texture(a);
      a.needsUpdate = !0;
      void 0 !== b && b(a);
    });
  },
  setCrossOrigin: function (a) {
    this.crossOrigin = a;
  },
};
THREE.Material = function () {
  this.id = THREE.MaterialIdCount++;
  this.uuid = THREE.Math.generateUUID();
  this.name = "";
  this.side = THREE.FrontSide;
  this.opacity = 1;
  this.transparent = !1;
  this.blending = THREE.NormalBlending;
  this.blendSrc = THREE.SrcAlphaFactor;
  this.blendDst = THREE.OneMinusSrcAlphaFactor;
  this.blendEquation = THREE.AddEquation;
  this.depthWrite = this.depthTest = !0;
  this.polygonOffset = !1;
  this.overdraw =
    this.alphaTest =
    this.polygonOffsetUnits =
    this.polygonOffsetFactor =
      0;
  this.needsUpdate = this.visible = !0;
};
THREE.Material.prototype = {
  constructor: THREE.Material,
  setValues: function (a) {
    if (void 0 !== a)
      for (var b in a) {
        var c = a[b];
        if (void 0 === c)
          console.warn("THREE.Material: '" + b + "' parameter is undefined.");
        else if (b in this) {
          var d = this[b];
          d instanceof THREE.Color
            ? d.set(c)
            : d instanceof THREE.Vector3 && c instanceof THREE.Vector3
            ? d.copy(c)
            : (this[b] = "overdraw" == b ? Number(c) : c);
        }
      }
  },
  clone: function (a) {
    void 0 === a && (a = new THREE.Material());
    a.name = this.name;
    a.side = this.side;
    a.opacity = this.opacity;
    a.transparent = this.transparent;
    a.blending = this.blending;
    a.blendSrc = this.blendSrc;
    a.blendDst = this.blendDst;
    a.blendEquation = this.blendEquation;
    a.depthTest = this.depthTest;
    a.depthWrite = this.depthWrite;
    a.polygonOffset = this.polygonOffset;
    a.polygonOffsetFactor = this.polygonOffsetFactor;
    a.polygonOffsetUnits = this.polygonOffsetUnits;
    a.alphaTest = this.alphaTest;
    a.overdraw = this.overdraw;
    a.visible = this.visible;
    return a;
  },
  dispose: function () {
    this.dispatchEvent({ type: "dispose" });
  },
};
THREE.EventDispatcher.prototype.apply(THREE.Material.prototype);
THREE.MaterialIdCount = 0;
THREE.LineBasicMaterial = function (a) {
  THREE.Material.call(this);
  this.color = new THREE.Color(16777215);
  this.linewidth = 1;
  this.linejoin = this.linecap = "round";
  this.vertexColors = !1;
  this.fog = !0;
  this.setValues(a);
};
THREE.LineBasicMaterial.prototype = Object.create(THREE.Material.prototype);
THREE.LineBasicMaterial.prototype.clone = function () {
  var a = new THREE.LineBasicMaterial();
  THREE.Material.prototype.clone.call(this, a);
  a.color.copy(this.color);
  a.linewidth = this.linewidth;
  a.linecap = this.linecap;
  a.linejoin = this.linejoin;
  a.vertexColors = this.vertexColors;
  a.fog = this.fog;
  return a;
};
THREE.LineDashedMaterial = function (a) {
  THREE.Material.call(this);
  this.color = new THREE.Color(16777215);
  this.scale = this.linewidth = 1;
  this.dashSize = 3;
  this.gapSize = 1;
  this.vertexColors = !1;
  this.fog = !0;
  this.setValues(a);
};
THREE.LineDashedMaterial.prototype = Object.create(THREE.Material.prototype);
THREE.LineDashedMaterial.prototype.clone = function () {
  var a = new THREE.LineDashedMaterial();
  THREE.Material.prototype.clone.call(this, a);
  a.color.copy(this.color);
  a.linewidth = this.linewidth;
  a.scale = this.scale;
  a.dashSize = this.dashSize;
  a.gapSize = this.gapSize;
  a.vertexColors = this.vertexColors;
  a.fog = this.fog;
  return a;
};
THREE.MeshBasicMaterial = function (a) {
  THREE.Material.call(this);
  this.color = new THREE.Color(16777215);
  this.envMap = this.specularMap = this.lightMap = this.map = null;
  this.combine = THREE.MultiplyOperation;
  this.reflectivity = 1;
  this.refractionRatio = 0.98;
  this.fog = !0;
  this.shading = THREE.SmoothShading;
  this.wireframe = !1;
  this.wireframeLinewidth = 1;
  this.wireframeLinejoin = this.wireframeLinecap = "round";
  this.vertexColors = THREE.NoColors;
  this.morphTargets = this.skinning = !1;
  this.setValues(a);
};
THREE.MeshBasicMaterial.prototype = Object.create(THREE.Material.prototype);
THREE.MeshBasicMaterial.prototype.clone = function () {
  var a = new THREE.MeshBasicMaterial();
  THREE.Material.prototype.clone.call(this, a);
  a.color.copy(this.color);
  a.map = this.map;
  a.lightMap = this.lightMap;
  a.specularMap = this.specularMap;
  a.envMap = this.envMap;
  a.combine = this.combine;
  a.reflectivity = this.reflectivity;
  a.refractionRatio = this.refractionRatio;
  a.fog = this.fog;
  a.shading = this.shading;
  a.wireframe = this.wireframe;
  a.wireframeLinewidth = this.wireframeLinewidth;
  a.wireframeLinecap = this.wireframeLinecap;
  a.wireframeLinejoin = this.wireframeLinejoin;
  a.vertexColors = this.vertexColors;
  a.skinning = this.skinning;
  a.morphTargets = this.morphTargets;
  return a;
};
THREE.MeshLambertMaterial = function (a) {
  THREE.Material.call(this);
  this.color = new THREE.Color(16777215);
  this.ambient = new THREE.Color(16777215);
  this.emissive = new THREE.Color(0);
  this.wrapAround = !1;
  this.wrapRGB = new THREE.Vector3(1, 1, 1);
  this.envMap = this.specularMap = this.lightMap = this.map = null;
  this.combine = THREE.MultiplyOperation;
  this.reflectivity = 1;
  this.refractionRatio = 0.98;
  this.fog = !0;
  this.shading = THREE.SmoothShading;
  this.wireframe = !1;
  this.wireframeLinewidth = 1;
  this.wireframeLinejoin = this.wireframeLinecap = "round";
  this.vertexColors = THREE.NoColors;
  this.morphNormals = this.morphTargets = this.skinning = !1;
  this.setValues(a);
};
THREE.MeshLambertMaterial.prototype = Object.create(THREE.Material.prototype);
THREE.MeshLambertMaterial.prototype.clone = function () {
  var a = new THREE.MeshLambertMaterial();
  THREE.Material.prototype.clone.call(this, a);
  a.color.copy(this.color);
  a.ambient.copy(this.ambient);
  a.emissive.copy(this.emissive);
  a.wrapAround = this.wrapAround;
  a.wrapRGB.copy(this.wrapRGB);
  a.map = this.map;
  a.lightMap = this.lightMap;
  a.specularMap = this.specularMap;
  a.envMap = this.envMap;
  a.combine = this.combine;
  a.reflectivity = this.reflectivity;
  a.refractionRatio = this.refractionRatio;
  a.fog = this.fog;
  a.shading = this.shading;
  a.wireframe = this.wireframe;
  a.wireframeLinewidth = this.wireframeLinewidth;
  a.wireframeLinecap = this.wireframeLinecap;
  a.wireframeLinejoin = this.wireframeLinejoin;
  a.vertexColors = this.vertexColors;
  a.skinning = this.skinning;
  a.morphTargets = this.morphTargets;
  a.morphNormals = this.morphNormals;
  return a;
};
THREE.MeshPhongMaterial = function (a) {
  THREE.Material.call(this);
  this.color = new THREE.Color(16777215);
  this.ambient = new THREE.Color(16777215);
  this.emissive = new THREE.Color(0);
  this.specular = new THREE.Color(1118481);
  this.shininess = 30;
  this.metal = !1;
  this.perPixel = !0;
  this.wrapAround = !1;
  this.wrapRGB = new THREE.Vector3(1, 1, 1);
  this.bumpMap = this.lightMap = this.map = null;
  this.bumpScale = 1;
  this.normalMap = null;
  this.normalScale = new THREE.Vector2(1, 1);
  this.envMap = this.specularMap = null;
  this.combine = THREE.MultiplyOperation;
  this.reflectivity = 1;
  this.refractionRatio = 0.98;
  this.fog = !0;
  this.shading = THREE.SmoothShading;
  this.wireframe = !1;
  this.wireframeLinewidth = 1;
  this.wireframeLinejoin = this.wireframeLinecap = "round";
  this.vertexColors = THREE.NoColors;
  this.morphNormals = this.morphTargets = this.skinning = !1;
  this.setValues(a);
};
THREE.MeshPhongMaterial.prototype = Object.create(THREE.Material.prototype);
THREE.MeshPhongMaterial.prototype.clone = function () {
  var a = new THREE.MeshPhongMaterial();
  THREE.Material.prototype.clone.call(this, a);
  a.color.copy(this.color);
  a.ambient.copy(this.ambient);
  a.emissive.copy(this.emissive);
  a.specular.copy(this.specular);
  a.shininess = this.shininess;
  a.metal = this.metal;
  a.perPixel = this.perPixel;
  a.wrapAround = this.wrapAround;
  a.wrapRGB.copy(this.wrapRGB);
  a.map = this.map;
  a.lightMap = this.lightMap;
  a.bumpMap = this.bumpMap;
  a.bumpScale = this.bumpScale;
  a.normalMap = this.normalMap;
  a.normalScale.copy(this.normalScale);
  a.specularMap = this.specularMap;
  a.envMap = this.envMap;
  a.combine = this.combine;
  a.reflectivity = this.reflectivity;
  a.refractionRatio = this.refractionRatio;
  a.fog = this.fog;
  a.shading = this.shading;
  a.wireframe = this.wireframe;
  a.wireframeLinewidth = this.wireframeLinewidth;
  a.wireframeLinecap = this.wireframeLinecap;
  a.wireframeLinejoin = this.wireframeLinejoin;
  a.vertexColors = this.vertexColors;
  a.skinning = this.skinning;
  a.morphTargets = this.morphTargets;
  a.morphNormals = this.morphNormals;
  return a;
};
THREE.MeshDepthMaterial = function (a) {
  THREE.Material.call(this);
  this.wireframe = !1;
  this.wireframeLinewidth = 1;
  this.setValues(a);
};
THREE.MeshDepthMaterial.prototype = Object.create(THREE.Material.prototype);
THREE.MeshDepthMaterial.prototype.clone = function () {
  var a = new THREE.MeshDepthMaterial();
  THREE.Material.prototype.clone.call(this, a);
  a.wireframe = this.wireframe;
  a.wireframeLinewidth = this.wireframeLinewidth;
  return a;
};
THREE.MeshNormalMaterial = function (a) {
  THREE.Material.call(this, a);
  this.shading = THREE.FlatShading;
  this.wireframe = !1;
  this.wireframeLinewidth = 1;
  this.morphTargets = !1;
  this.setValues(a);
};
THREE.MeshNormalMaterial.prototype = Object.create(THREE.Material.prototype);
THREE.MeshNormalMaterial.prototype.clone = function () {
  var a = new THREE.MeshNormalMaterial();
  THREE.Material.prototype.clone.call(this, a);
  a.shading = this.shading;
  a.wireframe = this.wireframe;
  a.wireframeLinewidth = this.wireframeLinewidth;
  return a;
};
THREE.MeshFaceMaterial = function (a) {
  this.materials = a instanceof Array ? a : [];
};
THREE.MeshFaceMaterial.prototype.clone = function () {
  for (
    var a = new THREE.MeshFaceMaterial(), b = 0;
    b < this.materials.length;
    b++
  )
    a.materials.push(this.materials[b].clone());
  return a;
};
THREE.ParticleSystemMaterial = function (a) {
  THREE.Material.call(this);
  this.color = new THREE.Color(16777215);
  this.map = null;
  this.size = 1;
  this.sizeAttenuation = !0;
  this.vertexColors = !1;
  this.fog = !0;
  this.setValues(a);
};
THREE.ParticleSystemMaterial.prototype = Object.create(
  THREE.Material.prototype
);
THREE.ParticleSystemMaterial.prototype.clone = function () {
  var a = new THREE.ParticleSystemMaterial();
  THREE.Material.prototype.clone.call(this, a);
  a.color.copy(this.color);
  a.map = this.map;
  a.size = this.size;
  a.sizeAttenuation = this.sizeAttenuation;
  a.vertexColors = this.vertexColors;
  a.fog = this.fog;
  return a;
};
THREE.ParticleBasicMaterial = THREE.ParticleSystemMaterial;
THREE.ShaderMaterial = function (a) {
  THREE.Material.call(this);
  this.vertexShader = this.fragmentShader = "void main() {}";
  this.uniforms = {};
  this.defines = {};
  this.attributes = null;
  this.shading = THREE.SmoothShading;
  this.linewidth = 1;
  this.wireframe = !1;
  this.wireframeLinewidth = 1;
  this.lights = this.fog = !1;
  this.vertexColors = THREE.NoColors;
  this.morphNormals = this.morphTargets = this.skinning = !1;
  this.defaultAttributeValues = { color: [1, 1, 1], uv: [0, 0], uv2: [0, 0] };
  this.index0AttributeName = "position";
  this.setValues(a);
};
THREE.ShaderMaterial.prototype = Object.create(THREE.Material.prototype);
THREE.ShaderMaterial.prototype.clone = function () {
  var a = new THREE.ShaderMaterial();
  THREE.Material.prototype.clone.call(this, a);
  a.fragmentShader = this.fragmentShader;
  a.vertexShader = this.vertexShader;
  a.uniforms = THREE.UniformsUtils.clone(this.uniforms);
  a.attributes = this.attributes;
  a.defines = this.defines;
  a.shading = this.shading;
  a.wireframe = this.wireframe;
  a.wireframeLinewidth = this.wireframeLinewidth;
  a.fog = this.fog;
  a.lights = this.lights;
  a.vertexColors = this.vertexColors;
  a.skinning = this.skinning;
  a.morphTargets = this.morphTargets;
  a.morphNormals = this.morphNormals;
  return a;
};
THREE.SpriteMaterial = function (a) {
  THREE.Material.call(this);
  this.color = new THREE.Color(16777215);
  this.map = new THREE.Texture();
  this.useScreenCoordinates = !0;
  this.depthTest = !this.useScreenCoordinates;
  this.sizeAttenuation = !this.useScreenCoordinates;
  this.alignment = THREE.SpriteAlignment.center.clone();
  this.fog = !1;
  this.uvOffset = new THREE.Vector2(0, 0);
  this.uvScale = new THREE.Vector2(1, 1);
  this.setValues(a);
  a = a || {};
  void 0 === a.depthTest && (this.depthTest = !this.useScreenCoordinates);
  void 0 === a.sizeAttenuation &&
    (this.sizeAttenuation = !this.useScreenCoordinates);
};
THREE.SpriteMaterial.prototype = Object.create(THREE.Material.prototype);
THREE.SpriteMaterial.prototype.clone = function () {
  var a = new THREE.SpriteMaterial();
  THREE.Material.prototype.clone.call(this, a);
  a.color.copy(this.color);
  a.map = this.map;
  a.useScreenCoordinates = this.useScreenCoordinates;
  a.sizeAttenuation = this.sizeAttenuation;
  a.alignment.copy(this.alignment);
  a.uvOffset.copy(this.uvOffset);
  a.uvScale.copy(this.uvScale);
  a.fog = this.fog;
  return a;
};
THREE.SpriteAlignment = {};
THREE.SpriteAlignment.topLeft = new THREE.Vector2(0.5, -0.5);
THREE.SpriteAlignment.topCenter = new THREE.Vector2(0, -0.5);
THREE.SpriteAlignment.topRight = new THREE.Vector2(-0.5, -0.5);
THREE.SpriteAlignment.centerLeft = new THREE.Vector2(0.5, 0);
THREE.SpriteAlignment.center = new THREE.Vector2(0, 0);
THREE.SpriteAlignment.centerRight = new THREE.Vector2(-0.5, 0);
THREE.SpriteAlignment.bottomLeft = new THREE.Vector2(0.5, 0.5);
THREE.SpriteAlignment.bottomCenter = new THREE.Vector2(0, 0.5);
THREE.SpriteAlignment.bottomRight = new THREE.Vector2(-0.5, 0.5);
THREE.SpriteCanvasMaterial = function (a) {
  THREE.Material.call(this);
  this.color = new THREE.Color(16777215);
  this.program = function () {};
  this.setValues(a);
};
THREE.SpriteCanvasMaterial.prototype = Object.create(THREE.Material.prototype);
THREE.SpriteCanvasMaterial.prototype.clone = function () {
  var a = new THREE.SpriteCanvasMaterial();
  THREE.Material.prototype.clone.call(this, a);
  a.color.copy(this.color);
  a.program = this.program;
  return a;
};
THREE.ParticleCanvasMaterial = THREE.SpriteCanvasMaterial;
THREE.Texture = function (a, b, c, d, e, f, h, g, i) {
  this.id = THREE.TextureIdCount++;
  this.uuid = THREE.Math.generateUUID();
  this.name = "";
  this.image = a;
  this.mipmaps = [];
  this.mapping = void 0 !== b ? b : new THREE.UVMapping();
  this.wrapS = void 0 !== c ? c : THREE.ClampToEdgeWrapping;
  this.wrapT = void 0 !== d ? d : THREE.ClampToEdgeWrapping;
  this.magFilter = void 0 !== e ? e : THREE.LinearFilter;
  this.minFilter = void 0 !== f ? f : THREE.LinearMipMapLinearFilter;
  this.anisotropy = void 0 !== i ? i : 1;
  this.format = void 0 !== h ? h : THREE.RGBAFormat;
  this.type = void 0 !== g ? g : THREE.UnsignedByteType;
  this.offset = new THREE.Vector2(0, 0);
  this.repeat = new THREE.Vector2(1, 1);
  this.generateMipmaps = !0;
  this.premultiplyAlpha = !1;
  this.flipY = !0;
  this.unpackAlignment = 4;
  this.needsUpdate = !1;
  this.onUpdate = null;
};
THREE.Texture.prototype = {
  constructor: THREE.Texture,
  clone: function (a) {
    void 0 === a && (a = new THREE.Texture());
    a.image = this.image;
    a.mipmaps = this.mipmaps.slice(0);
    a.mapping = this.mapping;
    a.wrapS = this.wrapS;
    a.wrapT = this.wrapT;
    a.magFilter = this.magFilter;
    a.minFilter = this.minFilter;
    a.anisotropy = this.anisotropy;
    a.format = this.format;
    a.type = this.type;
    a.offset.copy(this.offset);
    a.repeat.copy(this.repeat);
    a.generateMipmaps = this.generateMipmaps;
    a.premultiplyAlpha = this.premultiplyAlpha;
    a.flipY = this.flipY;
    a.unpackAlignment = this.unpackAlignment;
    return a;
  },
  dispose: function () {
    this.dispatchEvent({ type: "dispose" });
  },
};
THREE.EventDispatcher.prototype.apply(THREE.Texture.prototype);
THREE.TextureIdCount = 0;
THREE.CompressedTexture = function (a, b, c, d, e, f, h, g, i, k, m) {
  THREE.Texture.call(this, null, f, h, g, i, k, d, e, m);
  this.image = { width: b, height: c };
  this.mipmaps = a;
  this.generateMipmaps = !1;
};
THREE.CompressedTexture.prototype = Object.create(THREE.Texture.prototype);
THREE.CompressedTexture.prototype.clone = function () {
  var a = new THREE.CompressedTexture();
  THREE.Texture.prototype.clone.call(this, a);
  return a;
};
THREE.DataTexture = function (a, b, c, d, e, f, h, g, i, k, m) {
  THREE.Texture.call(this, null, f, h, g, i, k, d, e, m);
  this.image = { data: a, width: b, height: c };
};
THREE.DataTexture.prototype = Object.create(THREE.Texture.prototype);
THREE.DataTexture.prototype.clone = function () {
  var a = new THREE.DataTexture();
  THREE.Texture.prototype.clone.call(this, a);
  return a;
};
THREE.ParticleSystem = function (a, b) {
  THREE.Object3D.call(this);
  this.geometry = void 0 !== a ? a : new THREE.Geometry();
  this.material =
    void 0 !== b
      ? b
      : new THREE.ParticleSystemMaterial({ color: 16777215 * Math.random() });
  this.frustumCulled = this.sortParticles = !1;
};
THREE.ParticleSystem.prototype = Object.create(THREE.Object3D.prototype);
THREE.ParticleSystem.prototype.clone = function (a) {
  void 0 === a && (a = new THREE.ParticleSystem(this.geometry, this.material));
  a.sortParticles = this.sortParticles;
  THREE.Object3D.prototype.clone.call(this, a);
  return a;
};
THREE.Line = function (a, b, c) {
  THREE.Object3D.call(this);
  this.geometry = void 0 !== a ? a : new THREE.Geometry();
  this.material =
    void 0 !== b
      ? b
      : new THREE.LineBasicMaterial({ color: 16777215 * Math.random() });
  this.type = void 0 !== c ? c : THREE.LineStrip;
};
THREE.LineStrip = 0;
THREE.LinePieces = 1;
THREE.Line.prototype = Object.create(THREE.Object3D.prototype);
THREE.Line.prototype.clone = function (a) {
  void 0 === a && (a = new THREE.Line(this.geometry, this.material, this.type));
  THREE.Object3D.prototype.clone.call(this, a);
  return a;
};
THREE.Mesh = function (a, b) {
  THREE.Object3D.call(this);
  this.geometry = void 0 !== a ? a : new THREE.Geometry();
  this.material =
    void 0 !== b
      ? b
      : new THREE.MeshBasicMaterial({ color: 16777215 * Math.random() });
  this.updateMorphTargets();
};
THREE.Mesh.prototype = Object.create(THREE.Object3D.prototype);
THREE.Mesh.prototype.updateMorphTargets = function () {
  if (0 < this.geometry.morphTargets.length) {
    this.morphTargetBase = -1;
    this.morphTargetForcedOrder = [];
    this.morphTargetInfluences = [];
    this.morphTargetDictionary = {};
    for (var a = 0, b = this.geometry.morphTargets.length; a < b; a++)
      this.morphTargetInfluences.push(0),
        (this.morphTargetDictionary[this.geometry.morphTargets[a].name] = a);
  }
};
THREE.Mesh.prototype.getMorphTargetIndexByName = function (a) {
  if (void 0 !== this.morphTargetDictionary[a])
    return this.morphTargetDictionary[a];
  console.log(
    "THREE.Mesh.getMorphTargetIndexByName: morph target " +
      a +
      " does not exist. Returning 0."
  );
  return 0;
};
THREE.Mesh.prototype.clone = function (a) {
  void 0 === a && (a = new THREE.Mesh(this.geometry, this.material));
  THREE.Object3D.prototype.clone.call(this, a);
  return a;
};
THREE.Bone = function (a) {
  THREE.Object3D.call(this);
  this.skin = a;
  this.skinMatrix = new THREE.Matrix4();
};
THREE.Bone.prototype = Object.create(THREE.Object3D.prototype);
THREE.Bone.prototype.update = function (a, b) {
  this.matrixAutoUpdate && (b |= this.updateMatrix());
  if (b || this.matrixWorldNeedsUpdate)
    a
      ? this.skinMatrix.multiplyMatrices(a, this.matrix)
      : this.skinMatrix.copy(this.matrix),
      (this.matrixWorldNeedsUpdate = !1),
      (b = !0);
  var c,
    d = this.children.length;
  for (c = 0; c < d; c++) this.children[c].update(this.skinMatrix, b);
};
THREE.SkinnedMesh = function (a, b, c) {
  THREE.Mesh.call(this, a, b);
  this.useVertexTexture = void 0 !== c ? c : !0;
  this.identityMatrix = new THREE.Matrix4();
  this.bones = [];
  this.boneMatrices = [];
  var d, e, f;
  if (this.geometry && void 0 !== this.geometry.bones) {
    for (a = 0; a < this.geometry.bones.length; a++)
      (c = this.geometry.bones[a]),
        (d = c.pos),
        (e = c.rotq),
        (f = c.scl),
        (b = this.addBone()),
        (b.name = c.name),
        b.position.set(d[0], d[1], d[2]),
        b.quaternion.set(e[0], e[1], e[2], e[3]),
        void 0 !== f ? b.scale.set(f[0], f[1], f[2]) : b.scale.set(1, 1, 1);
    for (a = 0; a < this.bones.length; a++)
      (c = this.geometry.bones[a]),
        (b = this.bones[a]),
        -1 === c.parent ? this.add(b) : this.bones[c.parent].add(b);
    a = this.bones.length;
    this.useVertexTexture
      ? ((this.boneTextureHeight =
          this.boneTextureWidth =
          a =
            256 < a ? 64 : 64 < a ? 32 : 16 < a ? 16 : 8),
        (this.boneMatrices = new Float32Array(
          4 * this.boneTextureWidth * this.boneTextureHeight
        )),
        (this.boneTexture = new THREE.DataTexture(
          this.boneMatrices,
          this.boneTextureWidth,
          this.boneTextureHeight,
          THREE.RGBAFormat,
          THREE.FloatType
        )),
        (this.boneTexture.minFilter = THREE.NearestFilter),
        (this.boneTexture.magFilter = THREE.NearestFilter),
        (this.boneTexture.generateMipmaps = !1),
        (this.boneTexture.flipY = !1))
      : (this.boneMatrices = new Float32Array(16 * a));
    this.pose();
  }
};
THREE.SkinnedMesh.prototype = Object.create(THREE.Mesh.prototype);
THREE.SkinnedMesh.prototype.addBone = function (a) {
  void 0 === a && (a = new THREE.Bone(this));
  this.bones.push(a);
  return a;
};
THREE.SkinnedMesh.prototype.updateMatrixWorld = (function () {
  var a = new THREE.Matrix4();
  return function (b) {
    this.matrixAutoUpdate && this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || b)
      this.parent
        ? this.matrixWorld.multiplyMatrices(
            this.parent.matrixWorld,
            this.matrix
          )
        : this.matrixWorld.copy(this.matrix),
        (this.matrixWorldNeedsUpdate = !1);
    for (var b = 0, c = this.children.length; b < c; b++) {
      var d = this.children[b];
      d instanceof THREE.Bone
        ? d.update(this.identityMatrix, !1)
        : d.updateMatrixWorld(!0);
    }
    if (void 0 == this.boneInverses) {
      this.boneInverses = [];
      b = 0;
      for (c = this.bones.length; b < c; b++)
        (d = new THREE.Matrix4()),
          d.getInverse(this.bones[b].skinMatrix),
          this.boneInverses.push(d);
    }
    b = 0;
    for (c = this.bones.length; b < c; b++)
      a.multiplyMatrices(this.bones[b].skinMatrix, this.boneInverses[b]),
        a.flattenToArrayOffset(this.boneMatrices, 16 * b);
    this.useVertexTexture && (this.boneTexture.needsUpdate = !0);
  };
})();
THREE.SkinnedMesh.prototype.pose = function () {
  this.updateMatrixWorld(!0);
  this.normalizeSkinWeights();
};
THREE.SkinnedMesh.prototype.normalizeSkinWeights = function () {
  if (this.geometry instanceof THREE.Geometry)
    for (var a = 0; a < this.geometry.skinIndices.length; a++) {
      var b = this.geometry.skinWeights[a],
        c = 1 / b.lengthManhattan();
      Infinity !== c ? b.multiplyScalar(c) : b.set(1);
    }
};
THREE.SkinnedMesh.prototype.clone = function (a) {
  void 0 === a &&
    (a = new THREE.SkinnedMesh(
      this.geometry,
      this.material,
      this.useVertexTexture
    ));
  THREE.Mesh.prototype.clone.call(this, a);
  return a;
};
THREE.MorphAnimMesh = function (a, b) {
  THREE.Mesh.call(this, a, b);
  this.duration = 1e3;
  this.mirroredLoop = !1;
  this.currentKeyframe = this.lastKeyframe = this.time = 0;
  this.direction = 1;
  this.directionBackwards = !1;
  this.setFrameRange(0, this.geometry.morphTargets.length - 1);
};
THREE.MorphAnimMesh.prototype = Object.create(THREE.Mesh.prototype);
THREE.MorphAnimMesh.prototype.setFrameRange = function (a, b) {
  this.startKeyframe = a;
  this.endKeyframe = b;
  this.length = this.endKeyframe - this.startKeyframe + 1;
};
THREE.MorphAnimMesh.prototype.setDirectionForward = function () {
  this.direction = 1;
  this.directionBackwards = !1;
};
THREE.MorphAnimMesh.prototype.setDirectionBackward = function () {
  this.direction = -1;
  this.directionBackwards = !0;
};
THREE.MorphAnimMesh.prototype.parseAnimations = function () {
  var a = this.geometry;
  a.animations || (a.animations = {});
  for (
    var b,
      c = a.animations,
      d = /([a-z]+)(\d+)/,
      e = 0,
      f = a.morphTargets.length;
    e < f;
    e++
  ) {
    var h = a.morphTargets[e].name.match(d);
    if (h && 1 < h.length) {
      h = h[1];
      c[h] || (c[h] = { start: Infinity, end: -Infinity });
      var g = c[h];
      e < g.start && (g.start = e);
      e > g.end && (g.end = e);
      b || (b = h);
    }
  }
  a.firstAnimation = b;
};
THREE.MorphAnimMesh.prototype.setAnimationLabel = function (a, b, c) {
  this.geometry.animations || (this.geometry.animations = {});
  this.geometry.animations[a] = { start: b, end: c };
};
THREE.MorphAnimMesh.prototype.playAnimation = function (a, b) {
  var c = this.geometry.animations[a];
  c
    ? (this.setFrameRange(c.start, c.end),
      (this.duration = 1e3 * ((c.end - c.start) / b)),
      (this.time = 0))
    : console.warn("animation[" + a + "] undefined");
};
THREE.MorphAnimMesh.prototype.updateAnimation = function (a) {
  var b = this.duration / this.length;
  this.time += this.direction * a;
  if (this.mirroredLoop) {
    if (this.time > this.duration || 0 > this.time)
      (this.direction *= -1),
        this.time > this.duration &&
          ((this.time = this.duration), (this.directionBackwards = !0)),
        0 > this.time && ((this.time = 0), (this.directionBackwards = !1));
  } else
    (this.time %= this.duration), 0 > this.time && (this.time += this.duration);
  a =
    this.startKeyframe +
    THREE.Math.clamp(Math.floor(this.time / b), 0, this.length - 1);
  a !== this.currentKeyframe &&
    ((this.morphTargetInfluences[this.lastKeyframe] = 0),
    (this.morphTargetInfluences[this.currentKeyframe] = 1),
    (this.morphTargetInfluences[a] = 0),
    (this.lastKeyframe = this.currentKeyframe),
    (this.currentKeyframe = a));
  b = (this.time % b) / b;
  this.directionBackwards && (b = 1 - b);
  this.morphTargetInfluences[this.currentKeyframe] = b;
  this.morphTargetInfluences[this.lastKeyframe] = 1 - b;
};
THREE.MorphAnimMesh.prototype.clone = function (a) {
  void 0 === a && (a = new THREE.MorphAnimMesh(this.geometry, this.material));
  a.duration = this.duration;
  a.mirroredLoop = this.mirroredLoop;
  a.time = this.time;
  a.lastKeyframe = this.lastKeyframe;
  a.currentKeyframe = this.currentKeyframe;
  a.direction = this.direction;
  a.directionBackwards = this.directionBackwards;
  THREE.Mesh.prototype.clone.call(this, a);
  return a;
};
THREE.LOD = function () {
  THREE.Object3D.call(this);
  this.objects = [];
};
THREE.LOD.prototype = Object.create(THREE.Object3D.prototype);
THREE.LOD.prototype.addLevel = function (a, b) {
  void 0 === b && (b = 0);
  for (
    var b = Math.abs(b), c = 0;
    c < this.objects.length && !(b < this.objects[c].distance);
    c++
  );
  this.objects.splice(c, 0, { distance: b, object: a });
  this.add(a);
};
THREE.LOD.prototype.getObjectForDistance = function (a) {
  for (
    var b = 1, c = this.objects.length;
    b < c && !(a < this.objects[b].distance);
    b++
  );
  return this.objects[b - 1].object;
};
THREE.LOD.prototype.update = (function () {
  var a = new THREE.Vector3(),
    b = new THREE.Vector3();
  return function (c) {
    if (1 < this.objects.length) {
      a.getPositionFromMatrix(c.matrixWorld);
      b.getPositionFromMatrix(this.matrixWorld);
      c = a.distanceTo(b);
      this.objects[0].object.visible = !0;
      for (var d = 1, e = this.objects.length; d < e; d++)
        if (c >= this.objects[d].distance)
          (this.objects[d - 1].object.visible = !1),
            (this.objects[d].object.visible = !0);
        else break;
      for (; d < e; d++) this.objects[d].object.visible = !1;
    }
  };
})();
THREE.LOD.prototype.clone = function () {};
THREE.Sprite = function (a) {
  THREE.Object3D.call(this);
  this.material = void 0 !== a ? a : new THREE.SpriteMaterial();
  this.rotation = 0;
};
THREE.Sprite.prototype = Object.create(THREE.Object3D.prototype);
THREE.Sprite.prototype.updateMatrix = function () {
  this.matrix.compose(this.position, this.quaternion, this.scale);
  this.matrixWorldNeedsUpdate = !0;
};
THREE.Sprite.prototype.clone = function (a) {
  void 0 === a && (a = new THREE.Sprite(this.material));
  THREE.Object3D.prototype.clone.call(this, a);
  return a;
};
THREE.Particle = THREE.Sprite;
THREE.Scene = function () {
  THREE.Object3D.call(this);
  this.overrideMaterial = this.fog = null;
  this.autoUpdate = !0;
  this.matrixAutoUpdate = !1;
  this.__lights = [];
  this.__objectsAdded = [];
  this.__objectsRemoved = [];
};
THREE.Scene.prototype = Object.create(THREE.Object3D.prototype);
THREE.Scene.prototype.__addObject = function (a) {
  if (a instanceof THREE.Light)
    -1 === this.__lights.indexOf(a) && this.__lights.push(a),
      a.target && void 0 === a.target.parent && this.add(a.target);
  else if (!(a instanceof THREE.Camera || a instanceof THREE.Bone)) {
    this.__objectsAdded.push(a);
    var b = this.__objectsRemoved.indexOf(a);
    -1 !== b && this.__objectsRemoved.splice(b, 1);
  }
  for (b = 0; b < a.children.length; b++) this.__addObject(a.children[b]);
};
THREE.Scene.prototype.__removeObject = function (a) {
  if (a instanceof THREE.Light) {
    var b = this.__lights.indexOf(a);
    -1 !== b && this.__lights.splice(b, 1);
    if (a.shadowCascadeArray)
      for (b = 0; b < a.shadowCascadeArray.length; b++)
        this.__removeObject(a.shadowCascadeArray[b]);
  } else
    a instanceof THREE.Camera ||
      (this.__objectsRemoved.push(a),
      (b = this.__objectsAdded.indexOf(a)),
      -1 !== b && this.__objectsAdded.splice(b, 1));
  for (b = 0; b < a.children.length; b++) this.__removeObject(a.children[b]);
};
THREE.Scene.prototype.clone = function (a) {
  void 0 === a && (a = new THREE.Scene());
  THREE.Object3D.prototype.clone.call(this, a);
  null !== this.fog && (a.fog = this.fog.clone());
  null !== this.overrideMaterial &&
    (a.overrideMaterial = this.overrideMaterial.clone());
  a.autoUpdate = this.autoUpdate;
  a.matrixAutoUpdate = this.matrixAutoUpdate;
  return a;
};
THREE.Fog = function (a, b, c) {
  this.name = "";
  this.color = new THREE.Color(a);
  this.near = void 0 !== b ? b : 1;
  this.far = void 0 !== c ? c : 1e3;
};
THREE.Fog.prototype.clone = function () {
  return new THREE.Fog(this.color.getHex(), this.near, this.far);
};
THREE.FogExp2 = function (a, b) {
  this.name = "";
  this.color = new THREE.Color(a);
  this.density = void 0 !== b ? b : 2.5e-4;
};
THREE.FogExp2.prototype.clone = function () {
  return new THREE.FogExp2(this.color.getHex(), this.density);
};
THREE.CanvasRenderer = function (a) {
  function b(a, b, c) {
    for (var d = 0, e = z.length; d < e; d++) {
      var f = z[d];
      La.copy(f.color);
      if (f instanceof THREE.DirectionalLight) {
        var h = ua.getPositionFromMatrix(f.matrixWorld).normalize(),
          g = b.dot(h);
        0 >= g || ((g *= f.intensity), c.add(La.multiplyScalar(g)));
      } else
        f instanceof THREE.PointLight &&
          ((h = ua.getPositionFromMatrix(f.matrixWorld)),
          (g = b.dot(ua.subVectors(h, a).normalize())),
          0 >= g ||
            ((g *=
              0 == f.distance
                ? 1
                : 1 - Math.min(a.distanceTo(h) / f.distance, 1)),
            0 != g && ((g *= f.intensity), c.add(La.multiplyScalar(g)))));
    }
  }
  function c(a, b, c, d) {
    m(b);
    l(c);
    p(d);
    s(a.getStyle());
    C.stroke();
    ra.expandByScalar(2 * b);
  }
  function d(a) {
    t(a.getStyle());
    C.fill();
  }
  function e(a, b, c, e, f, h, g, j, i, k, m, l, p) {
    if (
      !(
        p instanceof THREE.DataTexture ||
        void 0 === p.image ||
        0 == p.image.width
      )
    ) {
      if (!0 === p.needsUpdate) {
        var n = p.wrapS == THREE.RepeatWrapping,
          r = p.wrapT == THREE.RepeatWrapping;
        Ga[p.id] = C.createPattern(
          p.image,
          !0 === n && !0 === r
            ? "repeat"
            : !0 === n && !1 === r
            ? "repeat-x"
            : !1 === n && !0 === r
            ? "repeat-y"
            : "no-repeat"
        );
        p.needsUpdate = !1;
      }
      void 0 === Ga[p.id] ? t("rgba(0,0,0,1)") : t(Ga[p.id]);
      var n = p.offset.x / p.repeat.x,
        r = p.offset.y / p.repeat.y,
        s = p.image.width * p.repeat.x,
        q = p.image.height * p.repeat.y,
        g = (g + n) * s,
        j = (1 - j + r) * q,
        c = c - a,
        e = e - b,
        f = f - a,
        h = h - b,
        i = (i + n) * s - g,
        k = (1 - k + r) * q - j,
        m = (m + n) * s - g,
        l = (1 - l + r) * q - j,
        n = i * l - m * k;
      0 === n
        ? (void 0 === fa[p.id] &&
            ((b = document.createElement("canvas")),
            (b.width = p.image.width),
            (b.height = p.image.height),
            (b = b.getContext("2d")),
            b.drawImage(p.image, 0, 0),
            (fa[p.id] = b.getImageData(
              0,
              0,
              p.image.width,
              p.image.height
            ).data)),
          (b = fa[p.id]),
          (g = 4 * (Math.floor(g) + Math.floor(j) * p.image.width)),
          V.setRGB(b[g] / 255, b[g + 1] / 255, b[g + 2] / 255),
          d(V))
        : ((n = 1 / n),
          (p = (l * c - k * f) * n),
          (k = (l * e - k * h) * n),
          (c = (i * f - m * c) * n),
          (e = (i * h - m * e) * n),
          (a = a - p * g - c * j),
          (g = b - k * g - e * j),
          C.save(),
          C.transform(p, k, c, e, a, g),
          C.fill(),
          C.restore());
    }
  }
  function f(a, b, c, d, e, f, h, g, j, i, k, m, l) {
    var p, n;
    p = l.width - 1;
    n = l.height - 1;
    h *= p;
    g *= n;
    c -= a;
    d -= b;
    e -= a;
    f -= b;
    j = j * p - h;
    i = i * n - g;
    k = k * p - h;
    m = m * n - g;
    n = 1 / (j * m - k * i);
    p = (m * c - i * e) * n;
    i = (m * d - i * f) * n;
    c = (j * e - k * c) * n;
    d = (j * f - k * d) * n;
    a = a - p * h - c * g;
    b = b - i * h - d * g;
    C.save();
    C.transform(p, i, c, d, a, b);
    C.clip();
    C.drawImage(l, 0, 0);
    C.restore();
  }
  function h(a, b, c, d) {
    va[0] = (255 * a.r) | 0;
    va[1] = (255 * a.g) | 0;
    va[2] = (255 * a.b) | 0;
    va[4] = (255 * b.r) | 0;
    va[5] = (255 * b.g) | 0;
    va[6] = (255 * b.b) | 0;
    va[8] = (255 * c.r) | 0;
    va[9] = (255 * c.g) | 0;
    va[10] = (255 * c.b) | 0;
    va[12] = (255 * d.r) | 0;
    va[13] = (255 * d.g) | 0;
    va[14] = (255 * d.b) | 0;
    j.putImageData(Oa, 0, 0);
    Ea.drawImage(Pa, 0, 0);
    return wa;
  }
  function g(a, b, c) {
    var d = b.x - a.x,
      e = b.y - a.y,
      f = d * d + e * e;
    0 !== f &&
      ((c /= Math.sqrt(f)),
      (d *= c),
      (e *= c),
      (b.x += d),
      (b.y += e),
      (a.x -= d),
      (a.y -= e));
  }
  function i(a) {
    y !== a && (y = C.globalAlpha = a);
  }
  function k(a) {
    v !== a &&
      (a === THREE.NormalBlending
        ? (C.globalCompositeOperation = "source-over")
        : a === THREE.AdditiveBlending
        ? (C.globalCompositeOperation = "lighter")
        : a === THREE.SubtractiveBlending &&
          (C.globalCompositeOperation = "darker"),
      (v = a));
  }
  function m(a) {
    J !== a && (J = C.lineWidth = a);
  }
  function l(a) {
    ba !== a && (ba = C.lineCap = a);
  }
  function p(a) {
    oa !== a && (oa = C.lineJoin = a);
  }
  function s(a) {
    G !== a && (G = C.strokeStyle = a);
  }
  function t(a) {
    R !== a && (R = C.fillStyle = a);
  }
  function n(a, b) {
    if (pa !== a || N !== b) C.setLineDash([a, b]), (pa = a), (N = b);
  }
  console.log("THREE.CanvasRenderer", THREE.REVISION);
  var r = THREE.Math.smoothstep,
    a = a || {},
    q = this,
    u,
    w,
    z,
    B = new THREE.Projector(),
    D = void 0 !== a.canvas ? a.canvas : document.createElement("canvas"),
    x = D.width,
    F = D.height,
    A = Math.floor(x / 2),
    O = Math.floor(F / 2),
    C = D.getContext("2d"),
    E = new THREE.Color(0),
    I = 0,
    y = 1,
    v = 0,
    G = null,
    R = null,
    J = null,
    ba = null,
    oa = null,
    pa = null,
    N = 0,
    M,
    Q,
    K,
    ca;
  new THREE.RenderableVertex();
  new THREE.RenderableVertex();
  var Fa,
    Ba,
    da,
    Aa,
    $,
    ea,
    V = new THREE.Color(),
    P = new THREE.Color(),
    Z = new THREE.Color(),
    U = new THREE.Color(),
    ka = new THREE.Color(),
    ta = new THREE.Color(),
    ia = new THREE.Color(),
    La = new THREE.Color(),
    Ga = {},
    fa = {},
    Da,
    Ua,
    Qa,
    xa,
    bb,
    cb,
    Ma,
    fb,
    sb,
    pb,
    Ha = new THREE.Box2(),
    la = new THREE.Box2(),
    ra = new THREE.Box2(),
    gb = new THREE.Color(),
    sa = new THREE.Color(),
    ga = new THREE.Color(),
    ua = new THREE.Vector3(),
    Pa,
    j,
    Oa,
    va,
    wa,
    Ea,
    Ra = 16;
  Pa = document.createElement("canvas");
  Pa.width = Pa.height = 2;
  j = Pa.getContext("2d");
  j.fillStyle = "rgba(0,0,0,1)";
  j.fillRect(0, 0, 2, 2);
  Oa = j.getImageData(0, 0, 2, 2);
  va = Oa.data;
  wa = document.createElement("canvas");
  wa.width = wa.height = Ra;
  Ea = wa.getContext("2d");
  Ea.translate(-Ra / 2, -Ra / 2);
  Ea.scale(Ra, Ra);
  Ra--;
  void 0 === C.setLineDash &&
    (C.setLineDash =
      void 0 !== C.mozDash
        ? function (a) {
            C.mozDash = null !== a[0] ? a : null;
          }
        : function () {});
  this.domElement = D;
  this.devicePixelRatio =
    void 0 !== a.devicePixelRatio
      ? a.devicePixelRatio
      : void 0 !== self.devicePixelRatio
      ? self.devicePixelRatio
      : 1;
  this.sortElements = this.sortObjects = this.autoClear = !0;
  this.info = { render: { vertices: 0, faces: 0 } };
  this.supportsVertexTextures = function () {};
  this.setFaceCulling = function () {};
  this.setSize = function (a, b, c) {
    x = a * this.devicePixelRatio;
    F = b * this.devicePixelRatio;
    A = Math.floor(x / 2);
    O = Math.floor(F / 2);
    D.width = x;
    D.height = F;
    1 !== this.devicePixelRatio &&
      !1 !== c &&
      ((D.style.width = a + "px"), (D.style.height = b + "px"));
    Ha.set(new THREE.Vector2(-A, -O), new THREE.Vector2(A, O));
    la.set(new THREE.Vector2(-A, -O), new THREE.Vector2(A, O));
    y = 1;
    v = 0;
    oa = ba = J = R = G = null;
  };
  this.setClearColor = function (a, b) {
    E.set(a);
    I = void 0 !== b ? b : 1;
    la.set(new THREE.Vector2(-A, -O), new THREE.Vector2(A, O));
  };
  this.setClearColorHex = function (a, b) {
    console.warn(
      "DEPRECATED: .setClearColorHex() is being removed. Use .setClearColor() instead."
    );
    this.setClearColor(a, b);
  };
  this.getMaxAnisotropy = function () {
    return 0;
  };
  this.clear = function () {
    C.setTransform(1, 0, 0, -1, A, O);
    !1 === la.empty() &&
      (la.intersect(Ha),
      la.expandByScalar(2),
      1 > I &&
        C.clearRect(
          la.min.x | 0,
          la.min.y | 0,
          (la.max.x - la.min.x) | 0,
          (la.max.y - la.min.y) | 0
        ),
      0 < I &&
        (k(THREE.NormalBlending),
        i(1),
        t(
          "rgba(" +
            Math.floor(255 * E.r) +
            "," +
            Math.floor(255 * E.g) +
            "," +
            Math.floor(255 * E.b) +
            "," +
            I +
            ")"
        ),
        C.fillRect(
          la.min.x | 0,
          la.min.y | 0,
          (la.max.x - la.min.x) | 0,
          (la.max.y - la.min.y) | 0
        )),
      la.makeEmpty());
  };
  this.render = function (a, j) {
    if (!1 === j instanceof THREE.Camera)
      console.error(
        "THREE.CanvasRenderer.render: camera is not an instance of THREE.Camera."
      );
    else {
      !0 === this.autoClear && this.clear();
      C.setTransform(1, 0, 0, -1, A, O);
      q.info.render.vertices = 0;
      q.info.render.faces = 0;
      u = B.projectScene(a, j, this.sortObjects, this.sortElements);
      w = u.elements;
      z = u.lights;
      M = j;
      gb.setRGB(0, 0, 0);
      sa.setRGB(0, 0, 0);
      ga.setRGB(0, 0, 0);
      for (var D = 0, G = z.length; D < G; D++) {
        var y = z[D],
          F = y.color;
        y instanceof THREE.AmbientLight
          ? gb.add(F)
          : y instanceof THREE.DirectionalLight
          ? sa.add(F)
          : y instanceof THREE.PointLight && ga.add(F);
      }
      D = 0;
      for (G = w.length; D < G; D++) {
        var x = w[D],
          v = x.material;
        if (!(void 0 === v || !1 === v.visible)) {
          ra.makeEmpty();
          if (x instanceof THREE.RenderableSprite) {
            Q = x;
            Q.x *= A;
            Q.y *= O;
            var y = Q,
              F = x,
              J = v;
            i(J.opacity);
            k(J.blending);
            var N = (v = x = void 0),
              E = void 0,
              I = void 0,
              R = void 0,
              ba = void 0;
            J instanceof THREE.SpriteMaterial ||
            J instanceof THREE.ParticleSystemMaterial
              ? void 0 !== J.map.image
                ? ((I = J.map.image),
                  (R = I.width >> 1),
                  (ba = I.height >> 1),
                  (N = F.scale.x * A),
                  (E = F.scale.y * O),
                  (x = N * R),
                  (v = E * ba),
                  ra.min.set(y.x - x, y.y - v),
                  ra.max.set(y.x + x, y.y + v),
                  !1 === Ha.isIntersectionBox(ra)
                    ? ra.makeEmpty()
                    : (C.save(),
                      C.translate(y.x, y.y),
                      C.rotate(-F.rotation),
                      C.scale(N, -E),
                      C.translate(-R, -ba),
                      C.drawImage(I, 0, 0),
                      C.restore()))
                : ((N = F.object.scale.x),
                  (E = F.object.scale.y),
                  (N *= F.scale.x * A),
                  (E *= F.scale.y * O),
                  ra.min.set(y.x - N, y.y - E),
                  ra.max.set(y.x + N, y.y + E),
                  !1 === Ha.isIntersectionBox(ra)
                    ? ra.makeEmpty()
                    : (t(J.color.getStyle()),
                      C.save(),
                      C.translate(y.x, y.y),
                      C.rotate(-F.rotation),
                      C.scale(N, E),
                      C.fillRect(-1, -1, 2, 2),
                      C.restore()))
              : J instanceof THREE.SpriteCanvasMaterial &&
                ((x = F.scale.x * A),
                (v = F.scale.y * O),
                ra.min.set(y.x - x, y.y - v),
                ra.max.set(y.x + x, y.y + v),
                !1 === Ha.isIntersectionBox(ra)
                  ? ra.makeEmpty()
                  : (s(J.color.getStyle()),
                    t(J.color.getStyle()),
                    C.save(),
                    C.translate(y.x, y.y),
                    C.rotate(-F.rotation),
                    C.scale(x, v),
                    J.program(C),
                    C.restore()));
          } else if (x instanceof THREE.RenderableLine) {
            if (
              ((Q = x.v1),
              (K = x.v2),
              (Q.positionScreen.x *= A),
              (Q.positionScreen.y *= O),
              (K.positionScreen.x *= A),
              (K.positionScreen.y *= O),
              ra.setFromPoints([Q.positionScreen, K.positionScreen]),
              !0 === Ha.isIntersectionBox(ra))
            )
              if (
                ((y = Q),
                (F = K),
                (J = x),
                (x = v),
                i(x.opacity),
                k(x.blending),
                C.beginPath(),
                C.moveTo(y.positionScreen.x, y.positionScreen.y),
                C.lineTo(F.positionScreen.x, F.positionScreen.y),
                x instanceof THREE.LineBasicMaterial)
              ) {
                m(x.linewidth);
                l(x.linecap);
                p(x.linejoin);
                if (x.vertexColors !== THREE.VertexColors)
                  s(x.color.getStyle());
                else if (
                  ((v = J.vertexColors[0].getStyle()),
                  (J = J.vertexColors[1].getStyle()),
                  v === J)
                )
                  s(v);
                else {
                  try {
                    var fa = C.createLinearGradient(
                      y.positionScreen.x,
                      y.positionScreen.y,
                      F.positionScreen.x,
                      F.positionScreen.y
                    );
                    fa.addColorStop(0, v);
                    fa.addColorStop(1, J);
                  } catch (oa) {
                    fa = v;
                  }
                  s(fa);
                }
                C.stroke();
                ra.expandByScalar(2 * x.linewidth);
              } else
                x instanceof THREE.LineDashedMaterial &&
                  (m(x.linewidth),
                  l(x.linecap),
                  p(x.linejoin),
                  s(x.color.getStyle()),
                  n(x.dashSize, x.gapSize),
                  C.stroke(),
                  ra.expandByScalar(2 * x.linewidth),
                  n(null, null));
          } else if (x instanceof THREE.RenderableFace3) {
            Q = x.v1;
            K = x.v2;
            ca = x.v3;
            if (-1 > Q.positionScreen.z || 1 < Q.positionScreen.z) continue;
            if (-1 > K.positionScreen.z || 1 < K.positionScreen.z) continue;
            if (-1 > ca.positionScreen.z || 1 < ca.positionScreen.z) continue;
            Q.positionScreen.x *= A;
            Q.positionScreen.y *= O;
            K.positionScreen.x *= A;
            K.positionScreen.y *= O;
            ca.positionScreen.x *= A;
            ca.positionScreen.y *= O;
            0 < v.overdraw &&
              (g(Q.positionScreen, K.positionScreen, v.overdraw),
              g(K.positionScreen, ca.positionScreen, v.overdraw),
              g(ca.positionScreen, Q.positionScreen, v.overdraw));
            ra.setFromPoints([
              Q.positionScreen,
              K.positionScreen,
              ca.positionScreen,
            ]);
            if (!0 === Ha.isIntersectionBox(ra)) {
              y = Q;
              F = K;
              J = ca;
              q.info.render.vertices += 3;
              q.info.render.faces++;
              i(v.opacity);
              k(v.blending);
              Fa = y.positionScreen.x;
              Ba = y.positionScreen.y;
              da = F.positionScreen.x;
              Aa = F.positionScreen.y;
              $ = J.positionScreen.x;
              ea = J.positionScreen.y;
              var N = Fa,
                E = Ba,
                I = da,
                R = Aa,
                ba = $,
                pa = ea;
              C.beginPath();
              C.moveTo(N, E);
              C.lineTo(I, R);
              C.lineTo(ba, pa);
              C.closePath();
              (v instanceof THREE.MeshLambertMaterial ||
                v instanceof THREE.MeshPhongMaterial) &&
              null === v.map
                ? (ta.copy(v.color),
                  ia.copy(v.emissive),
                  v.vertexColors === THREE.FaceColors && ta.multiply(x.color),
                  !1 === v.wireframe &&
                  v.shading == THREE.SmoothShading &&
                  3 == x.vertexNormalsLength
                    ? (P.copy(gb),
                      Z.copy(gb),
                      U.copy(gb),
                      b(x.v1.positionWorld, x.vertexNormalsModel[0], P),
                      b(x.v2.positionWorld, x.vertexNormalsModel[1], Z),
                      b(x.v3.positionWorld, x.vertexNormalsModel[2], U),
                      P.multiply(ta).add(ia),
                      Z.multiply(ta).add(ia),
                      U.multiply(ta).add(ia),
                      ka.addColors(Z, U).multiplyScalar(0.5),
                      (Qa = h(P, Z, U, ka)),
                      f(Fa, Ba, da, Aa, $, ea, 0, 0, 1, 0, 0, 1, Qa))
                    : (V.copy(gb),
                      b(x.centroidModel, x.normalModel, V),
                      V.multiply(ta).add(ia),
                      !0 === v.wireframe
                        ? c(
                            V,
                            v.wireframeLinewidth,
                            v.wireframeLinecap,
                            v.wireframeLinejoin
                          )
                        : d(V)))
                : v instanceof THREE.MeshBasicMaterial ||
                  v instanceof THREE.MeshLambertMaterial ||
                  v instanceof THREE.MeshPhongMaterial
                ? null !== v.map
                  ? v.map.mapping instanceof THREE.UVMapping &&
                    ((xa = x.uvs[0]),
                    e(
                      Fa,
                      Ba,
                      da,
                      Aa,
                      $,
                      ea,
                      xa[0].x,
                      xa[0].y,
                      xa[1].x,
                      xa[1].y,
                      xa[2].x,
                      xa[2].y,
                      v.map
                    ))
                  : null !== v.envMap
                  ? v.envMap.mapping instanceof
                      THREE.SphericalReflectionMapping &&
                    (ua.copy(x.vertexNormalsModelView[0]),
                    (bb = 0.5 * ua.x + 0.5),
                    (cb = 0.5 * ua.y + 0.5),
                    ua.copy(x.vertexNormalsModelView[1]),
                    (Ma = 0.5 * ua.x + 0.5),
                    (fb = 0.5 * ua.y + 0.5),
                    ua.copy(x.vertexNormalsModelView[2]),
                    (sb = 0.5 * ua.x + 0.5),
                    (pb = 0.5 * ua.y + 0.5),
                    e(Fa, Ba, da, Aa, $, ea, bb, cb, Ma, fb, sb, pb, v.envMap))
                  : (V.copy(v.color),
                    v.vertexColors === THREE.FaceColors && V.multiply(x.color),
                    !0 === v.wireframe
                      ? c(
                          V,
                          v.wireframeLinewidth,
                          v.wireframeLinecap,
                          v.wireframeLinejoin
                        )
                      : d(V))
                : v instanceof THREE.MeshDepthMaterial
                ? ((Da = M.near),
                  (Ua = M.far),
                  (P.r =
                    P.g =
                    P.b =
                      1 - r(y.positionScreen.z * y.positionScreen.w, Da, Ua)),
                  (Z.r =
                    Z.g =
                    Z.b =
                      1 - r(F.positionScreen.z * F.positionScreen.w, Da, Ua)),
                  (U.r =
                    U.g =
                    U.b =
                      1 - r(J.positionScreen.z * J.positionScreen.w, Da, Ua)),
                  ka.addColors(Z, U).multiplyScalar(0.5),
                  (Qa = h(P, Z, U, ka)),
                  f(Fa, Ba, da, Aa, $, ea, 0, 0, 1, 0, 0, 1, Qa))
                : v instanceof THREE.MeshNormalMaterial &&
                  ((y = void 0),
                  v.shading == THREE.FlatShading
                    ? ((y = x.normalModelView),
                      V.setRGB(y.x, y.y, y.z)
                        .multiplyScalar(0.5)
                        .addScalar(0.5),
                      !0 === v.wireframe
                        ? c(
                            V,
                            v.wireframeLinewidth,
                            v.wireframeLinecap,
                            v.wireframeLinejoin
                          )
                        : d(V))
                    : v.shading == THREE.SmoothShading &&
                      ((y = x.vertexNormalsModelView[0]),
                      P.setRGB(y.x, y.y, y.z)
                        .multiplyScalar(0.5)
                        .addScalar(0.5),
                      (y = x.vertexNormalsModelView[1]),
                      Z.setRGB(y.x, y.y, y.z)
                        .multiplyScalar(0.5)
                        .addScalar(0.5),
                      (y = x.vertexNormalsModelView[2]),
                      U.setRGB(y.x, y.y, y.z)
                        .multiplyScalar(0.5)
                        .addScalar(0.5),
                      ka.addColors(Z, U).multiplyScalar(0.5),
                      (Qa = h(P, Z, U, ka)),
                      f(Fa, Ba, da, Aa, $, ea, 0, 0, 1, 0, 0, 1, Qa)));
            }
          }
          la.union(ra);
        }
      }
      C.setTransform(1, 0, 0, 1, 0, 0);
    }
  };
};
THREE.ShaderChunk = {
  fog_pars_fragment:
    "#ifdef USE_FOG\nuniform vec3 fogColor;\n#ifdef FOG_EXP2\nuniform float fogDensity;\n#else\nuniform float fogNear;\nuniform float fogFar;\n#endif\n#endif",
  fog_fragment:
    "#ifdef USE_FOG\nfloat depth = gl_FragCoord.z / gl_FragCoord.w;\n#ifdef FOG_EXP2\nconst float LOG2 = 1.442695;\nfloat fogFactor = exp2( - fogDensity * fogDensity * depth * depth * LOG2 );\nfogFactor = 1.0 - clamp( fogFactor, 0.0, 1.0 );\n#else\nfloat fogFactor = smoothstep( fogNear, fogFar, depth );\n#endif\ngl_FragColor = mix( gl_FragColor, vec4( fogColor, gl_FragColor.w ), fogFactor );\n#endif",
  envmap_pars_fragment:
    "#ifdef USE_ENVMAP\nuniform float reflectivity;\nuniform samplerCube envMap;\nuniform float flipEnvMap;\nuniform int combine;\n#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP )\nuniform bool useRefract;\nuniform float refractionRatio;\n#else\nvarying vec3 vReflect;\n#endif\n#endif",
  envmap_fragment:
    "#ifdef USE_ENVMAP\nvec3 reflectVec;\n#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP )\nvec3 cameraToVertex = normalize( vWorldPosition - cameraPosition );\nif ( useRefract ) {\nreflectVec = refract( cameraToVertex, normal, refractionRatio );\n} else { \nreflectVec = reflect( cameraToVertex, normal );\n}\n#else\nreflectVec = vReflect;\n#endif\n#ifdef DOUBLE_SIDED\nfloat flipNormal = ( -1.0 + 2.0 * float( gl_FrontFacing ) );\nvec4 cubeColor = textureCube( envMap, flipNormal * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );\n#else\nvec4 cubeColor = textureCube( envMap, vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );\n#endif\n#ifdef GAMMA_INPUT\ncubeColor.xyz *= cubeColor.xyz;\n#endif\nif ( combine == 1 ) {\ngl_FragColor.xyz = mix( gl_FragColor.xyz, cubeColor.xyz, specularStrength * reflectivity );\n} else if ( combine == 2 ) {\ngl_FragColor.xyz += cubeColor.xyz * specularStrength * reflectivity;\n} else {\ngl_FragColor.xyz = mix( gl_FragColor.xyz, gl_FragColor.xyz * cubeColor.xyz, specularStrength * reflectivity );\n}\n#endif",
  envmap_pars_vertex:
    "#if defined( USE_ENVMAP ) && ! defined( USE_BUMPMAP ) && ! defined( USE_NORMALMAP )\nvarying vec3 vReflect;\nuniform float refractionRatio;\nuniform bool useRefract;\n#endif",
  worldpos_vertex:
    "#if defined( USE_ENVMAP ) || defined( PHONG ) || defined( LAMBERT ) || defined ( USE_SHADOWMAP )\n#ifdef USE_SKINNING\nvec4 worldPosition = modelMatrix * skinned;\n#endif\n#if defined( USE_MORPHTARGETS ) && ! defined( USE_SKINNING )\nvec4 worldPosition = modelMatrix * vec4( morphed, 1.0 );\n#endif\n#if ! defined( USE_MORPHTARGETS ) && ! defined( USE_SKINNING )\nvec4 worldPosition = modelMatrix * vec4( position, 1.0 );\n#endif\n#endif",
  envmap_vertex:
    "#if defined( USE_ENVMAP ) && ! defined( USE_BUMPMAP ) && ! defined( USE_NORMALMAP )\nvec3 worldNormal = mat3( modelMatrix[ 0 ].xyz, modelMatrix[ 1 ].xyz, modelMatrix[ 2 ].xyz ) * objectNormal;\nworldNormal = normalize( worldNormal );\nvec3 cameraToVertex = normalize( worldPosition.xyz - cameraPosition );\nif ( useRefract ) {\nvReflect = refract( cameraToVertex, worldNormal, refractionRatio );\n} else {\nvReflect = reflect( cameraToVertex, worldNormal );\n}\n#endif",
  map_particle_pars_fragment: "#ifdef USE_MAP\nuniform sampler2D map;\n#endif",
  map_particle_fragment:
    "#ifdef USE_MAP\ngl_FragColor = gl_FragColor * texture2D( map, vec2( gl_PointCoord.x, 1.0 - gl_PointCoord.y ) );\n#endif",
  map_pars_vertex:
    "#if defined( USE_MAP ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( USE_SPECULARMAP )\nvarying vec2 vUv;\nuniform vec4 offsetRepeat;\n#endif",
  map_pars_fragment:
    "#if defined( USE_MAP ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( USE_SPECULARMAP )\nvarying vec2 vUv;\n#endif\n#ifdef USE_MAP\nuniform sampler2D map;\n#endif",
  map_vertex:
    "#if defined( USE_MAP ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( USE_SPECULARMAP )\nvUv = uv * offsetRepeat.zw + offsetRepeat.xy;\n#endif",
  map_fragment:
    "#ifdef USE_MAP\nvec4 texelColor = texture2D( map, vUv );\n#ifdef GAMMA_INPUT\ntexelColor.xyz *= texelColor.xyz;\n#endif\ngl_FragColor = gl_FragColor * texelColor;\n#endif",
  lightmap_pars_fragment:
    "#ifdef USE_LIGHTMAP\nvarying vec2 vUv2;\nuniform sampler2D lightMap;\n#endif",
  lightmap_pars_vertex: "#ifdef USE_LIGHTMAP\nvarying vec2 vUv2;\n#endif",
  lightmap_fragment:
    "#ifdef USE_LIGHTMAP\ngl_FragColor = gl_FragColor * texture2D( lightMap, vUv2 );\n#endif",
  lightmap_vertex: "#ifdef USE_LIGHTMAP\nvUv2 = uv2;\n#endif",
  bumpmap_pars_fragment:
    "#ifdef USE_BUMPMAP\nuniform sampler2D bumpMap;\nuniform float bumpScale;\nvec2 dHdxy_fwd() {\nvec2 dSTdx = dFdx( vUv );\nvec2 dSTdy = dFdy( vUv );\nfloat Hll = bumpScale * texture2D( bumpMap, vUv ).x;\nfloat dBx = bumpScale * texture2D( bumpMap, vUv + dSTdx ).x - Hll;\nfloat dBy = bumpScale * texture2D( bumpMap, vUv + dSTdy ).x - Hll;\nreturn vec2( dBx, dBy );\n}\nvec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy ) {\nvec3 vSigmaX = dFdx( surf_pos );\nvec3 vSigmaY = dFdy( surf_pos );\nvec3 vN = surf_norm;\nvec3 R1 = cross( vSigmaY, vN );\nvec3 R2 = cross( vN, vSigmaX );\nfloat fDet = dot( vSigmaX, R1 );\nvec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );\nreturn normalize( abs( fDet ) * surf_norm - vGrad );\n}\n#endif",
  normalmap_pars_fragment:
    "#ifdef USE_NORMALMAP\nuniform sampler2D normalMap;\nuniform vec2 normalScale;\nvec3 perturbNormal2Arb( vec3 eye_pos, vec3 surf_norm ) {\nvec3 q0 = dFdx( eye_pos.xyz );\nvec3 q1 = dFdy( eye_pos.xyz );\nvec2 st0 = dFdx( vUv.st );\nvec2 st1 = dFdy( vUv.st );\nvec3 S = normalize(  q0 * st1.t - q1 * st0.t );\nvec3 T = normalize( -q0 * st1.s + q1 * st0.s );\nvec3 N = normalize( surf_norm );\nvec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;\nmapN.xy = normalScale * mapN.xy;\nmat3 tsn = mat3( S, T, N );\nreturn normalize( tsn * mapN );\n}\n#endif",
  specularmap_pars_fragment:
    "#ifdef USE_SPECULARMAP\nuniform sampler2D specularMap;\n#endif",
  specularmap_fragment:
    "float specularStrength;\n#ifdef USE_SPECULARMAP\nvec4 texelSpecular = texture2D( specularMap, vUv );\nspecularStrength = texelSpecular.r;\n#else\nspecularStrength = 1.0;\n#endif",
  lights_lambert_pars_vertex:
    "uniform vec3 ambient;\nuniform vec3 diffuse;\nuniform vec3 emissive;\nuniform vec3 ambientLightColor;\n#if MAX_DIR_LIGHTS > 0\nuniform vec3 directionalLightColor[ MAX_DIR_LIGHTS ];\nuniform vec3 directionalLightDirection[ MAX_DIR_LIGHTS ];\n#endif\n#if MAX_HEMI_LIGHTS > 0\nuniform vec3 hemisphereLightSkyColor[ MAX_HEMI_LIGHTS ];\nuniform vec3 hemisphereLightGroundColor[ MAX_HEMI_LIGHTS ];\nuniform vec3 hemisphereLightDirection[ MAX_HEMI_LIGHTS ];\n#endif\n#if MAX_POINT_LIGHTS > 0\nuniform vec3 pointLightColor[ MAX_POINT_LIGHTS ];\nuniform vec3 pointLightPosition[ MAX_POINT_LIGHTS ];\nuniform float pointLightDistance[ MAX_POINT_LIGHTS ];\n#endif\n#if MAX_SPOT_LIGHTS > 0\nuniform vec3 spotLightColor[ MAX_SPOT_LIGHTS ];\nuniform vec3 spotLightPosition[ MAX_SPOT_LIGHTS ];\nuniform vec3 spotLightDirection[ MAX_SPOT_LIGHTS ];\nuniform float spotLightDistance[ MAX_SPOT_LIGHTS ];\nuniform float spotLightAngleCos[ MAX_SPOT_LIGHTS ];\nuniform float spotLightExponent[ MAX_SPOT_LIGHTS ];\n#endif\n#ifdef WRAP_AROUND\nuniform vec3 wrapRGB;\n#endif",
  lights_lambert_vertex:
    "vLightFront = vec3( 0.0 );\n#ifdef DOUBLE_SIDED\nvLightBack = vec3( 0.0 );\n#endif\ntransformedNormal = normalize( transformedNormal );\n#if MAX_DIR_LIGHTS > 0\nfor( int i = 0; i < MAX_DIR_LIGHTS; i ++ ) {\nvec4 lDirection = viewMatrix * vec4( directionalLightDirection[ i ], 0.0 );\nvec3 dirVector = normalize( lDirection.xyz );\nfloat dotProduct = dot( transformedNormal, dirVector );\nvec3 directionalLightWeighting = vec3( max( dotProduct, 0.0 ) );\n#ifdef DOUBLE_SIDED\nvec3 directionalLightWeightingBack = vec3( max( -dotProduct, 0.0 ) );\n#ifdef WRAP_AROUND\nvec3 directionalLightWeightingHalfBack = vec3( max( -0.5 * dotProduct + 0.5, 0.0 ) );\n#endif\n#endif\n#ifdef WRAP_AROUND\nvec3 directionalLightWeightingHalf = vec3( max( 0.5 * dotProduct + 0.5, 0.0 ) );\ndirectionalLightWeighting = mix( directionalLightWeighting, directionalLightWeightingHalf, wrapRGB );\n#ifdef DOUBLE_SIDED\ndirectionalLightWeightingBack = mix( directionalLightWeightingBack, directionalLightWeightingHalfBack, wrapRGB );\n#endif\n#endif\nvLightFront += directionalLightColor[ i ] * directionalLightWeighting;\n#ifdef DOUBLE_SIDED\nvLightBack += directionalLightColor[ i ] * directionalLightWeightingBack;\n#endif\n}\n#endif\n#if MAX_POINT_LIGHTS > 0\nfor( int i = 0; i < MAX_POINT_LIGHTS; i ++ ) {\nvec4 lPosition = viewMatrix * vec4( pointLightPosition[ i ], 1.0 );\nvec3 lVector = lPosition.xyz - mvPosition.xyz;\nfloat lDistance = 1.0;\nif ( pointLightDistance[ i ] > 0.0 )\nlDistance = 1.0 - min( ( length( lVector ) / pointLightDistance[ i ] ), 1.0 );\nlVector = normalize( lVector );\nfloat dotProduct = dot( transformedNormal, lVector );\nvec3 pointLightWeighting = vec3( max( dotProduct, 0.0 ) );\n#ifdef DOUBLE_SIDED\nvec3 pointLightWeightingBack = vec3( max( -dotProduct, 0.0 ) );\n#ifdef WRAP_AROUND\nvec3 pointLightWeightingHalfBack = vec3( max( -0.5 * dotProduct + 0.5, 0.0 ) );\n#endif\n#endif\n#ifdef WRAP_AROUND\nvec3 pointLightWeightingHalf = vec3( max( 0.5 * dotProduct + 0.5, 0.0 ) );\npointLightWeighting = mix( pointLightWeighting, pointLightWeightingHalf, wrapRGB );\n#ifdef DOUBLE_SIDED\npointLightWeightingBack = mix( pointLightWeightingBack, pointLightWeightingHalfBack, wrapRGB );\n#endif\n#endif\nvLightFront += pointLightColor[ i ] * pointLightWeighting * lDistance;\n#ifdef DOUBLE_SIDED\nvLightBack += pointLightColor[ i ] * pointLightWeightingBack * lDistance;\n#endif\n}\n#endif\n#if MAX_SPOT_LIGHTS > 0\nfor( int i = 0; i < MAX_SPOT_LIGHTS; i ++ ) {\nvec4 lPosition = viewMatrix * vec4( spotLightPosition[ i ], 1.0 );\nvec3 lVector = lPosition.xyz - mvPosition.xyz;\nfloat spotEffect = dot( spotLightDirection[ i ], normalize( spotLightPosition[ i ] - worldPosition.xyz ) );\nif ( spotEffect > spotLightAngleCos[ i ] ) {\nspotEffect = max( pow( spotEffect, spotLightExponent[ i ] ), 0.0 );\nfloat lDistance = 1.0;\nif ( spotLightDistance[ i ] > 0.0 )\nlDistance = 1.0 - min( ( length( lVector ) / spotLightDistance[ i ] ), 1.0 );\nlVector = normalize( lVector );\nfloat dotProduct = dot( transformedNormal, lVector );\nvec3 spotLightWeighting = vec3( max( dotProduct, 0.0 ) );\n#ifdef DOUBLE_SIDED\nvec3 spotLightWeightingBack = vec3( max( -dotProduct, 0.0 ) );\n#ifdef WRAP_AROUND\nvec3 spotLightWeightingHalfBack = vec3( max( -0.5 * dotProduct + 0.5, 0.0 ) );\n#endif\n#endif\n#ifdef WRAP_AROUND\nvec3 spotLightWeightingHalf = vec3( max( 0.5 * dotProduct + 0.5, 0.0 ) );\nspotLightWeighting = mix( spotLightWeighting, spotLightWeightingHalf, wrapRGB );\n#ifdef DOUBLE_SIDED\nspotLightWeightingBack = mix( spotLightWeightingBack, spotLightWeightingHalfBack, wrapRGB );\n#endif\n#endif\nvLightFront += spotLightColor[ i ] * spotLightWeighting * lDistance * spotEffect;\n#ifdef DOUBLE_SIDED\nvLightBack += spotLightColor[ i ] * spotLightWeightingBack * lDistance * spotEffect;\n#endif\n}\n}\n#endif\n#if MAX_HEMI_LIGHTS > 0\nfor( int i = 0; i < MAX_HEMI_LIGHTS; i ++ ) {\nvec4 lDirection = viewMatrix * vec4( hemisphereLightDirection[ i ], 0.0 );\nvec3 lVector = normalize( lDirection.xyz );\nfloat dotProduct = dot( transformedNormal, lVector );\nfloat hemiDiffuseWeight = 0.5 * dotProduct + 0.5;\nfloat hemiDiffuseWeightBack = -0.5 * dotProduct + 0.5;\nvLightFront += mix( hemisphereLightGroundColor[ i ], hemisphereLightSkyColor[ i ], hemiDiffuseWeight );\n#ifdef DOUBLE_SIDED\nvLightBack += mix( hemisphereLightGroundColor[ i ], hemisphereLightSkyColor[ i ], hemiDiffuseWeightBack );\n#endif\n}\n#endif\nvLightFront = vLightFront * diffuse + ambient * ambientLightColor + emissive;\n#ifdef DOUBLE_SIDED\nvLightBack = vLightBack * diffuse + ambient * ambientLightColor + emissive;\n#endif",
  lights_phong_pars_vertex:
    "#ifndef PHONG_PER_PIXEL\n#if MAX_POINT_LIGHTS > 0\nuniform vec3 pointLightPosition[ MAX_POINT_LIGHTS ];\nuniform float pointLightDistance[ MAX_POINT_LIGHTS ];\nvarying vec4 vPointLight[ MAX_POINT_LIGHTS ];\n#endif\n#if MAX_SPOT_LIGHTS > 0\nuniform vec3 spotLightPosition[ MAX_SPOT_LIGHTS ];\nuniform float spotLightDistance[ MAX_SPOT_LIGHTS ];\nvarying vec4 vSpotLight[ MAX_SPOT_LIGHTS ];\n#endif\n#endif\n#if MAX_SPOT_LIGHTS > 0 || defined( USE_BUMPMAP )\nvarying vec3 vWorldPosition;\n#endif",
  lights_phong_vertex:
    "#ifndef PHONG_PER_PIXEL\n#if MAX_POINT_LIGHTS > 0\nfor( int i = 0; i < MAX_POINT_LIGHTS; i ++ ) {\nvec4 lPosition = viewMatrix * vec4( pointLightPosition[ i ], 1.0 );\nvec3 lVector = lPosition.xyz - mvPosition.xyz;\nfloat lDistance = 1.0;\nif ( pointLightDistance[ i ] > 0.0 )\nlDistance = 1.0 - min( ( length( lVector ) / pointLightDistance[ i ] ), 1.0 );\nvPointLight[ i ] = vec4( lVector, lDistance );\n}\n#endif\n#if MAX_SPOT_LIGHTS > 0\nfor( int i = 0; i < MAX_SPOT_LIGHTS; i ++ ) {\nvec4 lPosition = viewMatrix * vec4( spotLightPosition[ i ], 1.0 );\nvec3 lVector = lPosition.xyz - mvPosition.xyz;\nfloat lDistance = 1.0;\nif ( spotLightDistance[ i ] > 0.0 )\nlDistance = 1.0 - min( ( length( lVector ) / spotLightDistance[ i ] ), 1.0 );\nvSpotLight[ i ] = vec4( lVector, lDistance );\n}\n#endif\n#endif\n#if MAX_SPOT_LIGHTS > 0 || defined( USE_BUMPMAP )\nvWorldPosition = worldPosition.xyz;\n#endif",
  lights_phong_pars_fragment:
    "uniform vec3 ambientLightColor;\n#if MAX_DIR_LIGHTS > 0\nuniform vec3 directionalLightColor[ MAX_DIR_LIGHTS ];\nuniform vec3 directionalLightDirection[ MAX_DIR_LIGHTS ];\n#endif\n#if MAX_HEMI_LIGHTS > 0\nuniform vec3 hemisphereLightSkyColor[ MAX_HEMI_LIGHTS ];\nuniform vec3 hemisphereLightGroundColor[ MAX_HEMI_LIGHTS ];\nuniform vec3 hemisphereLightDirection[ MAX_HEMI_LIGHTS ];\n#endif\n#if MAX_POINT_LIGHTS > 0\nuniform vec3 pointLightColor[ MAX_POINT_LIGHTS ];\n#ifdef PHONG_PER_PIXEL\nuniform vec3 pointLightPosition[ MAX_POINT_LIGHTS ];\nuniform float pointLightDistance[ MAX_POINT_LIGHTS ];\n#else\nvarying vec4 vPointLight[ MAX_POINT_LIGHTS ];\n#endif\n#endif\n#if MAX_SPOT_LIGHTS > 0\nuniform vec3 spotLightColor[ MAX_SPOT_LIGHTS ];\nuniform vec3 spotLightPosition[ MAX_SPOT_LIGHTS ];\nuniform vec3 spotLightDirection[ MAX_SPOT_LIGHTS ];\nuniform float spotLightAngleCos[ MAX_SPOT_LIGHTS ];\nuniform float spotLightExponent[ MAX_SPOT_LIGHTS ];\n#ifdef PHONG_PER_PIXEL\nuniform float spotLightDistance[ MAX_SPOT_LIGHTS ];\n#else\nvarying vec4 vSpotLight[ MAX_SPOT_LIGHTS ];\n#endif\n#endif\n#if MAX_SPOT_LIGHTS > 0 || defined( USE_BUMPMAP )\nvarying vec3 vWorldPosition;\n#endif\n#ifdef WRAP_AROUND\nuniform vec3 wrapRGB;\n#endif\nvarying vec3 vViewPosition;\nvarying vec3 vNormal;",
  lights_phong_fragment:
    "vec3 normal = normalize( vNormal );\nvec3 viewPosition = normalize( vViewPosition );\n#ifdef DOUBLE_SIDED\nnormal = normal * ( -1.0 + 2.0 * float( gl_FrontFacing ) );\n#endif\n#ifdef USE_NORMALMAP\nnormal = perturbNormal2Arb( -vViewPosition, normal );\n#elif defined( USE_BUMPMAP )\nnormal = perturbNormalArb( -vViewPosition, normal, dHdxy_fwd() );\n#endif\n#if MAX_POINT_LIGHTS > 0\nvec3 pointDiffuse  = vec3( 0.0 );\nvec3 pointSpecular = vec3( 0.0 );\nfor ( int i = 0; i < MAX_POINT_LIGHTS; i ++ ) {\n#ifdef PHONG_PER_PIXEL\nvec4 lPosition = viewMatrix * vec4( pointLightPosition[ i ], 1.0 );\nvec3 lVector = lPosition.xyz + vViewPosition.xyz;\nfloat lDistance = 1.0;\nif ( pointLightDistance[ i ] > 0.0 )\nlDistance = 1.0 - min( ( length( lVector ) / pointLightDistance[ i ] ), 1.0 );\nlVector = normalize( lVector );\n#else\nvec3 lVector = normalize( vPointLight[ i ].xyz );\nfloat lDistance = vPointLight[ i ].w;\n#endif\nfloat dotProduct = dot( normal, lVector );\n#ifdef WRAP_AROUND\nfloat pointDiffuseWeightFull = max( dotProduct, 0.0 );\nfloat pointDiffuseWeightHalf = max( 0.5 * dotProduct + 0.5, 0.0 );\nvec3 pointDiffuseWeight = mix( vec3 ( pointDiffuseWeightFull ), vec3( pointDiffuseWeightHalf ), wrapRGB );\n#else\nfloat pointDiffuseWeight = max( dotProduct, 0.0 );\n#endif\npointDiffuse  += diffuse * pointLightColor[ i ] * pointDiffuseWeight * lDistance;\nvec3 pointHalfVector = normalize( lVector + viewPosition );\nfloat pointDotNormalHalf = max( dot( normal, pointHalfVector ), 0.0 );\nfloat pointSpecularWeight = specularStrength * max( pow( pointDotNormalHalf, shininess ), 0.0 );\n#ifdef PHYSICALLY_BASED_SHADING\nfloat specularNormalization = ( shininess + 2.0001 ) / 8.0;\nvec3 schlick = specular + vec3( 1.0 - specular ) * pow( 1.0 - dot( lVector, pointHalfVector ), 5.0 );\npointSpecular += schlick * pointLightColor[ i ] * pointSpecularWeight * pointDiffuseWeight * lDistance * specularNormalization;\n#else\npointSpecular += specular * pointLightColor[ i ] * pointSpecularWeight * pointDiffuseWeight * lDistance;\n#endif\n}\n#endif\n#if MAX_SPOT_LIGHTS > 0\nvec3 spotDiffuse  = vec3( 0.0 );\nvec3 spotSpecular = vec3( 0.0 );\nfor ( int i = 0; i < MAX_SPOT_LIGHTS; i ++ ) {\n#ifdef PHONG_PER_PIXEL\nvec4 lPosition = viewMatrix * vec4( spotLightPosition[ i ], 1.0 );\nvec3 lVector = lPosition.xyz + vViewPosition.xyz;\nfloat lDistance = 1.0;\nif ( spotLightDistance[ i ] > 0.0 )\nlDistance = 1.0 - min( ( length( lVector ) / spotLightDistance[ i ] ), 1.0 );\nlVector = normalize( lVector );\n#else\nvec3 lVector = normalize( vSpotLight[ i ].xyz );\nfloat lDistance = vSpotLight[ i ].w;\n#endif\nfloat spotEffect = dot( spotLightDirection[ i ], normalize( spotLightPosition[ i ] - vWorldPosition ) );\nif ( spotEffect > spotLightAngleCos[ i ] ) {\nspotEffect = max( pow( spotEffect, spotLightExponent[ i ] ), 0.0 );\nfloat dotProduct = dot( normal, lVector );\n#ifdef WRAP_AROUND\nfloat spotDiffuseWeightFull = max( dotProduct, 0.0 );\nfloat spotDiffuseWeightHalf = max( 0.5 * dotProduct + 0.5, 0.0 );\nvec3 spotDiffuseWeight = mix( vec3 ( spotDiffuseWeightFull ), vec3( spotDiffuseWeightHalf ), wrapRGB );\n#else\nfloat spotDiffuseWeight = max( dotProduct, 0.0 );\n#endif\nspotDiffuse += diffuse * spotLightColor[ i ] * spotDiffuseWeight * lDistance * spotEffect;\nvec3 spotHalfVector = normalize( lVector + viewPosition );\nfloat spotDotNormalHalf = max( dot( normal, spotHalfVector ), 0.0 );\nfloat spotSpecularWeight = specularStrength * max( pow( spotDotNormalHalf, shininess ), 0.0 );\n#ifdef PHYSICALLY_BASED_SHADING\nfloat specularNormalization = ( shininess + 2.0001 ) / 8.0;\nvec3 schlick = specular + vec3( 1.0 - specular ) * pow( 1.0 - dot( lVector, spotHalfVector ), 5.0 );\nspotSpecular += schlick * spotLightColor[ i ] * spotSpecularWeight * spotDiffuseWeight * lDistance * specularNormalization * spotEffect;\n#else\nspotSpecular += specular * spotLightColor[ i ] * spotSpecularWeight * spotDiffuseWeight * lDistance * spotEffect;\n#endif\n}\n}\n#endif\n#if MAX_DIR_LIGHTS > 0\nvec3 dirDiffuse  = vec3( 0.0 );\nvec3 dirSpecular = vec3( 0.0 );\nfor( int i = 0; i < MAX_DIR_LIGHTS; i ++ ) {\nvec4 lDirection = viewMatrix * vec4( directionalLightDirection[ i ], 0.0 );\nvec3 dirVector = normalize( lDirection.xyz );\nfloat dotProduct = dot( normal, dirVector );\n#ifdef WRAP_AROUND\nfloat dirDiffuseWeightFull = max( dotProduct, 0.0 );\nfloat dirDiffuseWeightHalf = max( 0.5 * dotProduct + 0.5, 0.0 );\nvec3 dirDiffuseWeight = mix( vec3( dirDiffuseWeightFull ), vec3( dirDiffuseWeightHalf ), wrapRGB );\n#else\nfloat dirDiffuseWeight = max( dotProduct, 0.0 );\n#endif\ndirDiffuse  += diffuse * directionalLightColor[ i ] * dirDiffuseWeight;\nvec3 dirHalfVector = normalize( dirVector + viewPosition );\nfloat dirDotNormalHalf = max( dot( normal, dirHalfVector ), 0.0 );\nfloat dirSpecularWeight = specularStrength * max( pow( dirDotNormalHalf, shininess ), 0.0 );\n#ifdef PHYSICALLY_BASED_SHADING\nfloat specularNormalization = ( shininess + 2.0001 ) / 8.0;\nvec3 schlick = specular + vec3( 1.0 - specular ) * pow( 1.0 - dot( dirVector, dirHalfVector ), 5.0 );\ndirSpecular += schlick * directionalLightColor[ i ] * dirSpecularWeight * dirDiffuseWeight * specularNormalization;\n#else\ndirSpecular += specular * directionalLightColor[ i ] * dirSpecularWeight * dirDiffuseWeight;\n#endif\n}\n#endif\n#if MAX_HEMI_LIGHTS > 0\nvec3 hemiDiffuse  = vec3( 0.0 );\nvec3 hemiSpecular = vec3( 0.0 );\nfor( int i = 0; i < MAX_HEMI_LIGHTS; i ++ ) {\nvec4 lDirection = viewMatrix * vec4( hemisphereLightDirection[ i ], 0.0 );\nvec3 lVector = normalize( lDirection.xyz );\nfloat dotProduct = dot( normal, lVector );\nfloat hemiDiffuseWeight = 0.5 * dotProduct + 0.5;\nvec3 hemiColor = mix( hemisphereLightGroundColor[ i ], hemisphereLightSkyColor[ i ], hemiDiffuseWeight );\nhemiDiffuse += diffuse * hemiColor;\nvec3 hemiHalfVectorSky = normalize( lVector + viewPosition );\nfloat hemiDotNormalHalfSky = 0.5 * dot( normal, hemiHalfVectorSky ) + 0.5;\nfloat hemiSpecularWeightSky = specularStrength * max( pow( hemiDotNormalHalfSky, shininess ), 0.0 );\nvec3 lVectorGround = -lVector;\nvec3 hemiHalfVectorGround = normalize( lVectorGround + viewPosition );\nfloat hemiDotNormalHalfGround = 0.5 * dot( normal, hemiHalfVectorGround ) + 0.5;\nfloat hemiSpecularWeightGround = specularStrength * max( pow( hemiDotNormalHalfGround, shininess ), 0.0 );\n#ifdef PHYSICALLY_BASED_SHADING\nfloat dotProductGround = dot( normal, lVectorGround );\nfloat specularNormalization = ( shininess + 2.0001 ) / 8.0;\nvec3 schlickSky = specular + vec3( 1.0 - specular ) * pow( 1.0 - dot( lVector, hemiHalfVectorSky ), 5.0 );\nvec3 schlickGround = specular + vec3( 1.0 - specular ) * pow( 1.0 - dot( lVectorGround, hemiHalfVectorGround ), 5.0 );\nhemiSpecular += hemiColor * specularNormalization * ( schlickSky * hemiSpecularWeightSky * max( dotProduct, 0.0 ) + schlickGround * hemiSpecularWeightGround * max( dotProductGround, 0.0 ) );\n#else\nhemiSpecular += specular * hemiColor * ( hemiSpecularWeightSky + hemiSpecularWeightGround ) * hemiDiffuseWeight;\n#endif\n}\n#endif\nvec3 totalDiffuse = vec3( 0.0 );\nvec3 totalSpecular = vec3( 0.0 );\n#if MAX_DIR_LIGHTS > 0\ntotalDiffuse += dirDiffuse;\ntotalSpecular += dirSpecular;\n#endif\n#if MAX_HEMI_LIGHTS > 0\ntotalDiffuse += hemiDiffuse;\ntotalSpecular += hemiSpecular;\n#endif\n#if MAX_POINT_LIGHTS > 0\ntotalDiffuse += pointDiffuse;\ntotalSpecular += pointSpecular;\n#endif\n#if MAX_SPOT_LIGHTS > 0\ntotalDiffuse += spotDiffuse;\ntotalSpecular += spotSpecular;\n#endif\n#ifdef METAL\ngl_FragColor.xyz = gl_FragColor.xyz * ( emissive + totalDiffuse + ambientLightColor * ambient + totalSpecular );\n#else\ngl_FragColor.xyz = gl_FragColor.xyz * ( emissive + totalDiffuse + ambientLightColor * ambient ) + totalSpecular;\n#endif",
  color_pars_fragment: "#ifdef USE_COLOR\nvarying vec3 vColor;\n#endif",
  color_fragment:
    "#ifdef USE_COLOR\ngl_FragColor = gl_FragColor * vec4( vColor, 1.0 );\n#endif",
  color_pars_vertex: "#ifdef USE_COLOR\nvarying vec3 vColor;\n#endif",
  color_vertex:
    "#ifdef USE_COLOR\n#ifdef GAMMA_INPUT\nvColor = color * color;\n#else\nvColor = color;\n#endif\n#endif",
  skinning_pars_vertex:
    "#ifdef USE_SKINNING\n#ifdef BONE_TEXTURE\nuniform sampler2D boneTexture;\nuniform int boneTextureWidth;\nuniform int boneTextureHeight;\nmat4 getBoneMatrix( const in float i ) {\nfloat j = i * 4.0;\nfloat x = mod( j, float( boneTextureWidth ) );\nfloat y = floor( j / float( boneTextureWidth ) );\nfloat dx = 1.0 / float( boneTextureWidth );\nfloat dy = 1.0 / float( boneTextureHeight );\ny = dy * ( y + 0.5 );\nvec4 v1 = texture2D( boneTexture, vec2( dx * ( x + 0.5 ), y ) );\nvec4 v2 = texture2D( boneTexture, vec2( dx * ( x + 1.5 ), y ) );\nvec4 v3 = texture2D( boneTexture, vec2( dx * ( x + 2.5 ), y ) );\nvec4 v4 = texture2D( boneTexture, vec2( dx * ( x + 3.5 ), y ) );\nmat4 bone = mat4( v1, v2, v3, v4 );\nreturn bone;\n}\n#else\nuniform mat4 boneGlobalMatrices[ MAX_BONES ];\nmat4 getBoneMatrix( const in float i ) {\nmat4 bone = boneGlobalMatrices[ int(i) ];\nreturn bone;\n}\n#endif\n#endif",
  skinbase_vertex:
    "#ifdef USE_SKINNING\nmat4 boneMatX = getBoneMatrix( skinIndex.x );\nmat4 boneMatY = getBoneMatrix( skinIndex.y );\n#endif",
  skinning_vertex:
    "#ifdef USE_SKINNING\n#ifdef USE_MORPHTARGETS\nvec4 skinVertex = vec4( morphed, 1.0 );\n#else\nvec4 skinVertex = vec4( position, 1.0 );\n#endif\nvec4 skinned  = boneMatX * skinVertex * skinWeight.x;\nskinned \t  += boneMatY * skinVertex * skinWeight.y;\n#endif",
  morphtarget_pars_vertex:
    "#ifdef USE_MORPHTARGETS\n#ifndef USE_MORPHNORMALS\nuniform float morphTargetInfluences[ 8 ];\n#else\nuniform float morphTargetInfluences[ 4 ];\n#endif\n#endif",
  morphtarget_vertex:
    "#ifdef USE_MORPHTARGETS\nvec3 morphed = vec3( 0.0 );\nmorphed += ( morphTarget0 - position ) * morphTargetInfluences[ 0 ];\nmorphed += ( morphTarget1 - position ) * morphTargetInfluences[ 1 ];\nmorphed += ( morphTarget2 - position ) * morphTargetInfluences[ 2 ];\nmorphed += ( morphTarget3 - position ) * morphTargetInfluences[ 3 ];\n#ifndef USE_MORPHNORMALS\nmorphed += ( morphTarget4 - position ) * morphTargetInfluences[ 4 ];\nmorphed += ( morphTarget5 - position ) * morphTargetInfluences[ 5 ];\nmorphed += ( morphTarget6 - position ) * morphTargetInfluences[ 6 ];\nmorphed += ( morphTarget7 - position ) * morphTargetInfluences[ 7 ];\n#endif\nmorphed += position;\n#endif",
  default_vertex:
    "vec4 mvPosition;\n#ifdef USE_SKINNING\nmvPosition = modelViewMatrix * skinned;\n#endif\n#if !defined( USE_SKINNING ) && defined( USE_MORPHTARGETS )\nmvPosition = modelViewMatrix * vec4( morphed, 1.0 );\n#endif\n#if !defined( USE_SKINNING ) && ! defined( USE_MORPHTARGETS )\nmvPosition = modelViewMatrix * vec4( position, 1.0 );\n#endif\ngl_Position = projectionMatrix * mvPosition;",
  morphnormal_vertex:
    "#ifdef USE_MORPHNORMALS\nvec3 morphedNormal = vec3( 0.0 );\nmorphedNormal +=  ( morphNormal0 - normal ) * morphTargetInfluences[ 0 ];\nmorphedNormal +=  ( morphNormal1 - normal ) * morphTargetInfluences[ 1 ];\nmorphedNormal +=  ( morphNormal2 - normal ) * morphTargetInfluences[ 2 ];\nmorphedNormal +=  ( morphNormal3 - normal ) * morphTargetInfluences[ 3 ];\nmorphedNormal += normal;\n#endif",
  skinnormal_vertex:
    "#ifdef USE_SKINNING\nmat4 skinMatrix = skinWeight.x * boneMatX;\nskinMatrix \t+= skinWeight.y * boneMatY;\n#ifdef USE_MORPHNORMALS\nvec4 skinnedNormal = skinMatrix * vec4( morphedNormal, 0.0 );\n#else\nvec4 skinnedNormal = skinMatrix * vec4( normal, 0.0 );\n#endif\n#endif",
  defaultnormal_vertex:
    "vec3 objectNormal;\n#ifdef USE_SKINNING\nobjectNormal = skinnedNormal.xyz;\n#endif\n#if !defined( USE_SKINNING ) && defined( USE_MORPHNORMALS )\nobjectNormal = morphedNormal;\n#endif\n#if !defined( USE_SKINNING ) && ! defined( USE_MORPHNORMALS )\nobjectNormal = normal;\n#endif\n#ifdef FLIP_SIDED\nobjectNormal = -objectNormal;\n#endif\nvec3 transformedNormal = normalMatrix * objectNormal;",
  shadowmap_pars_fragment:
    "#ifdef USE_SHADOWMAP\nuniform sampler2D shadowMap[ MAX_SHADOWS ];\nuniform vec2 shadowMapSize[ MAX_SHADOWS ];\nuniform float shadowDarkness[ MAX_SHADOWS ];\nuniform float shadowBias[ MAX_SHADOWS ];\nvarying vec4 vShadowCoord[ MAX_SHADOWS ];\nfloat unpackDepth( const in vec4 rgba_depth ) {\nconst vec4 bit_shift = vec4( 1.0 / ( 256.0 * 256.0 * 256.0 ), 1.0 / ( 256.0 * 256.0 ), 1.0 / 256.0, 1.0 );\nfloat depth = dot( rgba_depth, bit_shift );\nreturn depth;\n}\n#endif",
  shadowmap_fragment:
    "#ifdef USE_SHADOWMAP\n#ifdef SHADOWMAP_DEBUG\nvec3 frustumColors[3];\nfrustumColors[0] = vec3( 1.0, 0.5, 0.0 );\nfrustumColors[1] = vec3( 0.0, 1.0, 0.8 );\nfrustumColors[2] = vec3( 0.0, 0.5, 1.0 );\n#endif\n#ifdef SHADOWMAP_CASCADE\nint inFrustumCount = 0;\n#endif\nfloat fDepth;\nvec3 shadowColor = vec3( 1.0 );\nfor( int i = 0; i < MAX_SHADOWS; i ++ ) {\nvec3 shadowCoord = vShadowCoord[ i ].xyz / vShadowCoord[ i ].w;\nbvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );\nbool inFrustum = all( inFrustumVec );\n#ifdef SHADOWMAP_CASCADE\ninFrustumCount += int( inFrustum );\nbvec3 frustumTestVec = bvec3( inFrustum, inFrustumCount == 1, shadowCoord.z <= 1.0 );\n#else\nbvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );\n#endif\nbool frustumTest = all( frustumTestVec );\nif ( frustumTest ) {\nshadowCoord.z += shadowBias[ i ];\n#if defined( SHADOWMAP_TYPE_PCF )\nfloat shadow = 0.0;\nconst float shadowDelta = 1.0 / 9.0;\nfloat xPixelOffset = 1.0 / shadowMapSize[ i ].x;\nfloat yPixelOffset = 1.0 / shadowMapSize[ i ].y;\nfloat dx0 = -1.25 * xPixelOffset;\nfloat dy0 = -1.25 * yPixelOffset;\nfloat dx1 = 1.25 * xPixelOffset;\nfloat dy1 = 1.25 * yPixelOffset;\nfDepth = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx0, dy0 ) ) );\nif ( fDepth < shadowCoord.z ) shadow += shadowDelta;\nfDepth = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( 0.0, dy0 ) ) );\nif ( fDepth < shadowCoord.z ) shadow += shadowDelta;\nfDepth = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx1, dy0 ) ) );\nif ( fDepth < shadowCoord.z ) shadow += shadowDelta;\nfDepth = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx0, 0.0 ) ) );\nif ( fDepth < shadowCoord.z ) shadow += shadowDelta;\nfDepth = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy ) );\nif ( fDepth < shadowCoord.z ) shadow += shadowDelta;\nfDepth = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx1, 0.0 ) ) );\nif ( fDepth < shadowCoord.z ) shadow += shadowDelta;\nfDepth = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx0, dy1 ) ) );\nif ( fDepth < shadowCoord.z ) shadow += shadowDelta;\nfDepth = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( 0.0, dy1 ) ) );\nif ( fDepth < shadowCoord.z ) shadow += shadowDelta;\nfDepth = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx1, dy1 ) ) );\nif ( fDepth < shadowCoord.z ) shadow += shadowDelta;\nshadowColor = shadowColor * vec3( ( 1.0 - shadowDarkness[ i ] * shadow ) );\n#elif defined( SHADOWMAP_TYPE_PCF_SOFT )\nfloat shadow = 0.0;\nfloat xPixelOffset = 1.0 / shadowMapSize[ i ].x;\nfloat yPixelOffset = 1.0 / shadowMapSize[ i ].y;\nfloat dx0 = -1.0 * xPixelOffset;\nfloat dy0 = -1.0 * yPixelOffset;\nfloat dx1 = 1.0 * xPixelOffset;\nfloat dy1 = 1.0 * yPixelOffset;\nmat3 shadowKernel;\nmat3 depthKernel;\ndepthKernel[0][0] = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx0, dy0 ) ) );\ndepthKernel[0][1] = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx0, 0.0 ) ) );\ndepthKernel[0][2] = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx0, dy1 ) ) );\ndepthKernel[1][0] = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( 0.0, dy0 ) ) );\ndepthKernel[1][1] = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy ) );\ndepthKernel[1][2] = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( 0.0, dy1 ) ) );\ndepthKernel[2][0] = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx1, dy0 ) ) );\ndepthKernel[2][1] = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx1, 0.0 ) ) );\ndepthKernel[2][2] = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy + vec2( dx1, dy1 ) ) );\nvec3 shadowZ = vec3( shadowCoord.z );\nshadowKernel[0] = vec3(lessThan(depthKernel[0], shadowZ ));\nshadowKernel[0] *= vec3(0.25);\nshadowKernel[1] = vec3(lessThan(depthKernel[1], shadowZ ));\nshadowKernel[1] *= vec3(0.25);\nshadowKernel[2] = vec3(lessThan(depthKernel[2], shadowZ ));\nshadowKernel[2] *= vec3(0.25);\nvec2 fractionalCoord = 1.0 - fract( shadowCoord.xy * shadowMapSize[i].xy );\nshadowKernel[0] = mix( shadowKernel[1], shadowKernel[0], fractionalCoord.x );\nshadowKernel[1] = mix( shadowKernel[2], shadowKernel[1], fractionalCoord.x );\nvec4 shadowValues;\nshadowValues.x = mix( shadowKernel[0][1], shadowKernel[0][0], fractionalCoord.y );\nshadowValues.y = mix( shadowKernel[0][2], shadowKernel[0][1], fractionalCoord.y );\nshadowValues.z = mix( shadowKernel[1][1], shadowKernel[1][0], fractionalCoord.y );\nshadowValues.w = mix( shadowKernel[1][2], shadowKernel[1][1], fractionalCoord.y );\nshadow = dot( shadowValues, vec4( 1.0 ) );\nshadowColor = shadowColor * vec3( ( 1.0 - shadowDarkness[ i ] * shadow ) );\n#else\nvec4 rgbaDepth = texture2D( shadowMap[ i ], shadowCoord.xy );\nfloat fDepth = unpackDepth( rgbaDepth );\nif ( fDepth < shadowCoord.z )\nshadowColor = shadowColor * vec3( 1.0 - shadowDarkness[ i ] );\n#endif\n}\n#ifdef SHADOWMAP_DEBUG\n#ifdef SHADOWMAP_CASCADE\nif ( inFrustum && inFrustumCount == 1 ) gl_FragColor.xyz *= frustumColors[ i ];\n#else\nif ( inFrustum ) gl_FragColor.xyz *= frustumColors[ i ];\n#endif\n#endif\n}\n#ifdef GAMMA_OUTPUT\nshadowColor *= shadowColor;\n#endif\ngl_FragColor.xyz = gl_FragColor.xyz * shadowColor;\n#endif",
  shadowmap_pars_vertex:
    "#ifdef USE_SHADOWMAP\nvarying vec4 vShadowCoord[ MAX_SHADOWS ];\nuniform mat4 shadowMatrix[ MAX_SHADOWS ];\n#endif",
  shadowmap_vertex:
    "#ifdef USE_SHADOWMAP\nfor( int i = 0; i < MAX_SHADOWS; i ++ ) {\nvShadowCoord[ i ] = shadowMatrix[ i ] * worldPosition;\n}\n#endif",
  alphatest_fragment:
    "#ifdef ALPHATEST\nif ( gl_FragColor.a < ALPHATEST ) discard;\n#endif",
  linear_to_gamma_fragment:
    "#ifdef GAMMA_OUTPUT\ngl_FragColor.xyz = sqrt( gl_FragColor.xyz );\n#endif",
};
THREE.UniformsUtils = {
  merge: function (a) {
    var b,
      c,
      d,
      e = {};
    for (b = 0; b < a.length; b++)
      for (c in ((d = this.clone(a[b])), d)) e[c] = d[c];
    return e;
  },
  clone: function (a) {
    var b,
      c,
      d,
      e = {};
    for (b in a)
      for (c in ((e[b] = {}), a[b]))
        (d = a[b][c]),
          (e[b][c] =
            d instanceof THREE.Color ||
            d instanceof THREE.Vector2 ||
            d instanceof THREE.Vector3 ||
            d instanceof THREE.Vector4 ||
            d instanceof THREE.Matrix4 ||
            d instanceof THREE.Texture
              ? d.clone()
              : d instanceof Array
              ? d.slice()
              : d);
    return e;
  },
};
THREE.UniformsLib = {
  common: {
    diffuse: { type: "c", value: new THREE.Color(15658734) },
    opacity: { type: "f", value: 1 },
    map: { type: "t", value: null },
    offsetRepeat: { type: "v4", value: new THREE.Vector4(0, 0, 1, 1) },
    lightMap: { type: "t", value: null },
    specularMap: { type: "t", value: null },
    envMap: { type: "t", value: null },
    flipEnvMap: { type: "f", value: -1 },
    useRefract: { type: "i", value: 0 },
    reflectivity: { type: "f", value: 1 },
    refractionRatio: { type: "f", value: 0.98 },
    combine: { type: "i", value: 0 },
    morphTargetInfluences: { type: "f", value: 0 },
  },
  bump: {
    bumpMap: { type: "t", value: null },
    bumpScale: { type: "f", value: 1 },
  },
  normalmap: {
    normalMap: { type: "t", value: null },
    normalScale: { type: "v2", value: new THREE.Vector2(1, 1) },
  },
  fog: {
    fogDensity: { type: "f", value: 2.5e-4 },
    fogNear: { type: "f", value: 1 },
    fogFar: { type: "f", value: 2e3 },
    fogColor: { type: "c", value: new THREE.Color(16777215) },
  },
  lights: {
    ambientLightColor: { type: "fv", value: [] },
    directionalLightDirection: { type: "fv", value: [] },
    directionalLightColor: { type: "fv", value: [] },
    hemisphereLightDirection: { type: "fv", value: [] },
    hemisphereLightSkyColor: { type: "fv", value: [] },
    hemisphereLightGroundColor: { type: "fv", value: [] },
    pointLightColor: { type: "fv", value: [] },
    pointLightPosition: { type: "fv", value: [] },
    pointLightDistance: { type: "fv1", value: [] },
    spotLightColor: { type: "fv", value: [] },
    spotLightPosition: { type: "fv", value: [] },
    spotLightDirection: { type: "fv", value: [] },
    spotLightDistance: { type: "fv1", value: [] },
    spotLightAngleCos: { type: "fv1", value: [] },
    spotLightExponent: { type: "fv1", value: [] },
  },
  particle: {
    psColor: { type: "c", value: new THREE.Color(15658734) },
    opacity: { type: "f", value: 1 },
    size: { type: "f", value: 1 },
    scale: { type: "f", value: 1 },
    map: { type: "t", value: null },
    fogDensity: { type: "f", value: 2.5e-4 },
    fogNear: { type: "f", value: 1 },
    fogFar: { type: "f", value: 2e3 },
    fogColor: { type: "c", value: new THREE.Color(16777215) },
  },
  shadowmap: {
    shadowMap: { type: "tv", value: [] },
    shadowMapSize: { type: "v2v", value: [] },
    shadowBias: { type: "fv1", value: [] },
    shadowDarkness: { type: "fv1", value: [] },
    shadowMatrix: { type: "m4v", value: [] },
  },
};
THREE.ShaderLib = {
  basic: {
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.common,
      THREE.UniformsLib.fog,
      THREE.UniformsLib.shadowmap,
    ]),
    vertexShader: [
      THREE.ShaderChunk.map_pars_vertex,
      THREE.ShaderChunk.lightmap_pars_vertex,
      THREE.ShaderChunk.envmap_pars_vertex,
      THREE.ShaderChunk.color_pars_vertex,
      THREE.ShaderChunk.morphtarget_pars_vertex,
      THREE.ShaderChunk.skinning_pars_vertex,
      THREE.ShaderChunk.shadowmap_pars_vertex,
      "void main() {",
      THREE.ShaderChunk.map_vertex,
      THREE.ShaderChunk.lightmap_vertex,
      THREE.ShaderChunk.color_vertex,
      THREE.ShaderChunk.skinbase_vertex,
      "#ifdef USE_ENVMAP",
      THREE.ShaderChunk.morphnormal_vertex,
      THREE.ShaderChunk.skinnormal_vertex,
      THREE.ShaderChunk.defaultnormal_vertex,
      "#endif",
      THREE.ShaderChunk.morphtarget_vertex,
      THREE.ShaderChunk.skinning_vertex,
      THREE.ShaderChunk.default_vertex,
      THREE.ShaderChunk.worldpos_vertex,
      THREE.ShaderChunk.envmap_vertex,
      THREE.ShaderChunk.shadowmap_vertex,
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform vec3 diffuse;\nuniform float opacity;",
      THREE.ShaderChunk.color_pars_fragment,
      THREE.ShaderChunk.map_pars_fragment,
      THREE.ShaderChunk.lightmap_pars_fragment,
      THREE.ShaderChunk.envmap_pars_fragment,
      THREE.ShaderChunk.fog_pars_fragment,
      THREE.ShaderChunk.shadowmap_pars_fragment,
      THREE.ShaderChunk.specularmap_pars_fragment,
      "void main() {\ngl_FragColor = vec4( diffuse, opacity );",
      THREE.ShaderChunk.map_fragment,
      THREE.ShaderChunk.alphatest_fragment,
      THREE.ShaderChunk.specularmap_fragment,
      THREE.ShaderChunk.lightmap_fragment,
      THREE.ShaderChunk.color_fragment,
      THREE.ShaderChunk.envmap_fragment,
      THREE.ShaderChunk.shadowmap_fragment,
      THREE.ShaderChunk.linear_to_gamma_fragment,
      THREE.ShaderChunk.fog_fragment,
      "}",
    ].join("\n"),
  },
  lambert: {
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.common,
      THREE.UniformsLib.fog,
      THREE.UniformsLib.lights,
      THREE.UniformsLib.shadowmap,
      {
        ambient: { type: "c", value: new THREE.Color(16777215) },
        emissive: { type: "c", value: new THREE.Color(0) },
        wrapRGB: { type: "v3", value: new THREE.Vector3(1, 1, 1) },
      },
    ]),
    vertexShader: [
      "#define LAMBERT\nvarying vec3 vLightFront;\n#ifdef DOUBLE_SIDED\nvarying vec3 vLightBack;\n#endif",
      THREE.ShaderChunk.map_pars_vertex,
      THREE.ShaderChunk.lightmap_pars_vertex,
      THREE.ShaderChunk.envmap_pars_vertex,
      THREE.ShaderChunk.lights_lambert_pars_vertex,
      THREE.ShaderChunk.color_pars_vertex,
      THREE.ShaderChunk.morphtarget_pars_vertex,
      THREE.ShaderChunk.skinning_pars_vertex,
      THREE.ShaderChunk.shadowmap_pars_vertex,
      "void main() {",
      THREE.ShaderChunk.map_vertex,
      THREE.ShaderChunk.lightmap_vertex,
      THREE.ShaderChunk.color_vertex,
      THREE.ShaderChunk.morphnormal_vertex,
      THREE.ShaderChunk.skinbase_vertex,
      THREE.ShaderChunk.skinnormal_vertex,
      THREE.ShaderChunk.defaultnormal_vertex,
      THREE.ShaderChunk.morphtarget_vertex,
      THREE.ShaderChunk.skinning_vertex,
      THREE.ShaderChunk.default_vertex,
      THREE.ShaderChunk.worldpos_vertex,
      THREE.ShaderChunk.envmap_vertex,
      THREE.ShaderChunk.lights_lambert_vertex,
      THREE.ShaderChunk.shadowmap_vertex,
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform float opacity;\nvarying vec3 vLightFront;\n#ifdef DOUBLE_SIDED\nvarying vec3 vLightBack;\n#endif",
      THREE.ShaderChunk.color_pars_fragment,
      THREE.ShaderChunk.map_pars_fragment,
      THREE.ShaderChunk.lightmap_pars_fragment,
      THREE.ShaderChunk.envmap_pars_fragment,
      THREE.ShaderChunk.fog_pars_fragment,
      THREE.ShaderChunk.shadowmap_pars_fragment,
      THREE.ShaderChunk.specularmap_pars_fragment,
      "void main() {\ngl_FragColor = vec4( vec3 ( 1.0 ), opacity );",
      THREE.ShaderChunk.map_fragment,
      THREE.ShaderChunk.alphatest_fragment,
      THREE.ShaderChunk.specularmap_fragment,
      "#ifdef DOUBLE_SIDED\nif ( gl_FrontFacing )\ngl_FragColor.xyz *= vLightFront;\nelse\ngl_FragColor.xyz *= vLightBack;\n#else\ngl_FragColor.xyz *= vLightFront;\n#endif",
      THREE.ShaderChunk.lightmap_fragment,
      THREE.ShaderChunk.color_fragment,
      THREE.ShaderChunk.envmap_fragment,
      THREE.ShaderChunk.shadowmap_fragment,
      THREE.ShaderChunk.linear_to_gamma_fragment,
      THREE.ShaderChunk.fog_fragment,
      "}",
    ].join("\n"),
  },
  phong: {
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.common,
      THREE.UniformsLib.bump,
      THREE.UniformsLib.normalmap,
      THREE.UniformsLib.fog,
      THREE.UniformsLib.lights,
      THREE.UniformsLib.shadowmap,
      {
        ambient: { type: "c", value: new THREE.Color(16777215) },
        emissive: { type: "c", value: new THREE.Color(0) },
        specular: { type: "c", value: new THREE.Color(1118481) },
        shininess: { type: "f", value: 30 },
        wrapRGB: { type: "v3", value: new THREE.Vector3(1, 1, 1) },
      },
    ]),
    vertexShader: [
      "#define PHONG\nvarying vec3 vViewPosition;\nvarying vec3 vNormal;",
      THREE.ShaderChunk.map_pars_vertex,
      THREE.ShaderChunk.lightmap_pars_vertex,
      THREE.ShaderChunk.envmap_pars_vertex,
      THREE.ShaderChunk.lights_phong_pars_vertex,
      THREE.ShaderChunk.color_pars_vertex,
      THREE.ShaderChunk.morphtarget_pars_vertex,
      THREE.ShaderChunk.skinning_pars_vertex,
      THREE.ShaderChunk.shadowmap_pars_vertex,
      "void main() {",
      THREE.ShaderChunk.map_vertex,
      THREE.ShaderChunk.lightmap_vertex,
      THREE.ShaderChunk.color_vertex,
      THREE.ShaderChunk.morphnormal_vertex,
      THREE.ShaderChunk.skinbase_vertex,
      THREE.ShaderChunk.skinnormal_vertex,
      THREE.ShaderChunk.defaultnormal_vertex,
      "vNormal = normalize( transformedNormal );",
      THREE.ShaderChunk.morphtarget_vertex,
      THREE.ShaderChunk.skinning_vertex,
      THREE.ShaderChunk.default_vertex,
      "vViewPosition = -mvPosition.xyz;",
      THREE.ShaderChunk.worldpos_vertex,
      THREE.ShaderChunk.envmap_vertex,
      THREE.ShaderChunk.lights_phong_vertex,
      THREE.ShaderChunk.shadowmap_vertex,
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform vec3 diffuse;\nuniform float opacity;\nuniform vec3 ambient;\nuniform vec3 emissive;\nuniform vec3 specular;\nuniform float shininess;",
      THREE.ShaderChunk.color_pars_fragment,
      THREE.ShaderChunk.map_pars_fragment,
      THREE.ShaderChunk.lightmap_pars_fragment,
      THREE.ShaderChunk.envmap_pars_fragment,
      THREE.ShaderChunk.fog_pars_fragment,
      THREE.ShaderChunk.lights_phong_pars_fragment,
      THREE.ShaderChunk.shadowmap_pars_fragment,
      THREE.ShaderChunk.bumpmap_pars_fragment,
      THREE.ShaderChunk.normalmap_pars_fragment,
      THREE.ShaderChunk.specularmap_pars_fragment,
      "void main() {\ngl_FragColor = vec4( vec3 ( 1.0 ), opacity );",
      THREE.ShaderChunk.map_fragment,
      THREE.ShaderChunk.alphatest_fragment,
      THREE.ShaderChunk.specularmap_fragment,
      THREE.ShaderChunk.lights_phong_fragment,
      THREE.ShaderChunk.lightmap_fragment,
      THREE.ShaderChunk.color_fragment,
      THREE.ShaderChunk.envmap_fragment,
      THREE.ShaderChunk.shadowmap_fragment,
      THREE.ShaderChunk.linear_to_gamma_fragment,
      THREE.ShaderChunk.fog_fragment,
      "}",
    ].join("\n"),
  },
  particle_basic: {
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.particle,
      THREE.UniformsLib.shadowmap,
    ]),
    vertexShader: [
      "uniform float size;\nuniform float scale;",
      THREE.ShaderChunk.color_pars_vertex,
      THREE.ShaderChunk.shadowmap_pars_vertex,
      "void main() {",
      THREE.ShaderChunk.color_vertex,
      "vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );\n#ifdef USE_SIZEATTENUATION\ngl_PointSize = size * ( scale / length( mvPosition.xyz ) );\n#else\ngl_PointSize = size;\n#endif\ngl_Position = projectionMatrix * mvPosition;",
      THREE.ShaderChunk.worldpos_vertex,
      THREE.ShaderChunk.shadowmap_vertex,
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform vec3 psColor;\nuniform float opacity;",
      THREE.ShaderChunk.color_pars_fragment,
      THREE.ShaderChunk.map_particle_pars_fragment,
      THREE.ShaderChunk.fog_pars_fragment,
      THREE.ShaderChunk.shadowmap_pars_fragment,
      "void main() {\ngl_FragColor = vec4( psColor, opacity );",
      THREE.ShaderChunk.map_particle_fragment,
      THREE.ShaderChunk.alphatest_fragment,
      THREE.ShaderChunk.color_fragment,
      THREE.ShaderChunk.shadowmap_fragment,
      THREE.ShaderChunk.fog_fragment,
      "}",
    ].join("\n"),
  },
  dashed: {
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.common,
      THREE.UniformsLib.fog,
      {
        scale: { type: "f", value: 1 },
        dashSize: { type: "f", value: 1 },
        totalSize: { type: "f", value: 2 },
      },
    ]),
    vertexShader: [
      "uniform float scale;\nattribute float lineDistance;\nvarying float vLineDistance;",
      THREE.ShaderChunk.color_pars_vertex,
      "void main() {",
      THREE.ShaderChunk.color_vertex,
      "vLineDistance = scale * lineDistance;\nvec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );\ngl_Position = projectionMatrix * mvPosition;\n}",
    ].join("\n"),
    fragmentShader: [
      "uniform vec3 diffuse;\nuniform float opacity;\nuniform float dashSize;\nuniform float totalSize;\nvarying float vLineDistance;",
      THREE.ShaderChunk.color_pars_fragment,
      THREE.ShaderChunk.fog_pars_fragment,
      "void main() {\nif ( mod( vLineDistance, totalSize ) > dashSize ) {\ndiscard;\n}\ngl_FragColor = vec4( diffuse, opacity );",
      THREE.ShaderChunk.color_fragment,
      THREE.ShaderChunk.fog_fragment,
      "}",
    ].join("\n"),
  },
  depth: {
    uniforms: {
      mNear: { type: "f", value: 1 },
      mFar: { type: "f", value: 2e3 },
      opacity: { type: "f", value: 1 },
    },
    vertexShader:
      "void main() {\ngl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n}",
    fragmentShader:
      "uniform float mNear;\nuniform float mFar;\nuniform float opacity;\nvoid main() {\nfloat depth = gl_FragCoord.z / gl_FragCoord.w;\nfloat color = 1.0 - smoothstep( mNear, mFar, depth );\ngl_FragColor = vec4( vec3( color ), opacity );\n}",
  },
  normal: {
    uniforms: { opacity: { type: "f", value: 1 } },
    vertexShader: [
      "varying vec3 vNormal;",
      THREE.ShaderChunk.morphtarget_pars_vertex,
      "void main() {\nvNormal = normalize( normalMatrix * normal );",
      THREE.ShaderChunk.morphtarget_vertex,
      THREE.ShaderChunk.default_vertex,
      "}",
    ].join("\n"),
    fragmentShader:
      "uniform float opacity;\nvarying vec3 vNormal;\nvoid main() {\ngl_FragColor = vec4( 0.5 * normalize( vNormal ) + 0.5, opacity );\n}",
  },
  normalmap: {
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      THREE.UniformsLib.lights,
      THREE.UniformsLib.shadowmap,
      {
        enableAO: { type: "i", value: 0 },
        enableDiffuse: { type: "i", value: 0 },
        enableSpecular: { type: "i", value: 0 },
        enableReflection: { type: "i", value: 0 },
        enableDisplacement: { type: "i", value: 0 },
        tDisplacement: { type: "t", value: null },
        tDiffuse: { type: "t", value: null },
        tCube: { type: "t", value: null },
        tNormal: { type: "t", value: null },
        tSpecular: { type: "t", value: null },
        tAO: { type: "t", value: null },
        uNormalScale: { type: "v2", value: new THREE.Vector2(1, 1) },
        uDisplacementBias: { type: "f", value: 0 },
        uDisplacementScale: { type: "f", value: 1 },
        uDiffuseColor: { type: "c", value: new THREE.Color(16777215) },
        uSpecularColor: { type: "c", value: new THREE.Color(1118481) },
        uAmbientColor: { type: "c", value: new THREE.Color(16777215) },
        uShininess: { type: "f", value: 30 },
        uOpacity: { type: "f", value: 1 },
        useRefract: { type: "i", value: 0 },
        uRefractionRatio: { type: "f", value: 0.98 },
        uReflectivity: { type: "f", value: 0.5 },
        uOffset: { type: "v2", value: new THREE.Vector2(0, 0) },
        uRepeat: { type: "v2", value: new THREE.Vector2(1, 1) },
        wrapRGB: { type: "v3", value: new THREE.Vector3(1, 1, 1) },
      },
    ]),
    fragmentShader: [
      "uniform vec3 uAmbientColor;\nuniform vec3 uDiffuseColor;\nuniform vec3 uSpecularColor;\nuniform float uShininess;\nuniform float uOpacity;\nuniform bool enableDiffuse;\nuniform bool enableSpecular;\nuniform bool enableAO;\nuniform bool enableReflection;\nuniform sampler2D tDiffuse;\nuniform sampler2D tNormal;\nuniform sampler2D tSpecular;\nuniform sampler2D tAO;\nuniform samplerCube tCube;\nuniform vec2 uNormalScale;\nuniform bool useRefract;\nuniform float uRefractionRatio;\nuniform float uReflectivity;\nvarying vec3 vTangent;\nvarying vec3 vBinormal;\nvarying vec3 vNormal;\nvarying vec2 vUv;\nuniform vec3 ambientLightColor;\n#if MAX_DIR_LIGHTS > 0\nuniform vec3 directionalLightColor[ MAX_DIR_LIGHTS ];\nuniform vec3 directionalLightDirection[ MAX_DIR_LIGHTS ];\n#endif\n#if MAX_HEMI_LIGHTS > 0\nuniform vec3 hemisphereLightSkyColor[ MAX_HEMI_LIGHTS ];\nuniform vec3 hemisphereLightGroundColor[ MAX_HEMI_LIGHTS ];\nuniform vec3 hemisphereLightDirection[ MAX_HEMI_LIGHTS ];\n#endif\n#if MAX_POINT_LIGHTS > 0\nuniform vec3 pointLightColor[ MAX_POINT_LIGHTS ];\nuniform vec3 pointLightPosition[ MAX_POINT_LIGHTS ];\nuniform float pointLightDistance[ MAX_POINT_LIGHTS ];\n#endif\n#if MAX_SPOT_LIGHTS > 0\nuniform vec3 spotLightColor[ MAX_SPOT_LIGHTS ];\nuniform vec3 spotLightPosition[ MAX_SPOT_LIGHTS ];\nuniform vec3 spotLightDirection[ MAX_SPOT_LIGHTS ];\nuniform float spotLightAngleCos[ MAX_SPOT_LIGHTS ];\nuniform float spotLightExponent[ MAX_SPOT_LIGHTS ];\nuniform float spotLightDistance[ MAX_SPOT_LIGHTS ];\n#endif\n#ifdef WRAP_AROUND\nuniform vec3 wrapRGB;\n#endif\nvarying vec3 vWorldPosition;\nvarying vec3 vViewPosition;",
      THREE.ShaderChunk.shadowmap_pars_fragment,
      THREE.ShaderChunk.fog_pars_fragment,
      "void main() {\ngl_FragColor = vec4( vec3( 1.0 ), uOpacity );\nvec3 specularTex = vec3( 1.0 );\nvec3 normalTex = texture2D( tNormal, vUv ).xyz * 2.0 - 1.0;\nnormalTex.xy *= uNormalScale;\nnormalTex = normalize( normalTex );\nif( enableDiffuse ) {\n#ifdef GAMMA_INPUT\nvec4 texelColor = texture2D( tDiffuse, vUv );\ntexelColor.xyz *= texelColor.xyz;\ngl_FragColor = gl_FragColor * texelColor;\n#else\ngl_FragColor = gl_FragColor * texture2D( tDiffuse, vUv );\n#endif\n}\nif( enableAO ) {\n#ifdef GAMMA_INPUT\nvec4 aoColor = texture2D( tAO, vUv );\naoColor.xyz *= aoColor.xyz;\ngl_FragColor.xyz = gl_FragColor.xyz * aoColor.xyz;\n#else\ngl_FragColor.xyz = gl_FragColor.xyz * texture2D( tAO, vUv ).xyz;\n#endif\n}\nif( enableSpecular )\nspecularTex = texture2D( tSpecular, vUv ).xyz;\nmat3 tsb = mat3( normalize( vTangent ), normalize( vBinormal ), normalize( vNormal ) );\nvec3 finalNormal = tsb * normalTex;\n#ifdef FLIP_SIDED\nfinalNormal = -finalNormal;\n#endif\nvec3 normal = normalize( finalNormal );\nvec3 viewPosition = normalize( vViewPosition );\n#if MAX_POINT_LIGHTS > 0\nvec3 pointDiffuse = vec3( 0.0 );\nvec3 pointSpecular = vec3( 0.0 );\nfor ( int i = 0; i < MAX_POINT_LIGHTS; i ++ ) {\nvec4 lPosition = viewMatrix * vec4( pointLightPosition[ i ], 1.0 );\nvec3 pointVector = lPosition.xyz + vViewPosition.xyz;\nfloat pointDistance = 1.0;\nif ( pointLightDistance[ i ] > 0.0 )\npointDistance = 1.0 - min( ( length( pointVector ) / pointLightDistance[ i ] ), 1.0 );\npointVector = normalize( pointVector );\n#ifdef WRAP_AROUND\nfloat pointDiffuseWeightFull = max( dot( normal, pointVector ), 0.0 );\nfloat pointDiffuseWeightHalf = max( 0.5 * dot( normal, pointVector ) + 0.5, 0.0 );\nvec3 pointDiffuseWeight = mix( vec3 ( pointDiffuseWeightFull ), vec3( pointDiffuseWeightHalf ), wrapRGB );\n#else\nfloat pointDiffuseWeight = max( dot( normal, pointVector ), 0.0 );\n#endif\npointDiffuse += pointDistance * pointLightColor[ i ] * uDiffuseColor * pointDiffuseWeight;\nvec3 pointHalfVector = normalize( pointVector + viewPosition );\nfloat pointDotNormalHalf = max( dot( normal, pointHalfVector ), 0.0 );\nfloat pointSpecularWeight = specularTex.r * max( pow( pointDotNormalHalf, uShininess ), 0.0 );\n#ifdef PHYSICALLY_BASED_SHADING\nfloat specularNormalization = ( uShininess + 2.0001 ) / 8.0;\nvec3 schlick = uSpecularColor + vec3( 1.0 - uSpecularColor ) * pow( 1.0 - dot( pointVector, pointHalfVector ), 5.0 );\npointSpecular += schlick * pointLightColor[ i ] * pointSpecularWeight * pointDiffuseWeight * pointDistance * specularNormalization;\n#else\npointSpecular += pointDistance * pointLightColor[ i ] * uSpecularColor * pointSpecularWeight * pointDiffuseWeight;\n#endif\n}\n#endif\n#if MAX_SPOT_LIGHTS > 0\nvec3 spotDiffuse = vec3( 0.0 );\nvec3 spotSpecular = vec3( 0.0 );\nfor ( int i = 0; i < MAX_SPOT_LIGHTS; i ++ ) {\nvec4 lPosition = viewMatrix * vec4( spotLightPosition[ i ], 1.0 );\nvec3 spotVector = lPosition.xyz + vViewPosition.xyz;\nfloat spotDistance = 1.0;\nif ( spotLightDistance[ i ] > 0.0 )\nspotDistance = 1.0 - min( ( length( spotVector ) / spotLightDistance[ i ] ), 1.0 );\nspotVector = normalize( spotVector );\nfloat spotEffect = dot( spotLightDirection[ i ], normalize( spotLightPosition[ i ] - vWorldPosition ) );\nif ( spotEffect > spotLightAngleCos[ i ] ) {\nspotEffect = max( pow( spotEffect, spotLightExponent[ i ] ), 0.0 );\n#ifdef WRAP_AROUND\nfloat spotDiffuseWeightFull = max( dot( normal, spotVector ), 0.0 );\nfloat spotDiffuseWeightHalf = max( 0.5 * dot( normal, spotVector ) + 0.5, 0.0 );\nvec3 spotDiffuseWeight = mix( vec3 ( spotDiffuseWeightFull ), vec3( spotDiffuseWeightHalf ), wrapRGB );\n#else\nfloat spotDiffuseWeight = max( dot( normal, spotVector ), 0.0 );\n#endif\nspotDiffuse += spotDistance * spotLightColor[ i ] * uDiffuseColor * spotDiffuseWeight * spotEffect;\nvec3 spotHalfVector = normalize( spotVector + viewPosition );\nfloat spotDotNormalHalf = max( dot( normal, spotHalfVector ), 0.0 );\nfloat spotSpecularWeight = specularTex.r * max( pow( spotDotNormalHalf, uShininess ), 0.0 );\n#ifdef PHYSICALLY_BASED_SHADING\nfloat specularNormalization = ( uShininess + 2.0001 ) / 8.0;\nvec3 schlick = uSpecularColor + vec3( 1.0 - uSpecularColor ) * pow( 1.0 - dot( spotVector, spotHalfVector ), 5.0 );\nspotSpecular += schlick * spotLightColor[ i ] * spotSpecularWeight * spotDiffuseWeight * spotDistance * specularNormalization * spotEffect;\n#else\nspotSpecular += spotDistance * spotLightColor[ i ] * uSpecularColor * spotSpecularWeight * spotDiffuseWeight * spotEffect;\n#endif\n}\n}\n#endif\n#if MAX_DIR_LIGHTS > 0\nvec3 dirDiffuse = vec3( 0.0 );\nvec3 dirSpecular = vec3( 0.0 );\nfor( int i = 0; i < MAX_DIR_LIGHTS; i++ ) {\nvec4 lDirection = viewMatrix * vec4( directionalLightDirection[ i ], 0.0 );\nvec3 dirVector = normalize( lDirection.xyz );\n#ifdef WRAP_AROUND\nfloat directionalLightWeightingFull = max( dot( normal, dirVector ), 0.0 );\nfloat directionalLightWeightingHalf = max( 0.5 * dot( normal, dirVector ) + 0.5, 0.0 );\nvec3 dirDiffuseWeight = mix( vec3( directionalLightWeightingFull ), vec3( directionalLightWeightingHalf ), wrapRGB );\n#else\nfloat dirDiffuseWeight = max( dot( normal, dirVector ), 0.0 );\n#endif\ndirDiffuse += directionalLightColor[ i ] * uDiffuseColor * dirDiffuseWeight;\nvec3 dirHalfVector = normalize( dirVector + viewPosition );\nfloat dirDotNormalHalf = max( dot( normal, dirHalfVector ), 0.0 );\nfloat dirSpecularWeight = specularTex.r * max( pow( dirDotNormalHalf, uShininess ), 0.0 );\n#ifdef PHYSICALLY_BASED_SHADING\nfloat specularNormalization = ( uShininess + 2.0001 ) / 8.0;\nvec3 schlick = uSpecularColor + vec3( 1.0 - uSpecularColor ) * pow( 1.0 - dot( dirVector, dirHalfVector ), 5.0 );\ndirSpecular += schlick * directionalLightColor[ i ] * dirSpecularWeight * dirDiffuseWeight * specularNormalization;\n#else\ndirSpecular += directionalLightColor[ i ] * uSpecularColor * dirSpecularWeight * dirDiffuseWeight;\n#endif\n}\n#endif\n#if MAX_HEMI_LIGHTS > 0\nvec3 hemiDiffuse  = vec3( 0.0 );\nvec3 hemiSpecular = vec3( 0.0 );\nfor( int i = 0; i < MAX_HEMI_LIGHTS; i ++ ) {\nvec4 lDirection = viewMatrix * vec4( hemisphereLightDirection[ i ], 0.0 );\nvec3 lVector = normalize( lDirection.xyz );\nfloat dotProduct = dot( normal, lVector );\nfloat hemiDiffuseWeight = 0.5 * dotProduct + 0.5;\nvec3 hemiColor = mix( hemisphereLightGroundColor[ i ], hemisphereLightSkyColor[ i ], hemiDiffuseWeight );\nhemiDiffuse += uDiffuseColor * hemiColor;\nvec3 hemiHalfVectorSky = normalize( lVector + viewPosition );\nfloat hemiDotNormalHalfSky = 0.5 * dot( normal, hemiHalfVectorSky ) + 0.5;\nfloat hemiSpecularWeightSky = specularTex.r * max( pow( hemiDotNormalHalfSky, uShininess ), 0.0 );\nvec3 lVectorGround = -lVector;\nvec3 hemiHalfVectorGround = normalize( lVectorGround + viewPosition );\nfloat hemiDotNormalHalfGround = 0.5 * dot( normal, hemiHalfVectorGround ) + 0.5;\nfloat hemiSpecularWeightGround = specularTex.r * max( pow( hemiDotNormalHalfGround, uShininess ), 0.0 );\n#ifdef PHYSICALLY_BASED_SHADING\nfloat dotProductGround = dot( normal, lVectorGround );\nfloat specularNormalization = ( uShininess + 2.0001 ) / 8.0;\nvec3 schlickSky = uSpecularColor + vec3( 1.0 - uSpecularColor ) * pow( 1.0 - dot( lVector, hemiHalfVectorSky ), 5.0 );\nvec3 schlickGround = uSpecularColor + vec3( 1.0 - uSpecularColor ) * pow( 1.0 - dot( lVectorGround, hemiHalfVectorGround ), 5.0 );\nhemiSpecular += hemiColor * specularNormalization * ( schlickSky * hemiSpecularWeightSky * max( dotProduct, 0.0 ) + schlickGround * hemiSpecularWeightGround * max( dotProductGround, 0.0 ) );\n#else\nhemiSpecular += uSpecularColor * hemiColor * ( hemiSpecularWeightSky + hemiSpecularWeightGround ) * hemiDiffuseWeight;\n#endif\n}\n#endif\nvec3 totalDiffuse = vec3( 0.0 );\nvec3 totalSpecular = vec3( 0.0 );\n#if MAX_DIR_LIGHTS > 0\ntotalDiffuse += dirDiffuse;\ntotalSpecular += dirSpecular;\n#endif\n#if MAX_HEMI_LIGHTS > 0\ntotalDiffuse += hemiDiffuse;\ntotalSpecular += hemiSpecular;\n#endif\n#if MAX_POINT_LIGHTS > 0\ntotalDiffuse += pointDiffuse;\ntotalSpecular += pointSpecular;\n#endif\n#if MAX_SPOT_LIGHTS > 0\ntotalDiffuse += spotDiffuse;\ntotalSpecular += spotSpecular;\n#endif\n#ifdef METAL\ngl_FragColor.xyz = gl_FragColor.xyz * ( totalDiffuse + ambientLightColor * uAmbientColor + totalSpecular );\n#else\ngl_FragColor.xyz = gl_FragColor.xyz * ( totalDiffuse + ambientLightColor * uAmbientColor ) + totalSpecular;\n#endif\nif ( enableReflection ) {\nvec3 vReflect;\nvec3 cameraToVertex = normalize( vWorldPosition - cameraPosition );\nif ( useRefract ) {\nvReflect = refract( cameraToVertex, normal, uRefractionRatio );\n} else {\nvReflect = reflect( cameraToVertex, normal );\n}\nvec4 cubeColor = textureCube( tCube, vec3( -vReflect.x, vReflect.yz ) );\n#ifdef GAMMA_INPUT\ncubeColor.xyz *= cubeColor.xyz;\n#endif\ngl_FragColor.xyz = mix( gl_FragColor.xyz, cubeColor.xyz, specularTex.r * uReflectivity );\n}",
      THREE.ShaderChunk.shadowmap_fragment,
      THREE.ShaderChunk.linear_to_gamma_fragment,
      THREE.ShaderChunk.fog_fragment,
      "}",
    ].join("\n"),
    vertexShader: [
      "attribute vec4 tangent;\nuniform vec2 uOffset;\nuniform vec2 uRepeat;\nuniform bool enableDisplacement;\n#ifdef VERTEX_TEXTURES\nuniform sampler2D tDisplacement;\nuniform float uDisplacementScale;\nuniform float uDisplacementBias;\n#endif\nvarying vec3 vTangent;\nvarying vec3 vBinormal;\nvarying vec3 vNormal;\nvarying vec2 vUv;\nvarying vec3 vWorldPosition;\nvarying vec3 vViewPosition;",
      THREE.ShaderChunk.skinning_pars_vertex,
      THREE.ShaderChunk.shadowmap_pars_vertex,
      "void main() {",
      THREE.ShaderChunk.skinbase_vertex,
      THREE.ShaderChunk.skinnormal_vertex,
      "#ifdef USE_SKINNING\nvNormal = normalize( normalMatrix * skinnedNormal.xyz );\nvec4 skinnedTangent = skinMatrix * vec4( tangent.xyz, 0.0 );\nvTangent = normalize( normalMatrix * skinnedTangent.xyz );\n#else\nvNormal = normalize( normalMatrix * normal );\nvTangent = normalize( normalMatrix * tangent.xyz );\n#endif\nvBinormal = normalize( cross( vNormal, vTangent ) * tangent.w );\nvUv = uv * uRepeat + uOffset;\nvec3 displacedPosition;\n#ifdef VERTEX_TEXTURES\nif ( enableDisplacement ) {\nvec3 dv = texture2D( tDisplacement, uv ).xyz;\nfloat df = uDisplacementScale * dv.x + uDisplacementBias;\ndisplacedPosition = position + normalize( normal ) * df;\n} else {\n#ifdef USE_SKINNING\nvec4 skinVertex = vec4( position, 1.0 );\nvec4 skinned  = boneMatX * skinVertex * skinWeight.x;\nskinned \t  += boneMatY * skinVertex * skinWeight.y;\ndisplacedPosition  = skinned.xyz;\n#else\ndisplacedPosition = position;\n#endif\n}\n#else\n#ifdef USE_SKINNING\nvec4 skinVertex = vec4( position, 1.0 );\nvec4 skinned  = boneMatX * skinVertex * skinWeight.x;\nskinned \t  += boneMatY * skinVertex * skinWeight.y;\ndisplacedPosition  = skinned.xyz;\n#else\ndisplacedPosition = position;\n#endif\n#endif\nvec4 mvPosition = modelViewMatrix * vec4( displacedPosition, 1.0 );\nvec4 worldPosition = modelMatrix * vec4( displacedPosition, 1.0 );\ngl_Position = projectionMatrix * mvPosition;\nvWorldPosition = worldPosition.xyz;\nvViewPosition = -mvPosition.xyz;\n#ifdef USE_SHADOWMAP\nfor( int i = 0; i < MAX_SHADOWS; i ++ ) {\nvShadowCoord[ i ] = shadowMatrix[ i ] * worldPosition;\n}\n#endif\n}",
    ].join("\n"),
  },
  cube: {
    uniforms: {
      tCube: { type: "t", value: null },
      tFlip: { type: "f", value: -1 },
    },
    vertexShader:
      "varying vec3 vWorldPosition;\nvoid main() {\nvec4 worldPosition = modelMatrix * vec4( position, 1.0 );\nvWorldPosition = worldPosition.xyz;\ngl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n}",
    fragmentShader:
      "uniform samplerCube tCube;\nuniform float tFlip;\nvarying vec3 vWorldPosition;\nvoid main() {\ngl_FragColor = textureCube( tCube, vec3( tFlip * vWorldPosition.x, vWorldPosition.yz ) );\n}",
  },
  depthRGBA: {
    uniforms: {},
    vertexShader: [
      THREE.ShaderChunk.morphtarget_pars_vertex,
      THREE.ShaderChunk.skinning_pars_vertex,
      "void main() {",
      THREE.ShaderChunk.skinbase_vertex,
      THREE.ShaderChunk.morphtarget_vertex,
      THREE.ShaderChunk.skinning_vertex,
      THREE.ShaderChunk.default_vertex,
      "}",
    ].join("\n"),
    fragmentShader:
      "vec4 pack_depth( const in float depth ) {\nconst vec4 bit_shift = vec4( 256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0 );\nconst vec4 bit_mask  = vec4( 0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0 );\nvec4 res = fract( depth * bit_shift );\nres -= res.xxyz * bit_mask;\nreturn res;\n}\nvoid main() {\ngl_FragData[ 0 ] = pack_depth( gl_FragCoord.z );\n}",
  },
};
THREE.WebGLRenderer = function (a) {
  function b(a, b) {
    var c = a.vertices.length,
      d = b.material;
    if (d.attributes) {
      void 0 === a.__webglCustomAttributesList &&
        (a.__webglCustomAttributesList = []);
      for (var e in d.attributes) {
        var f = d.attributes[e];
        if (!f.__webglInitialized || f.createUniqueBuffers) {
          f.__webglInitialized = !0;
          var h = 1;
          "v2" === f.type
            ? (h = 2)
            : "v3" === f.type
            ? (h = 3)
            : "v4" === f.type
            ? (h = 4)
            : "c" === f.type && (h = 3);
          f.size = h;
          f.array = new Float32Array(c * h);
          f.buffer = j.createBuffer();
          f.buffer.belongsToAttribute = e;
          f.needsUpdate = !0;
        }
        a.__webglCustomAttributesList.push(f);
      }
    }
  }
  function c(a, b) {
    var c = b.geometry,
      h = a.faces3,
      g = 3 * h.length,
      i = 1 * h.length,
      k = 3 * h.length,
      h = d(b, a),
      m = f(h),
      l = e(h),
      p = h.vertexColors ? h.vertexColors : !1;
    a.__vertexArray = new Float32Array(3 * g);
    l && (a.__normalArray = new Float32Array(3 * g));
    c.hasTangents && (a.__tangentArray = new Float32Array(4 * g));
    p && (a.__colorArray = new Float32Array(3 * g));
    m &&
      (0 < c.faceVertexUvs.length && (a.__uvArray = new Float32Array(2 * g)),
      1 < c.faceVertexUvs.length && (a.__uv2Array = new Float32Array(2 * g)));
    b.geometry.skinWeights.length &&
      b.geometry.skinIndices.length &&
      ((a.__skinIndexArray = new Float32Array(4 * g)),
      (a.__skinWeightArray = new Float32Array(4 * g)));
    a.__faceArray = new Uint16Array(3 * i);
    a.__lineArray = new Uint16Array(2 * k);
    if (a.numMorphTargets) {
      a.__morphTargetsArrays = [];
      c = 0;
      for (m = a.numMorphTargets; c < m; c++)
        a.__morphTargetsArrays.push(new Float32Array(3 * g));
    }
    if (a.numMorphNormals) {
      a.__morphNormalsArrays = [];
      c = 0;
      for (m = a.numMorphNormals; c < m; c++)
        a.__morphNormalsArrays.push(new Float32Array(3 * g));
    }
    a.__webglFaceCount = 3 * i;
    a.__webglLineCount = 2 * k;
    if (h.attributes) {
      void 0 === a.__webglCustomAttributesList &&
        (a.__webglCustomAttributesList = []);
      for (var n in h.attributes) {
        var i = h.attributes[n],
          k = {},
          r;
        for (r in i) k[r] = i[r];
        if (!k.__webglInitialized || k.createUniqueBuffers)
          (k.__webglInitialized = !0),
            (c = 1),
            "v2" === k.type
              ? (c = 2)
              : "v3" === k.type
              ? (c = 3)
              : "v4" === k.type
              ? (c = 4)
              : "c" === k.type && (c = 3),
            (k.size = c),
            (k.array = new Float32Array(g * c)),
            (k.buffer = j.createBuffer()),
            (k.buffer.belongsToAttribute = n),
            (i.needsUpdate = !0),
            (k.__original = i);
        a.__webglCustomAttributesList.push(k);
      }
    }
    a.__inittedArrays = !0;
  }
  function d(a, b) {
    return a.material instanceof THREE.MeshFaceMaterial
      ? a.material.materials[b.materialIndex]
      : a.material;
  }
  function e(a) {
    return (a instanceof THREE.MeshBasicMaterial && !a.envMap) ||
      a instanceof THREE.MeshDepthMaterial
      ? !1
      : a && void 0 !== a.shading && a.shading === THREE.SmoothShading
      ? THREE.SmoothShading
      : THREE.FlatShading;
  }
  function f(a) {
    return a.map ||
      a.lightMap ||
      a.bumpMap ||
      a.normalMap ||
      a.specularMap ||
      a instanceof THREE.ShaderMaterial
      ? !0
      : !1;
  }
  function h(a) {
    Ha[a] || (j.enableVertexAttribArray(a), (Ha[a] = !0));
  }
  function g() {
    for (var a in Ha) Ha[a] && (j.disableVertexAttribArray(a), (Ha[a] = !1));
  }
  function i(a, b) {
    return a.z !== b.z ? b.z - a.z : a.id - b.id;
  }
  function k(a, b) {
    return b[0] - a[0];
  }
  function m(a, b, c) {
    if (a.length)
      for (var d = 0, e = a.length; d < e; d++)
        (ea = Ba = null),
          (Aa = $ = U = Z = fa = Ga = ka = -1),
          (ua = !0),
          a[d].render(b, c, sb, pb),
          (ea = Ba = null),
          (Aa = $ = U = Z = fa = Ga = ka = -1),
          (ua = !0);
  }
  function l(a, b, c, d, e, f, h, g) {
    var j, i, k, m;
    b ? ((i = a.length - 1), (m = b = -1)) : ((i = 0), (b = a.length), (m = 1));
    for (var l = i; l !== b; l += m)
      if (((j = a[l]), j.render)) {
        i = j.object;
        k = j.buffer;
        if (g) j = g;
        else {
          j = j[c];
          if (!j) continue;
          h &&
            K.setBlending(j.blending, j.blendEquation, j.blendSrc, j.blendDst);
          K.setDepthTest(j.depthTest);
          K.setDepthWrite(j.depthWrite);
          A(j.polygonOffset, j.polygonOffsetFactor, j.polygonOffsetUnits);
        }
        K.setMaterialFaces(j);
        k instanceof THREE.BufferGeometry
          ? K.renderBufferDirect(d, e, f, j, k, i)
          : K.renderBuffer(d, e, f, j, k, i);
      }
  }
  function p(a, b, c, d, e, f, h) {
    for (var g, j, i = 0, k = a.length; i < k; i++)
      if (((g = a[i]), (j = g.object), j.visible)) {
        if (h) g = h;
        else {
          g = g[b];
          if (!g) continue;
          f &&
            K.setBlending(g.blending, g.blendEquation, g.blendSrc, g.blendDst);
          K.setDepthTest(g.depthTest);
          K.setDepthWrite(g.depthWrite);
          A(g.polygonOffset, g.polygonOffsetFactor, g.polygonOffsetUnits);
        }
        K.renderImmediateObject(c, d, e, g, j);
      }
  }
  function s(a, d) {
    var e, f, h, g;
    if (
      void 0 === a.__webglInit &&
      ((a.__webglInit = !0),
      (a._modelViewMatrix = new THREE.Matrix4()),
      (a._normalMatrix = new THREE.Matrix3()),
      void 0 !== a.geometry &&
        void 0 === a.geometry.__webglInit &&
        ((a.geometry.__webglInit = !0),
        a.geometry.addEventListener("dispose", Cb)),
      (f = a.geometry),
      void 0 !== f)
    )
      if (f instanceof THREE.BufferGeometry) {
        var i, k;
        for (i in f.attributes)
          (k = "index" === i ? j.ELEMENT_ARRAY_BUFFER : j.ARRAY_BUFFER),
            (g = f.attributes[i]),
            void 0 === g.numItems && (g.numItems = g.array.length),
            (g.buffer = j.createBuffer()),
            j.bindBuffer(k, g.buffer),
            j.bufferData(k, g.array, j.STATIC_DRAW);
      } else if (a instanceof THREE.Mesh) {
        h = a.material;
        if (void 0 === f.geometryGroups) {
          i = f;
          var m, l, p;
          k = {};
          var n = i.morphTargets.length,
            r = i.morphNormals.length,
            s = h instanceof THREE.MeshFaceMaterial;
          i.geometryGroups = {};
          h = 0;
          for (m = i.faces.length; h < m; h++)
            (l = i.faces[h]),
              (l = s ? l.materialIndex : 0),
              void 0 === k[l] && (k[l] = { hash: l, counter: 0 }),
              (p = k[l].hash + "_" + k[l].counter),
              void 0 === i.geometryGroups[p] &&
                (i.geometryGroups[p] = {
                  faces3: [],
                  materialIndex: l,
                  vertices: 0,
                  numMorphTargets: n,
                  numMorphNormals: r,
                }),
              65535 < i.geometryGroups[p].vertices + 3 &&
                ((k[l].counter += 1),
                (p = k[l].hash + "_" + k[l].counter),
                void 0 === i.geometryGroups[p] &&
                  (i.geometryGroups[p] = {
                    faces3: [],
                    materialIndex: l,
                    vertices: 0,
                    numMorphTargets: n,
                    numMorphNormals: r,
                  })),
              i.geometryGroups[p].faces3.push(h),
              (i.geometryGroups[p].vertices += 3);
          i.geometryGroupsList = [];
          for (g in i.geometryGroups)
            (i.geometryGroups[g].id = V++),
              i.geometryGroupsList.push(i.geometryGroups[g]);
        }
        for (e in f.geometryGroups)
          if (((g = f.geometryGroups[e]), !g.__webglVertexBuffer)) {
            i = g;
            i.__webglVertexBuffer = j.createBuffer();
            i.__webglNormalBuffer = j.createBuffer();
            i.__webglTangentBuffer = j.createBuffer();
            i.__webglColorBuffer = j.createBuffer();
            i.__webglUVBuffer = j.createBuffer();
            i.__webglUV2Buffer = j.createBuffer();
            i.__webglSkinIndicesBuffer = j.createBuffer();
            i.__webglSkinWeightsBuffer = j.createBuffer();
            i.__webglFaceBuffer = j.createBuffer();
            i.__webglLineBuffer = j.createBuffer();
            n = k = void 0;
            if (i.numMorphTargets) {
              i.__webglMorphTargetsBuffers = [];
              k = 0;
              for (n = i.numMorphTargets; k < n; k++)
                i.__webglMorphTargetsBuffers.push(j.createBuffer());
            }
            if (i.numMorphNormals) {
              i.__webglMorphNormalsBuffers = [];
              k = 0;
              for (n = i.numMorphNormals; k < n; k++)
                i.__webglMorphNormalsBuffers.push(j.createBuffer());
            }
            K.info.memory.geometries++;
            c(g, a);
            f.verticesNeedUpdate = !0;
            f.morphTargetsNeedUpdate = !0;
            f.elementsNeedUpdate = !0;
            f.uvsNeedUpdate = !0;
            f.normalsNeedUpdate = !0;
            f.tangentsNeedUpdate = !0;
            f.colorsNeedUpdate = !0;
          }
      } else
        a instanceof THREE.Line
          ? f.__webglVertexBuffer ||
            ((g = f),
            (g.__webglVertexBuffer = j.createBuffer()),
            (g.__webglColorBuffer = j.createBuffer()),
            (g.__webglLineDistanceBuffer = j.createBuffer()),
            K.info.memory.geometries++,
            (g = f),
            (i = g.vertices.length),
            (g.__vertexArray = new Float32Array(3 * i)),
            (g.__colorArray = new Float32Array(3 * i)),
            (g.__lineDistanceArray = new Float32Array(1 * i)),
            (g.__webglLineCount = i),
            b(g, a),
            (f.verticesNeedUpdate = !0),
            (f.colorsNeedUpdate = !0),
            (f.lineDistancesNeedUpdate = !0))
          : a instanceof THREE.ParticleSystem &&
            !f.__webglVertexBuffer &&
            ((g = f),
            (g.__webglVertexBuffer = j.createBuffer()),
            (g.__webglColorBuffer = j.createBuffer()),
            K.info.memory.geometries++,
            (g = f),
            (i = g.vertices.length),
            (g.__vertexArray = new Float32Array(3 * i)),
            (g.__colorArray = new Float32Array(3 * i)),
            (g.__sortArray = []),
            (g.__webglParticleCount = i),
            b(g, a),
            (f.verticesNeedUpdate = !0),
            (f.colorsNeedUpdate = !0));
    if (void 0 === a.__webglActive) {
      if (a instanceof THREE.Mesh)
        if (((f = a.geometry), f instanceof THREE.BufferGeometry))
          t(d.__webglObjects, f, a);
        else {
          if (f instanceof THREE.Geometry)
            for (e in f.geometryGroups)
              (g = f.geometryGroups[e]), t(d.__webglObjects, g, a);
        }
      else
        a instanceof THREE.Line || a instanceof THREE.ParticleSystem
          ? ((f = a.geometry), t(d.__webglObjects, f, a))
          : a instanceof THREE.ImmediateRenderObject ||
            a.immediateRenderCallback
          ? d.__webglObjectsImmediate.push({
              id: null,
              object: a,
              opaque: null,
              transparent: null,
              z: 0,
            })
          : a instanceof THREE.Sprite
          ? d.__webglSprites.push(a)
          : a instanceof THREE.LensFlare && d.__webglFlares.push(a);
      a.__webglActive = !0;
    }
  }
  function t(a, b, c) {
    a.push({
      id: null,
      buffer: b,
      object: c,
      opaque: null,
      transparent: null,
      z: 0,
    });
  }
  function n(a) {
    for (var b in a.attributes) if (a.attributes[b].needsUpdate) return !0;
    return !1;
  }
  function r(a) {
    for (var b in a.attributes) a.attributes[b].needsUpdate = !1;
  }
  function q(a, b) {
    a instanceof THREE.Mesh ||
    a instanceof THREE.ParticleSystem ||
    a instanceof THREE.Line
      ? u(b.__webglObjects, a)
      : a instanceof THREE.Sprite
      ? w(b.__webglSprites, a)
      : a instanceof THREE.LensFlare
      ? w(b.__webglFlares, a)
      : (a instanceof THREE.ImmediateRenderObject ||
          a.immediateRenderCallback) &&
        u(b.__webglObjectsImmediate, a);
    delete a.__webglActive;
  }
  function u(a, b) {
    for (var c = a.length - 1; 0 <= c; c--) a[c].object === b && a.splice(c, 1);
  }
  function w(a, b) {
    for (var c = a.length - 1; 0 <= c; c--) a[c] === b && a.splice(c, 1);
  }
  function z(a, b, c, d, e) {
    P = 0;
    d.needsUpdate &&
      (d.program && Gb(d), K.initMaterial(d, b, c, e), (d.needsUpdate = !1));
    d.morphTargets &&
      !e.__webglMorphTargetInfluences &&
      (e.__webglMorphTargetInfluences = new Float32Array(K.maxMorphTargets));
    var f = !1,
      g = d.program,
      h = g.uniforms,
      i = d.uniforms;
    g !== Ba && (j.useProgram(g), (Ba = g), (f = !0));
    d.id !== Aa && ((Aa = d.id), (f = !0));
    if (f || a !== ea)
      j.uniformMatrix4fv(h.projectionMatrix, !1, a.projectionMatrix.elements),
        a !== ea && (ea = a);
    if (d.skinning)
      if (yb && e.useVertexTexture) {
        if (null !== h.boneTexture) {
          var k = B();
          j.uniform1i(h.boneTexture, k);
          K.setTexture(e.boneTexture, k);
        }
        null !== h.boneTextureWidth &&
          j.uniform1i(h.boneTextureWidth, e.boneTextureWidth);
        null !== h.boneTextureHeight &&
          j.uniform1i(h.boneTextureHeight, e.boneTextureHeight);
      } else
        null !== h.boneGlobalMatrices &&
          j.uniformMatrix4fv(h.boneGlobalMatrices, !1, e.boneMatrices);
    if (f) {
      c &&
        d.fog &&
        ((i.fogColor.value = c.color),
        c instanceof THREE.Fog
          ? ((i.fogNear.value = c.near), (i.fogFar.value = c.far))
          : c instanceof THREE.FogExp2 && (i.fogDensity.value = c.density));
      if (
        d instanceof THREE.MeshPhongMaterial ||
        d instanceof THREE.MeshLambertMaterial ||
        d.lights
      ) {
        if (ua) {
          for (
            var m,
              l = (k = 0),
              p = 0,
              n,
              r,
              s,
              q = Pa,
              t = q.directional.colors,
              u = q.directional.positions,
              w = q.point.colors,
              z = q.point.positions,
              y = q.point.distances,
              A = q.spot.colors,
              C = q.spot.positions,
              F = q.spot.distances,
              J = q.spot.directions,
              N = q.spot.anglesCos,
              O = q.spot.exponents,
              I = q.hemi.skyColors,
              V = q.hemi.groundColors,
              R = q.hemi.positions,
              M = 0,
              U = 0,
              da = 0,
              Z = 0,
              Fa = 0,
              dc = 0,
              X = 0,
              W = 0,
              Q = (m = 0),
              c = (s = Q = 0),
              f = b.length;
            c < f;
            c++
          )
            (m = b[c]),
              m.onlyShadow ||
                ((n = m.color),
                (r = m.intensity),
                (s = m.distance),
                m instanceof THREE.AmbientLight
                  ? m.visible &&
                    (K.gammaInput
                      ? ((k += n.r * n.r), (l += n.g * n.g), (p += n.b * n.b))
                      : ((k += n.r), (l += n.g), (p += n.b)))
                  : m instanceof THREE.DirectionalLight
                  ? ((Fa += 1),
                    m.visible &&
                      (ga.getPositionFromMatrix(m.matrixWorld),
                      sa.getPositionFromMatrix(m.target.matrixWorld),
                      ga.sub(sa),
                      ga.normalize(),
                      (0 === ga.x && 0 === ga.y && 0 === ga.z) ||
                        ((m = 3 * M),
                        (u[m] = ga.x),
                        (u[m + 1] = ga.y),
                        (u[m + 2] = ga.z),
                        K.gammaInput ? D(t, m, n, r * r) : x(t, m, n, r),
                        (M += 1))))
                  : m instanceof THREE.PointLight
                  ? ((dc += 1),
                    m.visible &&
                      ((Q = 3 * U),
                      K.gammaInput ? D(w, Q, n, r * r) : x(w, Q, n, r),
                      sa.getPositionFromMatrix(m.matrixWorld),
                      (z[Q] = sa.x),
                      (z[Q + 1] = sa.y),
                      (z[Q + 2] = sa.z),
                      (y[U] = s),
                      (U += 1)))
                  : m instanceof THREE.SpotLight
                  ? ((X += 1),
                    m.visible &&
                      ((Q = 3 * da),
                      K.gammaInput ? D(A, Q, n, r * r) : x(A, Q, n, r),
                      sa.getPositionFromMatrix(m.matrixWorld),
                      (C[Q] = sa.x),
                      (C[Q + 1] = sa.y),
                      (C[Q + 2] = sa.z),
                      (F[da] = s),
                      ga.copy(sa),
                      sa.getPositionFromMatrix(m.target.matrixWorld),
                      ga.sub(sa),
                      ga.normalize(),
                      (J[Q] = ga.x),
                      (J[Q + 1] = ga.y),
                      (J[Q + 2] = ga.z),
                      (N[da] = Math.cos(m.angle)),
                      (O[da] = m.exponent),
                      (da += 1)))
                  : m instanceof THREE.HemisphereLight &&
                    ((W += 1),
                    m.visible &&
                      (ga.getPositionFromMatrix(m.matrixWorld),
                      ga.normalize(),
                      (0 === ga.x && 0 === ga.y && 0 === ga.z) ||
                        ((s = 3 * Z),
                        (R[s] = ga.x),
                        (R[s + 1] = ga.y),
                        (R[s + 2] = ga.z),
                        (n = m.color),
                        (m = m.groundColor),
                        K.gammaInput
                          ? ((r *= r), D(I, s, n, r), D(V, s, m, r))
                          : (x(I, s, n, r), x(V, s, m, r)),
                        (Z += 1)))));
          c = 3 * M;
          for (f = Math.max(t.length, 3 * Fa); c < f; c++) t[c] = 0;
          c = 3 * U;
          for (f = Math.max(w.length, 3 * dc); c < f; c++) w[c] = 0;
          c = 3 * da;
          for (f = Math.max(A.length, 3 * X); c < f; c++) A[c] = 0;
          c = 3 * Z;
          for (f = Math.max(I.length, 3 * W); c < f; c++) I[c] = 0;
          c = 3 * Z;
          for (f = Math.max(V.length, 3 * W); c < f; c++) V[c] = 0;
          q.directional.length = M;
          q.point.length = U;
          q.spot.length = da;
          q.hemi.length = Z;
          q.ambient[0] = k;
          q.ambient[1] = l;
          q.ambient[2] = p;
          ua = !1;
        }
        c = Pa;
        i.ambientLightColor.value = c.ambient;
        i.directionalLightColor.value = c.directional.colors;
        i.directionalLightDirection.value = c.directional.positions;
        i.pointLightColor.value = c.point.colors;
        i.pointLightPosition.value = c.point.positions;
        i.pointLightDistance.value = c.point.distances;
        i.spotLightColor.value = c.spot.colors;
        i.spotLightPosition.value = c.spot.positions;
        i.spotLightDistance.value = c.spot.distances;
        i.spotLightDirection.value = c.spot.directions;
        i.spotLightAngleCos.value = c.spot.anglesCos;
        i.spotLightExponent.value = c.spot.exponents;
        i.hemisphereLightSkyColor.value = c.hemi.skyColors;
        i.hemisphereLightGroundColor.value = c.hemi.groundColors;
        i.hemisphereLightDirection.value = c.hemi.positions;
      }
      if (
        d instanceof THREE.MeshBasicMaterial ||
        d instanceof THREE.MeshLambertMaterial ||
        d instanceof THREE.MeshPhongMaterial
      ) {
        i.opacity.value = d.opacity;
        K.gammaInput
          ? i.diffuse.value.copyGammaToLinear(d.color)
          : (i.diffuse.value = d.color);
        i.map.value = d.map;
        i.lightMap.value = d.lightMap;
        i.specularMap.value = d.specularMap;
        d.bumpMap &&
          ((i.bumpMap.value = d.bumpMap), (i.bumpScale.value = d.bumpScale));
        d.normalMap &&
          ((i.normalMap.value = d.normalMap),
          i.normalScale.value.copy(d.normalScale));
        var $;
        d.map
          ? ($ = d.map)
          : d.specularMap
          ? ($ = d.specularMap)
          : d.normalMap
          ? ($ = d.normalMap)
          : d.bumpMap && ($ = d.bumpMap);
        void 0 !== $ &&
          ((c = $.offset),
          ($ = $.repeat),
          i.offsetRepeat.value.set(c.x, c.y, $.x, $.y));
        i.envMap.value = d.envMap;
        i.flipEnvMap.value =
          d.envMap instanceof THREE.WebGLRenderTargetCube ? 1 : -1;
        i.reflectivity.value = d.reflectivity;
        i.refractionRatio.value = d.refractionRatio;
        i.combine.value = d.combine;
        i.useRefract.value =
          d.envMap && d.envMap.mapping instanceof THREE.CubeRefractionMapping;
      }
      d instanceof THREE.LineBasicMaterial
        ? ((i.diffuse.value = d.color), (i.opacity.value = d.opacity))
        : d instanceof THREE.LineDashedMaterial
        ? ((i.diffuse.value = d.color),
          (i.opacity.value = d.opacity),
          (i.dashSize.value = d.dashSize),
          (i.totalSize.value = d.dashSize + d.gapSize),
          (i.scale.value = d.scale))
        : d instanceof THREE.ParticleSystemMaterial
        ? ((i.psColor.value = d.color),
          (i.opacity.value = d.opacity),
          (i.size.value = d.size),
          (i.scale.value = G.height / 2),
          (i.map.value = d.map))
        : d instanceof THREE.MeshPhongMaterial
        ? ((i.shininess.value = d.shininess),
          K.gammaInput
            ? (i.ambient.value.copyGammaToLinear(d.ambient),
              i.emissive.value.copyGammaToLinear(d.emissive),
              i.specular.value.copyGammaToLinear(d.specular))
            : ((i.ambient.value = d.ambient),
              (i.emissive.value = d.emissive),
              (i.specular.value = d.specular)),
          d.wrapAround && i.wrapRGB.value.copy(d.wrapRGB))
        : d instanceof THREE.MeshLambertMaterial
        ? (K.gammaInput
            ? (i.ambient.value.copyGammaToLinear(d.ambient),
              i.emissive.value.copyGammaToLinear(d.emissive))
            : ((i.ambient.value = d.ambient), (i.emissive.value = d.emissive)),
          d.wrapAround && i.wrapRGB.value.copy(d.wrapRGB))
        : d instanceof THREE.MeshDepthMaterial
        ? ((i.mNear.value = a.near),
          (i.mFar.value = a.far),
          (i.opacity.value = d.opacity))
        : d instanceof THREE.MeshNormalMaterial &&
          (i.opacity.value = d.opacity);
      if (e.receiveShadow && !d._shadowPass && i.shadowMatrix) {
        c = $ = 0;
        for (f = b.length; c < f; c++)
          if (
            ((k = b[c]),
            k.castShadow &&
              (k instanceof THREE.SpotLight ||
                (k instanceof THREE.DirectionalLight && !k.shadowCascade)))
          )
            (i.shadowMap.value[$] = k.shadowMap),
              (i.shadowMapSize.value[$] = k.shadowMapSize),
              (i.shadowMatrix.value[$] = k.shadowMatrix),
              (i.shadowDarkness.value[$] = k.shadowDarkness),
              (i.shadowBias.value[$] = k.shadowBias),
              $++;
      }
      b = d.uniformsList;
      i = 0;
      for ($ = b.length; i < $; i++)
        if ((f = g.uniforms[b[i][1]]))
          if (((c = b[i][0]), (l = c.type), (k = c.value), "i" === l))
            j.uniform1i(f, k);
          else if ("f" === l) j.uniform1f(f, k);
          else if ("v2" === l) j.uniform2f(f, k.x, k.y);
          else if ("v3" === l) j.uniform3f(f, k.x, k.y, k.z);
          else if ("v4" === l) j.uniform4f(f, k.x, k.y, k.z, k.w);
          else if ("c" === l) j.uniform3f(f, k.r, k.g, k.b);
          else if ("iv1" === l) j.uniform1iv(f, k);
          else if ("iv" === l) j.uniform3iv(f, k);
          else if ("fv1" === l) j.uniform1fv(f, k);
          else if ("fv" === l) j.uniform3fv(f, k);
          else if ("v2v" === l) {
            void 0 === c._array && (c._array = new Float32Array(2 * k.length));
            l = 0;
            for (p = k.length; l < p; l++)
              (q = 2 * l), (c._array[q] = k[l].x), (c._array[q + 1] = k[l].y);
            j.uniform2fv(f, c._array);
          } else if ("v3v" === l) {
            void 0 === c._array && (c._array = new Float32Array(3 * k.length));
            l = 0;
            for (p = k.length; l < p; l++)
              (q = 3 * l),
                (c._array[q] = k[l].x),
                (c._array[q + 1] = k[l].y),
                (c._array[q + 2] = k[l].z);
            j.uniform3fv(f, c._array);
          } else if ("v4v" === l) {
            void 0 === c._array && (c._array = new Float32Array(4 * k.length));
            l = 0;
            for (p = k.length; l < p; l++)
              (q = 4 * l),
                (c._array[q] = k[l].x),
                (c._array[q + 1] = k[l].y),
                (c._array[q + 2] = k[l].z),
                (c._array[q + 3] = k[l].w);
            j.uniform4fv(f, c._array);
          } else if ("m4" === l)
            void 0 === c._array && (c._array = new Float32Array(16)),
              k.flattenToArray(c._array),
              j.uniformMatrix4fv(f, !1, c._array);
          else if ("m4v" === l) {
            void 0 === c._array && (c._array = new Float32Array(16 * k.length));
            l = 0;
            for (p = k.length; l < p; l++)
              k[l].flattenToArrayOffset(c._array, 16 * l);
            j.uniformMatrix4fv(f, !1, c._array);
          } else if ("t" === l) {
            if (((q = k), (k = B()), j.uniform1i(f, k), q))
              if (q.image instanceof Array && 6 === q.image.length) {
                if (((c = q), (f = k), 6 === c.image.length))
                  if (c.needsUpdate) {
                    c.image.__webglTextureCube ||
                      (c.addEventListener("dispose", Db),
                      (c.image.__webglTextureCube = j.createTexture()),
                      K.info.memory.textures++);
                    j.activeTexture(j.TEXTURE0 + f);
                    j.bindTexture(
                      j.TEXTURE_CUBE_MAP,
                      c.image.__webglTextureCube
                    );
                    j.pixelStorei(j.UNPACK_FLIP_Y_WEBGL, c.flipY);
                    f = c instanceof THREE.CompressedTexture;
                    k = [];
                    for (l = 0; 6 > l; l++)
                      K.autoScaleCubemaps && !f
                        ? ((p = k),
                          (q = l),
                          (t = c.image[l]),
                          (w = ac),
                          (t.width <= w && t.height <= w) ||
                            ((z = Math.max(t.width, t.height)),
                            (u = Math.floor((t.width * w) / z)),
                            (w = Math.floor((t.height * w) / z)),
                            (z = document.createElement("canvas")),
                            (z.width = u),
                            (z.height = w),
                            z
                              .getContext("2d")
                              .drawImage(
                                t,
                                0,
                                0,
                                t.width,
                                t.height,
                                0,
                                0,
                                u,
                                w
                              ),
                            (t = z)),
                          (p[q] = t))
                        : (k[l] = c.image[l]);
                    l = k[0];
                    p =
                      0 === (l.width & (l.width - 1)) &&
                      0 === (l.height & (l.height - 1));
                    q = v(c.format);
                    t = v(c.type);
                    E(j.TEXTURE_CUBE_MAP, c, p);
                    for (l = 0; 6 > l; l++)
                      if (f) {
                        w = k[l].mipmaps;
                        z = 0;
                        for (y = w.length; z < y; z++)
                          (u = w[z]),
                            c.format !== THREE.RGBAFormat
                              ? j.compressedTexImage2D(
                                  j.TEXTURE_CUBE_MAP_POSITIVE_X + l,
                                  z,
                                  q,
                                  u.width,
                                  u.height,
                                  0,
                                  u.data
                                )
                              : j.texImage2D(
                                  j.TEXTURE_CUBE_MAP_POSITIVE_X + l,
                                  z,
                                  q,
                                  u.width,
                                  u.height,
                                  0,
                                  q,
                                  t,
                                  u.data
                                );
                      } else
                        j.texImage2D(
                          j.TEXTURE_CUBE_MAP_POSITIVE_X + l,
                          0,
                          q,
                          q,
                          t,
                          k[l]
                        );
                    c.generateMipmaps &&
                      p &&
                      j.generateMipmap(j.TEXTURE_CUBE_MAP);
                    c.needsUpdate = !1;
                    if (c.onUpdate) c.onUpdate();
                  } else
                    j.activeTexture(j.TEXTURE0 + f),
                      j.bindTexture(
                        j.TEXTURE_CUBE_MAP,
                        c.image.__webglTextureCube
                      );
              } else
                q instanceof THREE.WebGLRenderTargetCube
                  ? ((c = q),
                    j.activeTexture(j.TEXTURE0 + k),
                    j.bindTexture(j.TEXTURE_CUBE_MAP, c.__webglTexture))
                  : K.setTexture(q, k);
          } else if ("tv" === l) {
            void 0 === c._array && (c._array = []);
            l = 0;
            for (p = c.value.length; l < p; l++) c._array[l] = B();
            j.uniform1iv(f, c._array);
            l = 0;
            for (p = c.value.length; l < p; l++)
              (q = c.value[l]), (k = c._array[l]), q && K.setTexture(q, k);
          } else
            console.warn("THREE.WebGLRenderer: Unknown uniform type: " + l);
      if (
        (d instanceof THREE.ShaderMaterial ||
          d instanceof THREE.MeshPhongMaterial ||
          d.envMap) &&
        null !== h.cameraPosition
      )
        sa.getPositionFromMatrix(a.matrixWorld),
          j.uniform3f(h.cameraPosition, sa.x, sa.y, sa.z);
      (d instanceof THREE.MeshPhongMaterial ||
        d instanceof THREE.MeshLambertMaterial ||
        d instanceof THREE.ShaderMaterial ||
        d.skinning) &&
        null !== h.viewMatrix &&
        j.uniformMatrix4fv(h.viewMatrix, !1, a.matrixWorldInverse.elements);
    }
    j.uniformMatrix4fv(h.modelViewMatrix, !1, e._modelViewMatrix.elements);
    h.normalMatrix &&
      j.uniformMatrix3fv(h.normalMatrix, !1, e._normalMatrix.elements);
    null !== h.modelMatrix &&
      j.uniformMatrix4fv(h.modelMatrix, !1, e.matrixWorld.elements);
    return g;
  }
  function B() {
    var a = P;
    a >= Mb &&
      console.warn(
        "WebGLRenderer: trying to use " +
          a +
          " texture units while this GPU supports only " +
          Mb
      );
    P += 1;
    return a;
  }
  function D(a, b, c, d) {
    a[b] = c.r * c.r * d;
    a[b + 1] = c.g * c.g * d;
    a[b + 2] = c.b * c.b * d;
  }
  function x(a, b, c, d) {
    a[b] = c.r * d;
    a[b + 1] = c.g * d;
    a[b + 2] = c.b * d;
  }
  function F(a) {
    a !== xa && (j.lineWidth(a), (xa = a));
  }
  function A(a, b, c) {
    Da !== a &&
      (a ? j.enable(j.POLYGON_OFFSET_FILL) : j.disable(j.POLYGON_OFFSET_FILL),
      (Da = a));
    if (a && (Ua !== b || Qa !== c)) j.polygonOffset(b, c), (Ua = b), (Qa = c);
  }
  function O(a) {
    for (var a = a.split("\n"), b = 0, c = a.length; b < c; b++)
      a[b] = b + 1 + ": " + a[b];
    return a.join("\n");
  }
  function C(a, b) {
    var c;
    "fragment" === a
      ? (c = j.createShader(j.FRAGMENT_SHADER))
      : "vertex" === a && (c = j.createShader(j.VERTEX_SHADER));
    j.shaderSource(c, b);
    j.compileShader(c);
    return !j.getShaderParameter(c, j.COMPILE_STATUS)
      ? (console.error(j.getShaderInfoLog(c)), console.error(O(b)), null)
      : c;
  }
  function E(a, b, c) {
    c
      ? (j.texParameteri(a, j.TEXTURE_WRAP_S, v(b.wrapS)),
        j.texParameteri(a, j.TEXTURE_WRAP_T, v(b.wrapT)),
        j.texParameteri(a, j.TEXTURE_MAG_FILTER, v(b.magFilter)),
        j.texParameteri(a, j.TEXTURE_MIN_FILTER, v(b.minFilter)))
      : (j.texParameteri(a, j.TEXTURE_WRAP_S, j.CLAMP_TO_EDGE),
        j.texParameteri(a, j.TEXTURE_WRAP_T, j.CLAMP_TO_EDGE),
        j.texParameteri(a, j.TEXTURE_MAG_FILTER, y(b.magFilter)),
        j.texParameteri(a, j.TEXTURE_MIN_FILTER, y(b.minFilter)));
    if (
      wa &&
      b.type !== THREE.FloatType &&
      (1 < b.anisotropy || b.__oldAnisotropy)
    )
      j.texParameterf(
        a,
        wa.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(b.anisotropy, Nb)
      ),
        (b.__oldAnisotropy = b.anisotropy);
  }
  function I(a, b) {
    j.bindRenderbuffer(j.RENDERBUFFER, a);
    b.depthBuffer && !b.stencilBuffer
      ? (j.renderbufferStorage(
          j.RENDERBUFFER,
          j.DEPTH_COMPONENT16,
          b.width,
          b.height
        ),
        j.framebufferRenderbuffer(
          j.FRAMEBUFFER,
          j.DEPTH_ATTACHMENT,
          j.RENDERBUFFER,
          a
        ))
      : b.depthBuffer && b.stencilBuffer
      ? (j.renderbufferStorage(
          j.RENDERBUFFER,
          j.DEPTH_STENCIL,
          b.width,
          b.height
        ),
        j.framebufferRenderbuffer(
          j.FRAMEBUFFER,
          j.DEPTH_STENCIL_ATTACHMENT,
          j.RENDERBUFFER,
          a
        ))
      : j.renderbufferStorage(j.RENDERBUFFER, j.RGBA4, b.width, b.height);
  }
  function y(a) {
    return a === THREE.NearestFilter ||
      a === THREE.NearestMipMapNearestFilter ||
      a === THREE.NearestMipMapLinearFilter
      ? j.NEAREST
      : j.LINEAR;
  }
  function v(a) {
    if (a === THREE.RepeatWrapping) return j.REPEAT;
    if (a === THREE.ClampToEdgeWrapping) return j.CLAMP_TO_EDGE;
    if (a === THREE.MirroredRepeatWrapping) return j.MIRRORED_REPEAT;
    if (a === THREE.NearestFilter) return j.NEAREST;
    if (a === THREE.NearestMipMapNearestFilter) return j.NEAREST_MIPMAP_NEAREST;
    if (a === THREE.NearestMipMapLinearFilter) return j.NEAREST_MIPMAP_LINEAR;
    if (a === THREE.LinearFilter) return j.LINEAR;
    if (a === THREE.LinearMipMapNearestFilter) return j.LINEAR_MIPMAP_NEAREST;
    if (a === THREE.LinearMipMapLinearFilter) return j.LINEAR_MIPMAP_LINEAR;
    if (a === THREE.UnsignedByteType) return j.UNSIGNED_BYTE;
    if (a === THREE.UnsignedShort4444Type) return j.UNSIGNED_SHORT_4_4_4_4;
    if (a === THREE.UnsignedShort5551Type) return j.UNSIGNED_SHORT_5_5_5_1;
    if (a === THREE.UnsignedShort565Type) return j.UNSIGNED_SHORT_5_6_5;
    if (a === THREE.ByteType) return j.BYTE;
    if (a === THREE.ShortType) return j.SHORT;
    if (a === THREE.UnsignedShortType) return j.UNSIGNED_SHORT;
    if (a === THREE.IntType) return j.INT;
    if (a === THREE.UnsignedIntType) return j.UNSIGNED_INT;
    if (a === THREE.FloatType) return j.FLOAT;
    if (a === THREE.AlphaFormat) return j.ALPHA;
    if (a === THREE.RGBFormat) return j.RGB;
    if (a === THREE.RGBAFormat) return j.RGBA;
    if (a === THREE.LuminanceFormat) return j.LUMINANCE;
    if (a === THREE.LuminanceAlphaFormat) return j.LUMINANCE_ALPHA;
    if (a === THREE.AddEquation) return j.FUNC_ADD;
    if (a === THREE.SubtractEquation) return j.FUNC_SUBTRACT;
    if (a === THREE.ReverseSubtractEquation) return j.FUNC_REVERSE_SUBTRACT;
    if (a === THREE.ZeroFactor) return j.ZERO;
    if (a === THREE.OneFactor) return j.ONE;
    if (a === THREE.SrcColorFactor) return j.SRC_COLOR;
    if (a === THREE.OneMinusSrcColorFactor) return j.ONE_MINUS_SRC_COLOR;
    if (a === THREE.SrcAlphaFactor) return j.SRC_ALPHA;
    if (a === THREE.OneMinusSrcAlphaFactor) return j.ONE_MINUS_SRC_ALPHA;
    if (a === THREE.DstAlphaFactor) return j.DST_ALPHA;
    if (a === THREE.OneMinusDstAlphaFactor) return j.ONE_MINUS_DST_ALPHA;
    if (a === THREE.DstColorFactor) return j.DST_COLOR;
    if (a === THREE.OneMinusDstColorFactor) return j.ONE_MINUS_DST_COLOR;
    if (a === THREE.SrcAlphaSaturateFactor) return j.SRC_ALPHA_SATURATE;
    if (void 0 !== Ea) {
      if (a === THREE.RGB_S3TC_DXT1_Format)
        return Ea.COMPRESSED_RGB_S3TC_DXT1_EXT;
      if (a === THREE.RGBA_S3TC_DXT1_Format)
        return Ea.COMPRESSED_RGBA_S3TC_DXT1_EXT;
      if (a === THREE.RGBA_S3TC_DXT3_Format)
        return Ea.COMPRESSED_RGBA_S3TC_DXT3_EXT;
      if (a === THREE.RGBA_S3TC_DXT5_Format)
        return Ea.COMPRESSED_RGBA_S3TC_DXT5_EXT;
    }
    return 0;
  }
  console.log("THREE.WebGLRenderer", THREE.REVISION);
  var a = a || {},
    G = void 0 !== a.canvas ? a.canvas : document.createElement("canvas"),
    R = void 0 !== a.precision ? a.precision : "highp",
    J = void 0 !== a.alpha ? a.alpha : !0,
    ba = void 0 !== a.premultipliedAlpha ? a.premultipliedAlpha : !0,
    oa = void 0 !== a.antialias ? a.antialias : !1,
    pa = void 0 !== a.stencil ? a.stencil : !0,
    N = void 0 !== a.preserveDrawingBuffer ? a.preserveDrawingBuffer : !1,
    M = new THREE.Color(0),
    Q = 0;
  this.domElement = G;
  this.context = null;
  this.devicePixelRatio =
    void 0 !== a.devicePixelRatio
      ? a.devicePixelRatio
      : void 0 !== self.devicePixelRatio
      ? self.devicePixelRatio
      : 1;
  this.autoUpdateObjects =
    this.sortObjects =
    this.autoClearStencil =
    this.autoClearDepth =
    this.autoClearColor =
    this.autoClear =
      !0;
  this.shadowMapEnabled =
    this.physicallyBasedShading =
    this.gammaOutput =
    this.gammaInput =
      !1;
  this.shadowMapAutoUpdate = !0;
  this.shadowMapType = THREE.PCFShadowMap;
  this.shadowMapCullFace = THREE.CullFaceFront;
  this.shadowMapCascade = this.shadowMapDebug = !1;
  this.maxMorphTargets = 8;
  this.maxMorphNormals = 4;
  this.autoScaleCubemaps = !0;
  this.renderPluginsPre = [];
  this.renderPluginsPost = [];
  this.info = {
    memory: { programs: 0, geometries: 0, textures: 0 },
    render: { calls: 0, vertices: 0, faces: 0, points: 0 },
  };
  var K = this,
    ca = [],
    Fa = 0,
    Ba = null,
    da = null,
    Aa = -1,
    $ = null,
    ea = null,
    V = 0,
    P = 0,
    Z = -1,
    U = -1,
    ka = -1,
    ta = -1,
    ia = -1,
    La = -1,
    Ga = -1,
    fa = -1,
    Da = null,
    Ua = null,
    Qa = null,
    xa = null,
    bb = 0,
    cb = 0,
    Ma = G.width,
    fb = G.height,
    sb = 0,
    pb = 0,
    Ha = {},
    la = new THREE.Frustum(),
    ra = new THREE.Matrix4(),
    gb = new THREE.Matrix4(),
    sa = new THREE.Vector3(),
    ga = new THREE.Vector3(),
    ua = !0,
    Pa = {
      ambient: [0, 0, 0],
      directional: { length: 0, colors: [], positions: [] },
      point: { length: 0, colors: [], positions: [], distances: [] },
      spot: {
        length: 0,
        colors: [],
        positions: [],
        distances: [],
        directions: [],
        anglesCos: [],
        exponents: [],
      },
      hemi: { length: 0, skyColors: [], groundColors: [], positions: [] },
    },
    j,
    Oa,
    va,
    wa,
    Ea;
  try {
    var Ra = {
      alpha: J,
      premultipliedAlpha: ba,
      antialias: oa,
      stencil: pa,
      preserveDrawingBuffer: N,
    };
    j = G.getContext("webgl", Ra) || G.getContext("experimental-webgl", Ra);
    if (null === j) throw "Error creating WebGL context.";
  } catch (Zb) {
    console.error(Zb);
  }
  Oa = j.getExtension("OES_texture_float");
  j.getExtension("OES_texture_float_linear");
  va = j.getExtension("OES_standard_derivatives");
  wa =
    j.getExtension("EXT_texture_filter_anisotropic") ||
    j.getExtension("MOZ_EXT_texture_filter_anisotropic") ||
    j.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
  Ea =
    j.getExtension("WEBGL_compressed_texture_s3tc") ||
    j.getExtension("MOZ_WEBGL_compressed_texture_s3tc") ||
    j.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");
  Oa || console.log("THREE.WebGLRenderer: Float textures not supported.");
  va || console.log("THREE.WebGLRenderer: Standard derivatives not supported.");
  wa ||
    console.log(
      "THREE.WebGLRenderer: Anisotropic texture filtering not supported."
    );
  Ea ||
    console.log("THREE.WebGLRenderer: S3TC compressed textures not supported.");
  void 0 === j.getShaderPrecisionFormat &&
    (j.getShaderPrecisionFormat = function () {
      return { rangeMin: 1, rangeMax: 1, precision: 1 };
    });
  j.clearColor(0, 0, 0, 1);
  j.clearDepth(1);
  j.clearStencil(0);
  j.enable(j.DEPTH_TEST);
  j.depthFunc(j.LEQUAL);
  j.frontFace(j.CCW);
  j.cullFace(j.BACK);
  j.enable(j.CULL_FACE);
  j.enable(j.BLEND);
  j.blendEquation(j.FUNC_ADD);
  j.blendFunc(j.SRC_ALPHA, j.ONE_MINUS_SRC_ALPHA);
  j.viewport(bb, cb, Ma, fb);
  j.clearColor(M.r, M.g, M.b, Q);
  this.context = j;
  var Mb = j.getParameter(j.MAX_TEXTURE_IMAGE_UNITS),
    $b = j.getParameter(j.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
  j.getParameter(j.MAX_TEXTURE_SIZE);
  var ac = j.getParameter(j.MAX_CUBE_MAP_TEXTURE_SIZE),
    Nb = wa ? j.getParameter(wa.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0,
    Bb = 0 < $b,
    yb = Bb && Oa;
  Ea && j.getParameter(j.COMPRESSED_TEXTURE_FORMATS);
  var bc = j.getShaderPrecisionFormat(j.VERTEX_SHADER, j.HIGH_FLOAT),
    cc = j.getShaderPrecisionFormat(j.VERTEX_SHADER, j.MEDIUM_FLOAT);
  j.getShaderPrecisionFormat(j.VERTEX_SHADER, j.LOW_FLOAT);
  var qc = j.getShaderPrecisionFormat(j.FRAGMENT_SHADER, j.HIGH_FLOAT),
    rc = j.getShaderPrecisionFormat(j.FRAGMENT_SHADER, j.MEDIUM_FLOAT);
  j.getShaderPrecisionFormat(j.FRAGMENT_SHADER, j.LOW_FLOAT);
  j.getShaderPrecisionFormat(j.VERTEX_SHADER, j.HIGH_INT);
  j.getShaderPrecisionFormat(j.VERTEX_SHADER, j.MEDIUM_INT);
  j.getShaderPrecisionFormat(j.VERTEX_SHADER, j.LOW_INT);
  j.getShaderPrecisionFormat(j.FRAGMENT_SHADER, j.HIGH_INT);
  j.getShaderPrecisionFormat(j.FRAGMENT_SHADER, j.MEDIUM_INT);
  j.getShaderPrecisionFormat(j.FRAGMENT_SHADER, j.LOW_INT);
  var sc = 0 < bc.precision && 0 < qc.precision,
    Ob = 0 < cc.precision && 0 < rc.precision;
  "highp" === R &&
    !sc &&
    (Ob
      ? ((R = "mediump"),
        console.warn("WebGLRenderer: highp not supported, using mediump"))
      : ((R = "lowp"),
        console.warn(
          "WebGLRenderer: highp and mediump not supported, using lowp"
        )));
  "mediump" === R &&
    !Ob &&
    ((R = "lowp"),
    console.warn("WebGLRenderer: mediump not supported, using lowp"));
  this.getContext = function () {
    return j;
  };
  this.supportsVertexTextures = function () {
    return Bb;
  };
  this.supportsFloatTextures = function () {
    return Oa;
  };
  this.supportsStandardDerivatives = function () {
    return va;
  };
  this.supportsCompressedTextureS3TC = function () {
    return Ea;
  };
  this.getMaxAnisotropy = function () {
    return Nb;
  };
  this.getPrecision = function () {
    return R;
  };
  this.setSize = function (a, b, c) {
    G.width = a * this.devicePixelRatio;
    G.height = b * this.devicePixelRatio;
    1 !== this.devicePixelRatio &&
      !1 !== c &&
      ((G.style.width = a + "px"), (G.style.height = b + "px"));
    this.setViewport(0, 0, G.width, G.height);
  };
  this.setViewport = function (a, b, c, d) {
    bb = void 0 !== a ? a : 0;
    cb = void 0 !== b ? b : 0;
    Ma = void 0 !== c ? c : G.width;
    fb = void 0 !== d ? d : G.height;
    j.viewport(bb, cb, Ma, fb);
  };
  this.setScissor = function (a, b, c, d) {
    j.scissor(a, b, c, d);
  };
  this.enableScissorTest = function (a) {
    a ? j.enable(j.SCISSOR_TEST) : j.disable(j.SCISSOR_TEST);
  };
  this.setClearColor = function (a, b) {
    M.set(a);
    Q = void 0 !== b ? b : 1;
    j.clearColor(M.r, M.g, M.b, Q);
  };
  this.setClearColorHex = function (a, b) {
    console.warn(
      "DEPRECATED: .setClearColorHex() is being removed. Use .setClearColor() instead."
    );
    this.setClearColor(a, b);
  };
  this.getClearColor = function () {
    return M;
  };
  this.getClearAlpha = function () {
    return Q;
  };
  this.clear = function (a, b, c) {
    var d = 0;
    if (void 0 === a || a) d |= j.COLOR_BUFFER_BIT;
    if (void 0 === b || b) d |= j.DEPTH_BUFFER_BIT;
    if (void 0 === c || c) d |= j.STENCIL_BUFFER_BIT;
    j.clear(d);
  };
  this.clearTarget = function (a, b, c, d) {
    this.setRenderTarget(a);
    this.clear(b, c, d);
  };
  this.addPostPlugin = function (a) {
    a.init(this);
    this.renderPluginsPost.push(a);
  };
  this.addPrePlugin = function (a) {
    a.init(this);
    this.renderPluginsPre.push(a);
  };
  this.updateShadowMap = function (a, b) {
    Ba = null;
    Aa = $ = fa = Ga = ka = -1;
    ua = !0;
    U = Z = -1;
    this.shadowMapPlugin.update(a, b);
  };
  var Cb = function (a) {
      a = a.target;
      a.removeEventListener("dispose", Cb);
      a.__webglInit = void 0;
      if (a instanceof THREE.BufferGeometry) {
        var b = a.attributes,
          c;
        for (c in b) void 0 !== b[c].buffer && j.deleteBuffer(b[c].buffer);
        K.info.memory.geometries--;
      } else if (void 0 !== a.geometryGroups)
        for (b in a.geometryGroups) {
          c = a.geometryGroups[b];
          if (void 0 !== c.numMorphTargets)
            for (var d = 0, e = c.numMorphTargets; d < e; d++)
              j.deleteBuffer(c.__webglMorphTargetsBuffers[d]);
          if (void 0 !== c.numMorphNormals) {
            d = 0;
            for (e = c.numMorphNormals; d < e; d++)
              j.deleteBuffer(c.__webglMorphNormalsBuffers[d]);
          }
          Hb(c);
        }
      else Hb(a);
    },
    Db = function (a) {
      a = a.target;
      a.removeEventListener("dispose", Db);
      a.image && a.image.__webglTextureCube
        ? j.deleteTexture(a.image.__webglTextureCube)
        : a.__webglInit &&
          ((a.__webglInit = !1), j.deleteTexture(a.__webglTexture));
      K.info.memory.textures--;
    },
    Eb = function (a) {
      a = a.target;
      a.removeEventListener("dispose", Eb);
      if (a && a.__webglTexture)
        if (
          (j.deleteTexture(a.__webglTexture),
          a instanceof THREE.WebGLRenderTargetCube)
        )
          for (var b = 0; 6 > b; b++)
            j.deleteFramebuffer(a.__webglFramebuffer[b]),
              j.deleteRenderbuffer(a.__webglRenderbuffer[b]);
        else
          j.deleteFramebuffer(a.__webglFramebuffer),
            j.deleteRenderbuffer(a.__webglRenderbuffer);
      K.info.memory.textures--;
    },
    Fb = function (a) {
      a = a.target;
      a.removeEventListener("dispose", Fb);
      Gb(a);
    },
    Hb = function (a) {
      void 0 !== a.__webglVertexBuffer && j.deleteBuffer(a.__webglVertexBuffer);
      void 0 !== a.__webglNormalBuffer && j.deleteBuffer(a.__webglNormalBuffer);
      void 0 !== a.__webglTangentBuffer &&
        j.deleteBuffer(a.__webglTangentBuffer);
      void 0 !== a.__webglColorBuffer && j.deleteBuffer(a.__webglColorBuffer);
      void 0 !== a.__webglUVBuffer && j.deleteBuffer(a.__webglUVBuffer);
      void 0 !== a.__webglUV2Buffer && j.deleteBuffer(a.__webglUV2Buffer);
      void 0 !== a.__webglSkinIndicesBuffer &&
        j.deleteBuffer(a.__webglSkinIndicesBuffer);
      void 0 !== a.__webglSkinWeightsBuffer &&
        j.deleteBuffer(a.__webglSkinWeightsBuffer);
      void 0 !== a.__webglFaceBuffer && j.deleteBuffer(a.__webglFaceBuffer);
      void 0 !== a.__webglLineBuffer && j.deleteBuffer(a.__webglLineBuffer);
      void 0 !== a.__webglLineDistanceBuffer &&
        j.deleteBuffer(a.__webglLineDistanceBuffer);
      if (void 0 !== a.__webglCustomAttributesList)
        for (var b in a.__webglCustomAttributesList)
          j.deleteBuffer(a.__webglCustomAttributesList[b].buffer);
      K.info.memory.geometries--;
    },
    Gb = function (a) {
      var b = a.program;
      if (void 0 !== b) {
        a.program = void 0;
        var c,
          d,
          e = !1,
          a = 0;
        for (c = ca.length; a < c; a++)
          if (((d = ca[a]), d.program === b)) {
            d.usedTimes--;
            0 === d.usedTimes && (e = !0);
            break;
          }
        if (!0 === e) {
          e = [];
          a = 0;
          for (c = ca.length; a < c; a++)
            (d = ca[a]), d.program !== b && e.push(d);
          ca = e;
          j.deleteProgram(b);
          K.info.memory.programs--;
        }
      }
    };
  this.renderBufferImmediate = function (a, b, c) {
    a.hasPositions &&
      !a.__webglVertexBuffer &&
      (a.__webglVertexBuffer = j.createBuffer());
    a.hasNormals &&
      !a.__webglNormalBuffer &&
      (a.__webglNormalBuffer = j.createBuffer());
    a.hasUvs && !a.__webglUvBuffer && (a.__webglUvBuffer = j.createBuffer());
    a.hasColors &&
      !a.__webglColorBuffer &&
      (a.__webglColorBuffer = j.createBuffer());
    a.hasPositions &&
      (j.bindBuffer(j.ARRAY_BUFFER, a.__webglVertexBuffer),
      j.bufferData(j.ARRAY_BUFFER, a.positionArray, j.DYNAMIC_DRAW),
      j.enableVertexAttribArray(b.attributes.position),
      j.vertexAttribPointer(b.attributes.position, 3, j.FLOAT, !1, 0, 0));
    if (a.hasNormals) {
      j.bindBuffer(j.ARRAY_BUFFER, a.__webglNormalBuffer);
      if (c.shading === THREE.FlatShading) {
        var d,
          e,
          f,
          h,
          g,
          i,
          k,
          l,
          m,
          p,
          n,
          q = 3 * a.count;
        for (n = 0; n < q; n += 9)
          (p = a.normalArray),
            (d = p[n]),
            (e = p[n + 1]),
            (f = p[n + 2]),
            (h = p[n + 3]),
            (i = p[n + 4]),
            (l = p[n + 5]),
            (g = p[n + 6]),
            (k = p[n + 7]),
            (m = p[n + 8]),
            (d = (d + h + g) / 3),
            (e = (e + i + k) / 3),
            (f = (f + l + m) / 3),
            (p[n] = d),
            (p[n + 1] = e),
            (p[n + 2] = f),
            (p[n + 3] = d),
            (p[n + 4] = e),
            (p[n + 5] = f),
            (p[n + 6] = d),
            (p[n + 7] = e),
            (p[n + 8] = f);
      }
      j.bufferData(j.ARRAY_BUFFER, a.normalArray, j.DYNAMIC_DRAW);
      j.enableVertexAttribArray(b.attributes.normal);
      j.vertexAttribPointer(b.attributes.normal, 3, j.FLOAT, !1, 0, 0);
    }
    a.hasUvs &&
      c.map &&
      (j.bindBuffer(j.ARRAY_BUFFER, a.__webglUvBuffer),
      j.bufferData(j.ARRAY_BUFFER, a.uvArray, j.DYNAMIC_DRAW),
      j.enableVertexAttribArray(b.attributes.uv),
      j.vertexAttribPointer(b.attributes.uv, 2, j.FLOAT, !1, 0, 0));
    a.hasColors &&
      c.vertexColors !== THREE.NoColors &&
      (j.bindBuffer(j.ARRAY_BUFFER, a.__webglColorBuffer),
      j.bufferData(j.ARRAY_BUFFER, a.colorArray, j.DYNAMIC_DRAW),
      j.enableVertexAttribArray(b.attributes.color),
      j.vertexAttribPointer(b.attributes.color, 3, j.FLOAT, !1, 0, 0));
    j.drawArrays(j.TRIANGLES, 0, a.count);
    a.count = 0;
  };
  this.renderBufferDirect = function (a, b, c, d, e, f) {
    if (!1 !== d.visible) {
      var i, k, l, m;
      i = z(a, b, c, d, f);
      b = i.attributes;
      a = e.attributes;
      c = !1;
      i = 16777215 * e.id + 2 * i.id + (d.wireframe ? 1 : 0);
      i !== $ && (($ = i), (c = !0));
      c && g();
      if (f instanceof THREE.Mesh)
        if ((f = a.index)) {
          e = e.offsets;
          1 < e.length && (c = !0);
          for (var p = 0, n = e.length; p < n; p++) {
            var q = e[p].index;
            if (c) {
              for (k in b)
                (l = b[k]),
                  (i = a[k]),
                  0 <= l &&
                    (i
                      ? ((m = i.itemSize),
                        j.bindBuffer(j.ARRAY_BUFFER, i.buffer),
                        h(l),
                        j.vertexAttribPointer(l, m, j.FLOAT, !1, 0, 4 * q * m))
                      : d.defaultAttributeValues &&
                        (2 === d.defaultAttributeValues[k].length
                          ? j.vertexAttrib2fv(l, d.defaultAttributeValues[k])
                          : 3 === d.defaultAttributeValues[k].length &&
                            j.vertexAttrib3fv(l, d.defaultAttributeValues[k])));
              j.bindBuffer(j.ELEMENT_ARRAY_BUFFER, f.buffer);
            }
            j.drawElements(
              j.TRIANGLES,
              e[p].count,
              j.UNSIGNED_SHORT,
              2 * e[p].start
            );
            K.info.render.calls++;
            K.info.render.vertices += e[p].count;
            K.info.render.faces += e[p].count / 3;
          }
        } else {
          if (c)
            for (k in b)
              "index" !== k &&
                ((l = b[k]),
                (i = a[k]),
                0 <= l &&
                  (i
                    ? ((m = i.itemSize),
                      j.bindBuffer(j.ARRAY_BUFFER, i.buffer),
                      h(l),
                      j.vertexAttribPointer(l, m, j.FLOAT, !1, 0, 0))
                    : d.defaultAttributeValues &&
                      d.defaultAttributeValues[k] &&
                      (2 === d.defaultAttributeValues[k].length
                        ? j.vertexAttrib2fv(l, d.defaultAttributeValues[k])
                        : 3 === d.defaultAttributeValues[k].length &&
                          j.vertexAttrib3fv(l, d.defaultAttributeValues[k]))));
          d = e.attributes.position;
          j.drawArrays(j.TRIANGLES, 0, d.numItems / 3);
          K.info.render.calls++;
          K.info.render.vertices += d.numItems / 3;
          K.info.render.faces += d.numItems / 3 / 3;
        }
      else if (f instanceof THREE.ParticleSystem) {
        if (c) {
          for (k in b)
            (l = b[k]),
              (i = a[k]),
              0 <= l &&
                (i
                  ? ((m = i.itemSize),
                    j.bindBuffer(j.ARRAY_BUFFER, i.buffer),
                    h(l),
                    j.vertexAttribPointer(l, m, j.FLOAT, !1, 0, 0))
                  : d.defaultAttributeValues &&
                    d.defaultAttributeValues[k] &&
                    (2 === d.defaultAttributeValues[k].length
                      ? j.vertexAttrib2fv(l, d.defaultAttributeValues[k])
                      : 3 === d.defaultAttributeValues[k].length &&
                        j.vertexAttrib3fv(l, d.defaultAttributeValues[k])));
          d = a.position;
          j.drawArrays(j.POINTS, 0, d.numItems / 3);
          K.info.render.calls++;
          K.info.render.points += d.numItems / 3;
        }
      } else if (f instanceof THREE.Line && c) {
        for (k in b)
          (l = b[k]),
            (i = a[k]),
            0 <= l &&
              (i
                ? ((m = i.itemSize),
                  j.bindBuffer(j.ARRAY_BUFFER, i.buffer),
                  h(l),
                  j.vertexAttribPointer(l, m, j.FLOAT, !1, 0, 0))
                : d.defaultAttributeValues &&
                  d.defaultAttributeValues[k] &&
                  (2 === d.defaultAttributeValues[k].length
                    ? j.vertexAttrib2fv(l, d.defaultAttributeValues[k])
                    : 3 === d.defaultAttributeValues[k].length &&
                      j.vertexAttrib3fv(l, d.defaultAttributeValues[k])));
        k = f.type === THREE.LineStrip ? j.LINE_STRIP : j.LINES;
        F(d.linewidth);
        d = a.position;
        j.drawArrays(k, 0, d.numItems / 3);
        K.info.render.calls++;
        K.info.render.points += d.numItems;
      }
    }
  };
  this.renderBuffer = function (a, b, c, d, e, f) {
    if (!1 !== d.visible) {
      var i,
        l,
        c = z(a, b, c, d, f),
        a = c.attributes,
        b = !1,
        c = 16777215 * e.id + 2 * c.id + (d.wireframe ? 1 : 0);
      c !== $ && (($ = c), (b = !0));
      b && g();
      if (!d.morphTargets && 0 <= a.position)
        b &&
          (j.bindBuffer(j.ARRAY_BUFFER, e.__webglVertexBuffer),
          h(a.position),
          j.vertexAttribPointer(a.position, 3, j.FLOAT, !1, 0, 0));
      else if (f.morphTargetBase) {
        c = d.program.attributes;
        -1 !== f.morphTargetBase && 0 <= c.position
          ? (j.bindBuffer(
              j.ARRAY_BUFFER,
              e.__webglMorphTargetsBuffers[f.morphTargetBase]
            ),
            h(c.position),
            j.vertexAttribPointer(c.position, 3, j.FLOAT, !1, 0, 0))
          : 0 <= c.position &&
            (j.bindBuffer(j.ARRAY_BUFFER, e.__webglVertexBuffer),
            h(c.position),
            j.vertexAttribPointer(c.position, 3, j.FLOAT, !1, 0, 0));
        if (f.morphTargetForcedOrder.length) {
          var m = 0;
          l = f.morphTargetForcedOrder;
          for (
            i = f.morphTargetInfluences;
            m < d.numSupportedMorphTargets && m < l.length;

          )
            0 <= c["morphTarget" + m] &&
              (j.bindBuffer(j.ARRAY_BUFFER, e.__webglMorphTargetsBuffers[l[m]]),
              h(c["morphTarget" + m]),
              j.vertexAttribPointer(
                c["morphTarget" + m],
                3,
                j.FLOAT,
                !1,
                0,
                0
              )),
              0 <= c["morphNormal" + m] &&
                d.morphNormals &&
                (j.bindBuffer(
                  j.ARRAY_BUFFER,
                  e.__webglMorphNormalsBuffers[l[m]]
                ),
                h(c["morphNormal" + m]),
                j.vertexAttribPointer(
                  c["morphNormal" + m],
                  3,
                  j.FLOAT,
                  !1,
                  0,
                  0
                )),
              (f.__webglMorphTargetInfluences[m] = i[l[m]]),
              m++;
        } else {
          l = [];
          i = f.morphTargetInfluences;
          var p,
            n = i.length;
          for (p = 0; p < n; p++) (m = i[p]), 0 < m && l.push([m, p]);
          l.length > d.numSupportedMorphTargets
            ? (l.sort(k), (l.length = d.numSupportedMorphTargets))
            : l.length > d.numSupportedMorphNormals
            ? l.sort(k)
            : 0 === l.length && l.push([0, 0]);
          for (m = 0; m < d.numSupportedMorphTargets; )
            l[m]
              ? ((p = l[m][1]),
                0 <= c["morphTarget" + m] &&
                  (j.bindBuffer(
                    j.ARRAY_BUFFER,
                    e.__webglMorphTargetsBuffers[p]
                  ),
                  h(c["morphTarget" + m]),
                  j.vertexAttribPointer(
                    c["morphTarget" + m],
                    3,
                    j.FLOAT,
                    !1,
                    0,
                    0
                  )),
                0 <= c["morphNormal" + m] &&
                  d.morphNormals &&
                  (j.bindBuffer(
                    j.ARRAY_BUFFER,
                    e.__webglMorphNormalsBuffers[p]
                  ),
                  h(c["morphNormal" + m]),
                  j.vertexAttribPointer(
                    c["morphNormal" + m],
                    3,
                    j.FLOAT,
                    !1,
                    0,
                    0
                  )),
                (f.__webglMorphTargetInfluences[m] = i[p]))
              : (f.__webglMorphTargetInfluences[m] = 0),
              m++;
        }
        null !== d.program.uniforms.morphTargetInfluences &&
          j.uniform1fv(
            d.program.uniforms.morphTargetInfluences,
            f.__webglMorphTargetInfluences
          );
      }
      if (b) {
        if (e.__webglCustomAttributesList) {
          i = 0;
          for (l = e.__webglCustomAttributesList.length; i < l; i++)
            (c = e.__webglCustomAttributesList[i]),
              0 <= a[c.buffer.belongsToAttribute] &&
                (j.bindBuffer(j.ARRAY_BUFFER, c.buffer),
                h(a[c.buffer.belongsToAttribute]),
                j.vertexAttribPointer(
                  a[c.buffer.belongsToAttribute],
                  c.size,
                  j.FLOAT,
                  !1,
                  0,
                  0
                ));
        }
        0 <= a.color &&
          (0 < f.geometry.colors.length || 0 < f.geometry.faces.length
            ? (j.bindBuffer(j.ARRAY_BUFFER, e.__webglColorBuffer),
              h(a.color),
              j.vertexAttribPointer(a.color, 3, j.FLOAT, !1, 0, 0))
            : d.defaultAttributeValues &&
              j.vertexAttrib3fv(a.color, d.defaultAttributeValues.color));
        0 <= a.normal &&
          (j.bindBuffer(j.ARRAY_BUFFER, e.__webglNormalBuffer),
          h(a.normal),
          j.vertexAttribPointer(a.normal, 3, j.FLOAT, !1, 0, 0));
        0 <= a.tangent &&
          (j.bindBuffer(j.ARRAY_BUFFER, e.__webglTangentBuffer),
          h(a.tangent),
          j.vertexAttribPointer(a.tangent, 4, j.FLOAT, !1, 0, 0));
        0 <= a.uv &&
          (f.geometry.faceVertexUvs[0]
            ? (j.bindBuffer(j.ARRAY_BUFFER, e.__webglUVBuffer),
              h(a.uv),
              j.vertexAttribPointer(a.uv, 2, j.FLOAT, !1, 0, 0))
            : d.defaultAttributeValues &&
              j.vertexAttrib2fv(a.uv, d.defaultAttributeValues.uv));
        0 <= a.uv2 &&
          (f.geometry.faceVertexUvs[1]
            ? (j.bindBuffer(j.ARRAY_BUFFER, e.__webglUV2Buffer),
              h(a.uv2),
              j.vertexAttribPointer(a.uv2, 2, j.FLOAT, !1, 0, 0))
            : d.defaultAttributeValues &&
              j.vertexAttrib2fv(a.uv2, d.defaultAttributeValues.uv2));
        d.skinning &&
          0 <= a.skinIndex &&
          0 <= a.skinWeight &&
          (j.bindBuffer(j.ARRAY_BUFFER, e.__webglSkinIndicesBuffer),
          h(a.skinIndex),
          j.vertexAttribPointer(a.skinIndex, 4, j.FLOAT, !1, 0, 0),
          j.bindBuffer(j.ARRAY_BUFFER, e.__webglSkinWeightsBuffer),
          h(a.skinWeight),
          j.vertexAttribPointer(a.skinWeight, 4, j.FLOAT, !1, 0, 0));
        0 <= a.lineDistance &&
          (j.bindBuffer(j.ARRAY_BUFFER, e.__webglLineDistanceBuffer),
          h(a.lineDistance),
          j.vertexAttribPointer(a.lineDistance, 1, j.FLOAT, !1, 0, 0));
      }
      f instanceof THREE.Mesh
        ? (d.wireframe
            ? (F(d.wireframeLinewidth),
              b && j.bindBuffer(j.ELEMENT_ARRAY_BUFFER, e.__webglLineBuffer),
              j.drawElements(j.LINES, e.__webglLineCount, j.UNSIGNED_SHORT, 0))
            : (b && j.bindBuffer(j.ELEMENT_ARRAY_BUFFER, e.__webglFaceBuffer),
              j.drawElements(
                j.TRIANGLES,
                e.__webglFaceCount,
                j.UNSIGNED_SHORT,
                0
              )),
          K.info.render.calls++,
          (K.info.render.vertices += e.__webglFaceCount),
          (K.info.render.faces += e.__webglFaceCount / 3))
        : f instanceof THREE.Line
        ? ((f = f.type === THREE.LineStrip ? j.LINE_STRIP : j.LINES),
          F(d.linewidth),
          j.drawArrays(f, 0, e.__webglLineCount),
          K.info.render.calls++)
        : f instanceof THREE.ParticleSystem &&
          (j.drawArrays(j.POINTS, 0, e.__webglParticleCount),
          K.info.render.calls++,
          (K.info.render.points += e.__webglParticleCount));
    }
  };
  this.render = function (a, b, c, d) {
    if (!1 === b instanceof THREE.Camera)
      console.error(
        "THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera."
      );
    else {
      var e,
        f,
        h,
        g,
        k = a.__lights,
        n = a.fog;
      Aa = -1;
      ua = !0;
      !0 === a.autoUpdate && a.updateMatrixWorld();
      void 0 === b.parent && b.updateMatrixWorld();
      b.matrixWorldInverse.getInverse(b.matrixWorld);
      ra.multiplyMatrices(b.projectionMatrix, b.matrixWorldInverse);
      la.setFromMatrix(ra);
      this.autoUpdateObjects && this.initWebGLObjects(a);
      m(this.renderPluginsPre, a, b);
      K.info.render.calls = 0;
      K.info.render.vertices = 0;
      K.info.render.faces = 0;
      K.info.render.points = 0;
      this.setRenderTarget(c);
      (this.autoClear || d) &&
        this.clear(
          this.autoClearColor,
          this.autoClearDepth,
          this.autoClearStencil
        );
      g = a.__webglObjects;
      d = 0;
      for (e = g.length; d < e; d++)
        if (
          ((f = g[d]),
          (h = f.object),
          (f.id = d),
          (f.render = !1),
          h.visible &&
            (!(h instanceof THREE.Mesh || h instanceof THREE.ParticleSystem) ||
              !h.frustumCulled ||
              la.intersectsObject(h)))
        ) {
          var q = h;
          q._modelViewMatrix.multiplyMatrices(
            b.matrixWorldInverse,
            q.matrixWorld
          );
          q._normalMatrix.getNormalMatrix(q._modelViewMatrix);
          var q = f,
            r = q.buffer,
            s = void 0,
            t = (s = void 0),
            t = q.object.material;
          if (t instanceof THREE.MeshFaceMaterial)
            (s = r.materialIndex),
              (s = t.materials[s]),
              s.transparent
                ? ((q.transparent = s), (q.opaque = null))
                : ((q.opaque = s), (q.transparent = null));
          else if ((s = t))
            s.transparent
              ? ((q.transparent = s), (q.opaque = null))
              : ((q.opaque = s), (q.transparent = null));
          f.render = !0;
          !0 === this.sortObjects &&
            (null !== h.renderDepth
              ? (f.z = h.renderDepth)
              : (sa.getPositionFromMatrix(h.matrixWorld),
                sa.applyProjection(ra),
                (f.z = sa.z)));
        }
      this.sortObjects && g.sort(i);
      g = a.__webglObjectsImmediate;
      d = 0;
      for (e = g.length; d < e; d++)
        (f = g[d]),
          (h = f.object),
          h.visible &&
            (h._modelViewMatrix.multiplyMatrices(
              b.matrixWorldInverse,
              h.matrixWorld
            ),
            h._normalMatrix.getNormalMatrix(h._modelViewMatrix),
            (h = f.object.material),
            h.transparent
              ? ((f.transparent = h), (f.opaque = null))
              : ((f.opaque = h), (f.transparent = null)));
      a.overrideMaterial
        ? ((d = a.overrideMaterial),
          this.setBlending(d.blending, d.blendEquation, d.blendSrc, d.blendDst),
          this.setDepthTest(d.depthTest),
          this.setDepthWrite(d.depthWrite),
          A(d.polygonOffset, d.polygonOffsetFactor, d.polygonOffsetUnits),
          l(a.__webglObjects, !1, "", b, k, n, !0, d),
          p(a.__webglObjectsImmediate, "", b, k, n, !1, d))
        : ((d = null),
          this.setBlending(THREE.NoBlending),
          l(a.__webglObjects, !0, "opaque", b, k, n, !1, d),
          p(a.__webglObjectsImmediate, "opaque", b, k, n, !1, d),
          l(a.__webglObjects, !1, "transparent", b, k, n, !0, d),
          p(a.__webglObjectsImmediate, "transparent", b, k, n, !0, d));
      m(this.renderPluginsPost, a, b);
      c &&
        c.generateMipmaps &&
        c.minFilter !== THREE.NearestFilter &&
        c.minFilter !== THREE.LinearFilter &&
        (c instanceof THREE.WebGLRenderTargetCube
          ? (j.bindTexture(j.TEXTURE_CUBE_MAP, c.__webglTexture),
            j.generateMipmap(j.TEXTURE_CUBE_MAP),
            j.bindTexture(j.TEXTURE_CUBE_MAP, null))
          : (j.bindTexture(j.TEXTURE_2D, c.__webglTexture),
            j.generateMipmap(j.TEXTURE_2D),
            j.bindTexture(j.TEXTURE_2D, null)));
      this.setDepthTest(!0);
      this.setDepthWrite(!0);
    }
  };
  this.renderImmediateObject = function (a, b, c, d, e) {
    var f = z(a, b, c, d, e);
    $ = -1;
    K.setMaterialFaces(d);
    e.immediateRenderCallback
      ? e.immediateRenderCallback(f, j, la)
      : e.render(function (a) {
          K.renderBufferImmediate(a, f, d);
        });
  };
  this.initWebGLObjects = function (a) {
    a.__webglObjects ||
      ((a.__webglObjects = []),
      (a.__webglObjectsImmediate = []),
      (a.__webglSprites = []),
      (a.__webglFlares = []));
    for (; a.__objectsAdded.length; )
      s(a.__objectsAdded[0], a), a.__objectsAdded.splice(0, 1);
    for (; a.__objectsRemoved.length; )
      q(a.__objectsRemoved[0], a), a.__objectsRemoved.splice(0, 1);
    for (var b = 0, h = a.__webglObjects.length; b < h; b++) {
      var g = a.__webglObjects[b].object;
      void 0 === g.__webglInit &&
        (void 0 !== g.__webglActive && q(g, a), s(g, a));
      var i = g,
        l = i.geometry,
        m = void 0,
        p = void 0,
        t = void 0;
      if (l instanceof THREE.BufferGeometry) {
        var u = j.DYNAMIC_DRAW,
          w = !l.dynamic,
          z = l.attributes,
          y = void 0,
          x = void 0;
        for (y in z)
          (x = z[y]),
            x.needsUpdate &&
              ("index" === y
                ? (j.bindBuffer(j.ELEMENT_ARRAY_BUFFER, x.buffer),
                  j.bufferData(j.ELEMENT_ARRAY_BUFFER, x.array, u))
                : (j.bindBuffer(j.ARRAY_BUFFER, x.buffer),
                  j.bufferData(j.ARRAY_BUFFER, x.array, u)),
              (x.needsUpdate = !1)),
            w && !x.dynamic && (x.array = null);
      } else if (i instanceof THREE.Mesh) {
        for (var A = 0, B = l.geometryGroupsList.length; A < B; A++)
          if (
            ((m = l.geometryGroupsList[A]),
            (t = d(i, m)),
            l.buffersNeedUpdate && c(m, i),
            (p = t.attributes && n(t)),
            l.verticesNeedUpdate ||
              l.morphTargetsNeedUpdate ||
              l.elementsNeedUpdate ||
              l.uvsNeedUpdate ||
              l.normalsNeedUpdate ||
              l.colorsNeedUpdate ||
              l.tangentsNeedUpdate ||
              p)
          ) {
            var v = m,
              C = i,
              D = j.DYNAMIC_DRAW,
              F = !l.dynamic,
              G = t;
            if (v.__inittedArrays) {
              var J = e(G),
                K = G.vertexColors ? G.vertexColors : !1,
                N = f(G),
                O = J === THREE.SmoothShading,
                E = void 0,
                I = void 0,
                V = void 0,
                M = void 0,
                R = void 0,
                U = void 0,
                Q = void 0,
                da = void 0,
                Z = void 0,
                $ = void 0,
                Fa = void 0,
                P = void 0,
                X = void 0,
                W = void 0,
                Ba = void 0,
                ea = void 0,
                Aa = void 0,
                ba = void 0,
                ca = void 0,
                ia = void 0,
                fa = void 0,
                ga = void 0,
                ka = void 0,
                la = void 0,
                oa = void 0,
                pa = void 0,
                ta = void 0,
                ua = void 0,
                va = void 0,
                Ca = void 0,
                Da = void 0,
                Ga = void 0,
                Ea = void 0,
                La = void 0,
                Sa = void 0,
                Ha = void 0,
                wa = void 0,
                xa = void 0,
                Qa = void 0,
                Ra = void 0,
                db = 0,
                eb = 0,
                Oa = 0,
                Pa = 0,
                Ua = 0,
                hb = 0,
                Ta = 0,
                tb = 0,
                Za = 0,
                qa = 0,
                ya = 0,
                L = 0,
                Na = void 0,
                ib = v.__vertexArray,
                bb = v.__uvArray,
                cb = v.__uv2Array,
                Ma = v.__normalArray,
                Va = v.__tangentArray,
                jb = v.__colorArray,
                Wa = v.__skinIndexArray,
                Xa = v.__skinWeightArray,
                fb = v.__morphTargetsArrays,
                sb = v.__morphNormalsArrays,
                pb = v.__webglCustomAttributesList,
                H = void 0,
                Pb = v.__faceArray,
                vb = v.__lineArray,
                Ia = C.geometry,
                Bb = Ia.elementsNeedUpdate,
                yb = Ia.uvsNeedUpdate,
                Db = Ia.normalsNeedUpdate,
                Mb = Ia.tangentsNeedUpdate,
                Nb = Ia.colorsNeedUpdate,
                Ob = Ia.morphTargetsNeedUpdate,
                ec = Ia.vertices,
                aa = v.faces3,
                kb = Ia.faces,
                Cb = Ia.faceVertexUvs[0],
                Eb = Ia.faceVertexUvs[1],
                fc = Ia.skinIndices,
                Qb = Ia.skinWeights,
                Rb = Ia.morphTargets,
                Fb = Ia.morphNormals;
              if (Ia.verticesNeedUpdate) {
                E = 0;
                for (I = aa.length; E < I; E++)
                  (M = kb[aa[E]]),
                    (P = ec[M.a]),
                    (X = ec[M.b]),
                    (W = ec[M.c]),
                    (ib[eb] = P.x),
                    (ib[eb + 1] = P.y),
                    (ib[eb + 2] = P.z),
                    (ib[eb + 3] = X.x),
                    (ib[eb + 4] = X.y),
                    (ib[eb + 5] = X.z),
                    (ib[eb + 6] = W.x),
                    (ib[eb + 7] = W.y),
                    (ib[eb + 8] = W.z),
                    (eb += 9);
                j.bindBuffer(j.ARRAY_BUFFER, v.__webglVertexBuffer);
                j.bufferData(j.ARRAY_BUFFER, ib, D);
              }
              if (Ob) {
                Sa = 0;
                for (Ha = Rb.length; Sa < Ha; Sa++) {
                  E = ya = 0;
                  for (I = aa.length; E < I; E++)
                    (Qa = aa[E]),
                      (M = kb[Qa]),
                      (P = Rb[Sa].vertices[M.a]),
                      (X = Rb[Sa].vertices[M.b]),
                      (W = Rb[Sa].vertices[M.c]),
                      (wa = fb[Sa]),
                      (wa[ya] = P.x),
                      (wa[ya + 1] = P.y),
                      (wa[ya + 2] = P.z),
                      (wa[ya + 3] = X.x),
                      (wa[ya + 4] = X.y),
                      (wa[ya + 5] = X.z),
                      (wa[ya + 6] = W.x),
                      (wa[ya + 7] = W.y),
                      (wa[ya + 8] = W.z),
                      G.morphNormals &&
                        (O
                          ? ((Ra = Fb[Sa].vertexNormals[Qa]),
                            (ba = Ra.a),
                            (ca = Ra.b),
                            (ia = Ra.c))
                          : (ia = ca = ba = Fb[Sa].faceNormals[Qa]),
                        (xa = sb[Sa]),
                        (xa[ya] = ba.x),
                        (xa[ya + 1] = ba.y),
                        (xa[ya + 2] = ba.z),
                        (xa[ya + 3] = ca.x),
                        (xa[ya + 4] = ca.y),
                        (xa[ya + 5] = ca.z),
                        (xa[ya + 6] = ia.x),
                        (xa[ya + 7] = ia.y),
                        (xa[ya + 8] = ia.z)),
                      (ya += 9);
                  j.bindBuffer(
                    j.ARRAY_BUFFER,
                    v.__webglMorphTargetsBuffers[Sa]
                  );
                  j.bufferData(j.ARRAY_BUFFER, fb[Sa], D);
                  G.morphNormals &&
                    (j.bindBuffer(
                      j.ARRAY_BUFFER,
                      v.__webglMorphNormalsBuffers[Sa]
                    ),
                    j.bufferData(j.ARRAY_BUFFER, sb[Sa], D));
                }
              }
              if (Qb.length) {
                E = 0;
                for (I = aa.length; E < I; E++)
                  (M = kb[aa[E]]),
                    (la = Qb[M.a]),
                    (oa = Qb[M.b]),
                    (pa = Qb[M.c]),
                    (Xa[qa] = la.x),
                    (Xa[qa + 1] = la.y),
                    (Xa[qa + 2] = la.z),
                    (Xa[qa + 3] = la.w),
                    (Xa[qa + 4] = oa.x),
                    (Xa[qa + 5] = oa.y),
                    (Xa[qa + 6] = oa.z),
                    (Xa[qa + 7] = oa.w),
                    (Xa[qa + 8] = pa.x),
                    (Xa[qa + 9] = pa.y),
                    (Xa[qa + 10] = pa.z),
                    (Xa[qa + 11] = pa.w),
                    (ta = fc[M.a]),
                    (ua = fc[M.b]),
                    (va = fc[M.c]),
                    (Wa[qa] = ta.x),
                    (Wa[qa + 1] = ta.y),
                    (Wa[qa + 2] = ta.z),
                    (Wa[qa + 3] = ta.w),
                    (Wa[qa + 4] = ua.x),
                    (Wa[qa + 5] = ua.y),
                    (Wa[qa + 6] = ua.z),
                    (Wa[qa + 7] = ua.w),
                    (Wa[qa + 8] = va.x),
                    (Wa[qa + 9] = va.y),
                    (Wa[qa + 10] = va.z),
                    (Wa[qa + 11] = va.w),
                    (qa += 12);
                0 < qa &&
                  (j.bindBuffer(j.ARRAY_BUFFER, v.__webglSkinIndicesBuffer),
                  j.bufferData(j.ARRAY_BUFFER, Wa, D),
                  j.bindBuffer(j.ARRAY_BUFFER, v.__webglSkinWeightsBuffer),
                  j.bufferData(j.ARRAY_BUFFER, Xa, D));
              }
              if (Nb && K) {
                E = 0;
                for (I = aa.length; E < I; E++)
                  (M = kb[aa[E]]),
                    (Q = M.vertexColors),
                    (da = M.color),
                    3 === Q.length && K === THREE.VertexColors
                      ? ((fa = Q[0]), (ga = Q[1]), (ka = Q[2]))
                      : (ka = ga = fa = da),
                    (jb[Za] = fa.r),
                    (jb[Za + 1] = fa.g),
                    (jb[Za + 2] = fa.b),
                    (jb[Za + 3] = ga.r),
                    (jb[Za + 4] = ga.g),
                    (jb[Za + 5] = ga.b),
                    (jb[Za + 6] = ka.r),
                    (jb[Za + 7] = ka.g),
                    (jb[Za + 8] = ka.b),
                    (Za += 9);
                0 < Za &&
                  (j.bindBuffer(j.ARRAY_BUFFER, v.__webglColorBuffer),
                  j.bufferData(j.ARRAY_BUFFER, jb, D));
              }
              if (Mb && Ia.hasTangents) {
                E = 0;
                for (I = aa.length; E < I; E++)
                  (M = kb[aa[E]]),
                    (Z = M.vertexTangents),
                    (Ba = Z[0]),
                    (ea = Z[1]),
                    (Aa = Z[2]),
                    (Va[Ta] = Ba.x),
                    (Va[Ta + 1] = Ba.y),
                    (Va[Ta + 2] = Ba.z),
                    (Va[Ta + 3] = Ba.w),
                    (Va[Ta + 4] = ea.x),
                    (Va[Ta + 5] = ea.y),
                    (Va[Ta + 6] = ea.z),
                    (Va[Ta + 7] = ea.w),
                    (Va[Ta + 8] = Aa.x),
                    (Va[Ta + 9] = Aa.y),
                    (Va[Ta + 10] = Aa.z),
                    (Va[Ta + 11] = Aa.w),
                    (Ta += 12);
                j.bindBuffer(j.ARRAY_BUFFER, v.__webglTangentBuffer);
                j.bufferData(j.ARRAY_BUFFER, Va, D);
              }
              if (Db && J) {
                E = 0;
                for (I = aa.length; E < I; E++)
                  if (
                    ((M = kb[aa[E]]),
                    (R = M.vertexNormals),
                    (U = M.normal),
                    3 === R.length && O)
                  )
                    for (Ca = 0; 3 > Ca; Ca++)
                      (Ga = R[Ca]),
                        (Ma[hb] = Ga.x),
                        (Ma[hb + 1] = Ga.y),
                        (Ma[hb + 2] = Ga.z),
                        (hb += 3);
                  else
                    for (Ca = 0; 3 > Ca; Ca++)
                      (Ma[hb] = U.x),
                        (Ma[hb + 1] = U.y),
                        (Ma[hb + 2] = U.z),
                        (hb += 3);
                j.bindBuffer(j.ARRAY_BUFFER, v.__webglNormalBuffer);
                j.bufferData(j.ARRAY_BUFFER, Ma, D);
              }
              if (yb && Cb && N) {
                E = 0;
                for (I = aa.length; E < I; E++)
                  if (((V = aa[E]), ($ = Cb[V]), void 0 !== $))
                    for (Ca = 0; 3 > Ca; Ca++)
                      (Ea = $[Ca]),
                        (bb[Oa] = Ea.x),
                        (bb[Oa + 1] = Ea.y),
                        (Oa += 2);
                0 < Oa &&
                  (j.bindBuffer(j.ARRAY_BUFFER, v.__webglUVBuffer),
                  j.bufferData(j.ARRAY_BUFFER, bb, D));
              }
              if (yb && Eb && N) {
                E = 0;
                for (I = aa.length; E < I; E++)
                  if (((V = aa[E]), (Fa = Eb[V]), void 0 !== Fa))
                    for (Ca = 0; 3 > Ca; Ca++)
                      (La = Fa[Ca]),
                        (cb[Pa] = La.x),
                        (cb[Pa + 1] = La.y),
                        (Pa += 2);
                0 < Pa &&
                  (j.bindBuffer(j.ARRAY_BUFFER, v.__webglUV2Buffer),
                  j.bufferData(j.ARRAY_BUFFER, cb, D));
              }
              if (Bb) {
                E = 0;
                for (I = aa.length; E < I; E++)
                  (Pb[Ua] = db),
                    (Pb[Ua + 1] = db + 1),
                    (Pb[Ua + 2] = db + 2),
                    (Ua += 3),
                    (vb[tb] = db),
                    (vb[tb + 1] = db + 1),
                    (vb[tb + 2] = db),
                    (vb[tb + 3] = db + 2),
                    (vb[tb + 4] = db + 1),
                    (vb[tb + 5] = db + 2),
                    (tb += 6),
                    (db += 3);
                j.bindBuffer(j.ELEMENT_ARRAY_BUFFER, v.__webglFaceBuffer);
                j.bufferData(j.ELEMENT_ARRAY_BUFFER, Pb, D);
                j.bindBuffer(j.ELEMENT_ARRAY_BUFFER, v.__webglLineBuffer);
                j.bufferData(j.ELEMENT_ARRAY_BUFFER, vb, D);
              }
              if (pb) {
                Ca = 0;
                for (Da = pb.length; Ca < Da; Ca++)
                  if (((H = pb[Ca]), H.__original.needsUpdate)) {
                    L = 0;
                    if (1 === H.size)
                      if (void 0 === H.boundTo || "vertices" === H.boundTo) {
                        E = 0;
                        for (I = aa.length; E < I; E++)
                          (M = kb[aa[E]]),
                            (H.array[L] = H.value[M.a]),
                            (H.array[L + 1] = H.value[M.b]),
                            (H.array[L + 2] = H.value[M.c]),
                            (L += 3);
                      } else {
                        if ("faces" === H.boundTo) {
                          E = 0;
                          for (I = aa.length; E < I; E++)
                            (Na = H.value[aa[E]]),
                              (H.array[L] = Na),
                              (H.array[L + 1] = Na),
                              (H.array[L + 2] = Na),
                              (L += 3);
                        }
                      }
                    else if (2 === H.size)
                      if (void 0 === H.boundTo || "vertices" === H.boundTo) {
                        E = 0;
                        for (I = aa.length; E < I; E++)
                          (M = kb[aa[E]]),
                            (P = H.value[M.a]),
                            (X = H.value[M.b]),
                            (W = H.value[M.c]),
                            (H.array[L] = P.x),
                            (H.array[L + 1] = P.y),
                            (H.array[L + 2] = X.x),
                            (H.array[L + 3] = X.y),
                            (H.array[L + 4] = W.x),
                            (H.array[L + 5] = W.y),
                            (L += 6);
                      } else {
                        if ("faces" === H.boundTo) {
                          E = 0;
                          for (I = aa.length; E < I; E++)
                            (W = X = P = Na = H.value[aa[E]]),
                              (H.array[L] = P.x),
                              (H.array[L + 1] = P.y),
                              (H.array[L + 2] = X.x),
                              (H.array[L + 3] = X.y),
                              (H.array[L + 4] = W.x),
                              (H.array[L + 5] = W.y),
                              (L += 6);
                        }
                      }
                    else if (3 === H.size) {
                      var na;
                      na = "c" === H.type ? ["r", "g", "b"] : ["x", "y", "z"];
                      if (void 0 === H.boundTo || "vertices" === H.boundTo) {
                        E = 0;
                        for (I = aa.length; E < I; E++)
                          (M = kb[aa[E]]),
                            (P = H.value[M.a]),
                            (X = H.value[M.b]),
                            (W = H.value[M.c]),
                            (H.array[L] = P[na[0]]),
                            (H.array[L + 1] = P[na[1]]),
                            (H.array[L + 2] = P[na[2]]),
                            (H.array[L + 3] = X[na[0]]),
                            (H.array[L + 4] = X[na[1]]),
                            (H.array[L + 5] = X[na[2]]),
                            (H.array[L + 6] = W[na[0]]),
                            (H.array[L + 7] = W[na[1]]),
                            (H.array[L + 8] = W[na[2]]),
                            (L += 9);
                      } else if ("faces" === H.boundTo) {
                        E = 0;
                        for (I = aa.length; E < I; E++)
                          (W = X = P = Na = H.value[aa[E]]),
                            (H.array[L] = P[na[0]]),
                            (H.array[L + 1] = P[na[1]]),
                            (H.array[L + 2] = P[na[2]]),
                            (H.array[L + 3] = X[na[0]]),
                            (H.array[L + 4] = X[na[1]]),
                            (H.array[L + 5] = X[na[2]]),
                            (H.array[L + 6] = W[na[0]]),
                            (H.array[L + 7] = W[na[1]]),
                            (H.array[L + 8] = W[na[2]]),
                            (L += 9);
                      } else if ("faceVertices" === H.boundTo) {
                        E = 0;
                        for (I = aa.length; E < I; E++)
                          (Na = H.value[aa[E]]),
                            (P = Na[0]),
                            (X = Na[1]),
                            (W = Na[2]),
                            (H.array[L] = P[na[0]]),
                            (H.array[L + 1] = P[na[1]]),
                            (H.array[L + 2] = P[na[2]]),
                            (H.array[L + 3] = X[na[0]]),
                            (H.array[L + 4] = X[na[1]]),
                            (H.array[L + 5] = X[na[2]]),
                            (H.array[L + 6] = W[na[0]]),
                            (H.array[L + 7] = W[na[1]]),
                            (H.array[L + 8] = W[na[2]]),
                            (L += 9);
                      }
                    } else if (4 === H.size)
                      if (void 0 === H.boundTo || "vertices" === H.boundTo) {
                        E = 0;
                        for (I = aa.length; E < I; E++)
                          (M = kb[aa[E]]),
                            (P = H.value[M.a]),
                            (X = H.value[M.b]),
                            (W = H.value[M.c]),
                            (H.array[L] = P.x),
                            (H.array[L + 1] = P.y),
                            (H.array[L + 2] = P.z),
                            (H.array[L + 3] = P.w),
                            (H.array[L + 4] = X.x),
                            (H.array[L + 5] = X.y),
                            (H.array[L + 6] = X.z),
                            (H.array[L + 7] = X.w),
                            (H.array[L + 8] = W.x),
                            (H.array[L + 9] = W.y),
                            (H.array[L + 10] = W.z),
                            (H.array[L + 11] = W.w),
                            (L += 12);
                      } else if ("faces" === H.boundTo) {
                        E = 0;
                        for (I = aa.length; E < I; E++)
                          (W = X = P = Na = H.value[aa[E]]),
                            (H.array[L] = P.x),
                            (H.array[L + 1] = P.y),
                            (H.array[L + 2] = P.z),
                            (H.array[L + 3] = P.w),
                            (H.array[L + 4] = X.x),
                            (H.array[L + 5] = X.y),
                            (H.array[L + 6] = X.z),
                            (H.array[L + 7] = X.w),
                            (H.array[L + 8] = W.x),
                            (H.array[L + 9] = W.y),
                            (H.array[L + 10] = W.z),
                            (H.array[L + 11] = W.w),
                            (L += 12);
                      } else if ("faceVertices" === H.boundTo) {
                        E = 0;
                        for (I = aa.length; E < I; E++)
                          (Na = H.value[aa[E]]),
                            (P = Na[0]),
                            (X = Na[1]),
                            (W = Na[2]),
                            (H.array[L] = P.x),
                            (H.array[L + 1] = P.y),
                            (H.array[L + 2] = P.z),
                            (H.array[L + 3] = P.w),
                            (H.array[L + 4] = X.x),
                            (H.array[L + 5] = X.y),
                            (H.array[L + 6] = X.z),
                            (H.array[L + 7] = X.w),
                            (H.array[L + 8] = W.x),
                            (H.array[L + 9] = W.y),
                            (H.array[L + 10] = W.z),
                            (H.array[L + 11] = W.w),
                            (L += 12);
                      }
                    j.bindBuffer(j.ARRAY_BUFFER, H.buffer);
                    j.bufferData(j.ARRAY_BUFFER, H.array, D);
                  }
              }
              F &&
                (delete v.__inittedArrays,
                delete v.__colorArray,
                delete v.__normalArray,
                delete v.__tangentArray,
                delete v.__uvArray,
                delete v.__uv2Array,
                delete v.__faceArray,
                delete v.__vertexArray,
                delete v.__lineArray,
                delete v.__skinIndexArray,
                delete v.__skinWeightArray);
            }
          }
        l.verticesNeedUpdate = !1;
        l.morphTargetsNeedUpdate = !1;
        l.elementsNeedUpdate = !1;
        l.uvsNeedUpdate = !1;
        l.normalsNeedUpdate = !1;
        l.colorsNeedUpdate = !1;
        l.tangentsNeedUpdate = !1;
        l.buffersNeedUpdate = !1;
        t.attributes && r(t);
      } else if (i instanceof THREE.Line) {
        t = d(i, l);
        p = t.attributes && n(t);
        if (
          l.verticesNeedUpdate ||
          l.colorsNeedUpdate ||
          l.lineDistancesNeedUpdate ||
          p
        ) {
          var Ya = l,
            Sb = j.DYNAMIC_DRAW,
            Ib = void 0,
            Jb = void 0,
            Kb = void 0,
            Tb = void 0,
            ma = void 0,
            Ub = void 0,
            Gb = Ya.vertices,
            Hb = Ya.colors,
            kc = Ya.lineDistances,
            Zb = Gb.length,
            $b = Hb.length,
            ac = kc.length,
            Vb = Ya.__vertexArray,
            Wb = Ya.__colorArray,
            lc = Ya.__lineDistanceArray,
            bc = Ya.colorsNeedUpdate,
            cc = Ya.lineDistancesNeedUpdate,
            gc = Ya.__webglCustomAttributesList,
            Xb = void 0,
            mc = void 0,
            za = void 0,
            zb = void 0,
            Ja = void 0,
            ja = void 0;
          if (Ya.verticesNeedUpdate) {
            for (Ib = 0; Ib < Zb; Ib++)
              (Tb = Gb[Ib]),
                (ma = 3 * Ib),
                (Vb[ma] = Tb.x),
                (Vb[ma + 1] = Tb.y),
                (Vb[ma + 2] = Tb.z);
            j.bindBuffer(j.ARRAY_BUFFER, Ya.__webglVertexBuffer);
            j.bufferData(j.ARRAY_BUFFER, Vb, Sb);
          }
          if (bc) {
            for (Jb = 0; Jb < $b; Jb++)
              (Ub = Hb[Jb]),
                (ma = 3 * Jb),
                (Wb[ma] = Ub.r),
                (Wb[ma + 1] = Ub.g),
                (Wb[ma + 2] = Ub.b);
            j.bindBuffer(j.ARRAY_BUFFER, Ya.__webglColorBuffer);
            j.bufferData(j.ARRAY_BUFFER, Wb, Sb);
          }
          if (cc) {
            for (Kb = 0; Kb < ac; Kb++) lc[Kb] = kc[Kb];
            j.bindBuffer(j.ARRAY_BUFFER, Ya.__webglLineDistanceBuffer);
            j.bufferData(j.ARRAY_BUFFER, lc, Sb);
          }
          if (gc) {
            Xb = 0;
            for (mc = gc.length; Xb < mc; Xb++)
              if (
                ((ja = gc[Xb]),
                ja.needsUpdate &&
                  (void 0 === ja.boundTo || "vertices" === ja.boundTo))
              ) {
                ma = 0;
                zb = ja.value.length;
                if (1 === ja.size)
                  for (za = 0; za < zb; za++) ja.array[za] = ja.value[za];
                else if (2 === ja.size)
                  for (za = 0; za < zb; za++)
                    (Ja = ja.value[za]),
                      (ja.array[ma] = Ja.x),
                      (ja.array[ma + 1] = Ja.y),
                      (ma += 2);
                else if (3 === ja.size)
                  if ("c" === ja.type)
                    for (za = 0; za < zb; za++)
                      (Ja = ja.value[za]),
                        (ja.array[ma] = Ja.r),
                        (ja.array[ma + 1] = Ja.g),
                        (ja.array[ma + 2] = Ja.b),
                        (ma += 3);
                  else
                    for (za = 0; za < zb; za++)
                      (Ja = ja.value[za]),
                        (ja.array[ma] = Ja.x),
                        (ja.array[ma + 1] = Ja.y),
                        (ja.array[ma + 2] = Ja.z),
                        (ma += 3);
                else if (4 === ja.size)
                  for (za = 0; za < zb; za++)
                    (Ja = ja.value[za]),
                      (ja.array[ma] = Ja.x),
                      (ja.array[ma + 1] = Ja.y),
                      (ja.array[ma + 2] = Ja.z),
                      (ja.array[ma + 3] = Ja.w),
                      (ma += 4);
                j.bindBuffer(j.ARRAY_BUFFER, ja.buffer);
                j.bufferData(j.ARRAY_BUFFER, ja.array, Sb);
              }
          }
        }
        l.verticesNeedUpdate = !1;
        l.colorsNeedUpdate = !1;
        l.lineDistancesNeedUpdate = !1;
        t.attributes && r(t);
      } else if (i instanceof THREE.ParticleSystem) {
        t = d(i, l);
        p = t.attributes && n(t);
        if (
          l.verticesNeedUpdate ||
          l.colorsNeedUpdate ||
          i.sortParticles ||
          p
        ) {
          var lb = l,
            hc = j.DYNAMIC_DRAW,
            Lb = i,
            Ka = void 0,
            mb = void 0,
            nb = void 0,
            T = void 0,
            ob = void 0,
            ub = void 0,
            Yb = lb.vertices,
            ic = Yb.length,
            jc = lb.colors,
            nc = jc.length,
            wb = lb.__vertexArray,
            xb = lb.__colorArray,
            qb = lb.__sortArray,
            oc = lb.verticesNeedUpdate,
            pc = lb.colorsNeedUpdate,
            rb = lb.__webglCustomAttributesList,
            $a = void 0,
            Ab = void 0,
            Y = void 0,
            ab = void 0,
            ha = void 0,
            S = void 0;
          if (Lb.sortParticles) {
            gb.copy(ra);
            gb.multiply(Lb.matrixWorld);
            for (Ka = 0; Ka < ic; Ka++)
              (nb = Yb[Ka]),
                sa.copy(nb),
                sa.applyProjection(gb),
                (qb[Ka] = [sa.z, Ka]);
            qb.sort(k);
            for (Ka = 0; Ka < ic; Ka++)
              (nb = Yb[qb[Ka][1]]),
                (T = 3 * Ka),
                (wb[T] = nb.x),
                (wb[T + 1] = nb.y),
                (wb[T + 2] = nb.z);
            for (mb = 0; mb < nc; mb++)
              (T = 3 * mb),
                (ub = jc[qb[mb][1]]),
                (xb[T] = ub.r),
                (xb[T + 1] = ub.g),
                (xb[T + 2] = ub.b);
            if (rb) {
              $a = 0;
              for (Ab = rb.length; $a < Ab; $a++)
                if (
                  ((S = rb[$a]),
                  void 0 === S.boundTo || "vertices" === S.boundTo)
                )
                  if (((T = 0), (ab = S.value.length), 1 === S.size))
                    for (Y = 0; Y < ab; Y++)
                      (ob = qb[Y][1]), (S.array[Y] = S.value[ob]);
                  else if (2 === S.size)
                    for (Y = 0; Y < ab; Y++)
                      (ob = qb[Y][1]),
                        (ha = S.value[ob]),
                        (S.array[T] = ha.x),
                        (S.array[T + 1] = ha.y),
                        (T += 2);
                  else if (3 === S.size)
                    if ("c" === S.type)
                      for (Y = 0; Y < ab; Y++)
                        (ob = qb[Y][1]),
                          (ha = S.value[ob]),
                          (S.array[T] = ha.r),
                          (S.array[T + 1] = ha.g),
                          (S.array[T + 2] = ha.b),
                          (T += 3);
                    else
                      for (Y = 0; Y < ab; Y++)
                        (ob = qb[Y][1]),
                          (ha = S.value[ob]),
                          (S.array[T] = ha.x),
                          (S.array[T + 1] = ha.y),
                          (S.array[T + 2] = ha.z),
                          (T += 3);
                  else if (4 === S.size)
                    for (Y = 0; Y < ab; Y++)
                      (ob = qb[Y][1]),
                        (ha = S.value[ob]),
                        (S.array[T] = ha.x),
                        (S.array[T + 1] = ha.y),
                        (S.array[T + 2] = ha.z),
                        (S.array[T + 3] = ha.w),
                        (T += 4);
            }
          } else {
            if (oc)
              for (Ka = 0; Ka < ic; Ka++)
                (nb = Yb[Ka]),
                  (T = 3 * Ka),
                  (wb[T] = nb.x),
                  (wb[T + 1] = nb.y),
                  (wb[T + 2] = nb.z);
            if (pc)
              for (mb = 0; mb < nc; mb++)
                (ub = jc[mb]),
                  (T = 3 * mb),
                  (xb[T] = ub.r),
                  (xb[T + 1] = ub.g),
                  (xb[T + 2] = ub.b);
            if (rb) {
              $a = 0;
              for (Ab = rb.length; $a < Ab; $a++)
                if (
                  ((S = rb[$a]),
                  S.needsUpdate &&
                    (void 0 === S.boundTo || "vertices" === S.boundTo))
                )
                  if (((ab = S.value.length), (T = 0), 1 === S.size))
                    for (Y = 0; Y < ab; Y++) S.array[Y] = S.value[Y];
                  else if (2 === S.size)
                    for (Y = 0; Y < ab; Y++)
                      (ha = S.value[Y]),
                        (S.array[T] = ha.x),
                        (S.array[T + 1] = ha.y),
                        (T += 2);
                  else if (3 === S.size)
                    if ("c" === S.type)
                      for (Y = 0; Y < ab; Y++)
                        (ha = S.value[Y]),
                          (S.array[T] = ha.r),
                          (S.array[T + 1] = ha.g),
                          (S.array[T + 2] = ha.b),
                          (T += 3);
                    else
                      for (Y = 0; Y < ab; Y++)
                        (ha = S.value[Y]),
                          (S.array[T] = ha.x),
                          (S.array[T + 1] = ha.y),
                          (S.array[T + 2] = ha.z),
                          (T += 3);
                  else if (4 === S.size)
                    for (Y = 0; Y < ab; Y++)
                      (ha = S.value[Y]),
                        (S.array[T] = ha.x),
                        (S.array[T + 1] = ha.y),
                        (S.array[T + 2] = ha.z),
                        (S.array[T + 3] = ha.w),
                        (T += 4);
            }
          }
          if (oc || Lb.sortParticles)
            j.bindBuffer(j.ARRAY_BUFFER, lb.__webglVertexBuffer),
              j.bufferData(j.ARRAY_BUFFER, wb, hc);
          if (pc || Lb.sortParticles)
            j.bindBuffer(j.ARRAY_BUFFER, lb.__webglColorBuffer),
              j.bufferData(j.ARRAY_BUFFER, xb, hc);
          if (rb) {
            $a = 0;
            for (Ab = rb.length; $a < Ab; $a++)
              if (((S = rb[$a]), S.needsUpdate || Lb.sortParticles))
                j.bindBuffer(j.ARRAY_BUFFER, S.buffer),
                  j.bufferData(j.ARRAY_BUFFER, S.array, hc);
          }
        }
        l.verticesNeedUpdate = !1;
        l.colorsNeedUpdate = !1;
        t.attributes && r(t);
      }
    }
  };
  this.initMaterial = function (a, b, c, d) {
    var e, f, h, g;
    a.addEventListener("dispose", Fb);
    var i, k, l, m, p;
    a instanceof THREE.MeshDepthMaterial
      ? (p = "depth")
      : a instanceof THREE.MeshNormalMaterial
      ? (p = "normal")
      : a instanceof THREE.MeshBasicMaterial
      ? (p = "basic")
      : a instanceof THREE.MeshLambertMaterial
      ? (p = "lambert")
      : a instanceof THREE.MeshPhongMaterial
      ? (p = "phong")
      : a instanceof THREE.LineBasicMaterial
      ? (p = "basic")
      : a instanceof THREE.LineDashedMaterial
      ? (p = "dashed")
      : a instanceof THREE.ParticleSystemMaterial && (p = "particle_basic");
    if (p) {
      var n = THREE.ShaderLib[p];
      a.uniforms = THREE.UniformsUtils.clone(n.uniforms);
      a.vertexShader = n.vertexShader;
      a.fragmentShader = n.fragmentShader;
    }
    var q = (e = 0),
      r = 0,
      t = (n = 0);
    for (f = b.length; t < f; t++)
      (h = b[t]),
        h.onlyShadow ||
          (h instanceof THREE.DirectionalLight && e++,
          h instanceof THREE.PointLight && q++,
          h instanceof THREE.SpotLight && r++,
          h instanceof THREE.HemisphereLight && n++);
    f = q;
    h = r;
    g = n;
    r = n = 0;
    for (q = b.length; r < q; r++)
      (t = b[r]),
        t.castShadow &&
          (t instanceof THREE.SpotLight && n++,
          t instanceof THREE.DirectionalLight && !t.shadowCascade && n++);
    m = n;
    yb && d && d.useVertexTexture
      ? (l = 1024)
      : ((b = j.getParameter(j.MAX_VERTEX_UNIFORM_VECTORS)),
        (b = Math.floor((b - 20) / 4)),
        void 0 !== d &&
          d instanceof THREE.SkinnedMesh &&
          ((b = Math.min(d.bones.length, b)),
          b < d.bones.length &&
            console.warn(
              "WebGLRenderer: too many bones - " +
                d.bones.length +
                ", this GPU supports just " +
                b +
                " (try OpenGL instead of ANGLE)"
            )),
        (l = b));
    a: {
      var r = a.fragmentShader,
        q = a.vertexShader,
        n = a.uniforms,
        b = a.attributes,
        t = a.defines,
        c = {
          map: !!a.map,
          envMap: !!a.envMap,
          lightMap: !!a.lightMap,
          bumpMap: !!a.bumpMap,
          normalMap: !!a.normalMap,
          specularMap: !!a.specularMap,
          vertexColors: a.vertexColors,
          fog: c,
          useFog: a.fog,
          fogExp: c instanceof THREE.FogExp2,
          sizeAttenuation: a.sizeAttenuation,
          skinning: a.skinning,
          maxBones: l,
          useVertexTexture: yb && d && d.useVertexTexture,
          morphTargets: a.morphTargets,
          morphNormals: a.morphNormals,
          maxMorphTargets: this.maxMorphTargets,
          maxMorphNormals: this.maxMorphNormals,
          maxDirLights: e,
          maxPointLights: f,
          maxSpotLights: h,
          maxHemiLights: g,
          maxShadows: m,
          shadowMapEnabled: this.shadowMapEnabled && d.receiveShadow,
          shadowMapType: this.shadowMapType,
          shadowMapDebug: this.shadowMapDebug,
          shadowMapCascade: this.shadowMapCascade,
          alphaTest: a.alphaTest,
          metal: a.metal,
          perPixel: a.perPixel,
          wrapAround: a.wrapAround,
          doubleSided: a.side === THREE.DoubleSide,
          flipSided: a.side === THREE.BackSide,
        },
        d = a.index0AttributeName,
        s,
        u,
        w;
      e = [];
      p ? e.push(p) : (e.push(r), e.push(q));
      for (u in t) e.push(u), e.push(t[u]);
      for (s in c) e.push(s), e.push(c[s]);
      p = e.join();
      s = 0;
      for (u = ca.length; s < u; s++)
        if (((e = ca[s]), e.code === p)) {
          e.usedTimes++;
          k = e.program;
          break a;
        }
      s = "SHADOWMAP_TYPE_BASIC";
      c.shadowMapType === THREE.PCFShadowMap
        ? (s = "SHADOWMAP_TYPE_PCF")
        : c.shadowMapType === THREE.PCFSoftShadowMap &&
          (s = "SHADOWMAP_TYPE_PCF_SOFT");
      u = [];
      for (w in t)
        (e = t[w]), !1 !== e && ((e = "#define " + w + " " + e), u.push(e));
      e = u.join("\n");
      w = j.createProgram();
      u = [
        "precision " + R + " float;",
        "precision " + R + " int;",
        e,
        Bb ? "#define VERTEX_TEXTURES" : "",
        K.gammaInput ? "#define GAMMA_INPUT" : "",
        K.gammaOutput ? "#define GAMMA_OUTPUT" : "",
        K.physicallyBasedShading ? "#define PHYSICALLY_BASED_SHADING" : "",
        "#define MAX_DIR_LIGHTS " + c.maxDirLights,
        "#define MAX_POINT_LIGHTS " + c.maxPointLights,
        "#define MAX_SPOT_LIGHTS " + c.maxSpotLights,
        "#define MAX_HEMI_LIGHTS " + c.maxHemiLights,
        "#define MAX_SHADOWS " + c.maxShadows,
        "#define MAX_BONES " + c.maxBones,
        c.map ? "#define USE_MAP" : "",
        c.envMap ? "#define USE_ENVMAP" : "",
        c.lightMap ? "#define USE_LIGHTMAP" : "",
        c.bumpMap ? "#define USE_BUMPMAP" : "",
        c.normalMap ? "#define USE_NORMALMAP" : "",
        c.specularMap ? "#define USE_SPECULARMAP" : "",
        c.vertexColors ? "#define USE_COLOR" : "",
        c.skinning ? "#define USE_SKINNING" : "",
        c.useVertexTexture ? "#define BONE_TEXTURE" : "",
        c.morphTargets ? "#define USE_MORPHTARGETS" : "",
        c.morphNormals ? "#define USE_MORPHNORMALS" : "",
        c.perPixel ? "#define PHONG_PER_PIXEL" : "",
        c.wrapAround ? "#define WRAP_AROUND" : "",
        c.doubleSided ? "#define DOUBLE_SIDED" : "",
        c.flipSided ? "#define FLIP_SIDED" : "",
        c.shadowMapEnabled ? "#define USE_SHADOWMAP" : "",
        c.shadowMapEnabled ? "#define " + s : "",
        c.shadowMapDebug ? "#define SHADOWMAP_DEBUG" : "",
        c.shadowMapCascade ? "#define SHADOWMAP_CASCADE" : "",
        c.sizeAttenuation ? "#define USE_SIZEATTENUATION" : "",
        "uniform mat4 modelMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\nuniform mat4 viewMatrix;\nuniform mat3 normalMatrix;\nuniform vec3 cameraPosition;\nattribute vec3 position;\nattribute vec3 normal;\nattribute vec2 uv;\nattribute vec2 uv2;\n#ifdef USE_COLOR\nattribute vec3 color;\n#endif\n#ifdef USE_MORPHTARGETS\nattribute vec3 morphTarget0;\nattribute vec3 morphTarget1;\nattribute vec3 morphTarget2;\nattribute vec3 morphTarget3;\n#ifdef USE_MORPHNORMALS\nattribute vec3 morphNormal0;\nattribute vec3 morphNormal1;\nattribute vec3 morphNormal2;\nattribute vec3 morphNormal3;\n#else\nattribute vec3 morphTarget4;\nattribute vec3 morphTarget5;\nattribute vec3 morphTarget6;\nattribute vec3 morphTarget7;\n#endif\n#endif\n#ifdef USE_SKINNING\nattribute vec4 skinIndex;\nattribute vec4 skinWeight;\n#endif\n",
      ].join("\n");
      s = [
        "precision " + R + " float;",
        "precision " + R + " int;",
        c.bumpMap || c.normalMap
          ? "#extension GL_OES_standard_derivatives : enable"
          : "",
        e,
        "#define MAX_DIR_LIGHTS " + c.maxDirLights,
        "#define MAX_POINT_LIGHTS " + c.maxPointLights,
        "#define MAX_SPOT_LIGHTS " + c.maxSpotLights,
        "#define MAX_HEMI_LIGHTS " + c.maxHemiLights,
        "#define MAX_SHADOWS " + c.maxShadows,
        c.alphaTest ? "#define ALPHATEST " + c.alphaTest : "",
        K.gammaInput ? "#define GAMMA_INPUT" : "",
        K.gammaOutput ? "#define GAMMA_OUTPUT" : "",
        K.physicallyBasedShading ? "#define PHYSICALLY_BASED_SHADING" : "",
        c.useFog && c.fog ? "#define USE_FOG" : "",
        c.useFog && c.fogExp ? "#define FOG_EXP2" : "",
        c.map ? "#define USE_MAP" : "",
        c.envMap ? "#define USE_ENVMAP" : "",
        c.lightMap ? "#define USE_LIGHTMAP" : "",
        c.bumpMap ? "#define USE_BUMPMAP" : "",
        c.normalMap ? "#define USE_NORMALMAP" : "",
        c.specularMap ? "#define USE_SPECULARMAP" : "",
        c.vertexColors ? "#define USE_COLOR" : "",
        c.metal ? "#define METAL" : "",
        c.perPixel ? "#define PHONG_PER_PIXEL" : "",
        c.wrapAround ? "#define WRAP_AROUND" : "",
        c.doubleSided ? "#define DOUBLE_SIDED" : "",
        c.flipSided ? "#define FLIP_SIDED" : "",
        c.shadowMapEnabled ? "#define USE_SHADOWMAP" : "",
        c.shadowMapEnabled ? "#define " + s : "",
        c.shadowMapDebug ? "#define SHADOWMAP_DEBUG" : "",
        c.shadowMapCascade ? "#define SHADOWMAP_CASCADE" : "",
        "uniform mat4 viewMatrix;\nuniform vec3 cameraPosition;\n",
      ].join("\n");
      u = C("vertex", u + q);
      s = C("fragment", s + r);
      j.attachShader(w, u);
      j.attachShader(w, s);
      d && j.bindAttribLocation(w, 0, d);
      j.linkProgram(w);
      j.getProgramParameter(w, j.LINK_STATUS) ||
        (console.error(
          "Could not initialise shader\nVALIDATE_STATUS: " +
            j.getProgramParameter(w, j.VALIDATE_STATUS) +
            ", gl error [" +
            j.getError() +
            "]"
        ),
        console.error("Program Info Log: " + j.getProgramInfoLog(w)));
      j.deleteShader(s);
      j.deleteShader(u);
      w.uniforms = {};
      w.attributes = {};
      var v;
      s =
        "viewMatrix modelViewMatrix projectionMatrix normalMatrix modelMatrix cameraPosition morphTargetInfluences".split(
          " "
        );
      c.useVertexTexture
        ? (s.push("boneTexture"),
          s.push("boneTextureWidth"),
          s.push("boneTextureHeight"))
        : s.push("boneGlobalMatrices");
      for (v in n) s.push(v);
      v = s;
      s = 0;
      for (u = v.length; s < u; s++)
        (n = v[s]), (w.uniforms[n] = j.getUniformLocation(w, n));
      s =
        "position normal uv uv2 tangent color skinIndex skinWeight lineDistance".split(
          " "
        );
      for (v = 0; v < c.maxMorphTargets; v++) s.push("morphTarget" + v);
      for (v = 0; v < c.maxMorphNormals; v++) s.push("morphNormal" + v);
      for (k in b) s.push(k);
      k = s;
      v = 0;
      for (b = k.length; v < b; v++)
        (s = k[v]), (w.attributes[s] = j.getAttribLocation(w, s));
      w.id = Fa++;
      ca.push({ program: w, code: p, usedTimes: 1 });
      K.info.memory.programs = ca.length;
      k = w;
    }
    a.program = k;
    v = a.program.attributes;
    if (a.morphTargets) {
      a.numSupportedMorphTargets = 0;
      b = "morphTarget";
      for (k = 0; k < this.maxMorphTargets; k++)
        (w = b + k), 0 <= v[w] && a.numSupportedMorphTargets++;
    }
    if (a.morphNormals) {
      a.numSupportedMorphNormals = 0;
      b = "morphNormal";
      for (k = 0; k < this.maxMorphNormals; k++)
        (w = b + k), 0 <= v[w] && a.numSupportedMorphNormals++;
    }
    a.uniformsList = [];
    for (i in a.uniforms) a.uniformsList.push([a.uniforms[i], i]);
  };
  this.setFaceCulling = function (a, b) {
    a === THREE.CullFaceNone
      ? j.disable(j.CULL_FACE)
      : (b === THREE.FrontFaceDirectionCW
          ? j.frontFace(j.CW)
          : j.frontFace(j.CCW),
        a === THREE.CullFaceBack
          ? j.cullFace(j.BACK)
          : a === THREE.CullFaceFront
          ? j.cullFace(j.FRONT)
          : j.cullFace(j.FRONT_AND_BACK),
        j.enable(j.CULL_FACE));
  };
  this.setMaterialFaces = function (a) {
    var b = a.side === THREE.DoubleSide,
      a = a.side === THREE.BackSide;
    Z !== b && (b ? j.disable(j.CULL_FACE) : j.enable(j.CULL_FACE), (Z = b));
    U !== a && (a ? j.frontFace(j.CW) : j.frontFace(j.CCW), (U = a));
  };
  this.setDepthTest = function (a) {
    Ga !== a &&
      (a ? j.enable(j.DEPTH_TEST) : j.disable(j.DEPTH_TEST), (Ga = a));
  };
  this.setDepthWrite = function (a) {
    fa !== a && (j.depthMask(a), (fa = a));
  };
  this.setBlending = function (a, b, c, d) {
    a !== ka &&
      (a === THREE.NoBlending
        ? j.disable(j.BLEND)
        : a === THREE.AdditiveBlending
        ? (j.enable(j.BLEND),
          j.blendEquation(j.FUNC_ADD),
          j.blendFunc(j.SRC_ALPHA, j.ONE))
        : a === THREE.SubtractiveBlending
        ? (j.enable(j.BLEND),
          j.blendEquation(j.FUNC_ADD),
          j.blendFunc(j.ZERO, j.ONE_MINUS_SRC_COLOR))
        : a === THREE.MultiplyBlending
        ? (j.enable(j.BLEND),
          j.blendEquation(j.FUNC_ADD),
          j.blendFunc(j.ZERO, j.SRC_COLOR))
        : a === THREE.CustomBlending
        ? j.enable(j.BLEND)
        : (j.enable(j.BLEND),
          j.blendEquationSeparate(j.FUNC_ADD, j.FUNC_ADD),
          j.blendFuncSeparate(
            j.SRC_ALPHA,
            j.ONE_MINUS_SRC_ALPHA,
            j.ONE,
            j.ONE_MINUS_SRC_ALPHA
          )),
      (ka = a));
    if (a === THREE.CustomBlending) {
      if ((b !== ta && (j.blendEquation(v(b)), (ta = b)), c !== ia || d !== La))
        j.blendFunc(v(c), v(d)), (ia = c), (La = d);
    } else La = ia = ta = null;
  };
  this.setTexture = function (a, b) {
    if (a.needsUpdate) {
      a.__webglInit ||
        ((a.__webglInit = !0),
        a.addEventListener("dispose", Db),
        (a.__webglTexture = j.createTexture()),
        K.info.memory.textures++);
      j.activeTexture(j.TEXTURE0 + b);
      j.bindTexture(j.TEXTURE_2D, a.__webglTexture);
      j.pixelStorei(j.UNPACK_FLIP_Y_WEBGL, a.flipY);
      j.pixelStorei(j.UNPACK_PREMULTIPLY_ALPHA_WEBGL, a.premultiplyAlpha);
      j.pixelStorei(j.UNPACK_ALIGNMENT, a.unpackAlignment);
      var c = a.image,
        d =
          0 === (c.width & (c.width - 1)) && 0 === (c.height & (c.height - 1)),
        e = v(a.format),
        f = v(a.type);
      E(j.TEXTURE_2D, a, d);
      var h = a.mipmaps;
      if (a instanceof THREE.DataTexture)
        if (0 < h.length && d) {
          for (var g = 0, i = h.length; g < i; g++)
            (c = h[g]),
              j.texImage2D(
                j.TEXTURE_2D,
                g,
                e,
                c.width,
                c.height,
                0,
                e,
                f,
                c.data
              );
          a.generateMipmaps = !1;
        } else
          j.texImage2D(j.TEXTURE_2D, 0, e, c.width, c.height, 0, e, f, c.data);
      else if (a instanceof THREE.CompressedTexture) {
        g = 0;
        for (i = h.length; g < i; g++)
          (c = h[g]),
            a.format !== THREE.RGBAFormat
              ? j.compressedTexImage2D(
                  j.TEXTURE_2D,
                  g,
                  e,
                  c.width,
                  c.height,
                  0,
                  c.data
                )
              : j.texImage2D(
                  j.TEXTURE_2D,
                  g,
                  e,
                  c.width,
                  c.height,
                  0,
                  e,
                  f,
                  c.data
                );
      } else if (0 < h.length && d) {
        g = 0;
        for (i = h.length; g < i; g++)
          (c = h[g]), j.texImage2D(j.TEXTURE_2D, g, e, e, f, c);
        a.generateMipmaps = !1;
      } else j.texImage2D(j.TEXTURE_2D, 0, e, e, f, a.image);
      a.generateMipmaps && d && j.generateMipmap(j.TEXTURE_2D);
      a.needsUpdate = !1;
      if (a.onUpdate) a.onUpdate();
    } else
      j.activeTexture(j.TEXTURE0 + b),
        j.bindTexture(j.TEXTURE_2D, a.__webglTexture);
  };
  this.setRenderTarget = function (a) {
    var b = a instanceof THREE.WebGLRenderTargetCube;
    if (a && !a.__webglFramebuffer) {
      void 0 === a.depthBuffer && (a.depthBuffer = !0);
      void 0 === a.stencilBuffer && (a.stencilBuffer = !0);
      a.addEventListener("dispose", Eb);
      a.__webglTexture = j.createTexture();
      K.info.memory.textures++;
      var c =
          0 === (a.width & (a.width - 1)) && 0 === (a.height & (a.height - 1)),
        d = v(a.format),
        e = v(a.type);
      if (b) {
        a.__webglFramebuffer = [];
        a.__webglRenderbuffer = [];
        j.bindTexture(j.TEXTURE_CUBE_MAP, a.__webglTexture);
        E(j.TEXTURE_CUBE_MAP, a, c);
        for (var f = 0; 6 > f; f++) {
          a.__webglFramebuffer[f] = j.createFramebuffer();
          a.__webglRenderbuffer[f] = j.createRenderbuffer();
          j.texImage2D(
            j.TEXTURE_CUBE_MAP_POSITIVE_X + f,
            0,
            d,
            a.width,
            a.height,
            0,
            d,
            e,
            null
          );
          var h = a,
            g = j.TEXTURE_CUBE_MAP_POSITIVE_X + f;
          j.bindFramebuffer(j.FRAMEBUFFER, a.__webglFramebuffer[f]);
          j.framebufferTexture2D(
            j.FRAMEBUFFER,
            j.COLOR_ATTACHMENT0,
            g,
            h.__webglTexture,
            0
          );
          I(a.__webglRenderbuffer[f], a);
        }
        c && j.generateMipmap(j.TEXTURE_CUBE_MAP);
      } else
        (a.__webglFramebuffer = j.createFramebuffer()),
          (a.__webglRenderbuffer = a.shareDepthFrom
            ? a.shareDepthFrom.__webglRenderbuffer
            : j.createRenderbuffer()),
          j.bindTexture(j.TEXTURE_2D, a.__webglTexture),
          E(j.TEXTURE_2D, a, c),
          j.texImage2D(j.TEXTURE_2D, 0, d, a.width, a.height, 0, d, e, null),
          (d = j.TEXTURE_2D),
          j.bindFramebuffer(j.FRAMEBUFFER, a.__webglFramebuffer),
          j.framebufferTexture2D(
            j.FRAMEBUFFER,
            j.COLOR_ATTACHMENT0,
            d,
            a.__webglTexture,
            0
          ),
          a.shareDepthFrom
            ? a.depthBuffer && !a.stencilBuffer
              ? j.framebufferRenderbuffer(
                  j.FRAMEBUFFER,
                  j.DEPTH_ATTACHMENT,
                  j.RENDERBUFFER,
                  a.__webglRenderbuffer
                )
              : a.depthBuffer &&
                a.stencilBuffer &&
                j.framebufferRenderbuffer(
                  j.FRAMEBUFFER,
                  j.DEPTH_STENCIL_ATTACHMENT,
                  j.RENDERBUFFER,
                  a.__webglRenderbuffer
                )
            : I(a.__webglRenderbuffer, a),
          c && j.generateMipmap(j.TEXTURE_2D);
      b
        ? j.bindTexture(j.TEXTURE_CUBE_MAP, null)
        : j.bindTexture(j.TEXTURE_2D, null);
      j.bindRenderbuffer(j.RENDERBUFFER, null);
      j.bindFramebuffer(j.FRAMEBUFFER, null);
    }
    a
      ? ((b = b
          ? a.__webglFramebuffer[a.activeCubeFace]
          : a.__webglFramebuffer),
        (c = a.width),
        (a = a.height),
        (e = d = 0))
      : ((b = null), (c = Ma), (a = fb), (d = bb), (e = cb));
    b !== da &&
      (j.bindFramebuffer(j.FRAMEBUFFER, b), j.viewport(d, e, c, a), (da = b));
    sb = c;
    pb = a;
  };
  this.shadowMapPlugin = new THREE.ShadowMapPlugin();
  this.addPrePlugin(this.shadowMapPlugin);
  this.addPostPlugin(new THREE.SpritePlugin());
  this.addPostPlugin(new THREE.LensFlarePlugin());
};
THREE.WebGLRenderTarget = function (a, b, c) {
  this.width = a;
  this.height = b;
  c = c || {};
  this.wrapS = void 0 !== c.wrapS ? c.wrapS : THREE.ClampToEdgeWrapping;
  this.wrapT = void 0 !== c.wrapT ? c.wrapT : THREE.ClampToEdgeWrapping;
  this.magFilter = void 0 !== c.magFilter ? c.magFilter : THREE.LinearFilter;
  this.minFilter =
    void 0 !== c.minFilter ? c.minFilter : THREE.LinearMipMapLinearFilter;
  this.anisotropy = void 0 !== c.anisotropy ? c.anisotropy : 1;
  this.offset = new THREE.Vector2(0, 0);
  this.repeat = new THREE.Vector2(1, 1);
  this.format = void 0 !== c.format ? c.format : THREE.RGBAFormat;
  this.type = void 0 !== c.type ? c.type : THREE.UnsignedByteType;
  this.depthBuffer = void 0 !== c.depthBuffer ? c.depthBuffer : !0;
  this.stencilBuffer = void 0 !== c.stencilBuffer ? c.stencilBuffer : !0;
  this.generateMipmaps = !0;
  this.shareDepthFrom = null;
};
THREE.WebGLRenderTarget.prototype = {
  constructor: THREE.WebGLRenderTarget,
  clone: function () {
    var a = new THREE.WebGLRenderTarget(this.width, this.height);
    a.wrapS = this.wrapS;
    a.wrapT = this.wrapT;
    a.magFilter = this.magFilter;
    a.minFilter = this.minFilter;
    a.anisotropy = this.anisotropy;
    a.offset.copy(this.offset);
    a.repeat.copy(this.repeat);
    a.format = this.format;
    a.type = this.type;
    a.depthBuffer = this.depthBuffer;
    a.stencilBuffer = this.stencilBuffer;
    a.generateMipmaps = this.generateMipmaps;
    a.shareDepthFrom = this.shareDepthFrom;
    return a;
  },
  dispose: function () {
    this.dispatchEvent({ type: "dispose" });
  },
};
THREE.EventDispatcher.prototype.apply(THREE.WebGLRenderTarget.prototype);
THREE.WebGLRenderTargetCube = function (a, b, c) {
  THREE.WebGLRenderTarget.call(this, a, b, c);
  this.activeCubeFace = 0;
};
THREE.WebGLRenderTargetCube.prototype = Object.create(
  THREE.WebGLRenderTarget.prototype
);
THREE.RenderableVertex = function () {
  this.positionWorld = new THREE.Vector3();
  this.positionScreen = new THREE.Vector4();
  this.visible = !0;
};
THREE.RenderableVertex.prototype.copy = function (a) {
  this.positionWorld.copy(a.positionWorld);
  this.positionScreen.copy(a.positionScreen);
};
THREE.RenderableFace3 = function () {
  this.id = 0;
  this.v1 = new THREE.RenderableVertex();
  this.v2 = new THREE.RenderableVertex();
  this.v3 = new THREE.RenderableVertex();
  this.centroidModel = new THREE.Vector3();
  this.normalModel = new THREE.Vector3();
  this.normalModelView = new THREE.Vector3();
  this.vertexNormalsLength = 0;
  this.vertexNormalsModel = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  this.vertexNormalsModelView = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  this.material = this.color = null;
  this.uvs = [[]];
  this.z = 0;
};
THREE.RenderableObject = function () {
  this.id = 0;
  this.object = null;
  this.z = 0;
};
THREE.RenderableSprite = function () {
  this.id = 0;
  this.object = null;
  this.rotation = this.z = this.y = this.x = 0;
  this.scale = new THREE.Vector2();
  this.material = null;
};
THREE.RenderableLine = function () {
  this.id = 0;
  this.v1 = new THREE.RenderableVertex();
  this.v2 = new THREE.RenderableVertex();
  this.vertexColors = [new THREE.Color(), new THREE.Color()];
  this.material = null;
  this.z = 0;
};
THREE.GeometryUtils = {
  merge: function (a, b, c) {
    var d,
      e,
      f = a.vertices.length,
      h = b instanceof THREE.Mesh ? b.geometry : b,
      g = a.vertices,
      i = h.vertices,
      k = a.faces,
      m = h.faces,
      a = a.faceVertexUvs[0],
      h = h.faceVertexUvs[0];
    void 0 === c && (c = 0);
    b instanceof THREE.Mesh &&
      (b.matrixAutoUpdate && b.updateMatrix(),
      (d = b.matrix),
      (e = new THREE.Matrix3().getNormalMatrix(d)));
    for (var b = 0, l = i.length; b < l; b++) {
      var p = i[b].clone();
      d && p.applyMatrix4(d);
      g.push(p);
    }
    b = 0;
    for (l = m.length; b < l; b++) {
      var p = m[b],
        s,
        t,
        n = p.vertexNormals,
        r = p.vertexColors;
      s = new THREE.Face3(p.a + f, p.b + f, p.c + f);
      s.normal.copy(p.normal);
      e && s.normal.applyMatrix3(e).normalize();
      g = 0;
      for (i = n.length; g < i; g++)
        (t = n[g].clone()),
          e && t.applyMatrix3(e).normalize(),
          s.vertexNormals.push(t);
      s.color.copy(p.color);
      g = 0;
      for (i = r.length; g < i; g++) (t = r[g]), s.vertexColors.push(t.clone());
      s.materialIndex = p.materialIndex + c;
      s.centroid.copy(p.centroid);
      d && s.centroid.applyMatrix4(d);
      k.push(s);
    }
    b = 0;
    for (l = h.length; b < l; b++) {
      c = h[b];
      d = [];
      g = 0;
      for (i = c.length; g < i; g++) d.push(new THREE.Vector2(c[g].x, c[g].y));
      a.push(d);
    }
  },
  randomPointInTriangle: (function () {
    var a = new THREE.Vector3();
    return function (b, c, d) {
      var e = new THREE.Vector3(),
        f = THREE.Math.random16(),
        h = THREE.Math.random16();
      1 < f + h && ((f = 1 - f), (h = 1 - h));
      var g = 1 - f - h;
      e.copy(b);
      e.multiplyScalar(f);
      a.copy(c);
      a.multiplyScalar(h);
      e.add(a);
      a.copy(d);
      a.multiplyScalar(g);
      e.add(a);
      return e;
    };
  })(),
  randomPointInFace: function (a, b) {
    return THREE.GeometryUtils.randomPointInTriangle(
      b.vertices[a.a],
      b.vertices[a.b],
      b.vertices[a.c]
    );
  },
  randomPointsInGeometry: function (a, b) {
    function c(a) {
      function b(c, d) {
        if (d < c) return c;
        var e = c + Math.floor((d - c) / 2);
        return k[e] > a ? b(c, e - 1) : k[e] < a ? b(e + 1, d) : e;
      }
      return b(0, k.length - 1);
    }
    var d,
      e,
      f = a.faces,
      h = a.vertices,
      g = f.length,
      i = 0,
      k = [],
      m,
      l,
      p;
    for (e = 0; e < g; e++)
      (d = f[e]),
        (m = h[d.a]),
        (l = h[d.b]),
        (p = h[d.c]),
        (d._area = THREE.GeometryUtils.triangleArea(m, l, p)),
        (i += d._area),
        (k[e] = i);
    d = [];
    for (e = 0; e < b; e++)
      (h = THREE.Math.random16() * i),
        (h = c(h)),
        (d[e] = THREE.GeometryUtils.randomPointInFace(f[h], a, !0));
    return d;
  },
  triangleArea: (function () {
    var a = new THREE.Vector3(),
      b = new THREE.Vector3();
    return function (c, d, e) {
      a.subVectors(d, c);
      b.subVectors(e, c);
      a.cross(b);
      return 0.5 * a.length();
    };
  })(),
  center: function (a) {
    a.computeBoundingBox();
    var b = a.boundingBox,
      c = new THREE.Vector3();
    c.addVectors(b.min, b.max);
    c.multiplyScalar(-0.5);
    a.applyMatrix(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
    a.computeBoundingBox();
    return c;
  },
  triangulateQuads: function (a) {
    var b,
      c,
      d,
      e,
      f = [],
      h = [];
    b = 0;
    for (c = a.faceVertexUvs.length; b < c; b++) h[b] = [];
    b = 0;
    for (c = a.faces.length; b < c; b++) {
      f.push(a.faces[b]);
      d = 0;
      for (e = a.faceVertexUvs.length; d < e; d++)
        h[d].push(a.faceVertexUvs[d][b]);
    }
    a.faces = f;
    a.faceVertexUvs = h;
    a.computeCentroids();
    a.computeFaceNormals();
    a.computeVertexNormals();
    a.hasTangents && a.computeTangents();
  },
};
THREE.ImageUtils = {
  crossOrigin: "anonymous",
  loadTexture: function (a, b, c) {
    var d = new THREE.ImageLoader();
    d.crossOrigin = this.crossOrigin;
    var e = new THREE.Texture(void 0, b),
      b = d.load(a, function () {
        e.needsUpdate = !0;
        c && c(e);
      });
    e.image = b;
    e.sourceFile = a;
    return e;
  },
  loadCompressedTexture: function (a, b, c, d) {
    var e = new THREE.CompressedTexture();
    e.mapping = b;
    var f = new XMLHttpRequest();
    f.onload = function () {
      var a = THREE.ImageUtils.parseDDS(f.response, !0);
      e.format = a.format;
      e.mipmaps = a.mipmaps;
      e.image.width = a.width;
      e.image.height = a.height;
      e.generateMipmaps = !1;
      e.needsUpdate = !0;
      c && c(e);
    };
    f.onerror = d;
    f.open("GET", a, !0);
    f.responseType = "arraybuffer";
    f.send(null);
    return e;
  },
  loadTextureCube: function (a, b, c, d) {
    var e = [];
    e.loadCount = 0;
    var f = new THREE.Texture();
    f.image = e;
    void 0 !== b && (f.mapping = b);
    f.flipY = !1;
    for (var b = 0, h = a.length; b < h; ++b) {
      var g = new Image();
      e[b] = g;
      g.onload = function () {
        e.loadCount += 1;
        6 === e.loadCount && ((f.needsUpdate = !0), c && c(f));
      };
      g.onerror = d;
      g.crossOrigin = this.crossOrigin;
      g.src = a[b];
    }
    return f;
  },
  loadCompressedTextureCube: function (a, b, c, d) {
    var e = [];
    e.loadCount = 0;
    var f = new THREE.CompressedTexture();
    f.image = e;
    void 0 !== b && (f.mapping = b);
    f.flipY = !1;
    f.generateMipmaps = !1;
    b = function (a, b) {
      return function () {
        var d = THREE.ImageUtils.parseDDS(a.response, !0);
        b.format = d.format;
        b.mipmaps = d.mipmaps;
        b.width = d.width;
        b.height = d.height;
        e.loadCount += 1;
        6 === e.loadCount &&
          ((f.format = d.format), (f.needsUpdate = !0), c && c(f));
      };
    };
    if (a instanceof Array)
      for (var h = 0, g = a.length; h < g; ++h) {
        var i = {};
        e[h] = i;
        var k = new XMLHttpRequest();
        k.onload = b(k, i);
        k.onerror = d;
        i = a[h];
        k.open("GET", i, !0);
        k.responseType = "arraybuffer";
        k.send(null);
      }
    else
      (k = new XMLHttpRequest()),
        (k.onload = function () {
          var a = THREE.ImageUtils.parseDDS(k.response, !0);
          if (a.isCubemap) {
            for (var b = a.mipmaps.length / a.mipmapCount, d = 0; d < b; d++) {
              e[d] = { mipmaps: [] };
              for (var h = 0; h < a.mipmapCount; h++)
                e[d].mipmaps.push(a.mipmaps[d * a.mipmapCount + h]),
                  (e[d].format = a.format),
                  (e[d].width = a.width),
                  (e[d].height = a.height);
            }
            f.format = a.format;
            f.needsUpdate = !0;
            c && c(f);
          }
        }),
        (k.onerror = d),
        k.open("GET", a, !0),
        (k.responseType = "arraybuffer"),
        k.send(null);
    return f;
  },
  loadDDSTexture: function (a, b, c, d) {
    var e = [];
    e.loadCount = 0;
    var f = new THREE.CompressedTexture();
    f.image = e;
    void 0 !== b && (f.mapping = b);
    f.flipY = !1;
    f.generateMipmaps = !1;
    var h = new XMLHttpRequest();
    h.onload = function () {
      var a = THREE.ImageUtils.parseDDS(h.response, !0);
      if (a.isCubemap)
        for (var b = a.mipmaps.length / a.mipmapCount, d = 0; d < b; d++) {
          e[d] = { mipmaps: [] };
          for (var m = 0; m < a.mipmapCount; m++)
            e[d].mipmaps.push(a.mipmaps[d * a.mipmapCount + m]),
              (e[d].format = a.format),
              (e[d].width = a.width),
              (e[d].height = a.height);
        }
      else
        (f.image.width = a.width),
          (f.image.height = a.height),
          (f.mipmaps = a.mipmaps);
      f.format = a.format;
      f.needsUpdate = !0;
      c && c(f);
    };
    h.onerror = d;
    h.open("GET", a, !0);
    h.responseType = "arraybuffer";
    h.send(null);
    return f;
  },
  parseDDS: function (a, b) {
    function c(a) {
      return (
        a.charCodeAt(0) +
        (a.charCodeAt(1) << 8) +
        (a.charCodeAt(2) << 16) +
        (a.charCodeAt(3) << 24)
      );
    }
    var d = { mipmaps: [], width: 0, height: 0, format: null, mipmapCount: 1 },
      e = c("DXT1"),
      f = c("DXT3"),
      h = c("DXT5"),
      g = new Int32Array(a, 0, 31);
    if (542327876 !== g[0])
      return (
        console.error(
          "ImageUtils.parseDDS(): Invalid magic number in DDS header"
        ),
        d
      );
    if (!g[20] & 4)
      return (
        console.error(
          "ImageUtils.parseDDS(): Unsupported format, must contain a FourCC code"
        ),
        d
      );
    var i = g[21],
      k = !1;
    switch (i) {
      case e:
        e = 8;
        d.format = THREE.RGB_S3TC_DXT1_Format;
        break;
      case f:
        e = 16;
        d.format = THREE.RGBA_S3TC_DXT3_Format;
        break;
      case h:
        e = 16;
        d.format = THREE.RGBA_S3TC_DXT5_Format;
        break;
      default:
        if (
          32 == g[22] &&
          g[23] & 16711680 &&
          g[24] & 65280 &&
          g[25] & 255 &&
          g[26] & 4278190080
        )
          (k = !0), (e = 64), (d.format = THREE.RGBAFormat);
        else
          return (
            console.error(
              "ImageUtils.parseDDS(): Unsupported FourCC code: ",
              String.fromCharCode(
                i & 255,
                (i >> 8) & 255,
                (i >> 16) & 255,
                (i >> 24) & 255
              )
            ),
            d
          );
    }
    d.mipmapCount = 1;
    g[2] & 131072 && !1 !== b && (d.mipmapCount = Math.max(1, g[7]));
    d.isCubemap = g[28] & 512 ? !0 : !1;
    d.width = g[4];
    d.height = g[3];
    for (
      var g = g[1] + 4,
        f = d.width,
        h = d.height,
        i = d.isCubemap ? 6 : 1,
        m = 0;
      m < i;
      m++
    ) {
      for (var l = 0; l < d.mipmapCount; l++) {
        if (k) {
          var p;
          p = f;
          for (
            var s = h,
              t = 4 * p * s,
              n = new Uint8Array(a, g, t),
              t = new Uint8Array(t),
              r = 0,
              q = 0,
              u = 0;
            u < s;
            u++
          )
            for (var w = 0; w < p; w++) {
              var z = n[q];
              q++;
              var B = n[q];
              q++;
              var D = n[q];
              q++;
              var x = n[q];
              q++;
              t[r] = D;
              r++;
              t[r] = B;
              r++;
              t[r] = z;
              r++;
              t[r] = x;
              r++;
            }
          p = t;
          s = p.length;
        } else
          (s = (((Math.max(4, f) / 4) * Math.max(4, h)) / 4) * e),
            (p = new Uint8Array(a, g, s));
        d.mipmaps.push({ data: p, width: f, height: h });
        g += s;
        f = Math.max(0.5 * f, 1);
        h = Math.max(0.5 * h, 1);
      }
      f = d.width;
      h = d.height;
    }
    return d;
  },
  getNormalMap: function (a, b) {
    var c = function (a) {
        var b = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
        return [a[0] / b, a[1] / b, a[2] / b];
      },
      b = b | 1,
      d = a.width,
      e = a.height,
      f = document.createElement("canvas");
    f.width = d;
    f.height = e;
    var h = f.getContext("2d");
    h.drawImage(a, 0, 0);
    for (
      var g = h.getImageData(0, 0, d, e).data,
        i = h.createImageData(d, e),
        k = i.data,
        m = 0;
      m < d;
      m++
    )
      for (var l = 0; l < e; l++) {
        var p = 0 > l - 1 ? 0 : l - 1,
          s = l + 1 > e - 1 ? e - 1 : l + 1,
          t = 0 > m - 1 ? 0 : m - 1,
          n = m + 1 > d - 1 ? d - 1 : m + 1,
          r = [],
          q = [0, 0, (g[4 * (l * d + m)] / 255) * b];
        r.push([-1, 0, (g[4 * (l * d + t)] / 255) * b]);
        r.push([-1, -1, (g[4 * (p * d + t)] / 255) * b]);
        r.push([0, -1, (g[4 * (p * d + m)] / 255) * b]);
        r.push([1, -1, (g[4 * (p * d + n)] / 255) * b]);
        r.push([1, 0, (g[4 * (l * d + n)] / 255) * b]);
        r.push([1, 1, (g[4 * (s * d + n)] / 255) * b]);
        r.push([0, 1, (g[4 * (s * d + m)] / 255) * b]);
        r.push([-1, 1, (g[4 * (s * d + t)] / 255) * b]);
        p = [];
        t = r.length;
        for (s = 0; s < t; s++) {
          var n = r[s],
            u = r[(s + 1) % t],
            n = [n[0] - q[0], n[1] - q[1], n[2] - q[2]],
            u = [u[0] - q[0], u[1] - q[1], u[2] - q[2]];
          p.push(
            c([
              n[1] * u[2] - n[2] * u[1],
              n[2] * u[0] - n[0] * u[2],
              n[0] * u[1] - n[1] * u[0],
            ])
          );
        }
        r = [0, 0, 0];
        for (s = 0; s < p.length; s++)
          (r[0] += p[s][0]), (r[1] += p[s][1]), (r[2] += p[s][2]);
        r[0] /= p.length;
        r[1] /= p.length;
        r[2] /= p.length;
        q = 4 * (l * d + m);
        k[q] = (255 * ((r[0] + 1) / 2)) | 0;
        k[q + 1] = (255 * ((r[1] + 1) / 2)) | 0;
        k[q + 2] = (255 * r[2]) | 0;
        k[q + 3] = 255;
      }
    h.putImageData(i, 0, 0);
    return f;
  },
  generateDataTexture: function (a, b, c) {
    for (
      var d = a * b,
        e = new Uint8Array(3 * d),
        f = Math.floor(255 * c.r),
        h = Math.floor(255 * c.g),
        c = Math.floor(255 * c.b),
        g = 0;
      g < d;
      g++
    )
      (e[3 * g] = f), (e[3 * g + 1] = h), (e[3 * g + 2] = c);
    a = new THREE.DataTexture(e, a, b, THREE.RGBFormat);
    a.needsUpdate = !0;
    return a;
  },
};
THREE.SceneUtils = {
  createMultiMaterialObject: function (a, b) {
    for (var c = new THREE.Object3D(), d = 0, e = b.length; d < e; d++)
      c.add(new THREE.Mesh(a, b[d]));
    return c;
  },
  detach: function (a, b, c) {
    a.applyMatrix(b.matrixWorld);
    b.remove(a);
    c.add(a);
  },
  attach: function (a, b, c) {
    var d = new THREE.Matrix4();
    d.getInverse(c.matrixWorld);
    a.applyMatrix(d);
    b.remove(a);
    c.add(a);
  },
};
THREE.FontUtils = {
  faces: {},
  face: "helvetiker",
  weight: "normal",
  style: "normal",
  size: 150,
  divisions: 10,
  getFace: function () {
    return this.faces[this.face][this.weight][this.style];
  },
  loadFace: function (a) {
    var b = a.familyName.toLowerCase();
    this.faces[b] = this.faces[b] || {};
    this.faces[b][a.cssFontWeight] = this.faces[b][a.cssFontWeight] || {};
    this.faces[b][a.cssFontWeight][a.cssFontStyle] = a;
    return (this.faces[b][a.cssFontWeight][a.cssFontStyle] = a);
  },
  drawText: function (a) {
    for (
      var b = this.getFace(),
        c = this.size / b.resolution,
        d = 0,
        e = String(a).split(""),
        f = e.length,
        h = [],
        a = 0;
      a < f;
      a++
    ) {
      var g = new THREE.Path(),
        g = this.extractGlyphPoints(e[a], b, c, d, g),
        d = d + g.offset;
      h.push(g.path);
    }
    return { paths: h, offset: d / 2 };
  },
  extractGlyphPoints: function (a, b, c, d, e) {
    var f = [],
      h,
      g,
      i,
      k,
      m,
      l,
      p,
      s,
      t,
      n,
      r,
      q = b.glyphs[a] || b.glyphs["?"];
    if (q) {
      if (q.o) {
        b = q._cachedOutline || (q._cachedOutline = q.o.split(" "));
        k = b.length;
        for (a = 0; a < k; )
          switch (((i = b[a++]), i)) {
            case "m":
              i = b[a++] * c + d;
              m = b[a++] * c;
              e.moveTo(i, m);
              break;
            case "l":
              i = b[a++] * c + d;
              m = b[a++] * c;
              e.lineTo(i, m);
              break;
            case "q":
              i = b[a++] * c + d;
              m = b[a++] * c;
              s = b[a++] * c + d;
              t = b[a++] * c;
              e.quadraticCurveTo(s, t, i, m);
              if ((h = f[f.length - 1])) {
                l = h.x;
                p = h.y;
                h = 1;
                for (g = this.divisions; h <= g; h++) {
                  var u = h / g;
                  THREE.Shape.Utils.b2(u, l, s, i);
                  THREE.Shape.Utils.b2(u, p, t, m);
                }
              }
              break;
            case "b":
              if (
                ((i = b[a++] * c + d),
                (m = b[a++] * c),
                (s = b[a++] * c + d),
                (t = b[a++] * -c),
                (n = b[a++] * c + d),
                (r = b[a++] * -c),
                e.bezierCurveTo(i, m, s, t, n, r),
                (h = f[f.length - 1]))
              ) {
                l = h.x;
                p = h.y;
                h = 1;
                for (g = this.divisions; h <= g; h++)
                  (u = h / g),
                    THREE.Shape.Utils.b3(u, l, s, n, i),
                    THREE.Shape.Utils.b3(u, p, t, r, m);
              }
          }
      }
      return { offset: q.ha * c, path: e };
    }
  },
};
THREE.FontUtils.generateShapes = function (a, b) {
  var b = b || {},
    c = void 0 !== b.curveSegments ? b.curveSegments : 4,
    d = void 0 !== b.font ? b.font : "helvetiker",
    e = void 0 !== b.weight ? b.weight : "normal",
    f = void 0 !== b.style ? b.style : "normal";
  THREE.FontUtils.size = void 0 !== b.size ? b.size : 100;
  THREE.FontUtils.divisions = c;
  THREE.FontUtils.face = d;
  THREE.FontUtils.weight = e;
  THREE.FontUtils.style = f;
  c = THREE.FontUtils.drawText(a).paths;
  d = [];
  e = 0;
  for (f = c.length; e < f; e++) Array.prototype.push.apply(d, c[e].toShapes());
  return d;
};
(function (a) {
  var b = function (a) {
    for (var b = a.length, e = 0, f = b - 1, h = 0; h < b; f = h++)
      e += a[f].x * a[h].y - a[h].x * a[f].y;
    return 0.5 * e;
  };
  a.Triangulate = function (a, d) {
    var e = a.length;
    if (3 > e) return null;
    var f = [],
      h = [],
      g = [],
      i,
      k,
      m;
    if (0 < b(a)) for (k = 0; k < e; k++) h[k] = k;
    else for (k = 0; k < e; k++) h[k] = e - 1 - k;
    var l = 2 * e;
    for (k = e - 1; 2 < e; ) {
      if (0 >= l--) {
        console.log("Warning, unable to triangulate polygon!");
        break;
      }
      i = k;
      e <= i && (i = 0);
      k = i + 1;
      e <= k && (k = 0);
      m = k + 1;
      e <= m && (m = 0);
      var p;
      a: {
        var s = (p = void 0),
          t = void 0,
          n = void 0,
          r = void 0,
          q = void 0,
          u = void 0,
          w = void 0,
          z = void 0,
          s = a[h[i]].x,
          t = a[h[i]].y,
          n = a[h[k]].x,
          r = a[h[k]].y,
          q = a[h[m]].x,
          u = a[h[m]].y;
        if (1e-10 > (n - s) * (u - t) - (r - t) * (q - s)) p = !1;
        else {
          var B = void 0,
            D = void 0,
            x = void 0,
            F = void 0,
            A = void 0,
            O = void 0,
            C = void 0,
            E = void 0,
            I = void 0,
            y = void 0,
            I = (E = C = z = w = void 0),
            B = q - n,
            D = u - r,
            x = s - q,
            F = t - u,
            A = n - s,
            O = r - t;
          for (p = 0; p < e; p++)
            if (!(p === i || p === k || p === m))
              if (
                ((w = a[h[p]].x),
                (z = a[h[p]].y),
                (C = w - s),
                (E = z - t),
                (I = w - n),
                (y = z - r),
                (w -= q),
                (z -= u),
                (I = B * y - D * I),
                (C = A * E - O * C),
                (E = x * z - F * w),
                -1e-10 <= I && -1e-10 <= E && -1e-10 <= C)
              ) {
                p = !1;
                break a;
              }
          p = !0;
        }
      }
      if (p) {
        f.push([a[h[i]], a[h[k]], a[h[m]]]);
        g.push([h[i], h[k], h[m]]);
        i = k;
        for (m = k + 1; m < e; i++, m++) h[i] = h[m];
        e--;
        l = 2 * e;
      }
    }
    return d ? g : f;
  };
  a.Triangulate.area = b;
  return a;
})(THREE.FontUtils);
self._typeface_js = {
  faces: THREE.FontUtils.faces,
  loadFace: THREE.FontUtils.loadFace,
};
THREE.typeface_js = self._typeface_js;
THREE.Curve = function () {};
THREE.Curve.prototype.getPoint = function () {
  console.log("Warning, getPoint() not implemented!");
  return null;
};
THREE.Curve.prototype.getPointAt = function (a) {
  a = this.getUtoTmapping(a);
  return this.getPoint(a);
};
THREE.Curve.prototype.getPoints = function (a) {
  a || (a = 5);
  var b,
    c = [];
  for (b = 0; b <= a; b++) c.push(this.getPoint(b / a));
  return c;
};
THREE.Curve.prototype.getSpacedPoints = function (a) {
  a || (a = 5);
  var b,
    c = [];
  for (b = 0; b <= a; b++) c.push(this.getPointAt(b / a));
  return c;
};
THREE.Curve.prototype.getLength = function () {
  var a = this.getLengths();
  return a[a.length - 1];
};
THREE.Curve.prototype.getLengths = function (a) {
  a || (a = this.__arcLengthDivisions ? this.__arcLengthDivisions : 200);
  if (
    this.cacheArcLengths &&
    this.cacheArcLengths.length == a + 1 &&
    !this.needsUpdate
  )
    return this.cacheArcLengths;
  this.needsUpdate = !1;
  var b = [],
    c,
    d = this.getPoint(0),
    e,
    f = 0;
  b.push(0);
  for (e = 1; e <= a; e++)
    (c = this.getPoint(e / a)), (f += c.distanceTo(d)), b.push(f), (d = c);
  return (this.cacheArcLengths = b);
};
THREE.Curve.prototype.updateArcLengths = function () {
  this.needsUpdate = !0;
  this.getLengths();
};
THREE.Curve.prototype.getUtoTmapping = function (a, b) {
  var c = this.getLengths(),
    d = 0,
    e = c.length,
    f;
  f = b ? b : a * c[e - 1];
  for (var h = 0, g = e - 1, i; h <= g; )
    if (((d = Math.floor(h + (g - h) / 2)), (i = c[d] - f), 0 > i)) h = d + 1;
    else if (0 < i) g = d - 1;
    else {
      g = d;
      break;
    }
  d = g;
  if (c[d] == f) return d / (e - 1);
  h = c[d];
  return (c = (d + (f - h) / (c[d + 1] - h)) / (e - 1));
};
THREE.Curve.prototype.getTangent = function (a) {
  var b = a - 1e-4,
    a = a + 1e-4;
  0 > b && (b = 0);
  1 < a && (a = 1);
  b = this.getPoint(b);
  return this.getPoint(a).clone().sub(b).normalize();
};
THREE.Curve.prototype.getTangentAt = function (a) {
  a = this.getUtoTmapping(a);
  return this.getTangent(a);
};
THREE.Curve.Utils = {
  tangentQuadraticBezier: function (a, b, c, d) {
    return 2 * (1 - a) * (c - b) + 2 * a * (d - c);
  },
  tangentCubicBezier: function (a, b, c, d, e) {
    return (
      -3 * b * (1 - a) * (1 - a) +
      3 * c * (1 - a) * (1 - a) -
      6 * a * c * (1 - a) +
      6 * a * d * (1 - a) -
      3 * a * a * d +
      3 * a * a * e
    );
  },
  tangentSpline: function (a) {
    return (
      6 * a * a -
      6 * a +
      (3 * a * a - 4 * a + 1) +
      (-6 * a * a + 6 * a) +
      (3 * a * a - 2 * a)
    );
  },
  interpolate: function (a, b, c, d, e) {
    var a = 0.5 * (c - a),
      d = 0.5 * (d - b),
      f = e * e;
    return (
      (2 * b - 2 * c + a + d) * e * f +
      (-3 * b + 3 * c - 2 * a - d) * f +
      a * e +
      b
    );
  },
};
THREE.Curve.create = function (a, b) {
  a.prototype = Object.create(THREE.Curve.prototype);
  a.prototype.getPoint = b;
  return a;
};
THREE.CurvePath = function () {
  this.curves = [];
  this.bends = [];
  this.autoClose = !1;
};
THREE.CurvePath.prototype = Object.create(THREE.Curve.prototype);
THREE.CurvePath.prototype.add = function (a) {
  this.curves.push(a);
};
THREE.CurvePath.prototype.checkConnection = function () {};
THREE.CurvePath.prototype.closePath = function () {
  var a = this.curves[0].getPoint(0),
    b = this.curves[this.curves.length - 1].getPoint(1);
  a.equals(b) || this.curves.push(new THREE.LineCurve(b, a));
};
THREE.CurvePath.prototype.getPoint = function (a) {
  for (
    var b = a * this.getLength(), c = this.getCurveLengths(), a = 0;
    a < c.length;

  ) {
    if (c[a] >= b)
      return (
        (b = c[a] - b),
        (a = this.curves[a]),
        (b = 1 - b / a.getLength()),
        a.getPointAt(b)
      );
    a++;
  }
  return null;
};
THREE.CurvePath.prototype.getLength = function () {
  var a = this.getCurveLengths();
  return a[a.length - 1];
};
THREE.CurvePath.prototype.getCurveLengths = function () {
  if (this.cacheLengths && this.cacheLengths.length == this.curves.length)
    return this.cacheLengths;
  var a = [],
    b = 0,
    c,
    d = this.curves.length;
  for (c = 0; c < d; c++) (b += this.curves[c].getLength()), a.push(b);
  return (this.cacheLengths = a);
};
THREE.CurvePath.prototype.getBoundingBox = function () {
  var a = this.getPoints(),
    b,
    c,
    d,
    e,
    f,
    h;
  b = c = Number.NEGATIVE_INFINITY;
  e = f = Number.POSITIVE_INFINITY;
  var g,
    i,
    k,
    m,
    l = a[0] instanceof THREE.Vector3;
  m = l ? new THREE.Vector3() : new THREE.Vector2();
  i = 0;
  for (k = a.length; i < k; i++)
    (g = a[i]),
      g.x > b ? (b = g.x) : g.x < e && (e = g.x),
      g.y > c ? (c = g.y) : g.y < f && (f = g.y),
      l && (g.z > d ? (d = g.z) : g.z < h && (h = g.z)),
      m.add(g);
  a = { minX: e, minY: f, maxX: b, maxY: c, centroid: m.divideScalar(k) };
  l && ((a.maxZ = d), (a.minZ = h));
  return a;
};
THREE.CurvePath.prototype.createPointsGeometry = function (a) {
  a = this.getPoints(a, !0);
  return this.createGeometry(a);
};
THREE.CurvePath.prototype.createSpacedPointsGeometry = function (a) {
  a = this.getSpacedPoints(a, !0);
  return this.createGeometry(a);
};
THREE.CurvePath.prototype.createGeometry = function (a) {
  for (var b = new THREE.Geometry(), c = 0; c < a.length; c++)
    b.vertices.push(new THREE.Vector3(a[c].x, a[c].y, a[c].z || 0));
  return b;
};
THREE.CurvePath.prototype.addWrapPath = function (a) {
  this.bends.push(a);
};
THREE.CurvePath.prototype.getTransformedPoints = function (a, b) {
  var c = this.getPoints(a),
    d,
    e;
  b || (b = this.bends);
  d = 0;
  for (e = b.length; d < e; d++) c = this.getWrapPoints(c, b[d]);
  return c;
};
THREE.CurvePath.prototype.getTransformedSpacedPoints = function (a, b) {
  var c = this.getSpacedPoints(a),
    d,
    e;
  b || (b = this.bends);
  d = 0;
  for (e = b.length; d < e; d++) c = this.getWrapPoints(c, b[d]);
  return c;
};
THREE.CurvePath.prototype.getWrapPoints = function (a, b) {
  var c = this.getBoundingBox(),
    d,
    e,
    f,
    h,
    g,
    i;
  d = 0;
  for (e = a.length; d < e; d++)
    (f = a[d]),
      (h = f.x),
      (g = f.y),
      (i = h / c.maxX),
      (i = b.getUtoTmapping(i, h)),
      (h = b.getPoint(i)),
      (g = b.getNormalVector(i).multiplyScalar(g)),
      (f.x = h.x + g.x),
      (f.y = h.y + g.y);
  return a;
};
THREE.Gyroscope = function () {
  THREE.Object3D.call(this);
};
THREE.Gyroscope.prototype = Object.create(THREE.Object3D.prototype);
THREE.Gyroscope.prototype.updateMatrixWorld = function (a) {
  this.matrixAutoUpdate && this.updateMatrix();
  if (this.matrixWorldNeedsUpdate || a)
    this.parent
      ? (this.matrixWorld.multiplyMatrices(
          this.parent.matrixWorld,
          this.matrix
        ),
        this.matrixWorld.decompose(
          this.translationWorld,
          this.quaternionWorld,
          this.scaleWorld
        ),
        this.matrix.decompose(
          this.translationObject,
          this.quaternionObject,
          this.scaleObject
        ),
        this.matrixWorld.compose(
          this.translationWorld,
          this.quaternionObject,
          this.scaleWorld
        ))
      : this.matrixWorld.copy(this.matrix),
      (this.matrixWorldNeedsUpdate = !1),
      (a = !0);
  for (var b = 0, c = this.children.length; b < c; b++)
    this.children[b].updateMatrixWorld(a);
};
THREE.Gyroscope.prototype.translationWorld = new THREE.Vector3();
THREE.Gyroscope.prototype.translationObject = new THREE.Vector3();
THREE.Gyroscope.prototype.quaternionWorld = new THREE.Quaternion();
THREE.Gyroscope.prototype.quaternionObject = new THREE.Quaternion();
THREE.Gyroscope.prototype.scaleWorld = new THREE.Vector3();
THREE.Gyroscope.prototype.scaleObject = new THREE.Vector3();
THREE.Path = function (a) {
  THREE.CurvePath.call(this);
  this.actions = [];
  a && this.fromPoints(a);
};
THREE.Path.prototype = Object.create(THREE.CurvePath.prototype);
THREE.PathActions = {
  MOVE_TO: "moveTo",
  LINE_TO: "lineTo",
  QUADRATIC_CURVE_TO: "quadraticCurveTo",
  BEZIER_CURVE_TO: "bezierCurveTo",
  CSPLINE_THRU: "splineThru",
  ARC: "arc",
  ELLIPSE: "ellipse",
};
THREE.Path.prototype.fromPoints = function (a) {
  this.moveTo(a[0].x, a[0].y);
  for (var b = 1, c = a.length; b < c; b++) this.lineTo(a[b].x, a[b].y);
};
THREE.Path.prototype.moveTo = function (a, b) {
  var c = Array.prototype.slice.call(arguments);
  this.actions.push({ action: THREE.PathActions.MOVE_TO, args: c });
};
THREE.Path.prototype.lineTo = function (a, b) {
  var c = Array.prototype.slice.call(arguments),
    d = this.actions[this.actions.length - 1].args,
    d = new THREE.LineCurve(
      new THREE.Vector2(d[d.length - 2], d[d.length - 1]),
      new THREE.Vector2(a, b)
    );
  this.curves.push(d);
  this.actions.push({ action: THREE.PathActions.LINE_TO, args: c });
};
THREE.Path.prototype.quadraticCurveTo = function (a, b, c, d) {
  var e = Array.prototype.slice.call(arguments),
    f = this.actions[this.actions.length - 1].args,
    f = new THREE.QuadraticBezierCurve(
      new THREE.Vector2(f[f.length - 2], f[f.length - 1]),
      new THREE.Vector2(a, b),
      new THREE.Vector2(c, d)
    );
  this.curves.push(f);
  this.actions.push({ action: THREE.PathActions.QUADRATIC_CURVE_TO, args: e });
};
THREE.Path.prototype.bezierCurveTo = function (a, b, c, d, e, f) {
  var h = Array.prototype.slice.call(arguments),
    g = this.actions[this.actions.length - 1].args,
    g = new THREE.CubicBezierCurve(
      new THREE.Vector2(g[g.length - 2], g[g.length - 1]),
      new THREE.Vector2(a, b),
      new THREE.Vector2(c, d),
      new THREE.Vector2(e, f)
    );
  this.curves.push(g);
  this.actions.push({ action: THREE.PathActions.BEZIER_CURVE_TO, args: h });
};
THREE.Path.prototype.splineThru = function (a) {
  var b = Array.prototype.slice.call(arguments),
    c = this.actions[this.actions.length - 1].args,
    c = [new THREE.Vector2(c[c.length - 2], c[c.length - 1])];
  Array.prototype.push.apply(c, a);
  c = new THREE.SplineCurve(c);
  this.curves.push(c);
  this.actions.push({ action: THREE.PathActions.CSPLINE_THRU, args: b });
};
THREE.Path.prototype.arc = function (a, b, c, d, e, f) {
  var h = this.actions[this.actions.length - 1].args;
  this.absarc(a + h[h.length - 2], b + h[h.length - 1], c, d, e, f);
};
THREE.Path.prototype.absarc = function (a, b, c, d, e, f) {
  this.absellipse(a, b, c, c, d, e, f);
};
THREE.Path.prototype.ellipse = function (a, b, c, d, e, f, h) {
  var g = this.actions[this.actions.length - 1].args;
  this.absellipse(a + g[g.length - 2], b + g[g.length - 1], c, d, e, f, h);
};
THREE.Path.prototype.absellipse = function (a, b, c, d, e, f, h) {
  var g = Array.prototype.slice.call(arguments),
    i = new THREE.EllipseCurve(a, b, c, d, e, f, h);
  this.curves.push(i);
  i = i.getPoint(1);
  g.push(i.x);
  g.push(i.y);
  this.actions.push({ action: THREE.PathActions.ELLIPSE, args: g });
};
THREE.Path.prototype.getSpacedPoints = function (a) {
  a || (a = 40);
  for (var b = [], c = 0; c < a; c++) b.push(this.getPoint(c / a));
  return b;
};
THREE.Path.prototype.getPoints = function (a, b) {
  if (this.useSpacedPoints)
    return console.log("tata"), this.getSpacedPoints(a, b);
  var a = a || 12,
    c = [],
    d,
    e,
    f,
    h,
    g,
    i,
    k,
    m,
    l,
    p,
    s,
    t,
    n;
  d = 0;
  for (e = this.actions.length; d < e; d++)
    switch (((f = this.actions[d]), (h = f.action), (f = f.args), h)) {
      case THREE.PathActions.MOVE_TO:
        c.push(new THREE.Vector2(f[0], f[1]));
        break;
      case THREE.PathActions.LINE_TO:
        c.push(new THREE.Vector2(f[0], f[1]));
        break;
      case THREE.PathActions.QUADRATIC_CURVE_TO:
        g = f[2];
        i = f[3];
        l = f[0];
        p = f[1];
        0 < c.length
          ? ((h = c[c.length - 1]), (s = h.x), (t = h.y))
          : ((h = this.actions[d - 1].args),
            (s = h[h.length - 2]),
            (t = h[h.length - 1]));
        for (f = 1; f <= a; f++)
          (n = f / a),
            (h = THREE.Shape.Utils.b2(n, s, l, g)),
            (n = THREE.Shape.Utils.b2(n, t, p, i)),
            c.push(new THREE.Vector2(h, n));
        break;
      case THREE.PathActions.BEZIER_CURVE_TO:
        g = f[4];
        i = f[5];
        l = f[0];
        p = f[1];
        k = f[2];
        m = f[3];
        0 < c.length
          ? ((h = c[c.length - 1]), (s = h.x), (t = h.y))
          : ((h = this.actions[d - 1].args),
            (s = h[h.length - 2]),
            (t = h[h.length - 1]));
        for (f = 1; f <= a; f++)
          (n = f / a),
            (h = THREE.Shape.Utils.b3(n, s, l, k, g)),
            (n = THREE.Shape.Utils.b3(n, t, p, m, i)),
            c.push(new THREE.Vector2(h, n));
        break;
      case THREE.PathActions.CSPLINE_THRU:
        h = this.actions[d - 1].args;
        n = [new THREE.Vector2(h[h.length - 2], h[h.length - 1])];
        h = a * f[0].length;
        n = n.concat(f[0]);
        n = new THREE.SplineCurve(n);
        for (f = 1; f <= h; f++) c.push(n.getPointAt(f / h));
        break;
      case THREE.PathActions.ARC:
        g = f[0];
        i = f[1];
        p = f[2];
        k = f[3];
        h = f[4];
        l = !!f[5];
        s = h - k;
        t = 2 * a;
        for (f = 1; f <= t; f++)
          (n = f / t),
            l || (n = 1 - n),
            (n = k + n * s),
            (h = g + p * Math.cos(n)),
            (n = i + p * Math.sin(n)),
            c.push(new THREE.Vector2(h, n));
        break;
      case THREE.PathActions.ELLIPSE:
        g = f[0];
        i = f[1];
        p = f[2];
        m = f[3];
        k = f[4];
        h = f[5];
        l = !!f[6];
        s = h - k;
        t = 2 * a;
        for (f = 1; f <= t; f++)
          (n = f / t),
            l || (n = 1 - n),
            (n = k + n * s),
            (h = g + p * Math.cos(n)),
            (n = i + m * Math.sin(n)),
            c.push(new THREE.Vector2(h, n));
    }
  d = c[c.length - 1];
  1e-10 > Math.abs(d.x - c[0].x) &&
    1e-10 > Math.abs(d.y - c[0].y) &&
    c.splice(c.length - 1, 1);
  b && c.push(c[0]);
  return c;
};
THREE.Path.prototype.toShapes = function (a) {
  var b,
    c,
    d,
    e,
    f = [],
    h = new THREE.Path();
  b = 0;
  for (c = this.actions.length; b < c; b++)
    (d = this.actions[b]),
      (e = d.args),
      (d = d.action),
      d == THREE.PathActions.MOVE_TO &&
        0 != h.actions.length &&
        (f.push(h), (h = new THREE.Path())),
      h[d].apply(h, e);
  0 != h.actions.length && f.push(h);
  if (0 == f.length) return [];
  var g;
  e = [];
  if (1 == f.length)
    return (
      (d = f[0]),
      (g = new THREE.Shape()),
      (g.actions = d.actions),
      (g.curves = d.curves),
      e.push(g),
      e
    );
  b = !THREE.Shape.Utils.isClockWise(f[0].getPoints());
  if (a ? !b : b) {
    g = new THREE.Shape();
    b = 0;
    for (c = f.length; b < c; b++)
      (d = f[b]),
        (h = THREE.Shape.Utils.isClockWise(d.getPoints())),
        (h = a ? !h : h)
          ? ((g.actions = d.actions),
            (g.curves = d.curves),
            e.push(g),
            (g = new THREE.Shape()))
          : g.holes.push(d);
  } else {
    g = void 0;
    b = 0;
    for (c = f.length; b < c; b++)
      (d = f[b]),
        (h = THREE.Shape.Utils.isClockWise(d.getPoints())),
        (h = a ? !h : h)
          ? (g && e.push(g),
            (g = new THREE.Shape()),
            (g.actions = d.actions),
            (g.curves = d.curves))
          : g.holes.push(d);
    e.push(g);
  }
  return e;
};
THREE.Shape = function () {
  THREE.Path.apply(this, arguments);
  this.holes = [];
};
THREE.Shape.prototype = Object.create(THREE.Path.prototype);
THREE.Shape.prototype.extrude = function (a) {
  return new THREE.ExtrudeGeometry(this, a);
};
THREE.Shape.prototype.makeGeometry = function (a) {
  return new THREE.ShapeGeometry(this, a);
};
THREE.Shape.prototype.getPointsHoles = function (a) {
  var b,
    c = this.holes.length,
    d = [];
  for (b = 0; b < c; b++)
    d[b] = this.holes[b].getTransformedPoints(a, this.bends);
  return d;
};
THREE.Shape.prototype.getSpacedPointsHoles = function (a) {
  var b,
    c = this.holes.length,
    d = [];
  for (b = 0; b < c; b++)
    d[b] = this.holes[b].getTransformedSpacedPoints(a, this.bends);
  return d;
};
THREE.Shape.prototype.extractAllPoints = function (a) {
  return { shape: this.getTransformedPoints(a), holes: this.getPointsHoles(a) };
};
THREE.Shape.prototype.extractPoints = function (a) {
  return this.useSpacedPoints
    ? this.extractAllSpacedPoints(a)
    : this.extractAllPoints(a);
};
THREE.Shape.prototype.extractAllSpacedPoints = function (a) {
  return {
    shape: this.getTransformedSpacedPoints(a),
    holes: this.getSpacedPointsHoles(a),
  };
};
THREE.Shape.Utils = {
  removeHoles: function (a, b) {
    var c = a.concat(),
      d = c.concat(),
      e,
      f,
      h,
      g,
      i,
      k,
      m,
      l,
      p,
      s,
      t = [];
    for (i = 0; i < b.length; i++) {
      k = b[i];
      Array.prototype.push.apply(d, k);
      f = Number.POSITIVE_INFINITY;
      for (e = 0; e < k.length; e++) {
        p = k[e];
        s = [];
        for (l = 0; l < c.length; l++)
          (m = c[l]),
            (m = p.distanceToSquared(m)),
            s.push(m),
            m < f && ((f = m), (h = e), (g = l));
      }
      e = 0 <= g - 1 ? g - 1 : c.length - 1;
      f = 0 <= h - 1 ? h - 1 : k.length - 1;
      var n = [k[h], c[g], c[e]];
      l = THREE.FontUtils.Triangulate.area(n);
      var r = [k[h], k[f], c[g]];
      p = THREE.FontUtils.Triangulate.area(r);
      s = g;
      m = h;
      g += 1;
      h += -1;
      0 > g && (g += c.length);
      g %= c.length;
      0 > h && (h += k.length);
      h %= k.length;
      e = 0 <= g - 1 ? g - 1 : c.length - 1;
      f = 0 <= h - 1 ? h - 1 : k.length - 1;
      n = [k[h], c[g], c[e]];
      n = THREE.FontUtils.Triangulate.area(n);
      r = [k[h], k[f], c[g]];
      r = THREE.FontUtils.Triangulate.area(r);
      l + p > n + r &&
        ((g = s),
        (h = m),
        0 > g && (g += c.length),
        (g %= c.length),
        0 > h && (h += k.length),
        (h %= k.length),
        (e = 0 <= g - 1 ? g - 1 : c.length - 1),
        (f = 0 <= h - 1 ? h - 1 : k.length - 1));
      l = c.slice(0, g);
      p = c.slice(g);
      s = k.slice(h);
      m = k.slice(0, h);
      f = [k[h], k[f], c[g]];
      t.push([k[h], c[g], c[e]]);
      t.push(f);
      c = l.concat(s).concat(m).concat(p);
    }
    return { shape: c, isolatedPts: t, allpoints: d };
  },
  triangulateShape: function (a, b) {
    var c = THREE.Shape.Utils.removeHoles(a, b),
      d = c.allpoints,
      e = c.isolatedPts,
      c = THREE.FontUtils.Triangulate(c.shape, !1),
      f,
      h,
      g,
      i,
      k = {};
    f = 0;
    for (h = d.length; f < h; f++)
      (i = d[f].x + ":" + d[f].y),
        void 0 !== k[i] && console.log("Duplicate point", i),
        (k[i] = f);
    f = 0;
    for (h = c.length; f < h; f++) {
      g = c[f];
      for (d = 0; 3 > d; d++)
        (i = g[d].x + ":" + g[d].y), (i = k[i]), void 0 !== i && (g[d] = i);
    }
    f = 0;
    for (h = e.length; f < h; f++) {
      g = e[f];
      for (d = 0; 3 > d; d++)
        (i = g[d].x + ":" + g[d].y), (i = k[i]), void 0 !== i && (g[d] = i);
    }
    return c.concat(e);
  },
  isClockWise: function (a) {
    return 0 > THREE.FontUtils.Triangulate.area(a);
  },
  b2p0: function (a, b) {
    var c = 1 - a;
    return c * c * b;
  },
  b2p1: function (a, b) {
    return 2 * (1 - a) * a * b;
  },
  b2p2: function (a, b) {
    return a * a * b;
  },
  b2: function (a, b, c, d) {
    return this.b2p0(a, b) + this.b2p1(a, c) + this.b2p2(a, d);
  },
  b3p0: function (a, b) {
    var c = 1 - a;
    return c * c * c * b;
  },
  b3p1: function (a, b) {
    var c = 1 - a;
    return 3 * c * c * a * b;
  },
  b3p2: function (a, b) {
    return 3 * (1 - a) * a * a * b;
  },
  b3p3: function (a, b) {
    return a * a * a * b;
  },
  b3: function (a, b, c, d, e) {
    return (
      this.b3p0(a, b) + this.b3p1(a, c) + this.b3p2(a, d) + this.b3p3(a, e)
    );
  },
};
THREE.LineCurve = function (a, b) {
  this.v1 = a;
  this.v2 = b;
};
THREE.LineCurve.prototype = Object.create(THREE.Curve.prototype);
THREE.LineCurve.prototype.getPoint = function (a) {
  var b = this.v2.clone().sub(this.v1);
  b.multiplyScalar(a).add(this.v1);
  return b;
};
THREE.LineCurve.prototype.getPointAt = function (a) {
  return this.getPoint(a);
};
THREE.LineCurve.prototype.getTangent = function () {
  return this.v2.clone().sub(this.v1).normalize();
};
THREE.QuadraticBezierCurve = function (a, b, c) {
  this.v0 = a;
  this.v1 = b;
  this.v2 = c;
};
THREE.QuadraticBezierCurve.prototype = Object.create(THREE.Curve.prototype);
THREE.QuadraticBezierCurve.prototype.getPoint = function (a) {
  var b;
  b = THREE.Shape.Utils.b2(a, this.v0.x, this.v1.x, this.v2.x);
  a = THREE.Shape.Utils.b2(a, this.v0.y, this.v1.y, this.v2.y);
  return new THREE.Vector2(b, a);
};
THREE.QuadraticBezierCurve.prototype.getTangent = function (a) {
  var b;
  b = THREE.Curve.Utils.tangentQuadraticBezier(
    a,
    this.v0.x,
    this.v1.x,
    this.v2.x
  );
  a = THREE.Curve.Utils.tangentQuadraticBezier(
    a,
    this.v0.y,
    this.v1.y,
    this.v2.y
  );
  b = new THREE.Vector2(b, a);
  b.normalize();
  return b;
};
THREE.CubicBezierCurve = function (a, b, c, d) {
  this.v0 = a;
  this.v1 = b;
  this.v2 = c;
  this.v3 = d;
};
THREE.CubicBezierCurve.prototype = Object.create(THREE.Curve.prototype);
THREE.CubicBezierCurve.prototype.getPoint = function (a) {
  var b;
  b = THREE.Shape.Utils.b3(a, this.v0.x, this.v1.x, this.v2.x, this.v3.x);
  a = THREE.Shape.Utils.b3(a, this.v0.y, this.v1.y, this.v2.y, this.v3.y);
  return new THREE.Vector2(b, a);
};
THREE.CubicBezierCurve.prototype.getTangent = function (a) {
  var b;
  b = THREE.Curve.Utils.tangentCubicBezier(
    a,
    this.v0.x,
    this.v1.x,
    this.v2.x,
    this.v3.x
  );
  a = THREE.Curve.Utils.tangentCubicBezier(
    a,
    this.v0.y,
    this.v1.y,
    this.v2.y,
    this.v3.y
  );
  b = new THREE.Vector2(b, a);
  b.normalize();
  return b;
};
THREE.SplineCurve = function (a) {
  this.points = void 0 == a ? [] : a;
};
THREE.SplineCurve.prototype = Object.create(THREE.Curve.prototype);
THREE.SplineCurve.prototype.getPoint = function (a) {
  var b = new THREE.Vector2(),
    c = [],
    d = this.points,
    e;
  e = (d.length - 1) * a;
  a = Math.floor(e);
  e -= a;
  c[0] = 0 == a ? a : a - 1;
  c[1] = a;
  c[2] = a > d.length - 2 ? d.length - 1 : a + 1;
  c[3] = a > d.length - 3 ? d.length - 1 : a + 2;
  b.x = THREE.Curve.Utils.interpolate(
    d[c[0]].x,
    d[c[1]].x,
    d[c[2]].x,
    d[c[3]].x,
    e
  );
  b.y = THREE.Curve.Utils.interpolate(
    d[c[0]].y,
    d[c[1]].y,
    d[c[2]].y,
    d[c[3]].y,
    e
  );
  return b;
};
THREE.EllipseCurve = function (a, b, c, d, e, f, h) {
  this.aX = a;
  this.aY = b;
  this.xRadius = c;
  this.yRadius = d;
  this.aStartAngle = e;
  this.aEndAngle = f;
  this.aClockwise = h;
};
THREE.EllipseCurve.prototype = Object.create(THREE.Curve.prototype);
THREE.EllipseCurve.prototype.getPoint = function (a) {
  var b;
  b = this.aEndAngle - this.aStartAngle;
  0 > b && (b += 2 * Math.PI);
  b > 2 * Math.PI && (b -= 2 * Math.PI);
  b =
    !0 === this.aClockwise
      ? this.aEndAngle + (1 - a) * (2 * Math.PI - b)
      : this.aStartAngle + a * b;
  a = this.aX + this.xRadius * Math.cos(b);
  b = this.aY + this.yRadius * Math.sin(b);
  return new THREE.Vector2(a, b);
};
THREE.ArcCurve = function (a, b, c, d, e, f) {
  THREE.EllipseCurve.call(this, a, b, c, c, d, e, f);
};
THREE.ArcCurve.prototype = Object.create(THREE.EllipseCurve.prototype);
THREE.LineCurve3 = THREE.Curve.create(
  function (a, b) {
    this.v1 = a;
    this.v2 = b;
  },
  function (a) {
    var b = new THREE.Vector3();
    b.subVectors(this.v2, this.v1);
    b.multiplyScalar(a);
    b.add(this.v1);
    return b;
  }
);
THREE.QuadraticBezierCurve3 = THREE.Curve.create(
  function (a, b, c) {
    this.v0 = a;
    this.v1 = b;
    this.v2 = c;
  },
  function (a) {
    var b, c;
    b = THREE.Shape.Utils.b2(a, this.v0.x, this.v1.x, this.v2.x);
    c = THREE.Shape.Utils.b2(a, this.v0.y, this.v1.y, this.v2.y);
    a = THREE.Shape.Utils.b2(a, this.v0.z, this.v1.z, this.v2.z);
    return new THREE.Vector3(b, c, a);
  }
);
THREE.CubicBezierCurve3 = THREE.Curve.create(
  function (a, b, c, d) {
    this.v0 = a;
    this.v1 = b;
    this.v2 = c;
    this.v3 = d;
  },
  function (a) {
    var b, c;
    b = THREE.Shape.Utils.b3(a, this.v0.x, this.v1.x, this.v2.x, this.v3.x);
    c = THREE.Shape.Utils.b3(a, this.v0.y, this.v1.y, this.v2.y, this.v3.y);
    a = THREE.Shape.Utils.b3(a, this.v0.z, this.v1.z, this.v2.z, this.v3.z);
    return new THREE.Vector3(b, c, a);
  }
);
THREE.SplineCurve3 = THREE.Curve.create(
  function (a) {
    this.points = void 0 == a ? [] : a;
  },
  function (a) {
    var b = new THREE.Vector3(),
      c = [],
      d = this.points,
      e,
      a = (d.length - 1) * a;
    e = Math.floor(a);
    a -= e;
    c[0] = 0 == e ? e : e - 1;
    c[1] = e;
    c[2] = e > d.length - 2 ? d.length - 1 : e + 1;
    c[3] = e > d.length - 3 ? d.length - 1 : e + 2;
    e = d[c[0]];
    var f = d[c[1]],
      h = d[c[2]],
      c = d[c[3]];
    b.x = THREE.Curve.Utils.interpolate(e.x, f.x, h.x, c.x, a);
    b.y = THREE.Curve.Utils.interpolate(e.y, f.y, h.y, c.y, a);
    b.z = THREE.Curve.Utils.interpolate(e.z, f.z, h.z, c.z, a);
    return b;
  }
);
THREE.ClosedSplineCurve3 = THREE.Curve.create(
  function (a) {
    this.points = void 0 == a ? [] : a;
  },
  function (a) {
    var b = new THREE.Vector3(),
      c = [],
      d = this.points,
      e;
    e = (d.length - 0) * a;
    a = Math.floor(e);
    e -= a;
    a += 0 < a ? 0 : (Math.floor(Math.abs(a) / d.length) + 1) * d.length;
    c[0] = (a - 1) % d.length;
    c[1] = a % d.length;
    c[2] = (a + 1) % d.length;
    c[3] = (a + 2) % d.length;
    b.x = THREE.Curve.Utils.interpolate(
      d[c[0]].x,
      d[c[1]].x,
      d[c[2]].x,
      d[c[3]].x,
      e
    );
    b.y = THREE.Curve.Utils.interpolate(
      d[c[0]].y,
      d[c[1]].y,
      d[c[2]].y,
      d[c[3]].y,
      e
    );
    b.z = THREE.Curve.Utils.interpolate(
      d[c[0]].z,
      d[c[1]].z,
      d[c[2]].z,
      d[c[3]].z,
      e
    );
    return b;
  }
);
THREE.AnimationHandler = (function () {
  var a = [],
    b = {},
    c = {
      update: function (b) {
        for (var c = 0; c < a.length; c++) a[c].update(b);
      },
      addToUpdate: function (b) {
        -1 === a.indexOf(b) && a.push(b);
      },
      removeFromUpdate: function (b) {
        b = a.indexOf(b);
        -1 !== b && a.splice(b, 1);
      },
      add: function (a) {
        void 0 !== b[a.name] &&
          console.log(
            "THREE.AnimationHandler.add: Warning! " +
              a.name +
              " already exists in library. Overwriting."
          );
        b[a.name] = a;
        if (!0 !== a.initialized) {
          for (var c = 0; c < a.hierarchy.length; c++) {
            for (var d = 0; d < a.hierarchy[c].keys.length; d++)
              if (
                (0 > a.hierarchy[c].keys[d].time &&
                  (a.hierarchy[c].keys[d].time = 0),
                void 0 !== a.hierarchy[c].keys[d].rot &&
                  !(a.hierarchy[c].keys[d].rot instanceof THREE.Quaternion))
              ) {
                var g = a.hierarchy[c].keys[d].rot;
                a.hierarchy[c].keys[d].rot = new THREE.Quaternion(
                  g[0],
                  g[1],
                  g[2],
                  g[3]
                );
              }
            if (
              a.hierarchy[c].keys.length &&
              void 0 !== a.hierarchy[c].keys[0].morphTargets
            ) {
              g = {};
              for (d = 0; d < a.hierarchy[c].keys.length; d++)
                for (
                  var i = 0;
                  i < a.hierarchy[c].keys[d].morphTargets.length;
                  i++
                ) {
                  var k = a.hierarchy[c].keys[d].morphTargets[i];
                  g[k] = -1;
                }
              a.hierarchy[c].usedMorphTargets = g;
              for (d = 0; d < a.hierarchy[c].keys.length; d++) {
                var m = {};
                for (k in g) {
                  for (
                    i = 0;
                    i < a.hierarchy[c].keys[d].morphTargets.length;
                    i++
                  )
                    if (a.hierarchy[c].keys[d].morphTargets[i] === k) {
                      m[k] = a.hierarchy[c].keys[d].morphTargetsInfluences[i];
                      break;
                    }
                  i === a.hierarchy[c].keys[d].morphTargets.length &&
                    (m[k] = 0);
                }
                a.hierarchy[c].keys[d].morphTargetsInfluences = m;
              }
            }
            for (d = 1; d < a.hierarchy[c].keys.length; d++)
              a.hierarchy[c].keys[d].time === a.hierarchy[c].keys[d - 1].time &&
                (a.hierarchy[c].keys.splice(d, 1), d--);
            for (d = 0; d < a.hierarchy[c].keys.length; d++)
              a.hierarchy[c].keys[d].index = d;
          }
          d = parseInt(a.length * a.fps, 10);
          a.JIT = {};
          a.JIT.hierarchy = [];
          for (c = 0; c < a.hierarchy.length; c++)
            a.JIT.hierarchy.push(Array(d));
          a.initialized = !0;
        }
      },
      get: function (a) {
        if ("string" === typeof a) {
          if (b[a]) return b[a];
          console.log(
            "THREE.AnimationHandler.get: Couldn't find animation " + a
          );
          return null;
        }
      },
      parse: function (a) {
        var b = [];
        if (a instanceof THREE.SkinnedMesh)
          for (var c = 0; c < a.bones.length; c++) b.push(a.bones[c]);
        else d(a, b);
        return b;
      },
    },
    d = function (a, b) {
      b.push(a);
      for (var c = 0; c < a.children.length; c++) d(a.children[c], b);
    };
  c.LINEAR = 0;
  c.CATMULLROM = 1;
  c.CATMULLROM_FORWARD = 2;
  return c;
})();
THREE.Animation = function (a, b, c) {
  this.root = a;
  this.data = THREE.AnimationHandler.get(b);
  this.hierarchy = THREE.AnimationHandler.parse(a);
  this.currentTime = 0;
  this.timeScale = 1;
  this.isPlaying = !1;
  this.loop = this.isPaused = !0;
  this.interpolationType = void 0 !== c ? c : THREE.AnimationHandler.LINEAR;
  this.points = [];
  this.target = new THREE.Vector3();
};
THREE.Animation.prototype.play = function (a, b) {
  if (!1 === this.isPlaying) {
    this.isPlaying = !0;
    this.loop = void 0 !== a ? a : !0;
    this.currentTime = void 0 !== b ? b : 0;
    var c,
      d = this.hierarchy.length,
      e;
    for (c = 0; c < d; c++) {
      e = this.hierarchy[c];
      e.matrixAutoUpdate = !0;
      void 0 === e.animationCache &&
        ((e.animationCache = {}),
        (e.animationCache.prevKey = { pos: 0, rot: 0, scl: 0 }),
        (e.animationCache.nextKey = { pos: 0, rot: 0, scl: 0 }),
        (e.animationCache.originalMatrix =
          e instanceof THREE.Bone ? e.skinMatrix : e.matrix));
      var f = e.animationCache.prevKey;
      e = e.animationCache.nextKey;
      f.pos = this.data.hierarchy[c].keys[0];
      f.rot = this.data.hierarchy[c].keys[0];
      f.scl = this.data.hierarchy[c].keys[0];
      e.pos = this.getNextKeyWith("pos", c, 1);
      e.rot = this.getNextKeyWith("rot", c, 1);
      e.scl = this.getNextKeyWith("scl", c, 1);
    }
    this.update(0);
  }
  this.isPaused = !1;
  THREE.AnimationHandler.addToUpdate(this);
};
THREE.Animation.prototype.pause = function () {
  !0 === this.isPaused
    ? THREE.AnimationHandler.addToUpdate(this)
    : THREE.AnimationHandler.removeFromUpdate(this);
  this.isPaused = !this.isPaused;
};
THREE.Animation.prototype.stop = function () {
  this.isPaused = this.isPlaying = !1;
  THREE.AnimationHandler.removeFromUpdate(this);
};
THREE.Animation.prototype.update = function (a) {
  if (!1 !== this.isPlaying) {
    var b = ["pos", "rot", "scl"],
      c,
      d,
      e,
      f,
      h,
      g,
      i,
      k,
      m;
    m = this.currentTime += a * this.timeScale;
    k = this.currentTime %= this.data.length;
    parseInt(Math.min(k * this.data.fps, this.data.length * this.data.fps), 10);
    for (var l = 0, p = this.hierarchy.length; l < p; l++) {
      a = this.hierarchy[l];
      i = a.animationCache;
      for (var s = 0; 3 > s; s++) {
        c = b[s];
        h = i.prevKey[c];
        g = i.nextKey[c];
        if (g.time <= m) {
          if (k < m)
            if (this.loop) {
              h = this.data.hierarchy[l].keys[0];
              for (g = this.getNextKeyWith(c, l, 1); g.time < k; )
                (h = g), (g = this.getNextKeyWith(c, l, g.index + 1));
            } else {
              this.stop();
              return;
            }
          else {
            do (h = g), (g = this.getNextKeyWith(c, l, g.index + 1));
            while (g.time < k);
          }
          i.prevKey[c] = h;
          i.nextKey[c] = g;
        }
        a.matrixAutoUpdate = !0;
        a.matrixWorldNeedsUpdate = !0;
        d = (k - h.time) / (g.time - h.time);
        e = h[c];
        f = g[c];
        if (0 > d || 1 < d)
          console.log(
            "THREE.Animation.update: Warning! Scale out of bounds:" +
              d +
              " on bone " +
              l
          ),
            (d = 0 > d ? 0 : 1);
        if ("pos" === c)
          if (
            ((c = a.position),
            this.interpolationType === THREE.AnimationHandler.LINEAR)
          )
            (c.x = e[0] + (f[0] - e[0]) * d),
              (c.y = e[1] + (f[1] - e[1]) * d),
              (c.z = e[2] + (f[2] - e[2]) * d);
          else {
            if (
              this.interpolationType === THREE.AnimationHandler.CATMULLROM ||
              this.interpolationType ===
                THREE.AnimationHandler.CATMULLROM_FORWARD
            )
              (this.points[0] = this.getPrevKeyWith("pos", l, h.index - 1).pos),
                (this.points[1] = e),
                (this.points[2] = f),
                (this.points[3] = this.getNextKeyWith(
                  "pos",
                  l,
                  g.index + 1
                ).pos),
                (d = 0.33 * d + 0.33),
                (e = this.interpolateCatmullRom(this.points, d)),
                (c.x = e[0]),
                (c.y = e[1]),
                (c.z = e[2]),
                this.interpolationType ===
                  THREE.AnimationHandler.CATMULLROM_FORWARD &&
                  ((d = this.interpolateCatmullRom(this.points, 1.01 * d)),
                  this.target.set(d[0], d[1], d[2]),
                  this.target.sub(c),
                  (this.target.y = 0),
                  this.target.normalize(),
                  (d = Math.atan2(this.target.x, this.target.z)),
                  a.rotation.set(0, d, 0));
          }
        else
          "rot" === c
            ? THREE.Quaternion.slerp(e, f, a.quaternion, d)
            : "scl" === c &&
              ((c = a.scale),
              (c.x = e[0] + (f[0] - e[0]) * d),
              (c.y = e[1] + (f[1] - e[1]) * d),
              (c.z = e[2] + (f[2] - e[2]) * d));
      }
    }
  }
};
THREE.Animation.prototype.interpolateCatmullRom = function (a, b) {
  var c = [],
    d = [],
    e,
    f,
    h,
    g,
    i,
    k;
  e = (a.length - 1) * b;
  f = Math.floor(e);
  e -= f;
  c[0] = 0 === f ? f : f - 1;
  c[1] = f;
  c[2] = f > a.length - 2 ? f : f + 1;
  c[3] = f > a.length - 3 ? f : f + 2;
  f = a[c[0]];
  g = a[c[1]];
  i = a[c[2]];
  k = a[c[3]];
  c = e * e;
  h = e * c;
  d[0] = this.interpolate(f[0], g[0], i[0], k[0], e, c, h);
  d[1] = this.interpolate(f[1], g[1], i[1], k[1], e, c, h);
  d[2] = this.interpolate(f[2], g[2], i[2], k[2], e, c, h);
  return d;
};
THREE.Animation.prototype.interpolate = function (a, b, c, d, e, f, h) {
  a = 0.5 * (c - a);
  d = 0.5 * (d - b);
  return (2 * (b - c) + a + d) * h + (-3 * (b - c) - 2 * a - d) * f + a * e + b;
};
THREE.Animation.prototype.getNextKeyWith = function (a, b, c) {
  for (
    var d = this.data.hierarchy[b].keys,
      c =
        this.interpolationType === THREE.AnimationHandler.CATMULLROM ||
        this.interpolationType === THREE.AnimationHandler.CATMULLROM_FORWARD
          ? c < d.length - 1
            ? c
            : d.length - 1
          : c % d.length;
    c < d.length;
    c++
  )
    if (void 0 !== d[c][a]) return d[c];
  return this.data.hierarchy[b].keys[0];
};
THREE.Animation.prototype.getPrevKeyWith = function (a, b, c) {
  for (
    var d = this.data.hierarchy[b].keys,
      c =
        this.interpolationType === THREE.AnimationHandler.CATMULLROM ||
        this.interpolationType === THREE.AnimationHandler.CATMULLROM_FORWARD
          ? 0 < c
            ? c
            : 0
          : 0 <= c
          ? c
          : c + d.length;
    0 <= c;
    c--
  )
    if (void 0 !== d[c][a]) return d[c];
  return this.data.hierarchy[b].keys[d.length - 1];
};
THREE.KeyFrameAnimation = function (a, b, c) {
  this.root = a;
  this.data = THREE.AnimationHandler.get(b);
  this.hierarchy = THREE.AnimationHandler.parse(a);
  this.currentTime = 0;
  this.timeScale = 0.001;
  this.isPlaying = !1;
  this.loop = this.isPaused = !0;
  this.JITCompile = void 0 !== c ? c : !0;
  a = 0;
  for (b = this.hierarchy.length; a < b; a++) {
    var c = this.data.hierarchy[a].sids,
      d = this.hierarchy[a];
    if (this.data.hierarchy[a].keys.length && c) {
      for (var e = 0; e < c.length; e++) {
        var f = c[e],
          h = this.getNextKeyWith(f, a, 0);
        h && h.apply(f);
      }
      d.matrixAutoUpdate = !1;
      this.data.hierarchy[a].node.updateMatrix();
      d.matrixWorldNeedsUpdate = !0;
    }
  }
};
THREE.KeyFrameAnimation.prototype.play = function (a, b) {
  if (!this.isPlaying) {
    this.isPlaying = !0;
    this.loop = void 0 !== a ? a : !0;
    this.currentTime = void 0 !== b ? b : 0;
    this.startTimeMs = b;
    this.startTime = 1e7;
    this.endTime = -this.startTime;
    var c,
      d = this.hierarchy.length,
      e,
      f;
    for (c = 0; c < d; c++)
      (e = this.hierarchy[c]),
        (f = this.data.hierarchy[c]),
        void 0 === f.animationCache &&
          ((f.animationCache = {}),
          (f.animationCache.prevKey = null),
          (f.animationCache.nextKey = null),
          (f.animationCache.originalMatrix =
            e instanceof THREE.Bone ? e.skinMatrix : e.matrix)),
        (e = this.data.hierarchy[c].keys),
        e.length &&
          ((f.animationCache.prevKey = e[0]),
          (f.animationCache.nextKey = e[1]),
          (this.startTime = Math.min(e[0].time, this.startTime)),
          (this.endTime = Math.max(e[e.length - 1].time, this.endTime)));
    this.update(0);
  }
  this.isPaused = !1;
  THREE.AnimationHandler.addToUpdate(this);
};
THREE.KeyFrameAnimation.prototype.pause = function () {
  this.isPaused
    ? THREE.AnimationHandler.addToUpdate(this)
    : THREE.AnimationHandler.removeFromUpdate(this);
  this.isPaused = !this.isPaused;
};
THREE.KeyFrameAnimation.prototype.stop = function () {
  this.isPaused = this.isPlaying = !1;
  THREE.AnimationHandler.removeFromUpdate(this);
  for (var a = 0; a < this.data.hierarchy.length; a++) {
    var b = this.hierarchy[a],
      c = this.data.hierarchy[a];
    if (void 0 !== c.animationCache) {
      var d = c.animationCache.originalMatrix;
      b instanceof THREE.Bone
        ? (d.copy(b.skinMatrix), (b.skinMatrix = d))
        : (d.copy(b.matrix), (b.matrix = d));
      delete c.animationCache;
    }
  }
};
THREE.KeyFrameAnimation.prototype.update = function (a) {
  if (this.isPlaying) {
    var b,
      c,
      d,
      e,
      f = this.data.JIT.hierarchy,
      h,
      g,
      i;
    g = this.currentTime += a * this.timeScale;
    h = this.currentTime %= this.data.length;
    h < this.startTimeMs && (h = this.currentTime = this.startTimeMs + h);
    e = parseInt(
      Math.min(h * this.data.fps, this.data.length * this.data.fps),
      10
    );
    if ((i = h < g) && !this.loop) {
      for (var a = 0, k = this.hierarchy.length; a < k; a++) {
        var m = this.data.hierarchy[a].keys,
          f = this.data.hierarchy[a].sids;
        d = m.length - 1;
        e = this.hierarchy[a];
        if (m.length) {
          for (m = 0; m < f.length; m++)
            (h = f[m]), (g = this.getPrevKeyWith(h, a, d)) && g.apply(h);
          this.data.hierarchy[a].node.updateMatrix();
          e.matrixWorldNeedsUpdate = !0;
        }
      }
      this.stop();
    } else if (!(h < this.startTime)) {
      a = 0;
      for (k = this.hierarchy.length; a < k; a++) {
        d = this.hierarchy[a];
        b = this.data.hierarchy[a];
        var m = b.keys,
          l = b.animationCache;
        if (this.JITCompile && void 0 !== f[a][e])
          d instanceof THREE.Bone
            ? ((d.skinMatrix = f[a][e]), (d.matrixWorldNeedsUpdate = !1))
            : ((d.matrix = f[a][e]), (d.matrixWorldNeedsUpdate = !0));
        else if (m.length) {
          this.JITCompile &&
            l &&
            (d instanceof THREE.Bone
              ? (d.skinMatrix = l.originalMatrix)
              : (d.matrix = l.originalMatrix));
          b = l.prevKey;
          c = l.nextKey;
          if (b && c) {
            if (c.time <= g) {
              if (i && this.loop) {
                b = m[0];
                for (c = m[1]; c.time < h; ) (b = c), (c = m[b.index + 1]);
              } else if (!i)
                for (var p = m.length - 1; c.time < h && c.index !== p; )
                  (b = c), (c = m[b.index + 1]);
              l.prevKey = b;
              l.nextKey = c;
            }
            c.time >= h ? b.interpolate(c, h) : b.interpolate(c, c.time);
          }
          this.data.hierarchy[a].node.updateMatrix();
          d.matrixWorldNeedsUpdate = !0;
        }
      }
      if (this.JITCompile && void 0 === f[0][e]) {
        this.hierarchy[0].updateMatrixWorld(!0);
        for (a = 0; a < this.hierarchy.length; a++)
          f[a][e] =
            this.hierarchy[a] instanceof THREE.Bone
              ? this.hierarchy[a].skinMatrix.clone()
              : this.hierarchy[a].matrix.clone();
      }
    }
  }
};
THREE.KeyFrameAnimation.prototype.getNextKeyWith = function (a, b, c) {
  b = this.data.hierarchy[b].keys;
  for (c %= b.length; c < b.length; c++) if (b[c].hasTarget(a)) return b[c];
  return b[0];
};
THREE.KeyFrameAnimation.prototype.getPrevKeyWith = function (a, b, c) {
  b = this.data.hierarchy[b].keys;
  for (c = 0 <= c ? c : c + b.length; 0 <= c; c--)
    if (b[c].hasTarget(a)) return b[c];
  return b[b.length - 1];
};
THREE.CubeCamera = function (a, b, c) {
  THREE.Object3D.call(this);
  var d = new THREE.PerspectiveCamera(90, 1, a, b);
  d.up.set(0, -1, 0);
  d.lookAt(new THREE.Vector3(1, 0, 0));
  this.add(d);
  var e = new THREE.PerspectiveCamera(90, 1, a, b);
  e.up.set(0, -1, 0);
  e.lookAt(new THREE.Vector3(-1, 0, 0));
  this.add(e);
  var f = new THREE.PerspectiveCamera(90, 1, a, b);
  f.up.set(0, 0, 1);
  f.lookAt(new THREE.Vector3(0, 1, 0));
  this.add(f);
  var h = new THREE.PerspectiveCamera(90, 1, a, b);
  h.up.set(0, 0, -1);
  h.lookAt(new THREE.Vector3(0, -1, 0));
  this.add(h);
  var g = new THREE.PerspectiveCamera(90, 1, a, b);
  g.up.set(0, -1, 0);
  g.lookAt(new THREE.Vector3(0, 0, 1));
  this.add(g);
  var i = new THREE.PerspectiveCamera(90, 1, a, b);
  i.up.set(0, -1, 0);
  i.lookAt(new THREE.Vector3(0, 0, -1));
  this.add(i);
  this.renderTarget = new THREE.WebGLRenderTargetCube(c, c, {
    format: THREE.RGBFormat,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
  });
  this.updateCubeMap = function (a, b) {
    var c = this.renderTarget,
      p = c.generateMipmaps;
    c.generateMipmaps = !1;
    c.activeCubeFace = 0;
    a.render(b, d, c);
    c.activeCubeFace = 1;
    a.render(b, e, c);
    c.activeCubeFace = 2;
    a.render(b, f, c);
    c.activeCubeFace = 3;
    a.render(b, h, c);
    c.activeCubeFace = 4;
    a.render(b, g, c);
    c.generateMipmaps = p;
    c.activeCubeFace = 5;
    a.render(b, i, c);
  };
};
THREE.CubeCamera.prototype = Object.create(THREE.Object3D.prototype);
THREE.CombinedCamera = function (a, b, c, d, e, f, h) {
  THREE.Camera.call(this);
  this.fov = c;
  this.left = -a / 2;
  this.right = a / 2;
  this.top = b / 2;
  this.bottom = -b / 2;
  this.cameraO = new THREE.OrthographicCamera(
    a / -2,
    a / 2,
    b / 2,
    b / -2,
    f,
    h
  );
  this.cameraP = new THREE.PerspectiveCamera(c, a / b, d, e);
  this.zoom = 1;
  this.toPerspective();
};
THREE.CombinedCamera.prototype = Object.create(THREE.Camera.prototype);
THREE.CombinedCamera.prototype.toPerspective = function () {
  this.near = this.cameraP.near;
  this.far = this.cameraP.far;
  this.cameraP.fov = this.fov / this.zoom;
  this.cameraP.updateProjectionMatrix();
  this.projectionMatrix = this.cameraP.projectionMatrix;
  this.inPerspectiveMode = !0;
  this.inOrthographicMode = !1;
};
THREE.CombinedCamera.prototype.toOrthographic = function () {
  var a = this.cameraP.aspect,
    b = (this.cameraP.near + this.cameraP.far) / 2,
    b = Math.tan(this.fov / 2) * b,
    a = (2 * b * a) / 2,
    b = b / this.zoom,
    a = a / this.zoom;
  this.cameraO.left = -a;
  this.cameraO.right = a;
  this.cameraO.top = b;
  this.cameraO.bottom = -b;
  this.cameraO.updateProjectionMatrix();
  this.near = this.cameraO.near;
  this.far = this.cameraO.far;
  this.projectionMatrix = this.cameraO.projectionMatrix;
  this.inPerspectiveMode = !1;
  this.inOrthographicMode = !0;
};
THREE.CombinedCamera.prototype.setSize = function (a, b) {
  this.cameraP.aspect = a / b;
  this.left = -a / 2;
  this.right = a / 2;
  this.top = b / 2;
  this.bottom = -b / 2;
};
THREE.CombinedCamera.prototype.setFov = function (a) {
  this.fov = a;
  this.inPerspectiveMode ? this.toPerspective() : this.toOrthographic();
};
THREE.CombinedCamera.prototype.updateProjectionMatrix = function () {
  this.inPerspectiveMode
    ? this.toPerspective()
    : (this.toPerspective(), this.toOrthographic());
};
THREE.CombinedCamera.prototype.setLens = function (a, b) {
  void 0 === b && (b = 24);
  var c = 2 * THREE.Math.radToDeg(Math.atan(b / (2 * a)));
  this.setFov(c);
  return c;
};
THREE.CombinedCamera.prototype.setZoom = function (a) {
  this.zoom = a;
  this.inPerspectiveMode ? this.toPerspective() : this.toOrthographic();
};
THREE.CombinedCamera.prototype.toFrontView = function () {
  this.rotation.x = 0;
  this.rotation.y = 0;
  this.rotation.z = 0;
  this.rotationAutoUpdate = !1;
};
THREE.CombinedCamera.prototype.toBackView = function () {
  this.rotation.x = 0;
  this.rotation.y = Math.PI;
  this.rotation.z = 0;
  this.rotationAutoUpdate = !1;
};
THREE.CombinedCamera.prototype.toLeftView = function () {
  this.rotation.x = 0;
  this.rotation.y = -Math.PI / 2;
  this.rotation.z = 0;
  this.rotationAutoUpdate = !1;
};
THREE.CombinedCamera.prototype.toRightView = function () {
  this.rotation.x = 0;
  this.rotation.y = Math.PI / 2;
  this.rotation.z = 0;
  this.rotationAutoUpdate = !1;
};
THREE.CombinedCamera.prototype.toTopView = function () {
  this.rotation.x = -Math.PI / 2;
  this.rotation.y = 0;
  this.rotation.z = 0;
  this.rotationAutoUpdate = !1;
};
THREE.CombinedCamera.prototype.toBottomView = function () {
  this.rotation.x = Math.PI / 2;
  this.rotation.y = 0;
  this.rotation.z = 0;
  this.rotationAutoUpdate = !1;
};
THREE.CircleGeometry = function (a, b, c, d) {
  THREE.Geometry.call(this);
  this.radius = a = a || 50;
  this.segments = b = void 0 !== b ? Math.max(3, b) : 8;
  this.thetaStart = c = void 0 !== c ? c : 0;
  this.thetaLength = d = void 0 !== d ? d : 2 * Math.PI;
  var e,
    f = [];
  e = new THREE.Vector3();
  var h = new THREE.Vector2(0.5, 0.5);
  this.vertices.push(e);
  f.push(h);
  for (e = 0; e <= b; e++) {
    var g = new THREE.Vector3(),
      i = c + (e / b) * d;
    g.x = a * Math.cos(i);
    g.y = a * Math.sin(i);
    this.vertices.push(g);
    f.push(new THREE.Vector2((g.x / a + 1) / 2, (g.y / a + 1) / 2));
  }
  c = new THREE.Vector3(0, 0, 1);
  for (e = 1; e <= b; e++)
    this.faces.push(new THREE.Face3(e, e + 1, 0, [c, c, c])),
      this.faceVertexUvs[0].push([f[e], f[e + 1], h]);
  this.computeCentroids();
  this.computeFaceNormals();
  this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), a);
};
THREE.CircleGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.CubeGeometry = function (a, b, c, d, e, f) {
  function h(a, b, c, d, e, f, h, n) {
    var r,
      q = g.widthSegments,
      u = g.heightSegments,
      w = e / 2,
      z = f / 2,
      B = g.vertices.length;
    if (("x" === a && "y" === b) || ("y" === a && "x" === b)) r = "z";
    else if (("x" === a && "z" === b) || ("z" === a && "x" === b))
      (r = "y"), (u = g.depthSegments);
    else if (("z" === a && "y" === b) || ("y" === a && "z" === b))
      (r = "x"), (q = g.depthSegments);
    var D = q + 1,
      x = u + 1,
      F = e / q,
      A = f / u,
      O = new THREE.Vector3();
    O[r] = 0 < h ? 1 : -1;
    for (e = 0; e < x; e++)
      for (f = 0; f < D; f++) {
        var C = new THREE.Vector3();
        C[a] = (f * F - w) * c;
        C[b] = (e * A - z) * d;
        C[r] = h;
        g.vertices.push(C);
      }
    for (e = 0; e < u; e++)
      for (f = 0; f < q; f++)
        (z = f + D * e),
          (a = f + D * (e + 1)),
          (b = f + 1 + D * (e + 1)),
          (c = f + 1 + D * e),
          (d = new THREE.Vector2(f / q, 1 - e / u)),
          (h = new THREE.Vector2(f / q, 1 - (e + 1) / u)),
          (r = new THREE.Vector2((f + 1) / q, 1 - (e + 1) / u)),
          (w = new THREE.Vector2((f + 1) / q, 1 - e / u)),
          (z = new THREE.Face3(z + B, a + B, c + B)),
          z.normal.copy(O),
          z.vertexNormals.push(O.clone(), O.clone(), O.clone()),
          (z.materialIndex = n),
          g.faces.push(z),
          g.faceVertexUvs[0].push([d, h, w]),
          (z = new THREE.Face3(a + B, b + B, c + B)),
          z.normal.copy(O),
          z.vertexNormals.push(O.clone(), O.clone(), O.clone()),
          (z.materialIndex = n),
          g.faces.push(z),
          g.faceVertexUvs[0].push([h.clone(), r, w.clone()]);
  }
  THREE.Geometry.call(this);
  var g = this;
  this.width = a;
  this.height = b;
  this.depth = c;
  this.widthSegments = d || 1;
  this.heightSegments = e || 1;
  this.depthSegments = f || 1;
  a = this.width / 2;
  b = this.height / 2;
  c = this.depth / 2;
  h("z", "y", -1, -1, this.depth, this.height, a, 0);
  h("z", "y", 1, -1, this.depth, this.height, -a, 1);
  h("x", "z", 1, 1, this.width, this.depth, b, 2);
  h("x", "z", 1, -1, this.width, this.depth, -b, 3);
  h("x", "y", 1, -1, this.width, this.height, c, 4);
  h("x", "y", -1, -1, this.width, this.height, -c, 5);
  this.computeCentroids();
  this.mergeVertices();
};
THREE.CubeGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.CylinderGeometry = function (a, b, c, d, e, f) {
  THREE.Geometry.call(this);
  this.radiusTop = a = void 0 !== a ? a : 20;
  this.radiusBottom = b = void 0 !== b ? b : 20;
  this.height = c = void 0 !== c ? c : 100;
  this.radialSegments = d = d || 8;
  this.heightSegments = e = e || 1;
  this.openEnded = f = void 0 !== f ? f : !1;
  var h = c / 2,
    g,
    i,
    k = [],
    m = [];
  for (i = 0; i <= e; i++) {
    var l = [],
      p = [],
      s = i / e,
      t = s * (b - a) + a;
    for (g = 0; g <= d; g++) {
      var n = g / d,
        r = new THREE.Vector3();
      r.x = t * Math.sin(2 * n * Math.PI);
      r.y = -s * c + h;
      r.z = t * Math.cos(2 * n * Math.PI);
      this.vertices.push(r);
      l.push(this.vertices.length - 1);
      p.push(new THREE.Vector2(n, 1 - s));
    }
    k.push(l);
    m.push(p);
  }
  c = (b - a) / c;
  for (g = 0; g < d; g++) {
    0 !== a
      ? ((l = this.vertices[k[0][g]].clone()),
        (p = this.vertices[k[0][g + 1]].clone()))
      : ((l = this.vertices[k[1][g]].clone()),
        (p = this.vertices[k[1][g + 1]].clone()));
    l.setY(Math.sqrt(l.x * l.x + l.z * l.z) * c).normalize();
    p.setY(Math.sqrt(p.x * p.x + p.z * p.z) * c).normalize();
    for (i = 0; i < e; i++) {
      var s = k[i][g],
        t = k[i + 1][g],
        n = k[i + 1][g + 1],
        r = k[i][g + 1],
        q = l.clone(),
        u = l.clone(),
        w = p.clone(),
        z = p.clone(),
        B = m[i][g].clone(),
        D = m[i + 1][g].clone(),
        x = m[i + 1][g + 1].clone(),
        F = m[i][g + 1].clone();
      this.faces.push(new THREE.Face3(s, t, r, [q, u, z]));
      this.faceVertexUvs[0].push([B, D, F]);
      this.faces.push(new THREE.Face3(t, n, r, [u, w, z]));
      this.faceVertexUvs[0].push([D, x, F]);
    }
  }
  if (!1 === f && 0 < a) {
    this.vertices.push(new THREE.Vector3(0, h, 0));
    for (g = 0; g < d; g++)
      (s = k[0][g]),
        (t = k[0][g + 1]),
        (n = this.vertices.length - 1),
        (q = new THREE.Vector3(0, 1, 0)),
        (u = new THREE.Vector3(0, 1, 0)),
        (w = new THREE.Vector3(0, 1, 0)),
        (B = m[0][g].clone()),
        (D = m[0][g + 1].clone()),
        (x = new THREE.Vector2(D.u, 0)),
        this.faces.push(new THREE.Face3(s, t, n, [q, u, w])),
        this.faceVertexUvs[0].push([B, D, x]);
  }
  if (!1 === f && 0 < b) {
    this.vertices.push(new THREE.Vector3(0, -h, 0));
    for (g = 0; g < d; g++)
      (s = k[i][g + 1]),
        (t = k[i][g]),
        (n = this.vertices.length - 1),
        (q = new THREE.Vector3(0, -1, 0)),
        (u = new THREE.Vector3(0, -1, 0)),
        (w = new THREE.Vector3(0, -1, 0)),
        (B = m[i][g + 1].clone()),
        (D = m[i][g].clone()),
        (x = new THREE.Vector2(D.u, 1)),
        this.faces.push(new THREE.Face3(s, t, n, [q, u, w])),
        this.faceVertexUvs[0].push([B, D, x]);
  }
  this.computeCentroids();
  this.computeFaceNormals();
};
THREE.CylinderGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.ExtrudeGeometry = function (a, b) {
  "undefined" !== typeof a &&
    (THREE.Geometry.call(this),
    (a = a instanceof Array ? a : [a]),
    (this.shapebb = a[a.length - 1].getBoundingBox()),
    this.addShapeList(a, b),
    this.computeCentroids(),
    this.computeFaceNormals());
};
THREE.ExtrudeGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.ExtrudeGeometry.prototype.addShapeList = function (a, b) {
  for (var c = a.length, d = 0; d < c; d++) this.addShape(a[d], b);
};
THREE.ExtrudeGeometry.prototype.addShape = function (a, b) {
  function c(a, b, c) {
    b || console.log("die");
    return b.clone().multiplyScalar(c).add(a);
  }
  function d(a, b, c) {
    var d = THREE.ExtrudeGeometry.__v1,
      e = THREE.ExtrudeGeometry.__v2,
      f = THREE.ExtrudeGeometry.__v3,
      g = THREE.ExtrudeGeometry.__v4,
      h = THREE.ExtrudeGeometry.__v5,
      i = THREE.ExtrudeGeometry.__v6;
    d.set(a.x - b.x, a.y - b.y);
    e.set(a.x - c.x, a.y - c.y);
    d = d.normalize();
    e = e.normalize();
    f.set(-d.y, d.x);
    g.set(e.y, -e.x);
    h.copy(a).add(f);
    i.copy(a).add(g);
    if (h.equals(i)) return g.clone();
    h.copy(b).add(f);
    i.copy(c).add(g);
    f = d.dot(g);
    g = i.sub(h).dot(g);
    0 === f &&
      (console.log("Either infinite or no solutions!"),
      0 === g
        ? console.log("Its finite solutions.")
        : console.log("Too bad, no solutions."));
    g /= f;
    return 0 > g
      ? ((b = Math.atan2(b.y - a.y, b.x - a.x)),
        (a = Math.atan2(c.y - a.y, c.x - a.x)),
        b > a && (a += 2 * Math.PI),
        (c = (b + a) / 2),
        (a = -Math.cos(c)),
        (c = -Math.sin(c)),
        new THREE.Vector2(a, c))
      : d.multiplyScalar(g).add(h).sub(a).clone();
  }
  function e(c, d) {
    var e, f;
    for (N = c.length; 0 <= --N; ) {
      e = N;
      f = N - 1;
      0 > f && (f = c.length - 1);
      for (var g = 0, h = s + 2 * m, g = 0; g < h; g++) {
        var i = ba * g,
          k = ba * (g + 1),
          l = d + e + i,
          i = d + f + i,
          p = d + f + k,
          k = d + e + k,
          n = c,
          q = g,
          r = h,
          t = e,
          v = f,
          l = l + E,
          i = i + E,
          p = p + E,
          k = k + E;
        C.faces.push(new THREE.Face3(l, i, k, null, null, u));
        C.faces.push(new THREE.Face3(i, p, k, null, null, u));
        l = w.generateSideWallUV(C, a, n, b, l, i, p, k, q, r, t, v);
        C.faceVertexUvs[0].push([l[0], l[1], l[3]]);
        C.faceVertexUvs[0].push([l[1], l[2], l[3]]);
      }
    }
  }
  function f(a, b, c) {
    C.vertices.push(new THREE.Vector3(a, b, c));
  }
  function h(c, d, e, f) {
    c += E;
    d += E;
    e += E;
    C.faces.push(new THREE.Face3(c, d, e, null, null, q));
    c = f
      ? w.generateBottomUV(C, a, b, c, d, e)
      : w.generateTopUV(C, a, b, c, d, e);
    C.faceVertexUvs[0].push(c);
  }
  var g = void 0 !== b.amount ? b.amount : 100,
    i = void 0 !== b.bevelThickness ? b.bevelThickness : 6,
    k = void 0 !== b.bevelSize ? b.bevelSize : i - 2,
    m = void 0 !== b.bevelSegments ? b.bevelSegments : 3,
    l = void 0 !== b.bevelEnabled ? b.bevelEnabled : !0,
    p = void 0 !== b.curveSegments ? b.curveSegments : 12,
    s = void 0 !== b.steps ? b.steps : 1,
    t = b.extrudePath,
    n,
    r = !1,
    q = b.material,
    u = b.extrudeMaterial,
    w =
      void 0 !== b.UVGenerator
        ? b.UVGenerator
        : THREE.ExtrudeGeometry.WorldUVGenerator,
    z,
    B,
    D,
    x;
  t &&
    ((n = t.getSpacedPoints(s)),
    (r = !0),
    (l = !1),
    (z =
      void 0 !== b.frames
        ? b.frames
        : new THREE.TubeGeometry.FrenetFrames(t, s, !1)),
    (B = new THREE.Vector3()),
    (D = new THREE.Vector3()),
    (x = new THREE.Vector3()));
  l || (k = i = m = 0);
  var F,
    A,
    O,
    C = this,
    E = this.vertices.length,
    p = a.extractPoints(p),
    I = p.shape,
    p = p.holes;
  if ((t = !THREE.Shape.Utils.isClockWise(I))) {
    I = I.reverse();
    A = 0;
    for (O = p.length; A < O; A++)
      (F = p[A]), THREE.Shape.Utils.isClockWise(F) && (p[A] = F.reverse());
    t = !1;
  }
  var y = THREE.Shape.Utils.triangulateShape(I, p),
    t = I;
  A = 0;
  for (O = p.length; A < O; A++) (F = p[A]), (I = I.concat(F));
  var v,
    G,
    R,
    J,
    ba = I.length,
    oa = y.length,
    pa = [],
    N = 0,
    M = t.length;
  v = M - 1;
  for (G = N + 1; N < M; N++, v++, G++)
    v === M && (v = 0), G === M && (G = 0), (pa[N] = d(t[N], t[v], t[G]));
  var Q = [],
    K,
    ca = pa.concat();
  A = 0;
  for (O = p.length; A < O; A++) {
    F = p[A];
    K = [];
    N = 0;
    M = F.length;
    v = M - 1;
    for (G = N + 1; N < M; N++, v++, G++)
      v === M && (v = 0), G === M && (G = 0), (K[N] = d(F[N], F[v], F[G]));
    Q.push(K);
    ca = ca.concat(K);
  }
  for (v = 0; v < m; v++) {
    F = v / m;
    R = i * (1 - F);
    G = k * Math.sin((F * Math.PI) / 2);
    N = 0;
    for (M = t.length; N < M; N++) (J = c(t[N], pa[N], G)), f(J.x, J.y, -R);
    A = 0;
    for (O = p.length; A < O; A++) {
      F = p[A];
      K = Q[A];
      N = 0;
      for (M = F.length; N < M; N++) (J = c(F[N], K[N], G)), f(J.x, J.y, -R);
    }
  }
  G = k;
  for (N = 0; N < ba; N++)
    (J = l ? c(I[N], ca[N], G) : I[N]),
      r
        ? (D.copy(z.normals[0]).multiplyScalar(J.x),
          B.copy(z.binormals[0]).multiplyScalar(J.y),
          x.copy(n[0]).add(D).add(B),
          f(x.x, x.y, x.z))
        : f(J.x, J.y, 0);
  for (F = 1; F <= s; F++)
    for (N = 0; N < ba; N++)
      (J = l ? c(I[N], ca[N], G) : I[N]),
        r
          ? (D.copy(z.normals[F]).multiplyScalar(J.x),
            B.copy(z.binormals[F]).multiplyScalar(J.y),
            x.copy(n[F]).add(D).add(B),
            f(x.x, x.y, x.z))
          : f(J.x, J.y, (g / s) * F);
  for (v = m - 1; 0 <= v; v--) {
    F = v / m;
    R = i * (1 - F);
    G = k * Math.sin((F * Math.PI) / 2);
    N = 0;
    for (M = t.length; N < M; N++) (J = c(t[N], pa[N], G)), f(J.x, J.y, g + R);
    A = 0;
    for (O = p.length; A < O; A++) {
      F = p[A];
      K = Q[A];
      N = 0;
      for (M = F.length; N < M; N++)
        (J = c(F[N], K[N], G)),
          r ? f(J.x, J.y + n[s - 1].y, n[s - 1].x + R) : f(J.x, J.y, g + R);
    }
  }
  if (l) {
    i = 0 * ba;
    for (N = 0; N < oa; N++) (g = y[N]), h(g[2] + i, g[1] + i, g[0] + i, !0);
    i = ba * (s + 2 * m);
    for (N = 0; N < oa; N++) (g = y[N]), h(g[0] + i, g[1] + i, g[2] + i, !1);
  } else {
    for (N = 0; N < oa; N++) (g = y[N]), h(g[2], g[1], g[0], !0);
    for (N = 0; N < oa; N++)
      (g = y[N]), h(g[0] + ba * s, g[1] + ba * s, g[2] + ba * s, !1);
  }
  g = 0;
  e(t, g);
  g += t.length;
  A = 0;
  for (O = p.length; A < O; A++) (F = p[A]), e(F, g), (g += F.length);
};
THREE.ExtrudeGeometry.WorldUVGenerator = {
  generateTopUV: function (a, b, c, d, e, f) {
    b = a.vertices[e].x;
    e = a.vertices[e].y;
    c = a.vertices[f].x;
    f = a.vertices[f].y;
    return [
      new THREE.Vector2(a.vertices[d].x, a.vertices[d].y),
      new THREE.Vector2(b, e),
      new THREE.Vector2(c, f),
    ];
  },
  generateBottomUV: function (a, b, c, d, e, f) {
    return this.generateTopUV(a, b, c, d, e, f);
  },
  generateSideWallUV: function (a, b, c, d, e, f, h, g) {
    var b = a.vertices[e].x,
      c = a.vertices[e].y,
      e = a.vertices[e].z,
      d = a.vertices[f].x,
      i = a.vertices[f].y,
      f = a.vertices[f].z,
      k = a.vertices[h].x,
      m = a.vertices[h].y,
      h = a.vertices[h].z,
      l = a.vertices[g].x,
      p = a.vertices[g].y,
      a = a.vertices[g].z;
    return 0.01 > Math.abs(c - i)
      ? [
          new THREE.Vector2(b, 1 - e),
          new THREE.Vector2(d, 1 - f),
          new THREE.Vector2(k, 1 - h),
          new THREE.Vector2(l, 1 - a),
        ]
      : [
          new THREE.Vector2(c, 1 - e),
          new THREE.Vector2(i, 1 - f),
          new THREE.Vector2(m, 1 - h),
          new THREE.Vector2(p, 1 - a),
        ];
  },
};
THREE.ExtrudeGeometry.__v1 = new THREE.Vector2();
THREE.ExtrudeGeometry.__v2 = new THREE.Vector2();
THREE.ExtrudeGeometry.__v3 = new THREE.Vector2();
THREE.ExtrudeGeometry.__v4 = new THREE.Vector2();
THREE.ExtrudeGeometry.__v5 = new THREE.Vector2();
THREE.ExtrudeGeometry.__v6 = new THREE.Vector2();
THREE.ShapeGeometry = function (a, b) {
  THREE.Geometry.call(this);
  !1 === a instanceof Array && (a = [a]);
  this.shapebb = a[a.length - 1].getBoundingBox();
  this.addShapeList(a, b);
  this.computeCentroids();
  this.computeFaceNormals();
};
THREE.ShapeGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.ShapeGeometry.prototype.addShapeList = function (a, b) {
  for (var c = 0, d = a.length; c < d; c++) this.addShape(a[c], b);
  return this;
};
THREE.ShapeGeometry.prototype.addShape = function (a, b) {
  void 0 === b && (b = {});
  var c = b.material,
    d =
      void 0 === b.UVGenerator
        ? THREE.ExtrudeGeometry.WorldUVGenerator
        : b.UVGenerator,
    e,
    f,
    h,
    g = this.vertices.length;
  e = a.extractPoints(void 0 !== b.curveSegments ? b.curveSegments : 12);
  var i = e.shape,
    k = e.holes;
  if (!THREE.Shape.Utils.isClockWise(i)) {
    i = i.reverse();
    e = 0;
    for (f = k.length; e < f; e++)
      (h = k[e]), THREE.Shape.Utils.isClockWise(h) && (k[e] = h.reverse());
  }
  var m = THREE.Shape.Utils.triangulateShape(i, k);
  e = 0;
  for (f = k.length; e < f; e++) (h = k[e]), (i = i.concat(h));
  k = i.length;
  f = m.length;
  for (e = 0; e < k; e++)
    (h = i[e]), this.vertices.push(new THREE.Vector3(h.x, h.y, 0));
  for (e = 0; e < f; e++)
    (k = m[e]),
      (i = k[0] + g),
      (h = k[1] + g),
      (k = k[2] + g),
      this.faces.push(new THREE.Face3(i, h, k, null, null, c)),
      this.faceVertexUvs[0].push(d.generateBottomUV(this, a, b, i, h, k));
};
THREE.LatheGeometry = function (a, b, c, d) {
  THREE.Geometry.call(this);
  for (
    var b = b || 12,
      c = c || 0,
      d = d || 2 * Math.PI,
      e = 1 / (a.length - 1),
      f = 1 / b,
      h = 0,
      g = b;
    h <= g;
    h++
  )
    for (
      var i = c + h * f * d,
        k = Math.cos(i),
        m = Math.sin(i),
        i = 0,
        l = a.length;
      i < l;
      i++
    ) {
      var p = a[i],
        s = new THREE.Vector3();
      s.x = k * p.x - m * p.y;
      s.y = m * p.x + k * p.y;
      s.z = p.z;
      this.vertices.push(s);
    }
  c = a.length;
  h = 0;
  for (g = b; h < g; h++) {
    i = 0;
    for (l = a.length - 1; i < l; i++) {
      var b = (m = i + c * h),
        d = m + c,
        k = m + 1 + c,
        m = m + 1,
        p = h * f,
        s = i * e,
        t = p + f,
        n = s + e;
      this.faces.push(new THREE.Face3(b, d, m));
      this.faceVertexUvs[0].push([
        new THREE.Vector2(p, s),
        new THREE.Vector2(t, s),
        new THREE.Vector2(p, n),
      ]);
      this.faces.push(new THREE.Face3(d, k, m));
      this.faceVertexUvs[0].push([
        new THREE.Vector2(t, s),
        new THREE.Vector2(t, n),
        new THREE.Vector2(p, n),
      ]);
    }
  }
  this.mergeVertices();
  this.computeCentroids();
  this.computeFaceNormals();
  this.computeVertexNormals();
};
THREE.LatheGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.PlaneGeometry = function (a, b, c, d) {
  THREE.Geometry.call(this);
  this.width = a;
  this.height = b;
  this.widthSegments = c || 1;
  this.heightSegments = d || 1;
  for (
    var e = a / 2,
      f = b / 2,
      c = this.widthSegments,
      d = this.heightSegments,
      h = c + 1,
      g = d + 1,
      i = this.width / c,
      k = this.height / d,
      m = new THREE.Vector3(0, 0, 1),
      a = 0;
    a < g;
    a++
  )
    for (b = 0; b < h; b++)
      this.vertices.push(new THREE.Vector3(b * i - e, -(a * k - f), 0));
  for (a = 0; a < d; a++)
    for (b = 0; b < c; b++) {
      var l = b + h * a,
        e = b + h * (a + 1),
        f = b + 1 + h * (a + 1),
        g = b + 1 + h * a,
        i = new THREE.Vector2(b / c, 1 - a / d),
        k = new THREE.Vector2(b / c, 1 - (a + 1) / d),
        p = new THREE.Vector2((b + 1) / c, 1 - (a + 1) / d),
        s = new THREE.Vector2((b + 1) / c, 1 - a / d),
        l = new THREE.Face3(l, e, g);
      l.normal.copy(m);
      l.vertexNormals.push(m.clone(), m.clone(), m.clone());
      this.faces.push(l);
      this.faceVertexUvs[0].push([i, k, s]);
      l = new THREE.Face3(e, f, g);
      l.normal.copy(m);
      l.vertexNormals.push(m.clone(), m.clone(), m.clone());
      this.faces.push(l);
      this.faceVertexUvs[0].push([k.clone(), p, s.clone()]);
    }
  this.computeCentroids();
};
THREE.PlaneGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.RingGeometry = function (a, b, c, d, e, f) {
  THREE.Geometry.call(this);
  for (
    var a = a || 0,
      b = b || 50,
      e = void 0 !== e ? e : 0,
      f = void 0 !== f ? f : 2 * Math.PI,
      c = void 0 !== c ? Math.max(3, c) : 8,
      d = void 0 !== d ? Math.max(3, d) : 8,
      h = [],
      g = a,
      i = (b - a) / d,
      a = 0;
    a <= d;
    a++
  ) {
    for (b = 0; b <= c; b++) {
      var k = new THREE.Vector3(),
        m = e + (b / c) * f;
      k.x = g * Math.cos(m);
      k.y = g * Math.sin(m);
      this.vertices.push(k);
      h.push(new THREE.Vector2((k.x / g + 1) / 2, -(k.y / g + 1) / 2 + 1));
    }
    g += i;
  }
  e = new THREE.Vector3(0, 0, 1);
  for (a = 0; a < d; a++) {
    f = a * c;
    for (b = 0; b <= c; b++) {
      var m = b + f,
        i = m + a,
        k = m + c + a,
        l = m + c + 1 + a;
      this.faces.push(new THREE.Face3(i, k, l, [e, e, e]));
      this.faceVertexUvs[0].push([h[i], h[k], h[l]]);
      i = m + a;
      k = m + c + 1 + a;
      l = m + 1 + a;
      this.faces.push(new THREE.Face3(i, k, l, [e, e, e]));
      this.faceVertexUvs[0].push([h[i], h[k], h[l]]);
    }
  }
  this.computeCentroids();
  this.computeFaceNormals();
  this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), g);
};
THREE.RingGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.SphereGeometry = function (a, b, c, d, e, f, h) {
  THREE.Geometry.call(this);
  this.radius = a = a || 50;
  this.widthSegments = b = Math.max(3, Math.floor(b) || 8);
  this.heightSegments = c = Math.max(2, Math.floor(c) || 6);
  this.phiStart = d = void 0 !== d ? d : 0;
  this.phiLength = e = void 0 !== e ? e : 2 * Math.PI;
  this.thetaStart = f = void 0 !== f ? f : 0;
  this.thetaLength = h = void 0 !== h ? h : Math.PI;
  var g,
    i,
    k = [],
    m = [];
  for (i = 0; i <= c; i++) {
    var l = [],
      p = [];
    for (g = 0; g <= b; g++) {
      var s = g / b,
        t = i / c,
        n = new THREE.Vector3();
      n.x = -a * Math.cos(d + s * e) * Math.sin(f + t * h);
      n.y = a * Math.cos(f + t * h);
      n.z = a * Math.sin(d + s * e) * Math.sin(f + t * h);
      this.vertices.push(n);
      l.push(this.vertices.length - 1);
      p.push(new THREE.Vector2(s, 1 - t));
    }
    k.push(l);
    m.push(p);
  }
  for (i = 0; i < this.heightSegments; i++)
    for (g = 0; g < this.widthSegments; g++) {
      var b = k[i][g + 1],
        c = k[i][g],
        d = k[i + 1][g],
        e = k[i + 1][g + 1],
        f = this.vertices[b].clone().normalize(),
        h = this.vertices[c].clone().normalize(),
        l = this.vertices[d].clone().normalize(),
        p = this.vertices[e].clone().normalize(),
        s = m[i][g + 1].clone(),
        t = m[i][g].clone(),
        n = m[i + 1][g].clone(),
        r = m[i + 1][g + 1].clone();
      Math.abs(this.vertices[b].y) === this.radius
        ? (this.faces.push(new THREE.Face3(b, d, e, [f, l, p])),
          this.faceVertexUvs[0].push([s, n, r]))
        : Math.abs(this.vertices[d].y) === this.radius
        ? (this.faces.push(new THREE.Face3(b, c, d, [f, h, l])),
          this.faceVertexUvs[0].push([s, t, n]))
        : (this.faces.push(new THREE.Face3(b, c, e, [f, h, p])),
          this.faceVertexUvs[0].push([s, t, r]),
          this.faces.push(new THREE.Face3(c, d, e, [h, l, p])),
          this.faceVertexUvs[0].push([t.clone(), n, r.clone()]));
    }
  this.computeCentroids();
  this.computeFaceNormals();
  this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), a);
};
THREE.SphereGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.TextGeometry = function (a, b) {
  var b = b || {},
    c = THREE.FontUtils.generateShapes(a, b);
  b.amount = void 0 !== b.height ? b.height : 50;
  void 0 === b.bevelThickness && (b.bevelThickness = 10);
  void 0 === b.bevelSize && (b.bevelSize = 8);
  void 0 === b.bevelEnabled && (b.bevelEnabled = !1);
  THREE.ExtrudeGeometry.call(this, c, b);
};
THREE.TextGeometry.prototype = Object.create(THREE.ExtrudeGeometry.prototype);
THREE.TorusGeometry = function (a, b, c, d, e) {
  THREE.Geometry.call(this);
  this.radius = a || 100;
  this.tube = b || 40;
  this.radialSegments = c || 8;
  this.tubularSegments = d || 6;
  this.arc = e || 2 * Math.PI;
  e = new THREE.Vector3();
  a = [];
  b = [];
  for (c = 0; c <= this.radialSegments; c++)
    for (d = 0; d <= this.tubularSegments; d++) {
      var f = (d / this.tubularSegments) * this.arc,
        h = ((2 * c) / this.radialSegments) * Math.PI;
      e.x = this.radius * Math.cos(f);
      e.y = this.radius * Math.sin(f);
      var g = new THREE.Vector3();
      g.x = (this.radius + this.tube * Math.cos(h)) * Math.cos(f);
      g.y = (this.radius + this.tube * Math.cos(h)) * Math.sin(f);
      g.z = this.tube * Math.sin(h);
      this.vertices.push(g);
      a.push(
        new THREE.Vector2(d / this.tubularSegments, c / this.radialSegments)
      );
      b.push(g.clone().sub(e).normalize());
    }
  for (c = 1; c <= this.radialSegments; c++)
    for (d = 1; d <= this.tubularSegments; d++) {
      var e = (this.tubularSegments + 1) * c + d - 1,
        f = (this.tubularSegments + 1) * (c - 1) + d - 1,
        h = (this.tubularSegments + 1) * (c - 1) + d,
        g = (this.tubularSegments + 1) * c + d,
        i = new THREE.Face3(e, f, g, [b[e], b[f], b[g]]);
      i.normal.add(b[e]);
      i.normal.add(b[f]);
      i.normal.add(b[g]);
      i.normal.normalize();
      this.faces.push(i);
      this.faceVertexUvs[0].push([a[e].clone(), a[f].clone(), a[g].clone()]);
      i = new THREE.Face3(f, h, g, [b[f], b[h], b[g]]);
      i.normal.add(b[f]);
      i.normal.add(b[h]);
      i.normal.add(b[g]);
      i.normal.normalize();
      this.faces.push(i);
      this.faceVertexUvs[0].push([a[f].clone(), a[h].clone(), a[g].clone()]);
    }
  this.computeCentroids();
};
THREE.TorusGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.TorusKnotGeometry = function (a, b, c, d, e, f, h) {
  function g(a, b, c, d, e) {
    var f = Math.cos(a),
      g = Math.sin(a),
      a = (b / c) * a,
      b = Math.cos(a),
      f = 0.5 * (d * (2 + b)) * f,
      g = 0.5 * d * (2 + b) * g,
      d = 0.5 * e * d * Math.sin(a);
    return new THREE.Vector3(f, g, d);
  }
  THREE.Geometry.call(this);
  this.radius = a || 100;
  this.tube = b || 40;
  this.radialSegments = c || 64;
  this.tubularSegments = d || 8;
  this.p = e || 2;
  this.q = f || 3;
  this.heightScale = h || 1;
  this.grid = Array(this.radialSegments);
  c = new THREE.Vector3();
  d = new THREE.Vector3();
  e = new THREE.Vector3();
  for (a = 0; a < this.radialSegments; ++a) {
    this.grid[a] = Array(this.tubularSegments);
    b = 2 * (a / this.radialSegments) * this.p * Math.PI;
    f = g(b, this.q, this.p, this.radius, this.heightScale);
    b = g(b + 0.01, this.q, this.p, this.radius, this.heightScale);
    c.subVectors(b, f);
    d.addVectors(b, f);
    e.crossVectors(c, d);
    d.crossVectors(e, c);
    e.normalize();
    d.normalize();
    for (b = 0; b < this.tubularSegments; ++b) {
      var i = 2 * (b / this.tubularSegments) * Math.PI,
        h = -this.tube * Math.cos(i),
        i = this.tube * Math.sin(i),
        k = new THREE.Vector3();
      k.x = f.x + h * d.x + i * e.x;
      k.y = f.y + h * d.y + i * e.y;
      k.z = f.z + h * d.z + i * e.z;
      this.grid[a][b] = this.vertices.push(k) - 1;
    }
  }
  for (a = 0; a < this.radialSegments; ++a)
    for (b = 0; b < this.tubularSegments; ++b) {
      var e = (a + 1) % this.radialSegments,
        f = (b + 1) % this.tubularSegments,
        c = this.grid[a][b],
        d = this.grid[e][b],
        e = this.grid[e][f],
        f = this.grid[a][f],
        h = new THREE.Vector2(
          a / this.radialSegments,
          b / this.tubularSegments
        ),
        i = new THREE.Vector2(
          (a + 1) / this.radialSegments,
          b / this.tubularSegments
        ),
        k = new THREE.Vector2(
          (a + 1) / this.radialSegments,
          (b + 1) / this.tubularSegments
        ),
        m = new THREE.Vector2(
          a / this.radialSegments,
          (b + 1) / this.tubularSegments
        );
      this.faces.push(new THREE.Face3(c, d, f));
      this.faceVertexUvs[0].push([h, i, m]);
      this.faces.push(new THREE.Face3(d, e, f));
      this.faceVertexUvs[0].push([i.clone(), k, m.clone()]);
    }
  this.computeCentroids();
  this.computeFaceNormals();
  this.computeVertexNormals();
};
THREE.TorusKnotGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.TubeGeometry = function (a, b, c, d, e) {
  THREE.Geometry.call(this);
  this.path = a;
  this.segments = b || 64;
  this.radius = c || 1;
  this.radialSegments = d || 8;
  this.closed = e || !1;
  this.grid = [];
  var f,
    h,
    d = this.segments + 1,
    g,
    i,
    k,
    e = new THREE.Vector3(),
    m,
    l,
    b = new THREE.TubeGeometry.FrenetFrames(
      this.path,
      this.segments,
      this.closed
    );
  m = b.normals;
  l = b.binormals;
  this.tangents = b.tangents;
  this.normals = m;
  this.binormals = l;
  for (b = 0; b < d; b++) {
    this.grid[b] = [];
    c = b / (d - 1);
    k = a.getPointAt(c);
    f = m[b];
    h = l[b];
    for (c = 0; c < this.radialSegments; c++)
      (g = 2 * (c / this.radialSegments) * Math.PI),
        (i = -this.radius * Math.cos(g)),
        (g = this.radius * Math.sin(g)),
        e.copy(k),
        (e.x += i * f.x + g * h.x),
        (e.y += i * f.y + g * h.y),
        (e.z += i * f.z + g * h.z),
        (this.grid[b][c] =
          this.vertices.push(new THREE.Vector3(e.x, e.y, e.z)) - 1);
  }
  for (b = 0; b < this.segments; b++)
    for (c = 0; c < this.radialSegments; c++)
      (e = this.closed ? (b + 1) % this.segments : b + 1),
        (m = (c + 1) % this.radialSegments),
        (a = this.grid[b][c]),
        (d = this.grid[e][c]),
        (e = this.grid[e][m]),
        (m = this.grid[b][m]),
        (l = new THREE.Vector2(b / this.segments, c / this.radialSegments)),
        (f = new THREE.Vector2(
          (b + 1) / this.segments,
          c / this.radialSegments
        )),
        (h = new THREE.Vector2(
          (b + 1) / this.segments,
          (c + 1) / this.radialSegments
        )),
        (i = new THREE.Vector2(
          b / this.segments,
          (c + 1) / this.radialSegments
        )),
        this.faces.push(new THREE.Face3(a, d, m)),
        this.faceVertexUvs[0].push([l, f, i]),
        this.faces.push(new THREE.Face3(d, e, m)),
        this.faceVertexUvs[0].push([f.clone(), h, i.clone()]);
  this.computeCentroids();
  this.computeFaceNormals();
  this.computeVertexNormals();
};
THREE.TubeGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.TubeGeometry.FrenetFrames = function (a, b, c) {
  new THREE.Vector3();
  var d = new THREE.Vector3();
  new THREE.Vector3();
  var e = [],
    f = [],
    h = [],
    g = new THREE.Vector3(),
    i = new THREE.Matrix4(),
    b = b + 1,
    k,
    m,
    l;
  this.tangents = e;
  this.normals = f;
  this.binormals = h;
  for (k = 0; k < b; k++)
    (m = k / (b - 1)), (e[k] = a.getTangentAt(m)), e[k].normalize();
  f[0] = new THREE.Vector3();
  h[0] = new THREE.Vector3();
  a = Number.MAX_VALUE;
  k = Math.abs(e[0].x);
  m = Math.abs(e[0].y);
  l = Math.abs(e[0].z);
  k <= a && ((a = k), d.set(1, 0, 0));
  m <= a && ((a = m), d.set(0, 1, 0));
  l <= a && d.set(0, 0, 1);
  g.crossVectors(e[0], d).normalize();
  f[0].crossVectors(e[0], g);
  h[0].crossVectors(e[0], f[0]);
  for (k = 1; k < b; k++)
    (f[k] = f[k - 1].clone()),
      (h[k] = h[k - 1].clone()),
      g.crossVectors(e[k - 1], e[k]),
      1e-4 < g.length() &&
        (g.normalize(),
        (d = Math.acos(THREE.Math.clamp(e[k - 1].dot(e[k]), -1, 1))),
        f[k].applyMatrix4(i.makeRotationAxis(g, d))),
      h[k].crossVectors(e[k], f[k]);
  if (c) {
    d = Math.acos(THREE.Math.clamp(f[0].dot(f[b - 1]), -1, 1));
    d /= b - 1;
    0 < e[0].dot(g.crossVectors(f[0], f[b - 1])) && (d = -d);
    for (k = 1; k < b; k++)
      f[k].applyMatrix4(i.makeRotationAxis(e[k], d * k)),
        h[k].crossVectors(e[k], f[k]);
  }
};
THREE.PolyhedronGeometry = function (a, b, c, d) {
  function e(a) {
    var b = a.normalize().clone();
    b.index = g.vertices.push(b) - 1;
    var c = Math.atan2(a.z, -a.x) / 2 / Math.PI + 0.5,
      a = Math.atan2(-a.y, Math.sqrt(a.x * a.x + a.z * a.z)) / Math.PI + 0.5;
    b.uv = new THREE.Vector2(c, 1 - a);
    return b;
  }
  function f(a, b, c) {
    var d = new THREE.Face3(a.index, b.index, c.index, [
      a.clone(),
      b.clone(),
      c.clone(),
    ]);
    d.centroid.add(a).add(b).add(c).divideScalar(3);
    g.faces.push(d);
    d = Math.atan2(d.centroid.z, -d.centroid.x);
    g.faceVertexUvs[0].push([h(a.uv, a, d), h(b.uv, b, d), h(c.uv, c, d)]);
  }
  function h(a, b, c) {
    0 > c && 1 === a.x && (a = new THREE.Vector2(a.x - 1, a.y));
    0 === b.x &&
      0 === b.z &&
      (a = new THREE.Vector2(c / 2 / Math.PI + 0.5, a.y));
    return a.clone();
  }
  THREE.Geometry.call(this);
  for (var c = c || 1, d = d || 0, g = this, i = 0, k = a.length; i < k; i++)
    e(new THREE.Vector3(a[i][0], a[i][1], a[i][2]));
  for (var m = this.vertices, a = [], i = 0, k = b.length; i < k; i++) {
    var l = m[b[i][0]],
      p = m[b[i][1]],
      s = m[b[i][2]];
    a[i] = new THREE.Face3(l.index, p.index, s.index, [
      l.clone(),
      p.clone(),
      s.clone(),
    ]);
  }
  i = 0;
  for (k = a.length; i < k; i++) {
    p = a[i];
    m = d;
    b = Math.pow(2, m);
    Math.pow(4, m);
    for (
      var m = e(g.vertices[p.a]),
        l = e(g.vertices[p.b]),
        t = e(g.vertices[p.c]),
        p = [],
        s = 0;
      s <= b;
      s++
    ) {
      p[s] = [];
      for (
        var n = e(m.clone().lerp(t, s / b)),
          r = e(l.clone().lerp(t, s / b)),
          q = b - s,
          u = 0;
        u <= q;
        u++
      )
        p[s][u] = 0 == u && s == b ? n : e(n.clone().lerp(r, u / q));
    }
    for (s = 0; s < b; s++)
      for (u = 0; u < 2 * (b - s) - 1; u++)
        (m = Math.floor(u / 2)),
          0 == u % 2
            ? f(p[s][m + 1], p[s + 1][m], p[s][m])
            : f(p[s][m + 1], p[s + 1][m + 1], p[s + 1][m]);
  }
  i = 0;
  for (k = this.faceVertexUvs[0].length; i < k; i++)
    (d = this.faceVertexUvs[0][i]),
      (a = d[0].x),
      (b = d[1].x),
      (m = d[2].x),
      (l = Math.max(a, Math.max(b, m))),
      (p = Math.min(a, Math.min(b, m))),
      0.9 < l &&
        0.1 > p &&
        (0.2 > a && (d[0].x += 1),
        0.2 > b && (d[1].x += 1),
        0.2 > m && (d[2].x += 1));
  i = 0;
  for (k = this.vertices.length; i < k; i++) this.vertices[i].multiplyScalar(c);
  this.mergeVertices();
  this.computeCentroids();
  this.computeFaceNormals();
  this.boundingSphere = new THREE.Sphere(new THREE.Vector3(), c);
};
THREE.PolyhedronGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.IcosahedronGeometry = function (a, b) {
  this.radius = a;
  this.detail = b;
  var c = (1 + Math.sqrt(5)) / 2;
  THREE.PolyhedronGeometry.call(
    this,
    [
      [-1, c, 0],
      [1, c, 0],
      [-1, -c, 0],
      [1, -c, 0],
      [0, -1, c],
      [0, 1, c],
      [0, -1, -c],
      [0, 1, -c],
      [c, 0, -1],
      [c, 0, 1],
      [-c, 0, -1],
      [-c, 0, 1],
    ],
    [
      [0, 11, 5],
      [0, 5, 1],
      [0, 1, 7],
      [0, 7, 10],
      [0, 10, 11],
      [1, 5, 9],
      [5, 11, 4],
      [11, 10, 2],
      [10, 7, 6],
      [7, 1, 8],
      [3, 9, 4],
      [3, 4, 2],
      [3, 2, 6],
      [3, 6, 8],
      [3, 8, 9],
      [4, 9, 5],
      [2, 4, 11],
      [6, 2, 10],
      [8, 6, 7],
      [9, 8, 1],
    ],
    a,
    b
  );
};
THREE.IcosahedronGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.OctahedronGeometry = function (a, b) {
  THREE.PolyhedronGeometry.call(
    this,
    [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
    [
      [0, 2, 4],
      [0, 4, 3],
      [0, 3, 5],
      [0, 5, 2],
      [1, 2, 5],
      [1, 5, 3],
      [1, 3, 4],
      [1, 4, 2],
    ],
    a,
    b
  );
};
THREE.OctahedronGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.TetrahedronGeometry = function (a, b) {
  THREE.PolyhedronGeometry.call(
    this,
    [
      [1, 1, 1],
      [-1, -1, 1],
      [-1, 1, -1],
      [1, -1, -1],
    ],
    [
      [2, 1, 0],
      [0, 3, 2],
      [1, 3, 0],
      [2, 3, 1],
    ],
    a,
    b
  );
};
THREE.TetrahedronGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.ParametricGeometry = function (a, b, c) {
  THREE.Geometry.call(this);
  var d = this.vertices,
    e = this.faces,
    f = this.faceVertexUvs[0],
    h,
    g,
    i,
    k,
    m = b + 1;
  for (h = 0; h <= c; h++) {
    k = h / c;
    for (g = 0; g <= b; g++) (i = g / b), (i = a(i, k)), d.push(i);
  }
  var l, p, s, t;
  for (h = 0; h < c; h++)
    for (g = 0; g < b; g++)
      (a = h * m + g),
        (d = h * m + g + 1),
        (k = (h + 1) * m + g + 1),
        (i = (h + 1) * m + g),
        (l = new THREE.Vector2(g / b, h / c)),
        (p = new THREE.Vector2((g + 1) / b, h / c)),
        (s = new THREE.Vector2((g + 1) / b, (h + 1) / c)),
        (t = new THREE.Vector2(g / b, (h + 1) / c)),
        e.push(new THREE.Face3(a, d, i)),
        f.push([l, p, t]),
        e.push(new THREE.Face3(d, k, i)),
        f.push([p.clone(), s, t.clone()]);
  this.computeCentroids();
  this.computeFaceNormals();
  this.computeVertexNormals();
};
THREE.ParametricGeometry.prototype = Object.create(THREE.Geometry.prototype);
THREE.AxisHelper = function (a) {
  var a = a || 1,
    b = new THREE.Geometry();
  b.vertices.push(
    new THREE.Vector3(),
    new THREE.Vector3(a, 0, 0),
    new THREE.Vector3(),
    new THREE.Vector3(0, a, 0),
    new THREE.Vector3(),
    new THREE.Vector3(0, 0, a)
  );
  b.colors.push(
    new THREE.Color(16711680),
    new THREE.Color(16755200),
    new THREE.Color(65280),
    new THREE.Color(11206400),
    new THREE.Color(255),
    new THREE.Color(43775)
  );
  a = new THREE.LineBasicMaterial({ vertexColors: THREE.VertexColors });
  THREE.Line.call(this, b, a, THREE.LinePieces);
};
THREE.AxisHelper.prototype = Object.create(THREE.Line.prototype);
THREE.ArrowHelper = function (a, b, c, d) {
  THREE.Object3D.call(this);
  void 0 === d && (d = 16776960);
  void 0 === c && (c = 1);
  this.position = b;
  b = new THREE.Geometry();
  b.vertices.push(new THREE.Vector3(0, 0, 0));
  b.vertices.push(new THREE.Vector3(0, 1, 0));
  this.line = new THREE.Line(b, new THREE.LineBasicMaterial({ color: d }));
  this.line.matrixAutoUpdate = !1;
  this.add(this.line);
  b = new THREE.CylinderGeometry(0, 0.05, 0.25, 5, 1);
  b.applyMatrix(new THREE.Matrix4().makeTranslation(0, 0.875, 0));
  this.cone = new THREE.Mesh(b, new THREE.MeshBasicMaterial({ color: d }));
  this.cone.matrixAutoUpdate = !1;
  this.add(this.cone);
  this.setDirection(a);
  this.setLength(c);
};
THREE.ArrowHelper.prototype = Object.create(THREE.Object3D.prototype);
THREE.ArrowHelper.prototype.setDirection = (function () {
  var a = new THREE.Vector3(),
    b;
  return function (c) {
    0.99999 < c.y
      ? this.quaternion.set(0, 0, 0, 1)
      : -0.99999 > c.y
      ? this.quaternion.set(1, 0, 0, 0)
      : (a.set(c.z, 0, -c.x).normalize(),
        (b = Math.acos(c.y)),
        this.quaternion.setFromAxisAngle(a, b));
  };
})();
THREE.ArrowHelper.prototype.setLength = function (a) {
  this.scale.set(a, a, a);
};
THREE.ArrowHelper.prototype.setColor = function (a) {
  this.line.material.color.setHex(a);
  this.cone.material.color.setHex(a);
};
THREE.BoxHelper = function (a) {
  var b = [
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(-1, 1, 1),
    new THREE.Vector3(-1, -1, 1),
    new THREE.Vector3(1, -1, 1),
    new THREE.Vector3(1, 1, -1),
    new THREE.Vector3(-1, 1, -1),
    new THREE.Vector3(-1, -1, -1),
    new THREE.Vector3(1, -1, -1),
  ];
  this.vertices = b;
  var c = new THREE.Geometry();
  c.vertices.push(
    b[0],
    b[1],
    b[1],
    b[2],
    b[2],
    b[3],
    b[3],
    b[0],
    b[4],
    b[5],
    b[5],
    b[6],
    b[6],
    b[7],
    b[7],
    b[4],
    b[0],
    b[4],
    b[1],
    b[5],
    b[2],
    b[6],
    b[3],
    b[7]
  );
  THREE.Line.call(
    this,
    c,
    new THREE.LineBasicMaterial({ color: 16776960 }),
    THREE.LinePieces
  );
  void 0 !== a && this.update(a);
};
THREE.BoxHelper.prototype = Object.create(THREE.Line.prototype);
THREE.BoxHelper.prototype.update = function (a) {
  var b = a.geometry;
  null === b.boundingBox && b.computeBoundingBox();
  var c = b.boundingBox.min,
    b = b.boundingBox.max,
    d = this.vertices;
  d[0].set(b.x, b.y, b.z);
  d[1].set(c.x, b.y, b.z);
  d[2].set(c.x, c.y, b.z);
  d[3].set(b.x, c.y, b.z);
  d[4].set(b.x, b.y, c.z);
  d[5].set(c.x, b.y, c.z);
  d[6].set(c.x, c.y, c.z);
  d[7].set(b.x, c.y, c.z);
  this.geometry.computeBoundingSphere();
  this.geometry.verticesNeedUpdate = !0;
  this.matrixAutoUpdate = !1;
  this.matrixWorld = a.matrixWorld;
};
THREE.BoundingBoxHelper = function (a, b) {
  var c = b || 8947848;
  this.object = a;
  this.box = new THREE.Box3();
  THREE.Mesh.call(
    this,
    new THREE.CubeGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: c, wireframe: !0 })
  );
};
THREE.BoundingBoxHelper.prototype = Object.create(THREE.Mesh.prototype);
THREE.BoundingBoxHelper.prototype.update = function () {
  this.box.setFromObject(this.object);
  this.box.size(this.scale);
  this.box.center(this.position);
};
THREE.CameraHelper = function (a) {
  function b(a, b, d) {
    c(a, d);
    c(b, d);
  }
  function c(a, b) {
    d.vertices.push(new THREE.Vector3());
    d.colors.push(new THREE.Color(b));
    void 0 === f[a] && (f[a] = []);
    f[a].push(d.vertices.length - 1);
  }
  var d = new THREE.Geometry(),
    e = new THREE.LineBasicMaterial({
      color: 16777215,
      vertexColors: THREE.FaceColors,
    }),
    f = {};
  b("n1", "n2", 16755200);
  b("n2", "n4", 16755200);
  b("n4", "n3", 16755200);
  b("n3", "n1", 16755200);
  b("f1", "f2", 16755200);
  b("f2", "f4", 16755200);
  b("f4", "f3", 16755200);
  b("f3", "f1", 16755200);
  b("n1", "f1", 16755200);
  b("n2", "f2", 16755200);
  b("n3", "f3", 16755200);
  b("n4", "f4", 16755200);
  b("p", "n1", 16711680);
  b("p", "n2", 16711680);
  b("p", "n3", 16711680);
  b("p", "n4", 16711680);
  b("u1", "u2", 43775);
  b("u2", "u3", 43775);
  b("u3", "u1", 43775);
  b("c", "t", 16777215);
  b("p", "c", 3355443);
  b("cn1", "cn2", 3355443);
  b("cn3", "cn4", 3355443);
  b("cf1", "cf2", 3355443);
  b("cf3", "cf4", 3355443);
  THREE.Line.call(this, d, e, THREE.LinePieces);
  this.camera = a;
  this.matrixWorld = a.matrixWorld;
  this.matrixAutoUpdate = !1;
  this.pointMap = f;
  this.update();
};
THREE.CameraHelper.prototype = Object.create(THREE.Line.prototype);
THREE.CameraHelper.prototype.update = (function () {
  var a = new THREE.Vector3(),
    b = new THREE.Camera(),
    c = new THREE.Projector();
  return function () {
    function d(d, h, g, i) {
      a.set(h, g, i);
      c.unprojectVector(a, b);
      d = e.pointMap[d];
      if (void 0 !== d) {
        h = 0;
        for (g = d.length; h < g; h++) e.geometry.vertices[d[h]].copy(a);
      }
    }
    var e = this;
    b.projectionMatrix.copy(this.camera.projectionMatrix);
    d("c", 0, 0, -1);
    d("t", 0, 0, 1);
    d("n1", -1, -1, -1);
    d("n2", 1, -1, -1);
    d("n3", -1, 1, -1);
    d("n4", 1, 1, -1);
    d("f1", -1, -1, 1);
    d("f2", 1, -1, 1);
    d("f3", -1, 1, 1);
    d("f4", 1, 1, 1);
    d("u1", 0.7, 1.1, -1);
    d("u2", -0.7, 1.1, -1);
    d("u3", 0, 2, -1);
    d("cf1", -1, 0, 1);
    d("cf2", 1, 0, 1);
    d("cf3", 0, -1, 1);
    d("cf4", 0, 1, 1);
    d("cn1", -1, 0, -1);
    d("cn2", 1, 0, -1);
    d("cn3", 0, -1, -1);
    d("cn4", 0, 1, -1);
    this.geometry.verticesNeedUpdate = !0;
  };
})();
THREE.DirectionalLightHelper = function (a, b) {
  THREE.Object3D.call(this);
  this.light = a;
  this.light.updateMatrixWorld();
  this.matrixWorld = a.matrixWorld;
  this.matrixAutoUpdate = !1;
  var c = new THREE.PlaneGeometry(b, b),
    d = new THREE.MeshBasicMaterial({ wireframe: !0, fog: !1 });
  d.color.copy(this.light.color).multiplyScalar(this.light.intensity);
  this.lightPlane = new THREE.Mesh(c, d);
  this.add(this.lightPlane);
  c = new THREE.Geometry();
  c.vertices.push(new THREE.Vector3());
  c.vertices.push(new THREE.Vector3());
  c.computeLineDistances();
  d = new THREE.LineBasicMaterial({ fog: !1 });
  d.color.copy(this.light.color).multiplyScalar(this.light.intensity);
  this.targetLine = new THREE.Line(c, d);
  this.add(this.targetLine);
  this.update();
};
THREE.DirectionalLightHelper.prototype = Object.create(
  THREE.Object3D.prototype
);
THREE.DirectionalLightHelper.prototype.dispose = function () {
  this.lightPlane.geometry.dispose();
  this.lightPlane.material.dispose();
  this.targetLine.geometry.dispose();
  this.targetLine.material.dispose();
};
THREE.DirectionalLightHelper.prototype.update = (function () {
  var a = new THREE.Vector3();
  return function () {
    a.getPositionFromMatrix(this.light.matrixWorld).negate();
    this.lightPlane.lookAt(a);
    this.lightPlane.material.color
      .copy(this.light.color)
      .multiplyScalar(this.light.intensity);
    this.targetLine.geometry.vertices[1].copy(a);
    this.targetLine.geometry.verticesNeedUpdate = !0;
    this.targetLine.material.color.copy(this.lightPlane.material.color);
  };
})();
THREE.FaceNormalsHelper = function (a, b, c, d) {
  this.object = a;
  this.size = b || 1;
  for (
    var a = c || 16776960,
      d = d || 1,
      b = new THREE.Geometry(),
      c = 0,
      e = this.object.geometry.faces.length;
    c < e;
    c++
  )
    b.vertices.push(new THREE.Vector3()), b.vertices.push(new THREE.Vector3());
  THREE.Line.call(
    this,
    b,
    new THREE.LineBasicMaterial({ color: a, linewidth: d }),
    THREE.LinePieces
  );
  this.matrixAutoUpdate = !1;
  this.normalMatrix = new THREE.Matrix3();
  this.update();
};
THREE.FaceNormalsHelper.prototype = Object.create(THREE.Line.prototype);
THREE.FaceNormalsHelper.prototype.update = (function () {
  var a = new THREE.Vector3();
  return function () {
    this.object.updateMatrixWorld(!0);
    this.normalMatrix.getNormalMatrix(this.object.matrixWorld);
    for (
      var b = this.geometry.vertices,
        c = this.object.geometry.faces,
        d = this.object.matrixWorld,
        e = 0,
        f = c.length;
      e < f;
      e++
    ) {
      var h = c[e];
      a.copy(h.normal)
        .applyMatrix3(this.normalMatrix)
        .normalize()
        .multiplyScalar(this.size);
      var g = 2 * e;
      b[g].copy(h.centroid).applyMatrix4(d);
      b[g + 1].addVectors(b[g], a);
    }
    this.geometry.verticesNeedUpdate = !0;
    return this;
  };
})();
THREE.GridHelper = function (a, b) {
  var c = new THREE.Geometry(),
    d = new THREE.LineBasicMaterial({ vertexColors: THREE.VertexColors });
  this.color1 = new THREE.Color(4473924);
  this.color2 = new THREE.Color(8947848);
  for (var e = -a; e <= a; e += b) {
    c.vertices.push(
      new THREE.Vector3(-a, 0, e),
      new THREE.Vector3(a, 0, e),
      new THREE.Vector3(e, 0, -a),
      new THREE.Vector3(e, 0, a)
    );
    var f = 0 === e ? this.color1 : this.color2;
    c.colors.push(f, f, f, f);
  }
  THREE.Line.call(this, c, d, THREE.LinePieces);
};
THREE.GridHelper.prototype = Object.create(THREE.Line.prototype);
THREE.GridHelper.prototype.setColors = function (a, b) {
  this.color1.set(a);
  this.color2.set(b);
  this.geometry.colorsNeedUpdate = !0;
};
THREE.HemisphereLightHelper = function (a, b) {
  THREE.Object3D.call(this);
  this.light = a;
  this.light.updateMatrixWorld();
  this.matrixWorld = a.matrixWorld;
  this.matrixAutoUpdate = !1;
  this.colors = [new THREE.Color(), new THREE.Color()];
  var c = new THREE.SphereGeometry(b, 4, 2);
  c.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  for (var d = 0; 8 > d; d++) c.faces[d].color = this.colors[4 > d ? 0 : 1];
  d = new THREE.MeshBasicMaterial({
    vertexColors: THREE.FaceColors,
    wireframe: !0,
  });
  this.lightSphere = new THREE.Mesh(c, d);
  this.add(this.lightSphere);
  this.update();
};
THREE.HemisphereLightHelper.prototype = Object.create(THREE.Object3D.prototype);
THREE.HemisphereLightHelper.prototype.dispose = function () {
  this.lightSphere.geometry.dispose();
  this.lightSphere.material.dispose();
};
THREE.HemisphereLightHelper.prototype.update = (function () {
  var a = new THREE.Vector3();
  return function () {
    this.colors[0].copy(this.light.color).multiplyScalar(this.light.intensity);
    this.colors[1]
      .copy(this.light.groundColor)
      .multiplyScalar(this.light.intensity);
    this.lightSphere.lookAt(
      a.getPositionFromMatrix(this.light.matrixWorld).negate()
    );
    this.lightSphere.geometry.colorsNeedUpdate = !0;
  };
})();
THREE.PointLightHelper = function (a, b) {
  this.light = a;
  this.light.updateMatrixWorld();
  var c = new THREE.SphereGeometry(b, 4, 2),
    d = new THREE.MeshBasicMaterial({ wireframe: !0, fog: !1 });
  d.color.copy(this.light.color).multiplyScalar(this.light.intensity);
  THREE.Mesh.call(this, c, d);
  this.matrixWorld = this.light.matrixWorld;
  this.matrixAutoUpdate = !1;
};
THREE.PointLightHelper.prototype = Object.create(THREE.Mesh.prototype);
THREE.PointLightHelper.prototype.dispose = function () {
  this.geometry.dispose();
  this.material.dispose();
};
THREE.PointLightHelper.prototype.update = function () {
  this.material.color
    .copy(this.light.color)
    .multiplyScalar(this.light.intensity);
};
THREE.SpotLightHelper = function (a) {
  THREE.Object3D.call(this);
  this.light = a;
  this.light.updateMatrixWorld();
  this.matrixWorld = a.matrixWorld;
  this.matrixAutoUpdate = !1;
  a = new THREE.CylinderGeometry(0, 1, 1, 8, 1, !0);
  a.applyMatrix(new THREE.Matrix4().makeTranslation(0, -0.5, 0));
  a.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  var b = new THREE.MeshBasicMaterial({ wireframe: !0, fog: !1 });
  this.cone = new THREE.Mesh(a, b);
  this.add(this.cone);
  this.update();
};
THREE.SpotLightHelper.prototype = Object.create(THREE.Object3D.prototype);
THREE.SpotLightHelper.prototype.dispose = function () {
  this.cone.geometry.dispose();
  this.cone.material.dispose();
};
THREE.SpotLightHelper.prototype.update = (function () {
  var a = new THREE.Vector3(),
    b = new THREE.Vector3();
  return function () {
    var c = this.light.distance ? this.light.distance : 1e4,
      d = c * Math.tan(this.light.angle);
    this.cone.scale.set(d, d, c);
    a.getPositionFromMatrix(this.light.matrixWorld);
    b.getPositionFromMatrix(this.light.target.matrixWorld);
    this.cone.lookAt(b.sub(a));
    this.cone.material.color
      .copy(this.light.color)
      .multiplyScalar(this.light.intensity);
  };
})();
THREE.VertexNormalsHelper = function (a, b, c, d) {
  this.object = a;
  this.size = b || 1;
  for (
    var b = c || 16711680,
      d = d || 1,
      c = new THREE.Geometry(),
      a = a.geometry.faces,
      e = 0,
      f = a.length;
    e < f;
    e++
  )
    for (var h = 0, g = a[e].vertexNormals.length; h < g; h++)
      c.vertices.push(new THREE.Vector3()),
        c.vertices.push(new THREE.Vector3());
  THREE.Line.call(
    this,
    c,
    new THREE.LineBasicMaterial({ color: b, linewidth: d }),
    THREE.LinePieces
  );
  this.matrixAutoUpdate = !1;
  this.normalMatrix = new THREE.Matrix3();
  this.update();
};
THREE.VertexNormalsHelper.prototype = Object.create(THREE.Line.prototype);
THREE.VertexNormalsHelper.prototype.update = (function () {
  var a = new THREE.Vector3();
  return function () {
    var b = ["a", "b", "c", "d"];
    this.object.updateMatrixWorld(!0);
    this.normalMatrix.getNormalMatrix(this.object.matrixWorld);
    for (
      var c = this.geometry.vertices,
        d = this.object.geometry.vertices,
        e = this.object.geometry.faces,
        f = this.object.matrixWorld,
        h = 0,
        g = 0,
        i = e.length;
      g < i;
      g++
    )
      for (var k = e[g], m = 0, l = k.vertexNormals.length; m < l; m++) {
        var p = k.vertexNormals[m];
        c[h].copy(d[k[b[m]]]).applyMatrix4(f);
        a.copy(p)
          .applyMatrix3(this.normalMatrix)
          .normalize()
          .multiplyScalar(this.size);
        a.add(c[h]);
        h += 1;
        c[h].copy(a);
        h += 1;
      }
    this.geometry.verticesNeedUpdate = !0;
    return this;
  };
})();
THREE.VertexTangentsHelper = function (a, b, c, d) {
  this.object = a;
  this.size = b || 1;
  for (
    var b = c || 255,
      d = d || 1,
      c = new THREE.Geometry(),
      a = a.geometry.faces,
      e = 0,
      f = a.length;
    e < f;
    e++
  )
    for (var h = 0, g = a[e].vertexTangents.length; h < g; h++)
      c.vertices.push(new THREE.Vector3()),
        c.vertices.push(new THREE.Vector3());
  THREE.Line.call(
    this,
    c,
    new THREE.LineBasicMaterial({ color: b, linewidth: d }),
    THREE.LinePieces
  );
  this.matrixAutoUpdate = !1;
  this.update();
};
THREE.VertexTangentsHelper.prototype = Object.create(THREE.Line.prototype);
THREE.VertexTangentsHelper.prototype.update = (function () {
  var a = new THREE.Vector3();
  return function () {
    var b = ["a", "b", "c", "d"];
    this.object.updateMatrixWorld(!0);
    for (
      var c = this.geometry.vertices,
        d = this.object.geometry.vertices,
        e = this.object.geometry.faces,
        f = this.object.matrixWorld,
        h = 0,
        g = 0,
        i = e.length;
      g < i;
      g++
    )
      for (var k = e[g], m = 0, l = k.vertexTangents.length; m < l; m++) {
        var p = k.vertexTangents[m];
        c[h].copy(d[k[b[m]]]).applyMatrix4(f);
        a.copy(p).transformDirection(f).multiplyScalar(this.size);
        a.add(c[h]);
        h += 1;
        c[h].copy(a);
        h += 1;
      }
    this.geometry.verticesNeedUpdate = !0;
    return this;
  };
})();
THREE.WireframeHelper = function (a) {
  for (
    var b = [0, 0],
      c = {},
      d = function (a, b) {
        return a - b;
      },
      e = ["a", "b", "c", "d"],
      f = new THREE.Geometry(),
      h = a.geometry.vertices,
      g = a.geometry.faces,
      i = 0,
      k = g.length;
    i < k;
    i++
  )
    for (var m = g[i], l = 0; 3 > l; l++) {
      b[0] = m[e[l]];
      b[1] = m[e[(l + 1) % 3]];
      b.sort(d);
      var p = b.toString();
      void 0 === c[p] &&
        (f.vertices.push(h[b[0]]), f.vertices.push(h[b[1]]), (c[p] = !0));
    }
  THREE.Line.call(
    this,
    f,
    new THREE.LineBasicMaterial({ color: 16777215 }),
    THREE.LinePieces
  );
  this.matrixAutoUpdate = !1;
  this.matrixWorld = a.matrixWorld;
};
THREE.WireframeHelper.prototype = Object.create(THREE.Line.prototype);
THREE.ImmediateRenderObject = function () {
  THREE.Object3D.call(this);
  this.render = function () {};
};
THREE.ImmediateRenderObject.prototype = Object.create(THREE.Object3D.prototype);
THREE.LensFlare = function (a, b, c, d, e) {
  THREE.Object3D.call(this);
  this.lensFlares = [];
  this.positionScreen = new THREE.Vector3();
  this.customUpdateCallback = void 0;
  void 0 !== a && this.add(a, b, c, d, e);
};
THREE.LensFlare.prototype = Object.create(THREE.Object3D.prototype);
THREE.LensFlare.prototype.add = function (a, b, c, d, e, f) {
  void 0 === b && (b = -1);
  void 0 === c && (c = 0);
  void 0 === f && (f = 1);
  void 0 === e && (e = new THREE.Color(16777215));
  void 0 === d && (d = THREE.NormalBlending);
  c = Math.min(c, Math.max(0, c));
  this.lensFlares.push({
    texture: a,
    size: b,
    distance: c,
    x: 0,
    y: 0,
    z: 0,
    scale: 1,
    rotation: 1,
    opacity: f,
    color: e,
    blending: d,
  });
};
THREE.LensFlare.prototype.updateLensFlares = function () {
  var a,
    b = this.lensFlares.length,
    c,
    d = 2 * -this.positionScreen.x,
    e = 2 * -this.positionScreen.y;
  for (a = 0; a < b; a++)
    (c = this.lensFlares[a]),
      (c.x = this.positionScreen.x + d * c.distance),
      (c.y = this.positionScreen.y + e * c.distance),
      (c.wantedRotation = 0.25 * c.x * Math.PI),
      (c.rotation += 0.25 * (c.wantedRotation - c.rotation));
};
THREE.MorphBlendMesh = function (a, b) {
  THREE.Mesh.call(this, a, b);
  this.animationsMap = {};
  this.animationsList = [];
  var c = this.geometry.morphTargets.length;
  this.createAnimation("__default", 0, c - 1, c / 1);
  this.setAnimationWeight("__default", 1);
};
THREE.MorphBlendMesh.prototype = Object.create(THREE.Mesh.prototype);
THREE.MorphBlendMesh.prototype.createAnimation = function (a, b, c, d) {
  b = {
    startFrame: b,
    endFrame: c,
    length: c - b + 1,
    fps: d,
    duration: (c - b) / d,
    lastFrame: 0,
    currentFrame: 0,
    active: !1,
    time: 0,
    direction: 1,
    weight: 1,
    directionBackwards: !1,
    mirroredLoop: !1,
  };
  this.animationsMap[a] = b;
  this.animationsList.push(b);
};
THREE.MorphBlendMesh.prototype.autoCreateAnimations = function (a) {
  for (
    var b = /([a-z]+)(\d+)/,
      c,
      d = {},
      e = this.geometry,
      f = 0,
      h = e.morphTargets.length;
    f < h;
    f++
  ) {
    var g = e.morphTargets[f].name.match(b);
    if (g && 1 < g.length) {
      var i = g[1];
      d[i] || (d[i] = { start: Infinity, end: -Infinity });
      g = d[i];
      f < g.start && (g.start = f);
      f > g.end && (g.end = f);
      c || (c = i);
    }
  }
  for (i in d) (g = d[i]), this.createAnimation(i, g.start, g.end, a);
  this.firstAnimation = c;
};
THREE.MorphBlendMesh.prototype.setAnimationDirectionForward = function (a) {
  if ((a = this.animationsMap[a]))
    (a.direction = 1), (a.directionBackwards = !1);
};
THREE.MorphBlendMesh.prototype.setAnimationDirectionBackward = function (a) {
  if ((a = this.animationsMap[a]))
    (a.direction = -1), (a.directionBackwards = !0);
};
THREE.MorphBlendMesh.prototype.setAnimationFPS = function (a, b) {
  var c = this.animationsMap[a];
  c && ((c.fps = b), (c.duration = (c.end - c.start) / c.fps));
};
THREE.MorphBlendMesh.prototype.setAnimationDuration = function (a, b) {
  var c = this.animationsMap[a];
  c && ((c.duration = b), (c.fps = (c.end - c.start) / c.duration));
};
THREE.MorphBlendMesh.prototype.setAnimationWeight = function (a, b) {
  var c = this.animationsMap[a];
  c && (c.weight = b);
};
THREE.MorphBlendMesh.prototype.setAnimationTime = function (a, b) {
  var c = this.animationsMap[a];
  c && (c.time = b);
};
THREE.MorphBlendMesh.prototype.getAnimationTime = function (a) {
  var b = 0;
  if ((a = this.animationsMap[a])) b = a.time;
  return b;
};
THREE.MorphBlendMesh.prototype.getAnimationDuration = function (a) {
  var b = -1;
  if ((a = this.animationsMap[a])) b = a.duration;
  return b;
};
THREE.MorphBlendMesh.prototype.playAnimation = function (a) {
  var b = this.animationsMap[a];
  b
    ? ((b.time = 0), (b.active = !0))
    : console.warn("animation[" + a + "] undefined");
};
THREE.MorphBlendMesh.prototype.stopAnimation = function (a) {
  if ((a = this.animationsMap[a])) a.active = !1;
};
THREE.MorphBlendMesh.prototype.update = function (a) {
  for (var b = 0, c = this.animationsList.length; b < c; b++) {
    var d = this.animationsList[b];
    if (d.active) {
      var e = d.duration / d.length;
      d.time += d.direction * a;
      if (d.mirroredLoop) {
        if (d.time > d.duration || 0 > d.time)
          (d.direction *= -1),
            d.time > d.duration &&
              ((d.time = d.duration), (d.directionBackwards = !0)),
            0 > d.time && ((d.time = 0), (d.directionBackwards = !1));
      } else (d.time %= d.duration), 0 > d.time && (d.time += d.duration);
      var f =
          d.startFrame +
          THREE.Math.clamp(Math.floor(d.time / e), 0, d.length - 1),
        h = d.weight;
      f !== d.currentFrame &&
        ((this.morphTargetInfluences[d.lastFrame] = 0),
        (this.morphTargetInfluences[d.currentFrame] = 1 * h),
        (this.morphTargetInfluences[f] = 0),
        (d.lastFrame = d.currentFrame),
        (d.currentFrame = f));
      e = (d.time % e) / e;
      d.directionBackwards && (e = 1 - e);
      this.morphTargetInfluences[d.currentFrame] = e * h;
      this.morphTargetInfluences[d.lastFrame] = (1 - e) * h;
    }
  }
};
THREE.LensFlarePlugin = function () {
  function a(a, c) {
    var d = b.createProgram(),
      e = b.createShader(b.FRAGMENT_SHADER),
      f = b.createShader(b.VERTEX_SHADER),
      g = "precision " + c + " float;\n";
    b.shaderSource(e, g + a.fragmentShader);
    b.shaderSource(f, g + a.vertexShader);
    b.compileShader(e);
    b.compileShader(f);
    b.attachShader(d, e);
    b.attachShader(d, f);
    b.linkProgram(d);
    return d;
  }
  var b, c, d, e, f, h, g, i, k, m, l, p, s;
  this.init = function (t) {
    b = t.context;
    c = t;
    d = t.getPrecision();
    e = new Float32Array(16);
    f = new Uint16Array(6);
    t = 0;
    e[t++] = -1;
    e[t++] = -1;
    e[t++] = 0;
    e[t++] = 0;
    e[t++] = 1;
    e[t++] = -1;
    e[t++] = 1;
    e[t++] = 0;
    e[t++] = 1;
    e[t++] = 1;
    e[t++] = 1;
    e[t++] = 1;
    e[t++] = -1;
    e[t++] = 1;
    e[t++] = 0;
    e[t++] = 1;
    t = 0;
    f[t++] = 0;
    f[t++] = 1;
    f[t++] = 2;
    f[t++] = 0;
    f[t++] = 2;
    f[t++] = 3;
    h = b.createBuffer();
    g = b.createBuffer();
    b.bindBuffer(b.ARRAY_BUFFER, h);
    b.bufferData(b.ARRAY_BUFFER, e, b.STATIC_DRAW);
    b.bindBuffer(b.ELEMENT_ARRAY_BUFFER, g);
    b.bufferData(b.ELEMENT_ARRAY_BUFFER, f, b.STATIC_DRAW);
    i = b.createTexture();
    k = b.createTexture();
    b.bindTexture(b.TEXTURE_2D, i);
    b.texImage2D(
      b.TEXTURE_2D,
      0,
      b.RGB,
      16,
      16,
      0,
      b.RGB,
      b.UNSIGNED_BYTE,
      null
    );
    b.texParameteri(b.TEXTURE_2D, b.TEXTURE_WRAP_S, b.CLAMP_TO_EDGE);
    b.texParameteri(b.TEXTURE_2D, b.TEXTURE_WRAP_T, b.CLAMP_TO_EDGE);
    b.texParameteri(b.TEXTURE_2D, b.TEXTURE_MAG_FILTER, b.NEAREST);
    b.texParameteri(b.TEXTURE_2D, b.TEXTURE_MIN_FILTER, b.NEAREST);
    b.bindTexture(b.TEXTURE_2D, k);
    b.texImage2D(
      b.TEXTURE_2D,
      0,
      b.RGBA,
      16,
      16,
      0,
      b.RGBA,
      b.UNSIGNED_BYTE,
      null
    );
    b.texParameteri(b.TEXTURE_2D, b.TEXTURE_WRAP_S, b.CLAMP_TO_EDGE);
    b.texParameteri(b.TEXTURE_2D, b.TEXTURE_WRAP_T, b.CLAMP_TO_EDGE);
    b.texParameteri(b.TEXTURE_2D, b.TEXTURE_MAG_FILTER, b.NEAREST);
    b.texParameteri(b.TEXTURE_2D, b.TEXTURE_MIN_FILTER, b.NEAREST);
    0 >= b.getParameter(b.MAX_VERTEX_TEXTURE_IMAGE_UNITS)
      ? ((m = !1), (l = a(THREE.ShaderFlares.lensFlare, d)))
      : ((m = !0), (l = a(THREE.ShaderFlares.lensFlareVertexTexture, d)));
    p = {};
    s = {};
    p.vertex = b.getAttribLocation(l, "position");
    p.uv = b.getAttribLocation(l, "uv");
    s.renderType = b.getUniformLocation(l, "renderType");
    s.map = b.getUniformLocation(l, "map");
    s.occlusionMap = b.getUniformLocation(l, "occlusionMap");
    s.opacity = b.getUniformLocation(l, "opacity");
    s.color = b.getUniformLocation(l, "color");
    s.scale = b.getUniformLocation(l, "scale");
    s.rotation = b.getUniformLocation(l, "rotation");
    s.screenPosition = b.getUniformLocation(l, "screenPosition");
  };
  this.render = function (a, d, e, f) {
    var a = a.__webglFlares,
      u = a.length;
    if (u) {
      var w = new THREE.Vector3(),
        z = f / e,
        B = 0.5 * e,
        D = 0.5 * f,
        x = 16 / f,
        F = new THREE.Vector2(x * z, x),
        A = new THREE.Vector3(1, 1, 0),
        O = new THREE.Vector2(1, 1),
        C = s,
        x = p;
      b.useProgram(l);
      b.enableVertexAttribArray(p.vertex);
      b.enableVertexAttribArray(p.uv);
      b.uniform1i(C.occlusionMap, 0);
      b.uniform1i(C.map, 1);
      b.bindBuffer(b.ARRAY_BUFFER, h);
      b.vertexAttribPointer(x.vertex, 2, b.FLOAT, !1, 16, 0);
      b.vertexAttribPointer(x.uv, 2, b.FLOAT, !1, 16, 8);
      b.bindBuffer(b.ELEMENT_ARRAY_BUFFER, g);
      b.disable(b.CULL_FACE);
      b.depthMask(!1);
      var E, I, y, v, G;
      for (E = 0; E < u; E++)
        if (
          ((x = 16 / f),
          F.set(x * z, x),
          (v = a[E]),
          w.set(
            v.matrixWorld.elements[12],
            v.matrixWorld.elements[13],
            v.matrixWorld.elements[14]
          ),
          w.applyMatrix4(d.matrixWorldInverse),
          w.applyProjection(d.projectionMatrix),
          A.copy(w),
          (O.x = A.x * B + B),
          (O.y = A.y * D + D),
          m || (0 < O.x && O.x < e && 0 < O.y && O.y < f))
        ) {
          b.activeTexture(b.TEXTURE1);
          b.bindTexture(b.TEXTURE_2D, i);
          b.copyTexImage2D(b.TEXTURE_2D, 0, b.RGB, O.x - 8, O.y - 8, 16, 16, 0);
          b.uniform1i(C.renderType, 0);
          b.uniform2f(C.scale, F.x, F.y);
          b.uniform3f(C.screenPosition, A.x, A.y, A.z);
          b.disable(b.BLEND);
          b.enable(b.DEPTH_TEST);
          b.drawElements(b.TRIANGLES, 6, b.UNSIGNED_SHORT, 0);
          b.activeTexture(b.TEXTURE0);
          b.bindTexture(b.TEXTURE_2D, k);
          b.copyTexImage2D(
            b.TEXTURE_2D,
            0,
            b.RGBA,
            O.x - 8,
            O.y - 8,
            16,
            16,
            0
          );
          b.uniform1i(C.renderType, 1);
          b.disable(b.DEPTH_TEST);
          b.activeTexture(b.TEXTURE1);
          b.bindTexture(b.TEXTURE_2D, i);
          b.drawElements(b.TRIANGLES, 6, b.UNSIGNED_SHORT, 0);
          v.positionScreen.copy(A);
          v.customUpdateCallback
            ? v.customUpdateCallback(v)
            : v.updateLensFlares();
          b.uniform1i(C.renderType, 2);
          b.enable(b.BLEND);
          I = 0;
          for (y = v.lensFlares.length; I < y; I++)
            (G = v.lensFlares[I]),
              0.001 < G.opacity &&
                0.001 < G.scale &&
                ((A.x = G.x),
                (A.y = G.y),
                (A.z = G.z),
                (x = (G.size * G.scale) / f),
                (F.x = x * z),
                (F.y = x),
                b.uniform3f(C.screenPosition, A.x, A.y, A.z),
                b.uniform2f(C.scale, F.x, F.y),
                b.uniform1f(C.rotation, G.rotation),
                b.uniform1f(C.opacity, G.opacity),
                b.uniform3f(C.color, G.color.r, G.color.g, G.color.b),
                c.setBlending(
                  G.blending,
                  G.blendEquation,
                  G.blendSrc,
                  G.blendDst
                ),
                c.setTexture(G.texture, 1),
                b.drawElements(b.TRIANGLES, 6, b.UNSIGNED_SHORT, 0));
        }
      b.enable(b.CULL_FACE);
      b.enable(b.DEPTH_TEST);
      b.depthMask(!0);
    }
  };
};
THREE.ShadowMapPlugin = function () {
  var a,
    b,
    c,
    d,
    e,
    f,
    h = new THREE.Frustum(),
    g = new THREE.Matrix4(),
    i = new THREE.Vector3(),
    k = new THREE.Vector3(),
    m = new THREE.Vector3();
  this.init = function (g) {
    a = g.context;
    b = g;
    var g = THREE.ShaderLib.depthRGBA,
      h = THREE.UniformsUtils.clone(g.uniforms);
    c = new THREE.ShaderMaterial({
      fragmentShader: g.fragmentShader,
      vertexShader: g.vertexShader,
      uniforms: h,
    });
    d = new THREE.ShaderMaterial({
      fragmentShader: g.fragmentShader,
      vertexShader: g.vertexShader,
      uniforms: h,
      morphTargets: !0,
    });
    e = new THREE.ShaderMaterial({
      fragmentShader: g.fragmentShader,
      vertexShader: g.vertexShader,
      uniforms: h,
      skinning: !0,
    });
    f = new THREE.ShaderMaterial({
      fragmentShader: g.fragmentShader,
      vertexShader: g.vertexShader,
      uniforms: h,
      morphTargets: !0,
      skinning: !0,
    });
    c._shadowPass = !0;
    d._shadowPass = !0;
    e._shadowPass = !0;
    f._shadowPass = !0;
  };
  this.render = function (a, c) {
    b.shadowMapEnabled && b.shadowMapAutoUpdate && this.update(a, c);
  };
  this.update = function (l, p) {
    var s,
      t,
      n,
      r,
      q,
      u,
      w,
      z,
      B,
      D = [];
    r = 0;
    a.clearColor(1, 1, 1, 1);
    a.disable(a.BLEND);
    a.enable(a.CULL_FACE);
    a.frontFace(a.CCW);
    b.shadowMapCullFace === THREE.CullFaceFront
      ? a.cullFace(a.FRONT)
      : a.cullFace(a.BACK);
    b.setDepthTest(!0);
    s = 0;
    for (t = l.__lights.length; s < t; s++)
      if (((n = l.__lights[s]), n.castShadow))
        if (n instanceof THREE.DirectionalLight && n.shadowCascade)
          for (q = 0; q < n.shadowCascadeCount; q++) {
            var x;
            if (n.shadowCascadeArray[q]) x = n.shadowCascadeArray[q];
            else {
              B = n;
              w = q;
              x = new THREE.DirectionalLight();
              x.isVirtual = !0;
              x.onlyShadow = !0;
              x.castShadow = !0;
              x.shadowCameraNear = B.shadowCameraNear;
              x.shadowCameraFar = B.shadowCameraFar;
              x.shadowCameraLeft = B.shadowCameraLeft;
              x.shadowCameraRight = B.shadowCameraRight;
              x.shadowCameraBottom = B.shadowCameraBottom;
              x.shadowCameraTop = B.shadowCameraTop;
              x.shadowCameraVisible = B.shadowCameraVisible;
              x.shadowDarkness = B.shadowDarkness;
              x.shadowBias = B.shadowCascadeBias[w];
              x.shadowMapWidth = B.shadowCascadeWidth[w];
              x.shadowMapHeight = B.shadowCascadeHeight[w];
              x.pointsWorld = [];
              x.pointsFrustum = [];
              z = x.pointsWorld;
              u = x.pointsFrustum;
              for (var F = 0; 8 > F; F++)
                (z[F] = new THREE.Vector3()), (u[F] = new THREE.Vector3());
              z = B.shadowCascadeNearZ[w];
              B = B.shadowCascadeFarZ[w];
              u[0].set(-1, -1, z);
              u[1].set(1, -1, z);
              u[2].set(-1, 1, z);
              u[3].set(1, 1, z);
              u[4].set(-1, -1, B);
              u[5].set(1, -1, B);
              u[6].set(-1, 1, B);
              u[7].set(1, 1, B);
              x.originalCamera = p;
              u = new THREE.Gyroscope();
              u.position = n.shadowCascadeOffset;
              u.add(x);
              u.add(x.target);
              p.add(u);
              n.shadowCascadeArray[q] = x;
              console.log("Created virtualLight", x);
            }
            w = n;
            z = q;
            B = w.shadowCascadeArray[z];
            B.position.copy(w.position);
            B.target.position.copy(w.target.position);
            B.lookAt(B.target);
            B.shadowCameraVisible = w.shadowCameraVisible;
            B.shadowDarkness = w.shadowDarkness;
            B.shadowBias = w.shadowCascadeBias[z];
            u = w.shadowCascadeNearZ[z];
            w = w.shadowCascadeFarZ[z];
            B = B.pointsFrustum;
            B[0].z = u;
            B[1].z = u;
            B[2].z = u;
            B[3].z = u;
            B[4].z = w;
            B[5].z = w;
            B[6].z = w;
            B[7].z = w;
            D[r] = x;
            r++;
          }
        else (D[r] = n), r++;
    s = 0;
    for (t = D.length; s < t; s++) {
      n = D[s];
      n.shadowMap ||
        ((q = THREE.LinearFilter),
        b.shadowMapType === THREE.PCFSoftShadowMap && (q = THREE.NearestFilter),
        (n.shadowMap = new THREE.WebGLRenderTarget(
          n.shadowMapWidth,
          n.shadowMapHeight,
          { minFilter: q, magFilter: q, format: THREE.RGBAFormat }
        )),
        (n.shadowMapSize = new THREE.Vector2(
          n.shadowMapWidth,
          n.shadowMapHeight
        )),
        (n.shadowMatrix = new THREE.Matrix4()));
      if (!n.shadowCamera) {
        if (n instanceof THREE.SpotLight)
          n.shadowCamera = new THREE.PerspectiveCamera(
            n.shadowCameraFov,
            n.shadowMapWidth / n.shadowMapHeight,
            n.shadowCameraNear,
            n.shadowCameraFar
          );
        else if (n instanceof THREE.DirectionalLight)
          n.shadowCamera = new THREE.OrthographicCamera(
            n.shadowCameraLeft,
            n.shadowCameraRight,
            n.shadowCameraTop,
            n.shadowCameraBottom,
            n.shadowCameraNear,
            n.shadowCameraFar
          );
        else {
          console.error("Unsupported light type for shadow");
          continue;
        }
        l.add(n.shadowCamera);
        !0 === l.autoUpdate && l.updateMatrixWorld();
      }
      n.shadowCameraVisible &&
        !n.cameraHelper &&
        ((n.cameraHelper = new THREE.CameraHelper(n.shadowCamera)),
        n.shadowCamera.add(n.cameraHelper));
      if (n.isVirtual && x.originalCamera == p) {
        q = p;
        r = n.shadowCamera;
        u = n.pointsFrustum;
        B = n.pointsWorld;
        i.set(Infinity, Infinity, Infinity);
        k.set(-Infinity, -Infinity, -Infinity);
        for (w = 0; 8 > w; w++)
          (z = B[w]),
            z.copy(u[w]),
            THREE.ShadowMapPlugin.__projector.unprojectVector(z, q),
            z.applyMatrix4(r.matrixWorldInverse),
            z.x < i.x && (i.x = z.x),
            z.x > k.x && (k.x = z.x),
            z.y < i.y && (i.y = z.y),
            z.y > k.y && (k.y = z.y),
            z.z < i.z && (i.z = z.z),
            z.z > k.z && (k.z = z.z);
        r.left = i.x;
        r.right = k.x;
        r.top = k.y;
        r.bottom = i.y;
        r.updateProjectionMatrix();
      }
      r = n.shadowMap;
      u = n.shadowMatrix;
      q = n.shadowCamera;
      q.position.getPositionFromMatrix(n.matrixWorld);
      m.getPositionFromMatrix(n.target.matrixWorld);
      q.lookAt(m);
      q.updateMatrixWorld();
      q.matrixWorldInverse.getInverse(q.matrixWorld);
      n.cameraHelper && (n.cameraHelper.visible = n.shadowCameraVisible);
      n.shadowCameraVisible && n.cameraHelper.update();
      u.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      u.multiply(q.projectionMatrix);
      u.multiply(q.matrixWorldInverse);
      g.multiplyMatrices(q.projectionMatrix, q.matrixWorldInverse);
      h.setFromMatrix(g);
      b.setRenderTarget(r);
      b.clear();
      B = l.__webglObjects;
      n = 0;
      for (r = B.length; n < r; n++)
        if (
          ((w = B[n]),
          (u = w.object),
          (w.render = !1),
          u.visible &&
            u.castShadow &&
            (!(u instanceof THREE.Mesh || u instanceof THREE.ParticleSystem) ||
              !u.frustumCulled ||
              h.intersectsObject(u)))
        )
          u._modelViewMatrix.multiplyMatrices(
            q.matrixWorldInverse,
            u.matrixWorld
          ),
            (w.render = !0);
      n = 0;
      for (r = B.length; n < r; n++)
        (w = B[n]),
          w.render &&
            ((u = w.object),
            (w = w.buffer),
            (F =
              u.material instanceof THREE.MeshFaceMaterial
                ? u.material.materials[0]
                : u.material),
            (z = 0 < u.geometry.morphTargets.length && F.morphTargets),
            (F = u instanceof THREE.SkinnedMesh && F.skinning),
            (z = u.customDepthMaterial
              ? u.customDepthMaterial
              : F
              ? z
                ? f
                : e
              : z
              ? d
              : c),
            w instanceof THREE.BufferGeometry
              ? b.renderBufferDirect(q, l.__lights, null, z, w, u)
              : b.renderBuffer(q, l.__lights, null, z, w, u));
      B = l.__webglObjectsImmediate;
      n = 0;
      for (r = B.length; n < r; n++)
        (w = B[n]),
          (u = w.object),
          u.visible &&
            u.castShadow &&
            (u._modelViewMatrix.multiplyMatrices(
              q.matrixWorldInverse,
              u.matrixWorld
            ),
            b.renderImmediateObject(q, l.__lights, null, c, u));
    }
    s = b.getClearColor();
    t = b.getClearAlpha();
    a.clearColor(s.r, s.g, s.b, t);
    a.enable(a.BLEND);
    b.shadowMapCullFace === THREE.CullFaceFront && a.cullFace(a.BACK);
  };
};
THREE.ShadowMapPlugin.__projector = new THREE.Projector();
THREE.SpritePlugin = function () {
  function a(a, b) {
    return a.z !== b.z ? b.z - a.z : b.id - a.id;
  }
  var b, c, d, e, f, h, g, i, k, m;
  this.init = function (a) {
    b = a.context;
    c = a;
    d = a.getPrecision();
    e = new Float32Array(16);
    f = new Uint16Array(6);
    a = 0;
    e[a++] = -0.5;
    e[a++] = -0.5;
    e[a++] = 0;
    e[a++] = 0;
    e[a++] = 0.5;
    e[a++] = -0.5;
    e[a++] = 1;
    e[a++] = 0;
    e[a++] = 0.5;
    e[a++] = 0.5;
    e[a++] = 1;
    e[a++] = 1;
    e[a++] = -0.5;
    e[a++] = 0.5;
    e[a++] = 0;
    e[a++] = 1;
    a = 0;
    f[a++] = 0;
    f[a++] = 1;
    f[a++] = 2;
    f[a++] = 0;
    f[a++] = 2;
    f[a++] = 3;
    h = b.createBuffer();
    g = b.createBuffer();
    b.bindBuffer(b.ARRAY_BUFFER, h);
    b.bufferData(b.ARRAY_BUFFER, e, b.STATIC_DRAW);
    b.bindBuffer(b.ELEMENT_ARRAY_BUFFER, g);
    b.bufferData(b.ELEMENT_ARRAY_BUFFER, f, b.STATIC_DRAW);
    var a = THREE.ShaderSprite.sprite,
      p = b.createProgram(),
      s = b.createShader(b.FRAGMENT_SHADER),
      t = b.createShader(b.VERTEX_SHADER),
      n = "precision " + d + " float;\n";
    b.shaderSource(s, n + a.fragmentShader);
    b.shaderSource(t, n + a.vertexShader);
    b.compileShader(s);
    b.compileShader(t);
    b.attachShader(p, s);
    b.attachShader(p, t);
    b.linkProgram(p);
    i = p;
    k = {};
    m = {};
    k.position = b.getAttribLocation(i, "position");
    k.uv = b.getAttribLocation(i, "uv");
    m.uvOffset = b.getUniformLocation(i, "uvOffset");
    m.uvScale = b.getUniformLocation(i, "uvScale");
    m.rotation = b.getUniformLocation(i, "rotation");
    m.scale = b.getUniformLocation(i, "scale");
    m.alignment = b.getUniformLocation(i, "alignment");
    m.halfViewport = b.getUniformLocation(i, "halfViewport");
    m.color = b.getUniformLocation(i, "color");
    m.map = b.getUniformLocation(i, "map");
    m.opacity = b.getUniformLocation(i, "opacity");
    m.useScreenCoordinates = b.getUniformLocation(i, "useScreenCoordinates");
    m.sizeAttenuation = b.getUniformLocation(i, "sizeAttenuation");
    m.screenPosition = b.getUniformLocation(i, "screenPosition");
    m.modelViewMatrix = b.getUniformLocation(i, "modelViewMatrix");
    m.projectionMatrix = b.getUniformLocation(i, "projectionMatrix");
    m.fogType = b.getUniformLocation(i, "fogType");
    m.fogDensity = b.getUniformLocation(i, "fogDensity");
    m.fogNear = b.getUniformLocation(i, "fogNear");
    m.fogFar = b.getUniformLocation(i, "fogFar");
    m.fogColor = b.getUniformLocation(i, "fogColor");
    m.alphaTest = b.getUniformLocation(i, "alphaTest");
  };
  this.render = function (d, e, f, t) {
    var n = d.__webglSprites,
      r = n.length;
    if (r) {
      var q = k,
        u = m,
        f = 0.5 * f,
        t = 0.5 * t;
      b.useProgram(i);
      b.enableVertexAttribArray(q.position);
      b.enableVertexAttribArray(q.uv);
      b.disable(b.CULL_FACE);
      b.enable(b.BLEND);
      b.bindBuffer(b.ARRAY_BUFFER, h);
      b.vertexAttribPointer(q.position, 2, b.FLOAT, !1, 16, 0);
      b.vertexAttribPointer(q.uv, 2, b.FLOAT, !1, 16, 8);
      b.bindBuffer(b.ELEMENT_ARRAY_BUFFER, g);
      b.uniformMatrix4fv(u.projectionMatrix, !1, e.projectionMatrix.elements);
      b.activeTexture(b.TEXTURE0);
      b.uniform1i(u.map, 0);
      var w = (q = 0),
        z = d.fog;
      z
        ? (b.uniform3f(u.fogColor, z.color.r, z.color.g, z.color.b),
          z instanceof THREE.Fog
            ? (b.uniform1f(u.fogNear, z.near),
              b.uniform1f(u.fogFar, z.far),
              b.uniform1i(u.fogType, 1),
              (w = q = 1))
            : z instanceof THREE.FogExp2 &&
              (b.uniform1f(u.fogDensity, z.density),
              b.uniform1i(u.fogType, 2),
              (w = q = 2)))
        : (b.uniform1i(u.fogType, 0), (w = q = 0));
      for (var B, D, x = [], z = 0; z < r; z++)
        (B = n[z]),
          (D = B.material),
          B.visible &&
            0 !== D.opacity &&
            (D.useScreenCoordinates
              ? (B.z = -B.position.z)
              : (B._modelViewMatrix.multiplyMatrices(
                  e.matrixWorldInverse,
                  B.matrixWorld
                ),
                (B.z = -B._modelViewMatrix.elements[14])));
      n.sort(a);
      for (z = 0; z < r; z++)
        (B = n[z]),
          (D = B.material),
          B.visible &&
            0 !== D.opacity &&
            D.map &&
            D.map.image &&
            D.map.image.width &&
            (b.uniform1f(u.alphaTest, D.alphaTest),
            !0 === D.useScreenCoordinates
              ? (b.uniform1i(u.useScreenCoordinates, 1),
                b.uniform3f(
                  u.screenPosition,
                  (B.position.x * c.devicePixelRatio - f) / f,
                  (t - B.position.y * c.devicePixelRatio) / t,
                  Math.max(0, Math.min(1, B.position.z))
                ),
                (x[0] = c.devicePixelRatio * B.scale.x),
                (x[1] = c.devicePixelRatio * B.scale.y))
              : (b.uniform1i(u.useScreenCoordinates, 0),
                b.uniform1i(u.sizeAttenuation, D.sizeAttenuation ? 1 : 0),
                b.uniformMatrix4fv(
                  u.modelViewMatrix,
                  !1,
                  B._modelViewMatrix.elements
                ),
                (x[0] = B.scale.x),
                (x[1] = B.scale.y)),
            (e = d.fog && D.fog ? w : 0),
            q !== e && (b.uniform1i(u.fogType, e), (q = e)),
            b.uniform2f(u.uvScale, D.uvScale.x, D.uvScale.y),
            b.uniform2f(u.uvOffset, D.uvOffset.x, D.uvOffset.y),
            b.uniform2f(u.alignment, D.alignment.x, D.alignment.y),
            b.uniform1f(u.opacity, D.opacity),
            b.uniform3f(u.color, D.color.r, D.color.g, D.color.b),
            b.uniform1f(u.rotation, B.rotation),
            b.uniform2fv(u.scale, x),
            b.uniform2f(u.halfViewport, f, t),
            c.setBlending(D.blending, D.blendEquation, D.blendSrc, D.blendDst),
            c.setDepthTest(D.depthTest),
            c.setDepthWrite(D.depthWrite),
            c.setTexture(D.map, 0),
            b.drawElements(b.TRIANGLES, 6, b.UNSIGNED_SHORT, 0));
      b.enable(b.CULL_FACE);
    }
  };
};
THREE.DepthPassPlugin = function () {
  this.enabled = !1;
  this.renderTarget = null;
  var a,
    b,
    c,
    d,
    e,
    f,
    h = new THREE.Frustum(),
    g = new THREE.Matrix4();
  this.init = function (g) {
    a = g.context;
    b = g;
    var g = THREE.ShaderLib.depthRGBA,
      h = THREE.UniformsUtils.clone(g.uniforms);
    c = new THREE.ShaderMaterial({
      fragmentShader: g.fragmentShader,
      vertexShader: g.vertexShader,
      uniforms: h,
    });
    d = new THREE.ShaderMaterial({
      fragmentShader: g.fragmentShader,
      vertexShader: g.vertexShader,
      uniforms: h,
      morphTargets: !0,
    });
    e = new THREE.ShaderMaterial({
      fragmentShader: g.fragmentShader,
      vertexShader: g.vertexShader,
      uniforms: h,
      skinning: !0,
    });
    f = new THREE.ShaderMaterial({
      fragmentShader: g.fragmentShader,
      vertexShader: g.vertexShader,
      uniforms: h,
      morphTargets: !0,
      skinning: !0,
    });
    c._shadowPass = !0;
    d._shadowPass = !0;
    e._shadowPass = !0;
    f._shadowPass = !0;
  };
  this.render = function (a, b) {
    this.enabled && this.update(a, b);
  };
  this.update = function (i, k) {
    var m, l, p, s, t, n;
    a.clearColor(1, 1, 1, 1);
    a.disable(a.BLEND);
    b.setDepthTest(!0);
    !0 === i.autoUpdate && i.updateMatrixWorld();
    k.matrixWorldInverse.getInverse(k.matrixWorld);
    g.multiplyMatrices(k.projectionMatrix, k.matrixWorldInverse);
    h.setFromMatrix(g);
    b.setRenderTarget(this.renderTarget);
    b.clear();
    n = i.__webglObjects;
    m = 0;
    for (l = n.length; m < l; m++)
      if (
        ((p = n[m]),
        (t = p.object),
        (p.render = !1),
        t.visible &&
          (!(t instanceof THREE.Mesh || t instanceof THREE.ParticleSystem) ||
            !t.frustumCulled ||
            h.intersectsObject(t)))
      )
        t._modelViewMatrix.multiplyMatrices(
          k.matrixWorldInverse,
          t.matrixWorld
        ),
          (p.render = !0);
    var r;
    m = 0;
    for (l = n.length; m < l; m++)
      if (
        ((p = n[m]),
        p.render &&
          ((t = p.object),
          (p = p.buffer),
          !(t instanceof THREE.ParticleSystem) || t.customDepthMaterial))
      )
        (r =
          t.material instanceof THREE.MeshFaceMaterial
            ? t.material.materials[0]
            : t.material) && b.setMaterialFaces(t.material),
          (s = 0 < t.geometry.morphTargets.length && r.morphTargets),
          (r = t instanceof THREE.SkinnedMesh && r.skinning),
          (s = t.customDepthMaterial
            ? t.customDepthMaterial
            : r
            ? s
              ? f
              : e
            : s
            ? d
            : c),
          p instanceof THREE.BufferGeometry
            ? b.renderBufferDirect(k, i.__lights, null, s, p, t)
            : b.renderBuffer(k, i.__lights, null, s, p, t);
    n = i.__webglObjectsImmediate;
    m = 0;
    for (l = n.length; m < l; m++)
      (p = n[m]),
        (t = p.object),
        t.visible &&
          (t._modelViewMatrix.multiplyMatrices(
            k.matrixWorldInverse,
            t.matrixWorld
          ),
          b.renderImmediateObject(k, i.__lights, null, c, t));
    m = b.getClearColor();
    l = b.getClearAlpha();
    a.clearColor(m.r, m.g, m.b, l);
    a.enable(a.BLEND);
  };
};
THREE.ShaderFlares = {
  lensFlareVertexTexture: {
    vertexShader:
      "uniform lowp int renderType;\nuniform vec3 screenPosition;\nuniform vec2 scale;\nuniform float rotation;\nuniform sampler2D occlusionMap;\nattribute vec2 position;\nattribute vec2 uv;\nvarying vec2 vUV;\nvarying float vVisibility;\nvoid main() {\nvUV = uv;\nvec2 pos = position;\nif( renderType == 2 ) {\nvec4 visibility = texture2D( occlusionMap, vec2( 0.1, 0.1 ) );\nvisibility += texture2D( occlusionMap, vec2( 0.5, 0.1 ) );\nvisibility += texture2D( occlusionMap, vec2( 0.9, 0.1 ) );\nvisibility += texture2D( occlusionMap, vec2( 0.9, 0.5 ) );\nvisibility += texture2D( occlusionMap, vec2( 0.9, 0.9 ) );\nvisibility += texture2D( occlusionMap, vec2( 0.5, 0.9 ) );\nvisibility += texture2D( occlusionMap, vec2( 0.1, 0.9 ) );\nvisibility += texture2D( occlusionMap, vec2( 0.1, 0.5 ) );\nvisibility += texture2D( occlusionMap, vec2( 0.5, 0.5 ) );\nvVisibility =        visibility.r / 9.0;\nvVisibility *= 1.0 - visibility.g / 9.0;\nvVisibility *=       visibility.b / 9.0;\nvVisibility *= 1.0 - visibility.a / 9.0;\npos.x = cos( rotation ) * position.x - sin( rotation ) * position.y;\npos.y = sin( rotation ) * position.x + cos( rotation ) * position.y;\n}\ngl_Position = vec4( ( pos * scale + screenPosition.xy ).xy, screenPosition.z, 1.0 );\n}",
    fragmentShader:
      "uniform lowp int renderType;\nuniform sampler2D map;\nuniform float opacity;\nuniform vec3 color;\nvarying vec2 vUV;\nvarying float vVisibility;\nvoid main() {\nif( renderType == 0 ) {\ngl_FragColor = vec4( 1.0, 0.0, 1.0, 0.0 );\n} else if( renderType == 1 ) {\ngl_FragColor = texture2D( map, vUV );\n} else {\nvec4 texture = texture2D( map, vUV );\ntexture.a *= opacity * vVisibility;\ngl_FragColor = texture;\ngl_FragColor.rgb *= color;\n}\n}",
  },
  lensFlare: {
    vertexShader:
      "uniform lowp int renderType;\nuniform vec3 screenPosition;\nuniform vec2 scale;\nuniform float rotation;\nattribute vec2 position;\nattribute vec2 uv;\nvarying vec2 vUV;\nvoid main() {\nvUV = uv;\nvec2 pos = position;\nif( renderType == 2 ) {\npos.x = cos( rotation ) * position.x - sin( rotation ) * position.y;\npos.y = sin( rotation ) * position.x + cos( rotation ) * position.y;\n}\ngl_Position = vec4( ( pos * scale + screenPosition.xy ).xy, screenPosition.z, 1.0 );\n}",
    fragmentShader:
      "precision mediump float;\nuniform lowp int renderType;\nuniform sampler2D map;\nuniform sampler2D occlusionMap;\nuniform float opacity;\nuniform vec3 color;\nvarying vec2 vUV;\nvoid main() {\nif( renderType == 0 ) {\ngl_FragColor = vec4( texture2D( map, vUV ).rgb, 0.0 );\n} else if( renderType == 1 ) {\ngl_FragColor = texture2D( map, vUV );\n} else {\nfloat visibility = texture2D( occlusionMap, vec2( 0.5, 0.1 ) ).a;\nvisibility += texture2D( occlusionMap, vec2( 0.9, 0.5 ) ).a;\nvisibility += texture2D( occlusionMap, vec2( 0.5, 0.9 ) ).a;\nvisibility += texture2D( occlusionMap, vec2( 0.1, 0.5 ) ).a;\nvisibility = ( 1.0 - visibility / 4.0 );\nvec4 texture = texture2D( map, vUV );\ntexture.a *= opacity * visibility;\ngl_FragColor = texture;\ngl_FragColor.rgb *= color;\n}\n}",
  },
};
THREE.ShaderSprite = {
  sprite: {
    vertexShader:
      "uniform int useScreenCoordinates;\nuniform int sizeAttenuation;\nuniform vec3 screenPosition;\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\nuniform float rotation;\nuniform vec2 scale;\nuniform vec2 alignment;\nuniform vec2 uvOffset;\nuniform vec2 uvScale;\nuniform vec2 halfViewport;\nattribute vec2 position;\nattribute vec2 uv;\nvarying vec2 vUV;\nvoid main() {\nvUV = uvOffset + uv * uvScale;\nvec2 alignedPosition = ( position + alignment ) * scale;\nvec2 rotatedPosition;\nrotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;\nrotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;\nvec4 finalPosition;\nif( useScreenCoordinates != 0 ) {\nfinalPosition = vec4( screenPosition.xy + ( rotatedPosition / halfViewport ), screenPosition.z, 1.0 );\n} else {\nfinalPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );\nfinalPosition.xy += rotatedPosition * ( sizeAttenuation == 1 ? 1.0 : finalPosition.z );\nfinalPosition = projectionMatrix * finalPosition;\n}\ngl_Position = finalPosition;\n}",
    fragmentShader:
      "uniform vec3 color;\nuniform sampler2D map;\nuniform float opacity;\nuniform int fogType;\nuniform vec3 fogColor;\nuniform float fogDensity;\nuniform float fogNear;\nuniform float fogFar;\nuniform float alphaTest;\nvarying vec2 vUV;\nvoid main() {\nvec4 texture = texture2D( map, vUV );\nif ( texture.a < alphaTest ) discard;\ngl_FragColor = vec4( color * texture.xyz, texture.a * opacity );\nif ( fogType > 0 ) {\nfloat depth = gl_FragCoord.z / gl_FragCoord.w;\nfloat fogFactor = 0.0;\nif ( fogType == 1 ) {\nfogFactor = smoothstep( fogNear, fogFar, depth );\n} else {\nconst float LOG2 = 1.442695;\nfloat fogFactor = exp2( - fogDensity * fogDensity * depth * depth * LOG2 );\nfogFactor = 1.0 - clamp( fogFactor, 0.0, 1.0 );\n}\ngl_FragColor = mix( gl_FragColor, vec4( fogColor, gl_FragColor.w ), fogFactor );\n}\n}",
  },
};
var Detector = {
  canvas: !!window.CanvasRenderingContext2D,
  webgl: (function () {
    try {
      return (
        !!window.WebGLRenderingContext &&
        !!document.createElement("canvas").getContext("experimental-webgl")
      );
    } catch (e) {
      return false;
    }
  })(),
  workers: !!window.Worker,
  fileapi: window.File && window.FileReader && window.FileList && window.Blob,
  getWebGLErrorMessage: function () {
    var element = document.createElement("div");
    element.id = "webgl-error-message";
    element.style.fontFamily = "monospace";
    element.style.fontSize = "13px";
    element.style.fontWeight = "normal";
    element.style.textAlign = "center";
    element.style.background = "#fff";
    element.style.color = "#000";
    element.style.padding = "1.5em";
    element.style.width = "400px";
    element.style.margin = "5em auto 0";
    if (!this.webgl) {
      element.innerHTML = window.WebGLRenderingContext
        ? [
            'Your graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br />',
            'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.',
          ].join("\n")
        : [
            'Your browser does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br/>',
            'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.',
          ].join("\n");
    }
    return element;
  },
  addGetWebGLMessage: function (parameters) {
    var parent, id, element;
    parameters = parameters || {};
    parent =
      parameters.parent !== undefined ? parameters.parent : document.body;
    id = parameters.id !== undefined ? parameters.id : "oldie";
    element = Detector.getWebGLErrorMessage();
    element.id = id;
    parent.appendChild(element);
  },
};
THREE.TrackballControls = function (object, domElement) {
  var _this = this;
  var STATE = {
    NONE: -1,
    ROTATE: 0,
    ZOOM: 1,
    PAN: 2,
    TOUCH_ROTATE: 3,
    TOUCH_ZOOM: 4,
    TOUCH_PAN: 5,
  };
  this.object = object;
  this.domElement = domElement !== undefined ? domElement : document;
  this.enabled = true;
  this.screen = { width: 0, height: 0, offsetLeft: 0, offsetTop: 0 };
  this.radius = (this.screen.width + this.screen.height) / 4;
  this.rotateSpeed = 1.0;
  this.zoomSpeed = 1.2;
  this.panSpeed = 0.3;
  this.noRotate = false;
  this.noZoom = false;
  this.noPan = false;
  this.staticMoving = false;
  this.dynamicDampingFactor = 0.2;
  this.minDistance = 0;
  this.maxDistance = Infinity;
  this.keys = [65, 83, 68];
  this.target = new THREE.Vector3();
  var lastPosition = new THREE.Vector3();
  var _state = STATE.NONE,
    _prevState = STATE.NONE,
    _eye = new THREE.Vector3(),
    _rotateStart = new THREE.Vector3(),
    _rotateEnd = new THREE.Vector3(),
    _zoomStart = new THREE.Vector2(),
    _zoomEnd = new THREE.Vector2(),
    _touchZoomDistanceStart = 0,
    _touchZoomDistanceEnd = 0,
    _panStart = new THREE.Vector2(),
    _panEnd = new THREE.Vector2();
  this.target0 = this.target.clone();
  this.position0 = this.object.position.clone();
  this.up0 = this.object.up.clone();
  var changeEvent = { type: "change" };
  this.handleResize = function () {
    this.screen.width = window.innerWidth;
    this.screen.height = window.innerHeight;
    this.screen.offsetLeft = 0;
    this.screen.offsetTop = 0;
    this.radius = (this.screen.width + this.screen.height) / 4;
  };
  this.handleEvent = function (event) {
    if (typeof this[event.type] == "function") {
      this[event.type](event);
    }
  };
  this.getMouseOnScreen = function (clientX, clientY) {
    return new THREE.Vector2(
      ((clientX - _this.screen.offsetLeft) / _this.radius) * 0.5,
      ((clientY - _this.screen.offsetTop) / _this.radius) * 0.5
    );
  };
  this.getMouseProjectionOnBall = function (clientX, clientY) {
    var mouseOnBall = new THREE.Vector3(
      (clientX - _this.screen.width * 0.5 - _this.screen.offsetLeft) /
        _this.radius,
      (_this.screen.height * 0.5 + _this.screen.offsetTop - clientY) /
        _this.radius,
      0.0
    );
    var length = mouseOnBall.length();
    if (length > 1.0) {
      mouseOnBall.normalize();
    } else {
      mouseOnBall.z = Math.sqrt(1.0 - length * length);
    }
    _eye.copy(_this.object.position).sub(_this.target);
    var projection = _this.object.up.clone().setLength(mouseOnBall.y);
    projection.add(
      _this.object.up.clone().cross(_eye).setLength(mouseOnBall.x)
    );
    projection.add(_eye.setLength(mouseOnBall.z));
    return projection;
  };
  this.forceRotate = function (start, end) {
    _rotateStart = start;
    _rotateEnd = end;
    this.rotateCamera();
  };
  this.rotateCamera = function () {
    var angle = Math.acos(
      _rotateStart.dot(_rotateEnd) / _rotateStart.length() / _rotateEnd.length()
    );
    if (angle) {
      var axis = new THREE.Vector3()
          .crossVectors(_rotateStart, _rotateEnd)
          .normalize(),
        quaternion = new THREE.Quaternion();
      angle *= _this.rotateSpeed;
      quaternion.setFromAxisAngle(axis, -angle);
      _eye.applyQuaternion(quaternion);
      _this.object.up.applyQuaternion(quaternion);
      _rotateEnd.applyQuaternion(quaternion);
      if (_this.staticMoving) {
        _rotateStart.copy(_rotateEnd);
      } else {
        quaternion.setFromAxisAngle(
          axis,
          angle * (_this.dynamicDampingFactor - 1.0)
        );
        _rotateStart.applyQuaternion(quaternion);
      }
    }
  };
  this.zoomCamera = function () {
    if (_state === STATE.TOUCH_ZOOM) {
      var factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
      _touchZoomDistanceStart = _touchZoomDistanceEnd;
      _eye.multiplyScalar(factor);
    } else {
      var factor = 1.0 + (_zoomEnd.y - _zoomStart.y) * _this.zoomSpeed;
      if (factor !== 1.0 && factor > 0.0) {
        _eye.multiplyScalar(factor);
        if (_this.staticMoving) {
          _zoomStart.copy(_zoomEnd);
        } else {
          _zoomStart.y +=
            (_zoomEnd.y - _zoomStart.y) * this.dynamicDampingFactor;
        }
      }
    }
  };
  this.panCamera = function () {
    var mouseChange = _panEnd.clone().sub(_panStart);
    if (mouseChange.lengthSq()) {
      mouseChange.multiplyScalar(_eye.length() * _this.panSpeed);
      var pan = _eye.clone().cross(_this.object.up).setLength(mouseChange.x);
      pan.add(_this.object.up.clone().setLength(mouseChange.y));
      _this.object.position.add(pan);
      _this.target.add(pan);
      if (_this.staticMoving) {
        _panStart = _panEnd;
      } else {
        _panStart.add(
          mouseChange
            .subVectors(_panEnd, _panStart)
            .multiplyScalar(_this.dynamicDampingFactor)
        );
      }
    }
  };
  this.checkDistances = function () {
    if (!_this.noZoom || !_this.noPan) {
      if (
        _this.object.position.lengthSq() >
        _this.maxDistance * _this.maxDistance
      ) {
        _this.object.position.setLength(_this.maxDistance);
      }
      if (_eye.lengthSq() < _this.minDistance * _this.minDistance) {
        _this.object.position.addVectors(
          _this.target,
          _eye.setLength(_this.minDistance)
        );
      }
    }
  };
  this.update = function () {
    _eye.subVectors(_this.object.position, _this.target);
    if (!_this.noRotate) {
      _this.rotateCamera();
    }
    if (!_this.noZoom) {
      _this.zoomCamera();
    }
    if (!_this.noPan) {
      _this.panCamera();
    }
    _this.object.position.addVectors(_this.target, _eye);
    _this.checkDistances();
    _this.object.lookAt(_this.target);
    if (lastPosition.distanceToSquared(_this.object.position) > 0) {
      _this.dispatchEvent(changeEvent);
      lastPosition.copy(_this.object.position);
    }
  };
  this.reset = function () {
    _state = STATE.NONE;
    _prevState = STATE.NONE;
    _this.target.copy(_this.target0);
    _this.object.position.copy(_this.position0);
    _this.object.up.copy(_this.up0);
    _eye.subVectors(_this.object.position, _this.target);
    _this.object.lookAt(_this.target);
    _this.dispatchEvent(changeEvent);
    lastPosition.copy(_this.object.position);
  };
  function keydown(event) {
    if (_this.enabled === false) return;
    window.removeEventListener("keydown", keydown);
    _prevState = _state;
    if (_state !== STATE.NONE) {
      return;
    } else if (event.keyCode === _this.keys[STATE.ROTATE] && !_this.noRotate) {
      _state = STATE.ROTATE;
    } else if (event.keyCode === _this.keys[STATE.ZOOM] && !_this.noZoom) {
      _state = STATE.ZOOM;
    } else if (event.keyCode === _this.keys[STATE.PAN] && !_this.noPan) {
      _state = STATE.PAN;
    }
  }
  function keyup(event) {
    if (_this.enabled === false) return;
    _state = _prevState;
    window.addEventListener("keydown", keydown, false);
  }
  function mousedown(event) {
    if (_this.enabled === false) return;
    event.preventDefault();
    event.stopPropagation();
    if (_state === STATE.NONE) {
      _state = event.button;
    }
    if (_state === STATE.ROTATE && !_this.noRotate) {
      _rotateStart = _rotateEnd = _this.getMouseProjectionOnBall(
        event.clientX,
        event.clientY
      );
    } else if (_state === STATE.ZOOM && !_this.noZoom) {
      _zoomStart = _zoomEnd = _this.getMouseOnScreen(
        event.clientX,
        event.clientY
      );
    } else if (_state === STATE.PAN && !_this.noPan) {
      _panStart = _panEnd = _this.getMouseOnScreen(
        event.clientX,
        event.clientY
      );
    }
    document.addEventListener("mousemove", mousemove, false);
    document.addEventListener("mouseup", mouseup, false);
  }
  function mousemove(event) {
    if (_this.enabled === false) return;
    event.preventDefault();
    event.stopPropagation();
    if (_state === STATE.ROTATE && !_this.noRotate) {
      _rotateEnd = _this.getMouseProjectionOnBall(event.clientX, event.clientY);
    } else if (_state === STATE.ZOOM && !_this.noZoom) {
      _zoomEnd = _this.getMouseOnScreen(event.clientX, event.clientY);
    } else if (_state === STATE.PAN && !_this.noPan) {
      _panEnd = _this.getMouseOnScreen(event.clientX, event.clientY);
    }
  }
  function mouseup(event) {
    if (_this.enabled === false) return;
    event.preventDefault();
    event.stopPropagation();
    _state = STATE.NONE;
    document.removeEventListener("mousemove", mousemove);
    document.removeEventListener("mouseup", mouseup);
  }
  function mousewheel(event) {
    if (_this.enabled === false) return;
    event.preventDefault();
    event.stopPropagation();
    var delta = 0;
    if (event.wheelDelta) {
      delta = event.wheelDelta / 40;
    } else if (event.detail) {
      delta = -event.detail / 3;
    }
    _zoomStart.y += delta * 0.01;
  }
  function touchstart(event) {
    if (_this.enabled === false) return;
    switch (event.touches.length) {
      case 1:
        _state = STATE.TOUCH_ROTATE;
        _rotateStart = _rotateEnd = _this.getMouseProjectionOnBall(
          event.touches[0].pageX,
          event.touches[0].pageY
        );
        break;
      case 2:
        _state = STATE.TOUCH_ZOOM;
        var dx = event.touches[0].pageX - event.touches[1].pageX;
        var dy = event.touches[0].pageY - event.touches[1].pageY;
        _touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt(
          dx * dx + dy * dy
        );
        break;
      case 3:
        _state = STATE.TOUCH_PAN;
        _panStart = _panEnd = _this.getMouseOnScreen(
          event.touches[0].pageX,
          event.touches[0].pageY
        );
        break;
      default:
        _state = STATE.NONE;
    }
  }
  function touchmove(event) {
    if (_this.enabled === false) return;
    event.preventDefault();
    event.stopPropagation();
    switch (event.touches.length) {
      case 1:
        _rotateEnd = _this.getMouseProjectionOnBall(
          event.touches[0].pageX,
          event.touches[0].pageY
        );
        break;
      case 2:
        var dx = event.touches[0].pageX - event.touches[1].pageX;
        var dy = event.touches[0].pageY - event.touches[1].pageY;
        _touchZoomDistanceEnd = Math.sqrt(dx * dx + dy * dy);
        break;
      case 3:
        _panEnd = _this.getMouseOnScreen(
          event.touches[0].pageX,
          event.touches[0].pageY
        );
        break;
      default:
        _state = STATE.NONE;
    }
  }
  function touchend(event) {
    if (_this.enabled === false) return;
    switch (event.touches.length) {
      case 1:
        _rotateStart = _rotateEnd = _this.getMouseProjectionOnBall(
          event.touches[0].pageX,
          event.touches[0].pageY
        );
        break;
      case 2:
        _touchZoomDistanceStart = _touchZoomDistanceEnd = 0;
        break;
      case 3:
        _panStart = _panEnd = _this.getMouseOnScreen(
          event.touches[0].pageX,
          event.touches[0].pageY
        );
        break;
    }
    _state = STATE.NONE;
  }
  this.domElement.addEventListener(
    "contextmenu",
    function (event) {
      event.preventDefault();
    },
    false
  );
  this.domElement.addEventListener("mousedown", mousedown, false);
  this.domElement.addEventListener("mousewheel", mousewheel, false);
  this.domElement.addEventListener("DOMMouseScroll", mousewheel, false);
  this.domElement.addEventListener("touchstart", touchstart, false);
  this.domElement.addEventListener("touchend", touchend, false);
  this.domElement.addEventListener("touchmove", touchmove, false);
  window.addEventListener("keydown", keydown, false);
  window.addEventListener("keyup", keyup, false);
  this.handleResize();
};
THREE.TrackballControls.prototype = Object.create(
  THREE.EventDispatcher.prototype
);
var THREEx = THREEx || {};
THREEx.WindowResize = function (renderer, camera, container) {
  container = container || window;
  var $c = $(container);
  var callback = function () {
    renderer.setSize($(window).width(), $c.height());
    camera.aspect = $c.width() / $c.height();
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", callback, false);
  return {
    stop: function () {
      window.removeEventListener("resize", callback);
    },
  };
};
THREEx.WindowResize.bind = function (renderer, camera) {
  return THREEx.WindowResize(renderer, camera);
};
(function () {
  "use strict";
  var pi = Math.PI,
    sin = Math.sin,
    cos = Math.cos;
  var PIXELS_PER_AU = 50;
  var Orbit3D = function (eph, opts) {
    opts = opts || {};
    opts.width = opts.width || 1;
    opts.object_size = opts.object_size || 1;
    opts.jed = opts.jed || 2451545.0;
    this.opts = opts;
    this.name = opts.name;
    this.eph = eph;
    this.particle_geometry = opts.particle_geometry;
    this.CreateParticle(opts.jed, opts.texture_path);
  };
  Orbit3D.prototype.getR = function (t) {
    var a = this.eph.a;
    var e = this.eph.e;
    var r = (a * (1 - e * e)) / (1 + e * cos(t));
    return r;
  };
  Orbit3D.prototype.getPosByAngle = function (t, i, o, w) {
    var r = this.getR(t) * PIXELS_PER_AU;
    var x = r * (cos(o) * cos(t + w) - sin(o) * sin(t + w) * cos(i));
    var y = r * (sin(o) * cos(t + w) + cos(o) * sin(t + w) * cos(i));
    var z = r * (sin(t + w) * sin(i));
    var point = [x, y, z];
    return point;
  };
  Orbit3D.prototype.getSmoothOrbit = function (pnum) {
    var points = [];
    var delta = pi / pnum;
    var alpha = 0;
    var inc = (this.eph.i * pi) / 180.0;
    var w = (this.eph.w * pi) / 180.0;
    var om = (this.eph.om * pi) / 180.0;
    var beta = ((this.eph.om + this.eph.w) * pi) / 180.0;
    var base = 0.0;
    for (var i = 0; i <= pnum; i++, alpha += delta) {
      var angle = Math.abs(base - pi * sin(alpha)) + base;
      if (i == Math.ceil(pnum / 2.0)) {
        base = pi;
      }
      var point = this.getPosByAngle(angle, inc, om, w);
      var vector = new THREE.Vector3(point[0], point[1], point[2]);
      points.push(vector);
    }
    return points;
  };
  Orbit3D.prototype.CreateOrbit = function (jed) {
    var points;
    var parts = 200;
    points = new THREE.Geometry();
    points.vertices = this.getSmoothOrbit(parts);
    points.computeLineDistances();
    var line = new THREE.Line(
      points,
      new THREE.LineDashedMaterial({
        color: this.opts.color,
        linewidth: this.opts.width,
        dashSize: 1,
        gapSize: 0.5,
      }),
      THREE.LineStrip
    );
    return line;
  };
  Orbit3D.prototype.CreateParticle = function (jed, texture_path) {
    if (!this.particle_geometry) return;
    var tmp_vec = new THREE.Vector3(0, 0, 0);
    this.particle_geometry.vertices.push(tmp_vec);
  };
  Orbit3D.prototype.MoveParticle = function (time_jed) {
    var pos = this.getPosAtTime(time_jed);
    this.MoveParticleToPosition(pos);
  };
  Orbit3D.prototype.MoveParticleToPosition = function (pos) {
    this.particle.position.set(pos[0], pos[1], pos[2]);
  };
  Orbit3D.prototype.getPosAtTime = function (jed) {
    var e = this.eph.e;
    var a = this.eph.a;
    var i = (this.eph.i * pi) / 180;
    var o = (this.eph.om * pi) / 180;
    var p = ((this.eph.w_bar || this.eph.w + this.eph.om) * pi) / 180;
    var ma = (this.eph.ma * pi) / 180;
    var n;
    if (this.eph.n) {
      n = (this.eph.n * pi) / 180;
    } else {
      n = (2 * pi) / this.eph.P;
    }
    var epoch = this.eph.epoch;
    var d = jed - epoch;
    var M = ma + n * d;
    var E0 = M;
    var lastdiff;
    do {
      var E1 = M + e * sin(E0);
      lastdiff = Math.abs(E1 - E0);
      E0 = E1;
    } while (lastdiff > 0.0000001);
    var E = E0;
    var v = 2 * Math.atan(Math.sqrt((1 + e) / (1 - e)) * Math.tan(E / 2));
    var r = ((a * (1 - e * e)) / (1 + e * cos(v))) * PIXELS_PER_AU;
    var X = r * (cos(o) * cos(v + p - o) - sin(o) * sin(v + p - o) * cos(i));
    var Y = r * (sin(o) * cos(v + p - o) + cos(o) * sin(v + p - o) * cos(i));
    var Z = r * (sin(v + p - o) * sin(i));
    var ret = [X, Y, Z];
    return ret;
  };
  Orbit3D.prototype.getEllipse = function () {
    if (!this.ellipse) this.ellipse = this.CreateOrbit(this.opts.jed);
    return this.ellipse;
  };
  Orbit3D.prototype.getParticle = function () {
    return this.particle;
  };
  window.Orbit3D = Orbit3D;
})();
window.Ephemeris = {
  asteroid_davidbowie: {
    full_name: "342843 Davidbowie",
    epoch: 2457200.5,
    a: 2.747666931600445,
    e: 0.08879027843646621,
    i: 2.768108067009298,
    w: 300.6986330539765,
    om: 62.36399100210148,
    ma: 220.1004135757952,
    P: 1663.583320494612,
    n: 0.2164003423002377,
  },
  mercury: {
    full_name: "Mercury",
    ma: 174.79252722,
    epoch: 2451545.0,
    a: 0.38709927,
    e: 0.20563593,
    i: 7.00497902,
    w_bar: 77.45779628,
    w: 29.12703035,
    L: 252.2503235,
    om: 48.33076593,
    P: 87.969,
  },
  venus: {
    full_name: "Venus",
    ma: 50.37663232,
    epoch: 2451545.0,
    a: 0.72333566,
    e: 0.00677672,
    i: 3.39467605,
    w_bar: 131.60246718,
    w: 54.92262463,
    L: 181.9790995,
    om: 76.67984255,
    P: 224.701,
  },
  earth: {
    full_name: "Earth",
    epoch: 2451545.0,
    ma: -2.47311027,
    a: 1.00000261,
    e: 0.01671123,
    i: 0,
    w_bar: 102.93768193,
    w: 114.20783,
    L: 100.46457166,
    om: 348.73936,
    P: 365.256,
  },
  mars: {
    full_name: "Mars",
    ma: 19.39019754,
    epoch: 2451545.0,
    a: 1.52371034,
    e: 0.0933941,
    i: 1.84969142,
    w_bar: -23.94362959,
    w: -73.5031685,
    L: -4.55343205,
    om: 49.55953891,
    P: 686.98,
  },
  jupiter: {
    full_name: "Jupiter",
    ma: 19.66796068,
    epoch: 2451545.0,
    a: 5.202887,
    e: 0.04838624,
    i: 1.30439695,
    w_bar: 14.72847983,
    w: -85.74542926,
    L: 34.39644051,
    om: 100.47390909,
    P: 4332.589,
  },
};
for (var x in Ephemeris) {
  if (Ephemeris.hasOwnProperty(x) && Ephemeris[x].w_bar && Ephemeris[x].L) {
  }
}
function toJED(d) {
  return Math.floor(d.getTime() / (1000 * 60 * 60 * 24) - 0.5) + 2440588;
}
function fromJED(jed) {
  return new Date(1000 * 60 * 60 * 24 * (0.5 - 2440588 + jed));
}
function getColorFromPercent(value, highColor, lowColor) {
  var r = highColor >> 16;
  var g = (highColor >> 8) & 0xff;
  var b = highColor & 0xff;
  r += ((lowColor >> 16) - r) * value;
  g += (((lowColor >> 8) & 0xff) - g) * value;
  b += ((lowColor & 0xff) - b) * value;
  return (r << 16) | (g << 8) | b;
}
function displayColorForObject(roid) {
  return new THREE.Color(0xffffff);
}
function getParameterByName(name) {
  name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regexS = "[\\?&]" + name + "=([^&#]*)";
  var regex = new RegExp(regexS);
  var results = regex.exec(window.location.search);
  if (results == null) return "";
  else return decodeURIComponent(results[1].replace(/\+/g, " "));
}
function Asterank3D(opts) {
  "use strict";
  var me = this;
  opts.static_prefix = opts.static_prefix || "/asterank/static";
  opts.default_camera_position = opts.camera_position || [0, 155, 32];
  opts.camera_fly_around =
    typeof opts.camera_fly_around === "undefined"
      ? true
      : opts.camera_fly_around;
  opts.jed_delta = opts.jed_delta || 0.25;
  opts.custom_object_fn = opts.custom_object_fn || null;
  opts.object_texture_path =
    opts.object_texture_path || opts.static_prefix + "/img/cloud4.png";
  opts.not_supported_callback = opts.not_supported_callback || function () {};
  opts.sun_scale = opts.sun_scale || 50;
  opts.show_dat_gui = opts.show_dat_gui || false;
  opts.top_object_color = opts.top_object_color
    ? new THREE.Color(opts.top_object_color)
    : new THREE.Color(0xdbdb70);
  opts.milky_way_visible = opts.milky_way_visible || true;
  window.requestAnimFrame = (function () {
    return (
      window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.oRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      function (callback) {
        window.setTimeout(callback, 1000 / 60);
      }
    );
  })();
  var WEB_GL_ENABLED = true,
    MAX_NUM_ORBITS = 4000,
    PIXELS_PER_AU = 50,
    NUM_BIG_PARTICLES = 25;
  var stats,
    scene,
    renderer,
    composer,
    camera,
    cameraControls,
    pi = Math.PI,
    using_webgl = false,
    object_movement_on = true,
    lastHovered,
    added_objects = [],
    planets = [],
    planet_orbits_visible = true,
    jed = toJED(new Date()),
    particle_system_geometry = null,
    asteroids_loaded = false,
    display_date_last_updated = 0,
    first_loaded = false,
    skyBox = null;
  var feature_map = {},
    locked_object = null,
    locked_object_ellipse = null,
    locked_object_idx = -1,
    locked_object_size = -1,
    locked_object_color = -1;
  var featured_davidbowie = getParameterByName("object") === "davidbowie";
  var attributes, uniforms, particleSystem;
  init();
  if (opts.show_dat_gui) {
    initGUI();
  }
  $("#btn-toggle-movement").on("click", function () {
    object_movement_on = !object_movement_on;
  });
  $("#controls .js-sort").on("click", function () {
    runAsteroidQuery($(this).data("sort"));
    $("#controls .js-sort").css("font-weight", "normal");
    $(this).css("font-weight", "bold");
  });
  if (featured_davidbowie) {
    if (typeof mixpanel !== "undefined") mixpanel.track("davidbowie special");
    setTimeout(function () {
      $("#hide_sidebar").trigger("click");
    }, 0);
  }
  function initGUI() {
    var ViewUI = function () {
      this["Cost effective"] = function () {
        me.clearRankings();
        runAsteroidQuery("score");
      };
      this["Most valuable"] = function () {
        me.clearRankings();
        runAsteroidQuery("value");
      };
      this["Most accessible"] = function () {
        me.clearRankings();
        runAsteroidQuery("accessibility");
      };
      this["Smallest"] = function () {
        me.clearRankings();
        runAsteroidQuery("smallest");
      };
      this["Closest orbit"] = function () {
        me.clearRankings();
        runAsteroidQuery("moid");
      };
      this["Speed"] = opts.jed_delta;
      this["Planet orbits"] = planet_orbits_visible;
      this["Milky Way"] = opts.milky_way_visible;
      this["Display date"] = "12/26/2012";
    };
    window.onload = function () {
      var text = new ViewUI();
      var gui = new dat.GUI();
      gui.add(text, "Cost effective");
      gui.add(text, "Most valuable");
      gui.add(text, "Most accessible");
      gui.add(text, "Smallest");
      gui.add(text, "Closest orbit");
      gui.add(text, "Speed", 0, 1).onChange(function (val) {
        opts.jed_delta = val;
        var was_moving = object_movement_on;
        object_movement_on = opts.jed_delta > 0;
      });
      gui.add(text, "Planet orbits").onChange(function () {
        togglePlanetOrbits();
      });
      gui.add(text, "Milky Way").onChange(function () {
        toggleMilkyWay();
      });
      gui
        .add(text, "Display date")
        .onChange(function (val) {
          var newdate = new Date(Date.parse(val));
          if (newdate) {
            var newjed = toJED(newdate);
            changeJED(newjed);
            if (!object_movement_on) {
              render(true);
            }
          }
        })
        .listen();
      if (window.self !== window.top) {
        gui.close();
      }
      window.datgui = text;
    };
  }
  function togglePlanetOrbits() {
    if (planet_orbits_visible) {
      for (var i = 0; i < planets.length; i++) {
        scene.remove(planets[i].getEllipse());
      }
    } else {
      for (var i = 0; i < planets.length; i++) {
        scene.add(planets[i].getEllipse());
      }
    }
    planet_orbits_visible = !planet_orbits_visible;
  }
  function toggleMilkyWay() {
    skyBox.visible = opts.milky_way_visible = !opts.milky_way_visible;
  }
  function isWebGLSupported() {
    return WEB_GL_ENABLED && Detector.webgl;
  }
  function init() {
    $("#loading-text").html("renderer");
    if (isWebGLSupported()) {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setClearColor(0x000000, 1);
      using_webgl = true;
      window.gl = renderer.getContext();
    } else {
      opts.not_supported_callback();
      return;
    }
    var $container = $(opts.container);
    var containerHeight = $container.height();
    var containerWidth = $container.width();
    renderer.setSize(containerWidth, containerHeight);
    opts.container.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    var cameraH = 3;
    var cameraW = (cameraH / containerHeight) * containerWidth;
    window.cam = camera = new THREE.PerspectiveCamera(
      75,
      containerWidth / containerHeight,
      1,
      5000
    );
    setDefaultCameraPosition();
    THREEx.WindowResize(renderer, camera, opts.container);
    if (THREEx.FullScreen && THREEx.FullScreen.available()) {
      THREEx.FullScreen.bindKey();
    }
    camera.lookAt(new THREE.Vector3(0, 0, 0));
    scene.add(camera);
    cameraControls = new THREE.TrackballControls(camera, opts.container);
    cameraControls.staticMoving = true;
    cameraControls.panSpeed = 2;
    cameraControls.zoomSpeed = 3;
    cameraControls.rotateSpeed = 3;
    cameraControls.maxDistance = 1100;
    cameraControls.dynamicDampingFactor = 0.5;
    window.cc = cameraControls;
    cameraControls.forceRotate(
      new THREE.Vector3(
        0.09133858267716535,
        0.4658716047427351,
        0.1826620371691377
      ),
      new THREE.Vector3(
        -0.12932885444884135,
        0.35337196181704117,
        0.023557202790282953
      )
    );
    cameraControls.forceRotate(
      new THREE.Vector3(
        0.5557858773636077,
        0.7288978222072244,
        0.17927802044881952
      ),
      new THREE.Vector3(
        -0.0656536826099882,
        0.5746939531732201,
        0.7470641189675084
      )
    );
    $("#loading-text").html("sun");
    var texture = loadTexture(opts.static_prefix + "/img/sunsprite.png");
    var sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        blending: THREE.AdditiveBlending,
        useScreenCoordinates: false,
        color: 0xffffff,
      })
    );
    sprite.scale.x = opts.sun_scale;
    sprite.scale.y = opts.sun_scale;
    sprite.scale.z = 1;
    scene.add(sprite);
    if (opts.run_asteroid_query) {
      runAsteroidQuery();
    }
    $("#loading-text").html("planets");
    var mercury = new Orbit3D(Ephemeris.mercury, {
      color: 0x913cee,
      width: 1,
      jed: jed,
      object_size: 1.7,
      texture_path: opts.static_prefix + "/img/texture-mercury.jpg",
      display_color: new THREE.Color(0x913cee),
      particle_geometry: particle_system_geometry,
      name: "Mercury",
    });
    scene.add(mercury.getEllipse());
    var venus = new Orbit3D(Ephemeris.venus, {
      color: 0xff7733,
      width: 1,
      jed: jed,
      object_size: 1.7,
      texture_path: opts.static_prefix + "/img/texture-venus.jpg",
      display_color: new THREE.Color(0xff7733),
      particle_geometry: particle_system_geometry,
      name: "Venus",
    });
    scene.add(venus.getEllipse());
    var earth = new Orbit3D(Ephemeris.earth, {
      color: 0x009acd,
      width: 1,
      jed: jed,
      object_size: 1.7,
      texture_path: opts.static_prefix + "/img/texture-earth.jpg",
      display_color: new THREE.Color(0x009acd),
      particle_geometry: particle_system_geometry,
      name: "Earth",
    });
    scene.add(earth.getEllipse());
    feature_map["earth"] = { orbit: earth, idx: 2 };
    var mars = new Orbit3D(Ephemeris.mars, {
      color: 0xa63a3a,
      width: 1,
      jed: jed,
      object_size: 1.7,
      texture_path: opts.static_prefix + "/img/texture-mars.jpg",
      display_color: new THREE.Color(0xa63a3a),
      particle_geometry: particle_system_geometry,
      name: "Mars",
    });
    scene.add(mars.getEllipse());
    var jupiter = new Orbit3D(Ephemeris.jupiter, {
      color: 0xff7f50,
      width: 1,
      jed: jed,
      object_size: 1.7,
      texture_path: opts.static_prefix + "/img/texture-jupiter.jpg",
      display_color: new THREE.Color(0xff7f50),
      particle_geometry: particle_system_geometry,
      name: "Jupiter",
    });
    scene.add(jupiter.getEllipse());
    planets = [mercury, venus, earth, mars, jupiter];
    if (featured_davidbowie) {
      var asteroid_davidbowie = new Orbit3D(Ephemeris.asteroid_davidbowie, {
        color: 0xffffff,
        width: 1,
        jed: jed,
        object_size: 1.7,
        texture_path: opts.static_prefix + "/img/cloud4.png",
        display_color: new THREE.Color(0xffffff),
        particle_geometry: particle_system_geometry,
        name: "342843 Davidbowie",
      });
      scene.add(asteroid_davidbowie.getEllipse());
      feature_map["342843 Davidbowie"] = { orbit: asteroid_davidbowie, idx: 5 };
      planets.push(asteroid_davidbowie);
    }
    var geometry = new THREE.SphereGeometry(3000, 60, 40);
    var uniforms = {
      texture: {
        type: "t",
        value: loadTexture(opts.static_prefix + "/img/eso_dark.jpg"),
      },
    };
    var material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: document.getElementById("sky-vertex").textContent,
      fragmentShader: document.getElementById("sky-density").textContent,
    });
    skyBox = new THREE.Mesh(geometry, material);
    skyBox.scale.set(-1, 1, 1);
    skyBox.eulerOrder = "XZY";
    skyBox.rotation.z = pi / 2;
    skyBox.rotation.x = pi;
    skyBox.renderDepth = 1000.0;
    scene.add(skyBox);
    window.skyBox = skyBox;
    $container.on("mousedown mousewheel", function () {
      opts.camera_fly_around = false;
    });
    window.renderer = renderer;
  }
  function setNeutralCameraPosition() {
    var timer = 0.0001 * Date.now();
    cam.position.x = Math.sin(timer) * 25;
    cam.position.z = 100 + Math.cos(timer) * 20;
  }
  function setDefaultCameraPosition() {
    cam.position.set(
      opts.default_camera_position[0],
      opts.default_camera_position[1],
      opts.default_camera_position[2]
    );
  }
  function setHighlight(full_name) {
    var mapped_obj = feature_map[full_name];
    if (!mapped_obj) {
      alert("Sorry, something went wrong and I can't highlight this object.");
      return;
    }
    var orbit_obj = mapped_obj.orbit;
    if (!orbit_obj) {
      alert("Sorry, something went wrong and I can't highlight this object.");
      return;
    }
    var idx = mapped_obj.idx;
    attributes.value_color.value[idx] = new THREE.Color(0x0000ff);
    attributes.size.value[idx] = 30.0;
    attributes.locked.value[idx] = 1.0;
    setAttributeNeedsUpdateFlags();
  }
  function clearLock(set_default_camera) {
    if (!locked_object) return;
    if (set_default_camera) {
      setDefaultCameraPosition();
    }
    cameraControls.target = new THREE.Vector3(0, 0, 0);
    attributes.value_color.value[locked_object_idx] = locked_object_color;
    attributes.size.value[locked_object_idx] = locked_object_size;
    attributes.locked.value[locked_object_idx] = 0.0;
    setAttributeNeedsUpdateFlags();
    if (locked_object_idx >= planets.length) {
      scene.remove(locked_object_ellipse);
    }
    locked_object = null;
    locked_object_ellipse = null;
    locked_object_idx = -1;
    locked_object_size = -1;
    locked_object_color = null;
    setNeutralCameraPosition();
  }
  function setLock(full_name) {
    if (locked_object) {
      clearLock();
    }
    var mapped_obj = feature_map[full_name];
    if (!mapped_obj) {
      alert("Sorry, something went wrong and I can't lock on this object.");
      return;
    }
    var orbit_obj = mapped_obj["orbit"];
    if (!orbit_obj) {
      alert("Sorry, something went wrong and I can't lock on this object.");
      return;
    }
    locked_object = orbit_obj;
    locked_object_idx = mapped_obj["idx"];
    locked_object_color = attributes.value_color.value[locked_object_idx];
    attributes.value_color.value[locked_object_idx] =
      full_name === "earth"
        ? new THREE.Color(0x00ff00)
        : new THREE.Color(0xff0000);
    locked_object_size = attributes.size.value[locked_object_idx];
    attributes.size.value[locked_object_idx] = 30.0;
    attributes.locked.value[locked_object_idx] = 1.0;
    setAttributeNeedsUpdateFlags();
    locked_object_ellipse = locked_object.getEllipse();
    scene.add(locked_object_ellipse);
    opts.camera_fly_around = true;
  }
  function handleSimulationResults(e, particles) {
    var data = e.data;
    switch (data.type) {
      case "result":
        var positions = data.value.positions;
        for (var i = 0; i < positions.length; i++) {
          particles[i].MoveParticleToPosition(positions[i]);
        }
        if (typeof datgui !== "undefined") {
          var now = new Date().getTime();
          if (now - display_date_last_updated > 500) {
            var georgian_date = fromJED(data.value.jed);
            datgui["display date"] =
              georgian_date.getMonth() +
              1 +
              "/" +
              georgian_date.getDate() +
              "/" +
              georgian_date.getFullYear();
            display_date_last_updated = now;
          }
        }
        break;
      case "debug":
        console.log(data.value);
        break;
      default:
        console.log("Invalid data type", data.type);
    }
  }
  function runAsteroidQuery(sort) {
    sort = sort || "score";
    $("#loading").show();
    $("#loading-text").html("asteroids database");
    if (
      typeof passthrough_vars !== "undefined" &&
      passthrough_vars.offline_mode
    ) {
      setTimeout(function () {
        var data = window.passthrough_vars.rankings[sort];
        me.processAsteroidRankings(data);
      }, 0);
    } else {
      $.getJSON(
        "/asterank/api/rankings?sort_by=" +
          sort +
          "&limit=" +
          MAX_NUM_ORBITS +
          "&orbits_only=true",
        function (data) {
          me.processAsteroidRankings(data);
        }
      ).error(function () {
        alert(
          "Sorry, we've encountered an error and we can't load the simulation"
        );
        mixpanel.track("3d error", { type: "json" });
      });
    }
  }
  function createParticleSystem() {
    attributes = {
      a: { type: "f", value: [] },
      e: { type: "f", value: [] },
      i: { type: "f", value: [] },
      o: { type: "f", value: [] },
      ma: { type: "f", value: [] },
      n: { type: "f", value: [] },
      w: { type: "f", value: [] },
      P: { type: "f", value: [] },
      epoch: { type: "f", value: [] },
      size: { type: "f", value: [] },
      value_color: { type: "c", value: [] },
      locked: { type: "f", value: [] },
      is_planet: { type: "f", value: [] },
    };
    uniforms = {
      color: { type: "c", value: new THREE.Color(0xffffff) },
      jed: { type: "f", value: jed },
      earth_i: { type: "f", value: Ephemeris.earth.i },
      earth_om: { type: "f", value: Ephemeris.earth.om },
      planet_texture: {
        type: "t",
        value: loadTexture(opts.static_prefix + "/img/cloud4.png"),
      },
      small_roid_texture: {
        type: "t",
        value: loadTexture(opts.object_texture_path),
      },
      small_roid_circled_texture: {
        type: "t",
        value: loadTexture(opts.static_prefix + "/img/cloud4-circled.png"),
      },
    };
    var vertexshader = document
      .getElementById("vertexshader")
      .textContent.replace("{{PIXELS_PER_AU}}", PIXELS_PER_AU.toFixed(1));
    var particle_system_shader_material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      attributes: attributes,
      vertexShader: vertexshader,
      fragmentShader: document.getElementById("fragmentshader").textContent,
    });
    particle_system_shader_material.depthTest = false;
    particle_system_shader_material.vertexColor = true;
    particle_system_shader_material.transparent = true;
    particle_system_shader_material.blending = THREE.AdditiveBlending;
    for (var i = 0; i < added_objects.length; i++) {
      var is_featured_object = added_objects[i].name === "342843 Davidbowie";
      if (is_featured_object) {
        attributes.size.value[i] = 40;
        attributes.is_planet.value[i] = 1.0;
      } else if (i < planets.length) {
        attributes.size.value[i] = 75;
        attributes.is_planet.value[i] = 1.0;
      } else {
        attributes.size.value[i] = added_objects[i].opts.object_size;
        attributes.is_planet.value[i] = 0.0;
      }
      attributes.a.value[i] = added_objects[i].eph.a;
      attributes.e.value[i] = added_objects[i].eph.e;
      attributes.i.value[i] = added_objects[i].eph.i;
      attributes.o.value[i] = added_objects[i].eph.om;
      attributes.ma.value[i] = added_objects[i].eph.ma;
      attributes.n.value[i] = added_objects[i].eph.n || -1.0;
      attributes.w.value[i] =
        added_objects[i].eph.w_bar ||
        added_objects[i].eph.w + added_objects[i].eph.om;
      attributes.P.value[i] = added_objects[i].eph.P || -1.0;
      attributes.epoch.value[i] = added_objects[i].eph.epoch;
      attributes.value_color.value[i] = added_objects[i].opts.display_color;
      attributes.locked.value[i] = is_featured_object ? 1.0 : 0.0;
    }
    setAttributeNeedsUpdateFlags();
    particleSystem = new THREE.ParticleSystem(
      particle_system_geometry,
      particle_system_shader_material
    );
    window.ps = particleSystem;
    scene.add(particleSystem);
  }
  function setAttributeNeedsUpdateFlags() {
    attributes.value_color.needsUpdate = true;
    attributes.locked.needsUpdate = true;
    attributes.size.needsUpdate = true;
  }
  function starTexture(color, size) {
    size = size ? parseInt(size * 24, 10) : 24;
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var col = new THREE.Color(color);
    var context = canvas.getContext("2d");
    var gradient = context.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      0,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width / 2
    );
    var rgbaString =
      "rgba(" +
      ~~(col.r * 255) +
      "," +
      ~~(col.g * 255) +
      "," +
      ~~(col.b * 255) +
      "," +
      1 +
      ")";
    gradient.addColorStop(0, rgbaString);
    gradient.addColorStop(0.1, rgbaString);
    gradient.addColorStop(0.6, "rgba(125, 20, 0, 0.2)");
    gradient.addColorStop(-1.92, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }
  function changeJED(new_jed) {
    jed = new_jed;
  }
  function animate() {
    if (!asteroids_loaded) {
      render();
      requestAnimFrame(animate);
      return;
    }
    if (opts.camera_fly_around) {
      if (locked_object) {
        var pos = locked_object.getPosAtTime(jed);
        if (featured_davidbowie && locked_object.name === "342843 Davidbowie") {
          cam.position.set(pos[0] - 125, pos[1] + 125, pos[2] + 125);
        } else {
          cam.position.set(pos[0] + 25, pos[1] - 25, pos[2] - 70);
        }
        cameraControls.target = new THREE.Vector3(pos[0], pos[1], pos[2]);
      } else {
        setNeutralCameraPosition();
      }
    }
    render();
    requestAnimFrame(animate);
  }
  function render(force) {
    cameraControls.update();
    var now = new Date().getTime();
    if (
      now - display_date_last_updated > 500 &&
      typeof datgui !== "undefined"
    ) {
      var georgian_date = fromJED(jed);
      datgui["Display date"] =
        georgian_date.getMonth() +
        1 +
        "/" +
        georgian_date.getDate() +
        "/" +
        georgian_date.getFullYear();
      display_date_last_updated = now;
    }
    if (object_movement_on || force) {
      uniforms.jed.value = jed;
      jed += opts.jed_delta;
    }
    renderer.render(scene, camera);
  }
  var fuzzes = [
    { word: "T", num: 1000000000000 },
    { word: "B", num: 1000000000 },
    { word: "M", num: 1000000 },
  ];
  function fuzzy_price(n) {
    for (var i = 0; i < fuzzes.length; i++) {
      var x = fuzzes[i];
      if (n / x.num >= 1) {
        var prefix = n / x.num;
        if (i === -1 && prefix > 100) return ">100 " + x.word;
        return prefix.toFixed(2) + " " + x.word;
      }
    }
    return n;
  }
  function loadTexture(path) {
    if (
      typeof passthrough_vars !== "undefined" &&
      passthrough_vars.offline_mode
    ) {
      var b64_data = $('img[data-src="' + path + '"]').attr("src");
      var new_image = document.createElement("img");
      var texture = new THREE.Texture(new_image);
      new_image.onload = function () {
        texture.needsUpdate = true;
      };
      new_image.src = b64_data;
      return texture;
    }
    return THREE.ImageUtils.loadTexture(path);
  }
  me.clearRankings = function () {
    for (var i = 0; i < added_objects.length; i++) {
      scene.remove(added_objects[i].getParticle());
    }
    clearLock(true);
    if (particleSystem) {
      scene.remove(particleSystem);
      particleSystem = null;
    }
    if (lastHovered) {
      scene.remove(lastHovered);
    }
  };
  me.clearLock = function () {
    return clearLock(true);
  };
  me.setLock = function (full_name) {
    return setLock(full_name);
  };
  me.isWebGLSupported = function () {
    return isWebGLSupported();
  };
  me.processAsteroidRankings = function (data) {
    if (!data) {
      alert(
        "Sorry, something went wrong and the server failed to return data."
      );
      return;
    }
    var n = data.length;
    added_objects = planets.slice();
    particle_system_geometry = new THREE.Geometry();
    for (var i = 0; i < planets.length; i++) {
      particle_system_geometry.vertices.push(new THREE.Vector3(0, 0, 0));
    }
    var useBigParticles = !using_webgl;
    var featured_count = 0;
    var featured_html = "";
    for (var i = 0; i < n; i++) {
      if (i === NUM_BIG_PARTICLES) {
        if (!using_webgl) {
          break;
        }
        useBigParticles = false;
      }
      var roid = data[i];
      var locked = false;
      var orbit;
      if (opts.custom_object_fn) {
        var orbit_params = opts.custom_object_fn(roid);
        orbit_params.particle_geometry = particle_system_geometry;
        orbit_params.jed = jed;
        orbit = new Orbit3D(roid, orbit_params, useBigParticles);
      } else {
        var display_color =
          i < NUM_BIG_PARTICLES
            ? opts.top_object_color
            : displayColorForObject(roid);
        orbit = new Orbit3D(
          roid,
          {
            color: 0xcccccc,
            display_color: display_color,
            width: 2,
            object_size: i < NUM_BIG_PARTICLES ? 50 : 15,
            jed: jed,
            particle_geometry: particle_system_geometry,
          },
          useBigParticles
        );
      }
      feature_map[roid.full_name] = { orbit: orbit, idx: added_objects.length };
      if (featured_count++ < NUM_BIG_PARTICLES) {
        featured_html +=
          '<tr data-full-name="' +
          roid.full_name +
          '"><td><a href="#">' +
          (roid.prov_des || roid.full_name) +
          "</a></td><td>" +
          (roid.price < 1 ? "N/A" : "$" + fuzzy_price(roid.price)) +
          "</td></tr>";
      }
      added_objects.push(orbit);
    }
    if (featured_davidbowie) {
      $("#objects-of-interest tr:gt(2)").remove();
      setTimeout(function () {
        setLock("342843 Davidbowie");
        $("#sun-selector").css("background-color", "black");
        $("#earth-selector").css("background-color", "green");
      }, 0);
    } else {
      $("#objects-of-interest tr:gt(1)").remove();
    }
    $("#objects-of-interest")
      .append(featured_html)
      .on("click", "tr", function () {
        $("#objects-of-interest tr").css("background-color", "#000");
        var $e = $(this);
        var full_name = $e.data("full-name");
        $("#sun-selector").css("background-color", "green");
        switch (full_name) {
          case "sun":
            clearLock(true);
            return false;
        }
        clearLock();
        $e.css("background-color", "green");
        $("#sun-selector").css("background-color", "#000");
        setLock(full_name);
        return false;
      });
    $("#objects-of-interest-container").show();
    jed = toJED(new Date());
    if (!asteroids_loaded) {
      asteroids_loaded = true;
    }
    createParticleSystem();
    if (!first_loaded) {
      animate();
      first_loaded = true;
    }
    $("#loading").hide();
    if (typeof mixpanel !== "undefined") mixpanel.track("simulation started");
  };
  me.pause = function () {
    object_movement_on = false;
  };
  me.play = function () {
    object_movement_on = true;
  };
}
